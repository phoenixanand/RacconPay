// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockERC4626Vault} from "./MockERC4626Vault.sol";

/// @dev Bounded action surface for the invariant fuzzer. No vault loss and no deposit fee are ever
///      introduced, so the contract must always be able to cover every obligation.
contract YieldStreamHandler is Test {
    VestingStreamV2Yield public ys;
    MockERC20 public usdc;
    MockERC4626Vault public vault;

    address public grantor;
    address public alice;
    address public bob;

    uint256[] public ids;
    uint256 public minted;
    uint256 public donated;
    bool public grantorPaidEarly;
    /// @dev Number of ERC-4626 deposit/redeem operations the contract performed on yield streams.
    uint256 public vaultOps;
    /// @dev Rounding allowance in wei: each vault operation can lose up to one vault share's worth of
    ///      assets (ceil(totalAssets/totalShares) at that moment, which is exactly 1 wei at a 1:1 price).
    uint256 public roundingBudget;

    constructor(VestingStreamV2Yield _ys, MockERC20 _usdc, MockERC4626Vault _vault, address g, address a, address b) {
        ys = _ys;
        usdc = _usdc;
        vault = _vault;
        grantor = g;
        alice = a;
        bob = b;
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    function _id(uint256 i) internal view returns (uint256) {
        return ids[i % ids.length];
    }

    function _shares() internal view returns (uint256) {
        return vault.balanceOf(address(ys));
    }

    /// @dev Wei value of one vault share, rounded up (1 at a 1:1 price). Bounds the loss of a single
    ///      deposit/redeem rounding step.
    function _unit() internal view returns (uint256) {
        uint256 ts = vault.totalShares();
        uint256 ta = vault.totalAssets();
        if (ts == 0 || ta == 0) return 1;
        return (ta + ts - 1) / ts;
    }

    function _countOp(uint256 unit) internal {
        vaultOps += 1;
        roundingBudget += unit;
    }

    /// @dev A redeem happened iff the contract's vault share balance dropped.
    function _countRedeem(uint256 sharesBefore, uint256 unitBefore) internal {
        if (_shares() < sharesBefore) _countOp(unitBefore);
    }

    function create(uint256 amount, uint256 duration, bool useYield, bool toBob) external {
        if (ids.length >= 8) return;
        amount = bound(amount, 1e6, 1e10);
        duration = bound(duration, 1, 30 days);
        usdc.mint(grantor, amount);
        minted += amount;
        vm.startPrank(grantor);
        usdc.approve(address(ys), amount);
        uint256 unit = _unit();
        uint256 sid = ys.createStream(toBob ? bob : alice, amount, duration, useYield);
        vm.stopPrank();
        ids.push(sid);
        if (useYield) _countOp(unit); // one vault.deposit
    }

    function claim(uint256 i) external {
        if (ids.length == 0) return;
        uint256 sid = _id(i);
        address ben = ys.getStream(sid).beneficiary;
        uint256 sb = _shares();
        uint256 un = _unit();
        vm.prank(ben);
        try ys.claim(sid) {} catch {}
        _countRedeem(sb, un);
    }

    function cancel(uint256 i) external {
        if (ids.length == 0) return;
        uint256 sid = _id(i);
        uint256 sb = _shares();
        uint256 un = _unit();
        vm.prank(grantor);
        try ys.cancel(sid) {} catch {}
        _countRedeem(sb, un);
    }

    function unwind(uint256 i) external {
        if (ids.length == 0) return;
        uint256 sid = _id(i);
        uint256 before = ys.pendingWithdrawals(grantor);
        uint256 sb = _shares();
        uint256 un = _unit();
        try ys.unwind(sid) {} catch {}
        _countRedeem(sb, un);
        // The grantor may only be credited by an unwind once debt is cleared and every share is redeemed.
        if (ys.pendingWithdrawals(grantor) > before) {
            (,, uint256 shares,,, uint256 debt) = ys.getYieldInfo(sid);
            if (shares != 0 || debt != 0) grantorPaidEarly = true;
        }
    }

    function withdrawYield(uint256 i) external {
        if (ids.length == 0) return;
        uint256 sid = _id(i);
        uint256 sb = _shares();
        uint256 un = _unit();
        vm.prank(grantor);
        try ys.withdrawYield(sid) {} catch {}
        _countRedeem(sb, un);
    }

    function stopYield(uint256 i, bool byGrantor) external {
        if (ids.length == 0) return;
        uint256 sid = _id(i);
        address caller = byGrantor ? grantor : ys.getStream(sid).beneficiary;
        uint256 sb = _shares();
        uint256 un = _unit();
        vm.prank(caller);
        try ys.stopYield(sid) {} catch {}
        _countRedeem(sb, un);
    }

    function withdraw(uint256 who) external {
        address w = who % 3 == 0 ? grantor : (who % 3 == 1 ? alice : bob);
        vm.prank(w);
        try ys.withdraw() {} catch {}
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 0, 1e9);
        vault.donate(amount);
        donated += amount;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 10 days));
    }

    function setIlliquid(bool v) external {
        vault.setIlliquid(v);
    }

    /// @dev Partial liquidity: the vault only holds `liquidity` USDC, the rest is invested.
    function setCap(uint256 liquidity) external {
        vault.setLiquidity(bound(liquidity, 0, 1e10));
    }

    function setZeroMax(bool v) external {
        vault.setMaxFunctionsReturnZero(v);
    }

    function uncap() external {
        vault.setLiquidity(type(uint256).max);
        vault.setIlliquid(false);
    }
}

contract VestingStreamV2YieldInvariantTest is Test {
    VestingStreamV2Yield internal ys;
    MockERC20 internal usdc;
    MockERC4626Vault internal vault;
    YieldStreamHandler internal handler;

    address internal grantor = makeAddr("grantor");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new MockERC4626Vault(usdc);
        ys = new VestingStreamV2Yield(address(usdc), address(vault));
        handler = new YieldStreamHandler(ys, usdc, vault, grantor, alice, bob);
        targetContract(address(handler));
    }

    /// @dev Contract USDC + value of all its vault shares >= every outstanding obligation, up to ERC-4626
    ///      rounding. No vault loss or fee is ever introduced, so the only permitted shortfall is rounding:
    ///      vault.deposit mints floor(assets/price) shares, so previewRedeem(shares) can be below the deployed
    ///      amount (the contract's DepositValueTooLow check deliberately tolerates 0.1%), and each
    ///      vault.redeem rounds the payout down. Each step loses less than one share's worth of assets:
    ///      1 wei at a 1:1 share price, ceil(price) wei once donations have raised the price. So the
    ///      shortfall is bounded by handler.roundingBudget(), i.e. 1 wei per vault op (handler.vaultOps())
    ///      at a 1:1 price.
    function invariant_AssetsCoverObligations() public view {
        uint256 obligations = ys.pendingWithdrawals(grantor) + ys.pendingWithdrawals(alice) + ys.pendingWithdrawals(bob);
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 sid = handler.ids(i);
            VestingStreamV2Yield.Stream memory s = ys.getStream(sid);
            (,,,,, uint256 debt) = ys.getYieldInfo(sid);
            obligations += s.cancelled ? debt : s.totalAmount - s.claimedAmount;
        }
        uint256 held = usdc.balanceOf(address(ys)) + vault.previewRedeem(vault.balanceOf(address(ys)));
        assertGe(held + handler.roundingBudget(), obligations, "under-collateralised beyond ERC-4626 rounding");
    }

    /// @dev Total USDC is conserved: nothing is created or destroyed by the contract.
    function invariant_Conservation() public view {
        uint256 total = usdc.balanceOf(grantor) + usdc.balanceOf(alice) + usdc.balanceOf(bob)
            + usdc.balanceOf(address(ys)) + vault.totalAssets();
        assertEq(total, handler.minted() + handler.donated());
    }

    /// @dev Nobody is paid more than vested principal; the beneficiary side never exceeds the deposit.
    function invariant_ClaimedNeverExceedsVestedOrTotal() public view {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            VestingStreamV2Yield.Stream memory s = ys.getStream(handler.ids(i));
            assertLe(s.claimedAmount, s.totalAmount);
            if (s.cancelled) assertLe(s.claimedAmount, s.finalVested);
            else assertLe(s.claimedAmount, ys.vestedAmount(handler.ids(i)));
        }
    }

    function invariant_GrantorNeverPaidByUnwindBeforeBeneficiary() public view {
        assertFalse(handler.grantorPaidEarly());
    }
}

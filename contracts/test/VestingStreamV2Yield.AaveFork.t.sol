// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";

/// @notice READ-ONLY fork test of VestingStreamV2Yield against the real Aave V4 Core USDC
///         Tokenization Spoke on Arc Mainnet. Everything runs on a local copy of chain state:
///         nothing is broadcast and no mainnet funds move.
/// @dev Skipped unless RUN_AAVE_FORK=1, so a normal `forge test` never needs network access:
///        RUN_AAVE_FORK=1 forge test --match-contract AaveFork -vv
contract VestingStreamV2YieldAaveForkTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant VAULT = 0x42EAB64310E1D1c66b4d8aF7C9C4ce253885eB83;

    VestingStreamV2Yield internal ys;
    address internal grantor = makeAddr("grantor");
    address internal alice = makeAddr("alice");

    uint256 internal constant TOTAL = 1000e6;
    uint256 internal constant DURATION = 10 days;

    function setUp() public {
        if (!vm.envOr("RUN_AAVE_FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.envOr("ARC_MAINNET_RPC_URL", string("https://rpc.mainnet.arc.io")));
        ys = new VestingStreamV2Yield(USDC, VAULT);

        // On Arc, USDC is the native asset: 1 USDC = 1e18 native units = 1e6 ERC-20 units.
        // vm.deal credits the local fork only; nothing is sent to the real chain.
        vm.deal(grantor, 10_000 ether);
        assertEq(IERC20(USDC).balanceOf(grantor), 10_000e6, "grantor not funded");
    }

    function _create(bool useYield) internal returns (uint256 sid) {
        vm.startPrank(grantor);
        IERC20(USDC).approve(address(ys), TOTAL);
        sid = ys.createStream(alice, TOTAL, DURATION, useYield);
        vm.stopPrank();
    }

    function test_vaultIsAaveUsdcReserve() public view {
        assertEq(IERC4626(VAULT).asset(), USDC);
        assertEq(address(ys.vault()), VAULT);
        assertGt(IERC4626(VAULT).maxDeposit(address(ys)), 700e6, "deposit cap too small");
    }

    function test_createWithYieldDeposits70PercentIntoAave() public {
        uint256 sid = _create(true);
        uint256 shares = IERC20(VAULT).balanceOf(address(ys));
        assertGt(shares, 0, "no shares");
        uint256 value = IERC4626(VAULT).previewRedeem(shares);
        // Within 0.1% of the 700 USDC deployed (rounding only).
        assertGe(value, 700e6 - 700e3, "vault value too low");
        assertEq(ys.getStream(sid).totalAmount, TOTAL);
    }

    function test_claimHalfwayPullsFromAave() public {
        uint256 sid = _create(true);
        vm.warp(block.timestamp + DURATION / 2);
        uint256 before = IERC20(USDC).balanceOf(alice);
        vm.prank(alice);
        ys.claim(sid);
        uint256 got = IERC20(USDC).balanceOf(alice) - before;
        // Half is vested (500) and idle is only 300, so at least 200 must have come out of Aave.
        assertGe(got, 499e6, "alice should receive about half");
        assertLe(got, 501e6);
    }

    function test_fullTermAliceGetsAllAndYieldIsNonNegative() public {
        uint256 sid = _create(true);
        vm.warp(block.timestamp + DURATION + 1);
        uint256 aliceBefore = IERC20(USDC).balanceOf(alice);
        vm.prank(alice);
        ys.claim(sid);
        assertGe(IERC20(USDC).balanceOf(alice) - aliceBefore, TOTAL - 2, "alice short-paid");

        // Let Aave interest accrue, then the grantor collects the yield (credited, then withdrawn).
        vm.warp(block.timestamp + 30 days);
        uint256 grantorBefore = IERC20(USDC).balanceOf(grantor);
        vm.startPrank(grantor);
        ys.withdrawYield(sid);
        ys.withdraw();
        vm.stopPrank();
        uint256 yieldPaid = IERC20(USDC).balanceOf(grantor) - grantorBefore;
        console2.log("yield paid to grantor (USDC base units):", yieldPaid);
        assertGt(yieldPaid, 0, "no yield paid");
    }

    function test_cancelReturnsPrincipalToBothSides() public {
        uint256 sid = _create(true);
        vm.warp(block.timestamp + DURATION / 4);
        uint256 grantorBefore = IERC20(USDC).balanceOf(grantor);
        uint256 aliceBefore = IERC20(USDC).balanceOf(alice);

        vm.prank(grantor);
        ys.cancel(sid);

        vm.prank(alice);
        ys.withdraw();
        vm.prank(grantor);
        ys.withdraw();

        uint256 aliceGot = IERC20(USDC).balanceOf(alice) - aliceBefore;
        uint256 grantorGot = IERC20(USDC).balanceOf(grantor) - grantorBefore;
        // Together they get the whole 1000 back (minus at most a couple of base units of rounding).
        assertGe(aliceGot + grantorGot, TOTAL - 4, "funds lost on cancel");
        assertGe(aliceGot, 249e6);
        assertLe(aliceGot, 251e6);
    }

    function test_stopYieldPullsFundsOutOfAave() public {
        uint256 sid = _create(true);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(IERC20(VAULT).balanceOf(address(ys)), 0, "shares remain");
    }

    function test_vaultValueGrowsWithTime() public {
        _create(true);
        uint256 shares = IERC20(VAULT).balanceOf(address(ys));
        uint256 v0 = IERC4626(VAULT).previewRedeem(shares);
        vm.warp(block.timestamp + 30 days);
        uint256 v1 = IERC4626(VAULT).previewRedeem(shares);
        console2.log("value of deployed shares at start:", v0);
        console2.log("value of deployed shares after 30 days:", v1);
        assertGe(v1, v0, "vault value fell");
    }
}

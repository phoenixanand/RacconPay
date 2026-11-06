// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockERC4626Vault} from "./MockERC4626Vault.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev Constructor + createStream (yield and non-yield).
contract VestingStreamV2YieldDeployTest is VestingStreamV2YieldTestBase {
    // ── constructor ──────────────────────────────────────────────────────────

    function test_Constructor_SetsImmutables() public view {
        assertEq(address(ys.usdc()), address(usdc));
        assertEq(address(ys.vault()), address(vault));
        assertEq(ys.streamCount(), 0);
    }

    function test_Constructor_RevertsZeroUsdc() public {
        vm.expectRevert(VestingStreamV2Yield.ZeroAddress.selector);
        new VestingStreamV2Yield(address(0), address(vault));
    }

    function test_Constructor_RevertsZeroVault() public {
        vm.expectRevert(VestingStreamV2Yield.ZeroAddress.selector);
        new VestingStreamV2Yield(address(usdc), address(0));
    }

    function test_Constructor_RevertsVaultAssetMismatch() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        MockERC4626Vault otherVault = new MockERC4626Vault(other);
        vm.expectRevert(VestingStreamV2Yield.VaultAssetMismatch.selector);
        new VestingStreamV2Yield(address(usdc), address(otherVault));
    }

    // ── createStream: useYield == false (V2 behaviour) ───────────────────────

    function test_Create_NoYield_StoresStreamAndHoldsAllFunds() public {
        uint256 sid = _create(false);
        assertEq(sid, 1);
        assertEq(ys.streamCount(), 1);

        VestingStreamV2Yield.Stream memory s = ys.getStream(sid);
        assertEq(s.grantor, grantor);
        assertEq(s.beneficiary, alice);
        assertEq(s.totalAmount, TOTAL);
        assertEq(s.claimedAmount, 0);
        assertEq(s.startTime, T0);
        assertEq(s.endTime, T0 + DURATION);
        assertFalse(s.cancelled);

        assertEq(usdc.balanceOf(address(ys)), TOTAL);
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL);
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.totalShares(), 0);
        (bool u, uint256 idle, uint256 shares, uint256 value, uint256 earned, uint256 debt) = _info(sid);
        assertFalse(u);
        assertEq(idle, TOTAL);
        assertEq(shares, 0);
        assertEq(value, TOTAL);
        assertEq(earned, 0);
        assertEq(debt, 0);
    }

    function test_Create_NoYield_EmitsStreamCreated() public {
        vm.startPrank(grantor);
        usdc.approve(address(ys), TOTAL);
        vm.expectEmit(true, true, true, true, address(ys));
        emit VestingStreamV2Yield.StreamCreated(1, grantor, alice, TOTAL, T0, T0 + DURATION);
        ys.createStream(alice, TOTAL, DURATION, false);
        vm.stopPrank();
    }

    function test_Create_NoYield_NeverTouchesVault() public {
        // No vault entry point may be called across the whole lifecycle of a non-yield stream.
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.deposit.selector), 0);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.redeem.selector), 0);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.maxRedeem.selector), 0);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.previewRedeem.selector), 0);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.previewWithdraw.selector), 0);

        uint256 sid = _create(false);
        _at(400);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 400e6);
        ys.getYieldInfo(sid);
        _at(600);
        _cancel(sid);
        // V2 split: beneficiary gets vested-unclaimed, grantor the unvested remainder
        assertEq(_pending(alice), 200e6);
        assertEq(_pending(grantor), 400e6);
        vm.expectRevert(VestingStreamV2Yield.NothingToUnwind.selector);
        ys.unwind(sid);
    }

    function test_Create_NoYield_VestsLinearlyAndFullyClaims() public {
        uint256 sid = _create(false);
        _at(250);
        assertEq(ys.vestedAmount(sid), 250e6);
        assertEq(ys.claimableAmount(sid), 250e6);
        _at(5000);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), TOTAL);
        assertEq(usdc.balanceOf(address(ys)), 0);
    }

    function test_Create_RevertsZeroBeneficiary() public {
        vm.startPrank(grantor);
        usdc.approve(address(ys), TOTAL);
        vm.expectRevert(VestingStreamV2Yield.ZeroAddress.selector);
        ys.createStream(address(0), TOTAL, DURATION, true);
        vm.stopPrank();
    }

    function test_Create_RevertsZeroAmount() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.ZeroAmount.selector);
        ys.createStream(alice, 0, DURATION, true);
    }

    function test_Create_RevertsZeroDuration() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.ZeroDuration.selector);
        ys.createStream(alice, TOTAL, 0, false);
    }

    // ── createStream: useYield == true ───────────────────────────────────────

    function test_Create_Yield_Deploys70PercentKeeps30Idle() public {
        uint256 sid = _create(true);
        (bool u, uint256 idle, uint256 shares, uint256 value, uint256 earned, uint256 debt) = _info(sid);
        assertTrue(u);
        assertEq(idle, IDLE0);
        assertEq(shares, DEPLOYED);
        assertEq(value, TOTAL);
        assertEq(earned, 0);
        assertEq(debt, 0);

        assertEq(usdc.balanceOf(address(ys)), IDLE0);
        assertEq(vault.totalAssets(), DEPLOYED);
        assertEq(vault.balanceOf(address(ys)), DEPLOYED);
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL);
    }

    function test_Create_Yield_OddAmountRoundsDeployedDown() public {
        uint256 sid = _createFor(alice, 1001, DURATION, true);
        // 1001 * 70% = 700.7 -> 700 deployed, remaining 301 stays idle
        assertEq(vault.totalAssets(), 700);
        assertEq(_shares(sid), 700);
        assertEq(_idle(sid), 301);
        assertEq(usdc.balanceOf(address(ys)), 301);
    }

    function test_Create_Yield_EmitsYieldDeployedAndStreamCreated() public {
        vm.startPrank(grantor);
        usdc.approve(address(ys), TOTAL);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.YieldDeployed(1, DEPLOYED, DEPLOYED);
        vm.expectEmit(true, true, true, true, address(ys));
        emit VestingStreamV2Yield.StreamCreated(1, grantor, alice, TOTAL, T0, T0 + DURATION);
        ys.createStream(alice, TOTAL, DURATION, true);
        vm.stopPrank();
    }

    function test_Create_Yield_ClearsVaultAllowance() public {
        _create(true);
        assertEq(usdc.allowance(address(ys), address(vault)), 0);
    }

    function test_Create_Yield_DepositValueTooLow_WhenFeeAboveTolerance() public {
        vault.setDepositFeeBps(11); // 0.11% > 0.10% tolerance
        vm.startPrank(grantor);
        usdc.approve(address(ys), TOTAL);
        vm.expectRevert(VestingStreamV2Yield.DepositValueTooLow.selector);
        ys.createStream(alice, TOTAL, DURATION, true);
        vm.stopPrank();
        // whole creation rolled back
        assertEq(ys.streamCount(), 0);
        assertEq(usdc.balanceOf(grantor), SEED);
        assertEq(usdc.balanceOf(address(ys)), 0);
    }

    function test_Create_Yield_FeeAtToleranceBoundaryPasses() public {
        vault.setDepositFeeBps(10); // exactly 99.9% value: allowed
        uint256 sid = _create(true);
        assertEq(_shares(sid), 699.3e6);
        assertEq(_idle(sid), IDLE0);
    }

    function test_Create_Yield_NoFeeNeededWhenVaultAlreadyHasYield() public {
        // Existing holder in the vault so the share price is != 1.
        _create(true);
        vault.donate(70e6); // price 1.1
        uint256 sid2 = _createFor(bob, TOTAL, DURATION, true);
        // 700e6 deposited at price 1.1 -> 636363636 shares (floor)
        assertEq(_shares(sid2), uint256(700e6) * 700e6 / 770e6);
        assertGe(vault.previewRedeem(_shares(sid2)) + 1, DEPLOYED * 9990 / 10_000);
    }

    function test_Create_Yield_TinyAmountDeploysNothing() public {
        uint256 sid = _createFor(alice, 1, DURATION, true);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), 1);
        assertEq(vault.totalAssets(), 0);
    }
}

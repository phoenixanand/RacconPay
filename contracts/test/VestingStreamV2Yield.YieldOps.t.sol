// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {MockERC4626Vault} from "./MockERC4626Vault.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev withdrawYield, stopYield and getYieldInfo.
contract VestingStreamV2YieldOpsTest is VestingStreamV2YieldTestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create(true);
    }

    /// @dev idle + share value must always cover the unclaimed principal.
    function _assertCovered(uint256 id) internal view {
        uint256 obligation = ys.getStream(id).totalAmount - _claimed(id);
        assertGe(_value(id), obligation);
    }

    // ── withdrawYield ────────────────────────────────────────────────────────

    function test_WithdrawYield_CreditsSurplusToGrantor() public {
        vault.donate(70e6);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldWithdrawn(sid, grantor, 70e6);
        _withdrawYield(sid);

        assertEq(_pending(grantor), 70e6);
        assertEq(_idle(sid), 230e6);
        assertEq(_shares(sid), DEPLOYED);
        assertEq(_earned(sid), 0);
        _assertCovered(sid);

        vm.prank(grantor);
        ys.withdraw();
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL + 70e6);
    }

    function test_WithdrawYield_SecondCallRevertsNoYield() public {
        vault.donate(70e6);
        _withdrawYield(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
    }

    function test_WithdrawYield_RevertsNoYieldWithoutSurplus() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
    }

    function test_WithdrawYield_RevertsNotGrantor() public {
        vault.donate(70e6);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.NotGrantor.selector);
        ys.withdrawYield(sid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2Yield.NotGrantor.selector);
        ys.withdrawYield(sid);
    }

    function test_WithdrawYield_RevertsYieldNotEnabled() public {
        uint256 sid2 = _createFor(bob, TOTAL, DURATION, false);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.YieldNotEnabled.selector);
        ys.withdrawYield(sid2);
    }

    function test_WithdrawYield_RevertsAlreadyCancelled() public {
        vault.donate(70e6);
        _cancel(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.AlreadyCancelled.selector);
        ys.withdrawYield(sid);
    }

    function test_WithdrawYield_RevertsStreamNotFound() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2Yield.StreamNotFound.selector, 5));
        ys.withdrawYield(5);
    }

    function test_WithdrawYield_RedeemsSharesWhenIdleTooSmall() public {
        // Claim at +500 empties idle, leaving only shares worth 500e6.
        _at(500);
        _claim(sid);
        assertEq(_idle(sid), 0);
        vault.donate(50e6);
        _withdrawYield(sid);
        assertEq(_pending(grantor), 50e6);
        assertEq(_idle(sid), 0);
        assertEq(_value(sid), 500e6); // exactly the remaining obligation
        _assertCovered(sid);
    }

    function test_WithdrawYield_ReservesVestedUnclaimedEvenWhenIlliquid() public {
        _at(250); // 250e6 vested and unclaimed
        vault.donate(70e6);
        vault.setIlliquid(true);
        _withdrawYield(sid);
        // plain surplus rule would allow 70e6, but idle (300e6) must keep covering the 250e6 vested
        assertEq(_pending(grantor), 50e6);
        assertEq(_idle(sid), 250e6);
        _assertCovered(sid);

        // beneficiary can still be paid in full from idle while the vault is blocked
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 250e6);
    }

    function test_WithdrawYield_RevertsNoYieldWhenAllIdleIsReserved() public {
        _at(300); // vested == idle
        vault.donate(70e6);
        vault.setIlliquid(true);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
        assertEq(_idle(sid), IDLE0);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 300e6);
    }

    function test_WithdrawYield_NeverDropsBelowObligationAfterRepeatedUse() public {
        for (uint256 i = 1; i <= 5; ++i) {
            _at(i * 100);
            vault.donate(10e6);
            _claim(sid);
            vm.prank(grantor);
            try ys.withdrawYield(sid) {} catch {}
            _assertCovered(sid);
        }
    }

    // ── stopYield ────────────────────────────────────────────────────────────

    function test_StopYield_ByGrantorMovesSharesToIdle() public {
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldStopped(sid, grantor, DEPLOYED);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), TOTAL);
        assertEq(vault.totalAssets(), 0);
        assertEq(usdc.balanceOf(address(ys)), TOTAL);
    }

    function test_StopYield_ByBeneficiary() public {
        vault.donate(70e6);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldStopped(sid, alice, 770e6);
        vm.prank(alice);
        ys.stopYield(sid);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), 1070e6);
    }

    function test_StopYield_RevertsNoSharesOnSecondCallAndNonYield() public {
        vm.prank(grantor);
        ys.stopYield(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoShares.selector);
        ys.stopYield(sid);

        uint256 sid2 = _createFor(bob, TOTAL, DURATION, false);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoShares.selector);
        ys.stopYield(sid2);
    }

    function test_StopYield_RevertsNotStreamParty() public {
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2Yield.NotStreamParty.selector);
        ys.stopYield(sid);
    }

    function test_StopYield_RevertsAlreadyCancelled() public {
        _cancel(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.AlreadyCancelled.selector);
        ys.stopYield(sid);
    }

    function test_StopYield_IlliquidIsNoopThenRetrySucceeds() public {
        vault.setIlliquid(true);
        vm.prank(alice);
        ys.stopYield(sid); // best-effort: emits 0, does not revert
        assertEq(_shares(sid), DEPLOYED);
        vault.setIlliquid(false);
        vm.prank(alice);
        ys.stopYield(sid);
        assertEq(_shares(sid), 0);
    }

    function test_StopYield_PartialLiquidityCanBeRetried() public {
        vault.setLiquidity(200e6);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(_shares(sid), 500e6);
        assertEq(_idle(sid), 500e6);
        vault.divest(200e6);
        vm.prank(grantor);
        ys.stopYield(sid);
        vault.divest(200e6);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(_shares(sid), 100e6);
        vault.divest(100e6);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), TOTAL);
    }

    function test_StopYield_IsOneWay_NoRedeposit() public {
        vm.prank(grantor);
        ys.stopYield(sid);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.deposit.selector), 0);
        _at(300);
        _claim(sid);
        vault.donate(10e6);
        _at(600);
        _claim(sid);
        assertEq(_shares(sid), 0);
        assertEq(vault.totalShares(), 0);
        // post-stop donations are no longer this stream's yield
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
    }

    function test_StopYield_ClaimsStillWorkFromIdle() public {
        vm.prank(alice);
        ys.stopYield(sid);
        vault.setIlliquid(true);
        _at(900);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 900e6);
    }

    // ── getYieldInfo ─────────────────────────────────────────────────────────

    function test_GetYieldInfo_AtCreation() public view {
        (bool u, uint256 idle, uint256 shares, uint256 value, uint256 earned, uint256 debt) = _info(sid);
        assertTrue(u);
        assertEq(idle, 300e6);
        assertEq(shares, 700e6);
        assertEq(value, 1000e6);
        assertEq(earned, 0);
        assertEq(debt, 0);
    }

    function test_GetYieldInfo_AfterDonation() public {
        vault.donate(70e6);
        assertEq(_value(sid), 1070e6);
        assertEq(_earned(sid), 70e6);
    }

    function test_GetYieldInfo_AfterClaimObligationShrinks() public {
        vault.donate(70e6);
        _at(300);
        _claim(sid);
        assertEq(_value(sid), 770e6);
        assertEq(_earned(sid), 70e6);
    }

    function test_GetYieldInfo_AfterLossEarnedIsZero() public {
        vault.burn(100e6);
        assertEq(_value(sid), 900e6);
        assertEq(_earned(sid), 0);
    }

    function test_GetYieldInfo_ReportsDebtAfterIlliquidCancel() public {
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid);
        (bool u, uint256 idle, uint256 shares, uint256 value, uint256 earned, uint256 debt) = _info(sid);
        assertTrue(u);
        assertEq(idle, 0);
        assertEq(shares, DEPLOYED);
        assertEq(value, DEPLOYED);
        assertEq(debt, 100e6);
        // obligation reported as total - claimed = 700e6, so no surplus
        assertEq(earned, 0);
    }

    function test_GetYieldInfo_NonYieldStream() public {
        uint256 sid2 = _createFor(bob, TOTAL, DURATION, false);
        (bool u, uint256 idle, uint256 shares, uint256 value, uint256 earned, uint256 debt) = _info(sid2);
        assertFalse(u);
        assertEq(idle, TOTAL);
        assertEq(shares, 0);
        assertEq(value, TOTAL);
        assertEq(earned, 0);
        assertEq(debt, 0);
    }

    function test_GetYieldInfo_RevertsStreamNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2Yield.StreamNotFound.selector, 0));
        ys.getYieldInfo(0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev Vault loss waterfall + cross-stream isolation.
contract VestingStreamV2YieldLossIsolationTest is VestingStreamV2YieldTestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create(true); // stream 1: yield, alice
    }

    // ── loss: grantor's unvested portion absorbs it first ────────────────────

    function test_Loss_BeneficiaryClaimPaidInFullWhenAssetsSuffice() public {
        vault.burn(100e6); // value 900e6 >= 400e6 vested
        _at(400);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 400e6);
        assertEq(_claimed(sid), 400e6);
    }

    function test_Loss_CancelFallsOnGrantorUnvestedFirst() public {
        vault.burn(100e6);
        _at(400);
        _cancel(sid);
        assertEq(_pending(alice), 400e6); // vested principal intact
        assertEq(_pending(grantor), 500e6); // 600e6 unvested - 100e6 loss
        assertEq(_debt(sid), 0);
    }

    function test_Loss_AfterClaim_GrantorStillBearsIt() public {
        vault.burn(100e6);
        _at(400);
        _claim(sid);
        _cancel(sid);
        assertEq(_pending(alice), 0);
        assertEq(_pending(grantor), 500e6);
        assertEq(usdc.balanceOf(alice), 400e6);
    }

    function test_Loss_EqualToUnvestedStillPaysBeneficiaryFully() public {
        vault.burn(600e6); // ta 100e6, value 400e6 == vested at +400
        _at(400);
        _cancel(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 0);
        assertEq(_debt(sid), 0);
    }

    function test_Loss_ExceedingUnvested_ClaimPartialThenVaultIlliquid() public {
        vault.burn(650e6); // value left: 300e6 idle + 50e6 in vault
        _at(500);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 350e6); // everything that is left
        assertEq(_claimed(sid), 350e6);
        assertEq(_shares(sid), 0);

        // vested 500e6 but only 350e6 existed -> nothing more can ever be paid
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.VaultIlliquid.selector);
        ys.claim(sid);
    }

    function test_Loss_ExceedingUnvested_CancelRecordsDebtAndGrantorGetsNothing() public {
        vault.burn(650e6);
        _at(500);
        _cancel(sid);
        assertEq(_pending(alice), 350e6);
        assertEq(_debt(sid), 150e6);
        assertEq(_pending(grantor), 0);

        // nothing left to recover: unwind cannot move the grantor ahead of the beneficiary
        _unwind(sid);
        assertEq(_pending(alice), 350e6);
        assertEq(_debt(sid), 150e6);
        assertEq(_pending(grantor), 0);
    }

    function test_Loss_PartialRecovery_BeneficiaryDebtShrinksBeforeGrantor() public {
        vault.burn(400e6); // value 600e6
        _at(700);
        vault.setIlliquid(true);
        _cancel(sid); // idle 300 -> alice; debt 400
        assertEq(_pending(alice), 300e6);
        assertEq(_debt(sid), 400e6);
        vault.setIlliquid(false);
        _unwind(sid); // 300e6 recovered from vault
        assertEq(_pending(alice), 600e6);
        assertEq(_debt(sid), 100e6);
        assertEq(_pending(grantor), 0);
    }

    function test_Loss_NewDepositAfterVaultLossStillMeetsValueGuard() public {
        vault.burn(70e6); // share price 0.9 for existing holders
        uint256 sid2 = _createFor(bob, TOTAL, DURATION, true);
        assertGt(_shares(sid2), DEPLOYED); // more shares for the same assets
        assertGe(_value(sid2), TOTAL * 9990 / 10_000);
    }

    // ── isolation: other streams' funds are never touched ────────────────────

    function test_Isolation_NonYieldStreamUntouchedByYieldStreamOps() public {
        uint256 sidB = _createFor(bob, 500e6, DURATION, false); // stream 2, no yield
        assertEq(usdc.balanceOf(address(ys)), IDLE0 + 500e6);

        vault.donate(70e6);
        _at(400);
        _claim(sid);
        vault.setIlliquid(true);
        _cancel(sid);

        assertEq(_idle(sidB), 500e6);
        assertEq(_claimed(sidB), 0);
        assertEq(_value(sidB), 500e6);
        // Contract still holds everything credited + stream B's full deposit
        assertGe(usdc.balanceOf(address(ys)), _pending(alice) + _pending(grantor) + 500e6);

        // B keeps working fully even with the vault blocked: 40% of 500e6 vested at +400
        vm.prank(bob);
        ys.claim(sidB);
        assertEq(usdc.balanceOf(bob), 200e6);
    }

    function test_Isolation_NonYieldBeneficiaryClaimsWhileVaultBroken() public {
        uint256 sidB = _createFor(bob, 500e6, DURATION, false);
        vault.burn(700e6); // total loss of stream A's deployed funds
        vault.setIlliquid(true);
        _at(1000);
        vm.prank(bob);
        ys.claim(sidB);
        assertEq(usdc.balanceOf(bob), 500e6);
        assertEq(usdc.balanceOf(address(ys)), IDLE0);
    }

    function test_Isolation_CancelNonYieldStreamDoesNotMoveStreamAFunds() public {
        uint256 sidB = _createFor(bob, 500e6, DURATION, false);
        _at(200);
        _cancel(sidB);
        assertEq(_pending(bob), 100e6);
        assertEq(_pending(grantor), 400e6);
        assertEq(_idle(sid), IDLE0);
        assertEq(_shares(sid), DEPLOYED);
        assertEq(usdc.balanceOf(address(ys)), IDLE0 + 500e6);
    }

    function test_Isolation_CancelOneYieldStreamLeavesOthersSharesIntact() public {
        uint256 sidB = _createFor(bob, TOTAL, DURATION, true); // stream 2, yield
        vault.donate(140e6); // 2800/2800 shares -> price 1.1 for both
        assertEq(vault.balanceOf(address(ys)), 1400e6);

        _at(300);
        _cancel(sid);

        // A: 300 vested -> alice; grantor gets idle 300 + 770 shares value - 300
        assertEq(_pending(alice), 300e6);
        assertEq(_pending(grantor), 770e6);
        // B untouched
        assertEq(_shares(sidB), DEPLOYED);
        assertEq(_idle(sidB), IDLE0);
        assertEq(vault.balanceOf(address(ys)), DEPLOYED);
        assertEq(_value(sidB), 300e6 + 770e6);
    }

    function test_Isolation_PartialVaultLiquidityOnlyAffectsStreamsOwnShares() public {
        uint256 sidB = _createFor(bob, TOTAL, DURATION, true);
        vault.setLiquidity(100e6);
        _at(500);
        _claim(sid); // needs 200e6 shares beyond idle, but the vault only holds 100e6 USDC
        assertEq(usdc.balanceOf(alice), 400e6);
        assertEq(_shares(sid), 600e6);
        assertEq(_shares(sidB), DEPLOYED);
        assertEq(_idle(sidB), IDLE0);
    }

    function test_Isolation_StopYieldOnOneStreamDoesNotRedeemOthers() public {
        uint256 sidB = _createFor(bob, TOTAL, DURATION, true);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(_shares(sid), 0);
        assertEq(_shares(sidB), DEPLOYED);
        assertEq(vault.balanceOf(address(ys)), DEPLOYED);
        assertEq(vault.totalAssets(), DEPLOYED);
    }

    function test_Isolation_WithdrawYieldOnOneStreamLeavesOtherSurplusInPlace() public {
        uint256 sidB = _createFor(bob, TOTAL, DURATION, true);
        vault.donate(140e6); // 70e6 attributable to each stream
        _withdrawYield(sid);
        assertEq(_pending(grantor), 70e6);
        assertEq(_idle(sidB), IDLE0);
        assertEq(_shares(sidB), DEPLOYED);
        assertEq(_earned(sidB), 70e6);
    }
}

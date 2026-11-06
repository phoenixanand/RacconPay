// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev Behaviour against a Morpho-VaultV2-like vault (every max* returns 0) and against vaults whose real USDC
///      balance is lower than the value of their shares (partial / full illiquidity). The contract must not rely
///      on maxRedeem and must fall back to redeeming only what the vault can actually pay.
contract VestingStreamV2YieldVaultV2Test is VestingStreamV2YieldTestBase {
    function setUp() public override {
        super.setUp();
        vault.setMaxFunctionsReturnZero(true);
    }

    // ── mock sanity: the switch mimics VaultV2 ──────────────────────────────

    function test_Mock_MaxFunctionsReturnZeroButOperationsWork() public {
        uint256 sid = _create(true);
        assertEq(vault.maxDeposit(address(ys)), 0);
        assertEq(vault.maxMint(address(ys)), 0);
        assertEq(vault.maxWithdraw(address(ys)), 0);
        assertEq(vault.maxRedeem(address(ys)), 0);
        assertEq(_shares(sid), DEPLOYED); // deposit worked
    }

    // ── (4) createStream with the zero-max vault ─────────────────────────────

    function test_Create_WithZeroMaxVaultSucceedsAndDeploys70Percent() public {
        vm.startPrank(grantor);
        usdc.approve(address(ys), TOTAL);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.YieldDeployed(1, DEPLOYED, DEPLOYED);
        uint256 sid = ys.createStream(alice, TOTAL, DURATION, true);
        vm.stopPrank();

        assertEq(sid, 1);
        assertEq(_shares(sid), DEPLOYED);
        assertEq(_idle(sid), IDLE0);
        assertEq(vault.totalAssets(), DEPLOYED);
        assertEq(usdc.balanceOf(address(ys)), IDLE0);
    }

    function test_Create_NonYieldWithZeroMaxVaultSucceeds() public {
        uint256 sid = _create(false);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), TOTAL);
    }

    // ── (1) the 70% comes back with max* == 0 ────────────────────────────────

    function test_ZeroMax_ClaimRedeemsSharesBeyondIdle() public {
        uint256 sid = _create(true);
        _at(500);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.Claimed(sid, alice, 500e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), 500e6);
    }

    function test_ZeroMax_ClaimFullDurationGetsEverything() public {
        uint256 sid = _create(true);
        _at(DURATION);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), TOTAL);
        assertEq(_shares(sid), 0);
        assertEq(vault.totalAssets(), 0);
    }

    function test_ZeroMax_CancelReturnsSharesToBeneficiaryAndGrantor() public {
        uint256 sid = _create(true);
        _at(400);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamCancelled(sid, 600e6, 400e6);
        _cancel(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 600e6);
        assertEq(_shares(sid), 0);
        assertEq(_debt(sid), 0);
        assertEq(vault.totalAssets(), 0);
    }

    function test_ZeroMax_StopYieldRedeemsAllShares() public {
        uint256 sid = _create(true);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldStopped(sid, grantor, DEPLOYED);
        vm.prank(grantor);
        ys.stopYield(sid);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), TOTAL);
        assertEq(usdc.balanceOf(address(ys)), TOTAL);
    }

    function test_ZeroMax_WithdrawYieldCreditsGrantorTheYield() public {
        uint256 sid = _create(true);
        vault.donate(70e6);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldWithdrawn(sid, grantor, 70e6);
        _withdrawYield(sid);
        assertEq(_pending(grantor), 70e6);
        assertGt(_shares(sid), 0); // only the excess was pulled, principal stays invested
        assertGe(_value(sid), TOTAL); // obligation still fully covered
    }

    function test_ZeroMax_UnwindAfterIlliquidCancelStillWorks() public {
        uint256 sid = _create(true);
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid);
        vault.setIlliquid(false);
        _unwind(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 600e6);
        assertEq(_shares(sid), 0);
    }

    // ── (2) partial liquidity: idle + what the vault can actually return ─────

    function test_Partial_ClaimPaysIdlePlusWhatVaultCanReturn() public {
        uint256 sid = _create(true);
        _at(700); // claimable 700e6, idle 300e6 -> 400e6 needed from the vault
        vault.setLiquidity(150e6); // only 150e6 of USDC is actually in the vault
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.Claimed(sid, alice, 450e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 450e6);
        assertEq(_claimed(sid), 450e6);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), 550e6);
    }

    function test_Partial_LaterClaimAfterLiquidityReturnsPaysTheRest() public {
        uint256 sid = _create(true);
        _at(700);
        vault.setLiquidity(150e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 450e6);

        vault.divestAll(); // liquidity returns
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.Claimed(sid, alice, 250e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 700e6);
        assertEq(_claimed(sid), 700e6);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), 300e6);
    }

    function test_Partial_ClaimWithYieldUsesFallbackShareConversion() public {
        uint256 sid = _create(true);
        vault.donate(70e6); // price 1.1: 700e6 shares worth 770e6
        _at(700);
        vault.setLiquidity(110e6); // worth exactly 100e6 shares
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 410e6); // 300 idle + 110 redeemed
        assertEq(_shares(sid), 600e6);
        assertEq(_idle(sid), 0);
    }

    function test_Partial_ClaimCoveredByLiquidityRedeemsExactlyWhatIsNeeded() public {
        uint256 sid = _create(true);
        _at(500);
        vault.setLiquidity(400e6); // enough for the 200e6 needed
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_shares(sid), 500e6);
    }

    function test_Partial_CancelPaysBeneficiaryFirstThenUnwindFinishes() public {
        uint256 sid = _create(true);
        _at(600);
        vault.setLiquidity(200e6);
        _cancel(sid);
        // idle 300 + 200 redeemed = 500 < 600 owed: all goes to alice, remainder is debt
        assertEq(_pending(alice), 500e6);
        assertEq(_debt(sid), 100e6);
        assertEq(_pending(grantor), 0);
        assertEq(_shares(sid), 500e6);

        vault.divestAll();
        _unwind(sid);
        assertEq(_pending(alice), 600e6);
        assertEq(_debt(sid), 0);
        assertEq(_pending(grantor), 400e6);
        assertEq(_shares(sid), 0);
    }

    // ── (3) fully illiquid vault (USDC balance 0, shares unredeemable) ───────

    function test_Illiquid_ClaimRevertsVaultIlliquidWhenIdleEmpty() public {
        uint256 sid = _create(true);
        _at(300);
        vault.investAll();
        _claim(sid); // exactly the idle 300e6
        assertEq(usdc.balanceOf(alice), 300e6);
        assertEq(_idle(sid), 0);

        _at(400);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.VaultIlliquid.selector);
        ys.claim(sid);
        assertEq(_claimed(sid), 300e6);
        assertEq(_shares(sid), DEPLOYED);

        vault.divestAll();
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 400e6);
    }

    function test_Illiquid_ClaimStillPaysFromIdleWhileVaultEmpty() public {
        uint256 sid = _create(true);
        _at(200);
        vault.investAll();
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 200e6);
    }

    function test_Illiquid_CancelRecordsBeneficiaryDebt() public {
        uint256 sid = _create(true);
        _at(400);
        vault.investAll();
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamCancelled(sid, 0, 300e6);
        _cancel(sid);
        assertEq(_pending(alice), 300e6);
        assertEq(_debt(sid), 100e6);
        assertEq(_pending(grantor), 0);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), DEPLOYED);
    }

    function test_Illiquid_UnwindWhileStillIlliquidMakesNoProgress() public {
        uint256 sid = _create(true);
        _at(400);
        vault.investAll();
        _cancel(sid);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamUnwound(sid, 0, 0);
        _unwind(sid);
        assertEq(_debt(sid), 100e6);
        assertEq(_pending(alice), 300e6);
        assertEq(_pending(grantor), 0);
        assertEq(_shares(sid), DEPLOYED);
    }

    function test_Illiquid_UnwindPaysBeneficiaryFirstAsLiquidityReturns() public {
        uint256 sid = _create(true);
        _at(400);
        vault.investAll();
        _cancel(sid);

        // 60e6 returns: goes to the beneficiary debt, grantor gets nothing
        vault.divest(60e6);
        _unwind(sid);
        assertEq(_pending(alice), 360e6);
        assertEq(_debt(sid), 40e6);
        assertEq(_pending(grantor), 0);

        // 100e6 more: clears the debt (40e6), surplus 60e6 stays idle, grantor still waits for all shares
        vault.divest(100e6);
        _unwind(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_debt(sid), 0);
        assertEq(_pending(grantor), 0);
        assertEq(_idle(sid), 60e6);
        assertGt(_shares(sid), 0);

        // everything returns: grantor receives the remainder
        vault.divestAll();
        _unwind(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 600e6);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), 0);
        assertEq(usdc.balanceOf(address(ys)), TOTAL);
    }

    function test_Illiquid_RedeemRevertsWithInsufficientLiquidityOnTheMock() public {
        _create(true);
        vault.investAll();
        vm.prank(address(ys));
        vm.expectRevert(bytes("insufficient liquidity"));
        vault.redeem(1, address(ys), address(ys));
    }
}

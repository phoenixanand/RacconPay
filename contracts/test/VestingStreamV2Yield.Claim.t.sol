// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {MockERC4626Vault} from "./MockERC4626Vault.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev claim() with yield + break/cancel regression tests (break logic is shared with V2).
contract VestingStreamV2YieldClaimTest is VestingStreamV2YieldTestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create(true);
    }

    // ── paid from idle first ─────────────────────────────────────────────────

    function test_Claim_PaidFromIdleWithoutTouchingVault() public {
        _at(200);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.redeem.selector), 0);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.maxRedeem.selector), 0);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 200e6);
        assertEq(_claimed(sid), 200e6);
        assertEq(_idle(sid), 100e6);
        assertEq(_shares(sid), DEPLOYED);
    }

    function test_Claim_ExactlyIdleDoesNotRedeem() public {
        _at(300);
        vm.expectCall(address(vault), abi.encodeWithSelector(MockERC4626Vault.redeem.selector), 0);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 300e6);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), DEPLOYED);
    }

    function test_Claim_EmitsClaimed() public {
        _at(200);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.Claimed(sid, alice, 200e6);
        _claim(sid);
    }

    // ── then redeems shares ──────────────────────────────────────────────────

    function test_Claim_RedeemsSharesBeyondIdle() public {
        _at(500);
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.Claimed(sid, alice, 500e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_claimed(sid), 500e6);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), 500e6); // only 200e6 shares needed beyond the 300e6 idle
        assertEq(vault.totalAssets(), 500e6);
        assertEq(usdc.balanceOf(address(ys)), 0);
    }

    function test_Claim_WithYield_RedeemsFewerShares() public {
        vault.donate(70e6); // share price 1.1
        _at(500);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 500e6);
        // ceil(200e6 / 1.1) shares redeemed
        assertEq(_shares(sid), DEPLOYED - 181_818_182);
        assertEq(_idle(sid), 0);
        assertEq(_value(sid), 570e6); // yield (70e6) still intact on the remaining position
        assertEq(_earned(sid), 70e6);
    }

    function test_Claim_AfterFullDuration_DrainsEverything() public {
        _at(5000);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), TOTAL);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), 0);
        assertEq(vault.totalAssets(), 0);
        assertEq(usdc.balanceOf(address(ys)), 0);
    }

    // ── partial payment / illiquid / recovery ────────────────────────────────

    function test_Claim_PartialWhenVaultHasLimitedLiquidity() public {
        _at(500);
        vault.setLiquidity(100e6); // vault holds only 100e6 USDC (the rest is invested)
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.Claimed(sid, alice, 400e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 400e6); // 300 idle + 100 redeemed
        assertEq(_claimed(sid), 400e6);
        assertEq(_shares(sid), 600e6);

        // the vault is now empty: the remainder is owed but cannot be paid until liquidity returns
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.VaultIlliquid.selector);
        ys.claim(sid);
        vault.divest(100e6);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_claimed(sid), 500e6);
    }

    function test_Claim_RevertsVaultIlliquidWhenIdleExhausted() public {
        _at(400);
        vault.setIlliquid(true);
        _claim(sid); // partial: only the 300e6 idle can be paid
        assertEq(usdc.balanceOf(alice), 300e6);
        assertEq(_idle(sid), 0);

        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.VaultIlliquid.selector);
        ys.claim(sid);
        // nothing moved
        assertEq(usdc.balanceOf(alice), 300e6);
        assertEq(_claimed(sid), 300e6);
        assertEq(_shares(sid), DEPLOYED);
    }

    function test_Claim_WorksAgainAfterLiquidityReturns() public {
        _at(400);
        vault.setIlliquid(true);
        _claim(sid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.VaultIlliquid.selector);
        ys.claim(sid);

        vault.setIlliquid(false);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 400e6);
        assertEq(_claimed(sid), 400e6);
        assertEq(_shares(sid), 600e6);
    }

    function test_Claim_IlliquidButIdleSuffices_StillPays() public {
        _at(100);
        vault.setIlliquid(true);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 100e6);
    }

    // ── reverts ──────────────────────────────────────────────────────────────

    function test_Claim_RevertsNothingToClaimAtStart() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.NothingToClaim.selector);
        ys.claim(sid);
    }

    function test_Claim_RevertsNothingToClaimAfterClaim() public {
        _at(300);
        _claim(sid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.NothingToClaim.selector);
        ys.claim(sid);
    }

    function test_Claim_RevertsNotBeneficiary() public {
        _at(300);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NotBeneficiary.selector);
        ys.claim(sid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2Yield.NotBeneficiary.selector);
        ys.claim(sid);
    }

    function test_Claim_RevertsAlreadyCancelled() public {
        _at(300);
        _cancel(sid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.AlreadyCancelled.selector);
        ys.claim(sid);
    }

    function test_Claim_RevertsStreamNotFound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2Yield.StreamNotFound.selector, 99));
        ys.claim(99);
    }

    // ── regression: breaks (shared logic with V2) ────────────────────────────

    function _openBreak(uint256 start, uint256 end) internal {
        vm.prank(alice);
        uint256 rid = ys.requestLeave(sid, uint64(T0 + start), uint64(T0 + end), "leave");
        vm.prank(grantor);
        ys.approveLeave(rid);
    }

    function test_Break_FreezesVestingForYieldStream() public {
        _at(200);
        _openBreak(200, 400);
        _at(300);
        assertTrue(ys.isOnBreak(sid));
        assertEq(ys.vestedAmount(sid), 200e6);
        _at(399);
        assertEq(ys.vestedAmount(sid), 200e6);
        _at(400);
        assertFalse(ys.isOnBreak(sid));
        assertEq(ys.vestedAmount(sid), 200e6);
        _at(500);
        assertEq(ys.vestedAmount(sid), 300e6);
        assertEq(ys.effectiveEndTime(sid), T0 + DURATION + 200);
    }

    function test_Break_ClaimDuringBreakPaysOnlyFrozenAmount() public {
        _at(200);
        _openBreak(200, 400);
        _at(350);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 200e6);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.NothingToClaim.selector);
        ys.claim(sid);
    }

    function test_Break_CancelDuringBreakFreezesBeneficiaryShare() public {
        _at(200);
        _openBreak(200, 400);
        _at(300);
        _cancel(sid);
        assertEq(ys.getStream(sid).finalVested, 200e6);
        assertEq(_pending(alice), 200e6);
        assertEq(_pending(grantor), 800e6);
        assertEq(_shares(sid), 0);
        assertEq(vault.totalAssets(), 0);
    }
}

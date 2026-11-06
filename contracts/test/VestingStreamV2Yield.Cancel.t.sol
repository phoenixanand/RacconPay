// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev cancel() and unwind() on yield streams.
contract VestingStreamV2YieldCancelTest is VestingStreamV2YieldTestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create(true);
    }

    // ── cancel, liquid vault ─────────────────────────────────────────────────

    function test_Cancel_BeneficiaryCreditedFirstGrantorGetsRemainder() public {
        _at(400);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamCancelled(sid, 600e6, 400e6);
        _cancel(sid);

        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 600e6);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), 0);
        assertEq(_debt(sid), 0);
        assertEq(vault.totalAssets(), 0);
        assertEq(_claimed(sid), 400e6);
        assertTrue(ys.getStream(sid).cancelled);
        assertEq(usdc.balanceOf(address(ys)), TOTAL); // everything is back in the contract, awaiting withdraw()

        vm.prank(alice);
        ys.withdraw();
        vm.prank(grantor);
        ys.withdraw();
        assertEq(usdc.balanceOf(alice), 400e6);
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL + 600e6);
        assertEq(usdc.balanceOf(address(ys)), 0);
    }

    function test_Cancel_GrantorKeepsTheYield() public {
        vault.donate(70e6);
        _at(400);
        _cancel(sid);
        assertEq(_pending(alice), 400e6); // yield never inflates the beneficiary's share
        assertEq(_pending(grantor), 670e6); // 600e6 unvested + 70e6 yield
        assertEq(vault.totalAssets(), 0);
    }

    function test_Cancel_AfterPriorClaim() public {
        _at(500);
        _claim(sid);
        _at(600);
        _cancel(sid);
        assertEq(_pending(alice), 100e6);
        assertEq(_pending(grantor), 400e6);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_Cancel_FullyVested_GrantorGetsOnlyYield() public {
        vault.donate(70e6);
        _at(1500);
        _cancel(sid);
        assertEq(_pending(alice), TOTAL);
        assertEq(_pending(grantor), 70e6);
    }

    function test_Cancel_AtStart_RefundsEverythingToGrantor() public {
        _cancel(sid);
        assertEq(_pending(alice), 0);
        assertEq(_pending(grantor), TOTAL);
    }

    function test_Cancel_FreezesVestedAmountAndClaimable() public {
        _at(400);
        _cancel(sid);
        _at(900);
        assertEq(ys.vestedAmount(sid), 400e6);
        assertEq(ys.claimableAmount(sid), 0);
    }

    function test_Cancel_RevertsNotGrantor() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.NotGrantor.selector);
        ys.cancel(sid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2Yield.NotGrantor.selector);
        ys.cancel(sid);
    }

    function test_Cancel_RevertsAlreadyCancelled() public {
        _cancel(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.AlreadyCancelled.selector);
        ys.cancel(sid);
    }

    function test_Cancel_RevertsStreamNotFound() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2Yield.StreamNotFound.selector, 7));
        ys.cancel(7);
    }

    // ── cancel, illiquid / capped vault ──────────────────────────────────────

    function test_Cancel_Illiquid_RecordsBeneficiaryDebtAndGrantorGetsNothing() public {
        _at(400);
        vault.setIlliquid(true);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamCancelled(sid, 0, 300e6);
        _cancel(sid);

        assertEq(_pending(alice), 300e6); // all that idle can cover
        assertEq(_debt(sid), 100e6); // vested but unpaid
        assertEq(_pending(grantor), 0);
        assertEq(_idle(sid), 0);
        assertEq(_shares(sid), DEPLOYED);
        assertEq(_claimed(sid), 300e6);
    }

    function test_Cancel_Illiquid_UnwindWhileStillIlliquidMakesNoProgress() public {
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid);
        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamUnwound(sid, 0, 0);
        _unwind(sid);
        assertEq(_pending(alice), 300e6);
        assertEq(_pending(grantor), 0);
        assertEq(_debt(sid), 100e6);
        assertEq(_shares(sid), DEPLOYED);
    }

    function test_Cancel_Illiquid_UnwindPaysBeneficiaryFirstThenGrantor() public {
        vault.donate(70e6);
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid);
        vault.setIlliquid(false);

        vm.expectEmit(true, false, false, true, address(ys));
        emit VestingStreamV2Yield.StreamUnwound(sid, 670e6, 100e6);
        _unwind(sid);

        assertEq(_pending(alice), 400e6); // 300 at cancel + 100 debt
        assertEq(_pending(grantor), 670e6); // 600 unvested + 70 yield
        assertEq(_debt(sid), 0);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), 0);
        assertEq(_claimed(sid), 400e6);
        assertEq(_pending(attacker), 0); // permissionless caller never receives funds
    }

    function test_Cancel_IlliquidButIdleCoversOwed_GrantorGetsIdleSharesWaitForUnwind() public {
        _at(200);
        vault.setIlliquid(true);
        _cancel(sid);
        assertEq(_pending(alice), 200e6);
        assertEq(_debt(sid), 0);
        assertEq(_pending(grantor), 100e6); // idle remainder
        assertEq(_shares(sid), DEPLOYED);

        vault.setIlliquid(false);
        _unwind(sid);
        assertEq(_pending(grantor), 800e6);
        assertEq(_pending(alice), 200e6);
        assertEq(_shares(sid), 0);
    }

    function test_Cancel_PartialLiquidity_SharesLeftOverGoThroughUnwind() public {
        _at(200);
        vault.setLiquidity(100e6); // 600e6 of the vault's USDC is out on loan
        _cancel(sid);
        // idle 300 + 100 redeemed via the liquidity fallback = 400; beneficiary owed 200 -> grantor gets the idle 200
        assertEq(_pending(alice), 200e6);
        assertEq(_pending(grantor), 200e6);
        assertEq(_shares(sid), 600e6);
        assertEq(_debt(sid), 0);

        vault.divestAll();
        _unwind(sid);
        assertEq(_pending(grantor), 800e6);
        assertEq(_shares(sid), 0);
    }

    // ── unwind ───────────────────────────────────────────────────────────────

    function test_Unwind_PartialNeverLetsGrantorTakeBeforeBeneficiary() public {
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid); // alice 300e6 credited, debt 100e6
        vault.setIlliquid(false);

        // step 1: the vault holds only 50e6 USDC -> half of the debt
        vault.setLiquidity(50e6);
        _unwind(sid);
        assertEq(_pending(alice), 350e6);
        assertEq(_debt(sid), 50e6);
        assertEq(_pending(grantor), 0);
        assertEq(_shares(sid), 650e6);

        // step 2: another 50e6 of liquidity returns; the debt is cleared, but grantor still waits for ALL shares
        vault.divest(50e6);
        _unwind(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_debt(sid), 0);
        assertEq(_pending(grantor), 0);
        assertEq(_shares(sid), 600e6);

        // step 3: more liquidity that still leaves shares behind, grantor still gets nothing
        vault.divest(200e6);
        _unwind(sid);
        assertEq(_pending(grantor), 0);
        assertEq(_shares(sid), 400e6);
        assertEq(_idle(sid), 200e6);

        // step 4: full liquidity -> grantor receives the whole remainder
        vault.divestAll();
        _unwind(sid);
        assertEq(_pending(grantor), 600e6);
        assertEq(_pending(alice), 400e6);
        assertEq(_shares(sid), 0);
        assertEq(_idle(sid), 0);
    }

    function test_Unwind_LiquidityLargerThanDebtLeavesSurplusIdleNotGrantorCredit() public {
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid);
        vault.setIlliquid(false);
        vault.setLiquidity(200e6);
        _unwind(sid);
        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 0);
        assertEq(_idle(sid), 100e6);
        assertEq(_shares(sid), 500e6);
    }

    function test_Unwind_AnyoneCanCall() public {
        _at(400);
        vault.setIlliquid(true);
        _cancel(sid);
        vault.setIlliquid(false);
        vm.prank(bob);
        ys.unwind(sid);
        assertEq(_pending(bob), 0);
        assertEq(_pending(alice), 400e6);
        assertEq(_pending(grantor), 600e6);
    }

    function test_Unwind_RevertsNotCancelled() public {
        vm.expectRevert(VestingStreamV2Yield.NotCancelled.selector);
        ys.unwind(sid);
    }

    function test_Unwind_RevertsNothingToUnwindAfterFullyUnwound() public {
        _at(400);
        _cancel(sid);
        vm.expectRevert(VestingStreamV2Yield.NothingToUnwind.selector);
        ys.unwind(sid);
    }

    function test_Unwind_RevertsNothingToUnwindForNonYieldStream() public {
        uint256 sid2 = _createFor(bob, TOTAL, DURATION, false);
        _at(100);
        _cancel(sid2);
        vm.expectRevert(VestingStreamV2Yield.NothingToUnwind.selector);
        ys.unwind(sid2);
    }

    function test_Unwind_RevertsStreamNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2Yield.StreamNotFound.selector, 42));
        ys.unwind(42);
    }

    function test_Withdraw_RevertsNothingToClaimWhenNoCredit() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2Yield.NothingToClaim.selector);
        ys.withdraw();
    }
}

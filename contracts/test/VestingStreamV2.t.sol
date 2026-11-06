// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2} from "../VestingStreamV2.sol";
import {VestingStreamV2TestBase} from "./VestingStreamV2.Base.t.sol";

/// @dev createStream / claim / cancel / withdraw / views.
contract VestingStreamV2Test is VestingStreamV2TestBase {
    // ── constructor ──────────────────────────────────────────────────────────

    function test_Constructor_SetsUsdc() public view {
        assertEq(address(vesting.usdc()), address(usdc));
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(VestingStreamV2.ZeroAddress.selector);
        new VestingStreamV2(address(0));
    }

    // ── createStream ─────────────────────────────────────────────────────────

    function test_CreateStream_HappyPath() public {
        uint256 sid = _create();
        assertEq(sid, 1);
        assertEq(vesting.streamCount(), 1);
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL);
        assertEq(usdc.balanceOf(address(vesting)), TOTAL);

        VestingStreamV2.Stream memory s = vesting.getStream(sid);
        assertEq(s.grantor, grantor);
        assertEq(s.beneficiary, alice);
        assertEq(s.totalAmount, TOTAL);
        assertEq(s.claimedAmount, 0);
        assertEq(s.startTime, T0);
        assertEq(s.endTime, T0 + DURATION);
        assertFalse(s.cancelled);
        assertEq(s.finalVested, 0);
        assertEq(s.totalBreakTime, 0);
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION);
    }

    function test_CreateStream_EmitsStreamCreated() public {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), TOTAL);
        vm.expectEmit(true, true, true, true, address(vesting));
        emit VestingStreamV2.StreamCreated(1, grantor, alice, TOTAL, T0, T0 + DURATION);
        vesting.createStream(alice, TOTAL, DURATION);
        vm.stopPrank();
    }

    function test_CreateStream_IdsIncrement() public {
        assertEq(_create(), 1);
        assertEq(_create(), 2);
        assertEq(vesting.streamCount(), 2);
    }

    function test_CreateStream_RevertsZeroBeneficiary() public {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), TOTAL);
        vm.expectRevert(VestingStreamV2.ZeroAddress.selector);
        vesting.createStream(address(0), TOTAL, DURATION);
        vm.stopPrank();
    }

    function test_CreateStream_RevertsZeroAmount() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.ZeroAmount.selector);
        vesting.createStream(alice, 0, DURATION);
    }

    function test_CreateStream_RevertsZeroDuration() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.ZeroDuration.selector);
        vesting.createStream(alice, TOTAL, 0);
    }

    function test_CreateStream_RevertsWithoutAllowance() public {
        vm.prank(grantor);
        vm.expectRevert();
        vesting.createStream(alice, TOTAL, DURATION);
    }

    // ── views / not found ────────────────────────────────────────────────────

    function test_Views_RevertOnUnknownStream() public {
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 0));
        vesting.getStream(0);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 1));
        vesting.vestedAmount(1);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 1));
        vesting.claimableAmount(1);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 1));
        vesting.effectiveEndTime(1);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 1));
        vesting.isOnBreak(1);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 1));
        vesting.getBreaks(1);
    }

    function test_Claim_RevertsUnknownStream() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 7));
        vesting.claim(7);
    }

    function test_VestedAmount_LinearNoBreaks() public {
        uint256 sid = _create();
        assertEq(vesting.vestedAmount(sid), 0);
        skip(25 days);
        assertEq(vesting.vestedAmount(sid), 25 days * RATE);
        assertEq(vesting.claimableAmount(sid), 25 days * RATE);
        skip(75 days);
        assertEq(vesting.vestedAmount(sid), TOTAL);
        skip(500 days);
        assertEq(vesting.vestedAmount(sid), TOTAL);
    }

    // ── claim ────────────────────────────────────────────────────────────────

    function test_Claim_HappyPath() public {
        uint256 sid = _create();
        skip(50 days);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 50 days * RATE);
        assertEq(vesting.getStream(sid).claimedAmount, 50 days * RATE);
        assertEq(vesting.claimableAmount(sid), 0);

        skip(10 days);
        assertEq(vesting.claimableAmount(sid), 10 days * RATE);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 60 days * RATE);
    }

    function test_Claim_EmitsClaimed() public {
        uint256 sid = _create();
        skip(10 days);
        vm.expectEmit(true, true, false, true, address(vesting));
        emit VestingStreamV2.Claimed(sid, alice, 10 days * RATE);
        _claim(sid);
    }

    function test_Claim_FullAfterEnd() public {
        uint256 sid = _create();
        skip(DURATION + 1);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), TOTAL);
        assertEq(usdc.balanceOf(address(vesting)), 0);
    }

    function test_Claim_RevertsNotBeneficiary() public {
        uint256 sid = _create();
        skip(1 days);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotBeneficiary.selector);
        vesting.claim(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.NotBeneficiary.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertsNothingToClaimAtStart() public {
        uint256 sid = _create();
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NothingToClaim.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertsNothingToClaimTwiceSameBlock() public {
        uint256 sid = _create();
        skip(1 days);
        _claim(sid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NothingToClaim.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertsAfterCancel() public {
        uint256 sid = _create();
        skip(1 days);
        _cancel(sid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.claim(sid);
    }

    // ── cancel ───────────────────────────────────────────────────────────────

    function test_Cancel_HappyPath() public {
        uint256 sid = _create();
        skip(25 days);
        vm.expectEmit(true, false, false, true, address(vesting));
        emit VestingStreamV2.StreamCancelled(sid, 75 days * RATE, 25 days * RATE);
        _cancel(sid);

        VestingStreamV2.Stream memory s = vesting.getStream(sid);
        assertTrue(s.cancelled);
        assertEq(s.finalVested, 25 days * RATE);
        assertEq(vesting.pendingWithdrawals(alice), 25 days * RATE);
        assertEq(vesting.pendingWithdrawals(grantor), 75 days * RATE);
        // cancel only credits; no tokens leave until withdraw
        assertEq(usdc.balanceOf(address(vesting)), TOTAL);
        assertEq(vesting.claimableAmount(sid), 0);
    }

    function test_Cancel_AfterPartialClaimPaysOnlyRemainder() public {
        uint256 sid = _create();
        skip(10 days);
        _claim(sid);
        skip(20 days);
        _cancel(sid);
        assertEq(vesting.pendingWithdrawals(alice), 20 days * RATE);
        assertEq(vesting.pendingWithdrawals(grantor), 70 days * RATE);
        assertEq(usdc.balanceOf(alice), 10 days * RATE);
    }

    function test_Cancel_RevertsNotGrantor() public {
        uint256 sid = _create();
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.cancel(sid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.cancel(sid);
    }

    function test_Cancel_RevertsAlreadyCancelled() public {
        uint256 sid = _create();
        _cancel(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.cancel(sid);
    }

    function test_Cancel_RevertsUnknownStream() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 3));
        vesting.cancel(3);
    }

    function test_Cancel_ImmediatelyReturnsEverythingToGrantor() public {
        uint256 sid = _create();
        _cancel(sid);
        assertEq(vesting.pendingWithdrawals(alice), 0);
        assertEq(vesting.pendingWithdrawals(grantor), TOTAL);
    }

    function test_Cancel_AfterEndPaysAllToBeneficiary() public {
        uint256 sid = _create();
        skip(DURATION + 5 days);
        _cancel(sid);
        assertEq(vesting.pendingWithdrawals(alice), TOTAL);
        assertEq(vesting.pendingWithdrawals(grantor), 0);
    }

    function test_Cancel_VestedFrozenAfterCancel() public {
        uint256 sid = _create();
        skip(30 days);
        _cancel(sid);
        skip(40 days);
        assertEq(vesting.vestedAmount(sid), 30 days * RATE);
        assertEq(vesting.claimableAmount(sid), 0);
    }

    // ── withdraw ─────────────────────────────────────────────────────────────

    function test_Withdraw_BothSidesAfterCancel() public {
        uint256 sid = _create();
        skip(40 days);
        _cancel(sid);

        vm.expectEmit(true, false, false, true, address(vesting));
        emit VestingStreamV2.Withdrawn(alice, 40 days * RATE);
        vm.prank(alice);
        vesting.withdraw();
        assertEq(usdc.balanceOf(alice), 40 days * RATE);
        assertEq(vesting.pendingWithdrawals(alice), 0);

        vm.expectEmit(true, false, false, true, address(vesting));
        emit VestingStreamV2.Withdrawn(grantor, 60 days * RATE);
        vm.prank(grantor);
        vesting.withdraw();
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL + 60 days * RATE);
        assertEq(usdc.balanceOf(address(vesting)), 0);
    }

    function test_Withdraw_RevertsWhenNothingPending() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NothingToClaim.selector);
        vesting.withdraw();
    }

    function test_Withdraw_RevertsSecondTime() public {
        uint256 sid = _create();
        skip(10 days);
        _cancel(sid);
        vm.prank(alice);
        vesting.withdraw();
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NothingToClaim.selector);
        vesting.withdraw();
    }

    function test_Withdraw_AccumulatesAcrossStreams() public {
        uint256 s1 = _create();
        uint256 s2 = _create();
        skip(10 days);
        _cancel(s1);
        _cancel(s2);
        assertEq(vesting.pendingWithdrawals(alice), 20 days * RATE);
        vm.prank(alice);
        vesting.withdraw();
        assertEq(usdc.balanceOf(alice), 20 days * RATE);
    }

    // ── streamsOf ────────────────────────────────────────────────────────────

    function test_StreamsOf_DedupesSelfFundedStream() public {
        uint256 sid = _createFor(grantor, TOTAL, DURATION);
        uint256[] memory ids = vesting.streamsOf(grantor);
        assertEq(ids.length, 1);
        assertEq(ids[0], sid);
    }

    function test_StreamsOf_MergesInCreationOrderWithSelfStream() public {
        uint256 s1 = _createFor(alice, TOTAL, DURATION); // grantor -> alice
        uint256 s2 = _createFor(grantor, TOTAL, DURATION); // grantor -> grantor
        usdc.mint(bob, TOTAL);
        vm.startPrank(bob);
        usdc.approve(address(vesting), TOTAL);
        uint256 s3 = vesting.createStream(grantor, TOTAL, DURATION); // bob -> grantor
        vm.stopPrank();
        uint256 s4 = _createFor(bob, TOTAL, DURATION); // grantor -> bob

        uint256[] memory g = vesting.streamsOf(grantor);
        assertEq(g.length, 4);
        assertEq(g[0], s1);
        assertEq(g[1], s2);
        assertEq(g[2], s3);
        assertEq(g[3], s4);

        uint256[] memory a = vesting.streamsOf(alice);
        assertEq(a.length, 1);
        assertEq(a[0], s1);

        uint256[] memory b = vesting.streamsOf(bob);
        assertEq(b.length, 2);
        assertEq(b[0], s3);
        assertEq(b[1], s4);

        assertEq(vesting.streamsOf(attacker).length, 0);
    }

    function test_SelfFundedStream_BeneficiaryIsGrantorCanClaimAndCancel() public {
        uint256 sid = _createFor(grantor, TOTAL, DURATION);
        skip(10 days);
        vm.prank(grantor);
        vesting.claim(sid);
        assertEq(usdc.balanceOf(grantor), SEED - TOTAL + 10 days * RATE);
        skip(10 days);
        _cancel(sid);
        // both credits land on the same wallet
        assertEq(vesting.pendingWithdrawals(grantor), 90 days * RATE);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2} from "../VestingStreamV2.sol";
import {VestingStreamV2TestBase} from "./VestingStreamV2.Base.t.sol";

/// @dev requestLeave / approveLeave / rejectLeave / cancelLeaveRequest / finalizeLeave.
contract VestingStreamV2LeaveTest is VestingStreamV2TestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create();
    }

    // ── requestLeave: happy ──────────────────────────────────────────────────

    function test_RequestLeave_HappyPath() public {
        vm.expectEmit(true, true, false, true, address(vesting));
        emit VestingStreamV2.LeaveRequested(1, sid, uint64(T0 + 1 days), uint64(T0 + 3 days), "sick");
        vm.prank(alice);
        uint256 rid = vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 3 days), "sick");

        assertEq(rid, 1);
        VestingStreamV2.LeaveRequest memory r = vesting.getLeaveRequest(rid);
        assertEq(r.streamId, sid);
        assertEq(r.start, T0 + 1 days);
        assertEq(r.end, T0 + 3 days);
        assertEq(r.requestedAt, T0);
        assertEq(uint8(r.status), uint8(VestingStreamV2.LeaveStatus.Pending));
        assertEq(r.reason, "sick");
        assertEq(vesting.pendingLeaveCount(sid), 1);
        uint256[] memory ids = vesting.getLeaveRequestIds(sid);
        assertEq(ids.length, 1);
        assertEq(ids[0], rid);
        // requesting has no effect on vesting
        assertEq(vesting.getBreaks(sid).length, 0);
    }

    function test_RequestLeave_ReasonExactly140BytesOk() public {
        vm.prank(alice);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), _str(140));
        assertEq(vesting.pendingLeaveCount(sid), 1);
    }

    function test_RequestLeave_StartInPastAllowed() public {
        skip(10 days);
        vm.prank(alice);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 20 days), "late");
        assertEq(vesting.pendingLeaveCount(sid), 1);
    }

    // ── requestLeave: reverts ────────────────────────────────────────────────

    function test_RequestLeave_RevertsNotBeneficiary() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.NotBeneficiary.selector);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotBeneficiary.selector);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");
    }

    function test_RequestLeave_RevertsUnknownStream() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 9));
        vesting.requestLeave(9, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");
    }

    function test_RequestLeave_RevertsInvalidPeriod() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.InvalidLeavePeriod.selector);
        vesting.requestLeave(sid, uint64(T0 + 2 days), uint64(T0 + 2 days), "x");
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.InvalidLeavePeriod.selector);
        vesting.requestLeave(sid, uint64(T0 + 3 days), uint64(T0 + 2 days), "x");
    }

    function test_RequestLeave_RevertsStartAtOrAfterEffectiveEnd() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.LeaveStartsAfterStreamEnd.selector);
        vesting.requestLeave(sid, uint64(T0 + DURATION), uint64(T0 + DURATION + 1 days), "x");
        // one second before end is still allowed
        vm.prank(alice);
        vesting.requestLeave(sid, uint64(T0 + DURATION - 1), uint64(T0 + DURATION + 1 days), "x");
    }

    function test_RequestLeave_EffectiveEndShiftsAllowedStart() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        // start == original end is now before effective end -> ok
        vm.prank(alice);
        vesting.requestLeave(sid, uint64(T0 + DURATION + 5 days), uint64(T0 + DURATION + 6 days), "x");
        // start == effective end -> revert
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.LeaveStartsAfterStreamEnd.selector);
        vesting.requestLeave(sid, uint64(T0 + DURATION + 10 days), uint64(T0 + DURATION + 11 days), "x");
    }

    function test_RequestLeave_RevertsReasonTooLong() public {
        string memory long = _str(141);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.ReasonTooLong.selector);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), long);
    }

    function test_RequestLeave_RevertsOnCancelledStream() public {
        _cancel(sid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");
    }

    function test_RequestLeave_PendingCapIsFive() public {
        for (uint256 i = 0; i < 5; ++i) {
            _request(sid, T0 + 1 days, T0 + 2 days);
        }
        assertEq(vesting.pendingLeaveCount(sid), 5);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.TooManyPendingRequests.selector);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");

        // freeing a slot (cancel) allows another request
        vm.prank(alice);
        vesting.cancelLeaveRequest(1);
        _request(sid, T0 + 1 days, T0 + 2 days);
        assertEq(vesting.pendingLeaveCount(sid), 5);
    }

    function test_RequestLeave_PendingCapIsPerStream() public {
        uint256 sid2 = _create();
        for (uint256 i = 0; i < 5; ++i) {
            _request(sid, T0 + 1 days, T0 + 2 days);
        }
        _request(sid2, T0 + 1 days, T0 + 2 days);
        assertEq(vesting.pendingLeaveCount(sid2), 1);
    }

    function test_RequestLeave_LifetimeCapIs40() public {
        vm.startPrank(alice);
        for (uint256 i = 0; i < 40; ++i) {
            uint256 rid = vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");
            vesting.cancelLeaveRequest(rid);
        }
        assertEq(vesting.pendingLeaveCount(sid), 0);
        assertEq(vesting.getLeaveRequestIds(sid).length, 40);
        vm.expectRevert(VestingStreamV2.TooManyRequests.selector);
        vesting.requestLeave(sid, uint64(T0 + 1 days), uint64(T0 + 2 days), "x");
        vm.stopPrank();
    }

    // ── approveLeave ─────────────────────────────────────────────────────────

    function test_ApproveLeave_HappyPath() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.expectEmit(true, true, false, true, address(vesting));
        emit VestingStreamV2.BreakAdded(sid, uint64(T0 + 2 days), uint64(T0 + 5 days), rid, 3 days, T0 + DURATION + 3 days);
        vm.expectEmit(true, true, true, false, address(vesting));
        emit VestingStreamV2.LeaveApproved(rid, sid, grantor);
        _approve(rid);

        assertEq(uint8(vesting.getLeaveRequest(rid).status), uint8(VestingStreamV2.LeaveStatus.Approved));
        assertEq(vesting.pendingLeaveCount(sid), 0);
        VestingStreamV2.Break[] memory b = vesting.getBreaks(sid);
        assertEq(b.length, 1);
        assertEq(b[0].start, T0 + 2 days);
        assertEq(b[0].end, T0 + 5 days);
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION + 3 days);
    }

    function test_ApproveLeave_RevertsNotGrantor() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.approveLeave(rid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.approveLeave(rid);
    }

    function test_ApproveLeave_RevertsUnknownAndNotPending() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.LeaveRequestNotFound.selector, 0));
        vesting.approveLeave(0);
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.LeaveRequestNotFound.selector, 1));
        vesting.approveLeave(1);

        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        _approve(rid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.LeaveNotPending.selector);
        vesting.approveLeave(rid);
    }

    function test_ApproveLeave_RevertsWhenLeaveAlreadyEnded() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 2 days);
        skip(2 days); // now == end -> nothing remaining
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.LeaveAlreadyEnded.selector);
        vesting.approveLeave(rid);
    }

    function test_ApproveLeave_RevertsOnCancelledStream() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        _cancel(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.approveLeave(rid);
    }

    function test_ApproveLeave_RevertsOnOverlapWithExistingBreak() public {
        uint256 r1 = _request(sid, T0 + 2 days, T0 + 5 days);
        uint256 r2 = _request(sid, T0 + 4 days, T0 + 8 days);
        _approve(r1);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.BreakOverlap.selector);
        vesting.approveLeave(r2);
        // failed approve leaves request pending
        assertEq(uint8(vesting.getLeaveRequest(r2).status), uint8(VestingStreamV2.LeaveStatus.Pending));
        assertEq(vesting.pendingLeaveCount(sid), 1);
    }

    function test_ApproveLeave_RevertsBreakTooLong() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 60 days); // 59 days > 50
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.BreakTooLong.selector);
        vesting.approveLeave(rid);
    }

    // ── clamping start to now ────────────────────────────────────────────────

    function test_Approve_ClampsPastStartToNow_NoRetroactiveEffect() public {
        uint256 rid = _request(sid, T0 + 5 days, T0 + 30 days);
        skip(20 days);
        uint256 vestedBefore = vesting.vestedAmount(sid);
        assertEq(vestedBefore, 20 days * RATE);

        vm.expectEmit(true, true, true, true, address(vesting));
        emit VestingStreamV2.BreakAdded(sid, uint64(T0 + 20 days), uint64(T0 + 30 days), rid, 10 days, T0 + DURATION + 10 days);
        _approve(rid);

        // no retroactive effect
        assertEq(vesting.vestedAmount(sid), vestedBefore);
        VestingStreamV2.Break[] memory b = vesting.getBreaks(sid);
        assertEq(b[0].start, T0 + 20 days); // clamped
        assertEq(b[0].end, T0 + 30 days);
        assertEq(vesting.getStream(sid).totalBreakTime, 10 days); // only the remaining portion counts
        // original request data untouched
        assertEq(vesting.getLeaveRequest(rid).start, T0 + 5 days);

        // frozen for the remaining leave, then resumes
        skip(5 days);
        assertEq(vesting.vestedAmount(sid), 20 days * RATE);
        assertTrue(vesting.isOnBreak(sid));
        skip(10 days); // T0+35d: 5 days after break ended
        assertEq(vesting.vestedAmount(sid), 25 days * RATE);
        assertFalse(vesting.isOnBreak(sid));
    }

    function test_Approve_FutureStartNotClamped() public {
        uint256 rid = _request(sid, T0 + 5 days, T0 + 6 days);
        skip(1 days);
        _approve(rid);
        assertEq(vesting.getBreaks(sid)[0].start, T0 + 5 days);
    }

    // ── rejectLeave ──────────────────────────────────────────────────────────

    function test_RejectLeave_HappyPath() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.expectEmit(true, true, false, false, address(vesting));
        emit VestingStreamV2.LeaveRejected(rid, sid);
        vm.prank(grantor);
        vesting.rejectLeave(rid);
        assertEq(uint8(vesting.getLeaveRequest(rid).status), uint8(VestingStreamV2.LeaveStatus.Rejected));
        assertEq(vesting.pendingLeaveCount(sid), 0);
        assertEq(vesting.getBreaks(sid).length, 0);
    }

    function test_RejectLeave_RevertsNotGrantor() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.rejectLeave(rid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.rejectLeave(rid);
    }

    function test_RejectLeave_RevertsNotPendingAndUnknown() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.LeaveRequestNotFound.selector, 5));
        vesting.rejectLeave(5);
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.startPrank(grantor);
        vesting.rejectLeave(rid);
        vm.expectRevert(VestingStreamV2.LeaveNotPending.selector);
        vesting.rejectLeave(rid);
        vm.stopPrank();
    }

    function test_RejectLeave_AllowedOnCancelledStream() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        _cancel(sid);
        vm.prank(grantor);
        vesting.rejectLeave(rid);
        assertEq(vesting.pendingLeaveCount(sid), 0);
    }

    // ── cancelLeaveRequest ───────────────────────────────────────────────────

    function test_CancelLeaveRequest_HappyPath() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.expectEmit(true, true, false, false, address(vesting));
        emit VestingStreamV2.LeaveRequestCancelled(rid, sid);
        vm.prank(alice);
        vesting.cancelLeaveRequest(rid);
        assertEq(uint8(vesting.getLeaveRequest(rid).status), uint8(VestingStreamV2.LeaveStatus.Cancelled));
        assertEq(vesting.pendingLeaveCount(sid), 0);
        // cancelled request cannot later be approved
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.LeaveNotPending.selector);
        vesting.approveLeave(rid);
    }

    function test_CancelLeaveRequest_RevertsNotBeneficiary() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.NotBeneficiary.selector);
        vesting.cancelLeaveRequest(rid);
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotBeneficiary.selector);
        vesting.cancelLeaveRequest(rid);
    }

    function test_CancelLeaveRequest_RevertsNotPendingAndUnknown() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.LeaveRequestNotFound.selector, 3));
        vesting.cancelLeaveRequest(3);
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        _approve(rid);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.LeaveNotPending.selector);
        vesting.cancelLeaveRequest(rid);
    }

    function test_CancelLeaveRequest_AllowedOnCancelledStream() public {
        uint256 rid = _request(sid, T0 + 2 days, T0 + 5 days);
        _cancel(sid);
        vm.prank(alice);
        vesting.cancelLeaveRequest(rid);
        assertEq(vesting.pendingLeaveCount(sid), 0);
    }

    // ── finalizeLeave ────────────────────────────────────────────────────────

    function test_FinalizeLeave_RevertsTooEarly() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 5 days);
        skip(7 days - 1);
        vm.prank(bob);
        vm.expectRevert(VestingStreamV2.AutoApproveTooEarly.selector);
        vesting.finalizeLeave(rid);
    }

    function test_FinalizeLeave_RevertsOverFourteenDays() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 1 days + 14 days + 1);
        skip(7 days);
        vm.prank(bob);
        vm.expectRevert(VestingStreamV2.AutoApproveLeaveTooLong.selector);
        vesting.finalizeLeave(rid);
    }

    function test_FinalizeLeave_SuccessByThirdParty() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 10 days);
        skip(7 days);
        vm.expectEmit(true, true, true, true, address(vesting));
        emit VestingStreamV2.BreakAdded(sid, uint64(T0 + 7 days), uint64(T0 + 10 days), rid, 3 days, T0 + DURATION + 3 days);
        vm.expectEmit(true, true, true, false, address(vesting));
        emit VestingStreamV2.LeaveApproved(rid, sid, bob);
        vm.prank(bob);
        vesting.finalizeLeave(rid);

        assertEq(uint8(vesting.getLeaveRequest(rid).status), uint8(VestingStreamV2.LeaveStatus.Approved));
        assertEq(vesting.pendingLeaveCount(sid), 0);
        assertEq(vesting.getBreaks(sid)[0].start, T0 + 7 days); // clamped to now
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION + 3 days);
        assertEq(vesting.vestedAmount(sid), 7 days * RATE); // no retroactive effect
    }

    function test_FinalizeLeave_ExactlyFourteenDaysOk() public {
        uint256 rid = _request(sid, T0 + 7 days, T0 + 21 days);
        skip(7 days);
        vm.prank(attacker);
        vesting.finalizeLeave(rid);
        assertEq(vesting.getStream(sid).totalBreakTime, 14 days);
    }

    function test_FinalizeLeave_RevertsWhenLeaveAlreadyEnded() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 3 days);
        skip(7 days);
        vm.prank(bob);
        vm.expectRevert(VestingStreamV2.LeaveAlreadyEnded.selector);
        vesting.finalizeLeave(rid);
    }

    function test_FinalizeLeave_RevertsNotPendingAndUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.LeaveRequestNotFound.selector, 1));
        vesting.finalizeLeave(1);
        uint256 rid = _request(sid, T0 + 1 days, T0 + 20 days);
        vm.prank(grantor);
        vesting.rejectLeave(rid);
        skip(7 days);
        vm.expectRevert(VestingStreamV2.LeaveNotPending.selector);
        vesting.finalizeLeave(rid);
    }

    function test_FinalizeLeave_RevertsOnCancelledStream() public {
        uint256 rid = _request(sid, T0 + 1 days, T0 + 10 days);
        _cancel(sid);
        skip(7 days);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.finalizeLeave(rid);
    }

    function test_FinalizeLeave_StillEnforcesBreakCaps() public {
        _schedule(sid, T0 + 10 days, T0 + 55 days); // 45 days used
        uint256 rid = _request(sid, T0 + 60 days, T0 + 70 days); // +10 -> 55 > 50
        skip(7 days);
        vm.expectRevert(VestingStreamV2.BreakTooLong.selector);
        vesting.finalizeLeave(rid);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2} from "../VestingStreamV2.sol";
import {VestingStreamV2TestBase} from "./VestingStreamV2.Base.t.sol";

/// @dev scheduleBreak rules, sorted insertion, vesting around breaks, cancel around breaks.
contract VestingStreamV2BreaksTest is VestingStreamV2TestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create();
    }

    // ── scheduleBreak: happy / events ────────────────────────────────────────

    function test_ScheduleBreak_HappyPathAndEvent() public {
        vm.expectEmit(true, true, false, true, address(vesting));
        emit VestingStreamV2.BreakAdded(sid, uint64(T0 + 10 days), uint64(T0 + 20 days), 0, 10 days, T0 + DURATION + 10 days);
        _schedule(sid, T0 + 10 days, T0 + 20 days);

        VestingStreamV2.Break[] memory b = vesting.getBreaks(sid);
        assertEq(b.length, 1);
        assertEq(b[0].start, T0 + 10 days);
        assertEq(b[0].end, T0 + 20 days);
        VestingStreamV2.Stream memory s = vesting.getStream(sid);
        assertEq(s.totalBreakTime, 10 days);
        assertEq(s.endTime, T0 + DURATION); // original end preserved
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION + 10 days);
    }

    // ── notice / access ──────────────────────────────────────────────────────

    function test_ScheduleBreak_NoticeExactlyOneDayOk() public {
        _schedule(sid, block.timestamp + 1 days, block.timestamp + 2 days);
        assertEq(vesting.getBreaks(sid).length, 1);
    }

    function test_ScheduleBreak_RevertsNoticeTooShort() public {
        uint64 s = uint64(block.timestamp + 1 days - 1);
        uint64 e = uint64(block.timestamp + 3 days);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.NoticeTooShort.selector);
        vesting.scheduleBreak(sid, s, e, "");
    }

    function test_ScheduleBreak_NoticeMeasuredFromCurrentTime() public {
        skip(10 days);
        uint64 s = uint64(T0 + 10 days + 1 days - 1);
        uint64 e = uint64(T0 + 15 days);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.NoticeTooShort.selector);
        vesting.scheduleBreak(sid, s, e, "");
    }

    function test_ScheduleBreak_RevertsNotGrantor() public {
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 5 days), uint64(T0 + 6 days), "");
        vm.prank(attacker);
        vm.expectRevert(VestingStreamV2.NotGrantor.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 5 days), uint64(T0 + 6 days), "");
    }

    function test_ScheduleBreak_RevertsUnknownStream() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStreamV2.StreamNotFound.selector, 4));
        vesting.scheduleBreak(4, uint64(T0 + 5 days), uint64(T0 + 6 days), "");
    }

    function test_ScheduleBreak_RevertsOnCancelledStream() public {
        _cancel(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 5 days), uint64(T0 + 6 days), "");
    }

    function test_ScheduleBreak_RevertsReasonTooLong() public {
        string memory long = _str(141);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.ReasonTooLong.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 5 days), uint64(T0 + 6 days), long);
        // 140 bytes ok
        vm.prank(grantor);
        vesting.scheduleBreak(sid, uint64(T0 + 5 days), uint64(T0 + 6 days), _str(140));
    }

    function test_ScheduleBreak_RevertsInvalidPeriod() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.InvalidLeavePeriod.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 5 days), uint64(T0 + 5 days), "");
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.InvalidLeavePeriod.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 6 days), uint64(T0 + 5 days), "");
    }

    function test_ScheduleBreak_RevertsStartAtOrAfterEffectiveEnd() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.LeaveStartsAfterStreamEnd.selector);
        vesting.scheduleBreak(sid, uint64(T0 + DURATION), uint64(T0 + DURATION + 1 days), "");
        // after a break extends the end, a later start becomes legal
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        _schedule(sid, T0 + DURATION + 5 days, T0 + DURATION + 6 days);
        assertEq(vesting.getBreaks(sid).length, 2);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.LeaveStartsAfterStreamEnd.selector);
        vesting.scheduleBreak(sid, uint64(T0 + DURATION + 11 days), uint64(T0 + DURATION + 12 days), "");
    }

    // ── overlap / caps ───────────────────────────────────────────────────────

    function test_ScheduleBreak_RevertsOverlap() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        uint64[2][5] memory cases = [
            [uint64(T0 + 5 days), uint64(T0 + 11 days)], // overlaps head
            [uint64(T0 + 19 days), uint64(T0 + 25 days)], // overlaps tail
            [uint64(T0 + 12 days), uint64(T0 + 15 days)], // inside
            [uint64(T0 + 5 days), uint64(T0 + 25 days)], // encloses
            [uint64(T0 + 10 days), uint64(T0 + 20 days)] // identical
        ];
        for (uint256 i = 0; i < cases.length; ++i) {
            vm.prank(grantor);
            vm.expectRevert(VestingStreamV2.BreakOverlap.selector);
            vesting.scheduleBreak(sid, cases[i][0], cases[i][1], "");
        }
        assertEq(vesting.getBreaks(sid).length, 1);
    }

    function test_ScheduleBreak_AdjacentBreaksAllowed() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        _schedule(sid, T0 + 20 days, T0 + 25 days);
        _schedule(sid, T0 + 5 days, T0 + 10 days);
        assertEq(vesting.getBreaks(sid).length, 3);
        assertEq(vesting.getStream(sid).totalBreakTime, 20 days);
    }

    function test_ScheduleBreak_TwelveBreakCap() public {
        for (uint256 i = 0; i < 12; ++i) {
            _schedule(sid, T0 + 1 days + i * 2 days, T0 + 2 days + i * 2 days);
        }
        assertEq(vesting.getBreaks(sid).length, 12);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.TooManyBreaks.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 40 days), uint64(T0 + 41 days), "");
    }

    function test_ScheduleBreak_TotalCapFiftyPercentBoundary() public {
        _schedule(sid, T0 + 1 days, T0 + 51 days); // exactly 50 days == 50%
        assertEq(vesting.getStream(sid).totalBreakTime, 50 days);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.BreakTooLong.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 60 days), uint64(T0 + 60 days + 1), "");
    }

    function test_ScheduleBreak_SingleBreakOverCapReverts() public {
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.BreakTooLong.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 1 days), uint64(T0 + 51 days + 1), "");
    }

    function test_ScheduleBreak_CumulativeCap() public {
        _schedule(sid, T0 + 1 days, T0 + 31 days); // 30
        _schedule(sid, T0 + 40 days, T0 + 60 days); // 20 -> 50 ok
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.BreakTooLong.selector);
        vesting.scheduleBreak(sid, uint64(T0 + 70 days), uint64(T0 + 70 days + 1), "");
    }

    // ── sorted insertion ─────────────────────────────────────────────────────

    function test_ScheduleBreak_OutOfOrderInsertionIsSorted() public {
        uint256[4] memory starts = [T0 + 30 days, T0 + 10 days, T0 + 20 days, T0 + 5 days];
        for (uint256 i = 0; i < starts.length; ++i) {
            _schedule(sid, starts[i], starts[i] + 1 days);
        }
        // and one inserted in the very front and very back
        _schedule(sid, T0 + 2 days, T0 + 3 days);
        _schedule(sid, T0 + 60 days, T0 + 61 days);

        VestingStreamV2.Break[] memory b = vesting.getBreaks(sid);
        assertEq(b.length, 6);
        uint256[6] memory expected = [T0 + 2 days, T0 + 5 days, T0 + 10 days, T0 + 20 days, T0 + 30 days, T0 + 60 days];
        for (uint256 i = 0; i < 6; ++i) {
            assertEq(b[i].start, expected[i]);
            assertEq(b[i].end, expected[i] + 1 days);
        }
    }

    function test_OutOfOrderBreaks_VestingMatchesSortedModel() public {
        _schedule(sid, T0 + 30 days, T0 + 32 days);
        _schedule(sid, T0 + 10 days, T0 + 15 days);
        _schedule(sid, T0 + 20 days, T0 + 21 days);
        // total break = 8 days
        vm.warp(T0 + 12 days);
        assertEq(vesting.vestedAmount(sid), 10 days * RATE);
        vm.warp(T0 + 17 days); // 12d elapsed active, 5d break
        assertEq(vesting.vestedAmount(sid), 12 days * RATE);
        vm.warp(T0 + 31 days); // minus 5+1+1
        assertEq(vesting.vestedAmount(sid), 24 days * RATE);
        vm.warp(T0 + 40 days); // minus 5+1+2
        assertEq(vesting.vestedAmount(sid), 32 days * RATE);
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION + 8 days);
    }

    // ── vesting frozen during break, resume, effective end ───────────────────

    function test_Vesting_FrozenDuringBreakAndResumes() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        vm.warp(T0 + 9 days);
        assertEq(vesting.vestedAmount(sid), 9 days * RATE);
        assertFalse(vesting.isOnBreak(sid));
        vm.warp(T0 + 10 days);
        assertEq(vesting.vestedAmount(sid), 10 days * RATE);
        assertTrue(vesting.isOnBreak(sid));
        vm.warp(T0 + 15 days);
        assertEq(vesting.vestedAmount(sid), 10 days * RATE);
        assertTrue(vesting.isOnBreak(sid));
        vm.warp(T0 + 20 days - 1);
        assertEq(vesting.vestedAmount(sid), 10 days * RATE);
        vm.warp(T0 + 20 days);
        assertEq(vesting.vestedAmount(sid), 10 days * RATE);
        assertFalse(vesting.isOnBreak(sid)); // end exclusive
        vm.warp(T0 + 25 days);
        assertEq(vesting.vestedAmount(sid), 15 days * RATE);
    }

    function test_Vesting_FullyVestedExactlyAtEffectiveEnd() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        uint256 eff = vesting.effectiveEndTime(sid);
        assertEq(eff, T0 + DURATION + 10 days);
        vm.warp(eff - 1);
        assertEq(vesting.vestedAmount(sid), TOTAL - RATE);
        vm.warp(eff);
        assertEq(vesting.vestedAmount(sid), TOTAL);
        vm.warp(eff + 365 days);
        assertEq(vesting.vestedAmount(sid), TOTAL);
        // original end no longer fully vests
        vm.warp(T0 + DURATION);
        assertEq(vesting.vestedAmount(sid), (DURATION - 10 days) * RATE);
    }

    function test_Claim_ZeroDuringBreakThenResumes() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        vm.warp(T0 + 10 days);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 10 days * RATE);
        vm.warp(T0 + 15 days);
        assertEq(vesting.claimableAmount(sid), 0);
        vm.prank(alice);
        vm.expectRevert(VestingStreamV2.NothingToClaim.selector);
        vesting.claim(sid);
        vm.warp(T0 + 22 days);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 12 days * RATE);
    }

    function test_ClaimedNeverExceedsVested_AfterAddingBreak() public {
        vm.warp(T0 + 8 days);
        _claim(sid);
        _schedule(sid, T0 + 9 days, T0 + 19 days);
        uint256[5] memory ts = [T0 + 8 days, T0 + 9 days, T0 + 15 days, T0 + 19 days, T0 + 25 days];
        for (uint256 i = 0; i < ts.length; ++i) {
            vm.warp(ts[i]);
            assertLe(vesting.getStream(sid).claimedAmount, vesting.vestedAmount(sid));
        }
        vm.warp(T0 + 25 days);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 15 days * RATE);
    }

    function test_ClaimedNeverExceedsVested_AfterApprovedLeaveStartingNow() public {
        vm.warp(T0 + 30 days);
        _claim(sid);
        uint256 rid = _request(sid, T0 + 25 days, T0 + 40 days);
        _approve(rid);
        assertEq(vesting.claimableAmount(sid), 0);
        assertEq(vesting.getStream(sid).claimedAmount, vesting.vestedAmount(sid));
        vm.warp(T0 + 35 days);
        assertEq(vesting.claimableAmount(sid), 0);
        vm.warp(T0 + 45 days);
        assertEq(vesting.claimableAmount(sid), 5 days * RATE);
    }

    // ── cancel before / during / after a break ───────────────────────────────

    function _cancelAt(uint256 ts, uint256 paid) internal {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        vm.warp(ts);
        vm.expectEmit(true, false, false, true, address(vesting));
        emit VestingStreamV2.StreamCancelled(sid, TOTAL - paid, paid);
        _cancel(sid);
        assertEq(vesting.pendingWithdrawals(alice), paid);
        assertEq(vesting.pendingWithdrawals(grantor), TOTAL - paid);
        assertEq(vesting.claimableAmount(sid), 0);

        // everything is frozen forever afterwards
        vm.warp(T0 + 400 days);
        assertEq(vesting.vestedAmount(sid), paid);
        assertEq(vesting.claimableAmount(sid), 0);
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION + 10 days);
        assertFalse(vesting.isOnBreak(sid));

        vm.prank(alice);
        vesting.withdraw();
        assertEq(usdc.balanceOf(alice), paid);
    }

    function test_Cancel_BeforeBreak() public {
        _cancelAt(T0 + 5 days, 5 days * RATE);
    }

    function test_Cancel_DuringBreak() public {
        _cancelAt(T0 + 15 days, 10 days * RATE);
    }

    function test_Cancel_AfterBreak() public {
        _cancelAt(T0 + 30 days, 20 days * RATE);
    }

    function test_Cancel_DuringBreakAfterPartialClaim() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        vm.warp(T0 + 5 days);
        _claim(sid);
        vm.warp(T0 + 15 days);
        _cancel(sid);
        assertEq(vesting.pendingWithdrawals(alice), 5 days * RATE);
        assertEq(vesting.pendingWithdrawals(grantor), 90 days * RATE);
        assertEq(usdc.balanceOf(alice) + vesting.pendingWithdrawals(alice) + vesting.pendingWithdrawals(grantor), TOTAL);
    }

    function test_Cancel_AfterEffectiveEndPaysAllToBeneficiary() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        vm.warp(T0 + DURATION + 10 days);
        _cancel(sid);
        assertEq(vesting.pendingWithdrawals(alice), TOTAL);
        assertEq(vesting.pendingWithdrawals(grantor), 0);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.NothingToClaim.selector);
        vesting.withdraw();
    }

    function test_Cancel_PendingLeaveRequestCanStillBeResolvedButNotApproved() public {
        _schedule(sid, T0 + 10 days, T0 + 20 days);
        uint256 rid = _request(sid, T0 + 30 days, T0 + 31 days);
        _cancel(sid);
        assertEq(vesting.pendingLeaveCount(sid), 1); // cancellation does not auto-resolve
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2.AlreadyCancelled.selector);
        vesting.approveLeave(rid);
    }
}

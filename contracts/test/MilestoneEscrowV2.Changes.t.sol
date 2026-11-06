// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowV2TestBase} from "./MilestoneEscrowV2.Base.t.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";

/// @dev requestChanges, resubmission, blocked payee/payer actions while ChangesRequested, escalate.
contract MilestoneEscrowV2ChangesTest is MilestoneEscrowV2TestBase {
    MilestoneEscrowV2.Status internal constant CR = MilestoneEscrowV2.Status.ChangesRequested;
    MilestoneEscrowV2.Status internal constant SUB = MilestoneEscrowV2.Status.Submitted;
    MilestoneEscrowV2.Status internal constant DIS = MilestoneEscrowV2.Status.Disputed;
    MilestoneEscrowV2.Status internal constant FUN = MilestoneEscrowV2.Status.Funded;

    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create(address(usdc), arbiter);
    }

    // ---------------------------------------------------------- requestChanges

    function test_Request_HappyPath_UpdatesState() public {
        _submit(id, 0);
        uint256 submittedAt = block.timestamp;
        skip(1 hours);
        uint256 unallocatedBefore = esc.unallocated(address(usdc));

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.ChangesRequested(id, 0, REASON, 1);
        vm.prank(payer);
        esc.requestChanges(id, 0, REASON);

        MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, 0);
        assertTrue(m.status == CR);
        assertEq(m.changeReason, REASON);
        assertEq(m.changesRequestedAt, block.timestamp);
        assertEq(m.revisions, 1);
        assertEq(m.submittedAt, submittedAt);
        assertEq(m.note, NOTE);
        assertEq(m.amount, A0);
        // funds stay outstanding, nothing moves
        assertEq(esc.unallocated(address(usdc)), unallocatedBefore);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(usdc.balanceOf(payee), 0);
    }

    function test_Request_OnlyAffectsTargetMilestone() public {
        _submit(id, 0);
        _submit(id, 1);
        _request(id, 0);
        assertTrue(_status(id, 0) == CR);
        assertTrue(_status(id, 1) == SUB);
        assertTrue(_status(id, 2) == FUN);
    }

    function test_Request_RevertsForNonPayer() public {
        _submit(id, 0);
        address[3] memory callers = [payee, arbiter, stranger];
        for (uint256 k; k < 3; ++k) {
            vm.prank(callers[k]);
            vm.expectRevert(_unauth(callers[k]));
            esc.requestChanges(id, 0, REASON);
        }
    }

    function test_Request_RevertsOnUnknownEscrowOrMilestone() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.EscrowNotFound.selector, 9));
        esc.requestChanges(9, 0, REASON);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.MilestoneNotFound.selector, id, 3));
        esc.requestChanges(id, 3, REASON);
    }

    function test_Request_RevertsFromFunded() public {
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, FUN));
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_RevertsFromChangesRequested() public {
        _submitAndRequest(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, CR));
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_RevertsFromDisputed() public {
        _submitAndDispute(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, DIS));
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_RevertsFromReleased() public {
        _submit(id, 0);
        _approve(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, MilestoneEscrowV2.Status.Released));
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_RevertsFromResolved() public {
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, 5);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, MilestoneEscrowV2.Status.Resolved));
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_RevertsFromRefunded() public {
        skip(DEADLINE_OFFSET + 1);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, MilestoneEscrowV2.Status.Refunded));
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_AllowedOneSecondBeforeWindowEnds() public {
        _submit(id, 0);
        skip(WINDOW - 1);
        _request(id, 0);
        assertTrue(_status(id, 0) == CR);
    }

    function test_Request_RejectedAtExactWindowEnd() public {
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowElapsed.selector);
        esc.requestChanges(id, 0, REASON);
        assertTrue(_status(id, 0) == SUB);
    }

    function test_Request_RejectedAfterWindowEnd() public {
        _submit(id, 0);
        skip(WINDOW + 5 days);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowElapsed.selector);
        esc.requestChanges(id, 0, REASON);
    }

    function test_Request_EmptyReasonReverts() public {
        _submit(id, 0);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.EmptyReason.selector);
        esc.requestChanges(id, 0, "");
        assertTrue(_status(id, 0) == SUB);
    }

    function test_Request_Reason280BytesAccepted() public {
        _submit(id, 0);
        string memory r = _bytesOf(280, "r");
        vm.prank(payer);
        esc.requestChanges(id, 0, r);
        assertEq(esc.getMilestone(id, 0).changeReason, r);
    }

    function test_Request_Reason281BytesReverts() public {
        _submit(id, 0);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ReasonTooLong.selector);
        esc.requestChanges(id, 0, _bytesOf(281, "r"));
        assertTrue(_status(id, 0) == SUB);
    }

    function test_Request_OneByteReasonAccepted() public {
        _submit(id, 0);
        vm.prank(payer);
        esc.requestChanges(id, 0, "x");
        assertEq(esc.getMilestone(id, 0).changeReason, "x");
    }

    function test_Request_RevisionCounterIncrementsAcrossCycles() public {
        for (uint8 r = 1; r <= 3; ++r) {
            _submit(id, 0);
            _request(id, 0);
            assertEq(esc.getMilestone(id, 0).revisions, r);
        }
        // counter is per milestone
        assertEq(esc.getMilestone(id, 1).revisions, 0);
    }

    function test_Request_FourthRequestRevertsRevisionLimit() public {
        for (uint256 r; r < 3; ++r) {
            _submit(id, 0);
            _request(id, 0);
        }
        _submit(id, 0);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.RevisionLimitReached.selector);
        esc.requestChanges(id, 0, REASON);
        assertTrue(_status(id, 0) == SUB);
        assertEq(esc.getMilestone(id, 0).revisions, 3);
        // another milestone still has its own allowance
        _submit(id, 1);
        _request(id, 1);
    }

    function test_Request_AfterLimit_PayerCanStillApprove() public {
        for (uint256 r; r < 3; ++r) {
            _submit(id, 0);
            _request(id, 0);
        }
        _submit(id, 0);
        _approve(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
    }

    function test_Request_AfterLimit_PayerCanStillDispute() public {
        for (uint256 r; r < 3; ++r) {
            _submit(id, 0);
            _request(id, 0);
        }
        _submit(id, 0);
        _dispute(id, 0);
        assertTrue(_status(id, 0) == DIS);
    }

    function test_Request_AfterLimit_PayeeCanClaimAfterWindow() public {
        for (uint256 r; r < 3; ++r) {
            _submit(id, 0);
            _request(id, 0);
        }
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
    }

    // ---------------------------------------------------------------- resubmit

    function test_Resubmit_FromChangesRequested_EmitsAndStoresNewNote() public {
        _submitAndRequest(id, 0);
        skip(1 days);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneSubmitted(id, 0, "v2-link");
        vm.prank(payee);
        esc.submitMilestone(id, 0, "v2-link");

        MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, 0);
        assertTrue(m.status == SUB);
        assertEq(m.note, "v2-link");
        assertEq(m.submittedAt, block.timestamp);
        // earlier request metadata is retained
        assertEq(m.revisions, 1);
        assertEq(m.changeReason, REASON);
        assertGt(m.changesRequestedAt, 0);
    }

    function test_Resubmit_NoteTooLongReverts() public {
        _submitAndRequest(id, 0);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrowV2.NoteTooLong.selector);
        esc.submitMilestone(id, 0, _bytesOf(281, "n"));
        assertTrue(_status(id, 0) == CR);
    }

    function test_Resubmit_Note280Accepted() public {
        _submitAndRequest(id, 0);
        vm.prank(payee);
        esc.submitMilestone(id, 0, _bytesOf(280, "n"));
        assertTrue(_status(id, 0) == SUB);
    }

    function test_Resubmit_WrongCallerReverts() public {
        _submitAndRequest(id, 0);
        vm.prank(payer);
        vm.expectRevert(_unauth(payer));
        esc.submitMilestone(id, 0, NOTE);
    }

    function test_Resubmit_RestartsReviewWindow_ClaimTiming() public {
        _submit(id, 0);
        skip(WINDOW - 1);
        _request(id, 0);
        skip(2 days);
        _submit(id, 0); // fresh window starts here
        skip(WINDOW - 1);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowNotElapsed.selector);
        esc.claimAfterWindow(id, 0);
        skip(1);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
    }

    function test_Resubmit_RestartsReviewWindow_PayerCanRequestAgainLate() public {
        _submit(id, 0);
        _request(id, 0);
        skip(WINDOW + 1 days); // well past the first window
        _submit(id, 0);
        skip(WINDOW - 1);
        _request(id, 0); // still inside the second window
        assertEq(esc.getMilestone(id, 0).revisions, 2);
    }

    function test_Resubmit_RestartsReviewWindow_RejectedAtNewEnd() public {
        _submitAndRequest(id, 0);
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowElapsed.selector);
        esc.requestChanges(id, 0, REASON);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowElapsed.selector);
        esc.dispute(id, 0);
    }

    function test_Resubmit_PayerCanDisputeInsideNewWindow() public {
        _submitAndRequest(id, 0);
        skip(10 days);
        _submit(id, 0);
        skip(WINDOW - 1);
        _dispute(id, 0);
        assertTrue(_status(id, 0) == DIS);
    }

    function test_Resubmit_AfterDeadlineStillAllowed() public {
        _submitAndRequest(id, 0);
        skip(DEADLINE_OFFSET + 30 days);
        _submit(id, 0);
        assertTrue(_status(id, 0) == SUB);
    }

    // ----------------------------- actions rejected while ChangesRequested

    function test_CR_ClaimAfterWindowRejected_EvenAfterWindow() public {
        _submitAndRequest(id, 0);
        skip(WINDOW * 10);
        vm.prank(payee);
        vm.expectRevert(_badStatus(SUB, CR));
        esc.claimAfterWindow(id, 0);
    }

    function test_CR_ApproveRejected() public {
        _submitAndRequest(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, CR));
        esc.approveMilestone(id, 0);
    }

    function test_CR_DisputeRejected() public {
        _submitAndRequest(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(SUB, CR));
        esc.dispute(id, 0);
    }

    function test_CR_ResolveRejected() public {
        _submitAndRequest(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(_badStatus(DIS, CR));
        esc.resolve(id, 0, 1);
    }

    function test_CR_ResolveByTimeoutRejected() public {
        _submitAndRequest(id, 0);
        skip(365 days);
        vm.expectRevert(_badStatus(DIS, CR));
        esc.resolveByTimeout(id, 0);
    }

    // ---------------------------------------------------------------- escalate

    function test_Escalate_HappyPath_MovesToDisputed() public {
        _submitAndRequest(id, 0);
        skip(2 days);
        uint256 unallocatedBefore = esc.unallocated(address(usdc));

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneDisputed(id, 0);
        _escalate(id, 0);

        MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, 0);
        assertTrue(m.status == DIS);
        assertEq(m.disputedAt, block.timestamp);
        assertEq(m.revisions, 1);
        assertEq(esc.unallocated(address(usdc)), unallocatedBefore);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
    }

    function test_Escalate_RevertsForNonPayee() public {
        _submitAndRequest(id, 0);
        address[3] memory callers = [payer, arbiter, stranger];
        for (uint256 k; k < 3; ++k) {
            vm.prank(callers[k]);
            vm.expectRevert(_unauth(callers[k]));
            esc.escalate(id, 0);
        }
    }

    function test_Escalate_RevertsOnUnknownIds() public {
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.EscrowNotFound.selector, 7));
        esc.escalate(7, 0);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.MilestoneNotFound.selector, id, 5));
        esc.escalate(id, 5);
    }

    function test_Escalate_RevertsFromFunded() public {
        vm.prank(payee);
        vm.expectRevert(_badStatus(CR, FUN));
        esc.escalate(id, 0);
    }

    function test_Escalate_RevertsFromSubmitted() public {
        _submit(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(CR, SUB));
        esc.escalate(id, 0);
    }

    function test_Escalate_RevertsFromDisputed() public {
        _submitAndDispute(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(CR, DIS));
        esc.escalate(id, 0);
    }

    function test_Escalate_RevertsTwice() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(CR, DIS));
        esc.escalate(id, 0);
    }

    function test_Escalate_NoArbiter_RevertsArbiterAbsent() public {
        uint256 id2 = _create(address(usdc), address(0));
        _submitAndRequest(id2, 0);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrowV2.ArbiterAbsent.selector);
        esc.escalate(id2, 0);
        assertTrue(_status(id2, 0) == CR);
    }

    function test_Escalate_AllowedLongAfterRequest() public {
        _submitAndRequest(id, 0);
        skip(DEADLINE_OFFSET + 100 days);
        _escalate(id, 0);
        assertTrue(_status(id, 0) == DIS);
    }

    function test_Escalate_ThenArbiterResolves() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneResolved(id, 0, 70e6, A0 - 70e6);
        vm.prank(arbiter);
        esc.resolve(id, 0, 70e6);

        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Resolved);
        assertEq(esc.creditOf(payee, address(usdc)), 70e6);
        assertEq(esc.creditOf(payer, address(usdc)), A0 - 70e6);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
    }

    function test_Escalate_ResolveRejectsOverAmount() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidPayeeAmount.selector, A0 + 1, A0));
        esc.resolve(id, 0, A0 + 1);
    }

    function test_Escalate_ThenResolveByTimeoutAfter30DaysFromEscalation() public {
        _submitAndRequest(id, 0);
        skip(5 days);
        _escalate(id, 0); // timeout is measured from escalation, not from the request
        skip(30 days - 1);
        vm.expectRevert(MilestoneEscrowV2.DisputeTimeoutNotElapsed.selector);
        esc.resolveByTimeout(id, 0);
        skip(1);
        vm.prank(stranger);
        esc.resolveByTimeout(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Resolved);
        assertEq(esc.creditOf(payee, address(usdc)), A0 / 2);
        assertEq(esc.creditOf(payer, address(usdc)), A0 - A0 / 2);
    }

    function test_Escalate_OddAmountTimeoutPayerGetsExtraUnit() public {
        _submitAndRequest(id, 2); // A2 is odd
        _escalate(id, 2);
        skip(30 days);
        esc.resolveByTimeout(id, 2);
        assertEq(esc.creditOf(payee, address(usdc)), A2 / 2);
        assertEq(esc.creditOf(payer, address(usdc)), A2 - A2 / 2);
    }

    function test_Escalate_AfterEscalation_PayeeCannotResubmitOrPayerRefund() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(FUN, DIS));
        esc.submitMilestone(id, 0, NOTE);
        skip(DEADLINE_OFFSET + 1000 days);
        vm.prank(payer);
        vm.expectRevert(_badStatus(FUN, DIS));
        esc.refundUnstarted(id, 0);
    }

    function test_Escalate_ResolvedWithdrawalsPayOut() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, 40e6);
        vm.prank(payee);
        esc.withdraw(address(usdc));
        vm.prank(payer);
        esc.withdraw(address(usdc));
        assertEq(usdc.balanceOf(payee), 40e6);
        assertEq(usdc.balanceOf(address(esc)), TOTAL - 40e6 - (A0 - 40e6));
    }
}

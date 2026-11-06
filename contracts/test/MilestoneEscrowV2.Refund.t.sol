// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowV2TestBase} from "./MilestoneEscrowV2.Base.t.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";

/// @dev refundUnstarted (Funded and ChangesRequested) and cancelByAgreement.
contract MilestoneEscrowV2RefundTest is MilestoneEscrowV2TestBase {
    MilestoneEscrowV2.Status internal constant CR = MilestoneEscrowV2.Status.ChangesRequested;
    MilestoneEscrowV2.Status internal constant SUB = MilestoneEscrowV2.Status.Submitted;
    MilestoneEscrowV2.Status internal constant DIS = MilestoneEscrowV2.Status.Disputed;
    MilestoneEscrowV2.Status internal constant FUN = MilestoneEscrowV2.Status.Funded;

    uint256 internal id;
    uint256 internal t0;
    uint256 internal deadline;

    function setUp() public override {
        super.setUp();
        id = _create(address(usdc), arbiter);
        t0 = block.timestamp;
        deadline = t0 + DEADLINE_OFFSET;
    }

    function _refund(uint256 i) internal {
        vm.prank(payer);
        esc.refundUnstarted(id, i);
    }

    function _expectRefundReverts(uint256 i, bytes memory err) internal {
        vm.prank(payer);
        vm.expectRevert(err);
        esc.refundUnstarted(id, i);
    }

    // ------------------------------------------------------- Funded (as V1)

    function test_RefundFunded_BoundaryAtDeadline() public {
        vm.warp(deadline);
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));
        vm.warp(deadline + 1);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneRefunded(id, 0, A0);
        uint256 before_ = usdc.balanceOf(payer);
        _refund(0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
        assertEq(usdc.balanceOf(payer), before_ + A0);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
    }

    function test_RefundFunded_NonPayerReverts() public {
        vm.warp(deadline + 1);
        vm.prank(payee);
        vm.expectRevert(_unauth(payee));
        esc.refundUnstarted(id, 0);
    }

    function test_RefundFunded_Twice_Reverts() public {
        vm.warp(deadline + 1);
        _refund(0);
        _expectRefundReverts(0, _badStatus(FUN, MilestoneEscrowV2.Status.Refunded));
    }

    function test_Refund_RejectedFromSubmittedDisputedReleased() public {
        _submit(id, 0); // Submitted
        _submitAndDispute(id, 1); // Disputed
        _submit(id, 2);
        _approve(id, 2); // Released
        vm.warp(deadline + 365 days);
        _expectRefundReverts(0, _badStatus(FUN, SUB));
        _expectRefundReverts(1, _badStatus(FUN, DIS));
        _expectRefundReverts(2, _badStatus(FUN, MilestoneEscrowV2.Status.Released));
    }

    function test_Refund_UnknownMilestoneReverts() public {
        _expectRefundReverts(3, abi.encodeWithSelector(MilestoneEscrowV2.MilestoneNotFound.selector, id, 3));
    }

    // ------------------------------------------------ ChangesRequested refund

    function test_RefundCR_EarlyRequest_UsesDeadlinePlusWindow() public {
        _submitAndRequest(id, 0); // requested at t0, well before the deadline
        uint256 boundary = deadline + WINDOW;

        vm.warp(deadline + 1); // past deadline but inside the response window
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));
        vm.warp(boundary); // exact second: still rejected
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));

        vm.warp(boundary + 1);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneRefunded(id, 0, A0);
        uint256 before_ = usdc.balanceOf(payer);
        _refund(0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
        assertEq(usdc.balanceOf(payer), before_ + A0);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
    }

    function test_RefundCR_LateRequest_UsesRequestTimePlusWindow() public {
        // Submit one day before the deadline, request changes one day after it.
        vm.warp(deadline - 1 days);
        _submit(id, 0);
        vm.warp(deadline + 1 days);
        _request(id, 0);
        uint256 requestedAt = block.timestamp;
        assertGt(requestedAt, deadline);

        // The plain deadline + window would already have passed here; the later anchor must govern.
        vm.warp(deadline + WINDOW + 1);
        assertLt(block.timestamp, requestedAt + WINDOW + 1);
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));

        vm.warp(requestedAt + WINDOW); // exact boundary
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));
        vm.warp(requestedAt + WINDOW + 1);
        _refund(0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
    }

    function test_RefundCR_RequestExactlyAtDeadline_Anchor() public {
        vm.warp(deadline - 1 hours);
        _submit(id, 0);
        vm.warp(deadline);
        _request(id, 0);
        // max(deadline, deadline) + window
        vm.warp(deadline + WINDOW);
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));
        vm.warp(deadline + WINDOW + 1);
        _refund(0);
    }

    function test_RefundCR_NonPayerReverts() public {
        _submitAndRequest(id, 0);
        vm.warp(deadline + WINDOW + 1);
        vm.prank(payee);
        vm.expectRevert(_unauth(payee));
        esc.refundUnstarted(id, 0);
    }

    function test_RefundCR_PayeeResubmitBeforeBoundaryBlocksRefund() public {
        _submitAndRequest(id, 0);
        vm.warp(deadline + WINDOW); // last second before refund opens
        _submit(id, 0);
        vm.warp(deadline + WINDOW + 1);
        _expectRefundReverts(0, _badStatus(FUN, SUB));
        assertTrue(_status(id, 0) == SUB);
        assertEq(esc.unallocated(address(usdc)), TOTAL);
    }

    function test_RefundCR_ResubmitThenSecondRequestRestartsAnchor() public {
        _submitAndRequest(id, 0);
        vm.warp(deadline + 1 days);
        _submit(id, 0);
        _request(id, 0); // second request, anchor = now
        uint256 requestedAt = block.timestamp;
        vm.warp(requestedAt + WINDOW);
        _expectRefundReverts(0, abi.encodeWithSelector(MilestoneEscrowV2.DeadlineNotPassed.selector));
        vm.warp(requestedAt + WINDOW + 1);
        _refund(0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
    }

    function test_RefundCR_AfterRefund_PayeeCannotResubmit() public {
        _submitAndRequest(id, 0);
        vm.warp(deadline + WINDOW + 1);
        _refund(0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(FUN, MilestoneEscrowV2.Status.Refunded));
        esc.submitMilestone(id, 0, NOTE);
    }

    function test_RefundCR_Twice_Reverts() public {
        _submitAndRequest(id, 0);
        vm.warp(deadline + WINDOW + 1);
        _refund(0);
        _expectRefundReverts(0, _badStatus(FUN, MilestoneEscrowV2.Status.Refunded));
    }

    function test_RefundCR_EscalatedMilestoneCannotBeRefunded() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.warp(deadline + WINDOW + 1);
        _expectRefundReverts(0, _badStatus(FUN, DIS));
    }

    // -------------------------------------------------------- cancelByAgreement

    function test_Cancel_LeavesChangesRequestedUntouched() public {
        _submitAndRequest(id, 0); // ChangesRequested
        _submit(id, 1); // Submitted
        // milestone 2 stays Funded

        vm.prank(payer);
        esc.cancelByAgreement(id);
        uint256 before_ = usdc.balanceOf(payer);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneRefunded(id, 2, A2);
        vm.expectEmit(true, false, false, true, address(esc));
        emit MilestoneEscrowV2.EscrowCancelled(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);

        assertTrue(_status(id, 0) == CR);
        assertTrue(_status(id, 1) == SUB);
        assertTrue(_status(id, 2) == MilestoneEscrowV2.Status.Refunded);
        assertEq(usdc.balanceOf(payer), before_ + A2);
        assertEq(esc.unallocated(address(usdc)), A0 + A1);
        assertEq(usdc.balanceOf(address(esc)), A0 + A1);
        assertTrue(esc.getEscrow(id).cancelled);
        // revision metadata of the untouched milestone is intact
        assertEq(esc.getMilestone(id, 0).revisions, 1);
        assertEq(esc.getMilestone(id, 0).changeReason, REASON);
    }

    function test_Cancel_ChangesRequestedStillActionableAfterCancel() public {
        _submitAndRequest(id, 0);
        _submitAndRequest(id, 1);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);

        // payee may resubmit, then payer approves
        _submit(id, 0);
        _approve(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
        // the other can be escalated and resolved
        _escalate(id, 1);
        vm.prank(arbiter);
        esc.resolve(id, 1, A1);
        assertEq(esc.creditOf(payee, address(usdc)), A1);
    }

    function test_Cancel_ChangesRequestedRefundableAfterCancelOnceWindowPasses() public {
        _submitAndRequest(id, 0);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);
        vm.warp(deadline + WINDOW + 1);
        _refund(0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
    }

    function test_Cancel_OnlyOneConfirmationRefundsNothing() public {
        vm.prank(payee);
        esc.cancelByAgreement(id);
        assertTrue(_status(id, 0) == FUN);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertTrue(esc.getEscrow(id).payeeConfirmed);
        assertFalse(esc.getEscrow(id).cancelled);
    }

    function test_Cancel_AllFundedRefunded() public {
        uint256 before_ = usdc.balanceOf(payer);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);
        assertEq(usdc.balanceOf(payer), before_ + TOTAL);
        assertEq(esc.unallocated(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(esc)), 0);
    }

    function test_Cancel_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(_unauth(stranger));
        esc.cancelByAgreement(id);

        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.AlreadyConfirmed.selector);
        esc.cancelByAgreement(id);

        vm.prank(payee);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrowV2.AlreadyCancelled.selector);
        esc.cancelByAgreement(id);
    }
}

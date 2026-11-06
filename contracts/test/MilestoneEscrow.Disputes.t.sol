// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowTestBase} from "./MilestoneEscrow.Base.t.sol";
import {MilestoneEscrow} from "../MilestoneEscrow.sol";

/// @dev dispute, resolve, resolveByTimeout, refundUnstarted, cancelByAgreement, withdraw.
contract MilestoneEscrowDisputesTest is MilestoneEscrowTestBase {
    // ---------------------------------------------------------------- dispute

    function test_Dispute_OneSecondBeforeWindowEnd() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        uint256 t = esc.getMilestone(id, 0).submittedAt;
        vm.warp(t + WINDOW - 1);
        vm.expectEmit(true, true, false, false, address(esc));
        emit MilestoneEscrow.MilestoneDisputed(id, 0);
        _dispute(id, 0);

        MilestoneEscrow.Milestone memory m = esc.getMilestone(id, 0);
        assertTrue(m.status == MilestoneEscrow.Status.Disputed);
        assertEq(m.disputedAt, t + WINDOW - 1);
        // funds stay locked
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(esc.unallocated(address(usdc)), TOTAL);
    }

    function test_RevertDispute_AtExactWindowEnd() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        uint256 t = esc.getMilestone(id, 0).submittedAt;
        vm.warp(t + WINDOW);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.ReviewWindowElapsed.selector);
        esc.dispute(id, 0);
    }

    function test_RevertDispute_ArbiterAbsent() public {
        uint256 id = _create(address(usdc), address(0));
        _submit(id, 0);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.ArbiterAbsent.selector);
        esc.dispute(id, 0);
    }

    function test_RevertDispute_WrongCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        address[3] memory bad = [payee, arbiter, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.dispute(id, 0);
        }
    }

    function test_RevertDispute_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Funded));
        esc.dispute(id, 0);

        _submitAndDispute(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Disputed));
        esc.dispute(id, 0);

        _submit(id, 1);
        _approve(id, 1);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Released));
        esc.dispute(id, 1);
    }

    function test_RevertDispute_UnknownIds() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 5));
        esc.dispute(5, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.dispute(id, 3);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- resolve

    function test_Resolve_SplitCreditsBothNoTransfers() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        uint256 payeeAmt = 60e6;

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneResolved(id, 0, payeeAmt, A0 - payeeAmt);
        vm.prank(arbiter);
        esc.resolve(id, 0, payeeAmt);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Resolved);
        assertEq(esc.creditOf(payee, address(usdc)), payeeAmt);
        assertEq(esc.creditOf(payer, address(usdc)), A0 - payeeAmt);
        // no token moved at resolution
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(usdc.balanceOf(payee), 0);
        // milestone liability replaced by credits
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);

        vm.prank(payee);
        esc.withdraw(address(usdc));
        vm.prank(payer);
        esc.withdraw(address(usdc));
        assertEq(usdc.balanceOf(payee), payeeAmt);
        assertEq(usdc.balanceOf(address(esc)), TOTAL - payeeAmt - (A0 - payeeAmt));
    }

    function test_Resolve_ExtremesAllowed() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        _submitAndDispute(id, 1);
        vm.startPrank(arbiter);
        esc.resolve(id, 0, 0);
        esc.resolve(id, 1, A1);
        vm.stopPrank();
        assertEq(esc.creditOf(payer, address(usdc)), A0);
        assertEq(esc.creditOf(payee, address(usdc)), A1);
    }

    function test_Resolve_ArbiterStillValidAfterTimeout() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        skip(365 days);
        vm.prank(arbiter);
        esc.resolve(id, 0, 1);
        assertEq(esc.creditOf(payee, address(usdc)), 1);
        assertEq(esc.creditOf(payer, address(usdc)), A0 - 1);
    }

    function test_RevertResolve_WrongCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        address[3] memory bad = [payer, payee, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.resolve(id, 0, 1);
        }
    }

    function test_RevertResolve_PayeeAmountTooLarge() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidPayeeAmount.selector, A0 + 1, A0));
        esc.resolve(id, 0, A0 + 1);
    }

    function test_RevertResolve_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(arbiter);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Funded));
        esc.resolve(id, 0, 0);

        _submit(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Submitted));
        esc.resolve(id, 0, 0);

        _dispute(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, 0);
        vm.prank(arbiter);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Resolved));
        esc.resolve(id, 0, 0);
    }

    function test_Resolve_ArbiterAbsent_ZeroAddressCallerCannotResolve() public {
        // With no arbiter, msg.sender == address(0) matches e.arbiter, but a dispute can never exist.
        uint256 id = _create(address(usdc), address(0));
        _submit(id, 0);
        vm.prank(address(0));
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Submitted));
        esc.resolve(id, 0, 0);
        vm.prank(payee);
        vm.expectRevert(_unauth(payee));
        esc.resolve(id, 0, 0);
    }

    function test_RevertResolve_UnknownIds() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.startPrank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 9));
        esc.resolve(9, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.resolve(id, 3, 0);
        vm.stopPrank();
    }

    // -------------------------------------------------------- resolveByTimeout

    function test_ResolveByTimeout_ExactBoundaryAnyoneOddSplit() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 2); // A2 is odd
        uint256 d = esc.getMilestone(id, 2).disputedAt;
        vm.warp(d + 30 days);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneResolved(id, 2, A2 / 2, A2 - A2 / 2);
        vm.prank(stranger);
        esc.resolveByTimeout(id, 2);

        assertTrue(_status(id, 2) == MilestoneEscrow.Status.Resolved);
        assertEq(esc.creditOf(payee, address(usdc)), A2 / 2);
        assertEq(esc.creditOf(payer, address(usdc)), A2 - A2 / 2); // payer gets extra unit
        assertEq(esc.creditOf(payer, address(usdc)), esc.creditOf(payee, address(usdc)) + 1);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A2);
    }

    function test_RevertResolveByTimeout_OneSecondEarly() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        uint256 d = esc.getMilestone(id, 0).disputedAt;
        vm.warp(d + 30 days - 1);
        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.DisputeTimeoutNotElapsed.selector);
        esc.resolveByTimeout(id, 0);
    }

    function test_RevertResolveByTimeout_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        skip(31 days);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Funded));
        esc.resolveByTimeout(id, 0);

        _submit(id, 0);
        skip(31 days);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Submitted));
        esc.resolveByTimeout(id, 0);

        _approve(id, 0);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Released));
        esc.resolveByTimeout(id, 0);

        _submitAndDispute(id, 1);
        skip(30 days);
        esc.resolveByTimeout(id, 1);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Resolved));
        esc.resolveByTimeout(id, 1);
    }

    function test_ResolveByTimeout_ArbiterAbsentEscrowCannotBeResolved() public {
        uint256 id = _create(address(usdc), address(0));
        _submit(id, 0);
        skip(365 days);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Disputed, MilestoneEscrow.Status.Submitted));
        esc.resolveByTimeout(id, 0);
    }

    function test_RevertResolveByTimeout_UnknownIds() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 0));
        esc.resolveByTimeout(0, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.resolveByTimeout(id, 3);
    }

    // --------------------------------------------------------- refundUnstarted

    function test_Refund_OneSecondAfterDeadline() public {
        uint256 id = _create(address(usdc), arbiter);
        uint64 dl = esc.getEscrow(id).deadline;
        vm.warp(uint256(dl) + 1);
        uint256 before_ = usdc.balanceOf(payer);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneRefunded(id, 0, A0);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Refunded);
        assertEq(usdc.balanceOf(payer), before_ + A0);
        assertEq(usdc.balanceOf(address(esc)), TOTAL - A0);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
    }

    function test_RevertRefund_AtAndBeforeDeadline() public {
        uint256 id = _create(address(usdc), arbiter);
        uint64 dl = esc.getEscrow(id).deadline;
        vm.warp(dl - 1);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.DeadlineNotPassed.selector);
        esc.refundUnstarted(id, 0);
        vm.warp(dl);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.DeadlineNotPassed.selector);
        esc.refundUnstarted(id, 0);
    }

    function test_RevertRefund_WrongCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.warp(uint256(esc.getEscrow(id).deadline) + 1);
        address[3] memory bad = [payee, arbiter, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.refundUnstarted(id, 0);
        }
    }

    function test_RevertRefund_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        vm.warp(uint256(esc.getEscrow(id).deadline) + 1);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Funded, MilestoneEscrow.Status.Submitted));
        esc.refundUnstarted(id, 0);

        vm.prank(payer);
        esc.refundUnstarted(id, 1);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Funded, MilestoneEscrow.Status.Refunded));
        esc.refundUnstarted(id, 1);
    }

    function test_RevertRefund_UnknownIds() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 3));
        esc.refundUnstarted(3, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.refundUnstarted(id, 3);
        vm.stopPrank();
    }

    // -------------------------------------------------------------- withdraw

    function test_Withdraw_RevertsWithNoCredit() public {
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoCredit.selector, payee, address(usdc)));
        esc.withdraw(address(usdc));
    }

    function test_Withdraw_ClearsCreditAndSecondCallReverts() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, 40e6);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.Withdrawn(payee, address(usdc), 40e6);
        vm.prank(payee);
        esc.withdraw(address(usdc));
        assertEq(esc.creditOf(payee, address(usdc)), 0);
        assertEq(usdc.balanceOf(payee), 40e6);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoCredit.selector, payee, address(usdc)));
        esc.withdraw(address(usdc));
        // payer's credit is untouched by payee's withdrawal
        assertEq(esc.creditOf(payer, address(usdc)), 60e6);
    }

    function test_Withdraw_CreditsAreTokenScoped() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, 40e6);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoCredit.selector, payee, address(eurc)));
        esc.withdraw(address(eurc));
        assertEq(esc.creditOf(payee, address(usdc)), 40e6);
    }

    // ------------------------------------------------------- cancelByAgreement

    function test_Cancel_PayerThenPayeeRefundsFunded() public {
        uint256 id = _create(address(usdc), arbiter);
        uint256 before_ = usdc.balanceOf(payer);

        vm.expectEmit(true, true, false, false, address(esc));
        emit MilestoneEscrow.CancelConfirmed(id, payer);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        MilestoneEscrow.Escrow memory e = esc.getEscrow(id);
        assertTrue(e.payerConfirmed);
        assertFalse(e.payeeConfirmed);
        assertFalse(e.cancelled);
        assertEq(usdc.balanceOf(address(esc)), TOTAL); // nothing refunded yet
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Funded);

        vm.expectEmit(true, true, false, false, address(esc));
        emit MilestoneEscrow.CancelConfirmed(id, payee);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneRefunded(id, 0, A0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneRefunded(id, 1, A1);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneRefunded(id, 2, A2);
        vm.expectEmit(true, false, false, false, address(esc));
        emit MilestoneEscrow.EscrowCancelled(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);

        e = esc.getEscrow(id);
        assertTrue(e.cancelled);
        assertTrue(e.payerConfirmed);
        assertTrue(e.payeeConfirmed);
        assertEq(usdc.balanceOf(payer), before_ + TOTAL);
        assertEq(usdc.balanceOf(address(esc)), 0);
        assertEq(esc.unallocated(address(usdc)), 0);
        for (uint256 i; i < 3; ++i) {
            assertTrue(_status(id, i) == MilestoneEscrow.Status.Refunded);
        }
    }

    function test_Cancel_PayeeThenPayerAlsoWorks() public {
        uint256 id = _create(address(usdc), address(0));
        vm.prank(payee);
        esc.cancelByAgreement(id);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        assertTrue(esc.getEscrow(id).cancelled);
        assertEq(usdc.balanceOf(address(esc)), 0);
    }

    function test_Cancel_LeavesSubmittedAndDisputedUntouched() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0); // stays Submitted
        _submitAndDispute(id, 1); // stays Disputed
        // index 2 stays Funded
        uint256 before_ = usdc.balanceOf(payer);

        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Submitted);
        assertTrue(_status(id, 1) == MilestoneEscrow.Status.Disputed);
        assertTrue(_status(id, 2) == MilestoneEscrow.Status.Refunded);
        assertEq(usdc.balanceOf(payer), before_ + A2);
        assertEq(usdc.balanceOf(address(esc)), A0 + A1);
        assertEq(esc.unallocated(address(usdc)), A0 + A1);

        // Submitted and Disputed remain actionable after cancellation.
        _approve(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
        vm.prank(arbiter);
        esc.resolve(id, 1, 50e6);
        assertTrue(_status(id, 1) == MilestoneEscrow.Status.Resolved);
        assertEq(esc.creditOf(payee, address(usdc)), 50e6);
        assertEq(esc.creditOf(payer, address(usdc)), A1 - 50e6);
    }

    function test_Cancel_NothingFundedStillCancelsWithoutTransfer() public {
        uint256 id = _create(address(usdc), arbiter);
        for (uint256 i; i < 3; ++i) _submit(id, i);
        uint256 before_ = usdc.balanceOf(payer);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.expectEmit(true, false, false, false, address(esc));
        emit MilestoneEscrow.EscrowCancelled(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);
        assertTrue(esc.getEscrow(id).cancelled);
        assertEq(usdc.balanceOf(payer), before_);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(esc.unallocated(address(usdc)), TOTAL);
    }

    function test_RevertCancel_DoubleConfirmBySameParty() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.AlreadyConfirmed.selector);
        esc.cancelByAgreement(id);

        uint256 id2 = _create(address(usdc), arbiter);
        vm.prank(payee);
        esc.cancelByAgreement(id2);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrow.AlreadyConfirmed.selector);
        esc.cancelByAgreement(id2);
    }

    function test_RevertCancel_UnauthorizedCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        address[2] memory bad = [arbiter, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.cancelByAgreement(id);
        }
    }

    function test_RevertCancel_AlreadyCancelled() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);
        address[3] memory who = [payer, payee, stranger];
        for (uint256 k; k < who.length; ++k) {
            vm.prank(who[k]);
            vm.expectRevert(MilestoneEscrow.AlreadyCancelled.selector);
            esc.cancelByAgreement(id);
        }
    }

    function test_RevertCancel_UnknownEscrow() public {
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 0));
        esc.cancelByAgreement(0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 1));
        esc.cancelByAgreement(1);
    }
}

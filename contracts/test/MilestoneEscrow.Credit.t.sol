// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowTestBase} from "./MilestoneEscrow.Base.t.sol";
import {MilestoneEscrow} from "../MilestoneEscrow.sol";

/// @dev Credit-fallback paths. EURC is the blocklistable token: transfers to a blocked address
///      revert (default) or return false without moving funds (returnFalseOnBlocked).
contract MilestoneEscrowCreditTest is MilestoneEscrowTestBase {
    address internal tok;

    function setUp() public override {
        super.setUp();
        tok = address(eurc);
    }

    function _assertCovered(uint256 outstandingMilestones, uint256 credits) internal view {
        assertEq(esc.unallocated(tok), outstandingMilestones);
        assertEq(eurc.balanceOf(address(esc)), outstandingMilestones + credits);
    }

    // -------------------------------------------------------------- approve

    function test_Approve_BlockedPayee_CreditsInsteadOfReverting() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        eurc.setBlocked(payee, true);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneReleased(id, 0, payee, A0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.PayoutDeferred(payee, tok, A0);
        _approve(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Released);
        assertEq(eurc.balanceOf(payee), 0);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Approve_FalseReturningTransfer_Credits() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        eurc.setReturnFalseOnBlocked(true);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.PayoutDeferred(payee, tok, A0);
        _approve(id, 0);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Approve_BlockedThenWithdrawAfterUnblock() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        _approve(id, 0);

        // withdraw fails while blocked, and the credit is preserved
        vm.prank(payee);
        vm.expectRevert(bytes("blocked"));
        esc.withdraw(tok);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);

        eurc.setBlocked(payee, false);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.Withdrawn(payee, tok, A0);
        vm.prank(payee);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payee), A0);
        assertEq(esc.creditOf(payee, tok), 0);
        _assertCovered(TOTAL - A0, 0);
    }

    function test_Approve_FalseReturningWithdrawReverts() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        eurc.setReturnFalseOnBlocked(true);
        _approve(id, 0);
        vm.prank(payee);
        vm.expectRevert(); // SafeERC20FailedOperation
        esc.withdraw(tok);
        assertEq(esc.creditOf(payee, tok), A0);
    }

    function test_Approve_MultipleDeferredCreditsAccumulate() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        _submit(id, 1);
        eurc.setBlocked(payee, true);
        _approve(id, 0);
        _approve(id, 1);
        assertEq(esc.creditOf(payee, tok), A0 + A1);
        _assertCovered(A2, A0 + A1);
        eurc.setBlocked(payee, false);
        vm.prank(payee);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payee), A0 + A1);
        _assertCovered(A2, 0);
    }

    // -------------------------------------------------------- claimAfterWindow

    function test_Claim_BlockedPayee_Credits() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        skip(WINDOW);
        eurc.setBlocked(payee, true);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.PayoutDeferred(payee, tok, A0);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Released);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    // ---------------------------------------------------------------- resolve

    function test_Resolve_BlockedPayee_DoesNotBlockPayerAward() public {
        uint256 id = _create(tok, arbiter);
        _submitAndDispute(id, 0);
        eurc.setBlocked(payee, true);

        vm.prank(arbiter);
        esc.resolve(id, 0, 70e6); // does not revert, makes no transfer
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Resolved);
        assertEq(esc.creditOf(payee, tok), 70e6);
        assertEq(esc.creditOf(payer, tok), A0 - 70e6);
        _assertCovered(TOTAL - A0, A0);

        // payer withdraws independently
        uint256 pb = eurc.balanceOf(payer);
        vm.prank(payer);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payer), pb + (A0 - 70e6));

        // payee cannot withdraw while blocked; credit survives
        vm.prank(payee);
        vm.expectRevert(bytes("blocked"));
        esc.withdraw(tok);
        assertEq(esc.creditOf(payee, tok), 70e6);

        eurc.setBlocked(payee, false);
        vm.prank(payee);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payee), 70e6);
        _assertCovered(TOTAL - A0, 0);
    }

    function test_Resolve_BlockedPayer_DoesNotBlockPayeeAward() public {
        uint256 id = _create(tok, arbiter);
        _submitAndDispute(id, 0);
        eurc.setBlocked(payer, true);
        vm.prank(arbiter);
        esc.resolve(id, 0, 30e6);

        vm.prank(payee);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payee), 30e6);
        vm.prank(payer);
        vm.expectRevert(bytes("blocked"));
        esc.withdraw(tok);
        assertEq(esc.creditOf(payer, tok), A0 - 30e6);
        _assertCovered(TOTAL - A0, A0 - 30e6);
    }

    // -------------------------------------------------------- resolveByTimeout

    function test_ResolveByTimeout_BlockedParty_StillFinalizes() public {
        uint256 id = _create(tok, arbiter);
        _submitAndDispute(id, 2);
        skip(30 days);
        eurc.setBlocked(payee, true);
        eurc.setBlocked(payer, true);

        vm.prank(stranger);
        esc.resolveByTimeout(id, 2);
        assertTrue(_status(id, 2) == MilestoneEscrow.Status.Resolved);
        assertEq(esc.creditOf(payee, tok), A2 / 2);
        assertEq(esc.creditOf(payer, tok), A2 - A2 / 2);
        _assertCovered(TOTAL - A2, A2);

        eurc.setBlocked(payer, false);
        vm.prank(payer);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payer) , 1_000_000e6 - TOTAL + (A2 - A2 / 2));
        _assertCovered(TOTAL - A2, A2 / 2);
    }

    // --------------------------------------------------------- refundUnstarted

    function test_Refund_BlockedPayer_Credits() public {
        uint256 id = _create(tok, arbiter);
        vm.warp(uint256(esc.getEscrow(id).deadline) + 1);
        eurc.setBlocked(payer, true);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneRefunded(id, 0, A0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.PayoutDeferred(payer, tok, A0);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Refunded);
        assertEq(esc.creditOf(payer, tok), A0);
        _assertCovered(TOTAL - A0, A0);

        eurc.setBlocked(payer, false);
        vm.prank(payer);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payer), 1_000_000e6 - TOTAL + A0);
        _assertCovered(TOTAL - A0, 0);
    }

    function test_Refund_FalseReturning_Credits() public {
        uint256 id = _create(tok, arbiter);
        vm.warp(uint256(esc.getEscrow(id).deadline) + 1);
        eurc.setBlocked(payer, true);
        eurc.setReturnFalseOnBlocked(true);
        vm.prank(payer);
        esc.refundUnstarted(id, 1);
        assertEq(esc.creditOf(payer, tok), A1);
        _assertCovered(TOTAL - A1, A1);
    }

    // ------------------------------------------------------- cancelByAgreement

    function test_Cancel_BlockedPayer_CreditsAggregatedRefund() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0); // excluded from refund
        eurc.setBlocked(payer, true);

        vm.prank(payee);
        esc.cancelByAgreement(id);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.PayoutDeferred(payer, tok, A1 + A2);
        vm.prank(payer);
        esc.cancelByAgreement(id);

        assertTrue(esc.getEscrow(id).cancelled);
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Submitted);
        assertTrue(_status(id, 1) == MilestoneEscrow.Status.Refunded);
        assertEq(esc.creditOf(payer, tok), A1 + A2);
        _assertCovered(A0, A1 + A2);

        eurc.setBlocked(payer, false);
        vm.prank(payer);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payer), 1_000_000e6 - TOTAL + A1 + A2);
        _assertCovered(A0, 0);
    }

    function test_Cancel_NoFundedMilestones_NoPayoutDeferredEvenWhenBlocked() public {
        uint256 id = _create(tok, arbiter);
        for (uint256 i; i < 3; ++i) _submit(id, i);
        eurc.setBlocked(payer, true);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);
        assertEq(esc.creditOf(payer, tok), 0);
        _assertCovered(TOTAL, 0);
    }

    // ----------------------------------------------------------- withdraw misc

    function test_Withdraw_CreditsAreAccountScoped() public {
        uint256 id = _create(tok, arbiter);
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        _approve(id, 0);
        eurc.setBlocked(payee, false);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoCredit.selector, stranger, tok));
        esc.withdraw(tok);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoCredit.selector, payer, tok));
        esc.withdraw(tok);
        assertEq(esc.creditOf(payee, tok), A0);
    }

    function test_Withdraw_UnsolicitedTransferDoesNotCreateCredit() public {
        _create(tok, arbiter);
        eurc.mint(address(esc), 55e6);
        assertEq(esc.unallocated(tok), TOTAL);
        assertEq(esc.creditOf(payee, tok), 0);
        assertEq(eurc.balanceOf(address(esc)), TOTAL + 55e6);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.NoCredit.selector, payee, tok));
        esc.withdraw(tok);
    }
}

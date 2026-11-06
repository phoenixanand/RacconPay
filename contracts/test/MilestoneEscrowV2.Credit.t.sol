// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowV2TestBase} from "./MilestoneEscrowV2.Base.t.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";

/// @dev Credit-fallback paths on EURC (BlocklistERC20): a blocked recipient makes transfer revert
///      (default) or return false (returnFalseOnBlocked); payouts then become withdrawable credits.
contract MilestoneEscrowV2CreditTest is MilestoneEscrowV2TestBase {
    address internal tok;
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        tok = address(eurc);
        id = _create(tok, arbiter);
    }

    function _assertCovered(uint256 outstandingMilestones, uint256 credits) internal view {
        assertEq(esc.unallocated(tok), outstandingMilestones);
        assertEq(eurc.balanceOf(address(esc)), outstandingMilestones + credits);
    }

    // -------------------------------------------------------------- approve

    function test_Approve_BlockedPayee_Credits() public {
        _submit(id, 0);
        eurc.setBlocked(payee, true);

        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneReleased(id, 0, payee, A0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.PayoutDeferred(payee, tok, A0);
        _approve(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Released);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Approve_FalseReturning_Credits() public {
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        eurc.setReturnFalseOnBlocked(true);
        _approve(id, 0);
        assertEq(esc.creditOf(payee, tok), A0);
        assertEq(eurc.balanceOf(payee), 0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Approve_AfterResubmit_BlockedPayee_Credits() public {
        _submitAndRequest(id, 0);
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        _approve(id, 0);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    // ----------------------------------------------------------------- claim

    function test_Claim_BlockedPayee_Credits() public {
        _submit(id, 0);
        skip(WINDOW);
        eurc.setBlocked(payee, true);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.PayoutDeferred(payee, tok, A0);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Released);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    // ---------------------------------------------------------------- refund

    function test_Refund_Funded_BlockedPayer_Credits() public {
        skip(DEADLINE_OFFSET + 1);
        eurc.setBlocked(payer, true);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneRefunded(id, 0, A0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.PayoutDeferred(payer, tok, A0);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
        assertEq(esc.creditOf(payer, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Refund_ChangesRequested_BlockedPayer_Credits() public {
        _submitAndRequest(id, 0);
        skip(DEADLINE_OFFSET + WINDOW + 1);
        eurc.setBlocked(payer, true);
        eurc.setReturnFalseOnBlocked(true);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
        assertEq(esc.creditOf(payer, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Refund_ChangesRequested_CreditThenWithdrawAfterUnblock() public {
        _submitAndRequest(id, 0);
        skip(DEADLINE_OFFSET + WINDOW + 1);
        eurc.setBlocked(payer, true);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);

        uint256 before_ = eurc.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert(bytes("blocked"));
        esc.withdraw(tok);
        assertEq(esc.creditOf(payer, tok), A0);

        eurc.setBlocked(payer, false);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.Withdrawn(payer, tok, A0);
        vm.prank(payer);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payer), before_ + A0);
        assertEq(esc.creditOf(payer, tok), 0);
        _assertCovered(TOTAL - A0, 0);
    }

    function test_CancelRefund_BlockedPayer_Credits() public {
        _submitAndRequest(id, 0);
        eurc.setBlocked(payer, true);
        vm.prank(payer);
        esc.cancelByAgreement(id);
        vm.prank(payee);
        esc.cancelByAgreement(id);
        assertEq(esc.creditOf(payer, tok), A1 + A2);
        _assertCovered(A0, A1 + A2);
    }

    // --------------------------------------------------------------- resolve

    function test_Resolve_AfterEscalate_BlockedPayee_DoesNotBlockPayer() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        eurc.setBlocked(payee, true);

        vm.prank(arbiter);
        esc.resolve(id, 0, 70e6); // no transfer happens, so no revert
        assertEq(esc.creditOf(payee, tok), 70e6);
        assertEq(esc.creditOf(payer, tok), A0 - 70e6);
        _assertCovered(TOTAL - A0, A0);

        uint256 pb = eurc.balanceOf(payer);
        vm.prank(payer);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payer), pb + (A0 - 70e6));

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

    function test_ResolveByTimeout_AfterEscalate_BlockedBoth_Credits() public {
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        eurc.setBlocked(payee, true);
        eurc.setBlocked(payer, true);
        skip(30 days);
        esc.resolveByTimeout(id, 0);
        assertEq(esc.creditOf(payee, tok), A0 / 2);
        assertEq(esc.creditOf(payer, tok), A0 - A0 / 2);
        _assertCovered(TOTAL - A0, A0);
    }

    // -------------------------------------------------------------- withdraw

    function test_Withdraw_NoCreditReverts() public {
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.NoCredit.selector, payee, tok));
        esc.withdraw(tok);
    }

    function test_Withdraw_FalseReturningTransferReverts_CreditPreserved() public {
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        eurc.setReturnFalseOnBlocked(true);
        _approve(id, 0);
        vm.prank(payee);
        vm.expectRevert(); // SafeERC20FailedOperation
        esc.withdraw(tok);
        assertEq(esc.creditOf(payee, tok), A0);
        _assertCovered(TOTAL - A0, A0);
    }

    function test_Withdraw_AccumulatedCreditsPaidInOneCall() public {
        _submit(id, 0);
        _submit(id, 1);
        eurc.setBlocked(payee, true);
        _approve(id, 0);
        _approve(id, 1);
        assertEq(esc.creditOf(payee, tok), A0 + A1);
        eurc.setBlocked(payee, false);
        vm.prank(payee);
        esc.withdraw(tok);
        assertEq(eurc.balanceOf(payee), A0 + A1);
        assertEq(esc.creditOf(payee, tok), 0);
        _assertCovered(A2, 0);
    }

    function test_Withdraw_CreditIsPerToken() public {
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        _approve(id, 0);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.NoCredit.selector, payee, address(usdc)));
        esc.withdraw(address(usdc));
    }
}

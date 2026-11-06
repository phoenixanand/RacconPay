// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowTestBase} from "./MilestoneEscrow.Base.t.sol";
import {MilestoneEscrow} from "../MilestoneEscrow.sol";

/// @dev Constructor, createEscrow, submitMilestone, approveMilestone, claimAfterWindow, views.
contract MilestoneEscrowTest is MilestoneEscrowTestBase {
    // ------------------------------------------------------------ constructor

    function test_Constructor_StoresTokensAndConstants() public view {
        assertEq(esc.usdc(), address(usdc));
        assertEq(esc.eurc(), address(eurc));
        assertEq(esc.MAX_MILESTONES(), 20);
        assertEq(esc.MIN_REVIEW_WINDOW(), 1 days);
        assertEq(esc.MAX_REVIEW_WINDOW(), 90 days);
        assertEq(esc.DISPUTE_TIMEOUT(), 30 days);
        assertEq(esc.escrowCount(), 0);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        new MilestoneEscrow(address(0), address(eurc));
    }

    function test_Constructor_RevertsOnZeroEurc() public {
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        new MilestoneEscrow(address(usdc), address(0));
    }

    function test_Constructor_RevertsOnIdenticalTokens() public {
        vm.expectRevert(MilestoneEscrow.IdenticalTokens.selector);
        new MilestoneEscrow(address(usdc), address(usdc));
    }

    // ----------------------------------------------------------- createEscrow

    function test_CreateEscrow_HappyPath_Usdc() public {
        uint256 id = _create(address(usdc), arbiter);
        assertEq(id, 1);
        assertEq(esc.escrowCount(), 1);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(usdc.balanceOf(payer), 1_000_000e6 - TOTAL);
        assertEq(esc.unallocated(address(usdc)), TOTAL);

        MilestoneEscrow.Escrow memory e = esc.getEscrow(id);
        assertEq(e.payer, payer);
        assertEq(e.payee, payee);
        assertEq(e.arbiter, arbiter);
        assertEq(e.token, address(usdc));
        assertEq(e.reviewWindow, WINDOW);
        assertEq(e.deadline, uint64(block.timestamp + DEADLINE_OFFSET));
        assertEq(e.memo, "memo");
        assertEq(e.milestoneCount, 3);
        assertFalse(e.payerConfirmed);
        assertFalse(e.payeeConfirmed);
        assertFalse(e.cancelled);

        assertEq(esc.getMilestone(id, 0).amount, A0);
        assertEq(esc.getMilestone(id, 1).amount, A1);
        assertEq(esc.getMilestone(id, 2).amount, A2);
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Funded);
        assertTrue(_status(id, 2) == MilestoneEscrow.Status.Funded);
    }

    function test_CreateEscrow_HappyPath_Eurc() public {
        uint256 id = _create(address(eurc), address(0));
        assertEq(eurc.balanceOf(address(esc)), TOTAL);
        assertEq(esc.unallocated(address(eurc)), TOTAL);
        assertEq(esc.unallocated(address(usdc)), 0);
        assertEq(esc.getEscrow(id).token, address(eurc));
    }

    function test_CreateEscrow_EmitsEvent() public {
        uint64 dl = uint64(block.timestamp + DEADLINE_OFFSET);
        vm.expectEmit(true, true, true, true, address(esc));
        emit MilestoneEscrow.EscrowCreated(1, payer, payee, arbiter, address(usdc), TOTAL, 3, dl, WINDOW, "memo");
        _create(address(usdc), arbiter);
    }

    function test_CreateEscrow_IdsIncrementAndEscrowsOf() public {
        uint256 a = _create(address(usdc), arbiter);
        uint256 b = _create(address(eurc), address(0));
        assertEq(a, 1);
        assertEq(b, 2);

        uint256[] memory p = esc.escrowsOf(payer);
        assertEq(p.length, 2);
        assertEq(p[0], 1);
        assertEq(p[1], 2);
        uint256[] memory y = esc.escrowsOf(payee);
        assertEq(y.length, 2);
        uint256[] memory r = esc.escrowsOf(arbiter);
        assertEq(r.length, 1);
        assertEq(r[0], 1);
        // zero arbiter is never indexed
        assertEq(esc.escrowsOf(address(0)).length, 0);
        assertEq(esc.escrowsOf(stranger).length, 0);
    }

    function test_CreateEscrow_MaxMilestonesAllowed() public {
        uint256[] memory a = new uint256[](20);
        for (uint256 i; i < 20; ++i) a[i] = 1e6;
        uint256 id = _createWith(address(usdc), a, arbiter);
        assertEq(esc.getEscrow(id).milestoneCount, 20);
        assertEq(usdc.balanceOf(address(esc)), 20e6);
    }

    function test_CreateEscrow_WindowBoundsInclusive() public {
        uint256[] memory a = _amounts();
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.startPrank(payer);
        esc.createEscrow(payee, arbiter, address(usdc), a, 1 days, dl, "");
        esc.createEscrow(payee, arbiter, address(usdc), a, 90 days, dl, "");
        vm.stopPrank();
        assertEq(esc.escrowCount(), 2);
    }

    function test_CreateEscrow_DeadlineOneSecondAheadAllowed() public {
        vm.prank(payer);
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1), "");
        assertEq(esc.escrowCount(), 1);
    }

    function test_RevertCreate_ZeroPayee() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        esc.createEscrow(address(0), arbiter, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_PayeeIsPayer() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.InvalidParticipants.selector);
        esc.createEscrow(payer, arbiter, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_ArbiterIsPayer() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.InvalidParticipants.selector);
        esc.createEscrow(payee, payer, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_ArbiterIsPayee() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.InvalidParticipants.selector);
        esc.createEscrow(payee, payee, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_TokenNotAllowed() public {
        MockERC20Alias other = MockERC20Alias(address(stranger));
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.TokenNotAllowed.selector, address(other)));
        esc.createEscrow(payee, arbiter, address(other), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_NoMilestones() public {
        uint256[] memory a = new uint256[](0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidMilestoneCount.selector, 0));
        esc.createEscrow(payee, arbiter, address(usdc), a, WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_TooManyMilestones() public {
        uint256[] memory a = new uint256[](21);
        for (uint256 i; i < 21; ++i) a[i] = 1e6;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidMilestoneCount.selector, 21));
        esc.createEscrow(payee, arbiter, address(usdc), a, WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_WindowTooShort() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidReviewWindow.selector, uint64(1 days - 1)));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), 1 days - 1, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_WindowTooLong() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidReviewWindow.selector, uint64(90 days + 1)));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), 90 days + 1, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_DeadlineEqualsNow() public {
        uint64 dl = uint64(block.timestamp);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidDeadline.selector, dl));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), WINDOW, dl, "");
    }

    function test_RevertCreate_DeadlineInPast() public {
        uint64 dl = uint64(block.timestamp - 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidDeadline.selector, dl));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), WINDOW, dl, "");
    }

    function test_RevertCreate_ZeroAmountReportsIndex() public {
        uint256[] memory a = _amounts();
        a[1] = 0;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.ZeroMilestoneAmount.selector, 1));
        esc.createEscrow(payee, arbiter, address(usdc), a, WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_InsufficientAllowance() public {
        vm.prank(payer);
        usdc.approve(address(esc), TOTAL - 1);
        vm.prank(payer);
        vm.expectRevert(bytes("ERC20: insufficient allowance"));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_RevertCreate_InsufficientBalance() public {
        address poor = makeAddr("poor");
        vm.startPrank(poor);
        usdc.approve(address(esc), type(uint256).max);
        vm.expectRevert(bytes("ERC20: insufficient balance"));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
        vm.stopPrank();
    }

    function test_RevertCreate_FeeOnTransferTokenShortReceipt() public {
        eurc.setFeeBps(100); // 1% burned in transit
        uint256 received = TOTAL - (TOTAL * 100) / 10_000;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.IncorrectReceivedAmount.selector, TOTAL, received));
        esc.createEscrow(payee, arbiter, address(eurc), _amounts(), WINDOW, uint64(block.timestamp + 1 days), "");
        assertEq(esc.escrowCount(), 0);
        assertEq(esc.unallocated(address(eurc)), 0);
    }

    // -------------------------------------------------------- submitMilestone

    function test_Submit_HappyPathAndEvent() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneSubmitted(id, 1, keccak256("evidence"));
        _submit(id, 1);

        MilestoneEscrow.Milestone memory m = esc.getMilestone(id, 1);
        assertTrue(m.status == MilestoneEscrow.Status.Submitted);
        assertEq(m.submittedAt, block.timestamp);
        assertEq(m.evidenceHash, keccak256("evidence"));
        // other milestones untouched; funds still in escrow
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Funded);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
    }

    function test_Submit_AllowedAfterDeadline() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.warp(esc.getEscrow(id).deadline + 5 days);
        _submit(id, 0);
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Submitted);
    }

    function test_RevertSubmit_WrongCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        address[3] memory bad = [payer, arbiter, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.submitMilestone(id, 0, bytes32(0));
        }
    }

    function test_RevertSubmit_UnknownEscrowAndMilestone() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.startPrank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 0));
        esc.submitMilestone(0, 0, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, id + 1));
        esc.submitMilestone(id + 1, 0, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.submitMilestone(id, 3, bytes32(0));
        vm.stopPrank();
    }

    function test_RevertSubmit_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        // Submitted
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Funded, MilestoneEscrow.Status.Submitted));
        esc.submitMilestone(id, 0, bytes32(0));
        // Released
        _approve(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Funded, MilestoneEscrow.Status.Released));
        esc.submitMilestone(id, 0, bytes32(0));
        // Refunded
        vm.warp(esc.getEscrow(id).deadline + 1);
        vm.prank(payer);
        esc.refundUnstarted(id, 1);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Funded, MilestoneEscrow.Status.Refunded));
        esc.submitMilestone(id, 1, bytes32(0));
    }

    // ------------------------------------------------------- approveMilestone

    function test_Approve_PaysPayeeAndEmits() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneReleased(id, 0, payee, A0);
        _approve(id, 0);

        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Released);
        assertEq(usdc.balanceOf(payee), A0);
        assertEq(usdc.balanceOf(address(esc)), TOTAL - A0);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
        assertEq(esc.creditOf(payee, address(usdc)), 0);
    }

    function test_Approve_WorksAfterWindowElapsed() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        skip(WINDOW + 10 days);
        _approve(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
    }

    function test_Approve_Eurc() public {
        uint256 id = _create(address(eurc), address(0));
        _submit(id, 2);
        _approve(id, 2);
        assertEq(eurc.balanceOf(payee), A2);
        assertEq(esc.unallocated(address(eurc)), TOTAL - A2);
    }

    function test_RevertApprove_WrongCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        address[3] memory bad = [payee, arbiter, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.approveMilestone(id, 0);
        }
    }

    function test_RevertApprove_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        // Funded
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Funded));
        esc.approveMilestone(id, 0);
        // Released (double release)
        _submit(id, 0);
        _approve(id, 0);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Released));
        esc.approveMilestone(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
        // Disputed
        _submitAndDispute(id, 1);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Disputed));
        esc.approveMilestone(id, 1);
    }

    function test_RevertApprove_UnknownEscrowAndMilestone() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 7));
        esc.approveMilestone(7, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 99));
        esc.approveMilestone(id, 99);
        vm.stopPrank();
    }

    // -------------------------------------------------------- claimAfterWindow

    function test_Claim_ExactWindowEndSucceeds() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        uint256 t = esc.getMilestone(id, 0).submittedAt;
        vm.warp(t + WINDOW);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrow.MilestoneReleased(id, 0, payee, A0);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        assertTrue(_status(id, 0) == MilestoneEscrow.Status.Released);
        assertEq(usdc.balanceOf(payee), A0);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
    }

    function test_RevertClaim_OneSecondBeforeWindowEnd() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        uint256 t = esc.getMilestone(id, 0).submittedAt;
        vm.warp(t + WINDOW - 1);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrow.ReviewWindowNotElapsed.selector);
        esc.claimAfterWindow(id, 0);
    }

    function test_Claim_WorksWithoutArbiter() public {
        uint256 id = _create(address(usdc), address(0));
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
    }

    function test_RevertClaim_WrongCallers() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        skip(WINDOW);
        address[3] memory bad = [payer, arbiter, stranger];
        for (uint256 k; k < bad.length; ++k) {
            vm.prank(bad[k]);
            vm.expectRevert(_unauth(bad[k]));
            esc.claimAfterWindow(id, 0);
        }
    }

    function test_RevertClaim_WrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        // Funded
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Funded));
        esc.claimAfterWindow(id, 0);
        // Released
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Released));
        esc.claimAfterWindow(id, 0);
        // Disputed
        _submitAndDispute(id, 1);
        skip(WINDOW);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrow.Status.Submitted, MilestoneEscrow.Status.Disputed));
        esc.claimAfterWindow(id, 1);
    }

    function test_RevertClaim_UnknownIds() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.startPrank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 0));
        esc.claimAfterWindow(0, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.claimAfterWindow(id, 3);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ views

    function test_Views_RevertOnUnknownIds() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, 0));
        esc.getEscrow(0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, id + 1));
        esc.getEscrow(id + 1);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.EscrowNotFound.selector, id + 1));
        esc.getMilestone(id + 1, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.MilestoneNotFound.selector, id, 3));
        esc.getMilestone(id, 3);
    }
}

/// @dev Only used to type an arbitrary non-allowlisted address in a test.
interface MockERC20Alias {}

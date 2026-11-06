// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MilestoneEscrowV2TestBase} from "./MilestoneEscrowV2.Base.t.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";

/// @dev Constructor, createEscrow (incl. titles), submitMilestone (incl. notes), views.
contract MilestoneEscrowV2CreateTest is MilestoneEscrowV2TestBase {
    // ------------------------------------------------------------ constructor

    function test_Constructor_StoresTokensAndConstants() public view {
        assertEq(esc.usdc(), address(usdc));
        assertEq(esc.eurc(), address(eurc));
        assertEq(esc.MAX_MILESTONES(), 20);
        assertEq(esc.MIN_REVIEW_WINDOW(), 1 days);
        assertEq(esc.MAX_REVIEW_WINDOW(), 90 days);
        assertEq(esc.DISPUTE_TIMEOUT(), 30 days);
        assertEq(esc.MAX_REVISIONS(), 3);
        assertEq(esc.escrowCount(), 0);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(MilestoneEscrowV2.ZeroAddress.selector);
        new MilestoneEscrowV2(address(0), address(eurc));
    }

    function test_Constructor_RevertsOnZeroEurc() public {
        vm.expectRevert(MilestoneEscrowV2.ZeroAddress.selector);
        new MilestoneEscrowV2(address(usdc), address(0));
    }

    function test_Constructor_RevertsOnIdenticalTokens() public {
        vm.expectRevert(MilestoneEscrowV2.IdenticalTokens.selector);
        new MilestoneEscrowV2(address(usdc), address(usdc));
    }

    // ----------------------------------------------------------- createEscrow

    function test_CreateEscrow_HappyPath_Usdc() public {
        uint256 id = _create(address(usdc), arbiter);
        assertEq(id, 1);
        assertEq(esc.escrowCount(), 1);
        assertEq(usdc.balanceOf(address(esc)), TOTAL);
        assertEq(usdc.balanceOf(payer), 1_000_000e6 - TOTAL);
        assertEq(esc.unallocated(address(usdc)), TOTAL);

        MilestoneEscrowV2.Escrow memory e = esc.getEscrow(id);
        assertEq(e.payer, payer);
        assertEq(e.payee, payee);
        assertEq(e.arbiter, arbiter);
        assertEq(e.token, address(usdc));
        assertEq(e.reviewWindow, WINDOW);
        assertEq(e.deadline, uint64(block.timestamp + DEADLINE_OFFSET));
        assertEq(e.memo, "memo");
        assertEq(e.milestoneCount, 3);
        assertFalse(e.cancelled);

        assertEq(esc.getMilestone(id, 0).amount, A0);
        assertEq(esc.getMilestone(id, 2).amount, A2);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Funded);
        assertTrue(_status(id, 2) == MilestoneEscrowV2.Status.Funded);
    }

    function test_CreateEscrow_HappyPath_Eurc_NoArbiter() public {
        uint256 id = _create(address(eurc), address(0));
        assertEq(eurc.balanceOf(address(esc)), TOTAL);
        assertEq(esc.unallocated(address(eurc)), TOTAL);
        assertEq(esc.unallocated(address(usdc)), 0);
        assertEq(esc.getEscrow(id).arbiter, address(0));
    }

    function test_CreateEscrow_EmitsEvent() public {
        uint64 dl = uint64(block.timestamp + DEADLINE_OFFSET);
        vm.expectEmit(true, true, true, true, address(esc));
        emit MilestoneEscrowV2.EscrowCreated(1, payer, payee, arbiter, address(usdc), TOTAL, 3, dl, WINDOW, "memo");
        vm.prank(payer);
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), _titles(), WINDOW, dl, "memo");
    }

    function test_CreateEscrow_TitlesReturnedByGetMilestone() public {
        vm.prank(payer);
        uint256 id = esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 10 days), ""
        );
        assertEq(esc.getMilestone(id, 0).title, "Design");
        assertEq(esc.getMilestone(id, 1).title, "Build");
        assertEq(esc.getMilestone(id, 2).title, "Ship");
        // a fresh milestone has no note, reason or revisions
        MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, 0);
        assertEq(m.note, "");
        assertEq(m.changeReason, "");
        assertEq(m.revisions, 0);
        assertEq(m.changesRequestedAt, 0);
    }

    function test_CreateEscrow_EmptyTitleAllowed() public {
        string[] memory t = new string[](3);
        t[1] = "mid";
        vm.prank(payer);
        uint256 id =
            esc.createEscrow(payee, arbiter, address(usdc), _amounts(), t, WINDOW, uint64(block.timestamp + 1 days), "");
        assertEq(esc.getMilestone(id, 0).title, "");
        assertEq(esc.getMilestone(id, 1).title, "mid");
        assertEq(esc.getMilestone(id, 2).title, "");
    }

    function test_CreateEscrow_Title64BytesAccepted() public {
        string[] memory t = _titles();
        t[2] = _bytesOf(64, "x");
        vm.prank(payer);
        uint256 id =
            esc.createEscrow(payee, arbiter, address(usdc), _amounts(), t, WINDOW, uint64(block.timestamp + 1 days), "");
        assertEq(esc.getMilestone(id, 2).title, t[2]);
    }

    function test_CreateEscrow_Title65BytesReverts() public {
        string[] memory t = _titles();
        t[2] = _bytesOf(65, "x");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.TitleTooLong.selector, 2));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), t, WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_CreateEscrow_Title65Bytes_FirstIndexReported() public {
        string[] memory t = _titles();
        t[0] = _bytesOf(65, "x");
        t[1] = _bytesOf(70, "y");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.TitleTooLong.selector, 0));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), t, WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_CreateEscrow_TitleLengthCountsBytesNotChars() public {
        // 22 x 3-byte chars = 66 bytes but only 22 characters -> too long
        string[] memory t = _titles();
        bytes memory euro = new bytes(66);
        for (uint256 k; k < 22; ++k) {
            euro[3 * k] = 0xe2;
            euro[3 * k + 1] = 0x82;
            euro[3 * k + 2] = 0xac;
        }
        t[0] = string(euro);
        assertEq(bytes(t[0]).length, 66);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.TitleTooLong.selector, 0));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), t, WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_CreateEscrow_TitleCountMismatch_TooFew() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.TitleCountMismatch.selector);
        esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), _titlesN(2), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_TitleCountMismatch_TooMany() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.TitleCountMismatch.selector);
        esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), _titlesN(4), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_TitleCountMismatch_NoTitles() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.TitleCountMismatch.selector);
        esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), new string[](0), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsOnZeroPayee() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ZeroAddress.selector);
        esc.createEscrow(
            address(0), arbiter, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsWhenPayeeIsPayer() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.InvalidParticipants.selector);
        esc.createEscrow(
            payer, arbiter, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsWhenArbiterIsPayer() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.InvalidParticipants.selector);
        esc.createEscrow(
            payee, payer, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsWhenArbiterIsPayee() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.InvalidParticipants.selector);
        esc.createEscrow(
            payee, payee, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsOnDisallowedToken() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.TokenNotAllowed.selector, stranger));
        esc.createEscrow(
            payee, arbiter, stranger, _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsOnZeroMilestones() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidMilestoneCount.selector, 0));
        esc.createEscrow(
            payee,
            arbiter,
            address(usdc),
            new uint256[](0),
            new string[](0),
            WINDOW,
            uint64(block.timestamp + 1 days),
            ""
        );
    }

    function test_CreateEscrow_RevertsOnTooManyMilestones() public {
        uint256[] memory a = new uint256[](21);
        for (uint256 k; k < 21; ++k) a[k] = 1;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidMilestoneCount.selector, 21));
        esc.createEscrow(
            payee, arbiter, address(usdc), a, _titlesN(21), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_TwentyMilestonesAccepted() public {
        uint256[] memory a = new uint256[](20);
        for (uint256 k; k < 20; ++k) a[k] = 1e6;
        uint256 id = _createWith(address(usdc), a, arbiter);
        assertEq(esc.getEscrow(id).milestoneCount, 20);
        assertEq(esc.getMilestone(id, 19).title, "t");
    }

    function test_CreateEscrow_RevertsOnZeroAmount() public {
        uint256[] memory a = _amounts();
        a[1] = 0;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.ZeroMilestoneAmount.selector, 1));
        esc.createEscrow(payee, arbiter, address(usdc), a, _titles(), WINDOW, uint64(block.timestamp + 1 days), "");
    }

    function test_CreateEscrow_ReviewWindowBounds() public {
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidReviewWindow.selector, uint64(1 days - 1)));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), _titles(), uint64(1 days - 1), dl, "");

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidReviewWindow.selector, uint64(90 days + 1)));
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), _titles(), uint64(90 days + 1), dl, "");

        vm.prank(payer);
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), _titles(), uint64(1 days), dl, "");
        vm.prank(payer);
        esc.createEscrow(payee, arbiter, address(usdc), _amounts(), _titles(), uint64(90 days), dl, "");
        assertEq(esc.escrowCount(), 2);
    }

    function test_CreateEscrow_DeadlineMustBeFuture() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidDeadline.selector, uint64(block.timestamp)));
        esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp), ""
        );
        vm.prank(payer);
        esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1), ""
        );
    }

    function test_CreateEscrow_RevertsOnFeeOnTransfer() public {
        eurc.setFeeBps(100);
        uint256 fee = (TOTAL * 100) / 10_000;
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneEscrowV2.IncorrectReceivedAmount.selector, TOTAL, TOTAL - fee)
        );
        esc.createEscrow(
            payee, arbiter, address(eurc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_CreateEscrow_RevertsWithoutAllowance() public {
        vm.prank(payer);
        usdc.approve(address(esc), 0);
        vm.prank(payer);
        vm.expectRevert();
        esc.createEscrow(
            payee, arbiter, address(usdc), _amounts(), _titles(), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    function test_EscrowsOf_IndexesAllParticipants() public {
        _create(address(usdc), arbiter);
        _create(address(usdc), address(0));
        assertEq(esc.escrowsOf(payer).length, 2);
        assertEq(esc.escrowsOf(payee).length, 2);
        assertEq(esc.escrowsOf(arbiter).length, 1);
        assertEq(esc.escrowsOf(arbiter)[0], 1);
        assertEq(esc.escrowsOf(stranger).length, 0);
    }

    function test_Views_RevertOnUnknownIdOrIndex() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.EscrowNotFound.selector, 0));
        esc.getEscrow(0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.EscrowNotFound.selector, 2));
        esc.getMilestone(2, 0);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.MilestoneNotFound.selector, id, 3));
        esc.getMilestone(id, 3);
    }

    // -------------------------------------------------------- submitMilestone

    function test_Submit_HappyPath_StoresNoteAndEmits() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneSubmitted(id, 1, NOTE);
        vm.prank(payee);
        esc.submitMilestone(id, 1, NOTE);

        MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, 1);
        assertTrue(m.status == MilestoneEscrowV2.Status.Submitted);
        assertEq(m.note, NOTE);
        assertEq(m.submittedAt, block.timestamp);
        assertEq(m.title, "t");
        // other milestones untouched
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Funded);
        assertEq(esc.getMilestone(id, 0).note, "");
    }

    function test_Submit_EmptyNoteAllowed() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneSubmitted(id, 0, "");
        vm.prank(payee);
        esc.submitMilestone(id, 0, "");
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Submitted);
    }

    function test_Submit_Note280BytesAccepted() public {
        uint256 id = _create(address(usdc), arbiter);
        string memory n = _bytesOf(280, "n");
        vm.prank(payee);
        esc.submitMilestone(id, 0, n);
        assertEq(esc.getMilestone(id, 0).note, n);
    }

    function test_Submit_Note281BytesReverts() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrowV2.NoteTooLong.selector);
        esc.submitMilestone(id, 0, _bytesOf(281, "n"));
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Funded);
    }

    function test_Submit_RevertsForNonPayee() public {
        uint256 id = _create(address(usdc), arbiter);
        address[3] memory callers = [payer, arbiter, stranger];
        for (uint256 k; k < 3; ++k) {
            vm.prank(callers[k]);
            vm.expectRevert(_unauth(callers[k]));
            esc.submitMilestone(id, 0, NOTE);
        }
    }

    function test_Submit_RevertsOnUnknownMilestone() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.MilestoneNotFound.selector, id, 3));
        esc.submitMilestone(id, 3, NOTE);
    }

    function test_Submit_AllowedAfterDeadline() public {
        uint256 id = _create(address(usdc), arbiter);
        skip(DEADLINE_OFFSET + 1 days);
        _submit(id, 0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Submitted);
    }

    function test_Submit_RejectedFromSubmitted() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrowV2.Status.Funded, MilestoneEscrowV2.Status.Submitted));
        esc.submitMilestone(id, 0, NOTE);
    }

    function test_Submit_RejectedFromReleased() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        _approve(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrowV2.Status.Funded, MilestoneEscrowV2.Status.Released));
        esc.submitMilestone(id, 0, NOTE);
    }

    function test_Submit_RejectedFromDisputed() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrowV2.Status.Funded, MilestoneEscrowV2.Status.Disputed));
        esc.submitMilestone(id, 0, NOTE);
    }

    function test_Submit_RejectedFromResolved() public {
        uint256 id = _create(address(usdc), arbiter);
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, 1);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrowV2.Status.Funded, MilestoneEscrowV2.Status.Resolved));
        esc.submitMilestone(id, 0, NOTE);
    }

    function test_Submit_RejectedFromRefunded() public {
        uint256 id = _create(address(usdc), arbiter);
        skip(DEADLINE_OFFSET + 1);
        vm.prank(payer);
        esc.refundUnstarted(id, 0);
        vm.prank(payee);
        vm.expectRevert(_badStatus(MilestoneEscrowV2.Status.Funded, MilestoneEscrowV2.Status.Refunded));
        esc.submitMilestone(id, 0, NOTE);
    }

    // ------------------------------------------- approve / claim / dispute (V1)

    function test_Approve_PaysPayee() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        vm.expectEmit(true, true, false, true, address(esc));
        emit MilestoneEscrowV2.MilestoneReleased(id, 0, payee, A0);
        _approve(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
        assertEq(esc.unallocated(address(usdc)), TOTAL - A0);
        assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Released);
    }

    function test_Approve_RevertsForNonPayerAndWrongStatus() public {
        uint256 id = _create(address(usdc), arbiter);
        vm.prank(payer);
        vm.expectRevert(_badStatus(MilestoneEscrowV2.Status.Submitted, MilestoneEscrowV2.Status.Funded));
        esc.approveMilestone(id, 0);
        _submit(id, 0);
        vm.prank(payee);
        vm.expectRevert(_unauth(payee));
        esc.approveMilestone(id, 0);
    }

    function test_Claim_BoundaryAtExactEnd() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        skip(WINDOW - 1);
        vm.prank(payee);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowNotElapsed.selector);
        esc.claimAfterWindow(id, 0);
        skip(1);
        vm.prank(payee);
        esc.claimAfterWindow(id, 0);
        assertEq(usdc.balanceOf(payee), A0);
    }

    function test_Claim_RevertsForNonPayee() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payer);
        vm.expectRevert(_unauth(payer));
        esc.claimAfterWindow(id, 0);
    }

    function test_Dispute_NoArbiterReverts() public {
        uint256 id = _create(address(usdc), address(0));
        _submit(id, 0);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ArbiterAbsent.selector);
        esc.dispute(id, 0);
    }

    function test_Dispute_BoundaryAtExactEnd() public {
        uint256 id = _create(address(usdc), arbiter);
        _submit(id, 0);
        skip(WINDOW);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrowV2.ReviewWindowElapsed.selector);
        esc.dispute(id, 0);
    }
}

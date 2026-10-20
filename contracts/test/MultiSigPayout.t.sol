// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {MultiSigPayout} from "../MultiSigPayout.sol";
import {BatchPayout} from "../BatchPayout.sol";
import {ReceiptNFT} from "../ReceiptNFT.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract MultiSigPayoutV2Test is Test {
    MockERC20       usdc;
    ReceiptNFT      nft;
    BatchPayout     batch;
    MultiSigPayout  msig;

    address proposer  = address(0xA1);
    address coSign1   = address(0xB1);
    address coSign2   = address(0xC1);
    address stranger  = address(0xD1);
    address recipient1 = address(0xE1);
    address recipient2 = address(0xF1);

    uint256 constant AMT1  = 10e6;
    uint256 constant AMT2  = 20e6;
    uint256 constant TOTAL = AMT1 + AMT2;

    function setUp() public {
        usdc  = new MockERC20("USDC", "USDC", 6);
        address predicted = computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        nft   = new ReceiptNFT(predicted);
        batch = new BatchPayout(address(usdc), address(nft));
        require(address(batch) == predicted, "address mismatch in setUp");
        msig  = new MultiSigPayout(address(usdc), address(batch));

        usdc.mint(proposer, 1000e6);
        vm.prank(proposer);
        usdc.approve(address(msig), type(uint256).max);
    }

    /* ── helpers ─────────────────────────────────────────────── */

    function _recipients() internal view returns (MultiSigPayout.Recipient[] memory) {
        MultiSigPayout.Recipient[] memory recs = new MultiSigPayout.Recipient[](2);
        recs[0] = MultiSigPayout.Recipient(recipient1, AMT1);
        recs[1] = MultiSigPayout.Recipient(recipient2, AMT2);
        return recs;
    }

    function _propose() internal returns (uint256) {
        vm.prank(proposer);
        return msig.propose(_recipients(), coSign1, coSign2, "October payroll");
    }

    function _proposeAndApprove() internal returns (uint256 id) {
        id = _propose();
        vm.prank(coSign1); msig.approve(id);
        vm.prank(coSign2); msig.approve(id);
    }

    /* ── propose ─────────────────────────────────────────────── */

    function test_propose_createsProposal() public {
        uint256 id = _propose();
        assertEq(id, 1);
        assertEq(msig.proposalCount(), 1);

        (address p, address c1, address c2,
         bool a1, bool a2, uint256 total,
         uint256 rCount, MultiSigPayout.Status status,
         string memory desc,, ) = msig.getProposal(id);

        assertEq(p,      proposer);
        assertEq(c1,     coSign1);
        assertEq(c2,     coSign2);
        assertFalse(a1);
        assertFalse(a2);
        assertEq(total,  TOTAL);
        assertEq(rCount, 2);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Pending));
        assertEq(desc,   "October payroll");
    }

    function test_propose_revert_sameCoSigners() public {
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.SameCoSigners.selector);
        msig.propose(_recipients(), coSign1, coSign1, "test");
    }

    function test_propose_revert_coSignerIsProposer() public {
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.CoSignerIsProposer.selector);
        msig.propose(_recipients(), proposer, coSign2, "test");
    }

    function test_propose_revert_coSigner2IsProposer() public {
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.CoSignerIsProposer.selector);
        msig.propose(_recipients(), coSign1, proposer, "test");
    }

    function test_propose_revert_zeroCoSigner() public {
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.ZeroAddress.selector);
        msig.propose(_recipients(), address(0), coSign2, "test");
    }

    function test_propose_revert_emptyRecipients() public {
        MultiSigPayout.Recipient[] memory empty;
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.EmptyRecipients.selector);
        msig.propose(empty, coSign1, coSign2, "test");
    }

    function test_propose_revert_tooManyRecipients() public {
        MultiSigPayout.Recipient[] memory recs = new MultiSigPayout.Recipient[](101);
        for (uint i; i < 101; ++i) recs[i] = MultiSigPayout.Recipient(address(uint160(i+1)), 1e6);
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(MultiSigPayout.TooManyRecipients.selector, 101));
        msig.propose(recs, coSign1, coSign2, "test");
    }

    function test_propose_revert_zeroRecipientAddress() public {
        MultiSigPayout.Recipient[] memory recs = new MultiSigPayout.Recipient[](1);
        recs[0] = MultiSigPayout.Recipient(address(0), 1e6);
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.ZeroAddress.selector);
        msig.propose(recs, coSign1, coSign2, "test");
    }

    function test_propose_revert_zeroAmount() public {
        MultiSigPayout.Recipient[] memory recs = new MultiSigPayout.Recipient[](1);
        recs[0] = MultiSigPayout.Recipient(recipient1, 0);
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(MultiSigPayout.ZeroAmount.selector, 0));
        msig.propose(recs, coSign1, coSign2, "test");
    }

    /* ── approve ─────────────────────────────────────────────── */

    function test_approve_coSigner1() public {
        uint256 id = _propose();
        vm.prank(coSign1);
        msig.approve(id);
        (,,, bool a1, bool a2,,,,,,) = msig.getProposal(id);
        assertTrue(a1);
        assertFalse(a2);
    }

    function test_approve_coSigner2() public {
        uint256 id = _propose();
        vm.prank(coSign2);
        msig.approve(id);
        (,,, bool a1, bool a2,,,,,,) = msig.getProposal(id);
        assertFalse(a1);
        assertTrue(a2);
    }

    function test_approve_bothCoSigners() public {
        uint256 id = _propose();
        vm.prank(coSign1); msig.approve(id);
        vm.prank(coSign2); msig.approve(id);
        assertTrue(msig.isReadyToExecute(id));
    }

    function test_approve_revert_notCoSigner() public {
        uint256 id = _propose();
        vm.prank(stranger);
        vm.expectRevert(MultiSigPayout.NotCoSigner.selector);
        msig.approve(id);
    }

    function test_approve_revert_proposerCannotApprove() public {
        uint256 id = _propose();
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.NotCoSigner.selector);
        msig.approve(id);
    }

    function test_approve_revert_doubleApprove() public {
        uint256 id = _propose();
        vm.prank(coSign1); msig.approve(id);
        vm.prank(coSign1);
        vm.expectRevert(MultiSigPayout.AlreadyApproved.selector);
        msig.approve(id);
    }

    function test_approve_revert_expired() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + 8 days);
        vm.prank(coSign1);
        vm.expectRevert(MultiSigPayout.ProposalExpired.selector);
        msig.approve(id);
    }

    /* ── execute ─────────────────────────────────────────────── */

    function test_execute_happyPath() public {
        uint256 id = _proposeAndApprove();

        uint256 before1 = usdc.balanceOf(recipient1);
        uint256 before2 = usdc.balanceOf(recipient2);

        vm.prank(proposer);
        msig.execute(id);

        assertEq(usdc.balanceOf(recipient1), before1 + AMT1);
        assertEq(usdc.balanceOf(recipient2), before2 + AMT2);

        (,,,,,,,MultiSigPayout.Status status,,, ) = msig.getProposal(id);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Executed));
    }

    function test_execute_revert_coSignerCannotExecute() public {
        uint256 id = _proposeAndApprove();
        usdc.mint(coSign1, TOTAL);
        vm.startPrank(coSign1);
        usdc.approve(address(msig), type(uint256).max);
        vm.expectRevert(MultiSigPayout.NotProposer.selector);
        msig.execute(id);
        vm.stopPrank();
    }

    function test_execute_revert_strangerCannotExecute() public {
        uint256 id = _proposeAndApprove();
        vm.prank(stranger);
        vm.expectRevert(MultiSigPayout.NotProposer.selector);
        msig.execute(id);
    }

    function test_execute_revert_quorumNotReached() public {
        uint256 id = _propose();
        vm.prank(coSign1); msig.approve(id);
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.QuorumNotReached.selector);
        msig.execute(id);
    }

    function test_execute_revert_noApprovals() public {
        uint256 id = _propose();
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.QuorumNotReached.selector);
        msig.execute(id);
    }

    function test_execute_revert_expired() public {
        uint256 id = _proposeAndApprove();
        vm.warp(block.timestamp + 8 days);
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.ProposalExpired.selector);
        msig.execute(id);
    }

    function test_execute_revert_alreadyExecuted() public {
        uint256 id = _proposeAndApprove();
        vm.prank(proposer); msig.execute(id);
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.ProposalNotPending.selector);
        msig.execute(id);
    }

    /* ── reject ─────────────────────────────────────────────── */

    function test_reject_byCoSigner1() public {
        uint256 id = _propose();
        vm.prank(coSign1);
        msig.reject(id);
        (,,,,,,,MultiSigPayout.Status status,,, ) = msig.getProposal(id);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Cancelled));
    }

    function test_reject_byCoSigner2() public {
        uint256 id = _propose();
        vm.prank(coSign2);
        msig.reject(id);
        (,,,,,,,MultiSigPayout.Status status,,, ) = msig.getProposal(id);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Cancelled));
    }

    function test_reject_afterOneApproval() public {
        uint256 id = _propose();
        vm.prank(coSign1); msig.approve(id);
        // coSign2 can still reject even after coSign1 approved
        vm.prank(coSign2); msig.reject(id);
        (,,,,,,,MultiSigPayout.Status status,,, ) = msig.getProposal(id);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Cancelled));
    }

    function test_reject_revert_notCoSigner() public {
        uint256 id = _propose();
        vm.prank(stranger);
        vm.expectRevert(MultiSigPayout.NotCoSigner.selector);
        msig.reject(id);
    }

    function test_reject_revert_proposerCannotReject() public {
        uint256 id = _propose();
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.NotCoSigner.selector);
        msig.reject(id);
    }

    function test_reject_revert_alreadyCancelled() public {
        uint256 id = _propose();
        vm.prank(coSign1); msig.reject(id);
        vm.prank(coSign2);
        vm.expectRevert(MultiSigPayout.ProposalNotPending.selector);
        msig.reject(id);
    }

    function test_reject_revert_alreadyExecuted() public {
        uint256 id = _proposeAndApprove();
        vm.prank(proposer); msig.execute(id);
        vm.prank(coSign1);
        vm.expectRevert(MultiSigPayout.ProposalNotPending.selector);
        msig.reject(id);
    }

    /* ── cancel ─────────────────────────────────────────────── */

    function test_cancel_byProposer() public {
        uint256 id = _propose();
        vm.prank(proposer);
        msig.cancel(id);
        (,,,,,,,MultiSigPayout.Status status,,, ) = msig.getProposal(id);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Cancelled));
    }

    function test_cancel_byStrangerAfterExpiry() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + 8 days);
        vm.prank(stranger);
        msig.cancel(id);
        (,,,,,,,MultiSigPayout.Status status,,, ) = msig.getProposal(id);
        assertEq(uint8(status), uint8(MultiSigPayout.Status.Cancelled));
    }

    function test_cancel_revert_strangerBeforeExpiry() public {
        uint256 id = _propose();
        vm.prank(stranger);
        vm.expectRevert(MultiSigPayout.NotProposer.selector);
        msig.cancel(id);
    }

    function test_cancel_revert_alreadyCancelled() public {
        uint256 id = _propose();
        vm.prank(proposer); msig.cancel(id);
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.ProposalNotPending.selector);
        msig.cancel(id);
    }

    function test_cancel_revert_alreadyExecuted() public {
        uint256 id = _proposeAndApprove();
        vm.prank(proposer); msig.execute(id);
        vm.prank(proposer);
        vm.expectRevert(MultiSigPayout.ProposalNotPending.selector);
        msig.cancel(id);
    }

    /* ── views ───────────────────────────────────────────────── */

    function test_isReadyToExecute_falseBeforeApprovals() public {
        uint256 id = _propose();
        assertFalse(msig.isReadyToExecute(id));
    }

    function test_isReadyToExecute_falseAfterOneApproval() public {
        uint256 id = _propose();
        vm.prank(coSign1); msig.approve(id);
        assertFalse(msig.isReadyToExecute(id));
    }

    function test_isReadyToExecute_trueAfterBothApprovals() public {
        uint256 id = _proposeAndApprove();
        assertTrue(msig.isReadyToExecute(id));
    }

    function test_isReadyToExecute_falseAfterExpiry() public {
        uint256 id = _proposeAndApprove();
        vm.warp(block.timestamp + 8 days);
        assertFalse(msig.isReadyToExecute(id));
    }

    function test_getRecipient() public {
        uint256 id = _propose();
        (address addr, uint256 amount) = msig.getRecipient(id, 0);
        assertEq(addr,   recipient1);
        assertEq(amount, AMT1);
    }

    function test_proposalCount_incrementsPerProposal() public {
        assertEq(msig.proposalCount(), 0);
        _propose();
        assertEq(msig.proposalCount(), 1);
        vm.prank(proposer);
        msig.propose(_recipients(), coSign1, coSign2, "p2");
        assertEq(msig.proposalCount(), 2);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * MultiSigPayout v2 — per-proposal co-signer model.
 *
 * Any wallet can create a proposal. When creating, the proposer names
 * exactly two co-signers. Both co-signers must approve before anyone
 * can execute the payout. No global signer registry — each proposal
 * is its own mini-multisig.
 *
 * FLOW:
 *   1. proposer calls propose(recipients, coSigner1, coSigner2, description)
 *   2. coSigner1 calls approve(proposalId)
 *   3. coSigner2 calls approve(proposalId)
 *   4. proposer calls execute(proposalId)
 *      (co-signers may reject(proposalId) at any point before execution)
 *      → contract pulls USDC from the executor, calls BatchPayout.batchPay
 *
 * DECIMALS WARNING:
 *   Every `amount` is 6-decimal ERC-20 USDC. Never mix with 18-decimal native.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IBatchPayout {
    struct Recipient {
        address addr;
        uint256 amount;
    }
    function batchPay(IBatchPayout.Recipient[] calldata recipients) external;
}

contract MultiSigPayout is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    /* ── Constants ───────────────────────────────────────────── */
    uint256 public constant EXPIRY_SECONDS = 7 days;
    uint256 public constant MAX_RECIPIENTS = 100;

    /* ── Errors ──────────────────────────────────────────────── */
    error NotParticipant();
    error NotCoSigner();
    error AlreadyApproved();
    error ProposalNotPending();
    error QuorumNotReached();
    error ProposalExpired();
    error NotExpiredYet();
    error EmptyRecipients();
    error TooManyRecipients(uint256 count);
    error ZeroAddress();
    error ZeroAmount(uint256 index);
    error SameCoSigners();
    error CoSignerIsProposer();
    error NotProposer();
    error AlreadyRejected();

    /* ── Types ───────────────────────────────────────────────── */
    enum Status { Pending, Executed, Cancelled }

    struct Recipient {
        address addr;
        uint256 amount; // 6-decimal USDC units
    }

    struct Proposal {
        address proposer;
        address coSigner1;
        address coSigner2;
        bool approved1;      // coSigner1 approved
        bool approved2;      // coSigner2 approved
        Recipient[] recipients;
        uint256 totalAmount;
        Status status;
        string description;
        uint256 createdAt;
    }

    /* ── Storage ─────────────────────────────────────────────── */
    IERC20 public immutable usdc;
    IBatchPayout public immutable batchPayout;

    uint256 private _proposalCounter;

    // proposalId => Proposal (1-indexed; id 0 is never used)
    mapping(uint256 => Proposal) private _proposals;

    /* ── Events ──────────────────────────────────────────────── */
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed coSigner1,
        address coSigner2,
        uint256 totalAmount,
        uint256 recipientCount,
        string description
    );
    event ProposalApproved(
        uint256 indexed proposalId,
        address indexed signer,
        bool approved1,
        bool approved2
    );
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);
    event ProposalCancelled(uint256 indexed proposalId, address indexed canceller);
    event ProposalRejected(uint256 indexed proposalId, address indexed rejecter);

    /* ── ERC721Receiver ─────────────────────────────────────── */
    /// @dev Accept receipt NFTs minted by BatchPayout on execute.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /* ── Constructor ─────────────────────────────────────────── */
    constructor(address _usdc, address _batchPayout) {
        require(_usdc != address(0), "usdc zero");
        require(_batchPayout != address(0), "batchPayout zero");
        usdc = IERC20(_usdc);
        batchPayout = IBatchPayout(_batchPayout);
    }

    /* ── Write ───────────────────────────────────────────────── */

    /**
     * @notice Create a new payout proposal with two required co-signers.
     * @param recipients  List of (addr, amount) pairs; max 100; no zero addr/amount.
     * @param coSigner1   First required approver — must differ from proposer and coSigner2.
     * @param coSigner2   Second required approver — must differ from proposer and coSigner1.
     * @param description Human-readable memo (e.g. "October payroll").
     * @return proposalId The new proposal ID (1-indexed).
     */
    function propose(
        Recipient[] calldata recipients,
        address coSigner1,
        address coSigner2,
        string calldata description
    ) external returns (uint256 proposalId) {
        address proposer = msg.sender;

        // Validate co-signers
        if (coSigner1 == address(0) || coSigner2 == address(0)) revert ZeroAddress();
        if (coSigner1 == coSigner2)   revert SameCoSigners();
        if (coSigner1 == proposer || coSigner2 == proposer) revert CoSignerIsProposer();

        // Validate recipients
        if (recipients.length == 0)                   revert EmptyRecipients();
        if (recipients.length > MAX_RECIPIENTS)       revert TooManyRecipients(recipients.length);

        uint256 total;
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i].addr   == address(0)) revert ZeroAddress();
            if (recipients[i].amount == 0)          revert ZeroAmount(i);
            total += recipients[i].amount;
        }

        // Create proposal
        unchecked { proposalId = ++_proposalCounter; }
        Proposal storage p = _proposals[proposalId];
        p.proposer     = proposer;
        p.coSigner1    = coSigner1;
        p.coSigner2    = coSigner2;
        p.approved1    = false;
        p.approved2    = false;
        p.totalAmount  = total;
        p.status       = Status.Pending;
        p.description  = description;
        p.createdAt    = block.timestamp;

        for (uint256 i; i < recipients.length; ++i) {
            p.recipients.push(Recipient(recipients[i].addr, recipients[i].amount));
        }

        emit ProposalCreated(proposalId, proposer, coSigner1, coSigner2, total, recipients.length, description);
    }

    /**
     * @notice Approve a pending proposal. Only coSigner1 or coSigner2 may call.
     * @param proposalId The proposal to approve.
     */
    function approve(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.status != Status.Pending)               revert ProposalNotPending();
        if (_isExpired(p))                            revert ProposalExpired();

        address caller = msg.sender;
        if (caller == p.coSigner1) {
            if (p.approved1) revert AlreadyApproved();
            p.approved1 = true;
        } else if (caller == p.coSigner2) {
            if (p.approved2) revert AlreadyApproved();
            p.approved2 = true;
        } else {
            revert NotCoSigner();
        }

        emit ProposalApproved(proposalId, caller, p.approved1, p.approved2);
    }

    /**
     * @notice Execute an approved proposal. Only the proposer may call.
     *         Proposer must have approved the USDC allowance for totalAmount before calling.
     * @param proposalId The proposal to execute.
     */
    function execute(uint256 proposalId) external nonReentrant {
        Proposal storage p = _proposals[proposalId];
        if (p.status != Status.Pending)           revert ProposalNotPending();
        if (_isExpired(p))                        revert ProposalExpired();
        if (msg.sender != p.proposer)             revert NotProposer();
        if (!p.approved1 || !p.approved2)         revert QuorumNotReached();

        p.status = Status.Executed;

        // Pull USDC from executor and forward to BatchPayout
        usdc.safeTransferFrom(msg.sender, address(this), p.totalAmount);
        usdc.forceApprove(address(batchPayout), p.totalAmount);

        // Build recipient array for BatchPayout
        IBatchPayout.Recipient[] memory recs = new IBatchPayout.Recipient[](p.recipients.length);
        for (uint256 i; i < p.recipients.length; ++i) {
            recs[i] = IBatchPayout.Recipient(p.recipients[i].addr, p.recipients[i].amount);
        }

        batchPayout.batchPay(recs);

        emit ProposalExecuted(proposalId, msg.sender);
    }

    /**
     * @notice Reject a pending proposal. Only coSigner1 or coSigner2 may call.
     *         A rejection by either co-signer immediately cancels the proposal.
     * @param proposalId The proposal to reject.
     */
    function reject(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.status != Status.Pending)                              revert ProposalNotPending();
        if (_isExpired(p))                                           revert ProposalExpired();
        if (msg.sender != p.coSigner1 && msg.sender != p.coSigner2) revert NotCoSigner();

        p.status = Status.Cancelled;
        emit ProposalRejected(proposalId, msg.sender);
    }

    /**
     * @notice Cancel a pending proposal.
     *         Proposer can cancel any time while Pending.
     *         Anyone can cancel if the proposal has expired (>7 days old).
     * @param proposalId The proposal to cancel.
     */
    function cancel(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.status != Status.Pending) revert ProposalNotPending();

        bool isProposer = msg.sender == p.proposer;
        bool expired    = _isExpired(p);

        if (!isProposer && !expired) revert NotProposer();

        p.status = Status.Cancelled;
        emit ProposalCancelled(proposalId, msg.sender);
    }

    /* ── Views ───────────────────────────────────────────────── */

    /// @notice Total number of proposals ever created (proposals are 1-indexed).
    function proposalCount() external view returns (uint256) {
        return _proposalCounter;
    }

    /// @notice Core proposal data (excludes recipients array for gas efficiency).
    function getProposal(uint256 proposalId) external view returns (
        address proposer,
        address coSigner1,
        address coSigner2,
        bool approved1,
        bool approved2,
        uint256 totalAmount,
        uint256 recipientCount,
        Status status,
        string memory description,
        uint256 createdAt,
        bool expired
    ) {
        Proposal storage p = _proposals[proposalId];
        return (
            p.proposer,
            p.coSigner1,
            p.coSigner2,
            p.approved1,
            p.approved2,
            p.totalAmount,
            p.recipients.length,
            p.status,
            p.description,
            p.createdAt,
            _isExpired(p)
        );
    }

    /// @notice Get a single recipient from a proposal.
    function getRecipient(uint256 proposalId, uint256 index) external view returns (address addr, uint256 amount) {
        Recipient storage r = _proposals[proposalId].recipients[index];
        return (r.addr, r.amount);
    }

    /// @notice True when both co-signers have approved and the proposal is still Pending + not expired.
    function isReadyToExecute(uint256 proposalId) external view returns (bool) {
        Proposal storage p = _proposals[proposalId];
        return p.status == Status.Pending && p.approved1 && p.approved2 && !_isExpired(p);
    }

    /* ── Internal ────────────────────────────────────────────── */

    function _isExpired(Proposal storage p) internal view returns (bool) {
        return block.timestamp > p.createdAt + EXPIRY_SECONDS;
    }

    function _isParticipant(Proposal storage p, address addr) internal view returns (bool) {
        return addr == p.proposer || addr == p.coSigner1 || addr == p.coSigner2;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MilestoneEscrowV2 — titled milestones with readable evidence and bounded revisions
/// @notice Milestone escrow for USDC and EURC on Arc Testnet, with change requests and optional arbitration.
/// @dev Amounts use raw token units (6 decimals for USDC/EURC). No admin, upgrade or pause path.
///      Token addresses are trusted deployment inputs; the contract does not discover their identity.
contract MilestoneEscrowV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Funded, Submitted, Released, Disputed, Resolved, Refunded, ChangesRequested }

    struct Escrow {
        address payer;
        address payee;
        address arbiter;
        address token;
        uint64 reviewWindow;
        uint64 deadline;
        string memo;
        uint256 milestoneCount;
        bool payerConfirmed;
        bool payeeConfirmed;
        bool cancelled;
    }

    struct Milestone {
        uint256 amount;
        Status status;
        uint256 submittedAt;
        uint256 disputedAt;
        uint256 changesRequestedAt;
        uint8 revisions;
        string title;
        string note;
        string changeReason;
    }

    /// @notice First immutable allowlisted token (USDC).
    address public immutable usdc;
    /// @notice Second immutable allowlisted token (EURC).
    address public immutable eurc;
    /// @notice Maximum milestones per escrow.
    uint256 public constant MAX_MILESTONES = 20;
    /// @notice Minimum permitted review window.
    uint256 public constant MIN_REVIEW_WINDOW = 1 days;
    /// @notice Maximum permitted review window.
    uint256 public constant MAX_REVIEW_WINDOW = 90 days;
    /// @notice Delay after a dispute before permissionless split resolution.
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    /// @notice Maximum change requests permitted per milestone across all submissions.
    uint8 public constant MAX_REVISIONS = 3;

    uint256 private _escrowCount;
    mapping(uint256 => Escrow) private _escrows;
    mapping(uint256 => mapping(uint256 => Milestone)) private _milestones;
    mapping(address => uint256[]) private _escrowsOf;
    /// @dev Dispute awards and deferred payouts remain in custody until independently withdrawn.
    mapping(address => mapping(address token => uint256)) private credits;
    /// @notice Token amounts backing outstanding Funded, Submitted, Disputed and ChangesRequested milestones.
    /// @dev Excludes withdrawal credits; accounted custody equals this plus all credits per token.
    ///      Unsolicited token transfers are surplus and do not create milestone funds or credits.
    mapping(address => uint256) public unallocated;

    error ZeroAddress();
    error IdenticalTokens();
    error InvalidParticipants();
    error TokenNotAllowed(address token);
    error InvalidMilestoneCount(uint256 count);
    error ZeroMilestoneAmount(uint256 index);
    /// @notice The number of titles does not match the number of milestone amounts.
    error TitleCountMismatch();
    /// @notice The title at the given zero-based index exceeds 64 bytes.
    error TitleTooLong(uint256 index);
    /// @notice The submission note exceeds 280 bytes.
    error NoteTooLong();
    /// @notice The milestone has already used all permitted change requests.
    error RevisionLimitReached();
    /// @notice A change request must include a non-empty reason.
    error EmptyReason();
    /// @notice The change-request reason exceeds 280 bytes.
    error ReasonTooLong();
    error InvalidReviewWindow(uint64 reviewWindow);
    error InvalidDeadline(uint64 deadline);
    error IncorrectReceivedAmount(uint256 expected, uint256 received);
    error EscrowNotFound(uint256 id);
    error MilestoneNotFound(uint256 id, uint256 index);
    error Unauthorized(address caller);
    /// @notice The milestone is not in an allowed state; Funded represents either state for submit/refund.
    error InvalidStatus(Status expected, Status actual);
    error ReviewWindowNotElapsed();
    /// @notice The submission review window has ended, preventing disputes or change requests.
    error ReviewWindowElapsed();
    /// @notice No arbiter is configured for a dispute or escalation.
    error ArbiterAbsent();
    error InvalidPayeeAmount(uint256 amount, uint256 maximum);
    error DisputeTimeoutNotElapsed();
    /// @notice The deadline, including the response window when changes are requested, has not strictly passed.
    error DeadlineNotPassed();
    error AlreadyConfirmed();
    error AlreadyCancelled();
    error NoCredit(address account, address token);

    event EscrowCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        address arbiter,
        address token,
        uint256 total,
        uint256 milestoneCount,
        uint64 deadline,
        uint64 reviewWindow,
        string memo
    );
    /// @notice Emitted on initial submission or resubmission, with the latest public note or link.
    event MilestoneSubmitted(uint256 indexed id, uint256 indexed i, string note);
    /// @notice Emitted when the payer requests changes, with the cumulative request count.
    event ChangesRequested(uint256 indexed id, uint256 indexed i, string reason, uint8 revisions);
    event MilestoneReleased(uint256 indexed id, uint256 indexed i, address payee, uint256 amount);
    /// @notice Emitted when the payer disputes a submission or the payee escalates a change request.
    event MilestoneDisputed(uint256 indexed id, uint256 indexed i);
    event MilestoneResolved(uint256 indexed id, uint256 indexed i, uint256 payeeAmount, uint256 payerAmount);
    /// @notice Emitted when a Funded or ChangesRequested milestone is refunded to the payer.
    event MilestoneRefunded(uint256 indexed id, uint256 indexed i, uint256 amount);
    event CancelConfirmed(uint256 indexed id, address indexed by);
    event EscrowCancelled(uint256 indexed id);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);
    event PayoutDeferred(address indexed account, address indexed token, uint256 amount);

    /// @param usdc_ Nonzero USDC token address.
    /// @param eurc_ Nonzero EURC token address, distinct from USDC.
    constructor(address usdc_, address eurc_) {
        if (usdc_ == address(0) || eurc_ == address(0)) revert ZeroAddress();
        if (usdc_ == eurc_) revert IdenticalTokens();
        usdc = usdc_;
        eurc = eurc_;
    }

    /// @notice Fund an escrow in one transfer; IDs start at one.
    /// @param payee Recipient who submits milestones.
    /// @param arbiter Optional arbiter; zero disables disputes.
    /// @param token Either immutable allowlisted token.
    /// @param amounts One to twenty positive milestone amounts, in raw token units.
    /// @param titles One title per amount, each at most 64 bytes; empty titles are allowed.
    /// @param reviewWindow Review duration, inclusive range one to ninety days.
    /// @param deadline Future timestamp after which Funded milestones can be refunded.
    /// @param memo Public escrow description.
    /// @return id The newly created escrow ID.
    function createEscrow(
        address payee,
        address arbiter,
        address token,
        uint256[] calldata amounts,
        string[] calldata titles,
        uint64 reviewWindow,
        uint64 deadline,
        string calldata memo
    ) external nonReentrant returns (uint256 id) {
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender || (arbiter != address(0) && (arbiter == msg.sender || arbiter == payee))) {
            revert InvalidParticipants();
        }
        if (token != usdc && token != eurc) revert TokenNotAllowed(token);
        uint256 count = amounts.length;
        if (count == 0 || count > MAX_MILESTONES) revert InvalidMilestoneCount(count);
        if (titles.length != count) revert TitleCountMismatch();
        if (reviewWindow < MIN_REVIEW_WINDOW || reviewWindow > MAX_REVIEW_WINDOW) {
            revert InvalidReviewWindow(reviewWindow);
        }
        if (uint256(deadline) <= block.timestamp) revert InvalidDeadline(deadline);

        uint256 total;
        for (uint256 i; i < count; ++i) {
            if (amounts[i] == 0) revert ZeroMilestoneAmount(i);
            if (bytes(titles[i]).length > 64) revert TitleTooLong(i);
            total += amounts[i];
        }

        id = ++_escrowCount;
        _escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            arbiter: arbiter,
            token: token,
            reviewWindow: reviewWindow,
            deadline: deadline,
            memo: memo,
            milestoneCount: count,
            payerConfirmed: false,
            payeeConfirmed: false,
            cancelled: false
        });
        for (uint256 i; i < count; ++i) {
            _milestones[id][i].amount = amounts[i];
            _milestones[id][i].title = titles[i];
            // The default status is Funded.
        }
        _escrowsOf[msg.sender].push(id);
        _escrowsOf[payee].push(id);
        if (arbiter != address(0)) _escrowsOf[arbiter].push(id);

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), total);
        uint256 afterBalance = asset.balanceOf(address(this));
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != total) revert IncorrectReceivedAmount(total, received);
        unallocated[token] += total;

        emit EscrowCreated(id, msg.sender, payee, arbiter, token, total, count, deadline, reviewWindow, memo);
    }

    /// @notice Payee submits a Funded or ChangesRequested milestone and starts a fresh review window.
    /// @dev Submission is allowed after the deadline until that milestone is refunded.
    ///      Prior change-request metadata and the cumulative revision count are retained.
    /// @param id Escrow ID.
    /// @param i Zero-based milestone index.
    /// @param note Public note or evidence link, at most 280 bytes; may be empty.
    function submitMilestone(uint256 id, uint256 i, string calldata note) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payee) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        if (m.status != Status.Funded && m.status != Status.ChangesRequested) {
            revert InvalidStatus(Status.Funded, m.status);
        }
        if (bytes(note).length > 280) revert NoteTooLong();
        m.note = note;
        m.status = Status.Submitted;
        m.submittedAt = block.timestamp;
        emit MilestoneSubmitted(id, i, note);
    }

    /// @notice Payer requests changes to a Submitted milestone strictly before its review window ends.
    /// @dev At most MAX_REVISIONS requests are permitted per milestone; funds remain outstanding.
    /// @param id Escrow ID.
    /// @param i Zero-based milestone index.
    /// @param reason Public, non-empty change-request reason, at most 280 bytes.
    function requestChanges(uint256 id, uint256 i, string calldata reason) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payer) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.Submitted);
        if (block.timestamp >= m.submittedAt + uint256(e.reviewWindow)) revert ReviewWindowElapsed();
        if (m.revisions >= MAX_REVISIONS) revert RevisionLimitReached();
        if (bytes(reason).length == 0) revert EmptyReason();
        if (bytes(reason).length > 280) revert ReasonTooLong();
        m.status = Status.ChangesRequested;
        m.changesRequestedAt = block.timestamp;
        m.changeReason = reason;
        m.revisions += 1;
        emit ChangesRequested(id, i, reason, m.revisions);
    }

    /// @notice Payee escalates a ChangesRequested milestone to the configured arbiter.
    /// @dev Starts the dispute timeout without changing outstanding custody or transferring tokens.
    /// @param id Escrow ID.
    /// @param i Zero-based milestone index.
    function escalate(uint256 id, uint256 i) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payee) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.ChangesRequested);
        if (e.arbiter == address(0)) revert ArbiterAbsent();
        m.status = Status.Disputed;
        m.disputedAt = block.timestamp;
        emit MilestoneDisputed(id, i);
    }

    /// @notice Payer approves a Submitted milestone at any time, paying or crediting the payee in full.
    /// @dev A reverted or false-returning payout records a credit withdrawable via withdraw(token).
    function approveMilestone(uint256 id, uint256 i) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payer) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.Submitted);
        _release(e, m, id, i);
    }

    /// @notice Payee claims a Submitted milestone at or after its review window ends.
    /// @dev A reverted or false-returning payout records a credit withdrawable via withdraw(token).
    function claimAfterWindow(uint256 id, uint256 i) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payee) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.Submitted);
        if (block.timestamp < m.submittedAt + uint256(e.reviewWindow)) revert ReviewWindowNotElapsed();
        _release(e, m, id, i);
    }

    /// @notice Payer disputes a Submitted milestone strictly before the review window ends.
    function dispute(uint256 id, uint256 i) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payer) revert Unauthorized(msg.sender);
        if (e.arbiter == address(0)) revert ArbiterAbsent();
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.Submitted);
        if (block.timestamp >= m.submittedAt + uint256(e.reviewWindow)) revert ReviewWindowElapsed();
        m.status = Status.Disputed;
        m.disputedAt = block.timestamp;
        emit MilestoneDisputed(id, i);
    }

    /// @notice Arbiter credits a Disputed milestone to payee and payer for independent withdrawal.
    /// @param payeeAmount Raw token amount credited to the payee; remainder is credited to payer.
    /// @dev Arbiter authority remains valid after the timeout until someone resolves the milestone.
    ///      Resolution makes no token transfers; a blocked recipient cannot block the other's award.
    function resolve(uint256 id, uint256 i, uint256 payeeAmount) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.arbiter) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.Disputed);
        if (payeeAmount > m.amount) revert InvalidPayeeAmount(payeeAmount, m.amount);
        _resolve(e, m, id, i, payeeAmount);
    }

    /// @notice Anyone may resolve a dispute at or after thirty days, crediting an equal split.
    /// @dev Awards are withdrawn independently; for odd amounts payer gets the extra smallest token unit.
    function resolveByTimeout(uint256 id, uint256 i) external nonReentrant {
        Escrow storage e = _escrow(id);
        Milestone storage m = _milestone(e, id, i);
        _requireStatus(m, Status.Disputed);
        if (block.timestamp < m.disputedAt + DISPUTE_TIMEOUT) revert DisputeTimeoutNotElapsed();
        _resolve(e, m, id, i, m.amount / 2);
    }

    /// @notice Payer refunds a Funded milestone after its deadline, or a ChangesRequested milestone after its response window.
    /// @dev ChangesRequested requires strictly after max(deadline, changesRequestedAt) + reviewWindow.
    ///      A reverted or false-returning refund records a credit withdrawable via withdraw(token).
    function refundUnstarted(uint256 id, uint256 i) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (msg.sender != e.payer) revert Unauthorized(msg.sender);
        Milestone storage m = _milestone(e, id, i);
        uint256 refundAfter = uint256(e.deadline);
        if (m.status == Status.ChangesRequested) {
            if (m.changesRequestedAt > refundAfter) refundAfter = m.changesRequestedAt;
            refundAfter += uint256(e.reviewWindow);
        } else {
            _requireStatus(m, Status.Funded);
        }
        if (block.timestamp <= refundAfter) revert DeadlineNotPassed();
        m.status = Status.Refunded;
        unallocated[e.token] -= m.amount;
        emit MilestoneRefunded(id, i, m.amount);
        _payOrCredit(e.token, e.payer, m.amount);
    }

    /// @notice Payer and payee each confirm cancellation once; second confirmation refunds Funded milestones.
    /// @dev Submitted, Disputed and ChangesRequested milestones remain actionable. All refund effects precede the transfer.
    ///      A reverted or false-returning refund records a credit withdrawable via withdraw(token).
    function cancelByAgreement(uint256 id) external nonReentrant {
        Escrow storage e = _escrow(id);
        if (e.cancelled) revert AlreadyCancelled();
        if (msg.sender == e.payer) {
            if (e.payerConfirmed) revert AlreadyConfirmed();
            e.payerConfirmed = true;
        } else if (msg.sender == e.payee) {
            if (e.payeeConfirmed) revert AlreadyConfirmed();
            e.payeeConfirmed = true;
        } else {
            revert Unauthorized(msg.sender);
        }
        emit CancelConfirmed(id, msg.sender);
        if (!e.payerConfirmed || !e.payeeConfirmed) return;

        e.cancelled = true;
        uint256 refund;
        for (uint256 i; i < e.milestoneCount; ++i) {
            Milestone storage m = _milestones[id][i];
            if (m.status == Status.Funded) {
                m.status = Status.Refunded;
                refund += m.amount;
                emit MilestoneRefunded(id, i, m.amount);
            }
        }
        unallocated[e.token] -= refund;
        emit EscrowCancelled(id);
        if (refund != 0) _payOrCredit(e.token, e.payer, refund);
    }

    /// @notice Withdraw all of the caller's dispute and deferred payout credits for a token to the caller.
    /// @dev Reverts with NoCredit if zero. Credit is cleared before transfer; a failed transfer
    ///      restores it on revert and does not affect another account's credit or resolution.
    ///      Token restrictions on the caller or this contract can still prevent withdrawal.
    /// @param token Token whose credited balance is withdrawn, in raw token units.
    function withdraw(address token) external nonReentrant {
        uint256 amount = credits[msg.sender][token];
        if (amount == 0) revert NoCredit(msg.sender, token);
        credits[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Return an account's withdrawable dispute and deferred payout credit in raw token units.
    /// @param account Recipient of the dispute award or deferred payout.
    /// @param token Token in which the credit is denominated.
    function creditOf(address account, address token) external view returns (uint256) {
        return credits[account][token];
    }

    /// @notice Return escrow details and cancellation flags; reverts for an unknown ID.
    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return _escrow(id);
    }

    /// @notice Return a milestone by its zero-based index; reverts for an unknown ID or index.
    function getMilestone(uint256 id, uint256 i) external view returns (Milestone memory) {
        Escrow storage e = _escrow(id);
        return _milestone(e, id, i);
    }

    /// @notice Total escrows created; escrow IDs span one through this count.
    function escrowCount() external view returns (uint256) {
        return _escrowCount;
    }

    /// @notice Return IDs where participant is payer, payee or nonzero arbiter, in creation order.
    function escrowsOf(address participant) external view returns (uint256[] memory) {
        return _escrowsOf[participant];
    }

    function _escrow(uint256 id) private view returns (Escrow storage e) {
        if (id == 0 || id > _escrowCount) revert EscrowNotFound(id);
        e = _escrows[id];
    }

    function _milestone(Escrow storage e, uint256 id, uint256 i)
        private view returns (Milestone storage m)
    {
        if (i >= e.milestoneCount) revert MilestoneNotFound(id, i);
        m = _milestones[id][i];
    }

    function _requireStatus(Milestone storage m, Status expected) private view {
        if (m.status != expected) revert InvalidStatus(expected, m.status);
    }

    function _release(Escrow storage e, Milestone storage m, uint256 id, uint256 i) private {
        m.status = Status.Released;
        unallocated[e.token] -= m.amount;
        emit MilestoneReleased(id, i, e.payee, m.amount);
        _payOrCredit(e.token, e.payee, m.amount);
    }

    /// @dev Callers finalize status and remove the amount from unallocated before calling.
    ///      Trusted allowlisted tokens must not move funds when returning false.
    ///      Success reduces custody; failure retains custody and replaces the milestone liability
    ///      with an equal withdrawal credit, preserving balance >= unallocated + all credits.
    function _payOrCredit(address token, address to, uint256 amount) internal {
        try IERC20(token).transfer(to, amount) returns (bool ok) {
            if (ok) return;
        } catch {}
        credits[to][token] += amount;
        emit PayoutDeferred(to, token, amount);
    }

    function _resolve(Escrow storage e, Milestone storage m, uint256 id, uint256 i, uint256 payeeAmount)
        private
    {
        uint256 payerAmount = m.amount - payeeAmount;
        m.status = Status.Resolved;
        unallocated[e.token] -= m.amount;
        credits[e.payee][e.token] += payeeAmount;
        credits[e.payer][e.token] += payerAmount;
        emit MilestoneResolved(id, i, payeeAmount, payerAmount);
    }
}

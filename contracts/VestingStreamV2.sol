// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * TESTNET build, mainnet use requires independent review.
 *
 * DECIMALS WARNING (Arc Testnet, chain ID 5042002):
 * - Gas is paid from the native USDC balance (18 decimals).
 * - This contract ONLY uses the USDC ERC-20 token interface (6 decimals),
 *   supplied as constructor arg `_usdc`.
 * - Arc Testnet USDC: 0x3600000000000000000000000000000000000000.
 * - NEVER mix native-balance units and ERC-20 units.
 * - Every `amount` handled here is in 6-decimal ERC-20 USDC units.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract VestingStreamV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroDuration();
    error NotBeneficiary();
    error NotGrantor();
    error AlreadyCancelled();
    error NothingToClaim();
    error StreamNotFound(uint256 streamId);
    error LeaveRequestNotFound(uint256 requestId);
    error LeaveNotPending();
    error InvalidLeavePeriod();
    error LeaveStartsAfterStreamEnd();
    error ReasonTooLong();
    error TooManyPendingRequests();
    error TooManyRequests();
    error AutoApproveTooEarly();
    error AutoApproveLeaveTooLong();
    error LeaveAlreadyEnded();
    error BreakOverlap();
    error TooManyBreaks();
    error BreakTooLong();
    error NoticeTooShort();

    /// @notice Maximum approved breaks per stream.
    uint256 public constant MAX_BREAKS = 12;
    /// @notice Maximum total break length as basis points of original duration.
    uint256 public constant MAX_TOTAL_BREAK_BPS = 5000;
    /// @notice Waiting period before permissionless leave approval.
    uint256 public constant AUTO_APPROVE_DELAY = 7 days;
    /// @notice Maximum originally requested leave length eligible for automatic approval.
    uint256 public constant MAX_AUTO_APPROVE_LEAVE = 14 days;
    /// @notice Minimum advance notice for a grantor-scheduled break.
    uint256 public constant GRANTOR_BREAK_NOTICE = 1 days;
    /// @notice Maximum concurrent pending leave requests per stream.
    uint256 public constant MAX_PENDING_REQUESTS = 5;
    /// @notice Maximum lifetime leave requests per stream, including terminal requests.
    uint256 public constant MAX_REQUESTS_PER_STREAM = 40;
    /// @notice Maximum UTF-8 reason length in bytes, not characters.
    uint256 public constant MAX_REASON_BYTES = 140;

    struct Stream {
        address grantor;
        address beneficiary;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 endTime;
        bool cancelled;
        uint256 finalVested;
        uint256 totalBreakTime;
    }

    struct Break {
        uint64 start;
        uint64 end;
    }

    enum LeaveStatus {
        Pending,
        Approved,
        Rejected,
        Cancelled
    }

    struct LeaveRequest {
        uint256 streamId;
        uint64 start;
        uint64 end;
        uint256 requestedAt;
        LeaveStatus status;
        string reason;
    }

    /// @notice ERC-20 USDC used for all deposits and payments.
    IERC20 public immutable usdc;

    uint256 private _streamIdCounter = 1;
    uint256 private _requestIdCounter = 1;
    /// @notice Stream data; endTime always remains the original end.
    mapping(uint256 id => Stream) public streams;
    /// @notice Pull-payment USDC credits created on cancellation.
    mapping(address => uint256) public pendingWithdrawals;
    /// @notice Stream IDs in creation order for each grantor.
    mapping(address => uint256[]) public grantorStreams;
    /// @notice Stream IDs in creation order for each beneficiary.
    mapping(address => uint256[]) public beneficiaryStreams;
    mapping(uint256 => Break[]) private _breaks;
    mapping(uint256 => LeaveRequest) private _leaveRequests;
    mapping(uint256 => uint256[]) private _leaveRequestIds;
    mapping(uint256 => uint256) private _pendingLeaveCount;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed grantor,
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
    );
    event Claimed(uint256 indexed streamId, address indexed beneficiary, uint256 amount);
    event StreamCancelled(uint256 indexed streamId, uint256 returnedToGrantor, uint256 paidToBeneficiary);
    event Withdrawn(address indexed recipient, uint256 amount);
    event LeaveRequested(
        uint256 indexed requestId,
        uint256 indexed streamId,
        uint64 start,
        uint64 end,
        string reason
    );
    event LeaveApproved(uint256 indexed requestId, uint256 indexed streamId, address indexed by);
    event LeaveRejected(uint256 indexed requestId, uint256 indexed streamId);
    event LeaveRequestCancelled(uint256 indexed requestId, uint256 indexed streamId);
    event BreakAdded(
        uint256 indexed streamId,
        uint64 start,
        uint64 end,
        uint256 indexed requestId,
        uint256 totalBreakTime,
        uint256 newEffectiveEnd
    );

    /// @notice Configure the ERC-20 USDC address; no admin is installed.
    /// @param _usdc Use 0x3600000000000000000000000000000000000000 on Arc Testnet.
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Create a linear vesting stream by depositing USDC.
     *
     * TRUST: grantor chooses beneficiary, amount, and duration. On-chain validation
     * enforces non-zero beneficiary/amount/duration only; beneficiary may be EOA or contract.
     */
    function createStream(address beneficiary, uint256 amount, uint256 duration)
        external
        nonReentrant
        returns (uint256 streamId)
    {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (duration == 0) revert ZeroDuration();

        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + duration;

        streamId = _streamIdCounter;
        streams[streamId] = Stream({
            grantor: msg.sender,
            beneficiary: beneficiary,
            totalAmount: amount,
            claimedAmount: 0,
            startTime: startTime,
            endTime: endTime,
            cancelled: false,
            finalVested: 0,
            totalBreakTime: 0
        });

        unchecked {
            _streamIdCounter = streamId + 1;
        }

        grantorStreams[msg.sender].push(streamId);
        beneficiaryStreams[beneficiary].push(streamId);

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit StreamCreated(streamId, msg.sender, beneficiary, amount, startTime, endTime);
    }

    /**
     * @notice Claim any currently vested USDC from an active stream.
     */
    function claim(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);

        if (msg.sender != stream.beneficiary) revert NotBeneficiary();
        if (stream.cancelled) revert AlreadyCancelled();

        uint256 vested = vestedAmount(streamId);
        uint256 claimable = vested - stream.claimedAmount;
        if (claimable == 0) revert NothingToClaim();

        stream.claimedAmount += claimable;
        usdc.safeTransfer(stream.beneficiary, claimable);

        emit Claimed(streamId, stream.beneficiary, claimable);
    }

    /**
     * @notice Cancel a stream, crediting vested-but-unclaimed USDC to the beneficiary
     * and unvested USDC to the grantor for withdrawal. Original endTime is preserved.
     */
    function cancel(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);

        if (msg.sender != stream.grantor) revert NotGrantor();
        if (stream.cancelled) revert AlreadyCancelled();

        uint256 vested = _vestedAt(streamId, stream, block.timestamp);
        uint256 paidToBeneficiary = vested - stream.claimedAmount;
        uint256 returnedToGrantor = stream.totalAmount - vested;

        stream.cancelled = true;
        stream.finalVested = vested;

        if (paidToBeneficiary > 0) {
            stream.claimedAmount += paidToBeneficiary;
            pendingWithdrawals[stream.beneficiary] += paidToBeneficiary;
        }

        if (returnedToGrantor > 0) {
            pendingWithdrawals[stream.grantor] += returnedToGrantor;
        }

        emit StreamCancelled(streamId, returnedToGrantor, paidToBeneficiary);
    }

    /// @notice Withdraw all cancellation credits owed to the caller.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToClaim();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Request a finite leave period as beneficiary; timestamps are Unix seconds.
    /// @dev Requests may start in the past, but approval only applies their remaining future portion.
    function requestLeave(uint256 streamId, uint64 start, uint64 end, string calldata reason)
        external
        returns (uint256 requestId)
    {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (stream.cancelled) revert AlreadyCancelled();
        if (msg.sender != stream.beneficiary) revert NotBeneficiary();
        if (end <= start) revert InvalidLeavePeriod();
        if (uint256(start) >= stream.endTime + stream.totalBreakTime) revert LeaveStartsAfterStreamEnd();
        if (bytes(reason).length > MAX_REASON_BYTES) revert ReasonTooLong();
        if (_pendingLeaveCount[streamId] >= MAX_PENDING_REQUESTS) revert TooManyPendingRequests();
        if (_leaveRequestIds[streamId].length >= MAX_REQUESTS_PER_STREAM) revert TooManyRequests();

        requestId = _requestIdCounter;
        _requestIdCounter += 1;
        _leaveRequests[requestId] = LeaveRequest({
            streamId: streamId,
            start: start,
            end: end,
            requestedAt: block.timestamp,
            status: LeaveStatus.Pending,
            reason: reason
        });
        _leaveRequestIds[streamId].push(requestId);
        _pendingLeaveCount[streamId] += 1;

        emit LeaveRequested(requestId, streamId, start, end, reason);
    }

    /// @notice Approve a pending request as grantor, clamping its start to now.
    function approveLeave(uint256 requestId) external {
        LeaveRequest storage request = _getPendingRequestOrRevert(requestId);
        Stream storage stream = _getStreamOrRevert(request.streamId);
        if (msg.sender != stream.grantor) revert NotGrantor();
        _approveLeave(requestId, request, stream);
    }

    /// @notice Reject a pending request as grantor, including on a cancelled stream.
    function rejectLeave(uint256 requestId) external {
        LeaveRequest storage request = _getPendingRequestOrRevert(requestId);
        Stream storage stream = _getStreamOrRevert(request.streamId);
        if (msg.sender != stream.grantor) revert NotGrantor();

        request.status = LeaveStatus.Rejected;
        _pendingLeaveCount[request.streamId] -= 1;
        emit LeaveRejected(requestId, request.streamId);
    }

    /// @notice Withdraw a pending request as beneficiary, including on a cancelled stream.
    function cancelLeaveRequest(uint256 requestId) external {
        LeaveRequest storage request = _getPendingRequestOrRevert(requestId);
        Stream storage stream = _getStreamOrRevert(request.streamId);
        if (msg.sender != stream.beneficiary) revert NotBeneficiary();

        request.status = LeaveStatus.Cancelled;
        _pendingLeaveCount[request.streamId] -= 1;
        emit LeaveRequestCancelled(requestId, request.streamId);
    }

    /// @notice Anyone may approve a pending request after seven days if its original length is at most fourteen days.
    /// @dev All approval-time break caps still apply, and an already-ended leave cannot be finalized.
    function finalizeLeave(uint256 requestId) external {
        LeaveRequest storage request = _getPendingRequestOrRevert(requestId);
        if (block.timestamp < request.requestedAt + AUTO_APPROVE_DELAY) revert AutoApproveTooEarly();
        if (uint256(request.end) - uint256(request.start) > MAX_AUTO_APPROVE_LEAVE) {
            revert AutoApproveLeaveTooLong();
        }
        Stream storage stream = _getStreamOrRevert(request.streamId);
        _approveLeave(requestId, request, stream);
    }

    /// @notice Schedule a finite break as grantor with at least one day's notice.
    /// @dev Reason is byte-length checked; unlike a leave request, it is not stored or emitted.
    function scheduleBreak(uint256 streamId, uint64 start, uint64 end, string calldata reason) external {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (msg.sender != stream.grantor) revert NotGrantor();
        if (stream.cancelled) revert AlreadyCancelled();
        if (uint256(start) < block.timestamp + GRANTOR_BREAK_NOTICE) revert NoticeTooShort();
        if (bytes(reason).length > MAX_REASON_BYTES) revert ReasonTooLong();
        _addBreak(streamId, stream, start, end, 0);
    }

    /**
     * @notice Return vested USDC with break time excluded and rounding down.
     * Cancelled streams return their frozen finalVested amount.
     */
    function vestedAmount(uint256 streamId) public view returns (uint256) {
        Stream storage stream = _getStreamOrRevert(streamId);
        return _vestedAt(streamId, stream, block.timestamp);
    }

    /**
     * @notice Return currently claimable amount, or zero if cancelled.
     */
    function claimableAmount(uint256 streamId) public view returns (uint256) {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (stream.cancelled) return 0;
        return vestedAmount(streamId) - stream.claimedAmount;
    }

    /// @notice Return original end plus all approved break seconds, including future breaks.
    /// @dev On cancellation this remains the scheduled end, not the cancellation timestamp.
    function effectiveEndTime(uint256 streamId) public view returns (uint256) {
        Stream storage stream = _getStreamOrRevert(streamId);
        return stream.endTime + stream.totalBreakTime;
    }

    /// @notice Return whether an active stream is currently in an approved [start, end) break.
    function isOnBreak(uint256 streamId) external view returns (bool) {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (stream.cancelled) return false;
        Break[] storage breaks = _breaks[streamId];
        for (uint256 i = 0; i < breaks.length; ++i) {
            if (block.timestamp < breaks[i].start) return false;
            if (block.timestamp < breaks[i].end) return true;
        }
        return false;
    }

    /**
     * @notice Return full stream data.
     */
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return _getStreamOrRevert(streamId);
    }

    /// @notice Return every approved break in ascending start order.
    function getBreaks(uint256 streamId) external view returns (Break[] memory) {
        _getStreamOrRevert(streamId);
        return _breaks[streamId];
    }

    /// @notice Return original request data, status, and reason; applied start is reported by BreakAdded.
    function getLeaveRequest(uint256 requestId) external view returns (LeaveRequest memory) {
        return _getLeaveRequestOrRevert(requestId);
    }

    /// @notice Return all request IDs for a stream in creation order, including terminal requests.
    function getLeaveRequestIds(uint256 streamId) external view returns (uint256[] memory) {
        _getStreamOrRevert(streamId);
        return _leaveRequestIds[streamId];
    }

    /// @notice Return the number of Pending requests; cancellation does not automatically resolve requests.
    function pendingLeaveCount(uint256 streamId) external view returns (uint256) {
        _getStreamOrRevert(streamId);
        return _pendingLeaveCount[streamId];
    }

    /**
     * @notice Return stream IDs where wallet is grantor or beneficiary, in creation order.
     * Per-wallet arrays are merged and self-funded streams appear only once.
     */
    function streamsOf(address wallet) external view returns (uint256[] memory) {
        uint256[] storage granted = grantorStreams[wallet];
        uint256[] storage received = beneficiaryStreams[wallet];
        uint256 count = granted.length + received.length;
        // Self-funded streams are present in both role-specific arrays.
        for (uint256 i = 0; i < received.length; ++i) {
            if (streams[received[i]].grantor == wallet) count -= 1;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 g = 0;
        uint256 b = 0;
        for (uint256 i = 0; i < count; ++i) {
            if (b == received.length || (g < granted.length && granted[g] < received[b])) {
                ids[i] = granted[g++];
            } else if (g == granted.length || received[b] < granted[g]) {
                ids[i] = received[b++];
            } else {
                ids[i] = granted[g++];
                b += 1;
            }
        }
        return ids;
    }

    /// @notice Return the total number of created streams, including cancelled streams.
    function streamCount() external view returns (uint256) {
        return _streamIdCounter - 1;
    }

    function _approveLeave(uint256 requestId, LeaveRequest storage request, Stream storage stream) private {
        uint256 start = Math.max(uint256(request.start), block.timestamp);
        if (uint256(request.end) <= start) revert LeaveAlreadyEnded();
        // start < request.end, so narrowing to uint64 is safe.
        _addBreak(request.streamId, stream, uint64(start), request.end, requestId);
        request.status = LeaveStatus.Approved;
        _pendingLeaveCount[request.streamId] -= 1;
        emit LeaveApproved(requestId, request.streamId, msg.sender);
    }

    function _addBreak(uint256 streamId, Stream storage stream, uint64 start, uint64 end, uint256 requestId)
        private
    {
        if (stream.cancelled) revert AlreadyCancelled();
        if (end <= start) revert InvalidLeavePeriod();
        if (uint256(start) >= stream.endTime + stream.totalBreakTime) revert LeaveStartsAfterStreamEnd();

        Break[] storage breaks = _breaks[streamId];
        uint256 insertAt = breaks.length;
        for (uint256 i = 0; i < breaks.length; ++i) {
            if (start < breaks[i].end && end > breaks[i].start) revert BreakOverlap();
            if (insertAt == breaks.length && start < breaks[i].start) insertAt = i;
        }
        if (breaks.length >= MAX_BREAKS) revert TooManyBreaks();

        uint256 totalBreakTime = stream.totalBreakTime + (uint256(end) - uint256(start));
        uint256 duration = stream.endTime - stream.startTime;
        if (totalBreakTime > Math.mulDiv(duration, MAX_TOTAL_BREAK_BPS, 10000)) revert BreakTooLong();
        uint256 newEffectiveEnd = stream.endTime + totalBreakTime;

        breaks.push();
        for (uint256 i = breaks.length - 1; i > insertAt; --i) {
            breaks[i] = breaks[i - 1];
        }
        breaks[insertAt] = Break({start: start, end: end});
        stream.totalBreakTime = totalBreakTime;
        emit BreakAdded(streamId, start, end, requestId, totalBreakTime, newEffectiveEnd);
    }

    function _vestedAt(uint256 streamId, Stream storage stream, uint256 timestamp) private view returns (uint256) {
        if (stream.cancelled) return stream.finalVested;
        if (timestamp <= stream.startTime) return 0;

        uint256 active = timestamp - stream.startTime;
        Break[] storage breaks = _breaks[streamId];
        for (uint256 i = 0; i < breaks.length; ++i) {
            if (uint256(breaks[i].start) >= timestamp) break;
            uint256 overlapStart = Math.max(uint256(breaks[i].start), stream.startTime);
            uint256 overlapEnd = Math.min(uint256(breaks[i].end), timestamp);
            if (overlapEnd > overlapStart) active -= overlapEnd - overlapStart;
        }
        uint256 duration = stream.endTime - stream.startTime;
        if (active >= duration) return stream.totalAmount;
        return Math.mulDiv(stream.totalAmount, active, duration);
    }

    function _getStreamOrRevert(uint256 streamId) private view returns (Stream storage stream) {
        if (streamId == 0 || streamId >= _streamIdCounter) {
            revert StreamNotFound(streamId);
        }
        stream = streams[streamId];
    }

    function _getLeaveRequestOrRevert(uint256 requestId) private view returns (LeaveRequest storage request) {
        if (requestId == 0 || requestId >= _requestIdCounter) revert LeaveRequestNotFound(requestId);
        request = _leaveRequests[requestId];
    }

    function _getPendingRequestOrRevert(uint256 requestId) private view returns (LeaveRequest storage request) {
        request = _getLeaveRequestOrRevert(requestId);
        if (request.status != LeaveStatus.Pending) revert LeaveNotPending();
    }

    // No admin functions — no way for any privileged party to drain stream funds.
}

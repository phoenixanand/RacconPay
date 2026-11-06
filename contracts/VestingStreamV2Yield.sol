// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * TESTNET build; yield exposes funds to a lending vault;
 * mainnet use requires independent review.
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
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract VestingStreamV2Yield is ReentrancyGuard {
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
    error VaultAssetMismatch();
    error DepositValueTooLow();
    error NoYield();
    error YieldNotEnabled();
    error NotCancelled();
    error NothingToUnwind();
    error VaultIlliquid();
    error NoShares();
    error NotStreamParty();

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
    /// @notice Portion of an opted-in deposit deployed at creation, in basis points.
    uint256 public constant YIELD_DEPLOY_BPS = 7000;
    /// @notice Minimum immediate redemption value of a deposit, in basis points.
    uint256 public constant MIN_DEPOSIT_VALUE_BPS = 9990;

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

    /// @notice Separate accounting preserves the V2 Stream and getStream ABI.
    struct YieldInfo {
        bool useYield;
        uint256 idle;
        uint256 shares;
        uint256 beneficiaryDebt;
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
    /// @notice Only vault ever used; its underlying must be usdc.
    IERC4626 public immutable vault;

    uint256 private _streamIdCounter = 1;
    uint256 private _requestIdCounter = 1;
    /// @notice Stream data; endTime always remains the original end.
    mapping(uint256 id => Stream) public streams;
    /// @notice Pull-payment USDC credits created on cancellation or yield withdrawal.
    mapping(address => uint256) public pendingWithdrawals;
    /// @notice Stream IDs in creation order for each grantor.
    mapping(address => uint256[]) public grantorStreams;
    /// @notice Stream IDs in creation order for each beneficiary.
    mapping(address => uint256[]) public beneficiaryStreams;
    mapping(uint256 => Break[]) private _breaks;
    mapping(uint256 => LeaveRequest) private _leaveRequests;
    mapping(uint256 => uint256[]) private _leaveRequestIds;
    mapping(uint256 => uint256) private _pendingLeaveCount;
    mapping(uint256 => YieldInfo) private _yield;

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
    /// @notice Initial vault allocation; emitted only for opted-in streams.
    event YieldDeployed(uint256 indexed streamId, uint256 deployed, uint256 shares);
    /// @notice Realized yield credited to the grantor's pull-payment balance.
    event YieldWithdrawn(uint256 indexed streamId, address indexed grantor, uint256 amount);
    /// @notice Best-effort redemption requested by either stream party.
    event YieldStopped(uint256 indexed streamId, address indexed by, uint256 assets);
    /// @notice Additional cancellation credits after a permissionless unwind.
    event StreamUnwound(uint256 indexed streamId, uint256 returnedToGrantor, uint256 paidToBeneficiary);

    /// @notice Configure immutable USDC and its lending vault; no admin is installed.
    /// @param _usdc Use 0x3600000000000000000000000000000000000000 on Arc Testnet.
    /// @param _vault ERC-4626 vault whose asset is _usdc; vault risk is borne by opted-in streams.
    constructor(address _usdc, address _vault) {
        if (_usdc == address(0) || _vault == address(0)) revert ZeroAddress();
        if (IERC4626(_vault).asset() != _usdc) revert VaultAssetMismatch();
        usdc = IERC20(_usdc);
        vault = IERC4626(_vault);
    }

    /**
     * @notice Create a linear vesting stream by depositing USDC.
     * @param useYield Fixed lifetime opt-in to deploying 70% into the immutable vault.
     * @dev The 30% buffer is an initial allocation, not a reserve floor after claims.
     * TRUST: grantor chooses beneficiary, amount, and duration. On-chain validation
     * enforces non-zero beneficiary/amount/duration only; beneficiary may be EOA or contract.
     */
    function createStream(address beneficiary, uint256 amount, uint256 duration, bool useYield)
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
        YieldInfo storage info = _yield[streamId];
        info.useYield = useYield;
        info.idle = amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        if (useYield) {
            uint256 deployed = Math.mulDiv(amount, YIELD_DEPLOY_BPS, 10000);
            info.idle = amount - deployed;
            usdc.forceApprove(address(vault), deployed);
            uint256 shares = vault.deposit(deployed, address(this));
            usdc.forceApprove(address(vault), 0);
            if (vault.previewRedeem(shares) < Math.mulDiv(deployed, MIN_DEPOSIT_VALUE_BPS, 10000)) {
                revert DepositValueTooLow();
            }
            info.shares = shares;
            emit YieldDeployed(streamId, deployed, shares);
        }

        emit StreamCreated(streamId, msg.sender, beneficiary, amount, startTime, endTime);
    }

    /**
     * @notice Claim available vested USDC from an active stream, possibly partially.
     * @dev Vault failure or illiquidity does not prevent payment from this stream's idle balance.
     */
    function claim(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);

        if (msg.sender != stream.beneficiary) revert NotBeneficiary();
        if (stream.cancelled) revert AlreadyCancelled();

        uint256 vested = vestedAmount(streamId);
        uint256 claimable = vested - stream.claimedAmount;
        YieldInfo storage info = _yield[streamId];
        if (claimable > info.idle && info.shares > 0) {
            _pull(info, claimable - info.idle);
        }
        if (claimable == 0) revert NothingToClaim();
        uint256 paid = Math.min(claimable, info.idle);
        // Vested principal is owed but the vault cannot pay it out right now: retry later.
        if (paid == 0) revert VaultIlliquid();

        stream.claimedAmount += paid;
        info.idle -= paid;
        usdc.safeTransfer(stream.beneficiary, paid);

        emit Claimed(streamId, stream.beneficiary, paid);
    }

    /**
     * @notice Cancel a stream, crediting available vested USDC before any grantor refund.
     * @dev Original endTime is preserved; unpaid vested principal becomes beneficiaryDebt.
     * StreamCancelled reports credits made now, not future unwind proceeds.
     */
    function cancel(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);

        if (msg.sender != stream.grantor) revert NotGrantor();
        if (stream.cancelled) revert AlreadyCancelled();

        uint256 vested = _vestedAt(streamId, stream, block.timestamp);
        uint256 owedBeneficiary = vested - stream.claimedAmount;
        stream.cancelled = true;
        stream.finalVested = vested;

        YieldInfo storage info = _yield[streamId];
        _pull(info, type(uint256).max);
        uint256 paidToBeneficiary = Math.min(owedBeneficiary, info.idle);
        info.beneficiaryDebt = owedBeneficiary - paidToBeneficiary;
        info.idle -= paidToBeneficiary;
        stream.claimedAmount += paidToBeneficiary;
        pendingWithdrawals[stream.beneficiary] += paidToBeneficiary;

        uint256 returnedToGrantor;
        if (info.beneficiaryDebt == 0) {
            returnedToGrantor = info.idle;
            info.idle = 0;
            pendingWithdrawals[stream.grantor] += returnedToGrantor;
        }

        emit StreamCancelled(streamId, returnedToGrantor, paidToBeneficiary);
    }

    /// @notice Retry liquidation of a cancelled stream; anyone may call without receiving funds.
    /// @dev Beneficiary debt has priority. Later grantor credits wait until all shares are redeemed.
    function unwind(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (!stream.cancelled) revert NotCancelled();
        YieldInfo storage info = _yield[streamId];
        if (info.shares == 0 && info.beneficiaryDebt == 0 && info.idle == 0) revert NothingToUnwind();

        _pull(info, type(uint256).max);
        uint256 paidToBeneficiary = Math.min(info.beneficiaryDebt, info.idle);
        info.beneficiaryDebt -= paidToBeneficiary;
        info.idle -= paidToBeneficiary;
        stream.claimedAmount += paidToBeneficiary;
        pendingWithdrawals[stream.beneficiary] += paidToBeneficiary;

        uint256 returnedToGrantor;
        if (info.beneficiaryDebt == 0 && info.shares == 0) {
            returnedToGrantor = info.idle;
            info.idle = 0;
            pendingWithdrawals[stream.grantor] += returnedToGrantor;
        }
        emit StreamUnwound(streamId, returnedToGrantor, paidToBeneficiary);
    }

    /// @notice Credit available yield to the grantor without reducing principal coverage.
    /// @dev Revalues remaining shares after redemption to account for fees and rounding.
    function withdrawYield(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (msg.sender != stream.grantor) revert NotGrantor();
        if (stream.cancelled) revert AlreadyCancelled();
        YieldInfo storage info = _yield[streamId];
        if (!info.useYield) revert YieldNotEnabled();

        uint256 obligation = stream.totalAmount - stream.claimedAmount;
        uint256 value = info.idle + _shareValue(info);
        if (value <= obligation) revert NoYield();
        uint256 excess = value - obligation;
        // Beneficiary priority: idle cash must always cover principal that is vested but not yet claimed,
        // because vault shares may not be redeemable right now. Pull enough to fund that reserve AND the yield.
        uint256 vestedUnclaimed = vestedAmount(streamId) - stream.claimedAmount;
        uint256 wantIdle = excess + vestedUnclaimed;
        _pull(info, wantIdle > info.idle ? wantIdle - info.idle : 0);

        uint256 remainingShareValue = _shareValue(info);
        uint256 requiredIdle = obligation > remainingShareValue ? obligation - remainingShareValue : 0;
        if (vestedUnclaimed > requiredIdle) requiredIdle = vestedUnclaimed;
        if (info.idle <= requiredIdle) revert NoYield();
        uint256 amount = Math.min(excess, info.idle - requiredIdle);
        info.idle -= amount;
        pendingWithdrawals[stream.grantor] += amount;
        // By construction, idle + remainingShareValue >= obligation after this credit.
        emit YieldWithdrawn(streamId, stream.grantor, amount);
    }

    /// @notice Either party may move as many shares as currently redeemable back to idle USDC.
    /// @dev Can be retried after partial redemption. No function ever redeposits after creation.
    function stopYield(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);
        if (msg.sender != stream.grantor && msg.sender != stream.beneficiary) revert NotStreamParty();
        if (stream.cancelled) revert AlreadyCancelled();
        YieldInfo storage info = _yield[streamId];
        if (info.shares == 0) revert NoShares();
        uint256 assets = _pull(info, type(uint256).max);
        emit YieldStopped(streamId, msg.sender, assets);
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

    /// @notice Return yield accounting separately from the unchanged V2 stream tuple.
    /// @dev valueNow excludes pendingWithdrawals. yieldEarned is current surplus, not lifetime yield.
    /// As specified, the reported obligation is totalAmount - claimedAmount, even after cancellation.
    /// No vault call is made for a stream with zero shares, including every non-yield stream.
    function getYieldInfo(uint256 streamId)
        external
        view
        returns (
            bool useYield,
            uint256 idle,
            uint256 shares,
            uint256 valueNow,
            uint256 yieldEarned,
            uint256 beneficiaryDebt
        )
    {
        Stream storage stream = _getStreamOrRevert(streamId);
        YieldInfo storage info = _yield[streamId];
        useYield = info.useYield;
        idle = info.idle;
        shares = info.shares;
        valueNow = idle + _shareValue(info);
        uint256 obligation = stream.totalAmount - stream.claimedAmount;
        yieldEarned = valueNow > obligation ? valueNow - obligation : 0;
        beneficiaryDebt = info.beneficiaryDebt;
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

    /// @dev Zero-share streams never interact with the vault.
    function _shareValue(YieldInfo storage info) private view returns (uint256) {
        return info.shares == 0 ? 0 : vault.previewRedeem(info.shares);
    }

    /// @dev Best-effort redemption; max uint means all available shares, avoiding preview overflow.
    /// Failed vault queries/redemption leave shares intact so idle claims can still proceed.
    /// Uses only this stream's shares and accounts for actual USDC received, not the return value.
    function _pull(YieldInfo storage info, uint256 need) private returns (uint256 assets) {
        if (need == 0 || info.shares == 0) return 0;
        uint256 sharesToRedeem = info.shares;
        // NOTE: maxRedeem() is deliberately not used as a limit. Some ERC-4626 vaults (for example Morpho
        // VaultV2, the Arc Testnet Earn vault) always return 0 from their max* functions.
        if (need != type(uint256).max) {
            try vault.previewWithdraw(need) returns (uint256 neededShares) {
                sharesToRedeem = Math.min(sharesToRedeem, neededShares);
            } catch {
                return 0;
            }
        }
        if (sharesToRedeem == 0) return 0;

        (bool ok, uint256 got) = _tryRedeem(info, sharesToRedeem);
        if (ok) return got;

        // Fallback: the full amount could not be redeemed, so try only what the vault holds as idle USDC.
        uint256 liquid = usdc.balanceOf(address(vault));
        if (liquid == 0) return 0;
        uint256 liquidShares;
        try vault.convertToShares(liquid) returns (uint256 s) {
            liquidShares = s;
        } catch {
            return 0;
        }
        if (liquidShares == 0 || liquidShares >= sharesToRedeem) return 0;
        (, got) = _tryRedeem(info, liquidShares);
        return got;
    }

    /// @dev Redeems `shares` for this stream; credits the USDC actually received to idle. Never reverts.
    function _tryRedeem(YieldInfo storage info, uint256 shares) private returns (bool ok, uint256 got) {
        uint256 balanceBefore = usdc.balanceOf(address(this));
        info.shares -= shares;
        try vault.redeem(shares, address(this), address(this)) returns (uint256) {
            got = usdc.balanceOf(address(this)) - balanceBefore;
            info.idle += got;
            ok = true;
        } catch {
            info.shares += shares;
        }
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

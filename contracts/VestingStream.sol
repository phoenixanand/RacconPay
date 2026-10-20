// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * TESTNET ONLY — not for use with real funds.
 *
 * DECIMALS WARNING (Arc Testnet):
 * - Gas is paid from the native USDC balance (18 decimals).
 * - This contract ONLY uses the USDC ERC-20 token interface (6 decimals),
 *   supplied as constructor arg `_usdc`.
 * - NEVER mix native-balance units and ERC-20 units.
 * - Every `amount` handled here is in 6-decimal ERC-20 USDC units.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VestingStream is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroDuration();
    error NotBeneficiary();
    error NotGrantor();
    error AlreadyCancelled();
    error NothingToClaim();
    error StreamNotFound(uint256 streamId);

    struct Stream {
        address grantor;
        address beneficiary;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 endTime;
        bool cancelled;
    }

    IERC20 public immutable usdc;

    uint256 private _streamIdCounter = 1;
    mapping(uint256 id => Stream) public streams;
    mapping(address => uint256) public pendingWithdrawals;

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
            cancelled: false
        });

        unchecked {
            _streamIdCounter = streamId + 1;
        }

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
     * @notice Cancel a stream. Vested-but-unclaimed amount is paid to beneficiary, unvested is returned to grantor.
     */
    function cancel(uint256 streamId) external nonReentrant {
        Stream storage stream = _getStreamOrRevert(streamId);

        if (msg.sender != stream.grantor) revert NotGrantor();
        if (stream.cancelled) revert AlreadyCancelled();

        uint256 vested = _vestedAt(stream, block.timestamp);
        uint256 paidToBeneficiary = vested - stream.claimedAmount;
        uint256 returnedToGrantor = stream.totalAmount - vested;

        stream.cancelled = true;
        if (block.timestamp < stream.endTime) {
            stream.endTime = block.timestamp;
        }

        if (paidToBeneficiary > 0) {
            stream.claimedAmount += paidToBeneficiary;
            pendingWithdrawals[stream.beneficiary] += paidToBeneficiary;
        }

        if (returnedToGrantor > 0) {
            pendingWithdrawals[stream.grantor] += returnedToGrantor;
        }

        emit StreamCancelled(streamId, returnedToGrantor, paidToBeneficiary);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToClaim();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Return vested amount for a stream using linear vesting clamped to [0, totalAmount].
     */
    function vestedAmount(uint256 streamId) public view returns (uint256) {
        Stream storage stream = _getStreamOrRevert(streamId);
        return _vestedAt(stream, block.timestamp);
    }

    /**
     * @notice Return currently claimable amount for a stream.
     */
    function claimableAmount(uint256 streamId) public view returns (uint256) {
        Stream storage stream = _getStreamOrRevert(streamId);
        return vestedAmount(streamId) - stream.claimedAmount;
    }

    /**
     * @notice Return full stream data.
     */
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return _getStreamOrRevert(streamId);
    }

    /**
     * @notice Return stream IDs where wallet is grantor or beneficiary (linear scan for testnet simplicity).
     */
    function streamsOf(address wallet) external view returns (uint256[] memory) {
        uint256 lastCreatedId = _streamIdCounter;
        uint256 count = 0;

        for (uint256 id = 1; id < lastCreatedId; ++id) {
            Stream storage stream = streams[id];
            if (stream.grantor == wallet || stream.beneficiary == wallet) {
                count += 1;
            }
        }

        uint256[] memory ids = new uint256[](count);
        uint256 index = 0;

        for (uint256 id = 1; id < lastCreatedId; ++id) {
            Stream storage stream = streams[id];
            if (stream.grantor == wallet || stream.beneficiary == wallet) {
                ids[index] = id;
                index += 1;
            }
        }

        return ids;
    }

    function _vestedAt(Stream storage stream, uint256 timestamp) private view returns (uint256) {
        uint256 effectiveTime = timestamp;
        if (effectiveTime > stream.endTime) {
            effectiveTime = stream.endTime;
        }

        if (effectiveTime <= stream.startTime) {
            return 0;
        }

        uint256 elapsed = effectiveTime - stream.startTime;
        uint256 duration = stream.endTime - stream.startTime;
        uint256 vested = (stream.totalAmount * elapsed) / duration;

        if (vested > stream.totalAmount) {
            return stream.totalAmount;
        }

        return vested;
    }

    function _getStreamOrRevert(uint256 streamId) private view returns (Stream storage stream) {
        if (streamId == 0 || streamId >= _streamIdCounter) {
            revert StreamNotFound(streamId);
        }
        stream = streams[streamId];
    }

    // No admin functions — no way for any privileged party to drain stream funds.
}

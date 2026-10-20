// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * DECIMALS WARNING (Arc Mainnet):
 * - Gas is paid from the native USDC balance (18 decimals).
 * - This contract ONLY uses the USDC ERC-20 token interface (6 decimals),
 *   e.g. 0x3600000000000000000000000000000000000000 on Arc Mainnet.
 * - NEVER mix native-balance units and ERC-20 units.
 * - Every `amount` handled here is in 6-decimal ERC-20 USDC units.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ReceiptNFT} from "./ReceiptNFT.sol";

contract BatchPayout is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error BatchEmpty();
    error TooManyRecipients(uint256 count);
    error ZeroAddress(uint256 index);
    error ZeroAmount(uint256 index);

    struct Recipient {
        address addr;
        uint256 amount; // 6-decimal ERC-20 USDC units only.
    }

    IERC20 public immutable usdc;

    // Immutable: wired at deploy time via constructor — no set-once footgun.
    ReceiptNFT public immutable receiptNFT;

    event BatchPaid(address indexed payer, uint256 total, uint256 recipientCount, uint256 receiptTokenId);
    /// @notice Emitted when a single recipient transfer fails (e.g. blocked address on Arc).
    ///         The remaining USDC for that recipient is returned to the payer via refund accumulator.
    event PaymentFailed(address indexed payer, address indexed recipient, uint256 amount);

    constructor(address _usdc, address _receiptNFT) {
        require(_usdc != address(0), "usdc cannot be zero");
        require(_receiptNFT != address(0), "receiptNFT cannot be zero");
        usdc = IERC20(_usdc);
        receiptNFT = ReceiptNFT(_receiptNFT);
    }

    function batchPay(Recipient[] calldata recipients) external nonReentrant {
        uint256 count = recipients.length;
        if (count == 0) revert BatchEmpty();
        if (count > 100) revert TooManyRecipients(count);

        // All arithmetic in this function is 6-decimal ERC-20 USDC units.
        uint256 total = 0;
        for (uint256 i = 0; i < count; ++i) {
            Recipient calldata recipient = recipients[i];

            // TRUST: recipients[i].addr is provided by the caller — no on-chain validation of whether it is a contract or EOA.
            if (recipient.addr == address(0)) revert ZeroAddress(i);
            if (recipient.amount == 0) revert ZeroAmount(i);

            total += recipient.amount;
        }

        // TRUST: msg.sender must have approved at least `total` on the USDC ERC-20 contract before calling.
        // We pull exactly `total` up front; any failed per-recipient transfers are refunded to msg.sender
        // at the end so no USDC is ever stranded in this contract.
        // Note: we do NOT enforce allowance == total exactly; callers may hold a standing approval larger
        // than total (e.g. max-uint256). This is standard ERC-20 pull-payment behaviour and intentional.
        usdc.safeTransferFrom(msg.sender, address(this), total);

        // H-3 fix: wrap each transfer so a single non-payable/blocked recipient cannot revert the whole batch.
        uint256 successCount;
        uint256 successTotal;
        uint256 refund;

        for (uint256 i = 0; i < count; ++i) {
            Recipient calldata recipient = recipients[i];
            try IERC20(address(usdc)).transfer(recipient.addr, recipient.amount) returns (bool ok) {
                if (ok) {
                    successCount += 1;
                    successTotal += recipient.amount;
                } else {
                    refund += recipient.amount;
                    emit PaymentFailed(msg.sender, recipient.addr, recipient.amount);
                }
            } catch {
                refund += recipient.amount;
                emit PaymentFailed(msg.sender, recipient.addr, recipient.amount);
            }
        }

        // Return any failed-transfer amounts to the payer so nothing is stranded.
        if (refund > 0) {
            usdc.safeTransfer(msg.sender, refund);
        }

        bytes32 listHash = keccak256(abi.encode(recipients));
        uint256 receiptTokenId = receiptNFT.mint(
            msg.sender,
            ReceiptNFT.ReceiptData({
                batchTotal: successTotal,
                recipientCount: successCount,
                timestamp: block.timestamp,
                listHash: listHash
            })
        );

        emit BatchPaid(msg.sender, successTotal, successCount, receiptTokenId);
    }

    // No admin functions — no way for any privileged party to drain user funds.
}

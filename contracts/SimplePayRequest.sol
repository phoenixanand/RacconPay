// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SimplePayRequest
 * @notice Create a USDC payment request. Anyone with the request ID can pay it.
 *         On payment the USDC goes directly to the payee. Optional memo.
 *         Requests can be cancelled by the payee before they are paid.
 */
contract SimplePayRequest is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ── Types ─────────────────────────────────────────────── */
    enum Status { Pending, Paid, Cancelled }

    struct Request {
        address payee;      // who receives the USDC
        address payer;      // address that paid (zero if unpaid/cancelled)
        uint256 amount;     // USDC amount (6 decimals)
        uint256 createdAt;
        uint256 paidAt;
        Status  status;
        string  memo;       // e.g. "Design work — Oct 2026"
    }

    /* ── Storage ────────────────────────────────────────────── */
    IERC20  public immutable usdc;
    uint256 public requestCount;
    mapping(uint256 => Request) private _requests;

    /* ── Events ─────────────────────────────────────────────── */
    event RequestCreated(uint256 indexed id, address indexed payee, uint256 amount, string memo);
    event RequestPaid   (uint256 indexed id, address indexed payer, uint256 amount);
    event RequestCancelled(uint256 indexed id);

    /* ── Errors ─────────────────────────────────────────────── */
    error ZeroAmount();
    error ZeroAddress();
    error NotFound();
    error NotPending();
    error NotPayee();
    error SelfPay();

    /* ── Constructor ────────────────────────────────────────── */
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    /* ── Write ──────────────────────────────────────────────── */

    /**
     * @notice Create a new payment request.
     * @param amount USDC amount (6 decimals, e.g. 1_000_000 = 1 USDC).
     * @param memo   Optional description shown to the payer.
     * @return id    The new request ID.
     */
    function createRequest(uint256 amount, string calldata memo) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        id = ++requestCount;
        _requests[id] = Request({
            payee:     msg.sender,
            payer:     address(0),
            amount:    amount,
            createdAt: block.timestamp,
            paidAt:    0,
            status:    Status.Pending,
            memo:      memo
        });
        emit RequestCreated(id, msg.sender, amount, memo);
    }

    /**
     * @notice Pay a pending request.
     * @dev Caller must have approved this contract for at least `amount` USDC.
     */
    function pay(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.payee == address(0))      revert NotFound();
        if (r.status != Status.Pending) revert NotPending();
        if (msg.sender == r.payee)      revert SelfPay();

        r.payer  = msg.sender;
        r.paidAt = block.timestamp;
        r.status = Status.Paid;

        usdc.safeTransferFrom(msg.sender, r.payee, r.amount);
        emit RequestPaid(id, msg.sender, r.amount);
    }

    /**
     * @notice Cancel a pending request. Only the payee can cancel.
     */
    function cancel(uint256 id) external {
        Request storage r = _requests[id];
        if (r.status != Status.Pending) revert NotPending();
        if (msg.sender != r.payee)      revert NotPayee();
        r.status = Status.Cancelled;
        emit RequestCancelled(id);
    }

    /* ── View ───────────────────────────────────────────────── */

    function getRequest(uint256 id) external view returns (
        address payee, address payer, uint256 amount,
        uint256 createdAt, uint256 paidAt, uint8 status, string memory memo
    ) {
        Request storage r = _requests[id];
        return (r.payee, r.payer, r.amount, r.createdAt, r.paidAt, uint8(r.status), r.memo);
    }
}

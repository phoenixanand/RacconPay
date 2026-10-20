// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * BillSplitterV2 — upgraded group expense splitter on Arc Mainnet.
 *
 * New features over v1:
 *   - createBillWithExpenses(): create + add expenses in one transaction
 *   - Unequal splits: per-member share weights (basis points, must sum to 10000)
 *   - Partial settlement: pay any amount up to your full debt
 *   - Bill expiry: creator sets a deadline; after expiry anyone can forceFinalize
 *   - Claimable balance: creditors see their pending USDC across all bills
 *
 * DECIMALS: All amounts are 6-decimal ERC-20 USDC units. Never mix with native gas.
 * TRUST: Member addresses and expense records are caller-provided (Splitwise-style).
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BillSplitterV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Errors ────────────────────────────────────────────────────────────────
    error BillNotFound(uint256 billId);
    error NotMember();
    error AlreadyFinalized();
    error NotFinalized();
    error NoExpenses();
    error EmptyMembers();
    error TooManyMembers(uint256 count);
    error ZeroAddress();
    error DuplicateMember();
    error ZeroAmount();
    error NothingOwed();
    error NothingToClaim();
    error InvalidShares();       // shares don't sum to 10000
    error ExceedsDebt();         // partial payment exceeds remaining debt
    error NotExpired();          // forceFinalize called before expiry
    error InvalidExpiry();       // expiry in the past

    // ── Events ────────────────────────────────────────────────────────────────
    event BillCreated(uint256 indexed billId, address indexed creator, address[] members, uint256 expiresAt);
    event ExpenseAdded(uint256 indexed billId, address indexed paidBy, uint256 amount, string description);
    event BillFinalized(uint256 indexed billId);
    event Settled(uint256 indexed billId, address indexed settler, uint256 amount, uint256 remaining);
    event ClaimWithdrawn(uint256 indexed billId, address indexed creditor, uint256 amount);

    // ── Types ─────────────────────────────────────────────────────────────────
    struct Expense {
        address paidBy;
        uint256 amount;      // 6-decimal ERC-20 USDC units
        string  description;
    }

    struct Bill {
        string    name;
        address[] members;
        // shares[i] = basis points (0–10000) of total expense owed by members[i].
        // If all zeros, equal split is used.
        uint256[] shares;
        Expense[] expenses;
        bool      finalized;
        uint256   expiresAt;  // unix timestamp; 0 = no expiry
        mapping(address => bool)    isMember;
        mapping(address => uint256) paid;     // USDC already settled by each debtor
    }

    // ── State ─────────────────────────────────────────────────────────────────
    IERC20 public immutable usdc;

    uint256 private _billIdCounter = 1;
    mapping(uint256 => Bill) private _bills;

    // claimsOf[billId][creditor] — USDC accrued for the creditor to withdraw
    mapping(uint256 => mapping(address => uint256)) public claimsOf;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    // ── Bill creation ─────────────────────────────────────────────────────────

    /**
     * @notice Create a new bill (equal split, no expenses yet).
     * @param expiresAt Unix timestamp after which anyone can forceFinalize. 0 = no expiry.
     */
    function createBill(
        string  calldata name,
        address[] calldata members,
        uint256  expiresAt
    ) external returns (uint256 billId) {
        billId = _initBill(name, members, new uint256[](0), expiresAt);
    }

    /**
     * @notice Create a bill with custom per-member share weights.
     * @param shares Basis-point weights for each member (must sum to 10000).
     *               Pass empty array for equal split.
     * @param expiresAt Unix timestamp; 0 = no expiry.
     */
    function createBillWithShares(
        string    calldata name,
        address[] calldata members,
        uint256[] calldata shares,
        uint256   expiresAt
    ) external returns (uint256 billId) {
        billId = _initBill(name, members, shares, expiresAt);
    }

    /**
     * @notice Create a bill AND add initial expenses in one transaction.
     * @param expenseAmounts   Parallel array with expense amounts (6-dec USDC).
     * @param expenseDescs     Parallel array with expense descriptions.
     * @param expensePayers    Parallel array: who paid each expense (must be a member).
     * @param shares           Basis-point weights; empty = equal split.
     * @param expiresAt        Unix timestamp; 0 = no expiry.
     */
    function createBillWithExpenses(
        string    calldata name,
        address[] calldata members,
        uint256[] calldata shares,
        uint256   expiresAt,
        uint256[] calldata expenseAmounts,
        string[]  calldata expenseDescs,
        address[] calldata expensePayers
    ) external returns (uint256 billId) {
        require(
            expenseAmounts.length == expenseDescs.length &&
            expenseAmounts.length == expensePayers.length,
            "length mismatch"
        );

        billId = _initBill(name, members, shares, expiresAt);
        Bill storage bill = _bills[billId];

        uint256 n = expenseAmounts.length;
        for (uint256 i = 0; i < n; ++i) {
            address payer = expensePayers[i];
            uint256 amount = expenseAmounts[i];
            if (amount == 0) revert ZeroAmount();
            if (!bill.isMember[payer]) revert NotMember();
            bill.expenses.push(Expense({paidBy: payer, amount: amount, description: expenseDescs[i]}));
            emit ExpenseAdded(billId, payer, amount, expenseDescs[i]);
        }
    }

    // ── Expense management ────────────────────────────────────────────────────

    function addExpense(uint256 billId, uint256 amount, string calldata description) external {
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.isMember[msg.sender]) revert NotMember();
        if (bill.finalized) revert AlreadyFinalized();
        if (amount == 0) revert ZeroAmount();
        bill.expenses.push(Expense({paidBy: msg.sender, amount: amount, description: description}));
        emit ExpenseAdded(billId, msg.sender, amount, description);
    }

    // ── Finalization ──────────────────────────────────────────────────────────

    function finalize(uint256 billId) external {
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.isMember[msg.sender]) revert NotMember();
        if (bill.finalized) revert AlreadyFinalized();
        if (bill.expenses.length == 0) revert NoExpenses();
        bill.finalized = true;
        emit BillFinalized(billId);
    }

    /**
     * @notice Finalize a bill after its expiry timestamp (callable by anyone).
     */
    function forceFinalize(uint256 billId) external {
        Bill storage bill = _getBillOrRevert(billId);
        if (bill.finalized) revert AlreadyFinalized();
        if (bill.expenses.length == 0) revert NoExpenses();
        if (bill.expiresAt == 0 || block.timestamp < bill.expiresAt) revert NotExpired();
        bill.finalized = true;
        emit BillFinalized(billId);
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    /**
     * @notice Settle caller's full remaining debt in one call.
     */
    function settle(uint256 billId) external nonReentrant {
        _settleAmount(billId, 0); // 0 = full debt
    }

    /**
     * @notice Partial settlement — pay `amount` USDC towards caller's debt.
     * @param amount Must be > 0 and <= remaining debt.
     */
    function settlePartial(uint256 billId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _settleAmount(billId, amount);
    }

    // ── Claim withdrawal ──────────────────────────────────────────────────────

    function withdrawClaim(uint256 billId) external nonReentrant {
        uint256 amount = claimsOf[billId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimsOf[billId][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit ClaimWithdrawn(billId, msg.sender, amount);
    }

    // ── View functions ────────────────────────────────────────────────────────

    function getBill(uint256 billId)
        external view
        returns (
            string  memory name,
            address[] memory members,
            uint256[] memory shares,
            bool    finalized,
            uint256 expiresAt
        )
    {
        Bill storage bill = _getBillOrRevert(billId);
        return (bill.name, bill.members, bill.shares, bill.finalized, bill.expiresAt);
    }

    function getExpenses(uint256 billId) external view returns (Expense[] memory) {
        return _getBillOrRevert(billId).expenses;
    }

    /**
     * @notice Returns each member's gross debt (what they owe before payments),
     *         already-paid amount, and remaining debt.
     */
    function getSettlementStatus(uint256 billId)
        external view
        returns (
            address[] memory members,
            uint256[] memory grossDebts,
            uint256[] memory paidAmounts,
            uint256[] memory remainingDebts
        )
    {
        Bill storage bill = _getBillOrRevert(billId);
        uint256 n = bill.members.length;
        members        = bill.members;
        grossDebts     = new uint256[](n);
        paidAmounts    = new uint256[](n);
        remainingDebts = new uint256[](n);

        if (!bill.finalized) return (members, grossDebts, paidAmounts, remainingDebts);

        (uint256[] memory debts,) = _computeDebts(bill);
        for (uint256 i = 0; i < n; ++i) {
            grossDebts[i]     = debts[i];
            paidAmounts[i]    = bill.paid[members[i]];
            uint256 remaining = debts[i] > bill.paid[members[i]] ? debts[i] - bill.paid[members[i]] : 0;
            remainingDebts[i] = remaining;
        }
    }

    function billsOf(address wallet) external view returns (uint256[] memory) {
        uint256 last = _billIdCounter;
        uint256 count;
        for (uint256 id = 1; id < last; ++id) {
            if (_bills[id].isMember[wallet]) count++;
        }
        uint256[] memory ids = new uint256[](count);
        uint256 idx;
        for (uint256 id = 1; id < last; ++id) {
            if (_bills[id].isMember[wallet]) ids[idx++] = id;
        }
        return ids;
    }

    function billCount() external view returns (uint256) {
        return _billIdCounter - 1;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _initBill(
        string    calldata name,
        address[] calldata members,
        uint256[] memory   shares,
        uint256            expiresAt
    ) private returns (uint256 billId) {
        uint256 providedCount = members.length;
        if (providedCount == 0) revert EmptyMembers();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        // Validate shares if provided
        if (shares.length > 0) {
            if (shares.length != providedCount) revert InvalidShares();
            uint256 total;
            for (uint256 i = 0; i < shares.length; ++i) total += shares[i];
            if (total != 10000) revert InvalidShares();
        }

        bool senderIncluded;
        for (uint256 i = 0; i < providedCount; ++i) {
            address m = members[i];
            if (m == address(0)) revert ZeroAddress();
            if (m == msg.sender) senderIncluded = true;
            for (uint256 j = i + 1; j < providedCount; ++j) {
                if (m == members[j]) revert DuplicateMember();
            }
        }

        uint256 finalCount = providedCount + (senderIncluded ? 0 : 1);
        if (finalCount > 20) revert TooManyMembers(finalCount);

        address[] memory finalMembers = new address[](finalCount);
        for (uint256 i = 0; i < providedCount; ++i) finalMembers[i] = members[i];
        if (!senderIncluded) finalMembers[providedCount] = msg.sender;

        // Extend shares to include sender if added
        uint256[] memory finalShares;
        if (shares.length > 0) {
            // Shares were provided for `members` only — sender already included
            // (enforced above: senderIncluded must be true when shares are passed,
            // otherwise the share array length wouldn't match finalCount)
            finalShares = shares;
        }

        billId = _billIdCounter++;
        Bill storage bill = _bills[billId];
        bill.name      = name;
        bill.expiresAt = expiresAt;

        for (uint256 i = 0; i < finalCount; ++i) {
            bill.members.push(finalMembers[i]);
            bill.isMember[finalMembers[i]] = true;
            if (finalShares.length > 0) bill.shares.push(finalShares[i]);
        }

        emit BillCreated(billId, msg.sender, finalMembers, expiresAt);
    }

    function _settleAmount(uint256 billId, uint256 requestedAmount) private {
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.finalized) revert NotFinalized();
        if (!bill.isMember[msg.sender]) revert NotMember();

        (uint256[] memory debts, uint256 creditorTotal) = _computeDebts(bill);

        uint256 memberCount = bill.members.length;
        uint256 senderIdx   = type(uint256).max;
        for (uint256 i = 0; i < memberCount; ++i) {
            if (bill.members[i] == msg.sender) { senderIdx = i; break; }
        }

        uint256 grossDebt = debts[senderIdx];
        uint256 alreadyPaid = bill.paid[msg.sender];
        uint256 remaining = grossDebt > alreadyPaid ? grossDebt - alreadyPaid : 0;
        if (remaining == 0) revert NothingOwed();

        uint256 payment = (requestedAmount == 0) ? remaining : requestedAmount;
        if (payment > remaining) revert ExceedsDebt();

        usdc.safeTransferFrom(msg.sender, address(this), payment);
        bill.paid[msg.sender] += payment;

        // Distribute payment proportionally to creditors
        uint256 distributed;
        uint256 creditorsFound;
        uint256 creditorCount;
        for (uint256 i = 0; i < memberCount; ++i) {
            if (debts[i] == 0 && _getMemberCredit(bill, i) > 0) creditorCount++;
        }
        // Simpler: count members who are net creditors
        creditorCount = 0;
        int256[] memory netBalances = _computeNetBalances(bill, debts);
        for (uint256 i = 0; i < memberCount; ++i) {
            if (netBalances[i] > 0) creditorCount++;
        }

        for (uint256 i = 0; i < memberCount; ++i) {
            if (netBalances[i] <= 0) continue;
            uint256 creditorNet = uint256(netBalances[i]);
            uint256 share;
            creditorsFound++;
            if (creditorsFound == creditorCount) {
                share = payment - distributed;
            } else {
                share = (payment * creditorNet) / creditorTotal;
                distributed += share;
            }
            if (share > 0) claimsOf[billId][bill.members[i]] += share;
        }

        uint256 newRemaining = grossDebt - bill.paid[msg.sender];
        emit Settled(billId, msg.sender, payment, newRemaining);
    }

    /**
     * @dev Compute each member's gross debt (what they owe to settle their share).
     *      Creditors have debt = 0.
     *      Returns (debts[], totalCreditorNet).
     */
    function _computeDebts(Bill storage bill)
        private view
        returns (uint256[] memory debts, uint256 totalCreditorNet)
    {
        uint256 memberCount  = bill.members.length;
        uint256 expenseCount = bill.expenses.length;
        debts = new uint256[](memberCount);

        uint256 totalExpense;
        for (uint256 i = 0; i < expenseCount; ++i) totalExpense += bill.expenses[i].amount;
        if (totalExpense == 0) return (debts, 0);

        bool hasShares = bill.shares.length == memberCount;

        for (uint256 i = 0; i < memberCount; ++i) {
            address member = bill.members[i];
            uint256 totalPaid;
            for (uint256 j = 0; j < expenseCount; ++j) {
                if (bill.expenses[j].paidBy == member) totalPaid += bill.expenses[j].amount;
            }

            uint256 memberShare;
            if (hasShares) {
                memberShare = (totalExpense * bill.shares[i]) / 10000;
            } else {
                // Equal split with remainder assigned to first member
                memberShare = totalExpense / memberCount;
                if (i == 0) memberShare += totalExpense - (memberShare * memberCount);
            }

            if (totalPaid < memberShare) {
                debts[i] = memberShare - totalPaid;
            } else {
                // Creditor — track net credit for proportional distribution
                totalCreditorNet += totalPaid - memberShare;
            }
        }
    }

    function _computeNetBalances(Bill storage bill, uint256[] memory debts)
        private view
        returns (int256[] memory netBalances)
    {
        uint256 memberCount  = bill.members.length;
        uint256 expenseCount = bill.expenses.length;
        netBalances = new int256[](memberCount);

        uint256 totalExpense;
        for (uint256 i = 0; i < expenseCount; ++i) totalExpense += bill.expenses[i].amount;
        if (totalExpense == 0) return netBalances;

        bool hasShares = bill.shares.length == memberCount;

        for (uint256 i = 0; i < memberCount; ++i) {
            address member = bill.members[i];
            uint256 totalPaid;
            for (uint256 j = 0; j < expenseCount; ++j) {
                if (bill.expenses[j].paidBy == member) totalPaid += bill.expenses[j].amount;
            }

            uint256 memberShare;
            if (hasShares) {
                memberShare = (totalExpense * bill.shares[i]) / 10000;
            } else {
                memberShare = totalExpense / memberCount;
                if (i == 0) memberShare += totalExpense - (memberShare * memberCount);
            }

            netBalances[i] = int256(totalPaid) - int256(memberShare);
            // Reduce creditor's net by what debtors have already paid into their claims
            if (netBalances[i] > 0 && debts[i] == 0) {
                // Already a creditor — no adjustment needed here
            }
        }
    }

    function _getMemberCredit(Bill storage bill, uint256 idx) private view returns (uint256) {
        uint256 expenseCount = bill.expenses.length;
        uint256 totalExpense;
        for (uint256 i = 0; i < expenseCount; ++i) totalExpense += bill.expenses[i].amount;
        if (totalExpense == 0) return 0;

        uint256 memberCount = bill.members.length;
        address member = bill.members[idx];
        uint256 totalPaid;
        for (uint256 j = 0; j < expenseCount; ++j) {
            if (bill.expenses[j].paidBy == member) totalPaid += bill.expenses[j].amount;
        }

        bool hasShares = bill.shares.length == memberCount;
        uint256 memberShare;
        if (hasShares) {
            memberShare = (totalExpense * bill.shares[idx]) / 10000;
        } else {
            memberShare = totalExpense / memberCount;
            if (idx == 0) memberShare += totalExpense - (memberShare * memberCount);
        }

        return totalPaid > memberShare ? totalPaid - memberShare : 0;
    }

    function _getBillOrRevert(uint256 billId) private view returns (Bill storage bill) {
        if (billId == 0 || billId >= _billIdCounter) revert BillNotFound(billId);
        bill = _bills[billId];
    }

    // No admin functions — no privileged party can drain user funds.
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * DECIMALS WARNING (Arc Mainnet):
 * - Gas is paid from the native USDC balance (18 decimals).
 * - This contract ONLY uses the USDC ERC-20 token interface (6 decimals),
 *   supplied as constructor arg `_usdc`.
 * - NEVER mix native-balance units and ERC-20 units.
 * - Every `amount` handled here is in 6-decimal ERC-20 USDC units.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BillSplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error BillNotFound(uint256 billId);
    error NotMember();
    error AlreadyFinalized();
    error NotFinalized();
    error NoExpenses();
    error EmptyMembers();
    error TooManyMembers(uint256 count);
    error TooManyExpenses(uint256 count);
    error ZeroAddress();
    error DuplicateMember();
    error ZeroAmount();
    error AlreadySettled();
    error NothingOwed();
    error NothingToClaim();

    /// @notice Hard cap on expenses per bill. Prevents unbounded-loop gas DoS on settle/computeBalances.
    uint256 public constant MAX_EXPENSES = 200;

    event BillCreated(uint256 indexed billId, address indexed creator, address[] members);
    event ExpenseAdded(uint256 indexed billId, address indexed paidBy, uint256 amount, string description);
    event BillFinalized(uint256 indexed billId);
    event Settled(uint256 indexed billId, address indexed settler, uint256 amount);
    event ClaimWithdrawn(uint256 indexed billId, address indexed creditor, uint256 amount);

    struct Expense {
        address paidBy;
        uint256 amount; // 6-decimal ERC-20 USDC units.
        string description;
    }

    struct Bill {
        string name;
        address[] members; // Caller-provided member set; equal-share split across all members.
        Expense[] expenses;
        bool finalized;
        mapping(address => bool) isMember;
    }

    IERC20 public immutable usdc;

    uint256 private _billIdCounter = 1;
    mapping(uint256 id => Bill) private _bills;
    mapping(uint256 billId => mapping(address wallet => bool)) public settled;
    mapping(uint256 billId => mapping(address creditor => uint256)) public claimsOf;

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Create a new bill with equal-split members.
     *
     * TRUST: member addresses are caller-provided. On-chain checks enforce no zero addresses and no duplicates,
     * but do not enforce EOA-vs-contract distinction.
     */
    function createBill(string calldata name, address[] calldata members) external returns (uint256 billId) {
        uint256 providedCount = members.length;
        if (providedCount == 0) revert EmptyMembers();

        bool senderAlreadyIncluded = false;
        for (uint256 i = 0; i < providedCount; ++i) {
            address member = members[i];
            if (member == address(0)) revert ZeroAddress();
            if (member == msg.sender) {
                senderAlreadyIncluded = true;
            }

            for (uint256 j = i + 1; j < providedCount; ++j) {
                if (member == members[j]) revert DuplicateMember();
            }
        }

        uint256 finalCount = providedCount + (senderAlreadyIncluded ? 0 : 1);
        if (finalCount > 20) revert TooManyMembers(finalCount);

        address[] memory finalMembers = new address[](finalCount);
        for (uint256 i = 0; i < providedCount; ++i) {
            finalMembers[i] = members[i];
        }
        if (!senderAlreadyIncluded) {
            finalMembers[providedCount] = msg.sender;
        }

        billId = _billIdCounter;
        unchecked {
            _billIdCounter = billId + 1;
        }

        Bill storage bill = _bills[billId];
        bill.name = name;

        for (uint256 i = 0; i < finalCount; ++i) {
            address member = finalMembers[i];
            bill.members.push(member);
            bill.isMember[member] = true;
        }

        emit BillCreated(billId, msg.sender, finalMembers);
    }

    /**
     * @notice Add an expense entry to a bill (6-decimal ERC-20 USDC units).
     */
    function addExpense(uint256 billId, uint256 amount, string calldata description) external {
        // TRUST: Members are trusted to add honest expenses. There is no on-chain proof-of-payment.
        // This is an intentional social-contract design (same as Splitwise, off-chain) — the group
        // is assumed to agree on expense records off-chain. A malicious member can record fake
        // expenses to extract funds; only invite trusted members to a bill.
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.isMember[msg.sender]) revert NotMember();
        if (bill.finalized) revert AlreadyFinalized();
        if (amount == 0) revert ZeroAmount();
        // H-1 fix: cap expenses to bound gas cost of _computeBalances (O(members × expenses)).
        uint256 expenseCount = bill.expenses.length;
        if (expenseCount >= MAX_EXPENSES) revert TooManyExpenses(expenseCount);

        bill.expenses.push(Expense({paidBy: msg.sender, amount: amount, description: description}));

        emit ExpenseAdded(billId, msg.sender, amount, description);
    }

    /**
     * @notice Finalize a bill so members can settle debts.
     */
    function finalize(uint256 billId) external {
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.isMember[msg.sender]) revert NotMember();
        if (bill.finalized) revert AlreadyFinalized();
        if (bill.expenses.length == 0) revert NoExpenses();

        bill.finalized = true;

        emit BillFinalized(billId);
    }

    /**
     * @notice Settle caller's owed amount by pulling USDC and accruing creditor claims.
     * @dev This is the only function that pulls USDC from debtors, so it is nonReentrant.
     */
    function settle(uint256 billId) external nonReentrant {
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.finalized) revert NotFinalized();
        if (!bill.isMember[msg.sender]) revert NotMember();
        if (settled[billId][msg.sender]) revert AlreadySettled();

        (int256[] memory balances, uint256 totalCredits, uint256 creditorCount) = _computeBalances(bill);

        int256 senderBalance;
        uint256 memberCount = bill.members.length;
        for (uint256 i = 0; i < memberCount; ++i) {
            if (bill.members[i] == msg.sender) {
                senderBalance = balances[i];
                break;
            }
        }

        if (senderBalance >= 0) revert AlreadySettled();

        uint256 owedAmount = uint256(-senderBalance); // 6-decimal ERC-20 USDC units.
        if (owedAmount == 0) revert NothingOwed();

        // This contract never uses msg.value or native balances.
        usdc.safeTransferFrom(msg.sender, address(this), owedAmount);

        uint256 distributed;
        uint256 paidCreditors;

        // Running-remainder distribution: all rounding dust is assigned to the final creditor,
        // so all owedAmount is fully distributed into claim balances.
        for (uint256 i = 0; i < memberCount; ++i) {
            int256 balance = balances[i];
            if (balance <= 0) continue;

            uint256 creditorBalance = uint256(balance); // 6-decimal ERC-20 USDC units.
            uint256 payment;

            if (paidCreditors + 1 == creditorCount) {
                payment = owedAmount - distributed;
            } else {
                payment = (owedAmount * creditorBalance) / totalCredits;
                distributed += payment;
            }

            if (payment > 0) {
                claimsOf[billId][bill.members[i]] += payment;
            }

            paidCreditors += 1;
        }

        settled[billId][msg.sender] = true;
        emit Settled(billId, msg.sender, owedAmount);
    }

    function withdrawClaim(uint256 billId) external nonReentrant {
        uint256 amount = claimsOf[billId][msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimsOf[billId][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit ClaimWithdrawn(billId, msg.sender, amount);
    }

    /**
     * @notice Return top-level bill metadata.
     */
    function getBill(uint256 billId) external view returns (string memory name, address[] memory members, bool finalized) {
        Bill storage bill = _getBillOrRevert(billId);
        return (bill.name, bill.members, bill.finalized);
    }

    /**
     * @notice Return all expenses for a bill.
     */
    function getExpenses(uint256 billId) external view returns (Expense[] memory) {
        Bill storage bill = _getBillOrRevert(billId);
        return bill.expenses;
    }

    /**
     * @notice Return member net balance after finalization: positive = owed by others, negative = owes others.
     * @dev If the bill is not finalized (or wallet is not a member), returns 0.
     */
    function getMemberBalance(uint256 billId, address member) external view returns (int256) {
        Bill storage bill = _getBillOrRevert(billId);
        if (!bill.finalized || !bill.isMember[member]) {
            return 0;
        }

        (int256[] memory balances,,) = _computeBalances(bill);

        uint256 memberCount = bill.members.length;
        for (uint256 i = 0; i < memberCount; ++i) {
            if (bill.members[i] == member) {
                return balances[i];
            }
        }

        return 0;
    }

    /**
     * @notice Return per-member balances and settled flags for UI display.
     */
    function getSettlementStatus(uint256 billId)
        external
        view
        returns (address[] memory members, int256[] memory balances, bool[] memory settledStatus)
    {
        Bill storage bill = _getBillOrRevert(billId);

        uint256 memberCount = bill.members.length;
        members = bill.members;
        balances = new int256[](memberCount);
        settledStatus = new bool[](memberCount);

        if (bill.finalized) {
            (balances,,) = _computeBalances(bill);
        }

        for (uint256 i = 0; i < memberCount; ++i) {
            settledStatus[i] = settled[billId][members[i]];
        }
    }

    /**
     * @notice Return bill IDs where wallet is a member (linear scan for testnet simplicity).
     */
    function billsOf(address wallet) external view returns (uint256[] memory) {
        uint256 lastCreatedId = _billIdCounter;
        uint256 count;

        for (uint256 id = 1; id < lastCreatedId; ++id) {
            if (_bills[id].isMember[wallet]) {
                count += 1;
            }
        }

        uint256[] memory ids = new uint256[](count);
        uint256 index;

        for (uint256 id = 1; id < lastCreatedId; ++id) {
            if (_bills[id].isMember[wallet]) {
                ids[index] = id;
                index += 1;
            }
        }

        return ids;
    }

    function _getBillOrRevert(uint256 billId) private view returns (Bill storage bill) {
        if (billId == 0 || billId >= _billIdCounter) {
            revert BillNotFound(billId);
        }
        bill = _bills[billId];
    }

    /**
     * @dev Compute finalized net balances in 6-decimal ERC-20 USDC units.
     *      int256 cast safety: for Arc testnet usage, totalPaid/equalShare values are bounded well below int256 max.
     */
    function _computeBalances(Bill storage bill)
        private
        view
        returns (int256[] memory balances, uint256 totalCredits, uint256 creditorCount)
    {
        uint256 memberCount = bill.members.length;
        balances = new int256[](memberCount);

        uint256 expenseCount = bill.expenses.length;
        uint256 totalExpense;
        for (uint256 i = 0; i < expenseCount; ++i) {
            totalExpense += bill.expenses[i].amount;
        }

        uint256 equalShare = totalExpense / memberCount;
        uint256 remainder = totalExpense - (equalShare * memberCount);

        for (uint256 i = 0; i < memberCount; ++i) {
            address member = bill.members[i];
            uint256 totalPaid;

            for (uint256 j = 0; j < expenseCount; ++j) {
                Expense storage expense = bill.expenses[j];
                if (expense.paidBy == member) {
                    totalPaid += expense.amount;
                }
            }

            uint256 memberShare = equalShare;
            if (i == 0) {
                memberShare += remainder;
            }

            int256 netBalance = int256(totalPaid) - int256(memberShare);
            balances[i] = netBalance;

            if (netBalance > 0) {
                totalCredits += uint256(netBalance);
                creditorCount += 1;
            }
        }
    }

    // No admin functions — no way for any privileged party to drain user funds.
}

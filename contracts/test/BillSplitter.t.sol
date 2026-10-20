// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {BillSplitter} from "../BillSplitter.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ══════════════════════════════════════════════════════════════════════════════
// BillSplitter Test Suite
// ══════════════════════════════════════════════════════════════════════════════
contract BillSplitterTest is Test {
    // ── contracts ─────────────────────────────────────────────────────────────
    BillSplitter internal splitter;
    MockERC20    internal usdc;

    // ── actors ────────────────────────────────────────────────────────────────
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");
    address internal carol   = makeAddr("carol");
    address internal dave    = makeAddr("dave");
    address internal eve     = makeAddr("eve");
    address internal nonMember = makeAddr("nonMember");

    // ── USDC amounts (6 decimals) ──────────────────────────────────────────────
    uint256 internal constant SEED = 1_000_000e6; // large seed so debtors always have enough

    // ── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public {
        usdc     = new MockERC20("Mock USDC", "mUSDC", 6);
        splitter = new BillSplitter(address(usdc));

        // Seed every actor with USDC and approve the splitter to pull unlimited.
        address[5] memory actors = [alice, bob, carol, dave, eve];
        for (uint256 i = 0; i < actors.length; ++i) {
            usdc.mint(actors[i], SEED);
            vm.prank(actors[i]);
            usdc.approve(address(splitter), type(uint256).max);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /// Build address[] on the fly.
    function _arr2(address a, address b) internal pure returns (address[] memory arr) {
        arr = new address[](2);
        arr[0] = a; arr[1] = b;
    }

    function _arr3(address a, address b, address c) internal pure returns (address[] memory arr) {
        arr = new address[](3);
        arr[0] = a; arr[1] = b; arr[2] = c;
    }

    function _arr1(address a) internal pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = a;
    }

    /// Create a bill where alice calls createBill([bob, carol]) → members=[bob,carol,alice].
    function _create3MemberBill() internal returns (uint256 billId) {
        vm.prank(alice);
        billId = splitter.createBill("Dinner", _arr2(bob, carol));
    }

    /// Create, add expense, finalize.
    function _finalise3MemberBill() internal returns (uint256 billId) {
        billId = _create3MemberBill();
        // alice pays 30 USDC for the group
        vm.prank(alice);
        splitter.addExpense(billId, 30e6, "Dinner");
        vm.prank(alice);
        splitter.finalize(billId);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DEPLOYMENT / INITIALIZATION
    // ══════════════════════════════════════════════════════════════════════════

    function test_ConstructorSetsUSDC() public view {
        assertEq(address(splitter.usdc()), address(usdc));
    }

    function test_ConstructorRevertsOnZeroUSDC() public {
        vm.expectRevert(BillSplitter.ZeroAddress.selector);
        new BillSplitter(address(0));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. createBill — happy path & reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_CreateBill_HappyPath() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(splitter));
        address[] memory expectedMembers = _arr3(bob, carol, alice);
        emit BillSplitter.BillCreated(1, alice, expectedMembers);
        uint256 id = splitter.createBill("Trip", _arr2(bob, carol));
        assertEq(id, 1);

        (string memory name, address[] memory members, bool finalized) = splitter.getBill(id);
        assertEq(name, "Trip");
        assertEq(members.length, 3);
        assertEq(members[0], bob);
        assertEq(members[1], carol);
        assertEq(members[2], alice); // auto-added sender at end
        assertFalse(finalized);
    }

    function test_CreateBill_SenderAlreadyInList() public {
        // alice includes herself — should NOT be added twice
        vm.prank(alice);
        uint256 id = splitter.createBill("Solo", _arr2(alice, bob));
        (, address[] memory members,) = splitter.getBill(id);
        assertEq(members.length, 2); // no duplicate
    }

    function test_CreateBill_RevertEmptyMembers() public {
        address[] memory empty = new address[](0);
        vm.prank(alice);
        vm.expectRevert(BillSplitter.EmptyMembers.selector);
        splitter.createBill("X", empty);
    }

    function test_CreateBill_RevertZeroAddress() public {
        address[] memory members = new address[](2);
        members[0] = bob;
        members[1] = address(0);
        vm.prank(alice);
        vm.expectRevert(BillSplitter.ZeroAddress.selector);
        splitter.createBill("X", members);
    }

    function test_CreateBill_RevertDuplicateMember() public {
        vm.prank(alice);
        vm.expectRevert(BillSplitter.DuplicateMember.selector);
        splitter.createBill("X", _arr2(bob, bob));
    }

    function test_CreateBill_RevertTooManyMembers() public {
        // Provide exactly 20 distinct non-sender addresses → finalCount = 21 > 20
        address[] memory members = new address[](20);
        for (uint256 i = 0; i < 20; ++i) {
            members[i] = address(uint160(0x1000 + i));
        }
        vm.prank(alice); // alice is not in the list → adds 1 more → 21
        vm.expectRevert(abi.encodeWithSelector(BillSplitter.TooManyMembers.selector, uint256(21)));
        splitter.createBill("X", members);
    }

    function test_CreateBill_Exactly20Members_Sender_In_List() public {
        // 20 members including alice herself → finalCount == 20, should not revert
        address[] memory members = new address[](20);
        members[0] = alice;
        for (uint256 i = 1; i < 20; ++i) {
            members[i] = address(uint160(0x1000 + i));
        }
        vm.prank(alice);
        uint256 id = splitter.createBill("MaxBill", members);
        (, address[] memory storedMembers,) = splitter.getBill(id);
        assertEq(storedMembers.length, 20);
    }

    function test_CreateBill_CounterIncrements() public {
        vm.prank(alice);
        uint256 id1 = splitter.createBill("A", _arr1(bob));
        vm.prank(alice);
        uint256 id2 = splitter.createBill("B", _arr1(bob));
        assertEq(id2, id1 + 1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. addExpense — happy path & reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_AddExpense_HappyPath() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(splitter));
        emit BillSplitter.ExpenseAdded(id, alice, 30e6, "Dinner");
        splitter.addExpense(id, 30e6, "Dinner");

        BillSplitter.Expense[] memory exps = splitter.getExpenses(id);
        assertEq(exps.length, 1);
        assertEq(exps[0].paidBy, alice);
        assertEq(exps[0].amount, 30e6);
        assertEq(exps[0].description, "Dinner");
    }

    function test_AddExpense_MultipleExpensesByDifferentMembers() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        splitter.addExpense(id, 30e6, "Dinner");
        vm.prank(bob);
        splitter.addExpense(id, 12e6, "Taxi");

        BillSplitter.Expense[] memory exps = splitter.getExpenses(id);
        assertEq(exps.length, 2);
        assertEq(exps[1].paidBy, bob);
        assertEq(exps[1].amount, 12e6);
    }

    function test_AddExpense_RevertNotMember() public {
        uint256 id = _create3MemberBill();
        vm.prank(nonMember);
        vm.expectRevert(BillSplitter.NotMember.selector);
        splitter.addExpense(id, 10e6, "X");
    }

    function test_AddExpense_RevertAlreadyFinalized() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitter.AlreadyFinalized.selector);
        splitter.addExpense(id, 5e6, "Late");
    }

    function test_AddExpense_RevertZeroAmount() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitter.ZeroAmount.selector);
        splitter.addExpense(id, 0, "Free");
    }

    function test_AddExpense_RevertBillNotFound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BillSplitter.BillNotFound.selector, uint256(999)));
        splitter.addExpense(999, 10e6, "X");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. finalize — happy path & reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_Finalize_HappyPath() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        splitter.addExpense(id, 30e6, "Dinner");

        vm.prank(bob); // any member can finalize
        vm.expectEmit(true, false, false, false, address(splitter));
        emit BillSplitter.BillFinalized(id);
        splitter.finalize(id);

        (,, bool finalized) = splitter.getBill(id);
        assertTrue(finalized);
    }

    function test_Finalize_RevertNotMember() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        splitter.addExpense(id, 10e6, "X");
        vm.prank(nonMember);
        vm.expectRevert(BillSplitter.NotMember.selector);
        splitter.finalize(id);
    }

    function test_Finalize_RevertAlreadyFinalized() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitter.AlreadyFinalized.selector);
        splitter.finalize(id);
    }

    function test_Finalize_RevertNoExpenses() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitter.NoExpenses.selector);
        splitter.finalize(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. HAPPY PATH END-TO-END: 3 members, A pays 30, B & C settle, A withdraws
    // ══════════════════════════════════════════════════════════════════════════
    //
    // createBill([bob, carol]) called by alice:
    //   finalMembers = [bob(0), carol(1), alice(2)]
    //   equalShare = 30e6/3 = 10e6, remainder = 0
    //   bob:   paid=0, share=10e6 → balance=-10e6 (debtor)
    //   carol: paid=0, share=10e6 → balance=-10e6 (debtor)
    //   alice: paid=30e6, share=10e6 → balance=+20e6 (creditor)
    //
    function test_HappyPath_ThreeMembers_FullCycle() public {
        uint256 id = _finalise3MemberBill();

        // Verify balances
        assertEq(splitter.getMemberBalance(id, bob),   -10e6);
        assertEq(splitter.getMemberBalance(id, carol), -10e6);
        assertEq(splitter.getMemberBalance(id, alice),  20e6);

        uint256 bobBefore   = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);
        uint256 aliceBefore = usdc.balanceOf(alice);

        // Bob settles
        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(splitter));
        emit BillSplitter.Settled(id, bob, 10e6);
        splitter.settle(id);
        assertTrue(splitter.settled(id, bob));
        assertEq(usdc.balanceOf(bob), bobBefore - 10e6);

        // Carol settles
        vm.prank(carol);
        vm.expectEmit(true, true, false, true, address(splitter));
        emit BillSplitter.Settled(id, carol, 10e6);
        splitter.settle(id);
        assertTrue(splitter.settled(id, carol));
        assertEq(usdc.balanceOf(carol), carolBefore - 10e6);

        // Alice's claim should now be 20e6
        assertEq(splitter.claimsOf(id, alice), 20e6);

        // Alice withdraws
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(splitter));
        emit BillSplitter.ClaimWithdrawn(id, alice, 20e6);
        splitter.withdrawClaim(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + 20e6);
        assertEq(splitter.claimsOf(id, alice), 0);

        // Contract holds no USDC after full cycle
        assertEq(usdc.balanceOf(address(splitter)), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. settle — reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_Settle_RevertNotFinalized() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        splitter.addExpense(id, 30e6, "Dinner");
        // NOT finalized yet
        vm.prank(bob);
        vm.expectRevert(BillSplitter.NotFinalized.selector);
        splitter.settle(id);
    }

    function test_Settle_RevertNotMember() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(nonMember);
        vm.expectRevert(BillSplitter.NotMember.selector);
        splitter.settle(id);
    }

    function test_Settle_RevertAlreadySettled_CalledTwice() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(bob);
        splitter.settle(id);
        vm.prank(bob);
        vm.expectRevert(BillSplitter.AlreadySettled.selector);
        splitter.settle(id);
    }

    function test_Settle_RevertNothingOwed_CreditorTriesToSettle() public {
        // alice is a creditor (balance=+20e6) — should get AlreadySettled
        // because senderBalance >= 0 → revert AlreadySettled (contract uses AlreadySettled for >=0 guard)
        uint256 id = _finalise3MemberBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitter.AlreadySettled.selector);
        splitter.settle(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. withdrawClaim — reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_WithdrawClaim_RevertNothingToClaim() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitter.NothingToClaim.selector);
        splitter.withdrawClaim(id); // no debtors have settled yet → no claim accrued
    }

    function test_WithdrawClaim_RevertNothingToClaim_NonMember() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(bob);
        splitter.settle(id);
        vm.prank(nonMember);
        vm.expectRevert(BillSplitter.NothingToClaim.selector);
        splitter.withdrawClaim(id);
    }

    function test_WithdrawClaim_RevertNothingToClaim_AfterWithdraw() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(bob);   splitter.settle(id);
        vm.prank(carol); splitter.settle(id);

        vm.prank(alice); splitter.withdrawClaim(id);
        // Second withdraw should revert
        vm.prank(alice);
        vm.expectRevert(BillSplitter.NothingToClaim.selector);
        splitter.withdrawClaim(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 8. ROUNDING: 4 members, total expense = 7 units (raw, sub-USDC)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // USDC has 6 decimals; to trigger integer-division remainder we use 7 raw
    // units (= 0.000007 USDC) which does NOT divide evenly by 4.
    //
    // alice calls createBill([bob, carol, dave]) → finalMembers=[bob(0),carol(1),dave(2),alice(3)]
    // alice adds 7 raw units as the expense.
    //   equalShare = 7/4 = 1, remainder = 7 - 1*4 = 3 (goes to index 0 = bob)
    //   bob:   paid=0, share=1+3=4 → balance=-4 (debtor, owes 4)
    //   carol: paid=0, share=1     → balance=-1 (debtor, owes 1)
    //   dave:  paid=0, share=1     → balance=-1 (debtor, owes 1)
    //   alice: paid=7, share=1     → balance=+6 (creditor, owed 6)
    //   Check: debtors pay 4+1+1=6, creditor receives 6. ✓
    //
    function test_Rounding_FourMembers_SevenRawUnits() public {
        vm.prank(alice);
        uint256 id = splitter.createBill("Rounding", _arr3(bob, carol, dave));

        vm.prank(alice);
        splitter.addExpense(id, 7, "Food"); // 7 raw units (0.000007 USDC)
        vm.prank(alice);
        splitter.finalize(id);

        // Verify individual balances
        assertEq(splitter.getMemberBalance(id, bob),   -4); // gets the remainder share
        assertEq(splitter.getMemberBalance(id, carol), -1);
        assertEq(splitter.getMemberBalance(id, dave),  -1);
        assertEq(splitter.getMemberBalance(id, alice),  6);

        // All debtors settle
        vm.prank(bob);   splitter.settle(id);
        vm.prank(carol); splitter.settle(id);
        vm.prank(dave);  splitter.settle(id);

        // Alice withdraws
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        splitter.withdrawClaim(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + 6);

        // Contract holds no USDC after full cycle
        assertEq(usdc.balanceOf(address(splitter)), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 9. MULTI-DEBTOR: 3 members, 2 debtors, 1 creditor (both debtors settle)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // alice calls createBill([bob, carol]) → finalMembers=[bob(0),carol(1),alice(2)]
    // alice pays 30e6.
    //   bob:   balance=-10e6
    //   carol: balance=-10e6
    //   alice: balance=+20e6
    // Both bob AND carol settle; alice withdraws.
    // (This overlaps test 5 intentionally but explicitly checks sequential settle ordering.)
    //
    function test_MultiDebtor_BothSettleSequential() public {
        uint256 id = _finalise3MemberBill();

        uint256 contractBefore = usdc.balanceOf(address(splitter));
        assertEq(contractBefore, 0);

        // Bob settles first
        vm.prank(bob);
        splitter.settle(id);
        assertEq(usdc.balanceOf(address(splitter)), 10e6);
        // After bob settles 10e6, alice's interim claim is 10e6
        assertEq(splitter.claimsOf(id, alice), 10e6);

        // Carol settles second
        vm.prank(carol);
        splitter.settle(id);
        assertEq(usdc.balanceOf(address(splitter)), 20e6);
        assertEq(splitter.claimsOf(id, alice), 20e6);

        // Alice withdraws
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        splitter.withdrawClaim(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + 20e6);
        assertEq(usdc.balanceOf(address(splitter)), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 10. getSettlementStatus — before and after settling
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetSettlementStatus_BeforeFinalize() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        splitter.addExpense(id, 30e6, "Dinner");

        (address[] memory members, int256[] memory balances, bool[] memory settledStatus) =
            splitter.getSettlementStatus(id);

        assertEq(members.length, 3);
        // Before finalize: balances should all be 0
        for (uint256 i = 0; i < 3; ++i) {
            assertEq(balances[i], 0);
            assertFalse(settledStatus[i]);
        }
    }

    function test_GetSettlementStatus_AfterFinalize() public {
        uint256 id = _finalise3MemberBill();
        // finalMembers = [bob(0), carol(1), alice(2)]

        (address[] memory members, int256[] memory balances, bool[] memory settledStatus) =
            splitter.getSettlementStatus(id);

        assertEq(members.length, 3);
        assertEq(members[0], bob);
        assertEq(members[1], carol);
        assertEq(members[2], alice);

        assertEq(balances[0], -10e6); // bob
        assertEq(balances[1], -10e6); // carol
        assertEq(balances[2],  20e6); // alice

        for (uint256 i = 0; i < 3; ++i) {
            assertFalse(settledStatus[i]);
        }
    }

    function test_GetSettlementStatus_AfterBobSettles() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(bob);
        splitter.settle(id);

        (, , bool[] memory settledStatus) = splitter.getSettlementStatus(id);
        assertTrue(settledStatus[0]);  // bob settled
        assertFalse(settledStatus[1]); // carol not yet
        assertFalse(settledStatus[2]); // alice (creditor) never settles via settle()
    }

    function test_GetSettlementStatus_AfterBothDebtorsSettle() public {
        uint256 id = _finalise3MemberBill();
        vm.prank(bob);   splitter.settle(id);
        vm.prank(carol); splitter.settle(id);

        (, , bool[] memory settledStatus) = splitter.getSettlementStatus(id);
        assertTrue(settledStatus[0]);  // bob
        assertTrue(settledStatus[1]);  // carol
        assertFalse(settledStatus[2]); // alice (creditor, never called settle)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 11. billsOf — returns correct bill IDs for a member
    // ══════════════════════════════════════════════════════════════════════════

    function test_BillsOf_SingleBill() public {
        uint256 id = _create3MemberBill(); // members: bob, carol, alice

        uint256[] memory aliceBills = splitter.billsOf(alice);
        uint256[] memory bobBills   = splitter.billsOf(bob);
        uint256[] memory daveBills  = splitter.billsOf(dave); // not a member

        assertEq(aliceBills.length, 1);
        assertEq(aliceBills[0], id);

        assertEq(bobBills.length, 1);
        assertEq(bobBills[0], id);

        assertEq(daveBills.length, 0);
    }

    function test_BillsOf_MultipleBills() public {
        vm.prank(alice);
        uint256 id1 = splitter.createBill("Bill1", _arr1(bob));   // alice + bob
        vm.prank(alice);
        uint256 id2 = splitter.createBill("Bill2", _arr1(carol)); // alice + carol
        vm.prank(bob);
        uint256 id3 = splitter.createBill("Bill3", _arr1(carol)); // bob + carol

        uint256[] memory aliceBills = splitter.billsOf(alice);
        assertEq(aliceBills.length, 2);
        assertEq(aliceBills[0], id1);
        assertEq(aliceBills[1], id2);

        uint256[] memory bobBills = splitter.billsOf(bob);
        assertEq(bobBills.length, 2);
        assertEq(bobBills[0], id1);
        assertEq(bobBills[1], id3);

        uint256[] memory carolBills = splitter.billsOf(carol);
        assertEq(carolBills.length, 2);
        assertEq(carolBills[0], id2);
        assertEq(carolBills[1], id3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 12. getMemberBalance — before and after finalize
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetMemberBalance_BeforeFinalize_ReturnsZero() public {
        uint256 id = _create3MemberBill();
        vm.prank(alice);
        splitter.addExpense(id, 30e6, "Dinner");

        // Not finalized → returns 0
        assertEq(splitter.getMemberBalance(id, alice), 0);
        assertEq(splitter.getMemberBalance(id, bob),   0);
    }

    function test_GetMemberBalance_NonMember_ReturnsZero() public {
        uint256 id = _finalise3MemberBill();
        assertEq(splitter.getMemberBalance(id, nonMember), 0);
    }

    function test_GetMemberBalance_AfterFinalize_Correct() public {
        uint256 id = _finalise3MemberBill();
        assertEq(splitter.getMemberBalance(id, bob),   -10e6);
        assertEq(splitter.getMemberBalance(id, carol), -10e6);
        assertEq(splitter.getMemberBalance(id, alice),  20e6);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 13. getBill / getExpenses — BillNotFound
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetBill_RevertBillNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(BillSplitter.BillNotFound.selector, uint256(0)));
        splitter.getBill(0);
    }

    function test_GetBill_RevertBillNotFoundNonExistent() public {
        vm.expectRevert(abi.encodeWithSelector(BillSplitter.BillNotFound.selector, uint256(999)));
        splitter.getBill(999);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 14. FUZZ: random amounts and member count — invariant: no USDC locked
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Strategy:
    //   - Pick 2..5 members from our fixed actor pool.
    //   - Pick a random total expense amount bounded so that amount >= memberCount,
    //     guaranteeing each debtor's equalShare >= 1 (no zero-balance members).
    //   - alice pays the whole expense (only creditor). Everyone else is a debtor.
    //   - All debtors settle; creditor withdraws.
    //   - Invariant: contract balance == 0 after all operations.
    //
    // NOTE: when amount < memberCount, equalShare=0 and some members have balance==0
    // (neither debtor nor creditor). Those members cannot call settle() (NothingOwed)
    // and have no claim. That edge case is NOT a contract bug — it is correct behaviour
    // for tiny amounts; we just bound the fuzz inputs to avoid it here.
    //
    function testFuzz_NoUSDCLockedAfterFullCycle(
        uint256 rawAmount,
        uint8 rawMemberCount
    ) public {
        uint8   memberCount = uint8(bound(uint256(rawMemberCount), 2, 5));
        // Ensure amount >= memberCount so every debtor has equalShare >= 1.
        uint256 amount      = bound(rawAmount, uint256(memberCount), 1_000_000e6);

        // Fixed actor pool in a deterministic order.
        address[5] memory pool = [alice, bob, carol, dave, eve];

        // creditor is pool[0] = alice (will pay the expense and be the creator)
        // alice is auto-added by createBill, so provided list = pool[1..memberCount-1]
        address creditor = pool[0]; // alice

        uint256 debtorCount = memberCount - 1;
        address[] memory providedMembers = new address[](debtorCount);
        for (uint256 i = 0; i < debtorCount; ++i) {
            providedMembers[i] = pool[i + 1];
        }

        // Ensure every participant has enough USDC and unlimited allowance
        for (uint256 i = 0; i < memberCount; ++i) {
            uint256 bal = usdc.balanceOf(pool[i]);
            if (bal < amount) {
                usdc.mint(pool[i], amount - bal);
            }
            // allowance already set to max in setUp; refresh to ensure it covers this amount
            vm.prank(pool[i]);
            usdc.approve(address(splitter), type(uint256).max);
        }

        // Create bill: alice provides [bob, carol?, dave?, eve?]
        // finalMembers = [pool[1], ..., pool[memberCount-1], alice] (alice is LAST)
        vm.prank(creditor);
        uint256 id = splitter.createBill("Fuzz", providedMembers);

        // Alice adds the expense (she is the sole payer → only creditor)
        vm.prank(creditor);
        splitter.addExpense(id, amount, "Fuzz Expense");

        // Alice finalizes
        vm.prank(creditor);
        splitter.finalize(id);

        // Verify alice is indeed a creditor and all provided members are debtors
        int256 creditorBal = splitter.getMemberBalance(id, creditor);
        assertTrue(creditorBal > 0, "alice should be a creditor");

        for (uint256 i = 0; i < debtorCount; ++i) {
            address debtor = pool[i + 1];
            int256 bal = splitter.getMemberBalance(id, debtor);
            // With amount >= memberCount, equalShare >= 1 for every member
            assertTrue(bal < 0, "expected debtor to have negative balance");
            vm.prank(debtor);
            splitter.settle(id);
        }

        // Creditor withdraws
        uint256 claim = splitter.claimsOf(id, creditor);
        assertTrue(claim > 0, "creditor should have a non-zero claim");
        vm.prank(creditor);
        splitter.withdrawClaim(id);

        // INVARIANT: no USDC remains locked in the contract
        assertEq(usdc.balanceOf(address(splitter)), 0, "contract should hold 0 USDC after full cycle");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 15. FUZZ: amounts with multiple creditors — sum of withdrawals == sum of debtor payments
    // ══════════════════════════════════════════════════════════════════════════
    //
    // 3 members: alice pays amount1, bob pays amount2, carol pays nothing.
    // alice is creator: createBill([bob, carol]) → finalMembers=[bob,carol,alice]
    // equalShare = (amount1+amount2)/3, remainder goes to members[0]=bob
    //
    function testFuzz_MultipleCreditors_NoLeak(
        uint256 rawAmount1,
        uint256 rawAmount2
    ) public {
        // Keep amounts small enough that integer arithmetic is predictable.
        uint256 amount1 = bound(rawAmount1, 1, 1_000_000e6);
        uint256 amount2 = bound(rawAmount2, 1, 1_000_000e6);
        uint256 total   = amount1 + amount2;

        // Ensure actors have enough USDC
        if (usdc.balanceOf(alice) < amount1) usdc.mint(alice, amount1);
        if (usdc.balanceOf(bob)   < amount2) usdc.mint(bob,   amount2);

        // Create bill: alice creates [bob, carol] → finalMembers = [bob, carol, alice]
        vm.prank(alice);
        uint256 id = splitter.createBill("MultiCred", _arr2(bob, carol));

        vm.prank(alice); splitter.addExpense(id, amount1, "Alice paid");
        vm.prank(bob);   splitter.addExpense(id, amount2, "Bob paid");
        vm.prank(alice); splitter.finalize(id);

        // Identify each member's balance
        int256 bobBal   = splitter.getMemberBalance(id, bob);
        int256 carolBal = splitter.getMemberBalance(id, carol);
        int256 aliceBal = splitter.getMemberBalance(id, alice);

        // Sum of all balances must be zero (conservation)
        assertEq(bobBal + carolBal + aliceBal, 0, "balance sum must be zero");

        uint256 contractBalanceBefore = usdc.balanceOf(address(splitter));
        assertEq(contractBalanceBefore, 0);

        // All debtors (balance < 0) settle
        if (bobBal < 0) {
            vm.prank(bob);
            splitter.settle(id);
        }
        if (carolBal < 0) {
            vm.prank(carol);
            splitter.settle(id);
        }
        if (aliceBal < 0) {
            vm.prank(alice);
            splitter.settle(id);
        }

        // All creditors withdraw
        if (bobBal > 0) {
            vm.prank(bob);
            splitter.withdrawClaim(id);
        }
        if (carolBal > 0) {
            vm.prank(carol);
            splitter.withdrawClaim(id);
        }
        if (aliceBal > 0) {
            vm.prank(alice);
            splitter.withdrawClaim(id);
        }

        // INVARIANT: No USDC locked after all creditors withdraw
        assertEq(usdc.balanceOf(address(splitter)), 0, "No USDC should remain locked");

        // Sanity: total must equal amount1 + amount2
        assertEq(total, amount1 + amount2);

    }
}

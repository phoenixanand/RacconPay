// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../BillSplitterV2.sol";
import "../test-helpers/MockERC20.sol";

contract BillSplitterV2Test is Test {
    BillSplitterV2 splitter;
    MockERC20      usdc;

    address alice   = address(0xA1);
    address bob     = address(0xB0B);
    address carol   = address(0xCA);
    address dave    = address(0xDA);
    address nobody  = address(0xFF);

    uint256 constant ONE  = 1e6;   // 1 USDC (6 decimals)
    uint256 constant TEN  = 10e6;
    uint256 constant HUND = 100e6;

    function setUp() public {
        usdc     = new MockERC20("USD Coin", "USDC", 6);
        splitter = new BillSplitterV2(address(usdc));

        usdc.mint(alice,  10_000e6);
        usdc.mint(bob,    10_000e6);
        usdc.mint(carol,  10_000e6);
        usdc.mint(dave,   10_000e6);

        vm.prank(alice); usdc.approve(address(splitter), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(splitter), type(uint256).max);
        vm.prank(carol); usdc.approve(address(splitter), type(uint256).max);
        vm.prank(dave);  usdc.approve(address(splitter), type(uint256).max);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    function _members2() internal view returns (address[] memory m) {
        m = new address[](2); m[0] = alice; m[1] = bob;
    }
    function _members3() internal view returns (address[] memory m) {
        m = new address[](3); m[0] = alice; m[1] = bob; m[2] = carol;
    }

    function _createSimpleBill() internal returns (uint256 billId) {
        vm.prank(alice);
        billId = splitter.createBill("Test", _members2(), 0);
        vm.prank(alice);
        splitter.addExpense(billId, 100e6, "dinner");
        vm.prank(alice);
        splitter.finalize(billId);
    }

    // ── createBill ────────────────────────────────────────────────────────────

    function test_createBill_basic() public {
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), 0);
        assertEq(id, 1);
        (string memory name,,,, ) = splitter.getBill(id);
        assertEq(name, "Trip");
    }

    function test_createBill_autoAddsSender() public {
        address[] memory m = new address[](1);
        m[0] = bob;
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", m, 0);
        (,address[] memory members,,,) = splitter.getBill(id);
        assertEq(members.length, 2);
        bool aliceFound;
        for (uint256 i; i < members.length; i++) if (members[i] == alice) aliceFound = true;
        assertTrue(aliceFound);
    }

    function test_createBill_emptyMembersReverts() public {
        address[] memory m;
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.EmptyMembers.selector);
        splitter.createBill("Trip", m, 0);
    }

    function test_createBill_duplicateMemberReverts() public {
        address[] memory m = new address[](2);
        m[0] = bob; m[1] = bob;
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.DuplicateMember.selector);
        splitter.createBill("Trip", m, 0);
    }

    function test_createBill_zeroAddressReverts() public {
        address[] memory m = new address[](1);
        m[0] = address(0);
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.ZeroAddress.selector);
        splitter.createBill("Trip", m, 0);
    }

    function test_createBill_withExpiry() public {
        uint256 expiry = block.timestamp + 7 days;
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), expiry);
        (,,,, uint256 expiresAt) = splitter.getBill(id);
        assertEq(expiresAt, expiry);
    }

    function test_createBill_pastExpiryReverts() public {
        // Warp to a real timestamp so block.timestamp - 1 > 0
        vm.warp(1_000_000);
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.InvalidExpiry.selector);
        splitter.createBill("Trip", _members2(), block.timestamp - 1);
    }

    // ── createBillWithShares ──────────────────────────────────────────────────

    function test_createBillWithShares_basic() public {
        uint256[] memory shares = new uint256[](2);
        shares[0] = 6000; shares[1] = 4000;
        vm.prank(alice);
        uint256 id = splitter.createBillWithShares("Trip", _members2(), shares, 0);
        (,, uint256[] memory s,,) = splitter.getBill(id);
        assertEq(s[0], 6000);
        assertEq(s[1], 4000);
    }

    function test_createBillWithShares_invalidSumReverts() public {
        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000; shares[1] = 4000; // sum = 9000, not 10000
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.InvalidShares.selector);
        splitter.createBillWithShares("Trip", _members2(), shares, 0);
    }

    // ── createBillWithExpenses ────────────────────────────────────────────────

    function test_createBillWithExpenses_basic() public {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 60e6; amounts[1] = 40e6;
        string[] memory descs = new string[](2);
        descs[0] = "Hotel"; descs[1] = "Dinner";
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;

        vm.prank(alice);
        uint256 id = splitter.createBillWithExpenses(
            "Trip", _members2(), new uint256[](0), 0, amounts, descs, payers
        );

        BillSplitterV2.Expense[] memory exps = splitter.getExpenses(id);
        assertEq(exps.length, 2);
        assertEq(exps[0].amount, 60e6);
        assertEq(exps[1].paidBy, bob);
    }

    function test_createBillWithExpenses_nonMemberPayerReverts() public {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 50e6;
        string[] memory descs = new string[](1);
        descs[0] = "Hotel";
        address[] memory payers = new address[](1);
        payers[0] = nobody;

        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.NotMember.selector);
        splitter.createBillWithExpenses(
            "Trip", _members2(), new uint256[](0), 0, amounts, descs, payers
        );
    }

    // ── finalize / forceFinalize ──────────────────────────────────────────────

    function test_finalize_happy() public {
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), 0);
        vm.prank(alice);
        splitter.addExpense(id, 100e6, "hotel");
        vm.prank(alice);
        splitter.finalize(id);
        (,,, bool finalized,) = splitter.getBill(id);
        assertTrue(finalized);
    }

    function test_finalize_noExpensesReverts() public {
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), 0);
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.NoExpenses.selector);
        splitter.finalize(id);
    }

    function test_finalize_notMemberReverts() public {
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), 0);
        vm.prank(alice);
        splitter.addExpense(id, 100e6, "hotel");
        vm.prank(nobody);
        vm.expectRevert(BillSplitterV2.NotMember.selector);
        splitter.finalize(id);
    }

    function test_forceFinalize_afterExpiry() public {
        uint256 expiry = block.timestamp + 1 days;
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), expiry);
        vm.prank(alice);
        splitter.addExpense(id, 100e6, "hotel");

        vm.warp(block.timestamp + 2 days);
        vm.prank(nobody);
        splitter.forceFinalize(id);
        (,,, bool finalized,) = splitter.getBill(id);
        assertTrue(finalized);
    }

    function test_forceFinalize_beforeExpiryReverts() public {
        uint256 expiry = block.timestamp + 7 days;
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), expiry);
        vm.prank(alice);
        splitter.addExpense(id, 100e6, "hotel");
        vm.prank(nobody);
        vm.expectRevert(BillSplitterV2.NotExpired.selector);
        splitter.forceFinalize(id);
    }

    // ── settle (full) ─────────────────────────────────────────────────────────

    function test_settle_equalSplit_twoMembers() public {
        // alice paid 100, split equally → bob owes 50
        uint256 id = _createSimpleBill();

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        splitter.settle(id);
        assertEq(usdc.balanceOf(bob), bobBefore - 50e6);
        assertEq(splitter.claimsOf(id, alice), 50e6);
    }

    function test_settle_notFinalizedReverts() public {
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members2(), 0);
        vm.prank(alice);
        splitter.addExpense(id, 100e6, "hotel");
        vm.prank(bob);
        vm.expectRevert(BillSplitterV2.NotFinalized.selector);
        splitter.settle(id);
    }

    function test_settle_creditorReverts() public {
        // alice paid everything — she is a creditor, nothing to pay
        uint256 id = _createSimpleBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.NothingOwed.selector);
        splitter.settle(id);
    }

    function test_settle_doubleSettleReverts() public {
        uint256 id = _createSimpleBill();
        vm.prank(bob);
        splitter.settle(id);
        vm.prank(bob);
        vm.expectRevert(BillSplitterV2.NothingOwed.selector);
        splitter.settle(id);
    }

    // ── settlePartial ─────────────────────────────────────────────────────────

    function test_settlePartial_happy() public {
        uint256 id = _createSimpleBill();
        // bob owes 50 — pay 20 first
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        splitter.settlePartial(id, 20e6);
        assertEq(usdc.balanceOf(bob), bobBefore - 20e6);
        assertEq(splitter.claimsOf(id, alice), 20e6);

        // pay remaining 30
        vm.prank(bob);
        splitter.settlePartial(id, 30e6);
        assertEq(splitter.claimsOf(id, alice), 50e6);
    }

    function test_settlePartial_exceedsDebtReverts() public {
        uint256 id = _createSimpleBill();
        vm.prank(bob);
        vm.expectRevert(BillSplitterV2.ExceedsDebt.selector);
        splitter.settlePartial(id, 51e6); // bob only owes 50
    }

    function test_settlePartial_zeroReverts() public {
        uint256 id = _createSimpleBill();
        vm.prank(bob);
        vm.expectRevert(BillSplitterV2.ZeroAmount.selector);
        splitter.settlePartial(id, 0);
    }

    // ── unequal splits ────────────────────────────────────────────────────────

    function test_unequalSplit_settle() public {
        // alice 70%, bob 30% of a 100 USDC bill paid by alice
        uint256[] memory shares = new uint256[](2);
        shares[0] = 7000; shares[1] = 3000;
        vm.prank(alice);
        uint256 id = splitter.createBillWithShares("Trip", _members2(), shares, 0);
        vm.prank(alice);
        splitter.addExpense(id, 100e6, "hotel");
        vm.prank(alice);
        splitter.finalize(id);

        // alice's share = 70 USDC; she paid 100 → net creditor for 30
        // bob's share = 30 USDC; he paid 0 → owes 30

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        splitter.settle(id);
        assertEq(usdc.balanceOf(bob), bobBefore - 30e6);
        assertEq(splitter.claimsOf(id, alice), 30e6);
    }

    // ── withdrawClaim ─────────────────────────────────────────────────────────

    function test_withdrawClaim_happy() public {
        uint256 id = _createSimpleBill();
        vm.prank(bob);
        splitter.settle(id);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        splitter.withdrawClaim(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + 50e6);
        assertEq(splitter.claimsOf(id, alice), 0);
    }

    function test_withdrawClaim_nothingReverts() public {
        uint256 id = _createSimpleBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.NothingToClaim.selector);
        splitter.withdrawClaim(id);
    }

    // ── three-member bills ────────────────────────────────────────────────────

    function test_threeMember_equalSplit() public {
        // alice pays 90 for 3 members → each owes 30; alice is owed 60
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members3(), 0);
        vm.prank(alice);
        splitter.addExpense(id, 90e6, "hotel");
        vm.prank(alice);
        splitter.finalize(id);

        vm.prank(bob);   splitter.settle(id);
        vm.prank(carol); splitter.settle(id);

        // alice should have 60 USDC claimable
        assertEq(splitter.claimsOf(id, alice), 60e6);
    }

    function test_threeMember_multipleExpenses() public {
        // alice pays 60, bob pays 30, carol pays 0. Total 90, share = 30 each.
        // alice: paid 60, share 30, net +30 (creditor)
        // bob:   paid 30, share 30, net 0 (already settled)
        // carol: paid 0,  share 30, net -30 (owes 30)
        vm.prank(alice);
        uint256 id = splitter.createBill("Trip", _members3(), 0);
        vm.prank(alice);
        splitter.addExpense(id, 60e6, "hotel");
        vm.prank(bob);
        splitter.addExpense(id, 30e6, "food");
        vm.prank(alice);
        splitter.finalize(id);

        vm.prank(carol);
        splitter.settle(id);
        assertEq(splitter.claimsOf(id, alice), 30e6);
        // bob is net-zero, nothing to claim and nothing to pay
    }

    // ── billsOf ───────────────────────────────────────────────────────────────

    function test_billsOf() public {
        vm.prank(alice);
        splitter.createBill("B1", _members2(), 0);
        vm.prank(alice);
        splitter.createBill("B2", _members2(), 0);

        uint256[] memory ids = splitter.billsOf(alice);
        assertEq(ids.length, 2);
    }

    // ── getSettlementStatus ───────────────────────────────────────────────────

    function test_getSettlementStatus_partialPay() public {
        uint256 id = _createSimpleBill();
        vm.prank(bob);
        splitter.settlePartial(id, 20e6);

        (,, uint256[] memory paid, uint256[] memory remaining) = splitter.getSettlementStatus(id);
        // members are [alice, bob]; alice is index 0, bob is index 1
        assertEq(paid[1], 20e6);
        assertEq(remaining[1], 30e6);
    }

    // ── edge cases ────────────────────────────────────────────────────────────

    function test_addExpense_afterFinalizeReverts() public {
        uint256 id = _createSimpleBill();
        vm.prank(alice);
        vm.expectRevert(BillSplitterV2.AlreadyFinalized.selector);
        splitter.addExpense(id, 10e6, "extra");
    }

    function test_nonexistentBillReverts() public {
        vm.expectRevert();
        splitter.getBill(999);
    }
}

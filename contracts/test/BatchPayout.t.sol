// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {ReceiptNFT} from "../ReceiptNFT.sol";
import {BatchPayout} from "../BatchPayout.sol";

contract BatchPayoutTest is Test {
    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------
    MockERC20 internal usdc;
    ReceiptNFT internal receiptNFT;
    BatchPayout internal batchPayout;

    address internal payer  = makeAddr("payer");
    address internal alice  = makeAddr("alice");
    address internal bob    = makeAddr("bob");
    address internal carol  = makeAddr("carol");

    uint256 internal constant PAYER_BALANCE = 1_000_000e6; // 1 000 000 USDC (6 dec)

    // -------------------------------------------------------------------------
    // setUp — runs before every test
    // -------------------------------------------------------------------------
    function setUp() public {
        // 1. Deploy mock USDC (6 decimals).
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // 2. Predict BatchPayout address (nonce+1), deploy ReceiptNFT with that minter,
        //    then deploy BatchPayout — atomic wiring, no set-once footgun.
        address predicted = computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        receiptNFT = new ReceiptNFT(predicted);
        batchPayout = new BatchPayout(address(usdc), address(receiptNFT));
        require(address(batchPayout) == predicted, "address mismatch in setUp");

        // 5. Fund the payer and pre-approve BatchPayout for a large standing allowance.
        usdc.mint(payer, PAYER_BALANCE);
        vm.prank(payer);
        usdc.approve(address(batchPayout), type(uint256).max);
    }

    // =========================================================================
    // Helper — build a Recipient array quickly
    // =========================================================================

    function _makeRecipients(
        address[] memory addrs,
        uint256[] memory amounts
    ) internal pure returns (BatchPayout.Recipient[] memory) {
        BatchPayout.Recipient[] memory r = new BatchPayout.Recipient[](addrs.length);
        for (uint256 i = 0; i < addrs.length; ++i) {
            r[i] = BatchPayout.Recipient({addr: addrs[i], amount: amounts[i]});
        }
        return r;
    }

    // =========================================================================
    // 1. Happy path — 3 recipients
    // =========================================================================
    function test_HappyPath_3Recipients() public {
        uint256 amtA = 100e6;
        uint256 amtB = 200e6;
        uint256 amtC = 300e6;
        uint256 total = amtA + amtB + amtC;

        address[] memory addrs   = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        addrs[0] = alice;   amounts[0] = amtA;
        addrs[1] = bob;     amounts[1] = amtB;
        addrs[2] = carol;   amounts[2] = amtC;

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        // Expect the BatchPaid event (topic0=sig, topic1=payer are indexed; remaining unchecked by value)
        vm.expectEmit(true, false, false, false, address(batchPayout));
        emit BatchPayout.BatchPaid(payer, total, 3, 1);

        vm.prank(payer);
        batchPayout.batchPay(recipients);

        // USDC balances
        assertEq(usdc.balanceOf(alice), amtA,                    "alice balance");
        assertEq(usdc.balanceOf(bob),   amtB,                    "bob balance");
        assertEq(usdc.balanceOf(carol), amtC,                    "carol balance");
        assertEq(usdc.balanceOf(payer), PAYER_BALANCE - total,   "payer balance");
        // Contract should hold no residual USDC
        assertEq(usdc.balanceOf(address(batchPayout)), 0,        "contract holds no USDC");
    }

    // =========================================================================
    // 2. Wrong total — approval less than batch total reverts
    // =========================================================================
    function test_WrongTotal_InsufficientApprovalReverts() public {
        uint256 amtA = 100e6;
        uint256 amtB = 200e6;
        uint256 total = amtA + amtB;

        address[] memory addrs   = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        addrs[0] = alice;  amounts[0] = amtA;
        addrs[1] = bob;    amounts[1] = amtB;

        // Revoke the standing approval set in setUp and set one that is too small.
        vm.prank(payer);
        usdc.approve(address(batchPayout), total - 1);

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        // safeTransferFrom will revert with the ERC-20 insufficient-allowance reason.
        vm.expectRevert();
        batchPayout.batchPay(recipients);
    }

    // =========================================================================
    // 3. Zero amount — any recipient with amount==0 reverts with ZeroAmount
    // =========================================================================
    function test_ZeroAmount_Reverts() public {
        address[] memory addrs   = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        addrs[0] = alice;  amounts[0] = 100e6;
        addrs[1] = bob;    amounts[1] = 0;       // ← zero

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(BatchPayout.ZeroAmount.selector, uint256(1)));
        batchPayout.batchPay(recipients);
    }

    // Also check index 0
    function test_ZeroAmount_Index0_Reverts() public {
        address[] memory addrs   = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        addrs[0] = alice;  amounts[0] = 0;

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(BatchPayout.ZeroAmount.selector, uint256(0)));
        batchPayout.batchPay(recipients);
    }

    // =========================================================================
    // 4. Zero address — any recipient with addr==address(0) reverts with ZeroAddress
    // =========================================================================
    function test_ZeroAddress_Reverts() public {
        address[] memory addrs   = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        addrs[0] = alice;       amounts[0] = 100e6;
        addrs[1] = address(0);  amounts[1] = 50e6; // ← zero address

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(BatchPayout.ZeroAddress.selector, uint256(1)));
        batchPayout.batchPay(recipients);
    }

    // =========================================================================
    // 5. Too many recipients — 101 recipients reverts with TooManyRecipients
    // =========================================================================
    function test_TooManyRecipients_Reverts() public {
        uint256 count = 101;
        address[] memory addrs   = new address[](count);
        uint256[] memory amounts = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            addrs[i]   = makeAddr(string(abi.encodePacked("r", i)));
            amounts[i] = 1e6;
        }

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(BatchPayout.TooManyRecipients.selector, uint256(101)));
        batchPayout.batchPay(recipients);
    }

    // =========================================================================
    // 6. Empty batch — 0 recipients reverts with BatchEmpty
    // =========================================================================
    function test_EmptyBatch_Reverts() public {
        BatchPayout.Recipient[] memory recipients = new BatchPayout.Recipient[](0);

        vm.prank(payer);
        vm.expectRevert(BatchPayout.BatchEmpty.selector);
        batchPayout.batchPay(recipients);
    }

    // =========================================================================
    // 7. Receipt minted — payer has exactly 1 token; getReceipt returns correct data
    // =========================================================================
    function test_ReceiptMinted_AfterSuccessfulBatchPay() public {
        uint256 amtA = 100e6;
        uint256 amtB = 200e6;
        uint256 total = amtA + amtB;

        address[] memory addrs   = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        addrs[0] = alice;  amounts[0] = amtA;
        addrs[1] = bob;    amounts[1] = amtB;

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        batchPayout.batchPay(recipients);

        // Payer must hold exactly 1 receipt token.
        assertEq(receiptNFT.balanceOf(payer), 1, "payer receipt balance");

        // Token ID starts at 1 (first mint).
        uint256 tokenId = 1;
        ReceiptNFT.ReceiptData memory data = receiptNFT.getReceipt(tokenId);

        assertEq(data.batchTotal,      total, "batchTotal");
        assertEq(data.recipientCount,  2,     "recipientCount");
        assertFalse(data.listHash == bytes32(0), "listHash non-zero");
    }

    // =========================================================================
    // 8. Receipt non-transferable — transferring the SBT reverts with NotTransferable
    // =========================================================================
    function test_Receipt_NonTransferable() public {
        address[] memory addrs   = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        addrs[0] = alice;  amounts[0] = 50e6;

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        batchPayout.batchPay(recipients);

        uint256 tokenId = 1;

        // payer attempts to transfer the receipt to bob — must revert.
        vm.prank(payer);
        vm.expectRevert(ReceiptNFT.NotTransferable.selector);
        receiptNFT.transferFrom(payer, bob, tokenId);
    }

    // =========================================================================
    // 9. Single recipient — batchPay with exactly 1 recipient works
    // =========================================================================
    function test_SingleRecipient_Works() public {
        uint256 amt = 777e6;

        address[] memory addrs   = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        addrs[0] = alice;  amounts[0] = amt;

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        batchPayout.batchPay(recipients);

        assertEq(usdc.balanceOf(alice), amt,                    "alice receives single payment");
        assertEq(usdc.balanceOf(payer), PAYER_BALANCE - amt,    "payer debited");
        assertEq(receiptNFT.balanceOf(payer), 1,                "payer receipt minted");
    }

    // =========================================================================
    // 10. Max batch — batchPay with exactly 100 recipients works
    // =========================================================================
    function test_MaxBatch_100Recipients_Works() public {
        uint256 count    = 100;
        uint256 perAddr  = 1e6; // 1 USDC each
        uint256 total    = count * perAddr;

        address[] memory addrs   = new address[](count);
        uint256[] memory amounts = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            // makeAddr with a unique label per index → 100 distinct addresses
            addrs[i]   = makeAddr(string(abi.encodePacked("recipient", i)));
            amounts[i] = perAddr;
        }

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        batchPayout.batchPay(recipients);

        // Payer debited by total
        assertEq(usdc.balanceOf(payer), payerBefore - total, "payer debited for 100 recipients");

        // Spot-check first and last recipient
        assertEq(usdc.balanceOf(addrs[0]),      perAddr, "first recipient balance");
        assertEq(usdc.balanceOf(addrs[count-1]), perAddr, "last recipient balance");

        // One receipt token minted for payer
        assertEq(receiptNFT.balanceOf(payer), 1, "payer receipt minted for max batch");

        // Receipt data: 100 recipients, correct total
        ReceiptNFT.ReceiptData memory data = receiptNFT.getReceipt(1);
        assertEq(data.recipientCount, count, "recipientCount for max batch");
        assertEq(data.batchTotal,     total, "batchTotal for max batch");
    }

    // =========================================================================
    // Fuzz — any valid (non-zero, non-zero-addr) single recipient works
    // =========================================================================
    function testFuzz_SingleRecipient(address recipient, uint256 amount) public {
        vm.assume(recipient != address(0));
        vm.assume(recipient != address(batchPayout)); // avoid self-send complications
        amount = bound(amount, 1, PAYER_BALANCE);

        address[] memory addrs   = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        addrs[0]   = recipient;
        amounts[0] = amount;

        BatchPayout.Recipient[] memory recipients = _makeRecipients(addrs, amounts);

        vm.prank(payer);
        batchPayout.batchPay(recipients);

        assertEq(usdc.balanceOf(recipient), amount, "fuzz: recipient balance correct");
    }
}

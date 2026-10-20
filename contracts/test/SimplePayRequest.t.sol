// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../SimplePayRequest.sol";
import "../test-helpers/MockERC20.sol";

contract SimplePayRequestTest is Test {
    SimplePayRequest spr;
    MockERC20        usdc;

    address payee  = address(0xA1);
    address payer  = address(0xA2);
    address other  = address(0xA3);

    uint256 constant AMT = 50e6; // 50 USDC

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        spr  = new SimplePayRequest(address(usdc));

        usdc.mint(payer, 1000e6);
        vm.prank(payer);
        usdc.approve(address(spr), type(uint256).max);
    }

    /* ── createRequest ─────────────────────────────────────── */

    function test_create_succeeds() public {
        vm.prank(payee);
        uint256 id = spr.createRequest(AMT, "Design work");
        assertEq(id, 1);
        assertEq(spr.requestCount(), 1);

        (address p, address pr, uint256 amt,,,uint8 status, string memory memo) = spr.getRequest(1);
        assertEq(p,      payee);
        assertEq(pr,     address(0));
        assertEq(amt,    AMT);
        assertEq(status, 0); // Pending
        assertEq(memo,   "Design work");
    }

    function test_create_zero_amount_reverts() public {
        vm.prank(payee);
        vm.expectRevert(SimplePayRequest.ZeroAmount.selector);
        spr.createRequest(0, "test");
    }

    function test_create_increments_id() public {
        vm.startPrank(payee);
        uint256 id1 = spr.createRequest(AMT, "first");
        uint256 id2 = spr.createRequest(AMT, "second");
        vm.stopPrank();
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_create_emits_event() public {
        vm.expectEmit(true, true, false, true);
        emit SimplePayRequest.RequestCreated(1, payee, AMT, "memo");
        vm.prank(payee);
        spr.createRequest(AMT, "memo");
    }

    /* ── pay ────────────────────────────────────────────────── */

    function test_pay_succeeds() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");

        uint256 payeeBefore = usdc.balanceOf(payee);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        spr.pay(1);

        assertEq(usdc.balanceOf(payee),  payeeBefore + AMT);
        assertEq(usdc.balanceOf(payer),  payerBefore - AMT);

        (,address pr,,, uint256 paidAt, uint8 status,) = spr.getRequest(1);
        assertEq(pr,     payer);
        assertEq(status, 1); // Paid
        assertGt(paidAt, 0);
    }

    function test_pay_emits_event() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");

        vm.expectEmit(true, true, false, true);
        emit SimplePayRequest.RequestPaid(1, payer, AMT);
        vm.prank(payer);
        spr.pay(1);
    }

    function test_pay_nonexistent_reverts() public {
        vm.prank(payer);
        vm.expectRevert(SimplePayRequest.NotFound.selector);
        spr.pay(999);
    }

    function test_pay_already_paid_reverts() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");
        vm.prank(payer);
        spr.pay(1);

        // second pay attempt
        usdc.mint(other, 1000e6);
        vm.prank(other);
        usdc.approve(address(spr), type(uint256).max);
        vm.prank(other);
        vm.expectRevert(SimplePayRequest.NotPending.selector);
        spr.pay(1);
    }

    function test_pay_cancelled_reverts() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");
        vm.prank(payee);
        spr.cancel(1);

        vm.prank(payer);
        vm.expectRevert(SimplePayRequest.NotPending.selector);
        spr.pay(1);
    }

    function test_pay_self_reverts() public {
        usdc.mint(payee, 1000e6);
        vm.prank(payee);
        usdc.approve(address(spr), type(uint256).max);

        vm.prank(payee);
        spr.createRequest(AMT, "");

        vm.prank(payee);
        vm.expectRevert(SimplePayRequest.SelfPay.selector);
        spr.pay(1);
    }

    /* ── cancel ─────────────────────────────────────────────── */

    function test_cancel_by_payee_succeeds() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");

        vm.prank(payee);
        spr.cancel(1);

        (,,,,, uint8 status,) = spr.getRequest(1);
        assertEq(status, 2); // Cancelled
    }

    function test_cancel_emits_event() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");

        vm.expectEmit(true, false, false, false);
        emit SimplePayRequest.RequestCancelled(1);
        vm.prank(payee);
        spr.cancel(1);
    }

    function test_cancel_by_non_payee_reverts() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");

        vm.prank(payer);
        vm.expectRevert(SimplePayRequest.NotPayee.selector);
        spr.cancel(1);
    }

    function test_cancel_already_paid_reverts() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");
        vm.prank(payer);
        spr.pay(1);

        vm.prank(payee);
        vm.expectRevert(SimplePayRequest.NotPending.selector);
        spr.cancel(1);
    }

    function test_cancel_already_cancelled_reverts() public {
        vm.prank(payee);
        spr.createRequest(AMT, "");
        vm.prank(payee);
        spr.cancel(1);

        vm.prank(payee);
        vm.expectRevert(SimplePayRequest.NotPending.selector);
        spr.cancel(1);
    }

    /* ── constructor ────────────────────────────────────────── */

    function test_zero_usdc_address_reverts() public {
        vm.expectRevert(SimplePayRequest.ZeroAddress.selector);
        new SimplePayRequest(address(0));
    }

    /* ── getRequest ─────────────────────────────────────────── */

    function test_get_nonexistent_returns_zero_status() public view {
        (,,,,,uint8 status,) = spr.getRequest(999);
        assertEq(status, 0); // defaults to Pending (zero), not an error
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrowTestBase} from "./MilestoneEscrow.Base.t.sol";
import {MilestoneEscrow} from "../MilestoneEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {BlocklistERC20} from "../test-helpers/BlocklistERC20.sol";
import {MilestoneEscrowHandler} from "./MilestoneEscrow.Handler.sol";

contract MilestoneEscrowFuzzTest is MilestoneEscrowTestBase {
    function setUp() public override {
        super.setUp();
        usdc.mint(payer, 1e30);
        eurc.mint(payer, 1e30);
    }

    function _fuzzAmounts(uint256 seed, uint256 count) internal pure returns (uint256[] memory a, uint256 total) {
        a = new uint256[](count);
        for (uint256 k; k < count; ++k) {
            a[k] = bound(uint256(keccak256(abi.encode(seed, k))), 1, 1e12);
            total += a[k];
        }
    }

    function _createWindow(uint64 window, uint256 amount) internal returns (uint256 id) {
        uint256[] memory a = new uint256[](1);
        a[0] = amount;
        vm.prank(payer);
        id = esc.createEscrow(payee, arbiter, address(usdc), a, window, uint64(block.timestamp + 30 days), "");
    }

    function testFuzz_Create_LocksExactTotal(uint256 seed, uint256 count, bool useEurc) public {
        count = bound(count, 1, 20);
        (uint256[] memory a, uint256 total) = _fuzzAmounts(seed, count);
        address token = useEurc ? address(eurc) : address(usdc);
        uint256 before_ = MockERC20(token).balanceOf(payer);
        uint256 id = _createWith(token, a, arbiter);

        assertEq(MockERC20(token).balanceOf(address(esc)), total);
        assertEq(MockERC20(token).balanceOf(payer), before_ - total);
        assertEq(esc.unallocated(token), total);
        assertEq(esc.getEscrow(id).milestoneCount, count);
        uint256 sum;
        for (uint256 k; k < count; ++k) sum += esc.getMilestone(id, k).amount;
        assertEq(sum, total);
    }

    function testFuzz_ApproveAll_PaysPayeeExactTotal(uint256 seed, uint256 count) public {
        count = bound(count, 1, 20);
        (uint256[] memory a, uint256 total) = _fuzzAmounts(seed, count);
        uint256 id = _createWith(address(usdc), a, arbiter);
        for (uint256 k; k < count; ++k) {
            _submit(id, k);
            _approve(id, k);
        }
        assertEq(usdc.balanceOf(payee), total);
        assertEq(usdc.balanceOf(address(esc)), 0);
        assertEq(esc.unallocated(address(usdc)), 0);
    }

    function testFuzz_Resolve_SplitConservesAmount(uint256 amount, uint256 payeeAmt) public {
        amount = bound(amount, 1, 1e15);
        payeeAmt = bound(payeeAmt, 0, amount);
        uint256 id = _createWindow(WINDOW, amount);
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        esc.resolve(id, 0, payeeAmt);

        assertEq(esc.creditOf(payee, address(usdc)), payeeAmt);
        assertEq(esc.creditOf(payer, address(usdc)), amount - payeeAmt);
        assertEq(usdc.balanceOf(address(esc)), amount);
        assertEq(esc.unallocated(address(usdc)), 0);

        uint256 payerBefore = usdc.balanceOf(payer);
        if (payeeAmt > 0) {
            vm.prank(payee);
            esc.withdraw(address(usdc));
        }
        if (amount - payeeAmt > 0) {
            vm.prank(payer);
            esc.withdraw(address(usdc));
        }
        assertEq(usdc.balanceOf(payee), payeeAmt);
        assertEq(usdc.balanceOf(payer), payerBefore + (amount - payeeAmt));
        assertEq(usdc.balanceOf(address(esc)), 0);
    }

    function testFuzz_Resolve_OverAmountReverts(uint256 amount, uint256 extra) public {
        amount = bound(amount, 1, 1e15);
        extra = bound(extra, 1, type(uint128).max);
        uint256 id = _createWindow(WINDOW, amount);
        _submitAndDispute(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrow.InvalidPayeeAmount.selector, amount + extra, amount));
        esc.resolve(id, 0, amount + extra);
    }

    function testFuzz_ResolveByTimeout_HalfSplitPayerGetsOdd(uint256 amount) public {
        amount = bound(amount, 1, 1e15);
        uint256 id = _createWindow(WINDOW, amount);
        _submitAndDispute(id, 0);
        skip(30 days);
        esc.resolveByTimeout(id, 0);
        assertEq(esc.creditOf(payee, address(usdc)), amount / 2);
        assertEq(esc.creditOf(payer, address(usdc)), amount - amount / 2);
        assertEq(esc.creditOf(payee, address(usdc)) + esc.creditOf(payer, address(usdc)), amount);
    }

    function testFuzz_ClaimWindowBoundary(uint256 window, uint256 offset) public {
        window = bound(window, 1 days, 90 days);
        offset = bound(offset, 0, window * 2);
        uint256 id = _createWindow(uint64(window), 1e6);
        _submit(id, 0);
        uint256 t = block.timestamp;
        vm.warp(t + offset);
        vm.prank(payee);
        if (offset < window) {
            vm.expectRevert(MilestoneEscrow.ReviewWindowNotElapsed.selector);
            esc.claimAfterWindow(id, 0);
        } else {
            esc.claimAfterWindow(id, 0);
            assertEq(usdc.balanceOf(payee), 1e6);
        }
    }

    function testFuzz_DisputeWindowBoundary(uint256 window, uint256 offset) public {
        window = bound(window, 1 days, 90 days);
        offset = bound(offset, 0, window * 2);
        uint256 id = _createWindow(uint64(window), 1e6);
        _submit(id, 0);
        vm.warp(block.timestamp + offset);
        vm.prank(payer);
        if (offset < window) {
            esc.dispute(id, 0);
            assertTrue(_status(id, 0) == MilestoneEscrow.Status.Disputed);
        } else {
            vm.expectRevert(MilestoneEscrow.ReviewWindowElapsed.selector);
            esc.dispute(id, 0);
        }
    }

    function testFuzz_ClaimAndDisputeAreMutuallyExclusiveAtEverySecond(uint256 offset) public {
        offset = bound(offset, 0, 2 * uint256(WINDOW));
        uint256 id = _createWindow(WINDOW, 1e6);
        _submit(id, 0);
        vm.warp(block.timestamp + offset);
        bool canDispute;
        bool canClaim;
        uint256 snap = vm.snapshotState();
        vm.prank(payer);
        try esc.dispute(id, 0) { canDispute = true; } catch {}
        vm.revertToState(snap);
        vm.prank(payee);
        try esc.claimAfterWindow(id, 0) { canClaim = true; } catch {}
        // exactly one of the two is available at every second (no gap, no overlap)
        assertTrue(canDispute != canClaim);
    }

    function testFuzz_TimeoutBoundary(uint256 offset) public {
        offset = bound(offset, 0, 60 days);
        uint256 id = _createWindow(WINDOW, 1e6);
        _submitAndDispute(id, 0);
        vm.warp(block.timestamp + offset);
        if (offset < 30 days) {
            vm.expectRevert(MilestoneEscrow.DisputeTimeoutNotElapsed.selector);
            esc.resolveByTimeout(id, 0);
        } else {
            esc.resolveByTimeout(id, 0);
            assertTrue(_status(id, 0) == MilestoneEscrow.Status.Resolved);
        }
    }

    function testFuzz_RefundDeadlineBoundary(uint256 offset) public {
        offset = bound(offset, 0, 2 * uint256(DEADLINE_OFFSET));
        uint256 id = _create(address(usdc), arbiter);
        uint256 dl = esc.getEscrow(id).deadline;
        vm.warp(block.timestamp + offset);
        vm.prank(payer);
        if (block.timestamp <= dl) {
            vm.expectRevert(MilestoneEscrow.DeadlineNotPassed.selector);
            esc.refundUnstarted(id, 0);
        } else {
            esc.refundUnstarted(id, 0);
            assertTrue(_status(id, 0) == MilestoneEscrow.Status.Refunded);
        }
    }

    function testFuzz_BlockedPayoutIsCreditedAndWithdrawable(uint256 amount, bool returnFalse) public {
        amount = bound(amount, 1, 1e15);
        uint256[] memory a = new uint256[](1);
        a[0] = amount;
        uint256 id = _createWith(address(eurc), a, arbiter);
        _submit(id, 0);
        eurc.setBlocked(payee, true);
        eurc.setReturnFalseOnBlocked(returnFalse);
        _approve(id, 0);

        assertEq(esc.creditOf(payee, address(eurc)), amount);
        assertEq(eurc.balanceOf(address(esc)), amount);
        assertEq(esc.unallocated(address(eurc)), 0);

        eurc.setBlocked(payee, false);
        vm.prank(payee);
        esc.withdraw(address(eurc));
        assertEq(eurc.balanceOf(payee), amount);
        assertEq(eurc.balanceOf(address(esc)), 0);
    }
}

/// @dev Shared invariant plumbing: liabilities are recomputed from public getters, independent of
///      the contract's own `unallocated` counter.
abstract contract MilestoneEscrowInvariantBase is Test {
    MilestoneEscrow internal esc;
    MockERC20 internal usdc;
    BlocklistERC20 internal eurc;
    MilestoneEscrowHandler internal handler;

    function _setUp(bool allowDonate) internal {
        vm.warp(1_000_000);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        eurc = new BlocklistERC20("Mock EURC", "mEURC", 6);
        esc = new MilestoneEscrow(address(usdc), address(eurc));
        handler = new MilestoneEscrowHandler(esc, usdc, eurc, allowDonate);
        targetContract(address(handler));
    }

    /// @dev Sum of amounts of milestones in Funded, Submitted or Disputed state for `token`.
    function _outstanding(address token) internal view returns (uint256 sum) {
        uint256 n = esc.escrowCount();
        for (uint256 id = 1; id <= n; ++id) {
            MilestoneEscrow.Escrow memory e = esc.getEscrow(id);
            if (e.token != token) continue;
            for (uint256 i; i < e.milestoneCount; ++i) {
                MilestoneEscrow.Milestone memory m = esc.getMilestone(id, i);
                if (
                    m.status == MilestoneEscrow.Status.Funded || m.status == MilestoneEscrow.Status.Submitted
                        || m.status == MilestoneEscrow.Status.Disputed
                ) sum += m.amount;
            }
        }
    }

    function _credits(address token) internal view returns (uint256) {
        return esc.creditOf(handler.payer(), token) + esc.creditOf(handler.payee(), token)
            + esc.creditOf(handler.arbiter(), token) + esc.creditOf(handler.anyone(), token);
    }

    function _liabilities(address token) internal view returns (uint256) {
        return _outstanding(token) + _credits(token);
    }

    function _balance(address token) internal view returns (uint256) {
        return MockERC20(token).balanceOf(address(esc));
    }
}

/// @dev No unsolicited transfers: balance EQUALS outstanding milestones + outstanding credits.
contract MilestoneEscrowInvariantExactTest is MilestoneEscrowInvariantBase {
    function setUp() public {
        _setUp(false);
    }

    function invariant_BalanceEqualsLiabilities() public view {
        assertEq(_balance(address(usdc)), _liabilities(address(usdc)));
        assertEq(_balance(address(eurc)), _liabilities(address(eurc)));
    }

    function invariant_UnallocatedMatchesOutstandingMilestones() public view {
        assertEq(esc.unallocated(address(usdc)), _outstanding(address(usdc)));
        assertEq(esc.unallocated(address(eurc)), _outstanding(address(eurc)));
    }
}

/// @dev With donations (surplus) the balance must still cover every liability.
contract MilestoneEscrowInvariantSurplusTest is MilestoneEscrowInvariantBase {
    function setUp() public {
        _setUp(true);
    }

    function invariant_BalanceCoversLiabilities() public view {
        assertGe(_balance(address(usdc)), _liabilities(address(usdc)));
        assertGe(_balance(address(eurc)), _liabilities(address(eurc)));
    }

    function invariant_UnallocatedMatchesOutstandingMilestones() public view {
        assertEq(esc.unallocated(address(usdc)), _outstanding(address(usdc)));
        assertEq(esc.unallocated(address(eurc)), _outstanding(address(eurc)));
    }
}

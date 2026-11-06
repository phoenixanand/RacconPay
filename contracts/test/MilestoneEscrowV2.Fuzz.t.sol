// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {MilestoneEscrowV2TestBase} from "./MilestoneEscrowV2.Base.t.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {BlocklistERC20} from "../test-helpers/BlocklistERC20.sol";
import {MilestoneEscrowV2Handler} from "./MilestoneEscrowV2.Handler.sol";

contract MilestoneEscrowV2FuzzTest is MilestoneEscrowV2TestBase {
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

    function _createOne(uint64 window, uint64 deadline, uint256 amount) internal returns (uint256 id) {
        uint256[] memory a = new uint256[](1);
        a[0] = amount;
        string[] memory t = new string[](1);
        vm.prank(payer);
        id = esc.createEscrow(payee, arbiter, address(usdc), a, t, window, deadline, "");
    }

    // ---------------------------------------------------------------- create

    function testFuzz_Create_LocksExactTotal(uint256 seed, uint256 count, bool useEurc) public {
        count = bound(count, 1, 20);
        (uint256[] memory a, uint256 total) = _fuzzAmounts(seed, count);
        address token = useEurc ? address(eurc) : address(usdc);
        uint256 before_ = MockERC20(token).balanceOf(payer);
        uint256 id = _createWith(token, a, arbiter);

        assertEq(MockERC20(token).balanceOf(address(esc)), total);
        assertEq(MockERC20(token).balanceOf(payer), before_ - total);
        assertEq(esc.unallocated(token), total);
        uint256 sum;
        for (uint256 k; k < count; ++k) sum += esc.getMilestone(id, k).amount;
        assertEq(sum, total);
    }

    function testFuzz_Create_TitleLengthBoundary(uint256 len) public {
        len = bound(len, 0, 200);
        string[] memory t = new string[](1);
        t[0] = _bytesOf(len, "t");
        uint256[] memory a = new uint256[](1);
        a[0] = 1e6;
        vm.prank(payer);
        if (len > 64) vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.TitleTooLong.selector, 0));
        uint256 id =
            esc.createEscrow(payee, arbiter, address(usdc), a, t, WINDOW, uint64(block.timestamp + 1 days), "");
        if (len <= 64) assertEq(esc.getMilestone(id, 0).title, t[0]);
    }

    function testFuzz_Create_TitleCountMismatch(uint256 amountsCount, uint256 titlesCount) public {
        amountsCount = bound(amountsCount, 1, 20);
        titlesCount = bound(titlesCount, 0, 25);
        uint256[] memory a = new uint256[](amountsCount);
        for (uint256 k; k < amountsCount; ++k) a[k] = 1e6;
        vm.prank(payer);
        if (titlesCount != amountsCount) vm.expectRevert(MilestoneEscrowV2.TitleCountMismatch.selector);
        esc.createEscrow(
            payee, arbiter, address(usdc), a, _titlesN(titlesCount), WINDOW, uint64(block.timestamp + 1 days), ""
        );
    }

    // ---------------------------------------------------------- note / reason

    function testFuzz_Submit_NoteLengthBoundary(uint256 len) public {
        len = bound(len, 0, 600);
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 30 days), 1e6);
        string memory n = _bytesOf(len, "n");
        vm.prank(payee);
        if (len > 280) vm.expectRevert(MilestoneEscrowV2.NoteTooLong.selector);
        esc.submitMilestone(id, 0, n);
        if (len <= 280) assertEq(esc.getMilestone(id, 0).note, n);
    }

    function testFuzz_Request_ReasonLengthBoundary(uint256 len) public {
        len = bound(len, 0, 600);
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 30 days), 1e6);
        _submit(id, 0);
        string memory r = _bytesOf(len, "r");
        vm.prank(payer);
        if (len == 0) vm.expectRevert(MilestoneEscrowV2.EmptyReason.selector);
        else if (len > 280) vm.expectRevert(MilestoneEscrowV2.ReasonTooLong.selector);
        esc.requestChanges(id, 0, r);
        if (len >= 1 && len <= 280) assertEq(esc.getMilestone(id, 0).changeReason, r);
    }

    // ------------------------------------------------------ amounts / splits

    function testFuzz_ApproveAll_PaysPayeeExactTotal(uint256 seed, uint256 count) public {
        count = bound(count, 1, 20);
        (uint256[] memory a, uint256 total) = _fuzzAmounts(seed, count);
        uint256 id = _createWith(address(usdc), a, arbiter);
        for (uint256 k; k < count; ++k) {
            _submit(id, k);
            if (k % 2 == 0) {
                // some milestones go through one change-request cycle first
                _request(id, k);
                _submit(id, k);
            }
            _approve(id, k);
        }
        assertEq(usdc.balanceOf(payee), total);
        assertEq(usdc.balanceOf(address(esc)), 0);
        assertEq(esc.unallocated(address(usdc)), 0);
    }

    function testFuzz_EscalateResolve_SplitConservesAmount(uint256 amount, uint256 payeeAmt) public {
        amount = bound(amount, 1, 1e15);
        payeeAmt = bound(payeeAmt, 0, amount);
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 30 days), amount);
        _submitAndRequest(id, 0);
        _escalate(id, 0);
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
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 30 days), amount);
        _submitAndRequest(id, 0);
        _escalate(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(MilestoneEscrowV2.InvalidPayeeAmount.selector, amount + extra, amount));
        esc.resolve(id, 0, amount + extra);
    }

    function testFuzz_EscalateTimeout_HalfSplit(uint256 amount, uint256 waitBeforeEscalate, uint256 offset) public {
        amount = bound(amount, 1, 1e15);
        waitBeforeEscalate = bound(waitBeforeEscalate, 0, 200 days);
        offset = bound(offset, 0, 60 days);
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 30 days), amount);
        _submitAndRequest(id, 0);
        skip(waitBeforeEscalate);
        _escalate(id, 0);
        skip(offset);
        if (offset < 30 days) {
            vm.expectRevert(MilestoneEscrowV2.DisputeTimeoutNotElapsed.selector);
            esc.resolveByTimeout(id, 0);
        } else {
            esc.resolveByTimeout(id, 0);
            assertEq(esc.creditOf(payee, address(usdc)), amount / 2);
            assertEq(esc.creditOf(payer, address(usdc)), amount - amount / 2);
        }
    }

    // ---------------------------------------------------------------- timing

    function testFuzz_RequestChangesWindowBoundary(uint256 window, uint256 offset) public {
        window = bound(window, 1 days, 90 days);
        offset = bound(offset, 0, window * 2);
        uint256 id = _createOne(uint64(window), uint64(block.timestamp + 365 days), 1e6);
        _submit(id, 0);
        skip(offset);
        vm.prank(payer);
        if (offset < window) {
            esc.requestChanges(id, 0, REASON);
            assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.ChangesRequested);
            assertEq(esc.getMilestone(id, 0).changesRequestedAt, block.timestamp);
        } else {
            vm.expectRevert(MilestoneEscrowV2.ReviewWindowElapsed.selector);
            esc.requestChanges(id, 0, REASON);
        }
    }

    /// @dev At every second after submission exactly one of {payer requests changes, payee claims} works.
    function testFuzz_ClaimAndRequestAreMutuallyExclusiveAtEverySecond(uint256 offset) public {
        offset = bound(offset, 0, 2 * uint256(WINDOW));
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 365 days), 1e6);
        _submit(id, 0);
        vm.warp(block.timestamp + offset);
        bool canRequest;
        bool canClaim;
        uint256 snap = vm.snapshotState();
        vm.prank(payer);
        try esc.requestChanges(id, 0, REASON) { canRequest = true; } catch {}
        vm.revertToState(snap);
        vm.prank(payee);
        try esc.claimAfterWindow(id, 0) { canClaim = true; } catch {}
        assertTrue(canRequest != canClaim);
    }

    function testFuzz_RefundChangesRequestedTiming(
        uint256 window,
        uint256 deadlineOffset,
        uint256 submitDelay,
        uint256 requestDelay,
        uint256 waitAfter
    ) public {
        window = bound(window, 1 days, 90 days);
        deadlineOffset = bound(deadlineOffset, 1, 60 days);
        submitDelay = bound(submitDelay, 0, 150 days);
        requestDelay = bound(requestDelay, 0, window - 1);
        waitAfter = bound(waitAfter, 0, 2 * window + 120 days);

        uint256 deadline = block.timestamp + deadlineOffset;
        uint256 id = _createOne(uint64(window), uint64(deadline), 1e6);
        skip(submitDelay);
        _submit(id, 0);
        skip(requestDelay);
        _request(id, 0);
        uint256 requestedAt = block.timestamp;
        skip(waitAfter);

        uint256 anchor = deadline > requestedAt ? deadline : requestedAt;
        bool allowed = block.timestamp > anchor + window;
        vm.prank(payer);
        if (allowed) {
            esc.refundUnstarted(id, 0);
            assertTrue(_status(id, 0) == MilestoneEscrowV2.Status.Refunded);
            assertEq(esc.unallocated(address(usdc)), 0);
        } else {
            vm.expectRevert(MilestoneEscrowV2.DeadlineNotPassed.selector);
            esc.refundUnstarted(id, 0);
        }
    }

    function testFuzz_RevisionLimit(uint256 cycles) public {
        cycles = bound(cycles, 0, 6);
        uint256 id = _createOne(WINDOW, uint64(block.timestamp + 365 days), 1e6);
        for (uint256 k; k < cycles; ++k) {
            _submit(id, 0);
            vm.prank(payer);
            if (k >= 3) {
                vm.expectRevert(MilestoneEscrowV2.RevisionLimitReached.selector);
                esc.requestChanges(id, 0, REASON);
                return;
            }
            esc.requestChanges(id, 0, REASON);
            assertEq(esc.getMilestone(id, 0).revisions, k + 1);
        }
    }

    function testFuzz_BlockedPayoutIsCreditedAndWithdrawable(uint256 amount, bool returnFalse) public {
        amount = bound(amount, 1, 1e15);
        uint256[] memory a = new uint256[](1);
        a[0] = amount;
        uint256 id = _createWith(address(eurc), a, arbiter);
        _submitAndRequest(id, 0);
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
///      the contract's own `unallocated` counter. ChangesRequested counts as outstanding.
abstract contract MilestoneEscrowV2InvariantBase is Test {
    MilestoneEscrowV2 internal esc;
    MockERC20 internal usdc;
    BlocklistERC20 internal eurc;
    MilestoneEscrowV2Handler internal handler;

    function _setUp(bool allowDonate) internal {
        vm.warp(1_000_000);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        eurc = new BlocklistERC20("Mock EURC", "mEURC", 6);
        esc = new MilestoneEscrowV2(address(usdc), address(eurc));
        handler = new MilestoneEscrowV2Handler(esc, usdc, eurc, allowDonate);
        targetContract(address(handler));
    }

    /// @dev Sum of amounts of Funded, Submitted, Disputed and ChangesRequested milestones for `token`.
    function _outstanding(address token) internal view returns (uint256 sum) {
        uint256 n = esc.escrowCount();
        for (uint256 id = 1; id <= n; ++id) {
            MilestoneEscrowV2.Escrow memory e = esc.getEscrow(id);
            if (e.token != token) continue;
            for (uint256 i; i < e.milestoneCount; ++i) {
                MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, i);
                if (
                    m.status == MilestoneEscrowV2.Status.Funded || m.status == MilestoneEscrowV2.Status.Submitted
                        || m.status == MilestoneEscrowV2.Status.Disputed
                        || m.status == MilestoneEscrowV2.Status.ChangesRequested
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

    /// @dev Per-milestone sanity: revision counter never exceeds the cap; ChangesRequested has a reason.
    function _checkMilestones() internal view {
        uint256 n = esc.escrowCount();
        for (uint256 id = 1; id <= n; ++id) {
            MilestoneEscrowV2.Escrow memory e = esc.getEscrow(id);
            for (uint256 i; i < e.milestoneCount; ++i) {
                MilestoneEscrowV2.Milestone memory m = esc.getMilestone(id, i);
                assertLe(m.revisions, esc.MAX_REVISIONS());
                if (m.status == MilestoneEscrowV2.Status.ChangesRequested) {
                    assertGt(bytes(m.changeReason).length, 0);
                    assertGe(m.revisions, 1);
                    assertGt(m.changesRequestedAt, 0);
                }
            }
        }
    }

    function afterInvariant() public view {
        console2.log("requests", handler.requests());
        console2.log("resubmits", handler.resubmits());
        console2.log("escalations", handler.escalations());
    }
}

/// @dev No unsolicited transfers: balance EQUALS outstanding milestones + outstanding credits.
contract MilestoneEscrowV2InvariantExactTest is MilestoneEscrowV2InvariantBase {
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

    function invariant_MilestoneRevisionState() public view {
        _checkMilestones();
    }
}

/// @dev With donations (surplus) the balance must still cover every liability.
contract MilestoneEscrowV2InvariantSurplusTest is MilestoneEscrowV2InvariantBase {
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

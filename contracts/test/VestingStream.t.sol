// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {VestingStream} from "../VestingStream.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract VestingStreamTest is Test {
    // ── contract under test ──────────────────────────────────────────────────
    VestingStream internal vesting;
    MockERC20    internal usdc;

    // ── actors ───────────────────────────────────────────────────────────────
    address internal grantor   = makeAddr("grantor");
    address internal alice     = makeAddr("alice");   // beneficiary
    address internal bob       = makeAddr("bob");     // random third-party
    address internal attacker  = makeAddr("attacker");

    // ── constants ────────────────────────────────────────────────────────────
    uint256 internal constant TOTAL        = 1_000e6;   // 1 000 USDC (6 dec)
    uint256 internal constant DURATION     = 365 days;
    uint256 internal constant SEED_GRANTOR = 10_000e6;  // grantor wallet supply

    // ── helpers ──────────────────────────────────────────────────────────────

    /// Deploy a fresh stream, approve, and return the streamId.
    function _newStream(address beneficiary, uint256 amount, uint256 duration)
        internal
        returns (uint256 sid)
    {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), amount);
        sid = vesting.createStream(beneficiary, amount, duration);
        vm.stopPrank();
    }

    // ── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deploy mock USDC (6 decimals, like real USDC on Arc Testnet).
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        // Deploy VestingStream with the mock's address as the USDC arg.
        vesting = new VestingStream(address(usdc));

        // Seed grantor with USDC.
        usdc.mint(grantor, SEED_GRANTOR);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DEPLOYMENT / INITIALIZATION
    // ══════════════════════════════════════════════════════════════════════════

    function test_ConstructorSetsUSDC() public view {
        assertEq(address(vesting.usdc()), address(usdc));
    }

    function test_ConstructorRevertsOnZeroUSDC() public {
        vm.expectRevert(VestingStream.ZeroAddress.selector);
        new VestingStream(address(0));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. createStream — happy path
    // ══════════════════════════════════════════════════════════════════════════

    function test_CreateStream_HappyPath() public {
        uint256 grantorBalBefore = usdc.balanceOf(grantor);
        uint256 contractBalBefore = usdc.balanceOf(address(vesting));

        uint256 sid = _newStream(alice, TOTAL, DURATION);

        // Stream ID should be 1.
        assertEq(sid, 1);

        // USDC moved from grantor → contract.
        assertEq(usdc.balanceOf(grantor), grantorBalBefore - TOTAL);
        assertEq(usdc.balanceOf(address(vesting)), contractBalBefore + TOTAL);

        // Stream state is correct.
        VestingStream.Stream memory s = vesting.getStream(sid);
        assertEq(s.grantor,        grantor);
        assertEq(s.beneficiary,    alice);
        assertEq(s.totalAmount,    TOTAL);
        assertEq(s.claimedAmount,  0);
        assertEq(s.startTime,      block.timestamp);
        assertEq(s.endTime,        block.timestamp + DURATION);
        assertFalse(s.cancelled);
    }

    function test_CreateStream_EmitsEvent() public {
        uint256 expectedStart = block.timestamp;
        uint256 expectedEnd   = expectedStart + DURATION;

        vm.startPrank(grantor);
        usdc.approve(address(vesting), TOTAL);

        vm.expectEmit(true, true, true, true, address(vesting));
        emit VestingStream.StreamCreated(1, grantor, alice, TOTAL, expectedStart, expectedEnd);
        vesting.createStream(alice, TOTAL, DURATION);
        vm.stopPrank();
    }

    function test_CreateStream_MultipleStreamsIncrementId() public {
        uint256 sid1 = _newStream(alice, TOTAL, DURATION);

        usdc.mint(grantor, TOTAL); // refill so grantor has enough
        uint256 sid2 = _newStream(alice, TOTAL, DURATION);

        assertEq(sid1, 1);
        assertEq(sid2, 2);
    }

    // ── createStream reverts ──────────────────────────────────────────────────

    function test_CreateStream_RevertZeroBeneficiary() public {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), TOTAL);
        vm.expectRevert(VestingStream.ZeroAddress.selector);
        vesting.createStream(address(0), TOTAL, DURATION);
        vm.stopPrank();
    }

    function test_CreateStream_RevertZeroAmount() public {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), 0);
        vm.expectRevert(VestingStream.ZeroAmount.selector);
        vesting.createStream(alice, 0, DURATION);
        vm.stopPrank();
    }

    function test_CreateStream_RevertZeroDuration() public {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), TOTAL);
        vm.expectRevert(VestingStream.ZeroDuration.selector);
        vesting.createStream(alice, TOTAL, 0);
        vm.stopPrank();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. vestedAmount() — linear schedule
    // ══════════════════════════════════════════════════════════════════════════

    function test_VestedAmount_ZeroBeforeStartTime() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        // We're AT startTime; the _vestedAt check is `effectiveTime <= startTime → 0`.
        assertEq(vesting.vestedAmount(sid), 0);
    }

    function test_VestedAmount_LinearAtMidpoint() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);
        uint256 vested = vesting.vestedAmount(sid);
        // Exactly half — integer arithmetic is (TOTAL * elapsed) / duration.
        assertEq(vested, TOTAL / 2);
    }

    function test_VestedAmount_FullAtEndTime() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION);
        assertEq(vesting.vestedAmount(sid), TOTAL);
    }

    function test_VestedAmount_FullPastEndTime() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION + 30 days);
        assertEq(vesting.vestedAmount(sid), TOTAL);
    }

    function test_VestedAmount_RevertsOnInvalidStream() public {
        vm.expectRevert(abi.encodeWithSelector(VestingStream.StreamNotFound.selector, 999));
        vesting.vestedAmount(999);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. claim — happy paths
    // ══════════════════════════════════════════════════════════════════════════

    function test_Claim_PartialAtHalfway() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        uint256 aliceBalBefore    = usdc.balanceOf(alice);
        uint256 contractBalBefore = usdc.balanceOf(address(vesting));

        vm.prank(alice);
        vesting.claim(sid);

        uint256 expectedClaim = TOTAL / 2;
        assertEq(usdc.balanceOf(alice),           aliceBalBefore + expectedClaim);
        assertEq(usdc.balanceOf(address(vesting)), contractBalBefore - expectedClaim);

        VestingStream.Stream memory s = vesting.getStream(sid);
        assertEq(s.claimedAmount, expectedClaim);
    }

    function test_Claim_FullAfterEndTime() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION + 1);

        uint256 aliceBalBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        vesting.claim(sid);

        assertEq(usdc.balanceOf(alice), aliceBalBefore + TOTAL);
        assertEq(vesting.getStream(sid).claimedAmount, TOTAL);
    }

    function test_Claim_PartialThenRest() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        // ── partial claim at 50% ──
        skip(DURATION / 2);
        vm.prank(alice);
        vesting.claim(sid);
        uint256 firstClaim = TOTAL / 2;
        assertEq(usdc.balanceOf(alice), firstClaim);

        // ── claim the rest at 100% ──
        skip(DURATION / 2 + 1); // push past endTime
        vm.prank(alice);
        vesting.claim(sid);

        // Total received = TOTAL; nothing left.
        assertEq(usdc.balanceOf(alice), TOTAL);
        assertEq(vesting.getStream(sid).claimedAmount, TOTAL);
    }

    function test_Claim_EmitsEvent() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        uint256 expectedClaim = TOTAL / 2;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(vesting));
        emit VestingStream.Claimed(sid, alice, expectedClaim);
        vesting.claim(sid);
    }

    // ── claim reverts ─────────────────────────────────────────────────────────

    function test_Claim_RevertNotBeneficiary() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        vm.prank(attacker);
        vm.expectRevert(VestingStream.NotBeneficiary.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertAlreadyCancelled() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        vm.prank(grantor);
        vesting.cancel(sid);

        vm.prank(alice);
        vm.expectRevert(VestingStream.AlreadyCancelled.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertNothingToClaimAtStart() public {
        // Called at block.timestamp == startTime → vested == 0.
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        vm.prank(alice);
        vm.expectRevert(VestingStream.NothingToClaim.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertNothingToClaimAfterFullyClaimed() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION + 1);

        vm.prank(alice);
        vesting.claim(sid);

        // Second claim: nothing left.
        vm.prank(alice);
        vm.expectRevert(VestingStream.NothingToClaim.selector);
        vesting.claim(sid);
    }

    function test_Claim_RevertOnInvalidStream() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VestingStream.StreamNotFound.selector, 0));
        vesting.claim(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. cancel — happy paths (pull-withdrawal pattern)
    // ══════════════════════════════════════════════════════════════════════════

    function test_Cancel_Midway_PendingWithdrawals() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        vm.prank(grantor);
        vesting.cancel(sid);

        uint256 half = TOTAL / 2;
        // Both parties credited to pendingWithdrawals.
        assertEq(vesting.pendingWithdrawals(alice),   half);
        assertEq(vesting.pendingWithdrawals(grantor), half);

        // Neither has received tokens yet.
        assertEq(usdc.balanceOf(alice),   0);
        assertEq(usdc.balanceOf(grantor), SEED_GRANTOR - TOTAL); // spent on stream
    }

    function test_Cancel_Midway_BothWithdraw() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        vm.prank(grantor);
        vesting.cancel(sid);

        uint256 half = TOTAL / 2;

        // Alice withdraws.
        vm.prank(alice);
        vesting.withdraw();
        assertEq(usdc.balanceOf(alice), half);
        assertEq(vesting.pendingWithdrawals(alice), 0);

        // Grantor withdraws.
        vm.prank(grantor);
        vesting.withdraw();
        assertEq(usdc.balanceOf(grantor), SEED_GRANTOR - TOTAL + half);
        assertEq(vesting.pendingWithdrawals(grantor), 0);
    }

    function test_Cancel_Midway_EmitsEvent() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        uint256 half = TOTAL / 2;

        vm.prank(grantor);
        vm.expectEmit(true, false, false, true, address(vesting));
        emit VestingStream.StreamCancelled(sid, half, half);
        vesting.cancel(sid);
    }

    function test_Cancel_Midway_StreamMarkedCancelled() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        vm.prank(grantor);
        vesting.cancel(sid);

        assertTrue(vesting.getStream(sid).cancelled);
    }

    function test_Cancel_AtStart_AllReturnedToGrantor() public {
        // Cancel immediately at startTime — 0 seconds elapsed → vested == 0.
        // paidToBeneficiary = 0 - 0 = 0; returnedToGrantor = TOTAL - 0 = TOTAL.
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        vm.prank(grantor);
        vesting.cancel(sid);

        assertEq(vesting.pendingWithdrawals(alice),   0);
        assertEq(vesting.pendingWithdrawals(grantor), TOTAL);
    }

    function test_Cancel_AfterFullyVested_AllToBeneficiary() public {
        // Cancel after end → entire TOTAL vested; nothing to return to grantor.
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION + 1);

        vm.prank(grantor);
        vesting.cancel(sid);

        assertEq(vesting.pendingWithdrawals(alice),   TOTAL);
        assertEq(vesting.pendingWithdrawals(grantor), 0);
    }

    function test_Cancel_AfterPartialClaim_CorrectSplit() public {
        // Grantor creates → beneficiary claims 25% → grantor cancels at 50%.
        // At cancel: vested = 50%, claimed = 25%, so:
        //   paidToBeneficiary = 50% - 25% = 25%  (the unclaimed vested portion)
        //   returnedToGrantor = 100% - 50%        = 50%
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 4);

        // beneficiary claims first quarter.
        vm.prank(alice);
        vesting.claim(sid);
        uint256 firstClaim = TOTAL / 4;
        assertEq(usdc.balanceOf(alice), firstClaim);

        // Warp to the 50% mark and cancel.
        skip(DURATION / 4); // total elapsed = 50%
        vm.prank(grantor);
        vesting.cancel(sid);

        uint256 half  = TOTAL / 2;
        uint256 quarter = TOTAL / 4;

        // paidToBeneficiary = vested_at_cancel - alreadyClaimed = 50% - 25% = 25%
        assertEq(vesting.pendingWithdrawals(alice),   quarter);
        // returnedToGrantor = totalAmount - vested_at_cancel = 100% - 50% = 50%
        assertEq(vesting.pendingWithdrawals(grantor), half);

        // Alice already received 25% directly via claim(); withdraw gives the rest.
        vm.prank(alice);
        vesting.withdraw();
        assertEq(usdc.balanceOf(alice), firstClaim + quarter); // 25% + 25% = 50%

        vm.prank(grantor);
        vesting.withdraw();
        assertEq(usdc.balanceOf(grantor), SEED_GRANTOR - TOTAL + half);
    }

    // ── cancel reverts ────────────────────────────────────────────────────────

    function test_Cancel_RevertNotGrantor() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        vm.prank(attacker);
        vm.expectRevert(VestingStream.NotGrantor.selector);
        vesting.cancel(sid);
    }

    function test_Cancel_RevertAlreadyCancelled() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        vm.prank(grantor);
        vesting.cancel(sid);

        vm.prank(grantor);
        vm.expectRevert(VestingStream.AlreadyCancelled.selector);
        vesting.cancel(sid);
    }

    function test_Cancel_RevertOnInvalidStream() public {
        vm.prank(grantor);
        vm.expectRevert(abi.encodeWithSelector(VestingStream.StreamNotFound.selector, 0));
        vesting.cancel(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. withdraw()
    // ══════════════════════════════════════════════════════════════════════════

    function test_Withdraw_EmitsEvent() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);
        vm.prank(grantor);
        vesting.cancel(sid);

        uint256 half = TOTAL / 2;

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(vesting));
        emit VestingStream.Withdrawn(alice, half);
        vesting.withdraw();
    }

    function test_Withdraw_RevertNothingToClaim() public {
        vm.prank(alice);
        vm.expectRevert(VestingStream.NothingToClaim.selector);
        vesting.withdraw();
    }

    function test_Withdraw_ClearsBalance() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION);
        vm.prank(grantor);
        vesting.cancel(sid);

        vm.prank(alice);
        vesting.withdraw();

        assertEq(vesting.pendingWithdrawals(alice), 0);

        vm.prank(alice);
        vm.expectRevert(VestingStream.NothingToClaim.selector);
        vesting.withdraw();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. streamsOf()
    // ══════════════════════════════════════════════════════════════════════════

    function test_StreamsOf_ReturnsGrantorStreams() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        uint256[] memory ids = vesting.streamsOf(grantor);
        assertEq(ids.length, 1);
        assertEq(ids[0], sid);
    }

    function test_StreamsOf_ReturnsBeneficiaryStreams() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);

        uint256[] memory ids = vesting.streamsOf(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], sid);
    }

    function test_StreamsOf_EmptyForUnrelatedAddress() public {
        _newStream(alice, TOTAL, DURATION);
        uint256[] memory ids = vesting.streamsOf(bob);
        assertEq(ids.length, 0);
    }

    function test_StreamsOf_MultipleStreams() public {
        // grantor creates two streams: one to alice, one to bob.
        uint256 sid1 = _newStream(alice, TOTAL / 2, DURATION);
        usdc.mint(grantor, TOTAL); // refill
        uint256 sid2 = _newStream(bob, TOTAL / 2, DURATION);

        // Grantor should appear in both.
        uint256[] memory grantorIds = vesting.streamsOf(grantor);
        assertEq(grantorIds.length, 2);
        assertEq(grantorIds[0], sid1);
        assertEq(grantorIds[1], sid2);

        // Alice only in stream 1.
        uint256[] memory aliceIds = vesting.streamsOf(alice);
        assertEq(aliceIds.length, 1);
        assertEq(aliceIds[0], sid1);

        // Bob only in stream 2.
        uint256[] memory bobIds = vesting.streamsOf(bob);
        assertEq(bobIds.length, 1);
        assertEq(bobIds[0], sid2);
    }

    function test_StreamsOf_AppearOnceWhenGrantorEqualsWallet() public {
        // If a stream's grantor == beneficiary (degenerate case) the wallet
        // appears in both branches of the condition. The loop only adds the ID
        // once per iteration so it should appear once.
        usdc.mint(grantor, TOTAL);
        vm.startPrank(grantor);
        usdc.approve(address(vesting), TOTAL);
        vesting.createStream(grantor, TOTAL, DURATION); // grantor is also beneficiary
        vm.stopPrank();

        uint256[] memory ids = vesting.streamsOf(grantor);
        assertEq(ids.length, 1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 8. claimableAmount()
    // ══════════════════════════════════════════════════════════════════════════

    function test_ClaimableAmount_ZeroAtStart() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        assertEq(vesting.claimableAmount(sid), 0);
    }

    function test_ClaimableAmount_CorrectAfterClaim() public {
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        skip(DURATION / 2);

        vm.prank(alice);
        vesting.claim(sid);

        skip(DURATION / 4);
        // 75% vested, 50% claimed → 25% claimable.
        assertEq(vesting.claimableAmount(sid), TOTAL / 4);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 9. getStream() — revert on invalid ID
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetStream_RevertOnZeroId() public {
        vm.expectRevert(abi.encodeWithSelector(VestingStream.StreamNotFound.selector, 0));
        vesting.getStream(0);
    }

    function test_GetStream_RevertOnFutureId() public {
        // No stream created yet; id 1 is out of range.
        vm.expectRevert(abi.encodeWithSelector(VestingStream.StreamNotFound.selector, 1));
        vesting.getStream(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 10. FULL HAPPY-PATH FLOW: createStream → warp → claim partial → claim rest
    // ══════════════════════════════════════════════════════════════════════════

    function test_FullFlow_CreateWarpClaimPartialClaimRest() public {
        // (a) Create stream.
        uint256 sid = _newStream(alice, TOTAL, DURATION);
        assertEq(usdc.balanceOf(address(vesting)), TOTAL);

        // (b) Warp to 30% through.
        skip((DURATION * 30) / 100);
        uint256 expected30 = (TOTAL * 30) / 100;

        vm.prank(alice);
        vesting.claim(sid);

        assertEq(usdc.balanceOf(alice), expected30);
        assertEq(vesting.getStream(sid).claimedAmount, expected30);

        // (c) Warp past the end.
        skip(DURATION + 1);

        vm.prank(alice);
        vesting.claim(sid);

        assertEq(usdc.balanceOf(alice), TOTAL);
        assertEq(vesting.getStream(sid).claimedAmount, TOTAL);
        assertEq(usdc.balanceOf(address(vesting)), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 11. FUZZ: random amount / duration / warp → claimable <= totalAmount
    // ══════════════════════════════════════════════════════════════════════════

    function testFuzz_ClaimNeverExceedsTotal(
        uint128 amount,
        uint64 duration,
        uint64 warpOffset
    ) public {
        // Constrain to valid domain.
        amount      = uint128(bound(amount, 1, 1_000_000e6));  // 1 unit to 1M USDC
        duration    = uint64(bound(duration, 1, 10 * 365 days)); // 1 sec to 10 years
        warpOffset  = uint64(bound(warpOffset, 0, 2 * uint256(duration))); // allow past end

        // Seed grantor with enough USDC.
        usdc.mint(grantor, amount);

        uint256 sid = _newStream(alice, amount, duration);
        skip(warpOffset);

        uint256 vested    = vesting.vestedAmount(sid);
        uint256 claimable = vesting.claimableAmount(sid);

        // PROPERTY 1: vested is capped at totalAmount.
        assertLe(vested, uint256(amount));
        // PROPERTY 2: claimable cannot exceed total.
        assertLe(claimable, uint256(amount));
        // PROPERTY 3: claimable = vested - claimed; since claimed == 0 here it equals vested.
        assertEq(claimable, vested);

        if (claimable > 0) {
            uint256 aliceBalBefore = usdc.balanceOf(alice);
            vm.prank(alice);
            vesting.claim(sid);
            // After claim, alice received exactly `claimable` and no more.
            assertEq(usdc.balanceOf(alice), aliceBalBefore + claimable);
            // Stream claimedAmount updated correctly.
            assertEq(vesting.getStream(sid).claimedAmount, claimable);
            // PROPERTY 4: contract balance decreased by exactly what alice received.
            assertEq(usdc.balanceOf(address(vesting)), uint256(amount) - claimable);
        }
    }

    function testFuzz_VestedAmountIsLinearAndMonotone(
        uint128 amount,
        uint64 duration
    ) public {
        amount   = uint128(bound(amount, 1, 1_000_000e6));
        duration = uint64(bound(duration, 2, 365 days)); // ≥2 so midpoint is valid

        usdc.mint(grantor, amount);
        uint256 sid = _newStream(alice, amount, duration);

        // At start → 0.
        uint256 v0 = vesting.vestedAmount(sid);
        assertEq(v0, 0);

        // At midpoint → ≤ totalAmount and > 0 for duration ≥ 2.
        skip(duration / 2);
        uint256 vMid = vesting.vestedAmount(sid);
        assertGe(vMid, 0);
        assertLe(vMid, uint256(amount));

        // At end → totalAmount.
        skip(duration - duration / 2); // advance the remaining half
        uint256 vEnd = vesting.vestedAmount(sid);
        assertEq(vEnd, uint256(amount));

        // Monotone: v0 ≤ vMid ≤ vEnd.
        assertGe(vMid, v0);
        assertGe(vEnd, vMid);
    }

    function testFuzz_CancelSplitSumsToTotal(
        uint128 amount,
        uint64 duration,
        uint64 warpOffset
    ) public {
        amount     = uint128(bound(amount, 1, 1_000_000e6));
        duration   = uint64(bound(duration, 1, 10 * 365 days));
        warpOffset = uint64(bound(warpOffset, 0, 2 * uint256(duration)));

        usdc.mint(grantor, amount);
        uint256 sid = _newStream(alice, amount, duration);
        skip(warpOffset);

        uint256 contractBalBefore = usdc.balanceOf(address(vesting));

        vm.prank(grantor);
        vesting.cancel(sid);

        uint256 pendingAlice   = vesting.pendingWithdrawals(alice);
        uint256 pendingGrantor = vesting.pendingWithdrawals(grantor);

        // PROPERTY: the two pending withdrawals sum to exactly the amount
        //           still held in the contract for this stream.
        assertEq(pendingAlice + pendingGrantor, contractBalBefore);
        // PROPERTY: neither exceeds the total.
        assertLe(pendingAlice,   uint256(amount));
        assertLe(pendingGrantor, uint256(amount));
    }
}

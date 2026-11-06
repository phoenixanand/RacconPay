// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2} from "../VestingStreamV2.sol";
import {VestingStreamV2TestBase} from "./VestingStreamV2.Base.t.sol";

contract VestingStreamV2FuzzTest is VestingStreamV2TestBase {
    function testFuzz_NoBreaks_LinearVesting(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, DURATION * 2);
        uint256 sid = _create();
        skip(elapsed);
        uint256 expected = elapsed >= DURATION ? TOTAL : elapsed * RATE;
        assertEq(vesting.vestedAmount(sid), expected);
    }

    function testFuzz_SingleBreak_VestingFormula(uint256 bStart, uint256 bLen, uint256 t) public {
        bStart = bound(bStart, 1 days, 90 days);
        bLen = bound(bLen, 1, 50 days);
        t = bound(t, 0, 3 * DURATION);
        uint256 sid = _create();
        _schedule(sid, T0 + bStart, T0 + bStart + bLen);
        vm.warp(T0 + t);

        uint256 frozen;
        if (t > bStart) frozen = (t >= bStart + bLen) ? bLen : t - bStart;
        uint256 active = t - frozen;
        uint256 expected = active >= DURATION ? TOTAL : active * RATE;
        assertEq(vesting.vestedAmount(sid), expected);
        assertLe(vesting.vestedAmount(sid), TOTAL);
        assertEq(vesting.effectiveEndTime(sid), T0 + DURATION + bLen);
        if (t >= DURATION + bLen) assertEq(vesting.vestedAmount(sid), TOTAL);
    }

    /// @dev Random interleaving of time jumps, grantor breaks, leave requests/approvals and claims,
    ///      with an optional cancel. Checks the conservation / monotonicity properties throughout.
    function testFuzz_RandomBreaksClaimsAndCancel(uint256 seed, uint8 steps, bool doCancel) public {
        uint256 n = bound(steps, 1, 40);
        uint256 sid = _create();
        uint256 lastVested;

        for (uint256 i = 0; i < n; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint256 action = r % 4;
            if (action == 0) {
                skip((r >> 8) % 8 days);
            } else if (action == 1) {
                uint256 s = block.timestamp + 1 days + ((r >> 16) % 60 days);
                uint256 len = 1 hours + ((r >> 48) % 15 days);
                vm.prank(grantor);
                try vesting.scheduleBreak(sid, uint64(s), uint64(s + len), "") {} catch {}
            } else if (action == 2) {
                vm.prank(alice);
                try vesting.claim(sid) {} catch {}
            } else {
                uint256 s = block.timestamp + ((r >> 16) % 5 days);
                uint256 len = 1 hours + ((r >> 48) % 14 days);
                vm.prank(alice);
                try vesting.requestLeave(sid, uint64(s), uint64(s + len), "") returns (uint256 rid) {
                    vm.prank(grantor);
                    try vesting.approveLeave(rid) {} catch {}
                } catch {}
            }

            uint256 v = vesting.vestedAmount(sid);
            assertGe(v, lastVested, "vested decreased");
            assertLe(v, TOTAL, "vested > total");
            uint256 claimedNow = vesting.getStream(sid).claimedAmount;
            assertLe(claimedNow, v, "claimed > vested");
            assertEq(usdc.balanceOf(alice), claimedNow, "paid != claimedAmount");
            assertEq(vesting.getStream(sid).totalBreakTime <= DURATION / 2, true, "break cap exceeded");
            assertLe(vesting.getBreaks(sid).length, 12);
            lastVested = v;
        }

        _assertBreaksSortedAndDisjoint(sid);

        if (doCancel) {
            skip((uint256(keccak256(abi.encode(seed, "cancel"))) % 30 days));
            uint256 claimedBefore = usdc.balanceOf(alice);
            uint256 vestedAtCancel = vesting.vestedAmount(sid);
            _cancel(sid);

            VestingStreamV2.Stream memory st = vesting.getStream(sid);
            assertEq(st.finalVested, vestedAtCancel);
            uint256 paid = vesting.pendingWithdrawals(alice);
            uint256 returned = vesting.pendingWithdrawals(grantor);
            assertEq(paid, vestedAtCancel - claimedBefore, "paid");
            assertEq(returned, TOTAL - vestedAtCancel, "returned");
            assertEq(claimedBefore + paid + returned, TOTAL, "paid + returned != total");
            assertEq(st.claimedAmount, vestedAtCancel);
            assertEq(vesting.claimableAmount(sid), 0);

            skip(1000 days);
            assertEq(vesting.vestedAmount(sid), vestedAtCancel);

            if (paid > 0) {
                vm.prank(alice);
                vesting.withdraw();
            }
            if (returned > 0) {
                vm.prank(grantor);
                vesting.withdraw();
            }
            assertEq(usdc.balanceOf(alice), vestedAtCancel);
            assertEq(usdc.balanceOf(grantor), SEED - vestedAtCancel);
            assertEq(usdc.balanceOf(address(vesting)), 0);
        } else {
            // before the end: claimed + claimable + unvested == total
            uint256 v2 = vesting.vestedAmount(sid);
            uint256 c2 = vesting.getStream(sid).claimedAmount;
            assertEq(c2 + vesting.claimableAmount(sid) + (TOTAL - v2), TOTAL);

            vm.warp(vesting.effectiveEndTime(sid));
            assertEq(vesting.vestedAmount(sid), TOTAL, "not fully vested at effective end");
            if (vesting.claimableAmount(sid) > 0) _claim(sid);
            assertEq(usdc.balanceOf(alice), TOTAL, "sum claimed != total");
            assertEq(vesting.getStream(sid).claimedAmount, TOTAL);
            assertEq(usdc.balanceOf(address(vesting)), 0);
        }
    }

    function _assertBreaksSortedAndDisjoint(uint256 sid) internal view {
        VestingStreamV2.Break[] memory b = vesting.getBreaks(sid);
        uint256 sum;
        for (uint256 i = 0; i < b.length; ++i) {
            assertLt(b[i].start, b[i].end);
            sum += b[i].end - b[i].start;
            if (i > 0) assertGe(b[i].start, b[i - 1].end, "breaks overlap/unsorted");
        }
        assertEq(sum, vesting.getStream(sid).totalBreakTime, "totalBreakTime != sum of breaks");
    }
}

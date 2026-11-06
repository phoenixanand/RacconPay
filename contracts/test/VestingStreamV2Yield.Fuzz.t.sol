// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev Fuzz properties for yield streams (single yield stream per run, sole vault holder).
contract VestingStreamV2YieldFuzzTest is VestingStreamV2YieldTestBase {
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @dev Create a yield stream and apply either a donation (yield) or a burn (loss) to the vault.
    function _scenario(uint256 amount, uint256 duration, uint256 shock, bool lossMode)
        internal
        returns (uint256 sid, uint256 d)
    {
        sid = _createFor(alice, amount, duration, true);
        if (lossMode) {
            vault.burn(bound(shock, 0, vault.totalAssets()));
        } else {
            d = bound(shock, 0, amount);
            vault.donate(d);
        }
    }

    function _tryClaim(uint256 sid) internal {
        vm.prank(alice);
        try ys.claim(sid) {} catch {}
    }

    // ── claim ────────────────────────────────────────────────────────────────

    function testFuzz_Claim_BeneficiaryGetsMinOfVestedAndAvailable(
        uint256 amount,
        uint256 duration,
        uint256 shock,
        bool lossMode,
        uint256 elapsed
    ) public {
        amount = bound(amount, 1e6, 1e12);
        duration = bound(duration, 1, 365 days);
        (uint256 sid,) = _scenario(amount, duration, shock, lossMode);
        _at(bound(elapsed, 0, duration * 2));

        uint256 claimable = ys.claimableAmount(sid);
        uint256 expected = _min(claimable, _value(sid));

        if (claimable == 0) {
            vm.prank(alice);
            vm.expectRevert(VestingStreamV2Yield.NothingToClaim.selector);
            ys.claim(sid);
        } else if (expected == 0) {
            vm.prank(alice);
            vm.expectRevert(VestingStreamV2Yield.VaultIlliquid.selector);
            ys.claim(sid);
        } else {
            _claim(sid);
            assertEq(usdc.balanceOf(alice), expected);
            assertEq(_claimed(sid), expected);
        }
        assertEq(_pending(grantor), 0);
        assertEq(usdc.balanceOf(grantor), SEED - amount);
    }

    function testFuzz_Claims_OverTimeNeverExceedVestedAndConvergeToTotal(
        uint256 amount,
        uint256 duration,
        uint256 seed
    ) public {
        amount = bound(amount, 1e6, 1e12);
        duration = bound(duration, 4, 365 days);
        uint256 sid = _createFor(alice, amount, duration, true);

        for (uint256 i = 0; i < 4; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            vm.warp(block.timestamp + bound(r, 0, duration / 3));
            vault.donate(bound(r >> 64, 0, amount / 10));
            _tryClaim(sid);
            assertEq(usdc.balanceOf(alice), _claimed(sid));
            assertLe(usdc.balanceOf(alice), ys.vestedAmount(sid));
        }
        _at(duration + 1);
        if (ys.claimableAmount(sid) > 0) _claim(sid);
        assertEq(usdc.balanceOf(alice), amount); // no loss => full principal, never more
        assertEq(_pending(grantor), 0);
    }

    // ── cancel ───────────────────────────────────────────────────────────────

    function testFuzz_Cancel_BeneficiaryFirstThenGrantorRemainder(
        uint256 amount,
        uint256 duration,
        uint256 shock,
        bool lossMode,
        uint256 elapsed,
        bool claimFirst,
        bool illiquid
    ) public {
        amount = bound(amount, 1e6, 1e12);
        duration = bound(duration, 1, 365 days);
        (uint256 sid,) = _scenario(amount, duration, shock, lossMode);
        elapsed = bound(elapsed, 0, duration * 2);
        _at(elapsed / 2);
        if (claimFirst) _tryClaim(sid);
        _at(elapsed);

        uint256 owed = ys.vestedAmount(sid) - _claimed(sid);
        uint256 v = _value(sid);
        uint256 idleBefore = _idle(sid);
        uint256 aliceCredited = _claimed(sid); // already paid out directly (claims)

        if (illiquid) vault.setIlliquid(true);
        _cancel(sid);

        // beneficiary is credited first, from whatever is actually accessible
        assertEq(_pending(alice), _min(owed, illiquid ? idleBefore : v));
        // the grantor never receives anything while beneficiary debt is outstanding
        if (_debt(sid) > 0) assertEq(_pending(grantor), 0);

        if (illiquid) {
            vault.setIlliquid(false);
            if (_shares(sid) > 0 || _debt(sid) > 0 || _idle(sid) > 0) _unwind(sid);
        }

        assertEq(_pending(alice), _min(owed, v));
        assertEq(_debt(sid), owed - _min(owed, v));
        assertEq(_pending(grantor), v - _min(owed, v));
        assertEq(_pending(alice) + _pending(grantor), v); // nothing created or lost
        assertEq(_claimed(sid), aliceCredited + _pending(alice));
    }

    function testFuzz_Unwind_GrantorNeverPaidBeforeBeneficiaryDebtCleared(
        uint256 amount,
        uint256 duration,
        uint256 shock,
        uint256 elapsed,
        uint256 seed
    ) public {
        amount = bound(amount, 1e6, 1e12);
        duration = bound(duration, 1, 365 days);
        (uint256 sid, uint256 d) = _scenario(amount, duration, shock, false);
        _at(bound(elapsed, 0, duration * 2));

        uint256 owed = ys.vestedAmount(sid);
        vault.setIlliquid(true);
        _cancel(sid);
        vault.setIlliquid(false);

        uint256 total = amount + d;
        uint256 aliceLast = _pending(alice);
        for (uint256 i = 0; i < 6; ++i) {
            vault.setLiquidity(bound(uint256(keccak256(abi.encode(seed, i))), 0, amount));
            uint256 grantorBefore = _pending(grantor);
            if (_shares(sid) > 0 || _debt(sid) > 0 || _idle(sid) > 0) _unwind(sid);

            if (_pending(grantor) > grantorBefore) {
                assertEq(_debt(sid), 0, "grantor paid with beneficiary debt");
                assertEq(_shares(sid), 0, "grantor paid before all shares redeemed");
            }
            assertGe(_pending(alice), aliceLast);
            aliceLast = _pending(alice);
            assertEq(_pending(alice) + _pending(grantor) + _value(sid), total, "value conserved");
        }

        vault.setLiquidity(type(uint256).max);
        if (_shares(sid) > 0 || _debt(sid) > 0 || _idle(sid) > 0) _unwind(sid);
        assertEq(_pending(alice), _min(owed, total));
        assertEq(_pending(grantor), total - _min(owed, total));
        assertEq(_debt(sid), 0);
        assertEq(_shares(sid), 0);
    }

    // ── conservation ─────────────────────────────────────────────────────────

    function testFuzz_Conservation_PaidOutPlusRemainingNeverExceedsDepositsPlusDonations(
        uint256 amount,
        uint256 duration,
        uint256 donation,
        uint256 t1,
        uint256 t2,
        uint8 flags
    ) public {
        amount = bound(amount, 1e6, 1e12);
        duration = bound(duration, 1, 365 days);
        uint256 sid = _createFor(alice, amount, duration, true);
        uint256 g0 = usdc.balanceOf(grantor);
        uint256 d = bound(donation, 0, amount);
        vault.donate(d);

        t1 = bound(t1, 0, duration);
        t2 = bound(t2, t1, duration * 2);
        _at(t1);
        _tryClaim(sid);
        if (flags & 1 != 0) {
            vm.prank(grantor);
            try ys.withdrawYield(sid) {} catch {}
        }
        if (flags & 2 != 0) {
            vm.prank(alice);
            try ys.stopYield(sid) {} catch {}
        }
        _at(t2);
        if (flags & 4 != 0) {
            _cancel(sid);
            if (_shares(sid) > 0 || _debt(sid) > 0 || _idle(sid) > 0) _unwind(sid);
        } else {
            _tryClaim(sid);
        }

        if (_pending(alice) > 0) {
            vm.prank(alice);
            ys.withdraw();
        }
        if (_pending(grantor) > 0) {
            vm.prank(grantor);
            ys.withdraw();
        }

        uint256 paidOut = usdc.balanceOf(alice) + (usdc.balanceOf(grantor) - g0);
        assertLe(paidOut + _value(sid), amount + d, "value created from nothing");
        assertGe(paidOut + _value(sid), amount + d, "value destroyed without loss");
        assertLe(usdc.balanceOf(alice), amount);
        // contract balance == this stream's idle after all credits were withdrawn
        assertEq(usdc.balanceOf(address(ys)), _idle(sid));
    }

    // ── withdrawYield ────────────────────────────────────────────────────────

    function testFuzz_WithdrawYield_NeverBreaksCoverageOrVestedReserve(
        uint256 amount,
        uint256 duration,
        uint256 donation,
        uint256 elapsed,
        bool illiquid
    ) public {
        amount = bound(amount, 1e6, 1e12);
        duration = bound(duration, 1, 365 days);
        uint256 sid = _createFor(alice, amount, duration, true);
        vault.donate(bound(donation, 0, amount));
        _at(bound(elapsed, 0, duration * 2));
        if (illiquid) vault.setIlliquid(true);

        uint256 pendingBefore = _pending(grantor);
        vm.prank(grantor);
        try ys.withdrawYield(sid) {
            uint256 obligation = amount - _claimed(sid);
            assertGe(_value(sid), obligation, "value fell below obligation");
            uint256 claimable = ys.claimableAmount(sid);
            assertGe(_idle(sid), claimable, "vested principal not reserved in idle");
            assertGt(_pending(grantor), pendingBefore);
            // beneficiary is still paid in full even though the vault may be blocked
            if (claimable > 0) {
                _claim(sid);
                assertEq(usdc.balanceOf(alice), claimable);
            }
        } catch {
            assertEq(_pending(grantor), pendingBefore);
        }
    }
}

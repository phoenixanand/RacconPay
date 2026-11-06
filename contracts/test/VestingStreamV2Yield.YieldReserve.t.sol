// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev Regression tests for withdrawYield funding BOTH the yield and the vested-but-unclaimed principal
///      reserve (wantIdle = excess + vestedUnclaimed).
///
///      Scenario (1000 USDC over 1000s, 70% deployed => 300 idle / 700 shares):
///        t=500  alice claims 500 (300 idle + 200 pulled from vault) -> idle 0, 500 shares, obligation 500
///        t=600  another 100 vested (vestedUnclaimed = 100); vault donated 50 -> shares worth 550
///      Surplus = 550 - 500 = 50. After withdrawYield the grantor is credited exactly 50, idle (>= 100)
///      still covers the 100 vested principal, and idle + share value >= 500.
contract VestingStreamV2YieldReserveTest is VestingStreamV2YieldTestBase {
    uint256 internal sid;

    function setUp() public override {
        super.setUp();
        sid = _create(true);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /// @dev Build the regression scenario; leaves the vault fully liquid.
    function _scenario() internal {
        _at(500);
        _claim(sid);
        assertEq(_idle(sid), 0, "idle drained by claim");
        assertEq(_shares(sid), 500e6, "500 shares left");
        _at(600);
        vault.donate(50e6);
        assertEq(ys.claimableAmount(sid), 100e6, "100 vested unclaimed");
        assertEq(_value(sid), 550e6, "shares worth 550");
        assertEq(_earned(sid), 50e6, "surplus 50");
    }

    function _obligation(uint256 id) internal view returns (uint256) {
        return ys.getStream(id).totalAmount - _claimed(id);
    }

    function _assertReserveInvariants(uint256 id) internal view {
        assertGe(_idle(id), ys.claimableAmount(id), "idle covers vested-unclaimed");
        assertGe(_value(id), _obligation(id), "idle + shares covers obligation");
    }

    function _claimPaid(uint256 id) internal returns (uint256 paid) {
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        try ys.claim(id) {} catch {}
        paid = usdc.balanceOf(alice) - before;
    }

    // ── liquid vault: the regression scenario ────────────────────────────────

    function test_Reserve_LiquidVault_CreditsExactSurplus() public {
        _scenario();
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldWithdrawn(sid, grantor, 50e6);
        _withdrawYield(sid);

        assertEq(_pending(grantor), 50e6, "grantor credited exact surplus");
        assertGe(_idle(sid), 100e6, "idle still covers vested-unclaimed principal");
        assertGe(_value(sid), 500e6, "value still covers obligation");
        _assertReserveInvariants(sid);
        // surplus fully extracted
        assertEq(_earned(sid), 0);
    }

    function test_Reserve_LiquidVault_BeneficiaryClaimsReserveEvenIfVaultThenBlocks() public {
        _scenario();
        _withdrawYield(sid);
        vault.setIlliquid(true); // vault locks right after yield withdrawal
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 500e6 + 100e6, "alice gets the 100 vested without touching the vault");
    }

    function test_Reserve_LiquidVault_GrantorWithdrawsCreditedUsdc() public {
        _scenario();
        _withdrawYield(sid);
        uint256 before = usdc.balanceOf(grantor);
        vm.prank(grantor);
        ys.withdraw();
        assertEq(usdc.balanceOf(grantor) - before, 50e6);
        assertEq(_pending(grantor), 0);
    }

    function test_Reserve_LiquidVault_SecondCallRevertsNoYield() public {
        _scenario();
        _withdrawYield(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
    }

    function test_Reserve_LiquidVault_ConservesUsdc() public {
        _scenario();
        uint256 totalBefore = usdc.balanceOf(address(ys)) + vault.totalAssets();
        _withdrawYield(sid);
        // nothing leaves the system on withdrawYield; the credit is still held by the contract
        assertEq(usdc.balanceOf(address(ys)) + vault.totalAssets(), totalBefore);
        assertGe(usdc.balanceOf(address(ys)), _pending(grantor) + _idle(sid));
    }

    // ── zero-max-functions vault (Morpho VaultV2 style) ──────────────────────

    function test_Reserve_ZeroMaxFunctions_CreditsExactSurplus() public {
        vault.setMaxFunctionsReturnZero(true);
        _scenario();
        vm.expectEmit(true, true, false, true, address(ys));
        emit VestingStreamV2Yield.YieldWithdrawn(sid, grantor, 50e6);
        _withdrawYield(sid);

        assertEq(_pending(grantor), 50e6);
        assertGe(_idle(sid), 100e6);
        _assertReserveInvariants(sid);
    }

    function test_Reserve_ZeroMaxFunctions_BeneficiaryClaimsAfterwards() public {
        vault.setMaxFunctionsReturnZero(true);
        _scenario();
        _withdrawYield(sid);
        vault.setIlliquid(true);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 600e6);
    }

    // ── partially illiquid vault ─────────────────────────────────────────────

    /// @dev Vault only holds 60 of 550 -> reserve (100) cannot be funded: must revert NoYield, state untouched.
    function test_Reserve_PartialLiquidity_ReserveUnfundable_RevertsNoYield() public {
        _scenario();
        vault.setLiquidity(60e6);
        uint256 idleBefore = _idle(sid);
        uint256 sharesBefore = _shares(sid);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
        assertEq(_pending(grantor), 0);
        assertEq(_idle(sid), idleBefore);
        assertEq(_shares(sid), sharesBefore);
    }

    /// @dev Vault holds 120 -> 20-ish of the surplus can be funded above the 100 reserve; never below the reserve.
    function test_Reserve_PartialLiquidity_CreditsLessButKeepsReserve() public {
        _scenario();
        vault.setLiquidity(120e6);
        _withdrawYield(sid);
        uint256 credited = _pending(grantor);
        assertGt(credited, 0);
        assertLt(credited, 50e6, "less than the full surplus");
        assertGe(_idle(sid), 100e6, "idle never below vested-unclaimed principal");
        _assertReserveInvariants(sid);
        _claim(sid);
        assertEq(usdc.balanceOf(alice), 600e6);
    }

    function test_Reserve_FullyIlliquid_RevertsNoYield() public {
        _scenario();
        vault.setIlliquid(true);
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
        assertEq(_pending(grantor), 0);
    }

    function test_Reserve_ZeroBalanceVault_RevertsNoYield() public {
        _scenario();
        vault.investAll(); // not flagged illiquid, but holds no USDC
        vm.prank(grantor);
        vm.expectRevert(VestingStreamV2Yield.NoYield.selector);
        ys.withdrawYield(sid);
        assertEq(_idle(sid), 0);
        assertEq(_pending(grantor), 0);
    }

    /// @dev Sweep liquidity levels: success must never leave idle below vested-unclaimed principal.
    function test_Reserve_LiquiditySweep_NeverBreaksReserve() public {
        _scenario();
        uint256 snap = vm.snapshotState();
        for (uint256 liq = 0; liq <= 550e6; liq += 25e6) {
            vm.revertToState(snap);
            snap = vm.snapshotState();
            vault.setLiquidity(liq);
            uint256 credited;
            vm.prank(grantor);
            try ys.withdrawYield(sid) {
                credited = _pending(grantor);
                assertLe(credited, 50e6, "never more than surplus");
                assertGe(_idle(sid), 100e6, "reserve kept on success");
            } catch (bytes memory err) {
                assertEq(bytes4(err), VestingStreamV2Yield.NoYield.selector);
                assertEq(_pending(grantor), 0);
            }
            assertGe(_value(sid), _obligation(sid), "idle + shares covers obligation");
            // the beneficiary is never worse off than before
            uint256 idleNow = _idle(sid);
            // (claim may additionally pull whatever the vault can still pay out)
            assertGe(_claimPaid(sid), idleNow < 100e6 ? idleNow : 100e6, "claim pays at least min(vested, idle)");
        }
    }

    // ── fuzz ─────────────────────────────────────────────────────────────────

    /// @dev After ANY withdrawYield (success or NoYield revert), the beneficiary can claim at least what
    ///      they could have claimed had withdrawYield never been called, and at least min(claimable, idle).
    function testFuzz_Reserve_BeneficiaryAlwaysClaimsAfterWithdrawYield(
        uint256 amount,
        uint256 t1,
        uint256 t2,
        uint256 donation,
        uint256 liq,
        bool zeroMax
    ) public {
        amount = bound(amount, 1e3, SEED - TOTAL);
        t1 = bound(t1, 0, DURATION);
        t2 = bound(t2, t1, DURATION + 50);
        donation = bound(donation, 0, amount);

        vault.setMaxFunctionsReturnZero(zeroMax);
        uint256 id = _createFor(alice, amount, DURATION, true);

        _at(t1);
        vm.prank(alice);
        try ys.claim(id) {} catch {}

        vault.donate(donation);
        _at(t2);
        // every 4th input leaves the vault fully liquid
        if (liq % 4 != 0) vault.setLiquidity(bound(liq, 0, vault.totalAssets()));

        uint256 claimableBefore = ys.claimableAmount(id);
        uint256 snap = vm.snapshotState();

        // counterfactual: beneficiary claims with no withdrawYield
        uint256 paidWithout = _claimPaid(id);
        vm.revertToState(snap);

        vm.prank(grantor);
        bool ok;
        try ys.withdrawYield(id) {
            ok = true;
        } catch (bytes memory err) {
            assertEq(bytes4(err), VestingStreamV2Yield.NoYield.selector, "only NoYield may revert");
        }

        if (ok) {
            assertGe(_idle(id), claimableBefore, "idle covers vested-unclaimed after success");
            assertGe(_value(id), _obligation(id), "idle + shares cover obligation after success");
        }
        uint256 idleAfter = _idle(id);
        uint256 paidWith = _claimPaid(id);
        uint256 floorPay = claimableBefore < idleAfter ? claimableBefore : idleAfter;
        assertGe(paidWith, floorPay, "claim pays at least min(claimable, idle)");
        assertGe(paidWith, paidWithout, "withdrawYield never reduces what the beneficiary can claim");
    }

    /// @dev Fully liquid vault: any successful withdrawYield credits no more than the surplus and, apart
    ///      from a few wei of rounding, exactly the surplus; and a non-dust surplus never reverts.
    function testFuzz_Reserve_LiquidVault_CreditsSurplus(
        uint256 amount,
        uint256 t1,
        uint256 t2,
        uint256 donation,
        bool zeroMax
    ) public {
        amount = bound(amount, 1e6, SEED - TOTAL);
        t1 = bound(t1, 0, DURATION);
        t2 = bound(t2, t1, DURATION);
        donation = bound(donation, 0, amount);

        vault.setMaxFunctionsReturnZero(zeroMax);
        uint256 id = _createFor(alice, amount, DURATION, true);
        _at(t1);
        vm.prank(alice);
        try ys.claim(id) {} catch {}
        vault.donate(donation);
        _at(t2);

        uint256 surplus = _earned(id);
        vm.prank(grantor);
        bool ok;
        try ys.withdrawYield(id) {
            ok = true;
        } catch {}

        if (surplus > 1e3) assertTrue(ok, "non-dust surplus on a liquid vault must be withdrawable");
        if (ok) {
            uint256 credited = _pending(grantor);
            assertLe(credited, surplus, "never more than surplus");
            assertGe(credited + 10, surplus, "credits the surplus up to rounding");
            _assertReserveInvariants(id);
        }
    }
}

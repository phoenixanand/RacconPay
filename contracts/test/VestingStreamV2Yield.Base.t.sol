// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VestingStreamV2Yield} from "../VestingStreamV2Yield.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MockERC4626Vault} from "./MockERC4626Vault.sol";

/// @dev Shared fixture. Default stream: 1000 seconds, 1000e6 USDC units (1e6 per second),
///      created at T0 by `grantor` for `alice`. With yield: 700e6 in vault (1:1 shares), 300e6 idle.
///      No tests here.
abstract contract VestingStreamV2YieldTestBase is Test {
    VestingStreamV2Yield internal ys;
    MockERC20 internal usdc;
    MockERC4626Vault internal vault;

    address internal grantor = makeAddr("grantor");
    address internal alice = makeAddr("alice"); // beneficiary
    address internal bob = makeAddr("bob"); // second beneficiary / third party
    address internal attacker = makeAddr("attacker");

    uint256 internal constant T0 = 1_000_000;
    uint256 internal constant DURATION = 1000;
    uint256 internal constant TOTAL = 1000e6;
    uint256 internal constant DEPLOYED = 700e6;
    uint256 internal constant IDLE0 = 300e6;
    uint256 internal constant SEED = 1_000_000e6;

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new MockERC4626Vault(usdc);
        ys = new VestingStreamV2Yield(address(usdc), address(vault));
        usdc.mint(grantor, SEED);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _createFor(address ben, uint256 amount, uint256 duration, bool useYield) internal returns (uint256 sid) {
        vm.startPrank(grantor);
        usdc.approve(address(ys), amount);
        sid = ys.createStream(ben, amount, duration, useYield);
        vm.stopPrank();
    }

    function _create(bool useYield) internal returns (uint256) {
        return _createFor(alice, TOTAL, DURATION, useYield);
    }

    /// @dev Warp to T0 + secs.
    function _at(uint256 secs) internal {
        vm.warp(T0 + secs);
    }

    function _claim(uint256 sid) internal {
        vm.prank(alice);
        ys.claim(sid);
    }

    function _cancel(uint256 sid) internal {
        vm.prank(grantor);
        ys.cancel(sid);
    }

    function _unwind(uint256 sid) internal {
        vm.prank(attacker);
        ys.unwind(sid);
    }

    function _withdrawYield(uint256 sid) internal {
        vm.prank(grantor);
        ys.withdrawYield(sid);
    }

    function _pending(address who) internal view returns (uint256) {
        return ys.pendingWithdrawals(who);
    }

    function _info(uint256 sid)
        internal
        view
        returns (bool useYield, uint256 idle, uint256 shares, uint256 value, uint256 earned, uint256 debt)
    {
        return ys.getYieldInfo(sid);
    }

    function _idle(uint256 sid) internal view returns (uint256 idle) {
        (, idle,,,,) = ys.getYieldInfo(sid);
    }

    function _shares(uint256 sid) internal view returns (uint256 shares) {
        (,, shares,,,) = ys.getYieldInfo(sid);
    }

    function _value(uint256 sid) internal view returns (uint256 value) {
        (,,, value,,) = ys.getYieldInfo(sid);
    }

    function _earned(uint256 sid) internal view returns (uint256 earned) {
        (,,,, earned,) = ys.getYieldInfo(sid);
    }

    function _debt(uint256 sid) internal view returns (uint256 debt) {
        (,,,,, debt) = ys.getYieldInfo(sid);
    }

    function _claimed(uint256 sid) internal view returns (uint256) {
        return ys.getStream(sid).claimedAmount;
    }
}

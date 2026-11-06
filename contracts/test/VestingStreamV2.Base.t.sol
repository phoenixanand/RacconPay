// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VestingStreamV2} from "../VestingStreamV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Shared fixture. Default stream: 100 days, 1e6 USDC-units (1 USDC) per second,
///      created at T0 by `grantor` for `alice`. No tests here.
abstract contract VestingStreamV2TestBase is Test {
    VestingStreamV2 internal vesting;
    MockERC20 internal usdc;

    address internal grantor = makeAddr("grantor");
    address internal alice = makeAddr("alice"); // beneficiary
    address internal bob = makeAddr("bob"); // third party
    address internal attacker = makeAddr("attacker");

    uint256 internal constant T0 = 1_000_000;
    uint256 internal constant DURATION = 100 days;
    uint256 internal constant RATE = 1e6; // token units per second
    uint256 internal constant TOTAL = DURATION * RATE;
    uint256 internal constant SEED = 100 * TOTAL;

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        vesting = new VestingStreamV2(address(usdc));
        usdc.mint(grantor, SEED);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _createFor(address ben, uint256 amount, uint256 duration) internal returns (uint256 sid) {
        vm.startPrank(grantor);
        usdc.approve(address(vesting), amount);
        sid = vesting.createStream(ben, amount, duration);
        vm.stopPrank();
    }

    function _create() internal returns (uint256) {
        return _createFor(alice, TOTAL, DURATION);
    }

    function _schedule(uint256 sid, uint256 start, uint256 end) internal {
        vm.prank(grantor);
        vesting.scheduleBreak(sid, uint64(start), uint64(end), "");
    }

    function _request(uint256 sid, uint256 start, uint256 end) internal returns (uint256 rid) {
        vm.prank(alice);
        rid = vesting.requestLeave(sid, uint64(start), uint64(end), "leave");
    }

    function _approve(uint256 rid) internal {
        vm.prank(grantor);
        vesting.approveLeave(rid);
    }

    function _claim(uint256 sid) internal {
        vm.prank(alice);
        vesting.claim(sid);
    }

    function _cancel(uint256 sid) internal {
        vm.prank(grantor);
        vesting.cancel(sid);
    }

    function _str(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; ++i) {
            b[i] = "a";
        }
        return string(b);
    }
}

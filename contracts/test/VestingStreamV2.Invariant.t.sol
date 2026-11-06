// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VestingStreamV2} from "../VestingStreamV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {VestingStreamV2TestBase} from "./VestingStreamV2.Base.t.sol";

/// @dev Handler is the grantor of every stream; drives bounded random actions.
contract VestingHandler is Test {
    VestingStreamV2 public vesting;
    MockERC20 public usdc;
    address[] public actors;
    uint256[] public ids;

    constructor(VestingStreamV2 _vesting, MockERC20 _usdc, address[] memory _actors) {
        vesting = _vesting;
        usdc = _usdc;
        actors = _actors;
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function newStream(uint256 ai, uint256 amount, uint256 dur) external {
        if (ids.length >= 6) return;
        amount = bound(amount, 1, 1_000_000e6);
        dur = bound(dur, 1, 365 days);
        usdc.mint(address(this), amount);
        usdc.approve(address(vesting), amount);
        ids.push(vesting.createStream(actors[ai % actors.length], amount, dur));
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 30 days));
    }

    function claim(uint256 i) external {
        if (ids.length == 0) return;
        uint256 id = ids[i % ids.length];
        address ben = vesting.getStream(id).beneficiary;
        vm.prank(ben);
        try vesting.claim(id) {} catch {}
    }

    function cancel(uint256 i) external {
        if (ids.length == 0) return;
        try vesting.cancel(ids[i % ids.length]) {} catch {}
    }

    function withdraw(uint256 ai) external {
        vm.prank(actors[ai % actors.length]);
        try vesting.withdraw() {} catch {}
    }

    function withdrawGrantor() external {
        try vesting.withdraw() {} catch {}
    }

    function schedule(uint256 i, uint256 off, uint256 len) external {
        if (ids.length == 0) return;
        uint256 s = block.timestamp + 1 days + bound(off, 0, 200 days);
        uint256 e = s + bound(len, 1, 60 days);
        try vesting.scheduleBreak(ids[i % ids.length], uint64(s), uint64(e), "") {} catch {}
    }

    function leave(uint256 i, uint256 off, uint256 len, bool approve) external {
        if (ids.length == 0) return;
        uint256 id = ids[i % ids.length];
        address ben = vesting.getStream(id).beneficiary;
        uint256 s = block.timestamp + bound(off, 0, 20 days);
        uint256 e = s + bound(len, 1, 20 days);
        vm.prank(ben);
        try vesting.requestLeave(id, uint64(s), uint64(e), "") returns (uint256 rid) {
            if (approve) {
                try vesting.approveLeave(rid) {} catch {}
            }
        } catch {}
    }
}

contract VestingStreamV2InvariantTest is VestingStreamV2TestBase {
    VestingHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](2);
        actors[0] = alice;
        actors[1] = bob;
        handler = new VestingHandler(vesting, usdc, actors);
        targetContract(address(handler));
    }

    /// @dev Token balance == unclaimed remainder of active streams + all withdrawal credits.
    function invariant_BalanceMatchesObligations() public view {
        uint256 owed;
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; ++i) {
            VestingStreamV2.Stream memory s = vesting.getStream(handler.ids(i));
            if (!s.cancelled) owed += s.totalAmount - s.claimedAmount;
        }
        owed += vesting.pendingWithdrawals(alice);
        owed += vesting.pendingWithdrawals(bob);
        owed += vesting.pendingWithdrawals(address(handler));
        assertEq(usdc.balanceOf(address(vesting)), owed);
    }

    function invariant_VestedBoundedAndClaimedLeVested() public view {
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = handler.ids(i);
            VestingStreamV2.Stream memory s = vesting.getStream(id);
            uint256 v = vesting.vestedAmount(id);
            assertLe(v, s.totalAmount);
            assertLe(s.claimedAmount, v);
            assertLe(s.totalBreakTime, (s.endTime - s.startTime) / 2);
            assertLe(vesting.getBreaks(id).length, 12);
        }
    }
}

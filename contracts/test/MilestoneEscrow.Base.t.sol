// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrow} from "../MilestoneEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {BlocklistERC20} from "../test-helpers/BlocklistERC20.sol";

/// @dev Shared fixture. USDC = plain MockERC20 (6dp). EURC = BlocklistERC20 (6dp) so the
///      credit-fallback paths can be driven by blocking a recipient.
abstract contract MilestoneEscrowTestBase is Test {
    MilestoneEscrow internal esc;
    MockERC20 internal usdc;
    BlocklistERC20 internal eurc;

    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");

    uint64 internal constant WINDOW = 3 days;
    uint64 internal constant DEADLINE_OFFSET = 14 days;
    uint256 internal constant A0 = 100e6;
    uint256 internal constant A1 = 200e6;
    uint256 internal constant A2 = 300e6 + 1; // odd on purpose
    uint256 internal constant TOTAL = A0 + A1 + A2;

    function setUp() public virtual {
        vm.warp(1_000_000);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        eurc = new BlocklistERC20("Mock EURC", "mEURC", 6);
        esc = new MilestoneEscrow(address(usdc), address(eurc));

        usdc.mint(payer, 1_000_000e6);
        eurc.mint(payer, 1_000_000e6);
        vm.startPrank(payer);
        usdc.approve(address(esc), type(uint256).max);
        eurc.approve(address(esc), type(uint256).max);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- helpers

    function _amounts() internal pure returns (uint256[] memory a) {
        a = new uint256[](3);
        a[0] = A0;
        a[1] = A1;
        a[2] = A2;
    }

    function _create(address token, address arb) internal returns (uint256 id) {
        id = _createWith(token, _amounts(), arb);
    }

    function _createWith(address token, uint256[] memory amounts, address arb) internal returns (uint256 id) {
        vm.prank(payer);
        id = esc.createEscrow(
            payee, arb, token, amounts, WINDOW, uint64(block.timestamp + DEADLINE_OFFSET), "memo"
        );
    }

    function _submit(uint256 id, uint256 i) internal {
        vm.prank(payee);
        esc.submitMilestone(id, i, keccak256("evidence"));
    }

    function _approve(uint256 id, uint256 i) internal {
        vm.prank(payer);
        esc.approveMilestone(id, i);
    }

    function _dispute(uint256 id, uint256 i) internal {
        vm.prank(payer);
        esc.dispute(id, i);
    }

    function _submitAndDispute(uint256 id, uint256 i) internal {
        _submit(id, i);
        _dispute(id, i);
    }

    function _status(uint256 id, uint256 i) internal view returns (MilestoneEscrow.Status) {
        return esc.getMilestone(id, i).status;
    }

    function _badStatus(MilestoneEscrow.Status expected, MilestoneEscrow.Status actual)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(MilestoneEscrow.InvalidStatus.selector, expected, actual);
    }

    function _unauth(address who) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MilestoneEscrow.Unauthorized.selector, who);
    }
}

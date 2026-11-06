// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {BlocklistERC20} from "../test-helpers/BlocklistERC20.sol";

/// @dev Shared V2 fixture. USDC = plain MockERC20 (6dp). EURC = BlocklistERC20 (6dp) so the
///      credit-fallback paths can be driven by blocking a recipient.
abstract contract MilestoneEscrowV2TestBase is Test {
    MilestoneEscrowV2 internal esc;
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
    string internal constant NOTE = "https://example.com/evidence";
    string internal constant REASON = "please fix the header";

    function setUp() public virtual {
        vm.warp(1_000_000);
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        eurc = new BlocklistERC20("Mock EURC", "mEURC", 6);
        esc = new MilestoneEscrowV2(address(usdc), address(eurc));

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

    function _titles() internal pure returns (string[] memory t) {
        t = new string[](3);
        t[0] = "Design";
        t[1] = "Build";
        t[2] = "Ship";
    }

    function _titlesN(uint256 n) internal pure returns (string[] memory t) {
        t = new string[](n);
        for (uint256 k; k < n; ++k) t[k] = "t";
    }

    function _create(address token, address arb) internal returns (uint256 id) {
        id = _createWith(token, _amounts(), arb);
    }

    function _createWith(address token, uint256[] memory amounts, address arb) internal returns (uint256 id) {
        vm.prank(payer);
        id = esc.createEscrow(
            payee,
            arb,
            token,
            amounts,
            _titlesN(amounts.length),
            WINDOW,
            uint64(block.timestamp + DEADLINE_OFFSET),
            "memo"
        );
    }

    function _bytesOf(uint256 n, bytes1 c) internal pure returns (string memory s) {
        bytes memory b = new bytes(n);
        for (uint256 k; k < n; ++k) b[k] = c;
        s = string(b);
    }

    function _submit(uint256 id, uint256 i) internal {
        vm.prank(payee);
        esc.submitMilestone(id, i, NOTE);
    }

    function _approve(uint256 id, uint256 i) internal {
        vm.prank(payer);
        esc.approveMilestone(id, i);
    }

    function _dispute(uint256 id, uint256 i) internal {
        vm.prank(payer);
        esc.dispute(id, i);
    }

    function _request(uint256 id, uint256 i) internal {
        vm.prank(payer);
        esc.requestChanges(id, i, REASON);
    }

    function _escalate(uint256 id, uint256 i) internal {
        vm.prank(payee);
        esc.escalate(id, i);
    }

    function _submitAndDispute(uint256 id, uint256 i) internal {
        _submit(id, i);
        _dispute(id, i);
    }

    /// @dev Funded -> Submitted -> ChangesRequested.
    function _submitAndRequest(uint256 id, uint256 i) internal {
        _submit(id, i);
        _request(id, i);
    }

    function _status(uint256 id, uint256 i) internal view returns (MilestoneEscrowV2.Status) {
        return esc.getMilestone(id, i).status;
    }

    function _badStatus(MilestoneEscrowV2.Status expected, MilestoneEscrowV2.Status actual)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(MilestoneEscrowV2.InvalidStatus.selector, expected, actual);
    }

    function _unauth(address who) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MilestoneEscrowV2.Unauthorized.selector, who);
    }
}

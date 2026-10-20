// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title  ArcDeskProbe
 * @notice Minimal smoke-test contract for ArcDesk on Arc Testnet.
 *         Deploys a counter so we can confirm:
 *           1. The Solidity 0.8.28 / Paris EVM compiler settings compile cleanly.
 *           2. A transaction can be broadcast and mined on Arc Testnet (chain ID 5042002).
 *           3. Gas (paid in native USDC on Arc) is deducted correctly.
 *
 * TESTNET ONLY — not for use with real funds.
 */
contract ArcDeskProbe {
    /// @notice Simple counter incremented by each ping.
    uint256 public pingCount;

    /// @notice Emitted on every ping so we can verify event logs.
    event Pinged(address indexed sender, uint256 count);

    /// @notice Increment the counter and emit an event.
    function ping() external {
        pingCount += 1;
        emit Pinged(msg.sender, pingCount);
    }

    /// @notice Returns a greeting string — proves string return values work.
    function greet() external pure returns (string memory) {
        return "ArcDesk is alive on Arc Testnet";
    }
}

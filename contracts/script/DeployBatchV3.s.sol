// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {BatchPayout} from "../BatchPayout.sol";
import {ReceiptNFT} from "../ReceiptNFT.sol";

/**
 * @notice Deploys BatchPayout v3 + a fresh ReceiptNFT in one atomic script.
 *
 * Deploy order:
 *   1. Predict BatchPayout's address using vm.computeCreateAddress(deployer, nonce).
 *   2. Deploy ReceiptNFT with minter = predicted BatchPayout address.
 *   3. Deploy BatchPayout with _usdc + _receiptNFT = ReceiptNFT just deployed.
 *   4. Assert wiring is correct.
 *
 * Run:
 *   forge script contracts/script/DeployBatchV3.s.sol:DeployBatchV3 \
 *     --rpc-url $ARC_MAINNET_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 */
contract DeployBatchV3 is Script {
    // Arc Mainnet USDC ERC-20 (6 decimals)
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();

        address deployer = msg.sender;
        uint64 nonce = vm.getNonce(deployer);

        // BatchPayout will be deployed at nonce+1 (ReceiptNFT takes nonce first).
        address predictedBatchPayout = vm.computeCreateAddress(deployer, nonce + 1);
        console.log("Predicted BatchPayout v3:", predictedBatchPayout);

        // 1. Deploy ReceiptNFT with minter = predicted BatchPayout address.
        ReceiptNFT receiptNFT = new ReceiptNFT(predictedBatchPayout);
        console.log("ReceiptNFT deployed at:   ", address(receiptNFT));

        // 2. Deploy BatchPayout v3 — address must match prediction.
        BatchPayout batchPayout = new BatchPayout(USDC, address(receiptNFT));
        console.log("BatchPayout v3 deployed at:", address(batchPayout));

        // 3. Assert wiring.
        require(address(batchPayout) == predictedBatchPayout, "address mismatch");
        require(address(batchPayout.receiptNFT()) == address(receiptNFT), "receiptNFT mismatch");
        require(receiptNFT.minter() == address(batchPayout), "minter mismatch");

        console.log("Wiring verified.");
        vm.stopBroadcast();
    }
}

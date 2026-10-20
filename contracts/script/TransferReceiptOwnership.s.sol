// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ReceiptNFT} from "../ReceiptNFT.sol";

/**
 * @notice One-time setup script: transfer ReceiptNFT ownership to BatchPayout.
 *
 * Run (after setting PRIVATE_KEY in .env):
 *   source .env
 *   forge script contracts/script/TransferReceiptOwnership.s.sol \
 *     --rpc-url $ARC_TESTNET_RPC_URL \
 *     --broadcast \
 *     --private-key $PRIVATE_KEY
 */
contract TransferReceiptOwnership is Script {
    // Deployed addresses on Arc Testnet (updated after v2 redeploy)
    address constant RECEIPT_NFT  = 0x75996Dc7ED7789b5C148c78978Bf92Fd7ab956aB; // old — update after redeploy
    address constant BATCH_PAYOUT = 0x4e7899863F7Da16c952436E5b99732DC375Ccf0a; // old — update after redeploy

    function run() external {
        // NOTE: ReceiptNFT v2 uses onlyMinter instead of Ownable.
        // This script is kept for reference only — wiring is done via setReceiptNFT on BatchPayout.
        console.log("Use BatchPayout.setReceiptNFT() instead. BatchPayout:", BATCH_PAYOUT);
        console.log("ReceiptNFT:", RECEIPT_NFT);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title ReceiptNFT
/// @notice Soul-bound receipt NFT (SBT): once minted it cannot be transferred.
///
/// @dev  Access control: instead of Ownable we store an immutable `minter`
///       address set at deploy time to the BatchPayout contract address.
///       This removes the need for a post-deploy transferOwnership() call
///       and eliminates the window where the wrong address could mint.
///
///       TRUST: the constructor caller is trusted to pass the correct
///       BatchPayout address. After deployment this cannot be changed.
contract ReceiptNFT is ERC721 {
    error NotTransferable();
    error OnlyMinter();

    struct ReceiptData {
        uint256 batchTotal;
        uint256 recipientCount;
        uint256 timestamp;
        bytes32 listHash;
    }

    /// @notice The only address allowed to call mint(). Set once at deployment.
    address public immutable minter;

    uint256 private _tokenIdCounter = 1;
    mapping(uint256 tokenId => ReceiptData data) private _receipts;

    constructor(address _minter) ERC721("RacconPay Receipt", "RCNR") {
        require(_minter != address(0), "minter cannot be zero address");
        minter = _minter;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinter();
        _;
    }

    function mint(address to, ReceiptData calldata data) external onlyMinter returns (uint256 tokenId) {
        tokenId = _tokenIdCounter;
        _tokenIdCounter = tokenId + 1;

        // Using _safeMint: triggers onERC721Received on contract recipients.
        // CONSTRAINT: callers of batchPay() must be EOAs (e.g. MetaMask wallets).
        // If `to` is a contract that does not implement ERC721Receiver, _safeMint will revert
        // and the entire batch reverts. This is acceptable for this testnet dApp (EOA-only use).
        _safeMint(to, tokenId);
        _receipts[tokenId] = data;
    }

    function getReceipt(uint256 tokenId) external view returns (ReceiptData memory) {
        _requireOwned(tokenId);
        return _receipts[tokenId];
    }

    function receiptsOf(address wallet) external view returns (uint256[] memory) {
        uint256 minted = _tokenIdCounter - 1;
        uint256 balance = balanceOf(wallet);
        uint256[] memory tokenIds = new uint256[](balance);

        if (balance == 0) {
            return tokenIds;
        }

        uint256 cursor = 0;
        for (uint256 tokenId = 1; tokenId <= minted; ++tokenId) {
            if (_ownerOf(tokenId) == wallet) {
                tokenIds[cursor] = tokenId;
                unchecked {
                    ++cursor;
                }
            }
        }

        return tokenIds;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0)) {
            revert NotTransferable();
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

error AlreadyMinted();

contract GBADebug is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    uint256 public totalMinted;
    mapping (bytes32 => bool) public minted;

    constructor() ERC721("GBADebug", "GBA") {}

    function safeMint(address to, string calldata uri, bytes32 _studentEmailHash) public onlyOwner {

        // Custom error - Will save gas on a reverted transaction
        if (minted[_studentEmailHash]) {
            revert AlreadyMinted();
        }

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        totalMinted++;
        minted[_studentEmailHash] = true;
    }


    function emergencyReset (bytes32 _studentEmailHash) public onlyOwner {
        minted[_studentEmailHash] = false;
    }


    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    receive() external payable {
        revert();
    }
    
}
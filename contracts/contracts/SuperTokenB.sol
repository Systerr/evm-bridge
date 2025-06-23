// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SuperTokenB is ERC20, Ownable {
    /**simple addong to ownable */
    address private _relay;

    constructor(
        uint256 initialSupply
    ) ERC20("SuperTokenB", "SUPB") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }

    /* @dev Event for new relay set
     * @param newRelay new relay address
     */
    event RelaySet(address indexed newRelay);

    /**
     * @notice Sets or updates the address of the relay.
     * @dev Can only be called by the contract owner.
     * @param newRelay The address of the new relay.
     */
    function setRelay(address newRelay) public onlyOwner {
        require(newRelay != address(0), "Relay cannot be the zero address");
        _relay = newRelay;
        emit RelaySet(newRelay);
    }

    /**
     * @notice Returns the current relay address.
     */
    function relay() public view returns (address) {
        return _relay;
    }

    /**
     * @dev Custom modifier to allow access only to the owner or the designated relay.
     */
    modifier onlyOwnerOrRelay() {
        require(
            owner() == _msgSender() || _relay == _msgSender(),
            "Caller is not the owner or the relay"
        );
        _;
    }

    /**
     * @notice Mints new tokens.
     * @dev Can only be called by the contract owner or the designated relay.
     * @param to The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) public onlyOwnerOrRelay {
        _mint(to, amount);
    }
}

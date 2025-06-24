// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Bridge is Ownable {
    /**
     * @notice  good practive to user safeTransfer
     */
    using SafeERC20 for IERC20;

    /**
     * @notice  counter for nonce. Can be used directly after solidity 0.8
     */
    uint256 private _currentNonce;

    /**
     * @notice  we have no plan to change token.
     * In real life should be list of supported tokens that updated
     */
    address public immutable superToken;

    /**
     * @dev It signals to the outside world that tokens have been locked
     * External system look for that events and do a real transfer
     * @param nonce A unique, sequential ID for the transaction.
     * @param destinationAddress The recipient's address on the destination chain.
     * @param amount The amount of tokens locked.
     */
    event TokensLocked(
        uint256 indexed nonce,
        address indexed destinationAddress,
        uint256 indexed amount
    );

    constructor(address superTokenAddress) Ownable(msg.sender) {
        require(
            superTokenAddress != address(0),
            "Token address cannot be zero"
        );

        _currentNonce = 0;
        superToken = superTokenAddress;
    }

    /**
     * @dev main function to lock token in one chain
     * @param amount token amount
     * @param recipientOnChainB recepient address on second
     */
    function lockTokens(uint256 amount, address recipientOnChainB) public {
        // TODO there will be good to a collect fee
        IERC20(superToken).transferFrom(msg.sender, address(this), amount);
        _currentNonce += 1; // we will start from 1 not 0
        emit TokensLocked(_currentNonce, recipientOnChainB, amount);
    }

    /**
     * @dev fast version of lockTokens.
     * @param amount token amount
     */
    function lockTokens(uint256 amount) public {
        return lockTokens(amount, msg.sender);
    }

    /**
     * @notice A safety hatch for the owner to withdraw any tokens held by this contract.
     * @dev This is crucial for recovering funds or migrating to a new contract.
     */
    function withdrawTokens(address to, uint256 amount) public onlyOwner {
        IERC20(superToken).safeTransfer(to, amount);
    }
}

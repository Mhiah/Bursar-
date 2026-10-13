// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BursarSavings} from "./BursarSavings.sol";

/// @title BursarSavingsFactory
/// @notice Creates a BursarSavings owned by whoever calls it. Bursar never owns one.
contract BursarSavingsFactory {
    IERC20 public immutable token;

    mapping(address => address[]) internal _savingsOf;

    event SavingsCreated(address indexed owner, address indexed savings, address agent);

    constructor(IERC20 token_) {
        token = token_;
    }

    function createSavings(address agent) external returns (address savings) {
        savings = address(new BursarSavings(token, msg.sender, agent));
        _savingsOf[msg.sender].push(savings);
        emit SavingsCreated(msg.sender, savings, agent);
    }

    function savingsOf(address owner) external view returns (address[] memory) {
        return _savingsOf[owner];
    }
}

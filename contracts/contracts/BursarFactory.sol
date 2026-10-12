// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BursarVault} from "./BursarVault.sol";

/// @title BursarFactory
/// @notice Creates a BursarVault owned by whoever calls it. Bursar never owns a vault.
contract BursarFactory {
    IERC20 public immutable token;

    mapping(address => address[]) internal _vaultsOf;

    event VaultCreated(address indexed owner, address indexed vault, address agent);

    constructor(IERC20 token_) {
        token = token_;
    }

    function createVault(address agent, uint256 maxPerPayment, uint256 cashFloor) external returns (address vault) {
        vault = address(new BursarVault(token, msg.sender, agent, maxPerPayment, cashFloor));
        _vaultsOf[msg.sender].push(vault);
        emit VaultCreated(msg.sender, vault, agent);
    }

    function vaultsOf(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }
}

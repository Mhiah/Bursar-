// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";

/// @title BursarSavings
/// @notice A business's savings, kept apart from its vault and owned only by the business.
/// Money arrives as plain USDC transfers (from the vault, or anyone) and waits as "unassigned"
/// until the owner or the agent puts it into a pot. The agent can only put money into pots;
/// it can never take money out. Only the owner can take money out, and never from a Locked
/// pot before its date. There is no admin key: nobody, Bursar included, can open a lock early.
contract BursarSavings is ReentrancyGuard, Multicall {
    using SafeERC20 for IERC20;

    enum Kind {
        Flex, // take out anytime
        Locked, // can't be taken out before unlockAt
        Target // a goal amount; take out anytime
    }

    struct Pot {
        string name;
        Kind kind;
        uint128 balance;
        uint128 goal;
        uint64 unlockAt;
    }

    IERC20 public immutable token;
    address public owner;
    address public agent;

    Pot[] internal _pots;
    /// @notice Total held in pots. Anything above it in the balance is unassigned.
    uint256 public allocated;

    event PotCreated(uint256 indexed id, string name, Kind kind, uint256 goal, uint256 unlockAt);
    event LockExtended(uint256 indexed id, uint256 unlockAt);
    event Allocated(uint256 indexed id, uint256 amount, address by);
    event Withdrawn(uint256 indexed id, address to, uint256 amount);
    event AgentChanged(address indexed agent);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotOwnerOrAgent();
    error NoSuchPot();
    error StillLocked();
    error LockInPast();
    error LockShorter();
    error NotEnough();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 token_, address owner_, address agent_) {
        if (address(token_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        token = token_;
        owner = owner_;
        agent = agent_;
        emit OwnershipTransferred(address(0), owner_);
        emit AgentChanged(agent_);
    }

    // ---------------------------------------------------------------- views

    function balance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Money that has arrived but isn't in a pot yet.
    function unassigned() public view returns (uint256) {
        uint256 b = balance();
        return b > allocated ? b - allocated : 0;
    }

    function potCount() external view returns (uint256) {
        return _pots.length;
    }

    function pot(uint256 id) external view returns (Pot memory) {
        if (id >= _pots.length) revert NoSuchPot();
        return _pots[id];
    }

    // ---------------------------------------------------------------- owner and agent

    /// @notice Put unassigned money into a pot. The agent may do this too; it moves nothing out.
    function allocate(uint256 id, uint256 amount) external {
        if (msg.sender != owner && msg.sender != agent) revert NotOwnerOrAgent();
        if (id >= _pots.length) revert NoSuchPot();
        if (amount == 0) revert ZeroAmount();
        if (amount > unassigned()) revert NotEnough();
        _pots[id].balance += uint128(amount);
        allocated += amount;
        emit Allocated(id, amount, msg.sender);
    }

    // ---------------------------------------------------------------- owner

    function createPot(string calldata name, Kind kind, uint128 goal, uint64 unlockAt) external onlyOwner returns (uint256 id) {
        if (kind == Kind.Locked && unlockAt <= block.timestamp) revert LockInPast();
        id = _pots.length;
        _pots.push(Pot(name, kind, 0, goal, kind == Kind.Locked ? unlockAt : 0));
        emit PotCreated(id, name, kind, goal, kind == Kind.Locked ? unlockAt : 0);
    }

    /// @notice A lock can be made longer, never shorter.
    function extendLock(uint256 id, uint64 unlockAt) external onlyOwner {
        if (id >= _pots.length) revert NoSuchPot();
        Pot storage p = _pots[id];
        if (p.kind != Kind.Locked) revert NoSuchPot();
        if (unlockAt <= p.unlockAt) revert LockShorter();
        p.unlockAt = unlockAt;
        emit LockExtended(id, unlockAt);
    }

    function withdraw(uint256 id, address to, uint256 amount) external onlyOwner nonReentrant {
        if (id >= _pots.length) revert NoSuchPot();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        Pot storage p = _pots[id];
        if (p.kind == Kind.Locked && block.timestamp < p.unlockAt) revert StillLocked();
        if (amount > p.balance) revert NotEnough();
        p.balance -= uint128(amount);
        allocated -= amount;
        token.safeTransfer(to, amount);
        emit Withdrawn(id, to, amount);
    }

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

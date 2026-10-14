// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";

/// @title BursarVault
/// @notice Holds one business's USDC. The owner (the business's own wallet) sets the
/// rules; the agent can only move money inside them. The rules live here, not in the
/// agent's prompt, so a wrong or tricked agent still cannot break them.
/// Multicall lets the owner send several changes in one transaction (one approval).
contract BursarVault is ReentrancyGuard, Multicall {
    using SafeERC20 for IERC20;

    uint256 public constant BUDGET_PERIOD = 30 days;

    struct Budget {
        uint128 limit; // max spend per period, in token units (0 = category closed)
        uint128 spent; // spent in the current period
        uint64 periodStart;
    }

    struct Pending {
        address to;
        uint256 amount;
        bytes32 category;
        bytes32 ref;
        bool open;
    }

    IERC20 public immutable token;
    address public owner;
    address public agent;
    bool public paused;

    uint256 public maxPerPayment;
    uint256 public cashFloor;
    /// @notice Part of the balance set aside as reserve. The rest is operating cash.
    uint256 public reserve;

    mapping(bytes32 => Budget) public budgets;
    mapping(address => bool) public approvedPayee;
    /// @notice Bill references already paid. Stops the same bill being paid twice.
    mapping(bytes32 => bool) public refPaid;
    /// @notice Bill references waiting for owner approval.
    mapping(bytes32 => bool) public refPending;

    Pending[] internal _pending;

    event Paid(address indexed to, uint256 amount, bytes32 indexed category, bytes32 indexed ref, bool byOwnerApproval);
    event ApprovalRequested(uint256 indexed id, address indexed to, uint256 amount, bytes32 category, bytes32 ref, bytes32 reasonHash);
    event ApprovalRejected(uint256 indexed id);
    event ReserveMoved(uint256 toReserve, uint256 fromReserve, uint256 reserveAfter);
    event Decision(bytes32 indexed logHash);
    event AgentChanged(address indexed agent);
    event RulesChanged(uint256 maxPerPayment, uint256 cashFloor);
    event BudgetSet(bytes32 indexed category, uint256 limit);
    event PayeeSet(address indexed payee, bool approved);
    event Paused(bool paused);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotAgent();
    error IsPaused();
    error PayeeNotApproved();
    error AlreadyPaid();
    error AlreadyPending();
    error OverPaymentLimit();
    error OverBudget();
    error BelowCashFloor();
    error InsufficientReserve();
    error NotOpen();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        if (paused) revert IsPaused();
        _;
    }

    constructor(IERC20 token_, address owner_, address agent_, uint256 maxPerPayment_, uint256 cashFloor_) {
        if (address(token_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        token = token_;
        owner = owner_;
        agent = agent_;
        maxPerPayment = maxPerPayment_;
        cashFloor = cashFloor_;
        emit OwnershipTransferred(address(0), owner_);
        emit AgentChanged(agent_);
        emit RulesChanged(maxPerPayment_, cashFloor_);
    }

    // ---------------------------------------------------------------- views

    function balance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Cash the agent can work with: balance minus the reserve.
    function operating() public view returns (uint256) {
        uint256 b = balance();
        return b > reserve ? b - reserve : 0;
    }

    /// @notice What is left of a category's budget in the current period.
    function budgetLeft(bytes32 category) external view returns (uint256) {
        Budget memory b = budgets[category];
        if (block.timestamp >= uint256(b.periodStart) + BUDGET_PERIOD) return b.limit;
        return b.limit > b.spent ? b.limit - b.spent : 0;
    }

    function pendingCount() external view returns (uint256) {
        return _pending.length;
    }

    function pending(uint256 id) external view returns (Pending memory) {
        return _pending[id];
    }

    /// @notice Dry run of every rule `agentPay` enforces. Returns 0 if the payment would
    /// go through, or the selector of the error it would hit.
    function check(address to, uint256 amount, bytes32 category, bytes32 ref) external view returns (bytes4) {
        if (paused) return IsPaused.selector;
        if (amount == 0) return ZeroAmount.selector;
        if (!approvedPayee[to]) return PayeeNotApproved.selector;
        if (refPaid[ref]) return AlreadyPaid.selector;
        if (refPending[ref]) return AlreadyPending.selector;
        if (amount > maxPerPayment) return OverPaymentLimit.selector;
        Budget memory b = budgets[category];
        uint256 spent = block.timestamp >= uint256(b.periodStart) + BUDGET_PERIOD ? 0 : b.spent;
        if (spent + amount > b.limit) return OverBudget.selector;
        uint256 op = operating();
        if (op < amount || op - amount < cashFloor) return BelowCashFloor.selector;
        return bytes4(0);
    }

    // ---------------------------------------------------------------- agent

    /// @notice Pay a bill inside every rule. Anything outside them reverts.
    function agentPay(address to, uint256 amount, bytes32 category, bytes32 ref) external onlyAgent nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!approvedPayee[to]) revert PayeeNotApproved();
        if (refPending[ref]) revert AlreadyPending();
        if (amount > maxPerPayment) revert OverPaymentLimit();
        _spend(to, amount, category, ref, true);
        emit Paid(to, amount, category, ref, false);
    }

    /// @notice Hold a payment for the owner to approve, with a fingerprint of the agent's reasons.
    function requestApproval(address to, uint256 amount, bytes32 category, bytes32 ref, bytes32 reasonHash)
        external
        onlyAgent
        returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        if (refPaid[ref]) revert AlreadyPaid();
        if (refPending[ref]) revert AlreadyPending();
        refPending[ref] = true;
        id = _pending.length;
        _pending.push(Pending(to, amount, category, ref, true));
        emit ApprovalRequested(id, to, amount, category, ref, reasonHash);
    }

    function moveToReserve(uint256 amount) external onlyAgent {
        if (amount == 0) revert ZeroAmount();
        uint256 op = operating();
        if (op < amount || op - amount < cashFloor) revert BelowCashFloor();
        reserve += amount;
        emit ReserveMoved(amount, 0, reserve);
    }

    /// @notice Anchor a decision-log entry onchain so it can't be edited later.
    function recordDecision(bytes32 logHash) external onlyAgent {
        emit Decision(logHash);
    }

    // ---------------------------------------------------------------- owner

    /// @notice Approve a held payment. The owner may go over the per-payment limit, the
    /// budget and the cash floor, and may draw on the reserve, but the bill still can't be
    /// paid twice and still counts toward its budget.
    function approve(uint256 id) external onlyOwner nonReentrant {
        Pending storage p = _pending[id];
        if (!p.open) revert NotOpen();
        p.open = false;
        refPending[p.ref] = false;
        _spend(p.to, p.amount, p.category, p.ref, false);
        emit Paid(p.to, p.amount, p.category, p.ref, true);
    }

    function reject(uint256 id) external onlyOwner {
        Pending storage p = _pending[id];
        if (!p.open) revert NotOpen();
        p.open = false;
        refPending[p.ref] = false;
        emit ApprovalRejected(id);
    }

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function setRules(uint256 maxPerPayment_, uint256 cashFloor_) external onlyOwner {
        maxPerPayment = maxPerPayment_;
        cashFloor = cashFloor_;
        emit RulesChanged(maxPerPayment_, cashFloor_);
    }

    function setBudget(bytes32 category, uint128 limit) external onlyOwner {
        budgets[category].limit = limit;
        emit BudgetSet(category, limit);
    }

    function setPayee(address payee, bool ok) external onlyOwner {
        if (payee == address(0)) revert ZeroAddress();
        approvedPayee[payee] = ok;
        emit PayeeSet(payee, ok);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function ownerReleaseReserve(uint256 amount) external onlyOwner {
        _release(amount);
    }

    /// @notice The owner can always take money out, reserve included.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 b = balance();
        uint256 op = b > reserve ? b - reserve : 0;
        if (amount > op) {
            uint256 fromReserve = amount - op;
            reserve = reserve > fromReserve ? reserve - fromReserve : 0;
        }
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------- internal

    function _spend(address to, uint256 amount, bytes32 category, bytes32 ref, bool enforceFloor) internal {
        if (refPaid[ref]) revert AlreadyPaid();
        Budget storage b = budgets[category];
        if (block.timestamp >= uint256(b.periodStart) + BUDGET_PERIOD) {
            b.periodStart = uint64(block.timestamp);
            b.spent = 0;
        }
        if (uint256(b.spent) + amount > b.limit) {
            // The owner's approval overrides the budget; the agent's never does.
            if (enforceFloor) revert OverBudget();
        }
        uint256 op = operating();
        if (enforceFloor) {
            if (op < amount || op - amount < cashFloor) revert BelowCashFloor();
        } else if (op < amount) {
            // The owner approved it, so it may draw on the reserve.
            uint256 fromReserve = amount - op;
            if (fromReserve > reserve) revert InsufficientReserve();
            reserve -= fromReserve;
            emit ReserveMoved(0, fromReserve, reserve);
        }
        b.spent = uint128(uint256(b.spent) + amount);
        refPaid[ref] = true;
        token.safeTransfer(to, amount);
    }

    function _release(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > reserve) revert InsufficientReserve();
        reserve -= amount;
        emit ReserveMoved(0, amount, reserve);
    }
}

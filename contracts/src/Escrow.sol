// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DealType, DealStatus, Outcome} from "./Types.sol";

error Escrow_OnlyParty();
error Escrow_OnlyArbitrator();
error Escrow_InvalidAmount();
error Escrow_InvalidFee();
error Escrow_InvalidAddress();
error Escrow_DealNotActive();
error Escrow_DealAlreadyResolved();
error Escrow_CannotDisputeYet();
error Escrow_AlreadyVoted();
error Escrow_InvalidResolution();
error Escrow_InsufficientDeposit();
error Escrow_FeeExceedsAmount();
error Escrow_AlreadyDeposited();
error Escrow_DepositsIncomplete();
error Escrow_DealNotExpired();
error Escrow_CancelAlreadyRequested();
error Escrow_DepositsComplete();

struct Deal {
    address partyA;
    address partyB;
    DealType dealType;
    DealStatus status;
    uint256 partyAAmount;
    uint256 partyBAmount;
    uint256 partyADeposited;
    uint256 partyBDeposited;
    uint256 platformFeePercent;
    address arbitrator;
    Outcome partyAVote;
    Outcome partyBVote;
    uint256 createdAt;
    uint256 disputeTimestamp;
    uint256 expiryTimestamp;
    bool partyADepositComplete;
    bool partyBDepositComplete;
}

contract Escrow is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant MIN_DISPUTE_PERIOD = 1 days;
    uint256 private constant ADMIN_TIMEOUT_PERIOD = 24 hours;
    uint256 private constant MAX_PLATFORM_FEE = 500;
    uint256 private constant DISPUTE_FEE_PERCENT = 200;
    uint256 public constant DEFAULT_EXPIRY_PERIOD = 30 days;

    address public platformAdmin;
    address public treasury;
    address public platformArbitrator;
    uint256 public platformFeePercent;
    uint256 public totalFeesCollected;
    IERC20 public immutable USDC;

    mapping(uint256 => Deal) private deals;
    mapping(uint256 => mapping(address => bool)) private cancelRequested;
    uint256 public dealCounter;

    event DealCreated(
        uint256 indexed dealId,
        address indexed partyA,
        address indexed partyB,
        DealType dealType,
        uint256 partyAAmount,
        uint256 partyBAmount,
        address arbitrator,
        uint256 expiryTimestamp
    );

    event Deposited(
        uint256 indexed dealId,
        address indexed party,
        uint256 amount
    );

    event VoteSubmitted(
        uint256 indexed dealId,
        address indexed party,
        Outcome outcome
    );

    event DealCompleted(
        uint256 indexed dealId,
        Outcome outcome,
        uint256 partyAPayout,
        uint256 partyBPayout,
        uint256 platformFee
    );

    event Disputed(
        uint256 indexed dealId,
        address indexed raisedBy,
        uint256 timestamp
    );

    event Resolved(
        uint256 indexed dealId,
        address indexed resolver,
        Outcome outcome,
        uint256 partyAPayout,
        uint256 partyBPayout
    );

    event Cancelled(
        uint256 indexed dealId,
        address indexed cancelledBy
    );

    event Expired(
        uint256 indexed dealId
    );

    event CancelRequested(
        uint256 indexed dealId,
        address indexed party
    );

    modifier onlyParty(uint256 _dealId) {
        Deal storage deal = deals[_dealId];
        if (msg.sender != deal.partyA && msg.sender != deal.partyB) {
            revert Escrow_OnlyParty();
        }
        _;
    }

    modifier onlyArbitratorOrAdmin(uint256 _dealId) {
        Deal storage deal = deals[_dealId];
        bool isPlatformArbitrator = msg.sender == platformArbitrator;

        bool isAdminFallback = msg.sender == platformAdmin && (
            block.timestamp >= deal.disputeTimestamp + ADMIN_TIMEOUT_PERIOD
        );

        if (!isPlatformArbitrator && !isAdminFallback) {
            revert Escrow_OnlyArbitrator();
        }
        _;
    }

    constructor(
        address _usdc,
        address _platformAdmin,
        address _treasury,
        address _platformArbitrator,
        uint256 _platformFeePercent
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _platformAdmin == address(0) || _treasury == address(0) || _platformArbitrator == address(0)) {
            revert Escrow_InvalidAddress();
        }
        if (_platformFeePercent > MAX_PLATFORM_FEE) {
            revert Escrow_InvalidFee();
        }

        USDC = IERC20(_usdc);
        platformAdmin = _platformAdmin;
        treasury = _treasury;
        platformArbitrator = _platformArbitrator;
        platformFeePercent = _platformFeePercent;

        _transferOwnership(_platformAdmin);
    }

    function createDeal(
        address _partyA,
        address _partyB,
        DealType _dealType,
        uint256 _partyAAmount,
        uint256 _partyBAmount,
        uint256 _feePercent,
        uint256 _expiryPeriod
    ) external whenNotPaused returns (uint256) {
        if (_partyA == address(0) || _partyB == address(0)) {
            revert Escrow_InvalidAddress();
        }
        if (_partyA == _partyB) {
            revert Escrow_InvalidAddress();
        }
        if (msg.sender != _partyA && msg.sender != _partyB) revert Escrow_OnlyParty();
        if (_partyAAmount == 0 && _partyBAmount == 0) {
            revert Escrow_InvalidAmount();
        }
        if (_feePercent > MAX_PLATFORM_FEE) {
            revert Escrow_InvalidFee();
        }

        uint256 dealId = dealCounter++;
        Deal storage deal = deals[dealId];

        deal.partyA = _partyA;
        deal.partyB = _partyB;
        deal.dealType = _dealType;
        deal.status = DealStatus.Active;
        deal.partyAAmount = _partyAAmount;
        deal.partyBAmount = _partyBAmount;
        deal.platformFeePercent = _feePercent == 0 ? platformFeePercent : _feePercent;
        deal.arbitrator = platformArbitrator;
        deal.createdAt = block.timestamp;
        deal.expiryTimestamp = block.timestamp + (_expiryPeriod == 0 ? DEFAULT_EXPIRY_PERIOD : _expiryPeriod);
        deal.partyAVote = Outcome.None;
        deal.partyBVote = Outcome.None;
        deal.partyADepositComplete = false;
        deal.partyBDepositComplete = false;

        emit DealCreated(
            dealId,
            _partyA,
            _partyB,
            _dealType,
            _partyAAmount,
            _partyBAmount,
            platformArbitrator,
            deal.expiryTimestamp
        );

        return dealId;
    }

    function deposit(uint256 _dealId, uint256 _amount) external nonReentrant whenNotPaused onlyParty(_dealId) {
        Deal storage deal = deals[_dealId];

        if (deal.status != DealStatus.Active) {
            revert Escrow_DealNotActive();
        }
        if (block.timestamp >= deal.expiryTimestamp) {
            revert Escrow_DealNotActive();
        }
        if (_amount == 0) {
            revert Escrow_InvalidAmount();
        }

        if (msg.sender == deal.partyA) {
            if (deal.partyADepositComplete) {
                revert Escrow_AlreadyDeposited();
            }
            if (_amount != deal.partyAAmount) {
                revert Escrow_InsufficientDeposit();
            }
            deal.partyADeposited += _amount;
            deal.partyADepositComplete = true;
        } else {
            if (deal.partyBDepositComplete) {
                revert Escrow_AlreadyDeposited();
            }
            if (_amount != deal.partyBAmount) {
                revert Escrow_InsufficientDeposit();
            }
            deal.partyBDeposited += _amount;
            deal.partyBDepositComplete = true;
        }

        USDC.safeTransferFrom(msg.sender, address(this), _amount);
        emit Deposited(_dealId, msg.sender, _amount);
    }

    function _hasCompletedRequiredDeposits(Deal storage deal) internal view returns (bool) {
        if (deal.dealType == DealType.OneSided && deal.partyBAmount == 0) {
            return deal.partyADepositComplete;
        }
        return deal.partyADepositComplete && deal.partyBDepositComplete;
    }

    function submitVote(uint256 _dealId, Outcome _outcome) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyParty(_dealId) 
    {
        Deal storage deal = deals[_dealId];

        if (deal.status != DealStatus.Active) {
            revert Escrow_DealNotActive();
        }
        if (block.timestamp >= deal.expiryTimestamp) {
            revert Escrow_DealNotActive();
        }
        if (!_hasCompletedRequiredDeposits(deal)) {
            revert Escrow_DepositsIncomplete();
        }
        if (_outcome == Outcome.None) {
            revert Escrow_InvalidResolution();
        }

        if (msg.sender == deal.partyA) {
            if (deal.partyAVote != Outcome.None) {
                revert Escrow_AlreadyVoted();
            }
            deal.partyAVote = _outcome;
        } else {
            if (deal.partyBVote != Outcome.None) {
                revert Escrow_AlreadyVoted();
            }
            deal.partyBVote = _outcome;
        }

        emit VoteSubmitted(_dealId, msg.sender, _outcome);

        bool bothVoted = deal.partyAVote != Outcome.None && deal.partyBVote != Outcome.None;
        bool oneSidedAutoComplete = deal.dealType == DealType.OneSided && 
            deal.partyBAmount == 0 && 
            deal.partyAVote != Outcome.None;

        if (oneSidedAutoComplete || bothVoted) {
            _handleVotingOutcome(_dealId);
        }
    }

    function raiseDispute(uint256 _dealId) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyParty(_dealId) 
    {
        Deal storage deal = deals[_dealId];

        if (deal.status != DealStatus.Active) {
            revert Escrow_DealNotActive();
        }
        if (block.timestamp >= deal.expiryTimestamp) {
            revert Escrow_DealNotActive();
        }
        if (!_hasCompletedRequiredDeposits(deal)) {
            revert Escrow_DepositsIncomplete();
        }
        if (block.timestamp < deal.createdAt + MIN_DISPUTE_PERIOD) {
            revert Escrow_CannotDisputeYet();
        }

        deal.status = DealStatus.Disputed;
        deal.disputeTimestamp = block.timestamp;

        emit Disputed(_dealId, msg.sender, block.timestamp);
    }

    function resolveDispute(uint256 _dealId, Outcome _outcome) 
        external 
        nonReentrant 
        onlyArbitratorOrAdmin(_dealId) 
    {
        Deal storage deal = deals[_dealId];

        if (deal.status != DealStatus.Disputed) {
            revert Escrow_DealAlreadyResolved();
        }
        if (_outcome == Outcome.None) {
            revert Escrow_InvalidResolution();
        }

        _distributeFunds(_dealId, _outcome);
    }

    function requestCancel(uint256 _dealId) external nonReentrant whenNotPaused onlyParty(_dealId) {
        Deal storage deal = deals[_dealId];

        if (deal.status != DealStatus.Active) {
            revert Escrow_DealNotActive();
        }
        if (block.timestamp >= deal.expiryTimestamp) revert Escrow_DealNotActive();
        if (cancelRequested[_dealId][msg.sender]) {
            revert Escrow_CancelAlreadyRequested();
        }

        cancelRequested[_dealId][msg.sender] = true;
        emit CancelRequested(_dealId, msg.sender);

        if (cancelRequested[_dealId][deal.partyA] && cancelRequested[_dealId][deal.partyB]) {
            _executeCancel(_dealId);
        }
    }

    function expireDeal(uint256 _dealId) external nonReentrant {
        Deal storage deal = deals[_dealId];

        bool isExpiredActive = deal.status == DealStatus.Active
            && block.timestamp >= deal.expiryTimestamp;

        bool isAbandonedDispute = deal.status == DealStatus.Disputed
            && block.timestamp >= deal.disputeTimestamp + ADMIN_TIMEOUT_PERIOD + 7 days;

        if (!isExpiredActive && !isAbandonedDispute) {
            revert Escrow_DealNotExpired();
        }

        _refundDeposits(_dealId);
        deal.status = DealStatus.Expired;
        emit Expired(_dealId);
    }

    function getDeal(uint256 _dealId) 
        external 
        view 
        returns (
            address _partyA,
            address _partyB,
            DealType _dealType,
            DealStatus _status,
            uint256 _partyAAmount,
            uint256 _partyBAmount,
            uint256 _partyADeposited,
            uint256 _partyBDeposited,
            uint256 _feePercent,
            address _arbitrator,
            uint256 _createdAt
        ) 
    {
        Deal storage deal = deals[_dealId];
        return (
            deal.partyA,
            deal.partyB,
            deal.dealType,
            deal.status,
            deal.partyAAmount,
            deal.partyBAmount,
            deal.partyADeposited,
            deal.partyBDeposited,
            deal.platformFeePercent,
            deal.arbitrator,
            deal.createdAt
        );
    }

    function getDealExpiry(uint256 _dealId) 
        external 
        view 
        returns (uint256 _expiryTimestamp) 
    {
        Deal storage deal = deals[_dealId];
        return deal.expiryTimestamp;
    }

    function getDealVotes(uint256 _dealId) 
        external 
        view 
        returns (
            Outcome _partyAVote,
            Outcome _partyBVote,
            uint256 _disputeTimestamp
        ) 
    {
        Deal storage deal = deals[_dealId];
        return (
            deal.partyAVote,
            deal.partyBVote,
            deal.disputeTimestamp
        );
    }

    function hasDeposited(uint256 _dealId, address _party) external view returns (bool) {
        Deal storage deal = deals[_dealId];
        if (_party == deal.partyA) {
            return deal.partyADepositComplete;
        } else if (_party == deal.partyB) {
            return deal.partyBDepositComplete;
        }
        return false;
    }

    function hasRequestedCancel(uint256 _dealId, address _party) external view returns (bool) {
        return cancelRequested[_dealId][_party];
    }

    function setPlatformFee(uint256 _newFee) external onlyOwner {
        if (_newFee > MAX_PLATFORM_FEE) {
            revert Escrow_InvalidFee();
        }
        platformFeePercent = _newFee;
    }

    function setPlatformAdmin(address _newAdmin) external onlyOwner {
        if (_newAdmin == address(0)) {
            revert Escrow_InvalidAddress();
        }
        platformAdmin = _newAdmin;
    }

    function setPlatformArbitrator(address _newArbitrator) external onlyOwner {
        if (_newArbitrator == address(0)) {
            revert Escrow_InvalidAddress();
        }
        platformArbitrator = _newArbitrator;
    }

    function setTreasury(address _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) {
            revert Escrow_InvalidAddress();
        }
        treasury = _newTreasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _refundDeposits(uint256 _dealId) internal {
        Deal storage deal = deals[_dealId];
        uint256 aRefund = deal.partyADeposited;
        uint256 bRefund = deal.partyBDeposited;
        deal.partyADeposited = 0;
        deal.partyBDeposited = 0;
        if (aRefund > 0) USDC.safeTransfer(deal.partyA, aRefund);
        if (bRefund > 0) USDC.safeTransfer(deal.partyB, bRefund);
    }

    function _executeCancel(uint256 _dealId) internal {
        Deal storage deal = deals[_dealId];
        _refundDeposits(_dealId);
        deal.status = DealStatus.Cancelled;
        emit Cancelled(_dealId, msg.sender);
    }

    function _handleVotingOutcome(uint256 _dealId) internal {
        Deal storage deal = deals[_dealId];

        bool oneSidedComplete = deal.dealType == DealType.OneSided && 
            deal.partyBAmount == 0;

        if (oneSidedComplete) {
            _distributeFunds(_dealId, deal.partyAVote);
        } else if (deal.partyAVote == deal.partyBVote) {
            _distributeFunds(_dealId, deal.partyAVote);
        } else {
            deal.status = DealStatus.Disputed;
            deal.disputeTimestamp = block.timestamp;
            emit Disputed(_dealId, address(0), block.timestamp);
        }
    }

    function _distributeFunds(uint256 _dealId, Outcome _outcome) internal {
        Deal storage deal = deals[_dealId];

        uint256 totalDeposited = deal.partyADeposited + deal.partyBDeposited;
        uint256 platformFee = (totalDeposited * deal.platformFeePercent) / BASIS_POINTS;
        
        if (platformFee > totalDeposited) {
            revert Escrow_FeeExceedsAmount();
        }

        uint256 distributable = totalDeposited - platformFee;
        uint256 partyAPayout;
        uint256 partyBPayout;
        uint256 disputeFee;

        bool isDisputed = deal.disputeTimestamp > 0;

        if (_outcome == Outcome.PartyAWins) {
            partyAPayout = distributable;
            if (isDisputed) {
                disputeFee = (distributable * DISPUTE_FEE_PERCENT) / BASIS_POINTS;
                partyAPayout -= disputeFee;
            }
        } else if (_outcome == Outcome.PartyBWins) {
            partyBPayout = distributable;
            if (isDisputed) {
                disputeFee = (distributable * DISPUTE_FEE_PERCENT) / BASIS_POINTS;
                partyBPayout -= disputeFee;
            }
        } else if (_outcome == Outcome.Split) {
            partyAPayout = (deal.partyADeposited * (BASIS_POINTS - deal.platformFeePercent)) / BASIS_POINTS;
            partyBPayout = distributable - partyAPayout;
        }

        deal.partyADeposited = 0;
        deal.partyBDeposited = 0;

        if (partyAPayout > 0) {
            USDC.safeTransfer(deal.partyA, partyAPayout);
        }
        if (partyBPayout > 0) {
            USDC.safeTransfer(deal.partyB, partyBPayout);
        }
        if (platformFee > 0) {
            USDC.safeTransfer(treasury, platformFee);
            totalFeesCollected += platformFee;
        }
        if (disputeFee > 0) {
            USDC.safeTransfer(treasury, disputeFee);
            totalFeesCollected += disputeFee;
        }

        deal.status = DealStatus.Resolved;

        emit Resolved(_dealId, msg.sender, _outcome, partyAPayout, partyBPayout);
        emit DealCompleted(_dealId, _outcome, partyAPayout, partyBPayout, platformFee + disputeFee);
    }
}

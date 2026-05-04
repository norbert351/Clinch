// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Escrow} from "../src/Escrow.sol";
import {DealType, DealStatus, Outcome} from "../src/Types.sol";

contract MockUSDC {
    uint8 public decimals = 6;
    string public name = "USD Coin";
    string public symbol = "USDC";

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        if (allowed != type(uint256).max) {
            _allowances[from][msg.sender] = allowed - amount;
        }
        require(_balances[from] >= amount, "insufficient balance");
        _balances[from] -= amount;
        _balances[to] += amount;
        return true;
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }
}

contract EscrowTest is Test {
    Escrow public escrow;
    MockUSDC public usdc;

    address public partyA = address(0x1);
    address public partyB = address(0x2);
    address public platformArbitrator = address(0x3);
    address public platformAdmin = address(0x4);
    address public treasury = address(0x5);
    address public stranger = address(0x6);

    uint256 public constant PLATFORM_FEE = 100;
    uint256 public constant DEPOSIT_AMOUNT = 1000e6;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new Escrow(
            address(usdc),
            platformAdmin,
            treasury,
            platformArbitrator,
            PLATFORM_FEE
        );

        usdc.mint(partyA, 10000e6);
        usdc.mint(partyB, 10000e6);
        usdc.mint(stranger, 10000e6);

        vm.prank(partyA);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(partyB);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_CreateMutualStakeDeal() public {
        vm.prank(partyA);
        uint256 dealId = escrow.createDeal(
            partyA,
            partyB,
            DealType.MutualStake,
            DEPOSIT_AMOUNT,
            DEPOSIT_AMOUNT,
            PLATFORM_FEE,
            0
        );

        (
            address _partyA,
            address _partyB,
            DealType _dealType,
            DealStatus _status,
            uint256 _partyAAmount,
            uint256 _partyBAmount,
            ,
            ,
            ,
            address _arbitrator,
            
        ) = escrow.getDeal(dealId);

        assertEq(_partyA, partyA);
        assertEq(_partyB, partyB);
        assertEq(uint256(_dealType), uint256(DealType.MutualStake));
        assertEq(uint256(_status), uint256(DealStatus.Active));
        assertEq(_partyAAmount, DEPOSIT_AMOUNT);
        assertEq(_partyBAmount, DEPOSIT_AMOUNT);
        assertEq(_arbitrator, platformArbitrator);
    }

    function test_CreateOneSidedDeal() public {
        vm.prank(partyA);
        uint256 dealId = escrow.createDeal(
            partyA,
            partyB,
            DealType.OneSided,
            DEPOSIT_AMOUNT,
            0,
            PLATFORM_FEE,
            0
        );

        (, , DealType _dealType, , uint256 _partyAAmount, uint256 _partyBAmount, , , , , ) = escrow.getDeal(dealId);

        assertEq(uint256(_dealType), uint256(DealType.OneSided));
        assertEq(_partyAAmount, DEPOSIT_AMOUNT);
        assertEq(_partyBAmount, 0);
    }

    function test_CreateDealAlwaysUsesPlatformArbitrator() public {
        vm.prank(partyA);
        uint256 dealId = escrow.createDeal(
            partyA,
            partyB,
            DealType.MutualStake,
            DEPOSIT_AMOUNT,
            DEPOSIT_AMOUNT,
            PLATFORM_FEE,
            0
        );

        (, , , , , , , , , address _arbitrator, ) = escrow.getDeal(dealId);
        assertEq(_arbitrator, platformArbitrator);
    }

    function test_RevertCreateDealInvalidParty() public {
        vm.expectRevert(abi.encodeWithSignature("Escrow_InvalidAddress()"));
        escrow.createDeal(
            address(0),
            partyB,
            DealType.MutualStake,
            DEPOSIT_AMOUNT,
            DEPOSIT_AMOUNT,
            PLATFORM_FEE,
            0
        );
    }

    function test_DepositPartyA() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(partyA);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        (, , , , , , uint256 _partyADeposited, , , , ) = escrow.getDeal(dealId);
        assertEq(_partyADeposited, DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT_AMOUNT);
        assertTrue(escrow.hasDeposited(dealId, partyA));
    }

    function test_DepositPartyB() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(partyB);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        (, , , , , , , uint256 _partyBDeposited, , , ) = escrow.getDeal(dealId);
        assertEq(_partyBDeposited, DEPOSIT_AMOUNT);
        assertTrue(escrow.hasDeposited(dealId, partyB));
    }

    function test_RevertDoubleDeposit() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(partyA);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_AlreadyDeposited()"));
        escrow.deposit(dealId, DEPOSIT_AMOUNT);
    }

    function test_RevertDepositWrongAmount() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_InsufficientDeposit()"));
        escrow.deposit(dealId, DEPOSIT_AMOUNT - 1);
    }

    function test_RevertDepositByStranger() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("Escrow_OnlyParty()"));
        escrow.deposit(dealId, DEPOSIT_AMOUNT);
    }

    function test_RevertVoteWithoutDeposit() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_DepositsIncomplete()"));
        escrow.submitVote(dealId, Outcome.PartyAWins);
    }

    function test_RevertDisputeWithoutDeposit() public {
        uint256 dealId = _createActiveDeal();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_DepositsIncomplete()"));
        escrow.raiseDispute(dealId);
    }

    function test_VoteAgree() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        (Outcome _partyAVote, , ) = escrow.getDealVotes(dealId);
        
        assertEq(uint256(_status), uint256(DealStatus.Active));
        assertEq(uint256(_partyAVote), uint256(Outcome.PartyAWins));
    }

    function test_VoteBothAgreeSameOutcome() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        vm.prank(partyB);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        
        assertEq(uint256(_status), uint256(DealStatus.Resolved));
    }

    function test_VoteDisagreementTriggersDispute() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        vm.prank(partyB);
        escrow.submitVote(dealId, Outcome.PartyBWins);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        (, , uint256 _disputeTimestamp) = escrow.getDealVotes(dealId);
        
        assertEq(uint256(_status), uint256(DealStatus.Disputed));
        assertEq(_disputeTimestamp, block.timestamp);
    }

    function test_RevertVoteTwice() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_AlreadyVoted()"));
        escrow.submitVote(dealId, Outcome.PartyAWins);
    }

    function test_RevertVoteInvalidOutcome() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_InvalidResolution()"));
        escrow.submitVote(dealId, Outcome.None);
    }

    function test_RaiseDispute() public {
        uint256 dealId = _createDealWithDeposits();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        assertEq(uint256(_status), uint256(DealStatus.Disputed));
    }

    function test_RevertDisputeTooEarly() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        vm.expectRevert(abi.encodeWithSignature("Escrow_CannotDisputeYet()"));
        escrow.raiseDispute(dealId);
    }

    function test_ResolveByPlatformArbitrator() public {
        uint256 dealId = _createDealWithDeposits();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        vm.prank(platformArbitrator);
        escrow.resolveDispute(dealId, Outcome.PartyAWins);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        assertEq(uint256(_status), uint256(DealStatus.Resolved));
    }

    function test_RevertResolveByNonArbitrator() public {
        uint256 dealId = _createDealWithDeposits();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("Escrow_OnlyArbitrator()"));
        escrow.resolveDispute(dealId, Outcome.PartyAWins);
    }

    function test_ResolveByAdminAfterTimeout() public {
        vm.prank(partyA);
        uint256 dealId = escrow.createDeal(
            partyA,
            partyB,
            DealType.OneSided,
            DEPOSIT_AMOUNT,
            0,
            PLATFORM_FEE,
            0
        );

        vm.prank(partyA);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        vm.warp(block.timestamp + 24 hours + 1);

        vm.prank(platformAdmin);
        escrow.resolveDispute(dealId, Outcome.PartyAWins);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        assertEq(uint256(_status), uint256(DealStatus.Resolved));
    }

    function test_RevertAdminResolveBeforeTimeout() public {
        uint256 dealId = _createDealWithDeposits();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        vm.prank(platformAdmin);
        vm.expectRevert(abi.encodeWithSignature("Escrow_OnlyArbitrator()"));
        escrow.resolveDispute(dealId, Outcome.PartyAWins);
    }

    function test_RevertResolveByStranger() public {
        uint256 dealId = _createDealWithDeposits();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("Escrow_OnlyArbitrator()"));
        escrow.resolveDispute(dealId, Outcome.PartyAWins);
    }

    function test_RequestCancelBothAgree() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        escrow.requestCancel(dealId);
        assertTrue(escrow.hasRequestedCancel(dealId, partyA));

        vm.prank(partyB);
        escrow.requestCancel(dealId);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        
        assertEq(uint256(_status), uint256(DealStatus.Cancelled));
        assertEq(usdc.balanceOf(partyA), 10000e6);
    }

    function test_RevertCancelByStranger() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("Escrow_OnlyParty()"));
        escrow.requestCancel(dealId);
    }

    function test_OneSidedAutoRelease() public {
        vm.prank(partyA);
        uint256 dealId = escrow.createDeal(
            partyA,
            partyB,
            DealType.OneSided,
            DEPOSIT_AMOUNT,
            0,
            PLATFORM_FEE,
            0
        );

        vm.prank(partyA);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        vm.prank(partyA);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        
        assertEq(uint256(_status), uint256(DealStatus.Resolved));
    }

    function test_PauseUnpause() public {
        uint256 dealId = _createActiveDeal();

        vm.prank(platformAdmin);
        escrow.pause();

        vm.prank(partyA);
        vm.expectRevert();
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        vm.prank(platformAdmin);
        escrow.unpause();

        vm.prank(partyA);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT_AMOUNT);
    }

    function test_PlatformFeeCollection() public {
        uint256 dealId = _createDealWithDeposits();

        vm.prank(partyA);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        vm.prank(partyB);
        escrow.submitVote(dealId, Outcome.PartyAWins);

        uint256 treasuryBalance = usdc.balanceOf(treasury);
        assertTrue(treasuryBalance > 0);
    }

    function test_DisputeFeeDeductedFromWinner() public {
        uint256 dealId = _createDealWithDeposits();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(partyA);
        escrow.raiseDispute(dealId);

        uint256 balanceBefore = usdc.balanceOf(partyA);

        vm.prank(platformArbitrator);
        escrow.resolveDispute(dealId, Outcome.PartyAWins);

        uint256 balanceAfter = usdc.balanceOf(partyA);
        uint256 received = balanceAfter - balanceBefore;

        uint256 totalDeposited = DEPOSIT_AMOUNT * 2;
        uint256 platformFee = (totalDeposited * PLATFORM_FEE) / 10000;
        uint256 distributable = totalDeposited - platformFee;
        uint256 disputeFee = (distributable * 200) / 10000;
        uint256 expectedPayout = distributable - disputeFee;

        assertEq(received, expectedPayout);
    }

    function test_ExpireDeal() public {
        uint256 dealId = _createActiveDeal();

        vm.warp(block.timestamp + 30 days + 1);

        escrow.expireDeal(dealId);

        (, , , DealStatus _status, , , , , , , ) = escrow.getDeal(dealId);
        assertEq(uint256(_status), uint256(DealStatus.Expired));
    }

    function test_RevertExpireNotYet() public {
        uint256 dealId = _createActiveDeal();

        vm.expectRevert(abi.encodeWithSignature("Escrow_DealNotExpired()"));
        escrow.expireDeal(dealId);
    }

    function test_SetPlatformArbitrator() public {
        address newArbitrator = address(0x7);
        
        vm.prank(platformAdmin);
        escrow.setPlatformArbitrator(newArbitrator);
        
        assertEq(escrow.platformArbitrator(), newArbitrator);
    }

    function test_RevertSetPlatformArbitratorZeroAddress() public {
        vm.prank(platformAdmin);
        vm.expectRevert(abi.encodeWithSignature("Escrow_InvalidAddress()"));
        escrow.setPlatformArbitrator(address(0));
    }

    function test_NewDealUsesUpdatedPlatformArbitrator() public {
        address newArbitrator = address(0x7);
        
        vm.prank(platformAdmin);
        escrow.setPlatformArbitrator(newArbitrator);

        vm.prank(partyA);
        uint256 dealId = escrow.createDeal(
            partyA,
            partyB,
            DealType.MutualStake,
            DEPOSIT_AMOUNT,
            DEPOSIT_AMOUNT,
            PLATFORM_FEE,
            0
        );

        (, , , , , , , , , address _arbitrator, ) = escrow.getDeal(dealId);
        assertEq(_arbitrator, newArbitrator);
    }

    function _createActiveDeal() internal returns (uint256) {
        vm.prank(partyA);
        return escrow.createDeal(
            partyA,
            partyB,
            DealType.MutualStake,
            DEPOSIT_AMOUNT,
            DEPOSIT_AMOUNT,
            PLATFORM_FEE,
            0
        );
    }

    function _createDealWithDeposits() internal returns (uint256) {
        uint256 dealId = _createActiveDeal();

        vm.prank(partyA);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        vm.prank(partyB);
        escrow.deposit(dealId, DEPOSIT_AMOUNT);

        return dealId;
    }
}

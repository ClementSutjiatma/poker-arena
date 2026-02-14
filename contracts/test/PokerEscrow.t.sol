// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PokerEscrow.sol";

/// @dev Minimal ERC-20 mock for testing.
contract MockERC20 is IERC20 {
    string public name = "AlphaUSD";
    string public symbol = "aUSD";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract PokerEscrowTest is Test {
    PokerEscrow escrow;
    MockERC20 token;

    address owner = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);

    bytes32 tableId = keccak256("micro");

    // 6-decimal amounts (like aUSD)
    uint256 constant MIN_BUY_IN = 40_000000;   // 40 aUSD
    uint256 constant MAX_BUY_IN = 200_000000;  // 200 aUSD
    uint256 constant FUND_AMOUNT = 1_000_000_000000; // 1M aUSD

    function setUp() public {
        token = new MockERC20();
        escrow = new PokerEscrow(address(token), owner);

        // Create table
        vm.prank(owner);
        escrow.createTable(tableId, MIN_BUY_IN, MAX_BUY_IN);

        // Fund players
        token.mint(alice, FUND_AMOUNT);
        token.mint(bob, FUND_AMOUNT);
        token.mint(carol, FUND_AMOUNT);
    }

    // ----------------------------------------------------------------
    // Table creation
    // ----------------------------------------------------------------

    function test_createTable() public view {
        (uint256 min, uint256 max, bool exists, uint256 playerCount) = escrow.getTable(tableId);
        assertEq(min, MIN_BUY_IN);
        assertEq(max, MAX_BUY_IN);
        assertTrue(exists);
        assertEq(playerCount, 0);
    }

    function test_createTable_duplicate_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.TableAlreadyExists.selector);
        escrow.createTable(tableId, MIN_BUY_IN, MAX_BUY_IN);
    }

    function test_createTable_notOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.createTable(keccak256("other"), MIN_BUY_IN, MAX_BUY_IN);
    }

    function test_createTable_invalidRange_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.InvalidBuyInRange.selector);
        escrow.createTable(keccak256("bad"), MAX_BUY_IN, MIN_BUY_IN); // min > max
    }

    // ----------------------------------------------------------------
    // Deposit
    // ----------------------------------------------------------------

    function test_deposit_minBuyIn() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MIN_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN);
        vm.stopPrank();

        assertEq(escrow.getPlayerBalance(tableId, alice), MIN_BUY_IN);
        assertEq(token.balanceOf(address(escrow)), MIN_BUY_IN);
    }

    function test_deposit_maxBuyIn() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MAX_BUY_IN);
        vm.stopPrank();

        assertEq(escrow.getPlayerBalance(tableId, alice), MAX_BUY_IN);
    }

    function test_deposit_belowMin_reverts() public {
        uint256 tooLow = MIN_BUY_IN - 1;
        vm.startPrank(alice);
        token.approve(address(escrow), tooLow);
        vm.expectRevert(PokerEscrow.AmountBelowMinBuyIn.selector);
        escrow.deposit(tableId, tooLow);
        vm.stopPrank();
    }

    function test_deposit_aboveMax_reverts() public {
        uint256 tooHigh = MAX_BUY_IN + 1;
        vm.startPrank(alice);
        token.approve(address(escrow), tooHigh);
        vm.expectRevert(PokerEscrow.AmountAboveMaxBuyIn.selector);
        escrow.deposit(tableId, tooHigh);
        vm.stopPrank();
    }

    function test_deposit_withoutApproval_reverts() public {
        vm.prank(alice);
        vm.expectRevert(); // ERC20 transferFrom will revert
        escrow.deposit(tableId, MIN_BUY_IN);
    }

    function test_deposit_doubleDeposit_reverts() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN * 2);
        escrow.deposit(tableId, MIN_BUY_IN);
        vm.expectRevert(PokerEscrow.AlreadySeated.selector);
        escrow.deposit(tableId, MIN_BUY_IN);
        vm.stopPrank();
    }

    function test_deposit_nonExistentTable_reverts() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MIN_BUY_IN);
        vm.expectRevert(PokerEscrow.TableDoesNotExist.selector);
        escrow.deposit(keccak256("nonexistent"), MIN_BUY_IN);
        vm.stopPrank();
    }

    function test_deposit_zeroAmount_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PokerEscrow.ZeroAmount.selector);
        escrow.deposit(tableId, 0);
    }

    // ----------------------------------------------------------------
    // Rebuy
    // ----------------------------------------------------------------

    function test_rebuy() public {
        // Deposit first
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN);

        // Rebuy
        uint256 rebuyAmount = 50_000000; // 50 aUSD
        escrow.rebuy(tableId, rebuyAmount);
        vm.stopPrank();

        assertEq(escrow.getPlayerBalance(tableId, alice), MIN_BUY_IN + rebuyAmount);
    }

    function test_rebuy_exceedsMax_reverts() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN * 2);
        escrow.deposit(tableId, MAX_BUY_IN);

        vm.expectRevert(PokerEscrow.AmountAboveMaxBuyIn.selector);
        escrow.rebuy(tableId, 1); // even 1 wei over max
        vm.stopPrank();
    }

    function test_rebuy_notSeated_reverts() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MIN_BUY_IN);
        vm.expectRevert(PokerEscrow.NotSeated.selector);
        escrow.rebuy(tableId, MIN_BUY_IN);
        vm.stopPrank();
    }

    // ----------------------------------------------------------------
    // Settlement
    // ----------------------------------------------------------------

    function test_settle_winner() public {
        // Alice and Bob deposit
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        uint256 aliceBalanceBefore = token.balanceOf(alice);

        // Alice wins everything (200 aUSD total in escrow)
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 200_000000);

        assertEq(token.balanceOf(alice), aliceBalanceBefore + 200_000000);

        // Alice is no longer seated
        (,, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertFalse(isSeated);
    }

    function test_settle_loser_zeroStack() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        uint256 bobBalanceBefore = token.balanceOf(bob);

        // Bob lost everything
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, bob, 0);

        assertEq(token.balanceOf(bob), bobBalanceBefore); // no change
        (,, bool isSeated) = escrow.getPlayerSeat(tableId, bob);
        assertFalse(isSeated);
    }

    function test_settle_notOwner_reverts() public {
        _depositPlayer(alice, 100_000000);

        vm.prank(alice);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);
    }

    function test_settle_notSeated_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.NotSeated.selector);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);
    }

    function test_settle_exceedsContractBalance_reverts() public {
        _depositPlayer(alice, 100_000000);

        // Try to settle more than contract holds
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.SettlementExceedsBalance.selector);
        escrow.settleAndWithdraw(tableId, alice, 200_000000);
    }

    // ----------------------------------------------------------------
    // Batch settlement
    // ----------------------------------------------------------------

    function test_batchSettle() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);
        _depositPlayer(carol, 100_000000);
        // Total in escrow: 300 aUSD

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 carolBefore = token.balanceOf(carol);

        address[] memory players = new address[](3);
        players[0] = alice;
        players[1] = bob;
        players[2] = carol;

        uint256[] memory stacks = new uint256[](3);
        stacks[0] = 200_000000; // Alice won 100 from others
        stacks[1] = 50_000000;  // Bob lost 50
        stacks[2] = 50_000000;  // Carol lost 50

        vm.prank(owner);
        escrow.batchSettle(tableId, players, stacks);

        assertEq(token.balanceOf(alice), aliceBefore + 200_000000);
        assertEq(token.balanceOf(bob), bobBefore + 50_000000);
        assertEq(token.balanceOf(carol), carolBefore + 50_000000);
    }

    function test_batchSettle_lengthMismatch_reverts() public {
        address[] memory players = new address[](2);
        uint256[] memory stacks = new uint256[](1);

        vm.prank(owner);
        vm.expectRevert(PokerEscrow.LengthMismatch.selector);
        escrow.batchSettle(tableId, players, stacks);
    }

    // ----------------------------------------------------------------
    // Emergency refund
    // ----------------------------------------------------------------

    function test_emergencyRefund() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 80_000000);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        vm.prank(owner);
        escrow.emergencyRefund(tableId);

        // Both get their deposits back
        assertEq(token.balanceOf(alice), aliceBefore + 100_000000);
        assertEq(token.balanceOf(bob), bobBefore + 80_000000);

        // Both are no longer seated
        (,, bool aliceSeated) = escrow.getPlayerSeat(tableId, alice);
        (,, bool bobSeated) = escrow.getPlayerSeat(tableId, bob);
        assertFalse(aliceSeated);
        assertFalse(bobSeated);
    }

    // ----------------------------------------------------------------
    // View functions
    // ----------------------------------------------------------------

    function test_getPlayerSeat() public {
        _depositPlayer(alice, 100_000000);

        (uint256 balance, uint256 totalDeposited, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertEq(balance, 100_000000);
        assertEq(totalDeposited, 100_000000);
        assertTrue(isSeated);
    }

    function test_getTablePlayers() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 2);
    }

    // ----------------------------------------------------------------
    // Ownership
    // ----------------------------------------------------------------

    function test_transferOwnership() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);
        assertEq(escrow.owner(), alice);
    }

    function test_transferOwnership_notOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.transferOwnership(alice);
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.ZeroAddress.selector);
        escrow.transferOwnership(address(0));
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    function _depositPlayer(address player, uint256 amount) internal {
        vm.startPrank(player);
        token.approve(address(escrow), amount);
        escrow.deposit(tableId, amount);
        vm.stopPrank();
    }
}

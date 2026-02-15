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
    address dave = address(0xDA7E);

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
        token.mint(dave, FUND_AMOUNT);
    }

    // ================================================================
    // Constructor
    // ================================================================

    function test_constructor_setsOwnerAndToken() public view {
        assertEq(escrow.owner(), owner);
        assertEq(address(escrow.token()), address(token));
    }

    function test_constructor_zeroToken_reverts() public {
        vm.expectRevert(PokerEscrow.ZeroAddress.selector);
        new PokerEscrow(address(0), owner);
    }

    function test_constructor_zeroOwner_reverts() public {
        vm.expectRevert(PokerEscrow.ZeroAddress.selector);
        new PokerEscrow(address(token), address(0));
    }

    function test_constructor_bothZero_reverts() public {
        vm.expectRevert(PokerEscrow.ZeroAddress.selector);
        new PokerEscrow(address(0), address(0));
    }

    // ================================================================
    // Table creation
    // ================================================================

    function test_createTable() public view {
        (uint256 min, uint256 max, bool exists, uint256 playerCount) = escrow.getTable(tableId);
        assertEq(min, MIN_BUY_IN);
        assertEq(max, MAX_BUY_IN);
        assertTrue(exists);
        assertEq(playerCount, 0);
    }

    function test_createTable_emitsEvent() public {
        bytes32 newId = keccak256("new-table");
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit PokerEscrow.TableCreated(newId, 100_000000, 500_000000);
        escrow.createTable(newId, 100_000000, 500_000000);
    }

    function test_createTable_equalMinMax() public {
        bytes32 eqId = keccak256("equal");
        vm.prank(owner);
        escrow.createTable(eqId, 100_000000, 100_000000);
        (uint256 min, uint256 max, bool exists,) = escrow.getTable(eqId);
        assertEq(min, max);
        assertTrue(exists);
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

    function test_createTable_invalidRange_minGreaterThanMax_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.InvalidBuyInRange.selector);
        escrow.createTable(keccak256("bad"), MAX_BUY_IN, MIN_BUY_IN);
    }

    function test_createTable_zeroMin_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.InvalidBuyInRange.selector);
        escrow.createTable(keccak256("zmin"), 0, MAX_BUY_IN);
    }

    function test_createTable_zeroMax_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.InvalidBuyInRange.selector);
        escrow.createTable(keccak256("zmax"), MIN_BUY_IN, 0);
    }

    function test_createTable_bothZero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.InvalidBuyInRange.selector);
        escrow.createTable(keccak256("zz"), 0, 0);
    }

    // ================================================================
    // Deposit
    // ================================================================

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

    function test_deposit_emitsEvent() public {
        vm.startPrank(alice);
        token.approve(address(escrow), 100_000000);
        vm.expectEmit(true, true, false, true);
        emit PokerEscrow.Deposited(tableId, alice, 100_000000);
        escrow.deposit(tableId, 100_000000);
        vm.stopPrank();
    }

    function test_deposit_transfersTokens() public {
        uint256 aliceBefore = token.balanceOf(alice);
        _depositPlayer(alice, 100_000000);
        assertEq(token.balanceOf(alice), aliceBefore - 100_000000);
        assertEq(token.balanceOf(address(escrow)), 100_000000);
    }

    function test_deposit_setsPlayerSeat() public {
        _depositPlayer(alice, 100_000000);
        (uint256 balance, uint256 totalDeposited, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertEq(balance, 100_000000);
        assertEq(totalDeposited, 100_000000);
        assertTrue(isSeated);
    }

    function test_deposit_addsToPlayerList() public {
        _depositPlayer(alice, 100_000000);
        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 1);
        assertEq(players[0], alice);
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

    // ================================================================
    // Rebuy
    // ================================================================

    function test_rebuy() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN);
        uint256 rebuyAmount = 50_000000;
        escrow.rebuy(tableId, rebuyAmount);
        vm.stopPrank();

        assertEq(escrow.getPlayerBalance(tableId, alice), MIN_BUY_IN + rebuyAmount);
    }

    function test_rebuy_emitsEvent() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN);
        vm.expectEmit(true, true, false, true);
        emit PokerEscrow.Rebought(tableId, alice, 50_000000);
        escrow.rebuy(tableId, 50_000000);
        vm.stopPrank();
    }

    function test_rebuy_tracksTotalDeposited() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN);
        escrow.rebuy(tableId, 50_000000);
        vm.stopPrank();

        (, uint256 totalDeposited,) = escrow.getPlayerSeat(tableId, alice);
        assertEq(totalDeposited, MIN_BUY_IN + 50_000000);
    }

    function test_rebuy_multipleRebuys() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN); // 40
        escrow.rebuy(tableId, 50_000000);     // +50 = 90
        escrow.rebuy(tableId, 50_000000);     // +50 = 140
        vm.stopPrank();

        assertEq(escrow.getPlayerBalance(tableId, alice), 140_000000);
        (, uint256 totalDeposited,) = escrow.getPlayerSeat(tableId, alice);
        assertEq(totalDeposited, 140_000000);
    }

    function test_rebuy_upToMax() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN);
        escrow.deposit(tableId, MIN_BUY_IN);
        // Rebuy to fill up to max
        escrow.rebuy(tableId, MAX_BUY_IN - MIN_BUY_IN);
        vm.stopPrank();

        assertEq(escrow.getPlayerBalance(tableId, alice), MAX_BUY_IN);
    }

    function test_rebuy_exceedsMax_reverts() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MAX_BUY_IN * 2);
        escrow.deposit(tableId, MAX_BUY_IN);
        vm.expectRevert(PokerEscrow.AmountAboveMaxBuyIn.selector);
        escrow.rebuy(tableId, 1);
        vm.stopPrank();
    }

    function test_rebuy_notSeated_reverts() public {
        vm.startPrank(alice);
        token.approve(address(escrow), MIN_BUY_IN);
        vm.expectRevert(PokerEscrow.NotSeated.selector);
        escrow.rebuy(tableId, MIN_BUY_IN);
        vm.stopPrank();
    }

    function test_rebuy_zeroAmount_reverts() public {
        _depositPlayer(alice, 100_000000);
        vm.prank(alice);
        vm.expectRevert(PokerEscrow.ZeroAmount.selector);
        escrow.rebuy(tableId, 0);
    }

    function test_rebuy_nonExistentTable_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PokerEscrow.TableDoesNotExist.selector);
        escrow.rebuy(keccak256("nonexistent"), 50_000000);
    }

    // ================================================================
    // Settlement (settleAndWithdraw)
    // ================================================================

    function test_settle_winner() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        uint256 aliceBalanceBefore = token.balanceOf(alice);

        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 200_000000);

        assertEq(token.balanceOf(alice), aliceBalanceBefore + 200_000000);
        (,, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertFalse(isSeated);
    }

    function test_settle_loser_zeroStack() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        uint256 bobBalanceBefore = token.balanceOf(bob);

        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, bob, 0);

        assertEq(token.balanceOf(bob), bobBalanceBefore); // no payout
        (,, bool isSeated) = escrow.getPlayerSeat(tableId, bob);
        assertFalse(isSeated);
    }

    function test_settle_emitsEvent() public {
        _depositPlayer(alice, 100_000000);

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit PokerEscrow.Settled(tableId, alice, 80_000000);
        escrow.settleAndWithdraw(tableId, alice, 80_000000);
    }

    function test_settle_removesFromPlayerList() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 1);
        assertEq(players[0], bob);
    }

    function test_settle_lastPlayer_emptyList() public {
        _depositPlayer(alice, 100_000000);

        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 0);
    }

    function test_settle_clearsBalanceAndSeat() public {
        _depositPlayer(alice, 100_000000);

        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 50_000000);

        (uint256 balance,, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertEq(balance, 0);
        assertFalse(isSeated);
    }

    function test_settle_playerCanRedepositAfter() public {
        _depositPlayer(alice, 100_000000);

        // Settle alice
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);

        // Alice re-deposits
        _depositPlayer(alice, 100_000000);
        assertEq(escrow.getPlayerBalance(tableId, alice), 100_000000);
        (,, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertTrue(isSeated);
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

        vm.prank(owner);
        vm.expectRevert(PokerEscrow.SettlementExceedsBalance.selector);
        escrow.settleAndWithdraw(tableId, alice, 200_000000);
    }

    function test_settle_nonExistentTable_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.TableDoesNotExist.selector);
        escrow.settleAndWithdraw(keccak256("nonexistent"), alice, 0);
    }

    // ================================================================
    // Batch settlement
    // ================================================================

    function test_batchSettle() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);
        _depositPlayer(carol, 100_000000);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 carolBefore = token.balanceOf(carol);

        address[] memory players = new address[](3);
        players[0] = alice;
        players[1] = bob;
        players[2] = carol;

        uint256[] memory stacks = new uint256[](3);
        stacks[0] = 200_000000; // Alice won
        stacks[1] = 50_000000;
        stacks[2] = 50_000000;

        vm.prank(owner);
        escrow.batchSettle(tableId, players, stacks);

        assertEq(token.balanceOf(alice), aliceBefore + 200_000000);
        assertEq(token.balanceOf(bob), bobBefore + 50_000000);
        assertEq(token.balanceOf(carol), carolBefore + 50_000000);

        // All unseated
        (,, bool aSeated) = escrow.getPlayerSeat(tableId, alice);
        (,, bool bSeated) = escrow.getPlayerSeat(tableId, bob);
        (,, bool cSeated) = escrow.getPlayerSeat(tableId, carol);
        assertFalse(aSeated);
        assertFalse(bSeated);
        assertFalse(cSeated);
    }

    function test_batchSettle_withZeroStacks() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        uint256[] memory stacks = new uint256[](2);
        stacks[0] = 200_000000; // Alice takes all
        stacks[1] = 0;          // Bob busted

        vm.prank(owner);
        escrow.batchSettle(tableId, players, stacks);

        assertEq(token.balanceOf(alice), aliceBefore + 200_000000);
        assertEq(token.balanceOf(bob), bobBefore); // unchanged
    }

    function test_batchSettle_emptyArrays() public {
        address[] memory players = new address[](0);
        uint256[] memory stacks = new uint256[](0);

        vm.prank(owner);
        escrow.batchSettle(tableId, players, stacks); // should succeed (no-op)
    }

    function test_batchSettle_lengthMismatch_reverts() public {
        address[] memory players = new address[](2);
        uint256[] memory stacks = new uint256[](1);

        vm.prank(owner);
        vm.expectRevert(PokerEscrow.LengthMismatch.selector);
        escrow.batchSettle(tableId, players, stacks);
    }

    function test_batchSettle_notOwner_reverts() public {
        address[] memory players = new address[](0);
        uint256[] memory stacks = new uint256[](0);

        vm.prank(alice);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.batchSettle(tableId, players, stacks);
    }

    // ================================================================
    // Emergency refund
    // ================================================================

    function test_emergencyRefund() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 80_000000);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        vm.prank(owner);
        escrow.emergencyRefund(tableId);

        assertEq(token.balanceOf(alice), aliceBefore + 100_000000);
        assertEq(token.balanceOf(bob), bobBefore + 80_000000);

        (,, bool aliceSeated) = escrow.getPlayerSeat(tableId, alice);
        (,, bool bobSeated) = escrow.getPlayerSeat(tableId, bob);
        assertFalse(aliceSeated);
        assertFalse(bobSeated);
    }

    function test_emergencyRefund_emitsEvent() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 80_000000);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit PokerEscrow.EmergencyRefunded(tableId, 2);
        escrow.emergencyRefund(tableId);
    }

    function test_emergencyRefund_clearsPlayerList() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 80_000000);

        vm.prank(owner);
        escrow.emergencyRefund(tableId);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 0);
    }

    function test_emergencyRefund_emptyTable() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit PokerEscrow.EmergencyRefunded(tableId, 0);
        escrow.emergencyRefund(tableId);
    }

    function test_emergencyRefund_contractBalanceZeroAfter() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 80_000000);

        vm.prank(owner);
        escrow.emergencyRefund(tableId);

        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_emergencyRefund_notOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.emergencyRefund(tableId);
    }

    function test_emergencyRefund_nonExistentTable_reverts() public {
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.TableDoesNotExist.selector);
        escrow.emergencyRefund(keccak256("nonexistent"));
    }

    function test_emergencyRefund_playersCanRedepositAfter() public {
        _depositPlayer(alice, 100_000000);

        vm.prank(owner);
        escrow.emergencyRefund(tableId);

        // Alice re-deposits
        _depositPlayer(alice, 100_000000);
        assertEq(escrow.getPlayerBalance(tableId, alice), 100_000000);
    }

    // ================================================================
    // Ownership
    // ================================================================

    function test_transferOwnership() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);
        assertEq(escrow.owner(), alice);
    }

    function test_transferOwnership_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit PokerEscrow.OwnershipTransferred(owner, alice);
        escrow.transferOwnership(alice);
    }

    function test_transferOwnership_newOwnerCanAct() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);

        // Alice can now create tables
        vm.prank(alice);
        escrow.createTable(keccak256("newTable"), 10_000000, 50_000000);
        (,, bool exists,) = escrow.getTable(keccak256("newTable"));
        assertTrue(exists);
    }

    function test_transferOwnership_oldOwnerCantAct() public {
        vm.prank(owner);
        escrow.transferOwnership(alice);

        vm.prank(owner);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.createTable(keccak256("fail"), 10_000000, 50_000000);
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

    // ================================================================
    // View functions
    // ================================================================

    function test_getPlayerSeat_unseated() public view {
        (uint256 balance, uint256 totalDeposited, bool isSeated) = escrow.getPlayerSeat(tableId, alice);
        assertEq(balance, 0);
        assertEq(totalDeposited, 0);
        assertFalse(isSeated);
    }

    function test_getPlayerBalance_unseated() public view {
        assertEq(escrow.getPlayerBalance(tableId, alice), 0);
    }

    function test_getTable_nonExistent() public view {
        (uint256 min, uint256 max, bool exists, uint256 count) = escrow.getTable(keccak256("nonexistent"));
        assertEq(min, 0);
        assertEq(max, 0);
        assertFalse(exists);
        assertEq(count, 0);
    }

    function test_getTablePlayers_empty() public view {
        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 0);
    }

    // ================================================================
    // PlayerList integrity (swap-and-pop)
    // ================================================================

    function test_playerList_swapAndPop_middleRemoval() public {
        // Deposit 3 players: [alice, bob, carol]
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);
        _depositPlayer(carol, 100_000000);

        // Settle bob (middle) — carol should swap into bob's position
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, bob, 100_000000);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 2);
        assertEq(players[0], alice);
        assertEq(players[1], carol); // carol swapped into bob's slot
    }

    function test_playerList_swapAndPop_firstRemoval() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);
        _depositPlayer(carol, 100_000000);

        // Settle alice (first) — carol should swap in
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 2);
        assertEq(players[0], carol); // carol swapped into alice's slot
        assertEq(players[1], bob);
    }

    function test_playerList_swapAndPop_lastRemoval() public {
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);
        _depositPlayer(carol, 100_000000);

        // Settle carol (last) — just pop, no swap
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, carol, 100_000000);

        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 2);
        assertEq(players[0], alice);
        assertEq(players[1], bob);
    }

    // ================================================================
    // Multi-table scenarios
    // ================================================================

    function test_multiTable_independentState() public {
        bytes32 lowId = keccak256("low");
        vm.prank(owner);
        escrow.createTable(lowId, 200_000000, 1000_000000);

        // Alice on micro, Bob on low
        _depositPlayer(alice, 100_000000);
        _depositPlayerTable(bob, lowId, 500_000000);

        assertEq(escrow.getPlayerBalance(tableId, alice), 100_000000);
        assertEq(escrow.getPlayerBalance(lowId, bob), 500_000000);
        assertEq(escrow.getPlayerBalance(tableId, bob), 0); // bob not on micro
        assertEq(escrow.getPlayerBalance(lowId, alice), 0);  // alice not on low
    }

    function test_multiTable_settleOneDoesntAffectOther() public {
        bytes32 lowId = keccak256("low");
        vm.prank(owner);
        escrow.createTable(lowId, 200_000000, 1000_000000);

        _depositPlayer(alice, 100_000000);
        _depositPlayerTable(bob, lowId, 500_000000);

        // Settle alice on micro
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);

        // Bob still seated on low
        (,, bool bobSeated) = escrow.getPlayerSeat(lowId, bob);
        assertTrue(bobSeated);
        assertEq(escrow.getPlayerBalance(lowId, bob), 500_000000);
    }

    // ================================================================
    // End-to-end: full poker game lifecycle
    // ================================================================

    function test_e2e_fullGameLifecycle() public {
        // --- Setup: 4 players sit down at micro table ---
        _depositPlayer(alice, 100_000000);  // 100 aUSD
        _depositPlayer(bob, 100_000000);
        _depositPlayer(carol, 100_000000);
        _depositPlayer(dave, 100_000000);

        // Verify contract holds 400 aUSD
        assertEq(token.balanceOf(address(escrow)), 400_000000);
        (, , , uint256 playerCount) = escrow.getTable(tableId);
        assertEq(playerCount, 4);

        // --- Carol rebuys 60 aUSD ---
        vm.startPrank(carol);
        token.approve(address(escrow), 60_000000);
        escrow.rebuy(tableId, 60_000000);
        vm.stopPrank();

        assertEq(token.balanceOf(address(escrow)), 460_000000);
        assertEq(escrow.getPlayerBalance(tableId, carol), 160_000000);

        // Record wallet balances before settlement
        uint256 aliceWallet = token.balanceOf(alice);
        uint256 bobWallet = token.balanceOf(bob);
        uint256 carolWallet = token.balanceOf(carol);
        uint256 daveWallet = token.balanceOf(dave);

        // --- Game results: Alice big winner, Dave breaks even, Bob/Carol lost ---
        // Alice: 100 -> 280 (won 180)
        // Bob:   100 -> 0   (lost 100)
        // Carol: 160 -> 80  (lost 80)
        // Dave:  100 -> 100 (broke even)
        // Total out: 280 + 0 + 80 + 100 = 460 ✓

        // Settle Bob first (busted)
        vm.prank(owner);
        escrow.settleAndWithdraw(tableId, bob, 0);
        assertEq(token.balanceOf(bob), bobWallet); // unchanged

        // Batch settle remaining 3
        address[] memory remaining = new address[](3);
        remaining[0] = alice;
        remaining[1] = carol;
        remaining[2] = dave;

        uint256[] memory stacks = new uint256[](3);
        stacks[0] = 280_000000;
        stacks[1] = 80_000000;
        stacks[2] = 100_000000;

        vm.prank(owner);
        escrow.batchSettle(tableId, remaining, stacks);

        // --- Verify final wallet balances ---
        assertEq(token.balanceOf(alice), aliceWallet + 280_000000);
        assertEq(token.balanceOf(carol), carolWallet + 80_000000);
        assertEq(token.balanceOf(dave), daveWallet + 100_000000);

        // --- Verify contract is empty ---
        assertEq(token.balanceOf(address(escrow)), 0);

        // --- Verify all players unseated ---
        (,, bool aS) = escrow.getPlayerSeat(tableId, alice);
        (,, bool bS) = escrow.getPlayerSeat(tableId, bob);
        (,, bool cS) = escrow.getPlayerSeat(tableId, carol);
        (,, bool dS) = escrow.getPlayerSeat(tableId, dave);
        assertFalse(aS);
        assertFalse(bS);
        assertFalse(cS);
        assertFalse(dS);

        // --- Verify player list is empty ---
        address[] memory players = escrow.getTablePlayers(tableId);
        assertEq(players.length, 0);

        // --- Verify table still exists for next game ---
        (,, bool exists,) = escrow.getTable(tableId);
        assertTrue(exists);
    }

    function test_e2e_multipleGamesOnSameTable() public {
        // --- Game 1 ---
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        vm.startPrank(owner);
        escrow.settleAndWithdraw(tableId, alice, 150_000000); // Alice wins
        escrow.settleAndWithdraw(tableId, bob, 50_000000);    // Bob loses some
        vm.stopPrank();

        assertEq(token.balanceOf(address(escrow)), 0);

        // --- Game 2: same players re-deposit ---
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 100_000000);

        // Verify they're seated again with fresh balances
        assertEq(escrow.getPlayerBalance(tableId, alice), 100_000000);
        assertEq(escrow.getPlayerBalance(tableId, bob), 100_000000);

        vm.startPrank(owner);
        escrow.settleAndWithdraw(tableId, bob, 180_000000);   // Bob wins big
        escrow.settleAndWithdraw(tableId, alice, 20_000000);   // Alice loses
        vm.stopPrank();

        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_e2e_emergencyMidGame() public {
        // 3 players in a game
        _depositPlayer(alice, 100_000000);
        _depositPlayer(bob, 80_000000);
        _depositPlayer(carol, 120_000000);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 carolBefore = token.balanceOf(carol);

        // Server crashes — emergency refund everyone their deposit
        vm.prank(owner);
        escrow.emergencyRefund(tableId);

        // Everyone gets their exact deposit back
        assertEq(token.balanceOf(alice), aliceBefore + 100_000000);
        assertEq(token.balanceOf(bob), bobBefore + 80_000000);
        assertEq(token.balanceOf(carol), carolBefore + 120_000000);
        assertEq(token.balanceOf(address(escrow)), 0);

        // They can start a new game
        _depositPlayer(alice, 100_000000);
        assertEq(escrow.getPlayerBalance(tableId, alice), 100_000000);
    }

    function test_e2e_ownershipTransferAndSettle() public {
        _depositPlayer(alice, 100_000000);

        // Transfer ownership to a new server wallet
        address newOwner = address(0xDEAD);
        vm.prank(owner);
        escrow.transferOwnership(newOwner);

        // Old owner can't settle
        vm.prank(owner);
        vm.expectRevert(PokerEscrow.NotOwner.selector);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);

        // New owner can settle
        vm.prank(newOwner);
        escrow.settleAndWithdraw(tableId, alice, 100_000000);
        (,, bool seated) = escrow.getPlayerSeat(tableId, alice);
        assertFalse(seated);
    }

    // ================================================================
    // Helpers
    // ================================================================

    function _depositPlayer(address player, uint256 amount) internal {
        vm.startPrank(player);
        token.approve(address(escrow), amount);
        escrow.deposit(tableId, amount);
        vm.stopPrank();
    }

    function _depositPlayerTable(address player, bytes32 tId, uint256 amount) internal {
        vm.startPrank(player);
        token.approve(address(escrow), amount);
        escrow.deposit(tId, amount);
        vm.stopPrank();
    }
}

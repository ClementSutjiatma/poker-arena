// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/// @title PokerEscrow
/// @notice Holds player buy-ins for poker tables on Tempo. The server (owner)
///         settles each player's final stack when they leave.
/// @dev Uses ERC-20 / TIP-20 compatible token (aUSD on Tempo, 6 decimals).
contract PokerEscrow {
    // ----------------------------------------------------------------
    // State
    // ----------------------------------------------------------------

    address public owner;
    IERC20 public immutable token;

    struct PlayerSeat {
        uint256 balance;        // current escrowed balance
        uint256 totalDeposited; // lifetime deposits for this table session
        bool isSeated;
    }

    struct Table {
        uint256 minBuyIn;
        uint256 maxBuyIn;
        bool exists;
        address[] playerList;   // for iteration (emergency refund)
        mapping(address => PlayerSeat) players;
    }

    mapping(bytes32 => Table) private tables;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event TableCreated(bytes32 indexed tableId, uint256 minBuyIn, uint256 maxBuyIn);
    event Deposited(bytes32 indexed tableId, address indexed player, uint256 amount);
    event Rebought(bytes32 indexed tableId, address indexed player, uint256 amount);
    event Settled(bytes32 indexed tableId, address indexed player, uint256 finalStack);
    event EmergencyRefunded(bytes32 indexed tableId, uint256 playerCount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ----------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------

    error NotOwner();
    error TableAlreadyExists();
    error TableDoesNotExist();
    error InvalidBuyInRange();
    error AmountBelowMinBuyIn();
    error AmountAboveMaxBuyIn();
    error AlreadySeated();
    error NotSeated();
    error TransferFailed();
    error SettlementExceedsBalance();
    error LengthMismatch();
    error ZeroAmount();
    error ZeroAddress();

    // ----------------------------------------------------------------
    // Modifiers
    // ----------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    /// @param _token  Address of the ERC-20 / TIP-20 token (aUSD on Tempo).
    /// @param _owner  Address of the server wallet that can settle games.
    constructor(address _token, address _owner) {
        if (_token == address(0) || _owner == address(0)) revert ZeroAddress();
        token = IERC20(_token);
        owner = _owner;
    }

    // ----------------------------------------------------------------
    // Owner: Table management
    // ----------------------------------------------------------------

    /// @notice Register a new poker table with buy-in limits.
    function createTable(bytes32 tableId, uint256 minBuyIn, uint256 maxBuyIn) external onlyOwner {
        if (tables[tableId].exists) revert TableAlreadyExists();
        if (minBuyIn == 0 || maxBuyIn == 0 || minBuyIn > maxBuyIn) revert InvalidBuyInRange();

        Table storage t = tables[tableId];
        t.minBuyIn = minBuyIn;
        t.maxBuyIn = maxBuyIn;
        t.exists = true;

        emit TableCreated(tableId, minBuyIn, maxBuyIn);
    }

    // ----------------------------------------------------------------
    // Player: Deposit (sit down)
    // ----------------------------------------------------------------

    /// @notice Deposit tokens to sit at a table. Player must first call
    ///         token.approve(escrow, amount).
    /// @param tableId  The table identifier (keccak256 of string id).
    /// @param amount   Amount to deposit (6 decimals for aUSD).
    function deposit(bytes32 tableId, uint256 amount) external {
        Table storage t = tables[tableId];
        if (!t.exists) revert TableDoesNotExist();
        if (amount == 0) revert ZeroAmount();
        if (amount < t.minBuyIn) revert AmountBelowMinBuyIn();
        if (amount > t.maxBuyIn) revert AmountAboveMaxBuyIn();
        if (t.players[msg.sender].isSeated) revert AlreadySeated();

        // Pull tokens from player
        bool success = token.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        // Seat the player
        t.players[msg.sender] = PlayerSeat({
            balance: amount,
            totalDeposited: amount,
            isSeated: true
        });
        t.playerList.push(msg.sender);

        emit Deposited(tableId, msg.sender, amount);
    }

    // ----------------------------------------------------------------
    // Player: Re-buy (top up while seated)
    // ----------------------------------------------------------------

    /// @notice Top up stack between hands. Total balance must stay <= maxBuyIn.
    function rebuy(bytes32 tableId, uint256 amount) external {
        Table storage t = tables[tableId];
        if (!t.exists) revert TableDoesNotExist();
        if (amount == 0) revert ZeroAmount();

        PlayerSeat storage seat = t.players[msg.sender];
        if (!seat.isSeated) revert NotSeated();
        if (seat.balance + amount > t.maxBuyIn) revert AmountAboveMaxBuyIn();

        bool success = token.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        seat.balance += amount;
        seat.totalDeposited += amount;

        emit Rebought(tableId, msg.sender, amount);
    }

    // ----------------------------------------------------------------
    // Owner: Settlement (cash out)
    // ----------------------------------------------------------------

    /// @notice Settle a single player when they leave. Sends finalStack to
    ///         the player and removes them from the table.
    /// @param tableId     The table identifier.
    /// @param player      The player's wallet address.
    /// @param finalStack  The player's chip count when leaving (in token units).
    function settleAndWithdraw(bytes32 tableId, address player, uint256 finalStack) external onlyOwner {
        _settle(tableId, player, finalStack);
    }

    /// @notice Batch settle multiple players at once.
    function batchSettle(
        bytes32 tableId,
        address[] calldata players,
        uint256[] calldata finalStacks
    ) external onlyOwner {
        if (players.length != finalStacks.length) revert LengthMismatch();
        for (uint256 i = 0; i < players.length; i++) {
            _settle(tableId, players[i], finalStacks[i]);
        }
    }

    /// @notice Emergency: refund all seated players their current balance.
    ///         Used if the server crashes or a game must be cancelled.
    function emergencyRefund(bytes32 tableId) external onlyOwner {
        Table storage t = tables[tableId];
        if (!t.exists) revert TableDoesNotExist();

        uint256 count = 0;
        for (uint256 i = 0; i < t.playerList.length; i++) {
            address player = t.playerList[i];
            PlayerSeat storage seat = t.players[player];
            if (seat.isSeated && seat.balance > 0) {
                uint256 refundAmount = seat.balance;
                seat.balance = 0;
                seat.isSeated = false;
                token.transfer(player, refundAmount);
                count++;
            }
        }

        // Clear the player list
        delete t.playerList;

        emit EmergencyRefunded(tableId, count);
    }

    // ----------------------------------------------------------------
    // Owner: Admin
    // ----------------------------------------------------------------

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    // ----------------------------------------------------------------
    // View functions
    // ----------------------------------------------------------------

    function getPlayerBalance(bytes32 tableId, address player) external view returns (uint256) {
        return tables[tableId].players[player].balance;
    }

    function getPlayerSeat(bytes32 tableId, address player)
        external
        view
        returns (uint256 balance, uint256 totalDeposited, bool isSeated)
    {
        PlayerSeat storage seat = tables[tableId].players[player];
        return (seat.balance, seat.totalDeposited, seat.isSeated);
    }

    function getTable(bytes32 tableId)
        external
        view
        returns (uint256 minBuyIn, uint256 maxBuyIn, bool exists, uint256 playerCount)
    {
        Table storage t = tables[tableId];
        return (t.minBuyIn, t.maxBuyIn, t.exists, t.playerList.length);
    }

    function getTablePlayers(bytes32 tableId) external view returns (address[] memory) {
        return tables[tableId].playerList;
    }

    // ----------------------------------------------------------------
    // Internal
    // ----------------------------------------------------------------

    function _settle(bytes32 tableId, address player, uint256 finalStack) internal {
        Table storage t = tables[tableId];
        if (!t.exists) revert TableDoesNotExist();

        PlayerSeat storage seat = t.players[player];
        if (!seat.isSeated) revert NotSeated();

        // finalStack can be 0 (player lost everything) or up to the contract's
        // token balance. We don't cap it to totalDeposited because winnings from
        // other players increase the pool — the contract always holds enough.
        if (finalStack > token.balanceOf(address(this))) revert SettlementExceedsBalance();

        seat.balance = 0;
        seat.isSeated = false;

        if (finalStack > 0) {
            bool success = token.transfer(player, finalStack);
            if (!success) revert TransferFailed();
        }

        // Remove from playerList (swap-and-pop)
        _removeFromPlayerList(t, player);

        emit Settled(tableId, player, finalStack);
    }

    function _removeFromPlayerList(Table storage t, address player) internal {
        uint256 len = t.playerList.length;
        for (uint256 i = 0; i < len; i++) {
            if (t.playerList[i] == player) {
                t.playerList[i] = t.playerList[len - 1];
                t.playerList.pop();
                return;
            }
        }
    }
}

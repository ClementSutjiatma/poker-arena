// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PokerEscrow.sol";

/// @notice Deploys PokerEscrow to Tempo testnet and creates the 4 default tables.
///
/// Usage:
///   forge script script/Deploy.s.sol:DeployPokerEscrow \
///     --rpc-url https://rpc.moderato.tempo.xyz \
///     --private-key $DEPLOYER_KEY \
///     --broadcast \
///     --tempo.fee-token 0x20c0000000000000000000000000000000000001
///
/// Environment variables:
///   AUSD_TOKEN     - aUSD token address (default: Tempo testnet aUSD)
///   SERVER_WALLET  - Privy server wallet address (the escrow owner)
contract DeployPokerEscrow is Script {
    // Tempo testnet AlphaUSD precompile
    address constant DEFAULT_AUSD = 0x20C0000000000000000000000000000000000001;

    function run() external {
        address ausd = vm.envOr("AUSD_TOKEN", DEFAULT_AUSD);
        address serverWallet = vm.envAddress("SERVER_WALLET");

        vm.startBroadcast();

        PokerEscrow escrow = new PokerEscrow(ausd, serverWallet);
        console.log("PokerEscrow deployed at:", address(escrow));

        // Create the 4 default tables (amounts in 6-decimal aUSD)
        // Micro: SB/BB 1/2, buy-in 40–200
        escrow.createTable(keccak256("micro"), 40_000000, 200_000000);
        // Low: SB/BB 5/10, buy-in 200–1000
        escrow.createTable(keccak256("low"), 200_000000, 1000_000000);
        // Mid: SB/BB 25/50, buy-in 1000–5000
        escrow.createTable(keccak256("mid"), 1000_000000, 5000_000000);
        // High: SB/BB 100/200, buy-in 4000–20000
        escrow.createTable(keccak256("high"), 4000_000000, 20000_000000);

        vm.stopBroadcast();

        console.log("All 4 tables created successfully.");
    }
}

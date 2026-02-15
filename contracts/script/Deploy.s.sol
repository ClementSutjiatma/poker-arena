// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PokerEscrow.sol";

/// @notice Deploys PokerEscrow to Tempo testnet.
///
/// Table creation is handled separately via the Privy server wallet
/// (see scripts/create-tables.ts) since only the owner can call createTable().
///
/// Usage:
///   forge script script/Deploy.s.sol:DeployPokerEscrow \
///     --rpc-url https://rpc.moderato.tempo.xyz \
///     --private-key $DEPLOYER_KEY \
///     --broadcast
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

        vm.stopBroadcast();
    }
}

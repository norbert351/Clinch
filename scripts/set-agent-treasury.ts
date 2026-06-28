/**
 * Set Fee Treasury to Agent Wallet
 *
 * Prints the cast command to forward all fees to the Agent Wallet.
 * 
 * Usage:
 *   export PRIVATE_KEY=0x...
 *   export CONTRACT_ADDRESS=0x...
 *   export AGENT_WALLET=0x...    ← from setup-circle-wallet.ts output
 *   npx tsx scripts/set-agent-treasury.ts
 */

const CONTRACT = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const AGENT = process.env.AGENT_WALLET;
const RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

async function main() {
  if (!PRIVATE_KEY) { console.error("PRIVATE_KEY required"); process.exit(1); }
  if (!CONTRACT) { console.error("CONTRACT_ADDRESS required"); process.exit(1); }
  if (!AGENT) { console.error("AGENT_WALLET required (from setup-circle-wallet.ts output)"); process.exit(1); }

  console.log("\nAgent Wallet: " + AGENT);
  console.log("Contract:     " + CONTRACT + "\n");

  console.log("Run this command:\n");
  console.log("  cast send " + CONTRACT);
  console.log('    "setTreasury(address)"');
  console.log("    " + AGENT);
  console.log("    --rpc-url " + RPC);
  console.log("    --private-key " + PRIVATE_KEY.slice(0, 6) + "...");
  console.log("    --chain-id " + CHAIN_ID + "\n");

  console.log("After execution, ALL fees flow to: " + AGENT);
  console.log("Verify: cast call " + CONTRACT + " 'treasury()' --rpc-url " + RPC);
}

main().catch((err) => { console.error("FAILED:", err.message || String(err)); process.exit(1); });

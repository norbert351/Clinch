/**
 * Clinch Agent Scheduler
 *
 * Manual cron script that runs agent auto-discovery tasks.
 * Add to crontab: */15 * * * * cd /path/to/clinch && npx tsx src/modules/agent/agent.scheduler.ts
 *
 * This script:
 * 1. Finds stale deals (awaiting deposit > 48h, disputed > 24h without ruling)
 * 2. Alerts admins about stalled deals
 * 3. Tracks agent wallet balance
 */

import "dotenv/config";
import { findStaleDeals, getOrCreateAgentWallet, getAgentWalletBalance } from "./agent.service";

async function runAgentSchedule(): Promise<void> {
  console.log("[Clinch Agent Scheduler] Running...");

  try {
    // 1. Ensure agent wallet exists
    const wallet = await getOrCreateAgentWallet();
    console.log(`[Clinch Agent] Wallet: ${wallet.walletAddress} (balance: ${wallet.balance} USDC)`);

    // 2. Fetch current balance
    const balance = await getAgentWalletBalance();
    console.log(`[Clinch Agent] Current balance: ${balance} USDC`);

    // 3. Check for stale deals
    const stale = await findStaleDeals();
    if (stale.length === 0) {
      console.log("[Clinch Agent] No stale deals found. All clear.");
    } else {
      console.log(`[Clinch Agent] Found ${stale.length} stale deal(s):`);
      for (const item of stale) {
        console.log(`  - Deal #${item.dealId}: ${item.action} — ${item.reason}`);
      }
    }

    console.log("[Clinch Agent Scheduler] Complete.");
  } catch (err) {
    console.error("[Clinch Agent Scheduler] Error:", err);
    process.exit(1);
  }
}

runAgentSchedule();

export {};

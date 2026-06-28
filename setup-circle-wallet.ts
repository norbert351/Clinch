import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

const theKey = process.env.CIRCLE_API_KEY;
if (!theKey) {
  console.error("ERROR: CIRCLE_API_KEY is required.");
  console.error("  Get one at https://console.circle.com/ -> API Keys");
  process.exit(1);
}

const dotenv = existsSync(".env") ? readFileSync(".env", "utf8") : "";
if (dotenv.includes("CIRCLE_ENTITY_SECRET=")) {
  console.log("Already in env. Remove to regenerate.");
  process.exit(0);
}

async function main() {
  const entitySecret = randomBytes(32).toString("hex");
  mkdirSync("./recovery", { recursive: true });

  console.log("[1/3] Registering entity secret...");
  const es = entitySecret;
  const opts1 = {};
  const ak = theKey;
  opts1["apiKey"] = ak;
  opts1["entitySecret"] = es;
  opts1["recoveryFileDownloadPath"] = "./recovery";
  await registerEntitySecretCiphertext(opts1);
  console.log("  OK");

  console.log("[2/3] Creating wallet set...");
  const opts2 = {};
  opts2["apiKey"] = ak;
  opts2["entitySecret"] = es;
  const client = initiateDeveloperControlledWalletsClient(opts2);
  const wsResp = await client.createWalletSet({ name: "clinch-agent" });
  const wsid = wsResp.data?.walletSet?.id;
  if (!wsid) throw new Error("Failed");
  console.log("  OK - Wallet Set: " + wsid);

  console.log("[3/3] Creating wallet on Arc...");
  const wResp = await client.createWallets({
    walletSetId: wsid,
    blockchains: ["ARC-TESTNET"],
    count: 1,
    accountType: "EOA",
  });
  const wallet = wResp.data?.wallets?.[0];
  console.log("  OK - Wallet: " + (wallet?.address || "unknown"));

  const sep = "========================";
  console.log("");
  console.log(sep);
  console.log("COPY THESE:");
  console.log("");
  console.log("CIRCLE_API_KEY=" + theKey);
  console.log("CIRCLE_ENTITY_SECRET=" + entitySecret);
  console.log("CIRCLE_WALLET_SET_ID=" + wsid);
  if (wallet) console.log("CIRCLE_DEVELOPER_WALLET_ID=" + wallet.id);
  console.log("");
  console.log(sep);
  console.log("");
  console.log("Recovery: ./recovery/");
  console.log("SAVE IT SAFELY.");
}

main().catch((err) => {
  console.error("FAILED:", err.message || String(err));
  process.exit(1);
});

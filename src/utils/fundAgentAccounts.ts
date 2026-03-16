#!/usr/bin/env node
/**
 * Fund agent accounts with HBAR. Agent accounts need balance to pay for
 * ScheduleSignTransaction when signing schedules.
 *
 * Requires in .env:
 *   HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY (or HEDERA_DEPLOYER_PRIVATE_KEY) - payer
 *   AGENT_CONFIGS - JSON array with accountId for each agent
 *
 * Optional: FUND_AMOUNT_HBAR (default 50)
 *
 * Run: npm run fund:agents
 */
import { config } from "dotenv";
import {
  Client,
  PrivateKey,
  TransferTransaction,
  Hbar,
} from "@hashgraph/sdk";

config();

function parsePrivateKey(keyStr: string): PrivateKey {
  const trimmed = String(keyStr).trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return PrivateKey.fromStringECDSA(hex);
  }
  if (PrivateKey.isDerKey(trimmed)) {
    return PrivateKey.fromStringDer(trimmed);
  }
  return PrivateKey.fromStringECDSA(hex);
}

function getAgentAccountIds(): string[] {
  const raw = process.env.AGENT_CONFIGS;
  if (!raw) {
    throw new Error("AGENT_CONFIGS required (JSON array with accountId)");
  }
  const configs = JSON.parse(raw) as Array<{ accountId?: string }>;
  return configs
    .map((c) => c.accountId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function main(): Promise<void> {
  const operatorId =
    process.env.HEDERA_ACCOUNT_ID ?? process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const operatorKey =
    process.env.HEDERA_PRIVATE_KEY ??
    process.env.HEDERA_OPERATOR_PRIVATE_KEY ??
    process.env.HEDERA_DEPLOYER_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY (or HEDERA_DEPLOYER_PRIVATE_KEY) in .env"
    );
  }

  const accountIds = getAgentAccountIds();
  const amountHbar = parseInt(process.env.FUND_AMOUNT_HBAR ?? "50", 10);
  const amount = Hbar.fromTinybars(amountHbar * 100_000_000);

  const client =
    process.env.HEDERA_NETWORK === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();
  client.setOperator(operatorId, parsePrivateKey(operatorKey));

  console.log(`Funding ${accountIds.length} agent(s) with ${amountHbar} HBAR each`);
  console.log("");

  for (const accountId of accountIds) {
    const tx = new TransferTransaction()
      .addHbarTransfer(operatorId, amount.negated())
      .addHbarTransfer(accountId, amount);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`  ${accountId}: ${receipt.status}`);
  }

  console.log("\n✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

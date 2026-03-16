#!/usr/bin/env node
/**
 * Create two testnet accounts and private inbound topics for passive agent signers.
 * Outputs AGENT_CONFIGS JSON to add to .env
 *
 * Requires in .env:
 *   HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY (or HEDERA_DEPLOYER_PRIVATE_KEY) - payer
 *
 * Topics use the payer's public key as submit key. The shared listener (same operator keys)
 * can post to any inbound topic across all projects.
 *
 * Run: npm run create:accounts
 */
import { config } from 'dotenv';
import {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  TopicCreateTransaction,
  Hbar,
} from '@hashgraph/sdk';

config();

async function main(): Promise<void> {
  const operatorId =
    process.env.HEDERA_ACCOUNT_ID ?? process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const operatorKey =
    process.env.HEDERA_PRIVATE_KEY ??
    process.env.HEDERA_OPERATOR_PRIVATE_KEY ??
    process.env.HEDERA_DEPLOYER_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    console.error(
      'Missing payer account. Set in .env:\n' +
        '  HEDERA_ACCOUNT_ID=0.0.xxxxx\n' +
        '  HEDERA_PRIVATE_KEY or HEDERA_DEPLOYER_PRIVATE_KEY'
    );
    process.exit(1);
  }

  const client = Client.forTestnet();

  // Parse payer private key
  let operatorPrivateKey: PrivateKey;
  try {
    const trimmed = String(operatorKey).trim();
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      operatorPrivateKey = PrivateKey.fromStringECDSA(hex);
    } else if (PrivateKey.isDerKey(trimmed)) {
      operatorPrivateKey = PrivateKey.fromStringDer(trimmed);
    } else {
      operatorPrivateKey = PrivateKey.fromStringECDSA(hex);
    }
  } catch (e) {
    console.error('Failed to parse payer private key.', e);
    process.exit(1);
  }
  client.setOperator(operatorId, operatorPrivateKey);

  // Use payer's public key as submit key - shared listener (same operator keys) can post to any inbound
  const submitKey = operatorPrivateKey.publicKey;

  type AgentConfig = {
    accountId: string;
    privateKey: string;
    operatorPublicKey: string;
    inboundTopicId: string;
  };

  const accounts: AgentConfig[] = [];

  for (let i = 0; i < 2; i++) {
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.publicKey;

    const accountTx = new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(Hbar.fromTinybars(100));

    const accountResponse = await accountTx.execute(client);
    const accountReceipt = await accountResponse.getReceipt(client);
    const accountId = accountReceipt.accountId!.toString();

    const topicTx = new TopicCreateTransaction()
      .setTopicMemo(`agent-inbound-${accountId}`)
      .setSubmitKey(submitKey);

    const topicResponse = await topicTx.execute(client);
    const topicReceipt = await topicResponse.getReceipt(client);
    const topicId = topicReceipt.topicId!.toString();

    accounts.push({
      accountId,
      privateKey: privateKey.toStringDer(),
      operatorPublicKey: publicKey.toStringRaw(),
      inboundTopicId: topicId,
    });

    console.log(`Created account ${i + 1}: ${accountId} | inbound topic: ${topicId}`);
  }

  const agentConfigs = JSON.stringify(accounts);
  console.log('\n--- Add to .env ---\n');
  console.log("AGENT_CONFIGS='" + agentConfigs.replace(/'/g, "'\\''") + "'");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

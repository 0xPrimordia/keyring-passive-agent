#!/usr/bin/env node
/**
 * Create two Hedera accounts and private inbound topics for passive agent signers.
 * Outputs AGENT_CONFIGS JSON to add to .env
 *
 * Requires in .env:
 *   HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY - payer
 *   HEDERA_NETWORK (optional, default: testnet) - testnet or mainnet
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
  AccountInfoQuery,
  KeyList,
  Hbar,
} from '@hashgraph/sdk';

config();

async function main(): Promise<void> {
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    console.error(
      'Missing payer account. Set in .env:\n' +
        '  HEDERA_ACCOUNT_ID=0.0.xxxxx\n' +
        '  HEDERA_PRIVATE_KEY=...'
    );
    process.exit(1);
  }

  const network = process.env.HEDERA_NETWORK?.toLowerCase() ?? "testnet";
  const client =
    network === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  // Parse payer private key: hex (DER, raw ED25519, or raw ECDSA) or base64
  // Hedera default is ED25519; use HEDERA_KEY_TYPE=ecdsa if your account uses ECDSA
  const raw = String(operatorKey).replace(/\s/g, '').replace(/^0x/i, '');
  const keyType = process.env.HEDERA_KEY_TYPE?.toLowerCase();
  let operatorPrivateKey: PrivateKey;
  try {
    if (/^[0-9a-fA-F]+$/.test(raw)) {
      if (PrivateKey.isDerKey(raw)) {
        const bytes = new Uint8Array(Buffer.from(raw, 'hex'));
        operatorPrivateKey = PrivateKey.fromBytes(bytes);
      } else if (raw.length === 64) {
        operatorPrivateKey =
          keyType === 'ecdsa'
            ? PrivateKey.fromStringECDSA(raw)
            : PrivateKey.fromStringED25519(raw);
      } else {
        const bytes = new Uint8Array(Buffer.from(raw, 'hex'));
        operatorPrivateKey = PrivateKey.fromBytes(bytes);
      }
    } else {
      const bytes = new Uint8Array(Buffer.from(String(operatorKey).trim(), 'base64'));
      operatorPrivateKey = PrivateKey.fromBytes(bytes);
    }
  } catch (e) {
    console.error('Failed to parse HEDERA_PRIVATE_KEY:', e);
    process.exit(1);
  }
  client.setOperator(operatorId, operatorPrivateKey);

  // Pre-flight: verify account/key work via a PAID query (AccountBalanceQuery is free and doesn't prove signing)
  try {
    const info = await new AccountInfoQuery().setAccountId(operatorId).execute(client);
    console.log(`✓ Account ${operatorId} verified (${info.balance} HBAR) on ${network}`);

    // Check if account uses KeyList/threshold (requires multiple keys to sign transactions)
    if (info.key && info.key instanceof KeyList) {
      const threshold = info.key.threshold;
      const keyCount = info.key.toArray().length;
      if (threshold != null && threshold > 1) {
        console.error(
          `\nAccount ${operatorId} uses a ${threshold}-of-${keyCount} threshold key. ` +
            `Transactions require ${threshold} signatures. Use an account with a single key, or sign with all required keys.`
        );
        process.exit(1);
      }
    }
  } catch (e) {
    const err = e as Error & { status?: { _code?: number } };
    if (err.status?._code === 7 || String(e).includes('INVALID_SIGNATURE')) {
      const other = network === 'mainnet' ? 'testnet' : 'mainnet';
      console.error(`INVALID_SIGNATURE: Account ${operatorId} + key failed on ${network}.`);
      console.error(`AccountBalanceQuery passes (free, no signing) but paid operations fail.`);
      console.error(`Try: HEDERA_NETWORK=${other} — or use an account with a single key.`);
    }
    throw e;
  }

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

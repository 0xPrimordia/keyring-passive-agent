#!/usr/bin/env node

import './suppress-warnings.js';

import { config } from 'dotenv';
import { KeyringPassiveAgent } from './agent/keyring-passive-agent.js';
import { loadAgentConfigs, getSharedConfig } from './config/load-config.js';

config();

/**
 * KeyRing Passive Agent - Main Entry Point
 *
 * Runs one or more Hedera Agent Kit (LLM tool-calling) agents for passive signers.
 * Each agent has its own account; config is loaded from env.
 *
 * Config patterns:
 * - Multi-agent: AGENT_CONFIGS (JSON array of { accountId, privateKey, operatorPublicKey })
 * - Single agent: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, OPERATOR_PUBLIC_KEY
 * - Shared: HEDERA_NETWORK, PROJECT_*, AI_GATEWAY_API_KEY, etc.
 */
async function main(): Promise<void> {
  console.log('🦌⚡ Keyring Passive Agent');
  console.log('=========================');

  try {
    const agentConfigs = await loadAgentConfigs();
    const shared = getSharedConfig();

    const agents: KeyringPassiveAgent[] = [];

    for (const instanceConfig of agentConfigs) {
      const agent = new KeyringPassiveAgent({ ...instanceConfig, ...shared });
      await agent.initialize();
      agents.push(agent);
    }

    // Start all agents (each subscribes to its topic; they run in parallel)
    await Promise.all(agents.map((a) => a.start()));
  } catch (error) {
    console.error(
      '❌ Failed to start Keyring Passive Agent:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

import type { AgentInstanceConfig, SharedConfig } from '../agent/agent-config.js';

/**
 * Load shared config from env.
 * Used by all agent instances in this process.
 */
export function getSharedConfig(): SharedConfig {
  const env = process.env;
  return {
    hederaNetwork: env.HEDERA_NETWORK,
    openaiApiKey: env.OPENAI_API_KEY,
    aiGatewayApiKey: env.AI_GATEWAY_API_KEY,
    projectRegistryTopic: env.PROJECT_REGISTRY_TOPIC,
    projectContractsTopic: env.PROJECT_CONTRACTS_TOPIC,
    projectAuditTopic: env.PROJECT_AUDIT_TOPIC,
    projectRejectionTopic: env.PROJECT_REJECTION_TOPIC,
    projectValidatorTopic: env.PROJECT_VALIDATOR_TOPIC,
    operatorInboundTopicId: env.OPERATOR_INBOUND_TOPIC_ID,
    projectOperatorAccountId: env.PROJECT_OPERATOR_ACCOUNT_ID,
    lynxRegistrationTx: env.LYNX_REGISTRATION_TX,
  };
}

/**
 * Load agent instance configs from env.
 *
 * Supports two patterns:
 * 1. AGENT_CONFIGS - JSON array of { accountId, privateKey, operatorPublicKey }
 * 2. Single agent - HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, OPERATOR_PUBLIC_KEY
 */
export async function loadAgentConfigs(): Promise<AgentInstanceConfig[]> {
  const env = process.env;

  // Multi-agent: AGENT_CONFIGS as JSON array
  const agentConfigsRaw = env.AGENT_CONFIGS;
  if (agentConfigsRaw) {
    try {
      // Strip shell-style quoting (deploy platforms often wrap in ' or ")
      let json = agentConfigsRaw.trim();
      if ((json.startsWith("'") && json.endsWith("'")) || (json.startsWith('"') && json.endsWith('"'))) {
        json = json.slice(1, -1);
      }
      const parsed = JSON.parse(json) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('AGENT_CONFIGS must be a JSON array');
      }
      const configs = parsed.map((item, i) => {
        const c = item as Record<string, unknown>;
        const accountId = String(c.accountId ?? '');
        const privateKey = String(c.privateKey ?? '');
        const operatorPublicKey = String(c.operatorPublicKey ?? '');
        const inboundTopicId = c.inboundTopicId != null ? String(c.inboundTopicId) : undefined;
        if (!accountId || !privateKey || !operatorPublicKey) {
          throw new Error(
            `AGENT_CONFIGS[${i}] missing accountId, privateKey, or operatorPublicKey`
          );
        }
        return { accountId, privateKey, operatorPublicKey, inboundTopicId } satisfies AgentInstanceConfig;
      });
      return configs;
    } catch (e) {
      throw new Error(
        `Invalid AGENT_CONFIGS: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // Single agent: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, OPERATOR_PUBLIC_KEY
  const accountId = env.HEDERA_ACCOUNT_ID;
  const privateKey = env.HEDERA_PRIVATE_KEY;
  const operatorPublicKey = env.OPERATOR_PUBLIC_KEY;
  if (accountId && privateKey && operatorPublicKey) {
    return [{ accountId, privateKey, operatorPublicKey }];
  }

  throw new Error(
    'No agent config found. Set AGENT_CONFIGS (JSON array) or HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, OPERATOR_PUBLIC_KEY'
  );
}

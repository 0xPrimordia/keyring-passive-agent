/**
 * Per-agent instance config (account credentials).
 * Each agent instance has its own Hedera account/keypair and inbound topic.
 */
export interface AgentInstanceConfig {
  accountId: string;
  privateKey: string;
  operatorPublicKey: string;
  /** HCS topic ID for this agent's inbound messages (listener posts here) */
  inboundTopicId?: string;
}

/**
 * Shared config from env (network, topics, API keys).
 * Same across all agent instances in this process.
 */
export interface SharedConfig {
  hederaNetwork?: string;
  openaiApiKey?: string;
  aiGatewayApiKey?: string;
  projectRegistryTopic?: string;
  projectContractsTopic?: string;
  projectAuditTopic?: string;
  projectRejectionTopic?: string;
  projectValidatorTopic?: string;
  /** Operator inbound topic - all agents subscribe; messages from keyring operator with schedule IDs */
  operatorInboundTopicId?: string;
  projectOperatorAccountId?: string;
  lynxRegistrationTx?: string;
}

/**
 * Full config for a single agent = instance + shared.
 */
export type AgentConfig = AgentInstanceConfig & SharedConfig;

import { Client, TopicMessageQuery } from '@hashgraph/sdk';
import type { AgentConfig } from './agent-config.js';
import { GetScheduleInfoTool } from '../tools/get-schedule-info.js';
import { SignTransactionTool } from '../tools/sign-transaction.js';

/**
 * Keyring Passive Agent - Hedera Agent Kit (LLM tool-calling) agent
 * for handling cases when signers are passive (inactive, threshold rollover, etc.).
 *
 * Each instance is bound to a single Hedera account. Multiple instances
 * can run in the same process, each with its own config.
 */
export class KeyringPassiveAgent {
  private readonly config: AgentConfig;
  private isRunning = false;
  private client?: Client;
  private getScheduleInfoTool?: GetScheduleInfoTool;
  private signTransactionTool?: SignTransactionTool;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`🦌⚡ Initializing Keyring Passive Agent (${this.config.accountId})`);
    console.log('==========================================');

    this.validateConfig();

    try {
      await this.initializeBlockchainTools();
      console.log('✅ Keyring Passive Agent initialized successfully');
      console.log(`📋 Account ID: ${this.config.accountId}`);
      console.log(`🌐 Network: ${this.config.hederaNetwork ?? 'testnet'}`);
    } catch (error) {
      console.error('❌ Failed to initialize keyring passive agent:', error);
      throw error;
    }
  }

  private validateConfig(): void {
    const required = ['accountId', 'privateKey', 'operatorPublicKey'] as const;
    for (const key of required) {
      if (!this.config[key]) {
        throw new Error(`Missing required config: ${key}`);
      }
    }
  }

  private async initializeBlockchainTools(): Promise<void> {
    console.log('🔧 Initializing blockchain tools...');

    const network = (this.config.hederaNetwork ?? 'testnet').toLowerCase();
    this.client =
      network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.client.setOperator(this.config.accountId, this.config.privateKey);

    this.getScheduleInfoTool = new GetScheduleInfoTool(this.client, network);
    this.signTransactionTool = new SignTransactionTool(this.client);

    console.log('✅ Blockchain tools initialized');
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting Keyring Passive Agent (${this.config.accountId})`);
    console.log('==========================================');

    this.isRunning = true;

    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    try {
      const topicId = this.config.operatorInboundTopicId;
      if (topicId && topicId !== '0.0.0' && this.client) {
        console.log(`\n📥 Subscribing to operator inbound topic: ${topicId}`);
        this.subscribeToInbound(topicId);
      } else {
        console.log('\n✅ No OPERATOR_INBOUND_TOPIC_ID configured. Agent ready (manual trigger).');
      }
    } catch (error) {
      console.error('❌ Error starting keyring passive agent:', error);
      throw error;
    }
  }

  private subscribeToInbound(topicId: string): void {
    if (!this.client) throw new Error('Client not initialized');

    new TopicMessageQuery()
      .setTopicId(topicId)
      .subscribe(
        this.client,
        (_msg, err) => {
          if (err) console.error('❌ Inbound subscription error:', err);
        },
        (message) => {
          const text = new TextDecoder().decode(message.contents);
          console.log(
            `\n📥 ${message.consensusTimestamp.toDate().toISOString()} Inbound: ${text}`
          );
          this.onInboundMessage(text).catch((e) =>
            console.error('❌ Error handling inbound:', e)
          );
        }
      );
  }

  /**
   * Parse schedule ID from inbound topic message.
   * Supports: {"scheduleId": "0.0.1234"}, {"schedule_id": "0.0.1234"}, or plain "0.0.1234"
   */
  private parseScheduleIdFromMessage(payload: string): string | null {
    const trimmed = payload.trim();
    if (!trimmed) return null;

    // Try JSON parse
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const id = (parsed.scheduleId ?? parsed.schedule_id) as string | undefined;
        return typeof id === 'string' && id.length > 0 ? id : null;
      } catch {
        return null;
      }
    }

    // Plain schedule ID (e.g. "0.0.1234")
    if (/^0\.0\.\d+$/.test(trimmed)) return trimmed;
    return null;
  }

  private async onInboundMessage(payload: string): Promise<void> {
    const scheduleId = this.parseScheduleIdFromMessage(payload);
    if (!scheduleId) {
      console.warn('⚠️ No schedule ID in message; expected JSON {"scheduleId":"0.0.x"} or plain "0.0.x"');
      return;
    }

    if (!this.getScheduleInfoTool || !this.signTransactionTool) {
      console.error('❌ Tools not initialized');
      return;
    }

    try {
      console.log(`📋 Processing schedule from operator: ${scheduleId}`);
      await this.processSchedule(scheduleId);
    } catch (e) {
      console.error('❌ Check flow error:', e);
      throw e;
    }
  }

  /**
   * Operator-initiated: sign immediately. No rejection check, no sig count minimum.
   */
  private async processSchedule(scheduleId: string): Promise<void> {
    if (!this.getScheduleInfoTool || !this.signTransactionTool) {
      return;
    }

    console.log(`\n📋 Processing schedule ${scheduleId}...`);

    const scheduleResult = await this.getScheduleInfoTool.invoke({ scheduleId });
    const scheduleData = JSON.parse(scheduleResult as string) as {
      success: boolean;
      executed?: boolean;
      error?: string;
    };

    if (!scheduleData.success) {
      console.log(`   ⚠️ Could not get schedule info: ${scheduleData.error}`);
      return;
    }

    if (scheduleData.executed) {
      console.log(`   ℹ️ Schedule already executed. Skipping.`);
      return;
    }

    console.log(`   ✅ Signing...`);
    const signResult = await this.signTransactionTool.invoke({ scheduleId });
    const signData = JSON.parse(signResult as string) as {
      success: boolean;
      message?: string;
      error?: string;
    };
    if (signData.success) {
      console.log(`   ✅ ${signData.message}`);
    } else {
      console.log(`   ❌ Sign failed: ${signData.error}`);
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Keyring Passive Agent...');
    this.isRunning = false;
    console.log('✅ Keyring Passive Agent stopped');
  }
}

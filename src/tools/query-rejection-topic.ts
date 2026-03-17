import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';

/**
 * Query the HCS2-indexed rejection topic for messages about a specific schedule.
 * Rejection messages typically include scheduleId, reviewer, riskLevel, reviewDescription.
 * Fetches recent messages and filters by scheduleId.
 */
export class QueryRejectionTopicTool extends StructuredTool {
  name = 'query_rejection_topic';
  description =
    'Query the rejection topic (HCS2 index type) for messages about a specific schedule. Returns any rejection messages that mention this scheduleId. Use this to check if other signers have rejected the transaction before deciding to sign.';
  schema = z.object({
    topicId: z.string().describe('The rejection topic ID (from PROJECT_REJECTION_TOPIC)'),
    scheduleId: z.string().describe('The schedule ID to search for rejections (format: 0.0.xxxxx)'),
    limit: z.number().optional().default(50).describe('Max messages to fetch (default 50)'),
  });

  constructor(private readonly network: string = process.env.HEDERA_NETWORK?.toLowerCase() ?? 'testnet') {
    super();
  }

  private getMirrorNodeUrl(): string {
    return this.network === 'mainnet'
      ? 'https://mainnet.mirrornode.hedera.com'
      : 'https://testnet.mirrornode.hedera.com';
  }

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const { topicId, scheduleId, limit } = input;

    try {
      const mirrorNodeUrl = this.getMirrorNodeUrl();
      const url = `${mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Mirror node request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { messages?: Array<{ message: string; sequence_number: number; consensus_timestamp: string }> };
      const messages = data.messages ?? [];

      const rejectionsForSchedule: Array<{
        sequence: number;
        timestamp: string;
        scheduleId?: string;
        reviewer?: string;
        riskLevel?: string;
        reviewDescription?: string;
        raw: unknown;
      }> = [];

      for (const msg of messages) {
        try {
          const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(decoded) as Record<string, unknown>;
          } catch {
            continue;
          }

          const msgScheduleId = String(parsed.scheduleId ?? parsed.schedule_id ?? '').trim();
          const norm = (s: string) => s.replace(/^0+\.0+\./, '');
          if (msgScheduleId === scheduleId || norm(msgScheduleId) === norm(scheduleId)) {
            rejectionsForSchedule.push({
              sequence: msg.sequence_number,
              timestamp: msg.consensus_timestamp,
              scheduleId: msgScheduleId || undefined,
              reviewer: parsed.reviewer as string | undefined,
              riskLevel: parsed.riskLevel as string | undefined,
              reviewDescription: parsed.reviewDescription as string | undefined,
              raw: parsed,
            });
          }
        } catch {
          continue;
        }
      }

      return JSON.stringify(
        {
          success: true,
          topicId,
          scheduleId,
          rejectionCount: rejectionsForSchedule.length,
          rejections: rejectionsForSchedule,
        },
        null,
        2
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return JSON.stringify(
        {
          success: false,
          topicId,
          scheduleId,
          error: errorMessage,
        },
        null,
        2
      );
    }
  }
}

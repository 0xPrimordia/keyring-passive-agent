import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import type { Client } from '@hashgraph/sdk';

interface ScheduleData {
  schedule_id: string;
  creator_account_id: string;
  payer_account_id: string;
  memo?: string;
  executed_timestamp?: string;
  deleted?: boolean;
  signatures?: Array<{ public_key_prefix: string }>;
}

export class GetScheduleInfoTool extends StructuredTool {
  name = 'get_schedule_info';
  description =
    'Get schedule details from the Hedera mirror node: signature count, executed status, memo. Use this to check if a schedule has at least 2 signatures before signing.';
  schema = z.object({
    scheduleId: z.string().describe('The schedule ID to query (format: 0.0.xxxxx)'),
  });

  constructor(private readonly client: Client) {
    super();
  }

  private getMirrorNodeUrl(): string {
    const network = this.client.ledgerId?.toString() ?? 'testnet';
    return network === 'mainnet'
      ? 'https://mainnet.mirrornode.hedera.com'
      : 'https://testnet.mirrornode.hedera.com';
  }

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const { scheduleId } = input;

    try {
      const mirrorNodeUrl = this.getMirrorNodeUrl();
      const response = await fetch(`${mirrorNodeUrl}/api/v1/schedules/${scheduleId}`);

      if (!response.ok) {
        throw new Error(`Mirror node request failed: ${response.status} ${response.statusText}`);
      }

      const scheduleData = (await response.json()) as ScheduleData;
      const signatureCount = scheduleData.signatures?.length ?? 0;

      return JSON.stringify(
        {
          success: true,
          scheduleId: scheduleData.schedule_id,
          creatorAccountId: scheduleData.creator_account_id,
          payerAccountId: scheduleData.payer_account_id,
          memo: scheduleData.memo ?? null,
          signatureCount,
          executed: !!scheduleData.executed_timestamp,
          deleted: scheduleData.deleted ?? false,
        },
        null,
        2
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return JSON.stringify(
        {
          success: false,
          scheduleId,
          error: errorMessage,
        },
        null,
        2
      );
    }
  }
}

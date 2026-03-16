import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { Client, ScheduleSignTransaction, ScheduleId } from '@hashgraph/sdk';

export class SignTransactionTool extends StructuredTool {
  name = 'sign_transaction';
  description =
    "Sign a pending scheduled transaction on the Hedera blockchain using this agent's private key. Only call this after confirming: (1) no valid rejections exist for this schedule, and (2) the schedule has at least 2 signatures.";
  schema = z.object({
    scheduleId: z.string().describe('The schedule ID to sign (format: 0.0.xxxxx)'),
  });

  constructor(private readonly client: Client) {
    super();
  }

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const { scheduleId } = input;

    try {
      const scheduleIdObj = ScheduleId.fromString(scheduleId);
      const signTx = await new ScheduleSignTransaction()
        .setScheduleId(scheduleIdObj)
        .execute(this.client);

      const receipt = await signTx.getReceipt(this.client);

      return JSON.stringify(
        {
          success: true,
          scheduleId,
          transactionId: signTx.transactionId?.toString(),
          status: receipt.status.toString(),
          message: `Successfully signed scheduled transaction ${scheduleId}`,
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
          message: `Failed to sign scheduled transaction ${scheduleId}`,
        },
        null,
        2
      );
    }
  }
}

import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import type { Client } from '@hashgraph/sdk';

interface PendingSchedule {
  schedule_id: string;
  creator_account_id: string;
  payer_account_id: string;
  transaction_body: string;
  signatures?: Array<{ public_key_prefix: string }>;
  executed_timestamp?: string;
  deleted?: boolean;
}

export class FetchPendingTransactionsTool extends StructuredTool {
  name = 'fetch_pending_transactions';
  description =
    "Fetch pending scheduled transactions from the Hedera mirror node that require this agent's signature. Queries schedules created by the project operator and filters for those involving accounts with threshold key lists containing this agent's public key.";
  schema = z.object({
    projectOperatorAccountId: z
      .string()
      .describe(
        'The operator account ID from the project registry that creates scheduled transactions'
      ),
  });

  constructor(
    private readonly client: Client,
    private readonly agentPublicKey: string
  ) {
    super();
  }

  private getMirrorNodeUrl(): string {
    const network = this.client.ledgerId?.toString() ?? 'testnet';
    return network === 'mainnet'
      ? 'https://mainnet.mirrornode.hedera.com'
      : 'https://testnet.mirrornode.hedera.com';
  }

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const { projectOperatorAccountId } = input;

    try {
      const mirrorNodeUrl = this.getMirrorNodeUrl();

      const response = await fetch(
        `${mirrorNodeUrl}/api/v1/schedules?account.id=${projectOperatorAccountId}&order=desc&limit=50`
      );

      if (!response.ok) {
        throw new Error(`Mirror node request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { schedules?: PendingSchedule[] };
      const schedules: PendingSchedule[] = data.schedules ?? [];

      const allPendingSchedules: PendingSchedule[] = [];

      for (const schedule of schedules) {
        if (schedule.executed_timestamp || schedule.deleted) continue;

        try {
          const txBodyBase64 = schedule.transaction_body;
          const txBodyBytes = Buffer.from(txBodyBase64, 'base64');
          const txBodyHex = txBodyBytes.toString('hex');

          const decodeVarint = (bytes: number[]): number => {
            let result = 0;
            let shift = 0;
            for (const byte of bytes) {
              result |= (byte & 0x7f) << shift;
              if ((byte & 0x80) === 0) break;
              shift += 7;
            }
            return result;
          };

          const accountsInTx: string[] = [];
          for (let i = 0; i < txBodyHex.length - 2; i += 2) {
            if (txBodyHex.slice(i, i + 2) === '18') {
              const varintBytes: number[] = [];
              let offset = i + 2;
              while (offset < txBodyHex.length) {
                const byte = parseInt(txBodyHex.slice(offset, offset + 2), 16);
                varintBytes.push(byte);
                offset += 2;
                if ((byte & 0x80) === 0) break;
                if (varintBytes.length > 10) break;
              }
              if (varintBytes.length > 0) {
                const accountNum = decodeVarint(varintBytes);
                if (accountNum > 0 && accountNum < 100000000) {
                  accountsInTx.push(`0.0.${accountNum}`);
                }
              }
            }
          }

          if (schedule.payer_account_id && !accountsInTx.includes(schedule.payer_account_id)) {
            accountsInTx.push(schedule.payer_account_id);
          }

          let requiresMySignature = false;

          for (const acctId of accountsInTx) {
            try {
              const acctResponse = await fetch(`${mirrorNodeUrl}/api/v1/accounts/${acctId}`);
              if (!acctResponse.ok) continue;

              const acctData = (await acctResponse.json()) as { key?: { _type?: string; key?: string } };
              const key = acctData.key;

              if (key?._type === 'ProtobufEncoded' && key.key) {
                const keyHex = key.key;
                if (keyHex.includes(this.agentPublicKey)) {
                  const mySignature = schedule.signatures?.find((sig: { public_key_prefix: string }) => {
                    const sigKeyHex = Buffer.from(sig.public_key_prefix, 'base64').toString('hex');
                    return sigKeyHex === this.agentPublicKey || this.agentPublicKey.includes(sigKeyHex);
                  });
                  if (!mySignature) {
                    requiresMySignature = true;
                    break;
                  }
                }
              }
            } catch {
              continue;
            }
          }

          if (requiresMySignature) {
            allPendingSchedules.push(schedule);
          }
        } catch {
          continue;
        }
      }

      return JSON.stringify(
        {
          success: true,
          count: allPendingSchedules.length,
          schedules: allPendingSchedules.map((s) => ({
            schedule_id: s.schedule_id,
            creator_account_id: s.creator_account_id,
            payer_account_id: s.payer_account_id,
          })),
        },
        null,
        2
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return JSON.stringify(
        {
          success: false,
          error: errorMessage,
        },
        null,
        2
      );
    }
  }
}

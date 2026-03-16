# Event Trigger Stack (Separate Stack)

This document describes the **upstream event trigger stack** that notifies the passive agent when to review a specific scheduled transaction. This is a **separate stack** from the keyring-passive-agent and is not a concern of this repo.

## Overview

The passive agent subscribes to the **operator inbound topic** (OPERATOR_INBOUND_TOPIC_ID). All agents subscribe to the same topic; messages are from the keyring operator. When a schedule ID is posted, each agent fetches and signs the schedule if conditions are met.

```
[Scheduled contract executes at interval]
         ↓
[Emits event on-chain (includes schedule ID)]
         ↓
[Listener: RPC Relay eth_subscribe]
         ↓
[Posts schedule ID to HCS inbound topic]
         ↓
[Passive agent receives → processes that schedule only]
```

### Message Format

The trigger posts a message containing the schedule ID. Supported formats:

- JSON: `{"scheduleId": "0.0.1234"}` or `{"schedule_id": "0.0.1234"}`
- Plain: `0.0.1234`

## Why Contract Can't Trigger Directly

Smart contracts run in the EVM sandbox and **cannot make HTTP calls**. They can only:

- Emit events
- Call other contracts
- Use Hedera system contracts (HSS, HTS, etc.)

So an off-chain listener is required to bridge the contract event to the agent's inbound topic.

## Hedera Solution: RPC Relay + eth_subscribe

The Hedera JSON-RPC Relay supports **`eth_subscribe`** (HIP-694) for real-time contract events via WebSocket. This is Hedera's equivalent to Alchemy-style hooks.

| Alchemy Hooks | Hedera RPC Relay |
|---------------|------------------|
| HTTP webhook: Alchemy POSTs to your URL when events occur | WebSocket: you maintain a connection, events pushed over it |
| No persistent connection | Persistent WebSocket connection |
| You expose an HTTP endpoint | You run a client that connects to the Relay |

### eth_subscribe Example

Connect to the Relay WebSocket and subscribe to contract logs:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_subscribe",
  "params": [
    "logs",
    {
      "address": "0x...",
      "topics": ["0x..."]
    }
  ]
}
```

When a matching event occurs, the Relay pushes it over the WebSocket. Use `eth_unsubscribe` to cancel.

**References:**

- [HIP-694: Real-time events in JSON-RPC Relay](https://hips.hedera.com/hip/hip-694)
- [Validation Cloud eth_subscribe (Hedera)](https://docs.validationcloud.io/v1/hedera/json-rpc-relay-api/eth_subscribe)

## Listener Implementation Options

| Approach | How it works | Pros | Cons |
|----------|--------------|------|------|
| **Custom listener** | Small process connects to RPC Relay WebSocket, subscribes to contract events, posts to HCS topic on event | Full control, single process | You run and maintain it |
| **Mirror node + indexer** | Mirror node streams events; indexer or webhook service forwards to HCS | Uses existing infra | More moving parts |
| **Managed RPC** | Use Validation Cloud (or similar) WebSocket endpoint instead of self-hosted Relay | No Relay ops | Depends on provider |

## Recommended Flow

1. **Scheduled contract** runs at the desired interval (e.g. via HSS `scheduleCall` or `scheduleCallWithPayer`).
2. Contract **emits an event** when it executes (event should include the schedule ID that needs review).
3. **Listener service** maintains WebSocket connection to Hedera RPC Relay, subscribes via `eth_subscribe` to that contract's events.
4. On event: listener **extracts the schedule ID** from the event and **posts it to the HCS inbound topic** (using Hedera SDK `TopicMessageSubmitTransaction`).
5. **Passive agent** receives the message, parses the schedule ID, and processes only that schedule.

The agent stays simple: it only reacts to inbound topic messages and processes the specific schedule ID provided. No timers, no API, same flow for many agents.

## Self-Invoking Contract Patterns (HSS scheduleCall)

Contracts can use HSS `scheduleCall` (HIP-1215) to schedule future execution. Key behaviors:

### Init per transaction

Each `scheduleCall` creates a **new** schedule entity. Any transaction (user call, contract call, or prior scheduled execution) can trigger a new schedule. Multiple independent schedules can run in parallel.

### Run once vs. infinite repeat

| Pattern | Behavior |
|---------|----------|
| **Run once** | Scheduled function does its work and does **not** call `scheduleCall` at the end. |
| **Infinite repeat** | Scheduled function calls `scheduleCall` at the end to schedule the next run. |
| **Limited runs** | Track a counter; only call `scheduleCall` when `runsRemaining > 0`. |

The contract logic controls whether execution continues or stops.

### Schedule limits

- **Max future window**: 62 days (5,356,800 seconds).
- **Cost**: Same per cycle regardless of expiry (1 min vs 7 days). Longer intervals = fewer cycles = lower total cost over time.

## Listener Deployment: Hashio & Performance

### Hashio (dev/test)

- **Endpoints**: `wss://testnet.hashio.io/ws`, `wss://mainnet.hashio.io/ws`
- **No sign-up**; free for development.
- **Rate limits**: ~50 HBAR/min, 100–1,600 req/min per IP. One worker with one subscription is typically well under limits.
- **Not for production**—use a commercial relay or self-hosted relay.

### Performance

- **Latency**: Relay polls Mirror node at most every 2 seconds (HIP-694). Expect ~1–2 seconds from consensus to event delivery.
- **Worker load**: One WebSocket connection, low CPU/memory.
- **Reliability**: Implement reconnection and re-subscribe logic; subscriptions may have TTL.

### Render deployment

The listener is a **Background Worker** (not a Web Service)—long-running process, no HTTP, runs continuously.

## ScheduleReviewTrigger Contract

The contract lives in `hardhat/contracts/ScheduleReviewTrigger.sol` in this repo.

### Behavior

- **`scheduleReviewTrigger(string scheduleId, uint256 durationSeconds)`** — payable, requires 1 HBAR
- User passes the schedule ID to review (e.g. `"0.0.1234"`) and delay in seconds
- Contract schedules a one-time call to `emitReviewTrigger(scheduleId)` at `now + durationSeconds`
- When the schedule runs, it emits **`ReviewTriggered(string scheduleId)`**
- Listener subscribes to this event and posts the schedule ID to the HCS inbound topic

### Build & Deploy

```bash
npm run contracts:build
# Set HEDERA_DEPLOYER_PRIVATE_KEY in .env, then:
npm run contracts:deploy
```

Deploy with 1 HBAR to fund the contract (it pays gas when the scheduled call executes). The contract must hold HBAR to act as payer for the HSS schedule.

### Event for Listener

Subscribe to `ReviewTriggered(string)` — the `scheduleId` argument is the value to post to the inbound topic.

## Related HIPs

- [HIP-755](https://hips.hedera.com/hip/hip-755) – Schedule Service system contract
- [HIP-756](https://hips.hedera.com/hip/hip-756) – Contract scheduled token create
- [HIP-1215](https://hips.hedera.com/hip/hip-1215) – Generalized scheduled contract calls (scheduleCall, etc.)
- [Hedera Schedule Service docs](https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts/hedera-schedule-service)

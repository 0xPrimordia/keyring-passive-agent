/**
 * Sends a test schedule to ScheduleReviewTrigger (60s delay).
 * Emits ReviewTriggered(scheduleId, topicId1, topicId2) for the listener stack.
 *
 * Requires: SCHEDULE_REVIEW_CONTRACT_ID, HEDERA_PRIVATE_KEY (or HEDERA_DEPLOYER_PRIVATE_KEY),
 *           OPERATOR_INBOUND_TOPIC_ID (or AGENT_CONFIGS with inboundTopicId for 2 agents)
 */
import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DURATION_SECONDS = 60;

const HEDERA_TOPIC_ID_REGEX = /^0\.0\.\d+$/;

function getInboundTopicIds(): [string, string] {
  const operatorTopic = process.env.OPERATOR_INBOUND_TOPIC_ID?.trim();
  if (operatorTopic && HEDERA_TOPIC_ID_REGEX.test(operatorTopic)) {
    return [operatorTopic, operatorTopic];
  }
  const raw = process.env.AGENT_CONFIGS;
  if (!raw) {
    throw new Error(
      "OPERATOR_INBOUND_TOPIC_ID or AGENT_CONFIGS (with inboundTopicId) required"
    );
  }
  const configs = JSON.parse(raw) as Array<{ inboundTopicId?: string }>;
  const ids = configs
    .map((c) => c.inboundTopicId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length < 2) {
    throw new Error(
      "AGENT_CONFIGS must have at least 2 agents with inboundTopicId"
    );
  }
  const [t1, t2] = [ids[0], ids[1]];
  if (!HEDERA_TOPIC_ID_REGEX.test(t1) || !HEDERA_TOPIC_ID_REGEX.test(t2)) {
    throw new Error(
      `Invalid topic ID format (expected 0.0.XXXXX): topic1=${t1}, topic2=${t2}`
    );
  }
  return [t1, t2];
}

async function main() {
  const contractAddress = process.env.SCHEDULE_REVIEW_CONTRACT_ID;
  const privateKey =
    process.env.HEDERA_PRIVATE_KEY || process.env.HEDERA_DEPLOYER_PRIVATE_KEY;
  const rpcUrl =
    process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";

  if (!contractAddress || !privateKey) {
    throw new Error(
      "Set SCHEDULE_REVIEW_CONTRACT_ID and HEDERA_PRIVATE_KEY (or HEDERA_DEPLOYER_PRIVATE_KEY) in .env"
    );
  }

  const [topicId1, topicId2] = getInboundTopicIds();
  const scheduleId = process.env.SCHEDULE_ID ?? "0.0.8097812";

  const artifactPath = join(
    __dirname,
    "../../artifacts/hardhat/contracts/ScheduleReviewTrigger.sol/ScheduleReviewTrigger.json"
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    contractAddress,
    artifact.abi,
    signer
  );

  console.log(
    "Source:",
    process.env.OPERATOR_INBOUND_TOPIC_ID ? "OPERATOR_INBOUND_TOPIC_ID" : "AGENT_CONFIGS"
  );
  console.log("Contract:", contractAddress);
  console.log("Schedule ID:", scheduleId);
  console.log("Topic 1 (inbound):", topicId1);
  console.log("Topic 2 (inbound):", topicId2);
  console.log("Duration:", DURATION_SECONDS, "seconds");
  console.log("");

  console.log("Sending scheduleReviewTrigger tx (1 HBAR)...");
  const tx = await contract.scheduleReviewTrigger(
    scheduleId,
    DURATION_SECONDS,
    topicId1,
    topicId2,
    { value: ethers.utils.parseEther("1") }
  );
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt?.blockNumber);
  console.log("\n✓ Done. Listener will receive ReviewTriggered(scheduleId, topicId1, topicId2) in ~60s.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

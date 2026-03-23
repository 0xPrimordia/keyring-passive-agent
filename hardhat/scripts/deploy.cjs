const hre = require("hardhat");

// Use CONTRACT_OPERATOR_KEY (ECDSA) for EVM deploy. ED25519 accounts won't work with ethers.

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer. Set CONTRACT_OPERATOR_KEY in .env (hex ECDSA key from portal.hedera.com)"
    );
  }
  console.log("Deploying with account:", deployer.address);

  // Deployer = only account that can call scheduleReviewTrigger
  const validator = deployer.address;

  const ScheduleReviewTrigger = await hre.ethers.getContractFactory(
    "ScheduleReviewTrigger",
    deployer
  );

  // Deploy with 1 HBAR to fund initial scheduled executions (contract is payer)
  const HBAR_TO_SEND = "1";
  const contract = await ScheduleReviewTrigger.deploy(validator, {
    value: hre.ethers.utils.parseEther(HBAR_TO_SEND),
  });

  await contract.deployed();
  const address = contract.address;
  console.log("ScheduleReviewTrigger deployed to:", address);
  console.log("Protected caller (deployer):", validator);
}

main().catch((err) => {
  const msg = String(err.message || err);
  if (msg.includes("Sender account not found") || msg.includes("PAYER_ACCOUNT_NOT_FOUND")) {
    console.error("\nSender account not found. CONTRACT_OPERATOR_KEY must be ECDSA (not ED25519).");
    console.error("Create an ECDSA account at portal.hedera.com and set CONTRACT_OPERATOR_KEY.");
    console.error("Or ensure HEDERA_NETWORK matches where your deployer account exists.");
  }
  console.error(err);
  process.exit(1);
});

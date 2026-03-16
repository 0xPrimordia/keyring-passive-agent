const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account. Set HEDERA_DEPLOYER_PRIVATE_KEY (or HEDERA_PRIVATE_KEY) in .env (hex ECDSA key from Hedera Portal)"
    );
  }
  console.log("Deploying with account:", deployer.address);

  const ScheduleReviewTrigger = await hre.ethers.getContractFactory(
    "ScheduleReviewTrigger",
    deployer
  );

  // Deploy with 1 HBAR to fund initial scheduled executions (contract is payer)
  const HBAR_TO_SEND = "1";
  const contract = await ScheduleReviewTrigger.deploy({
    value: hre.ethers.utils.parseEther(HBAR_TO_SEND),
  });

  await contract.deployed();
  const address = contract.address;
  console.log("ScheduleReviewTrigger deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

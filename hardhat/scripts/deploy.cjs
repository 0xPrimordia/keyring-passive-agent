const hre = require("hardhat");

// Use CONTRACT_OPERATOR_KEY (ECDSA) for EVM deploy. ED25519 accounts won't work with ethers.

/** Derive EVM address for Hedera account 0.0.X (account-num format). */
function validatorAddressFromAccountId(accountId) {
  const match = String(accountId).match(/^0\.0\.(\d+)$/);
  if (!match) return null;
  const accountNum = parseInt(match[1], 10);
  const hex = accountNum.toString(16).padStart(40, "0");
  return "0x" + hex;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer. Set CONTRACT_OPERATOR_KEY in .env (hex ECDSA key from portal.hedera.com)"
    );
  }
  console.log("Deploying with account:", deployer.address);
  if (process.env.CONTRACT_OPERATOR) {
    console.log("Contract operator (CONTRACT_OPERATOR):", process.env.CONTRACT_OPERATOR);
  }

  const validatorEvm = process.env.VALIDATOR_EVM_ADDRESS;
  const validatorAccountId = process.env.VALIDATOR_ACCOUNT_ID;
  let validator;
  if (validatorEvm) {
    validator = validatorEvm.startsWith("0x") ? validatorEvm : "0x" + validatorEvm;
  } else if (validatorAccountId) {
    validator = validatorAddressFromAccountId(validatorAccountId);
    if (!validator) {
      throw new Error(
        "VALIDATOR_ACCOUNT_ID must be 0.0.X format. Or set VALIDATOR_EVM_ADDRESS directly."
      );
    }
    console.log("Validator from VALIDATOR_ACCOUNT_ID:", validatorAccountId, "->", validator);
  } else {
    throw new Error(
      "Set VALIDATOR_ACCOUNT_ID (0.0.X) or VALIDATOR_EVM_ADDRESS in .env"
    );
  }

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
  console.log("Validator (only caller for scheduleReviewTrigger):", validator);
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

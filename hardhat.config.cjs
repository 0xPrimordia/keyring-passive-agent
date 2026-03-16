require("dotenv").config();
require("@nomiclabs/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./hardhat/contracts",
    scripts: "./hardhat/scripts",
  },
  networks: {
    testnet: {
      url: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
      accounts: (process.env.HEDERA_DEPLOYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY)
        ? [process.env.HEDERA_DEPLOYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY]
        : [],
    },
    mainnet: {
      url: process.env.HEDERA_RPC_URL || "https://mainnet.hashio.io/api",
      accounts: (process.env.HEDERA_DEPLOYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY)
        ? [process.env.HEDERA_DEPLOYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY]
        : [],
    },
  },
};

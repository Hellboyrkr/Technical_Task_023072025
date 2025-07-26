require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("dotenv").config();

module.exports = {
  solidity: {
  compilers: [
    {
      version: "0.8.28",
      settings: { optimizer: { enabled: true, runs: 200 } }
    },
    {
      version: "0.8.25",
      settings: { optimizer: { enabled: true, runs: 200 } }
    }
  ]
},
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
  gasReporter: {
    enabled: true,
    currency: "USD"
  }
};
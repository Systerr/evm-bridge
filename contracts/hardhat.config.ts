import type { HardhatUserConfig } from "hardhat/config";
import { loadEnvFile } from "node:process";
loadEnvFile();
import "@nomicfoundation/hardhat-toolbox-viem";
const config: HardhatUserConfig = {
  solidity: "0.8.30",
  networks: {
    chainA: {
      url: process.env.CHAIN_A_RPC_URL || "http://localhost:8545",
      accounts: process.env.OWNER_A_PRIVATE_KEY
        ? [process.env.OWNER_A_PRIVATE_KEY]
        : [],
    },
    chainB: {
      url: process.env.CHAIN_B_RPC_URL || "http://localhost:8546",
      accounts: process.env.OWNER_B_PRIVATE_KEY
        ? [process.env.OWNER_B_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;

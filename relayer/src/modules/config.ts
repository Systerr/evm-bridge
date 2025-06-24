// Environment configuration
export interface Config {
  chainARpcUrl: string;
  chainBRpcUrl: string;
  bridgeAAddress: string;
  bridgeBAddress: string;
  privateKey: string;
  pollInterval: number;
  lastBlockFile: string;
}

/**
 * Load configuration from environment variables
 */

export function loadConfig(): Config {
  const requiredEnvVars = [
    "CHAIN_A_RPC_URL",
    "CHAIN_B_RPC_URL",
    "BRIDGE_A_ADDRESS",
    "BRIDGE_B_ADDRESS",
    "PRIVATE_KEY",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    chainARpcUrl: process.env.CHAIN_A_RPC_URL!,
    chainBRpcUrl: process.env.CHAIN_B_RPC_URL!,
    bridgeAAddress: process.env.BRIDGE_A_ADDRESS!,
    bridgeBAddress: process.env.BRIDGE_B_ADDRESS!,
    privateKey: process.env.PRIVATE_KEY!,
    pollInterval: parseInt(process.env.POLL_INTERVAL || "5000"), // 5 seconds default
    lastBlockFile: process.env.LAST_BLOCK_FILE || "./last_block.txt",
  };
}

export function loadDemoConfig() {
  const requiredEnvVars = ["OWNER_A_PRIVATE_KEY", "DEMO_USER_PRIVATE_KEY"];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
  return {
    ownerAPrivateKey: process.env.OWNER_A_PRIVATE_KEY!,
    demoUserPrivateKey: process.env.DEMO_USER_PRIVATE_KEY!,
  };
}

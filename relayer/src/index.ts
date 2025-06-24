import fs from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { setTimeout } from "node:timers/promises";
import { ethers } from "ethers";
import { BRIDGE_A_ABI, BRIDGE_B_ABI } from "./modules/abi.ts";
import type { Config } from "./modules/config.ts";
import { loadConfig } from "./modules/config.ts";

// Load environment variables
try {
  loadEnvFile();
} catch {
  // .env file might not exist, which is fine
}

// TokensLocked event structure
interface TokensLockedEvent {
  nonce: bigint;
  destinationAddress: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
}

// In-memory storage for processed nonces
const processedNonces = new Set<string>();

class BridgeRelayer {
  private config: Config;
  private chainAProvider: ethers.JsonRpcProvider;
  private chainBProvider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private bridgeAContract: ethers.Contract;
  private bridgeBContract: ethers.Contract;
  private isRunning: boolean = false;

  constructor(config: Config) {
    this.config = config;

    // Initialize providers
    this.chainAProvider = new ethers.JsonRpcProvider(config.chainARpcUrl);
    this.chainBProvider = new ethers.JsonRpcProvider(config.chainBRpcUrl);

    // Initialize wallet (connected to Chain B for submitting transactions)
    this.wallet = new ethers.Wallet(config.privateKey, this.chainBProvider);

    // Initialize contracts
    this.bridgeAContract = new ethers.Contract(
      config.bridgeAAddress,
      BRIDGE_A_ABI,
      this.chainAProvider,
    );

    this.bridgeBContract = new ethers.Contract(
      config.bridgeBAddress,
      BRIDGE_B_ABI,
      this.wallet,
    );
  }

  /**
   * Get the last processed block number from file or return a default
   */
  private async getLastProcessedBlock(): Promise<number> {
    try {
      const data = await fs.readFile(this.config.lastBlockFile, "utf8");
      const blockNumber = parseInt(data.trim());
      console.log(`Resuming from last processed block: ${blockNumber}`);
      return blockNumber;
    } catch {
      // File doesn't exist or other error - this is fine for first run
      console.log("No previous block file found, starting fresh");
    }

    // Default to current block - 100 to catch recent events
    return 0; // Will be set to current block - 100 in start()
  }

  /**
   * Save the last processed block number to file
   */
  private async saveLastProcessedBlock(blockNumber: number): Promise<void> {
    try {
      await fs.writeFile(this.config.lastBlockFile, blockNumber.toString());
    } catch (error) {
      console.error("Error saving last block file:", error);
    }
  }

  /**
   * Create message hash compatible with the smart contract
   */
  private createMessageHash(
    recipient: string,
    amount: bigint,
    nonce: bigint,
  ): string {
    return ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256"],
        [recipient, amount, nonce],
      ),
    );
  }

  /**
   * Sign a message hash
   */
  private async signMessage(messageHash: string): Promise<string> {
    return await this.wallet.signMessage(ethers.getBytes(messageHash));
  }

  /**
   * Process a TokensLocked event
   */
  private async processTokensLockedEvent(
    event: TokensLockedEvent,
  ): Promise<void> {
    const nonceKey = `${event.nonce.toString()}`;

    // Check if already processed
    if (processedNonces.has(nonceKey)) {
      console.error(`Nonce ${event.nonce} already processed, skipping`);
      return;
    }

    try {
      console.log(`Processing TokensLocked event:`, {
        nonce: event.nonce.toString(),
        recipient: event.destinationAddress,
        amount: ethers.formatEther(event.amount),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      });

      // Create message hash
      const messageHash = this.createMessageHash(
        event.destinationAddress,
        event.amount,
        event.nonce,
      );

      // Sign the message
      const signature = await this.signMessage(messageHash);

      console.log(`Created signature for nonce ${event.nonce}: ${signature}`);

      // Submit to Chain B
      const tx = await this.bridgeBContract.releaseTokens(
        event.destinationAddress,
        event.amount,
        event.nonce,
        signature,
      );

      console.log(`Submitted transaction to Chain B: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(
          `✅ Successfully processed nonce ${event.nonce} in block ${receipt.blockNumber}`,
        );
        processedNonces.add(nonceKey);
      } else {
        throw new Error(`Transaction failed with status ${receipt.status}`);
      }
    } catch (error) {
      console.error(`❌ Error processing nonce ${event.nonce}:`, error);

      // Check if it's a nonce already used error
      if (
        error instanceof Error &&
        error.message.includes("Nonce has already been used")
      ) {
        console.log(
          `Nonce ${event.nonce} already used on Chain B, marking as processed`,
        );
        processedNonces.add(nonceKey);
      } else {
        // Re-throw other errors to be handled by caller
        throw error;
      }
    }
  }

  /**
   * Fetch and process events from a block range
   */
  private async processEventsFromRange(
    fromBlock: number,
    toBlock: number,
  ): Promise<void> {
    try {
      console.log(
        `Fetching TokensLocked events from block ${fromBlock} to ${toBlock}`,
      );

      const filter = this.bridgeAContract.filters.TokensLocked();
      const events = await this.bridgeAContract.queryFilter(
        filter,
        fromBlock,
        toBlock,
      );

      console.log(`Found ${events.length} TokensLocked events`);

      for (const event of events) {
        // Type guard to ensure we have an EventLog with args
        if (!("args" in event) || !event.args) continue;

        const tokensLockedEvent: TokensLockedEvent = {
          nonce: event.args[0],
          destinationAddress: event.args[1],
          amount: event.args[2],
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        };

        await this.processTokensLockedEvent(tokensLockedEvent);
      }

      // Save the last processed block
      await this.saveLastProcessedBlock(toBlock);
    } catch (error) {
      console.error(
        `Error processing events from blocks ${fromBlock}-${toBlock}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Main polling loop
   */
  private async pollForEvents(): Promise<void> {
    let lastProcessedBlock = await this.getLastProcessedBlock();

    // If starting fresh, begin from recent blocks
    if (lastProcessedBlock === 0) {
      const currentBlock = await this.chainAProvider.getBlockNumber();
      lastProcessedBlock = Math.max(0, currentBlock - 100);
      console.log(
        `Starting from block ${lastProcessedBlock} (current: ${currentBlock})`,
      );
    }

    while (this.isRunning) {
      try {
        const currentBlock = await this.chainAProvider.getBlockNumber();

        if (currentBlock > lastProcessedBlock) {
          await this.processEventsFromRange(
            lastProcessedBlock + 1,
            currentBlock,
          );
          lastProcessedBlock = currentBlock;
        }

        // Wait before next poll
        await setTimeout(this.config.pollInterval);
      } catch (error) {
        console.error("Error in polling loop:", error);

        // Wait longer before retrying on error
        await setTimeout(this.config.pollInterval * 2);
      }
    }
  }

  /**
   * Start the relayer service
   */
  public async start(): Promise<void> {
    console.log("🚀 Starting Bridge Relayer...");

    try {
      // Verify connections
      const chainANetwork = await this.chainAProvider.getNetwork();
      const chainBNetwork = await this.chainBProvider.getNetwork();
      const walletAddress = await this.wallet.getAddress();

      console.log(
        `Connected to Chain A: (${chainANetwork.chainId})`,
      );
      console.log(
        `Connected to Chain B: (${chainBNetwork.chainId})`,
      );
      console.log(`Relayer wallet address: ${walletAddress}`);
      console.log(`Bridge A address: ${this.config.bridgeAAddress}`);
      console.log(`Bridge B address: ${this.config.bridgeBAddress}`);

      // Check wallet balance
      const balance = await this.chainBProvider.getBalance(walletAddress);
      console.log(
        `Wallet balance on Chain B: ${ethers.formatEther(balance)} ETH`,
      );

      if (balance === 0n) {
        console.warn(
          "⚠️  Warning: Wallet has no balance on Chain B for gas fees",
        );
      }

      this.isRunning = true;

      // Start polling
      await this.pollForEvents();
    } catch (error) {
      console.error("Failed to start relayer:", error);
      throw error;
    }
  }

  /**
   * Stop the relayer service
   */
  public stop(): void {
    console.log("🛑 Stopping Bridge Relayer...");
    this.isRunning = false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const config = loadConfig();
    const relayer = new BridgeRelayer(config);

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nReceived SIGINT, shutting down gracefully...");
      relayer.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\nReceived SIGTERM, shutting down gracefully...");
      relayer.stop();
      process.exit(0);
    });

    // Start the relayer
    await relayer.start();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);

import { loadEnvFile } from "node:process";
import readline from "node:readline/promises";
import { setTimeout } from "node:timers/promises";
import { ethers } from "ethers";

try {
  loadEnvFile();
} catch {
  // .env file might not exist, which is fine
}

import { BRIDGE_A_ABI, BRIDGE_B_ABI, SUPER_TOKEN_ABI } from "./modules/abi.ts";
import { loadConfig, loadDemoConfig } from "./modules/config.ts";

/**
 * Simple Bridge User Interaction Script
 *
 * This script demonstrates the user-facing steps of bridging tokens from Chain A to Chain B:
 * 1. Owner sends tokens to user account
 * 2. User approves tokens for bridge
 * 3. User locks tokens on Chain A bridge
 *
 * Step 4 (monitoring and releasing on Chain B) is handled automatically by the relayer service (index.ts)
 */

interface BridgeTransaction {
  nonce: bigint;
  destinationAddress: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
}

const waitForEnter = async (text = "Press ENTER key to continue...") => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await rl.question(text);
  await rl.close();
};

class BridgeInteractionDemo {
  private chainAProvider: ethers.JsonRpcProvider;
  private chainBProvider: ethers.JsonRpcProvider;
  private ownerWallet: ethers.Wallet;
  private userWalletA: ethers.Wallet;
  private bridgeAContract: ethers.Contract;
  private bridgeBContract: ethers.Contract;
  private superTokenContract: ethers.Contract;
  private superTokenBContract: ethers.Contract;

  constructor() {
    const mainConfig = loadConfig();
    const demoConfig = loadDemoConfig();

    // Initialize providers
    this.chainAProvider = new ethers.JsonRpcProvider(mainConfig.chainARpcUrl);
    this.chainBProvider = new ethers.JsonRpcProvider(mainConfig.chainBRpcUrl);

    // Initialize owner wallet (acts as token owner for demo)
    this.ownerWallet = new ethers.Wallet(
      demoConfig.ownerAPrivateKey,
      this.chainAProvider,
    );

    this.userWalletA = new ethers.Wallet(
      demoConfig.demoUserPrivateKey,
      this.chainAProvider,
    );

    // Initialize contracts
    this.bridgeAContract = new ethers.Contract(
      mainConfig.bridgeAAddress,
      BRIDGE_A_ABI,
      this.chainAProvider,
    );

    this.bridgeBContract = new ethers.Contract(
      mainConfig.bridgeBAddress,
      BRIDGE_B_ABI,
      this.chainBProvider,
    );
  }

  async initAdresses() {
    const superTokenAddress = await this.bridgeAContract.superToken();
    this.superTokenContract = new ethers.Contract(
      superTokenAddress,
      SUPER_TOKEN_ABI,
      this.chainAProvider,
    );

    const superTokenBAddress = await this.bridgeBContract.superTokenB();

    this.superTokenBContract = new ethers.Contract(
      superTokenBAddress,
      SUPER_TOKEN_ABI,
      this.chainBProvider,
    );
  }

  /**
   * STEP 1: Owner sends tokens to user account
   * This simulates the initial token distribution
   */
  async step1_OwnerSendsTokensToUser(
    userAddress: string,
    amount: string,
  ): Promise<void> {
    console.log("\n=== STEP 1: OWNER SENDS TOKENS TO USER ===");
    console.log(`👤 Owner Address: ${this.ownerWallet.address}`);
    console.log(`🎯 User Address: ${userAddress}`);
    console.log(`💰 Amount: ${amount} SUP tokens`);

    try {
      // Check owner's balance
      const ownerBalance = await this.superTokenContract.balanceOf(
        this.ownerWallet.address,
      );
      console.log(
        `📊 Owner's current balance: ${ethers.formatEther(ownerBalance)} SUP`,
      );

      if (ownerBalance < ethers.parseEther(amount)) {
        throw new Error(
          `Insufficient balance. Owner has ${ethers.formatEther(
            ownerBalance,
          )} SUP, needs ${amount} SUP`,
        );
      }

      // Transfer tokens to user
      const transferTx = await (
        this.superTokenContract.connect(this.ownerWallet) as any
      ).transfer(userAddress, ethers.parseEther(amount));

      console.log(`📤 Transfer transaction sent: ${transferTx.hash}`);
      console.log("⏳ Waiting for confirmation...");

      const receipt = await transferTx.wait();
      console.log(`✅ Transfer confirmed in block ${receipt.blockNumber}`);

      // Verify transfer
      const userBalance = await this.superTokenContract.balanceOf(userAddress);
      console.log(
        `💰 User's new balance: ${ethers.formatEther(userBalance)} SUP`,
      );

      const newOwnerBalance = await this.superTokenContract.balanceOf(
        this.ownerWallet.address,
      );
      console.log(
        `💰 Owner's new balance: ${ethers.formatEther(newOwnerBalance)} SUP`,
      );
    } catch (error) {
      console.error("❌ Error in step 1:", error);
      throw error;
    }
  }

  /**
   * STEP 2: User approves tokens for bridge
   * This allows the bridge contract to spend user's tokens
   */
  async step2_UserApprovesTokens(amount: string): Promise<void> {
    console.log("\n=== STEP 2: USER APPROVES TOKENS FOR BRIDGE ===");

    try {
      // Create user wallet
      console.log(`👤 User Address: ${this.userWalletA.address}`);
      console.log(`🏦 Bridge A Address: ${this.bridgeAContract.target}`);
      console.log(`💰 Approval Amount: ${amount} SUP tokens`);

      // Check user's current balance
      const userBalance = await this.superTokenContract.balanceOf(
        this.userWalletA.address,
      );
      console.log(
        `📊 User's current balance: ${ethers.formatEther(userBalance)} SUP`,
      );

      if (userBalance < ethers.parseEther(amount)) {
        throw new Error(
          `Insufficient balance. User has ${ethers.formatEther(
            userBalance,
          )} SUP, needs ${amount} SUP`,
        );
      }

      // Check current allowance
      const currentAllowance = await this.superTokenContract.allowance(
        this.userWalletA.address,
        this.bridgeAContract.target,
      );
      console.log(
        `📊 Current allowance: ${ethers.formatEther(currentAllowance)} SUP`,
      );

      // Approve tokens
      const approveTx = await (
        this.superTokenContract.connect(this.userWalletA) as any
      ).approve(this.bridgeAContract.target, ethers.parseEther(amount));

      console.log(`📤 Approval transaction sent: ${approveTx.hash}`);
      console.log("⏳ Waiting for confirmation...");

      const receipt = await approveTx.wait();
      console.log(`✅ Approval confirmed in block ${receipt.blockNumber}`);

      // Verify approval
      const newAllowance = await this.superTokenContract.allowance(
        this.userWalletA.address,
        this.bridgeAContract.target,
      );
      console.log(`💰 New allowance: ${ethers.formatEther(newAllowance)} SUP`);

      console.log("🎉 User has successfully approved tokens for bridge!");
    } catch (error) {
      console.error("❌ Error in step 2:", error);
      throw error;
    }
  }

  /**
   * STEP 3: User locks tokens on Chain A bridge
   * This initiates the bridge process and emits TokensLocked event
   */
  async step3_UserLocksTokensOnBridge(
    amount: string,
    destinationAddress?: string,
  ): Promise<BridgeTransaction> {
    console.log("\n=== STEP 3: USER LOCKS TOKENS ON CHAIN A BRIDGE ===");

    try {
      // Create user wallet
      const recipient = destinationAddress || this.userWalletA.address;

      console.log(`👤 User Address: ${this.userWalletA.address}`);
      console.log(`🎯 Destination Address (Chain B): ${recipient}`);
      console.log(`💰 Bridge Amount: ${amount} SUP tokens`);
      console.log(`🌉 Bridge Contract: ${this.bridgeAContract.target}`);

      // Check allowance
      const allowance = await this.superTokenContract.allowance(
        this.userWalletA.address,
        this.bridgeAContract.target,
      );

      if (allowance < ethers.parseEther(amount)) {
        throw new Error(
          `Insufficient allowance. Current: ${ethers.formatEther(
            allowance,
          )} SUP, needed: ${amount} SUP`,
        );
      }

      // Get current bridge balance for verification
      const bridgeBalanceBefore = await this.superTokenContract.balanceOf(
        this.bridgeAContract.target,
      );
      console.log(
        `📊 Bridge balance before: ${ethers.formatEther(
          bridgeBalanceBefore,
        )} SUP`,
      );

      // Lock tokens
      const lockTx = await (
        this.bridgeAContract.connect(this.userWalletA) as any
      ).lockTokens(ethers.parseEther(amount), recipient);

      console.log(`📤 Lock transaction sent: ${lockTx.hash}`);
      console.log("⏳ Waiting for confirmation...");

      const receipt = await lockTx.wait();
      console.log(`✅ Lock confirmed in block ${receipt.blockNumber}`);

      // Parse the TokensLocked event
      const lockEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.bridgeAContract.interface.parseLog(log);
          return parsed?.name === "TokensLocked";
        } catch {
          return false;
        }
      });

      if (!lockEvent) {
        throw new Error("TokensLocked event not found in transaction receipt");
      }

      const parsedEvent = this.bridgeAContract.interface.parseLog(lockEvent);
      if (!parsedEvent) {
        throw new Error("Failed to parse TokensLocked event");
      }
      const {
        nonce,
        destinationAddress: eventDestination,
        amount: eventAmount,
      } = parsedEvent.args;

      console.log(`🎫 Bridge Nonce: ${nonce}`);
      console.log(`🎯 Event Destination: ${eventDestination}`);
      console.log(`💰 Event Amount: ${ethers.formatEther(eventAmount)} SUP`);

      // Verify balances
      const userBalanceAfter = await this.superTokenContract.balanceOf(
        this.userWalletA.address,
      );
      const bridgeBalanceAfter = await this.superTokenContract.balanceOf(
        this.bridgeAContract.target,
      );

      console.log(
        `📊 User balance after: ${ethers.formatEther(userBalanceAfter)} SUP`,
      );
      console.log(
        `📊 Bridge balance after: ${ethers.formatEther(bridgeBalanceAfter)} SUP`,
      );

      const bridgeTransaction: BridgeTransaction = {
        nonce: nonce,
        destinationAddress: eventDestination,
        amount: eventAmount,
        blockNumber: receipt.blockNumber,
        transactionHash: lockTx.hash,
      };

      console.log("🎉 Tokens successfully locked on Chain A!");
      console.log(
        `📝 TokensLocked event emitted - relayer will process this automatically`,
      );
      console.log(`🔄 The relayer service (index.ts) will now:`);
      console.log(`   1. Detect the TokensLocked event`);
      console.log(`   2. Create a cryptographic signature`);
      console.log(`   3. Submit releaseTokens transaction on Chain B`);
      console.log(`   4. Mint tokens to the destination address`);

      return bridgeTransaction;
    } catch (error) {
      console.error("❌ Error in step 3:", error);
      throw error;
    }
  }

  /**
   * STEP 4: Monitor Chain B for token arrival
   * This step waits and checks if tokens have arrived on Chain B
   * The actual processing is done by the relayer service (index.ts)
   */
  async step4_MonitorChainBForArrival(
    bridgeTransaction: BridgeTransaction,
    timeoutSeconds: number = 60,
  ): Promise<void> {
    console.log("\n=== STEP 4: MONITOR CHAIN B FOR TOKEN ARRIVAL ===");
    console.log(`🔍 Monitoring for tokens to arrive on Chain B...`);
    console.log(`⏰ Timeout: ${timeoutSeconds} seconds`);
    console.log(`🎫 Watching for nonce: ${bridgeTransaction.nonce}`);
    console.log(`🎯 Destination: ${bridgeTransaction.destinationAddress}`);
    console.log(
      `💰 Expected amount: ${ethers.formatEther(bridgeTransaction.amount)} SUP`,
    );

    try {
      const initialBalance = await this.superTokenBContract.balanceOf(
        bridgeTransaction.destinationAddress,
      );
      console.log(
        `📊 Initial balance on Chain B: ${ethers.formatEther(
          initialBalance,
        )} SUP`,
      );

      const startTime = Date.now();
      const timeoutMs = timeoutSeconds * 1000;

      while (Date.now() - startTime < timeoutMs) {
        const currentBalance = await this.superTokenBContract.balanceOf(
          bridgeTransaction.destinationAddress,
        );

        if (currentBalance > initialBalance) {
          const receivedAmount = currentBalance - initialBalance;
          console.log(`✅ Tokens arrived on Chain B!`);
          console.log(
            `📊 New balance: ${ethers.formatEther(currentBalance)} SUP`,
          );
          console.log(`📈 Received: ${ethers.formatEther(receivedAmount)} SUP`);
          console.log(`🎉 Bridge process completed successfully!`);
          return;
        }

        // Wait 2 seconds before checking again
        await setTimeout(2000);
        process.stdout.write(".");
      }

      console.log(`\n⏰ Timeout reached. Tokens may still be processing...`);
      console.log(`💡 Check the relayer service logs for more details`);
    } catch (error) {
      console.error("❌ Error monitoring Chain B:", error);
      throw error;
    }
  }

  /**
   * Utility function to check balances on both chains
   */
  async checkBalances(address: string): Promise<void> {
    console.log(`\n📊 BALANCE CHECK FOR ${address}`);

    try {
      // Chain A balance
      const balanceA = await this.superTokenContract.balanceOf(address);
      console.log(`Chain A (SUP): ${ethers.formatEther(balanceA)} SUP`);

      const balanceB = await this.superTokenBContract.balanceOf(address);
      console.log(`Chain B (SUPB): ${ethers.formatEther(balanceB)} SUP`);
    } catch (error) {
      console.error("❌ Error checking balances:", error);
    }
  }

  /**
   * Run user interaction steps (1-3)
   * Step 4 is handled by the relayer service
   */
  async runUserInteractionSteps(): Promise<BridgeTransaction> {
    console.log("🌉 STARTING BRIDGE USER INTERACTION");
    console.log("===================================");
    console.log(
      "📝 Note: Make sure the relayer service (index.ts) is running to complete the bridge process",
    );

    try {
      const userAddress = this.userWalletA.address;
      const bridgeAmount = "100"; // 100 SUP tokens

      console.log(`🎭 Demo User Address: ${this.userWalletA.address}`);
      console.log(`💰 Bridge Amount: ${bridgeAmount} SUP`);
      await waitForEnter();

      // Initial balance check
      await this.checkBalances(userAddress);
      await waitForEnter();

      // Step 1: Owner sends tokens to user
      await this.step1_OwnerSendsTokensToUser(userAddress, bridgeAmount);
      await waitForEnter();

      // Step 2: User approves tokens
      await this.step2_UserApprovesTokens(bridgeAmount);
      await waitForEnter();

      // Step 3: User locks tokens on bridge
      const bridgeTransaction =
        await this.step3_UserLocksTokensOnBridge(bridgeAmount);

      console.log("\n✅ USER INTERACTION STEPS COMPLETED!");
      console.log("====================================");
      console.log("🔄 The relayer service will now automatically:");
      console.log("   • Detect the TokensLocked event");
      console.log("   • Create and submit the release transaction on Chain B");
      console.log("   • Mint tokens to the destination address");

      // Monitor for completion
      await this.step4_MonitorChainBForArrival(bridgeTransaction);
      await waitForEnter();

      // Final balance check
      await this.checkBalances(bridgeTransaction.destinationAddress);
      await waitForEnter();

      return bridgeTransaction;
    } catch (error) {
      console.error("❌ User interaction failed:", error);
      throw error;
    }
  }
}

// Main execution function
async function main() {
  const demo = new BridgeInteractionDemo();
  await demo.initAdresses();
  try {
    await demo.runUserInteractionSteps();
  } catch (error) {
    console.error("❌ Bridge interaction failed:", error);
    process.exit(1);
  }
}

main();

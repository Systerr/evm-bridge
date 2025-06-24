import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import {
  getAddress,
  parseEther,
  keccak256,
  encodePacked,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

describe("Bridge End-to-End Tests", function () {
  // Fixture that deploys both bridges and tokens for complete testing
  async function deployFullBridgeSystemFixture() {
    const initialSupply = parseEther("1000000"); // 1 million tokens

    // Get wallet clients
    const [owner, user1, user2, user3] = await hre.viem.getWalletClients();

    // Create a dedicated bridge signer with known private key for signature testing
    const bridgePrivateKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const bridgeAccount = privateKeyToAccount(bridgePrivateKey);
    const bridgeAddress = bridgeAccount.address;

    // Deploy SuperToken (Chain A)
    const superToken = await hre.viem.deployContract("SuperToken", [
      initialSupply,
    ]);

    // Deploy Bridge (Chain A)
    const bridge = await hre.viem.deployContract("Bridge", [
      superToken.address,
    ]);

    // Deploy SuperTokenB (Chain B). 
    // In our case it only one chain as this is a limitations of hardhat 2
    // they promise try testing with multi chains in a version 3
    const superTokenB = await hre.viem.deployContract("SuperTokenB", [
      initialSupply,
    ]);

    // Deploy BridgeB (Chain B)
    const bridgeB = await hre.viem.deployContract("BridgeB", [
      superTokenB.address,
    ]);

    // Set BridgeB as relay for SuperTokenB so it can mint tokens
    await superTokenB.write.setRelay([bridgeB.address]);

    // Set the bridge address in BridgeB contract
    await bridgeB.write.updateBridgeAddress([bridgeAddress]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      // Chain A contracts
      bridge,
      superToken,
      // Chain B contracts
      bridgeB,
      superTokenB,
      // Test accounts
      owner,
      user1,
      user2,
      user3,
      // Bridge system
      bridgeAccount,
      bridgeAddress,
      bridgePrivateKey,
      // Utils
      initialSupply,
      publicClient,
    };
  }

  // Helper function to create a valid signature for BridgeB
  async function createValidSignature(
    recipient: string,
    amount: bigint,
    nonce: bigint,
    bridgeAccount: any
  ) {
    // Create message hash exactly as the BridgeB contract does
    const messageHash = keccak256(
      encodePacked(
        ["address", "uint256", "uint256"],
        [recipient as `0x${string}`, amount, nonce]
      )
    );

    // Sign the message hash
    const signature = await bridgeAccount.signMessage({
      message: { raw: messageHash },
    });

    return signature;
  }

  // Helper function to simulate the off-chain bridge system
  async function simulateOffChainBridgeSystem(
    bridge: any,
    bridgeAccount: any,
    publicClient: any,
    fromBlock: bigint,
    toBlock?: bigint
  ) {
    // Get all TokensLocked events from Bridge
    const events = await publicClient.getLogs({
      address: bridge.address,
      event: parseAbiItem(
        "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
      ),
      fromBlock: fromBlock,
      toBlock: toBlock || "latest",
    });

    // Process each event and create signatures
    const signatures = [];
    for (const event of events) {
      const { nonce, destinationAddress, amount } = event.args;
      
      // Create signature for BridgeB release
      const signature = await createValidSignature(
        destinationAddress,
        amount,
        nonce,
        bridgeAccount
      );

      signatures.push({
        nonce,
        destinationAddress,
        amount,
        signature,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    }

    return signatures;
  }

  describe("Complete Bridge Flow", function () {
    it("Should successfully bridge tokens from Chain A to Chain B", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("100");
      const recipient = getAddress(user1.account.address);

      // Step 1: Check initial balances
      const initialOwnerBalanceA = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      const initialUser1BalanceB = await superTokenB.read.balanceOf([recipient]);
      const initialBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      console.log("Initial state:");
      console.log(`Owner balance on Chain A: ${initialOwnerBalanceA}`);
      console.log(`User1 balance on Chain B: ${initialUser1BalanceB}`);
      console.log(`Bridge balance on Chain A: ${initialBridgeBalance}`);

      // Step 2: Lock tokens on Chain A (Bridge)
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: owner.account,
      });

      const lockTxHash = await bridge.write.lockTokens([bridgeAmount, recipient], {
        account: owner.account,
      });

      const lockReceipt = await publicClient.waitForTransactionReceipt({
        hash: lockTxHash,
      });

      console.log(`\nTokens locked on Chain A at block ${lockReceipt.blockNumber}`);

      // Step 3: Verify lock event and balances
      const afterLockOwnerBalance = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      const afterLockBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      expect(afterLockOwnerBalance).to.equal(initialOwnerBalanceA - bridgeAmount);
      expect(afterLockBridgeBalance).to.equal(initialBridgeBalance + bridgeAmount);

      // Step 4: Simulate off-chain bridge system detecting the lock
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        lockReceipt.blockNumber
      );

      expect(bridgeSignatures).to.have.length(1);
      const { nonce, destinationAddress, amount, signature } = bridgeSignatures[0];

      console.log(`\nOff-chain system processed lock event:`);
      console.log(`Nonce: ${nonce}`);
      console.log(`Destination: ${destinationAddress}`);
      console.log(`Amount: ${amount}`);

      // Step 5: Release tokens on Chain B (BridgeB)
      const releaseTxHash = await bridgeB.write.releaseTokens([
        destinationAddress,
        amount,
        nonce,
        signature,
      ]);

      const releaseReceipt = await publicClient.waitForTransactionReceipt({
        hash: releaseTxHash,
      });

      console.log(`\nTokens released on Chain B at block ${releaseReceipt.blockNumber}`);

      // Step 6: Verify final balances
      const finalUser1BalanceB = await superTokenB.read.balanceOf([recipient]);

      expect(finalUser1BalanceB).to.equal(initialUser1BalanceB + bridgeAmount);

      console.log(`\nFinal state:`);
      console.log(`User1 balance on Chain B: ${finalUser1BalanceB}`);

      // Step 7: Verify events were emitted correctly
      const lockEvents = await publicClient.getLogs({
        address: bridge.address,
        event: parseAbiItem(
          "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
        ),
        fromBlock: lockReceipt.blockNumber,
        toBlock: lockReceipt.blockNumber,
      });

      const releaseEvents = await publicClient.getLogs({
        address: bridgeB.address,
        event: parseAbiItem(
          "event TokensClaimed(uint256 indexed nonce, address indexed recipient, uint256 indexed amount)"
        ),
        fromBlock: releaseReceipt.blockNumber,
        toBlock: releaseReceipt.blockNumber,
      });

      expect(lockEvents).to.have.length(1);
      expect(releaseEvents).to.have.length(1);

      expect(lockEvents[0].args.nonce).to.equal(nonce);
      expect(lockEvents[0].args.destinationAddress).to.equal(destinationAddress);
      expect(lockEvents[0].args.amount).to.equal(amount);

      expect(releaseEvents[0].args.nonce).to.equal(nonce);
      expect(releaseEvents[0].args.recipient).to.equal(destinationAddress);
      expect(releaseEvents[0].args.amount).to.equal(amount);
    });

    it("Should handle multiple bridge transactions in sequence", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        user2,
        user3,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount1 = parseEther("50");
      const bridgeAmount2 = parseEther("75");
      const bridgeAmount3 = parseEther("100");

      const recipient1 = getAddress(user1.account.address);
      const recipient2 = getAddress(user2.account.address);
      const recipient3 = getAddress(user3.account.address);

      // Approve total amount
      const totalAmount = bridgeAmount1 + bridgeAmount2 + bridgeAmount3;
      await superToken.write.approve([bridge.address, totalAmount], {
        account: owner.account,
      });

      // Step 1: Lock tokens for multiple users
      const lockTx1 = await bridge.write.lockTokens([bridgeAmount1, recipient1], {
        account: owner.account,
      });
      const lockTx2 = await bridge.write.lockTokens([bridgeAmount2, recipient2], {
        account: owner.account,
      });
      const lockTx3 = await bridge.write.lockTokens([bridgeAmount3, recipient3], {
        account: owner.account,
      });

      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: lockTx1 });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: lockTx2 });
      const receipt3 = await publicClient.waitForTransactionReceipt({ hash: lockTx3 });

      // Step 2: Simulate off-chain system processing all events
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        receipt1.blockNumber,
        receipt3.blockNumber
      );

      expect(bridgeSignatures).to.have.length(3);

      // Step 3: Release tokens for all users
      for (const sigData of bridgeSignatures) {
        await bridgeB.write.releaseTokens([
          sigData.destinationAddress,
          sigData.amount,
          sigData.nonce,
          sigData.signature,
        ]);
      }

      // Step 4: Verify all users received their tokens
      const user1Balance = await superTokenB.read.balanceOf([recipient1]);
      const user2Balance = await superTokenB.read.balanceOf([recipient2]);
      const user3Balance = await superTokenB.read.balanceOf([recipient3]);

      expect(user1Balance).to.equal(bridgeAmount1);
      expect(user2Balance).to.equal(bridgeAmount2);
      expect(user3Balance).to.equal(bridgeAmount3);

      // Step 5: Verify nonces are sequential
      const sortedSignatures = bridgeSignatures.sort((a, b) => 
        Number(a.nonce) - Number(b.nonce)
      );
      
      expect(sortedSignatures[0].nonce).to.equal(1n);
      expect(sortedSignatures[1].nonce).to.equal(2n);
      expect(sortedSignatures[2].nonce).to.equal(3n);
    });

    it("Should handle bridge transactions with same recipient", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount1 = parseEther("30");
      const bridgeAmount2 = parseEther("70");
      const recipient = getAddress(user1.account.address);

      // Approve total amount
      const totalAmount = bridgeAmount1 + bridgeAmount2;
      await superToken.write.approve([bridge.address, totalAmount], {
        account: owner.account,
      });

      // Step 1: Lock tokens twice for same recipient
      const lockTx1 = await bridge.write.lockTokens([bridgeAmount1, recipient], {
        account: owner.account,
      });
      const lockTx2 = await bridge.write.lockTokens([bridgeAmount2, recipient], {
        account: owner.account,
      });

      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: lockTx1 });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: lockTx2 });

      // Step 2: Process both transactions
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        receipt1.blockNumber,
        receipt2.blockNumber
      );

      expect(bridgeSignatures).to.have.length(2);

      // Step 3: Release both amounts
      for (const sigData of bridgeSignatures) {
        await bridgeB.write.releaseTokens([
          sigData.destinationAddress,
          sigData.amount,
          sigData.nonce,
          sigData.signature,
        ]);
      }

      // Step 4: Verify recipient received total amount
      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(bridgeAmount1 + bridgeAmount2);
    });

    it("Should prevent replay attacks with used nonces", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("100");
      const recipient = getAddress(user1.account.address);

      // Step 1: Complete a normal bridge transaction
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: owner.account,
      });

      const lockTxHash = await bridge.write.lockTokens([bridgeAmount, recipient], {
        account: owner.account,
      });

      const lockReceipt = await publicClient.waitForTransactionReceipt({
        hash: lockTxHash,
      });

      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        lockReceipt.blockNumber
      );

      const { nonce, destinationAddress, amount, signature } = bridgeSignatures[0];

      // Release tokens successfully
      await bridgeB.write.releaseTokens([
        destinationAddress,
        amount,
        nonce,
        signature,
      ]);

      // Verify tokens were received
      const balanceAfterFirst = await superTokenB.read.balanceOf([recipient]);
      expect(balanceAfterFirst).to.equal(bridgeAmount);

      // Step 2: Try to replay the same transaction
      await expect(
        bridgeB.write.releaseTokens([
          destinationAddress,
          amount,
          nonce,
          signature,
        ])
      ).to.be.rejectedWith("Bridge: Nonce has already been used.");

      // Step 3: Verify balance didn't change
      const balanceAfterReplay = await superTokenB.read.balanceOf([recipient]);
      expect(balanceAfterReplay).to.equal(balanceAfterFirst);
    });

    it("Should handle bridge transactions with different signers", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        user2,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("100");
      const recipient = getAddress(user1.account.address);

      // Step 1: Transfer tokens to user2 and let them bridge
      await superToken.write.transfer([getAddress(user2.account.address), bridgeAmount], {
        account: owner.account,
      });

      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: user2.account,
      });

      // user2 locks tokens for user1
      const lockTxHash = await bridge.write.lockTokens([bridgeAmount, recipient], {
        account: user2.account,
      });

      const lockReceipt = await publicClient.waitForTransactionReceipt({
        hash: lockTxHash,
      });

      // Step 2: Process the lock event
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        lockReceipt.blockNumber
      );

      const { nonce, destinationAddress, amount, signature } = bridgeSignatures[0];

      // Step 3: Anyone can call release (user1 calls it themselves)
      await bridgeB.write.releaseTokens([
        destinationAddress,
        amount,
        nonce,
        signature,
      ], {
        account: user1.account,
      });

      // Step 4: Verify user1 received the tokens
      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(bridgeAmount);

      // Step 5: Verify user2's balance on Chain A decreased
      const user2BalanceA = await superToken.read.balanceOf([
        getAddress(user2.account.address),
      ]);
      expect(user2BalanceA).to.equal(0n);
    });

    it("Should handle zero amount bridge transactions", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = 0n;
      const recipient = getAddress(user1.account.address);

      // Step 1: Lock zero tokens (should work but not transfer anything)
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: owner.account,
      });

      const lockTxHash = await bridge.write.lockTokens([bridgeAmount, recipient], {
        account: owner.account,
      });

      const lockReceipt = await publicClient.waitForTransactionReceipt({
        hash: lockTxHash,
      });

      // Step 2: Process the zero amount lock
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        lockReceipt.blockNumber
      );

      expect(bridgeSignatures).to.have.length(1);
      expect(bridgeSignatures[0].amount).to.equal(0n);

      // Step 3: Release zero tokens
      const { nonce, destinationAddress, amount, signature } = bridgeSignatures[0];

      await bridgeB.write.releaseTokens([
        destinationAddress,
        amount,
        nonce,
        signature,
      ]);

      // Step 4: Verify events were emitted even for zero amount
      const lockEvents = await publicClient.getLogs({
        address: bridge.address,
        event: parseAbiItem(
          "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
        ),
        fromBlock: lockReceipt.blockNumber,
        toBlock: lockReceipt.blockNumber,
      });

      expect(lockEvents).to.have.length(1);
      expect(lockEvents[0].args.amount).to.equal(0n);
    });

  });

  describe("Bridge System Security", function () {
    it("Should reject signatures from unauthorized signers", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        owner,
        user1,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("100");
      const recipient = getAddress(user1.account.address);

      // Step 1: Lock tokens normally
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: owner.account,
      });

      const lockTxHash = await bridge.write.lockTokens([bridgeAmount, recipient], {
        account: owner.account,
      });

      const lockReceipt = await publicClient.waitForTransactionReceipt({
        hash: lockTxHash,
      });

      // Step 2: Get the lock event details
      const events = await publicClient.getLogs({
        address: bridge.address,
        event: parseAbiItem(
          "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
        ),
        fromBlock: lockReceipt.blockNumber,
      });

      const { nonce, destinationAddress, amount } = events[0].args;

      // Step 3: Create signature with unauthorized signer
      const maliciousPrivateKey = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";
      const maliciousAccount = privateKeyToAccount(maliciousPrivateKey);

      const maliciousSignature = await createValidSignature(
        destinationAddress!,
        amount!,
        nonce!,
        maliciousAccount
      );

      // Step 4: Try to release with malicious signature
      await expect(
        bridgeB.write.releaseTokens([
          destinationAddress!,
          amount!,
          nonce!,
          maliciousSignature,
        ])
      ).to.be.rejectedWith("Bridge: Invalid signature.");
    });

    it("Should reject modified transaction parameters", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        owner,
        user1,
        user2,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("100");
      const recipient = getAddress(user1.account.address);

      // Step 1: Lock tokens normally
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: owner.account,
      });

      const lockTxHash = await bridge.write.lockTokens([bridgeAmount, recipient], {
        account: owner.account,
      });

      const lockReceipt = await publicClient.waitForTransactionReceipt({
        hash: lockTxHash,
      });

      // Step 2: Get valid signature
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        lockReceipt.blockNumber
      );

      const { nonce, amount, signature } = bridgeSignatures[0];

      // Step 3: Try to use signature with different recipient
      const differentRecipient = getAddress(user2.account.address);

      await expect(
        bridgeB.write.releaseTokens([
          differentRecipient, // Changed recipient
          amount,
          nonce,
          signature,
        ])
      ).to.be.rejectedWith("Bridge: Invalid signature.");

      // Step 4: Try to use signature with different amount
      await expect(
        bridgeB.write.releaseTokens([
          recipient,
          amount + parseEther("1"), // Changed amount
          nonce,
          signature,
        ])
      ).to.be.rejectedWith("Bridge: Invalid signature.");

      // Step 5: Try to use signature with different nonce
      await expect(
        bridgeB.write.releaseTokens([
          recipient,
          amount,
          nonce + 1n, // Changed nonce
          signature,
        ])
      ).to.be.rejectedWith("Bridge: Invalid signature.");
    });
  });

  describe("Bridge System Edge Cases", function () {
    it("Should handle rapid bridge operations without conflicts", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("10");
      const recipient = getAddress(user1.account.address);
      const numOperations = 5;

      // Step 1: Approve for all operations
      await superToken.write.approve([
        bridge.address, 
        bridgeAmount * BigInt(numOperations)
      ], {
        account: owner.account,
      });

      // Step 2: Perform lock operations sequentially to ensure they're in different blocks
      const lockHashes = [];
      const lockReceipts = [];
      
      for (let i = 0; i < numOperations; i++) {
        const hash = await bridge.write.lockTokens([bridgeAmount, recipient], {
          account: owner.account,
        });
        lockHashes.push(hash);
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        lockReceipts.push(receipt);
      }

      // Step 3: Process all lock events
      const firstBlock = lockReceipts[0].blockNumber;
      const lastBlock = lockReceipts[lockReceipts.length - 1].blockNumber;

      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        firstBlock,
        lastBlock
      );

      expect(bridgeSignatures).to.have.length(numOperations);

      // Step 4: Release all tokens
      const releasePromises = bridgeSignatures.map(sigData =>
        bridgeB.write.releaseTokens([
          sigData.destinationAddress,
          sigData.amount,
          sigData.nonce,
          sigData.signature,
        ])
      );

      await Promise.all(releasePromises);

      // Step 5: Verify final balance
      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(bridgeAmount * BigInt(numOperations));
    });

    it("Should maintain correct nonce sequence across multiple users", async function () {
      const {
        bridge,
        superToken,
        bridgeB,
        superTokenB,
        owner,
        user1,
        user2,
        user3,
        bridgeAccount,
        publicClient,
      } = await loadFixture(deployFullBridgeSystemFixture);

      const bridgeAmount = parseEther("50");

      // Step 1: Transfer tokens to users
      await superToken.write.transfer([getAddress(user1.account.address), bridgeAmount], {
        account: owner.account,
      });
      await superToken.write.transfer([getAddress(user2.account.address), bridgeAmount], {
        account: owner.account,
      });

      // Step 2: Each user approves and locks tokens
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: user1.account,
      });
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: user2.account,
      });
      await superToken.write.approve([bridge.address, bridgeAmount], {
        account: owner.account,
      });

      // Lock in specific order: user1, owner, user2
      const lock1 = await bridge.write.lockTokens([bridgeAmount], {
        account: user1.account, // user1 locks for themselves
      });
      const lock2 = await bridge.write.lockTokens([bridgeAmount, getAddress(user3.account.address)], {
        account: owner.account, // owner locks for user3
      });
      const lock3 = await bridge.write.lockTokens([bridgeAmount], {
        account: user2.account, // user2 locks for themselves
      });

      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: lock1 });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: lock2 });
      const receipt3 = await publicClient.waitForTransactionReceipt({ hash: lock3 });

      // Step 3: Process all events
      const bridgeSignatures = await simulateOffChainBridgeSystem(
        bridge,
        bridgeAccount,
        publicClient,
        receipt1.blockNumber,
        receipt3.blockNumber
      );

      expect(bridgeSignatures).to.have.length(3);

      // Step 4: Verify nonces are sequential regardless of user
      const sortedByNonce = bridgeSignatures.sort((a, b) => Number(a.nonce) - Number(b.nonce));
      
      expect(sortedByNonce[0].nonce).to.equal(1n);
      expect(sortedByNonce[1].nonce).to.equal(2n);
      expect(sortedByNonce[2].nonce).to.equal(3n);

      // Step 5: Release tokens for all users and verify destinations
      for (const sigData of bridgeSignatures) {
        await bridgeB.write.releaseTokens([
          sigData.destinationAddress,
          sigData.amount,
          sigData.nonce,
          sigData.signature,
        ]);
      }

      // Step 6: Verify correct recipients received tokens
      const user1FinalBalance = await superTokenB.read.balanceOf([getAddress(user1.account.address)]);
      const user2FinalBalance = await superTokenB.read.balanceOf([getAddress(user2.account.address)]);
      const user3FinalBalance = await superTokenB.read.balanceOf([getAddress(user3.account.address)]);

      expect(user1FinalBalance).to.equal(bridgeAmount); // user1 locked for themselves
      expect(user2FinalBalance).to.equal(bridgeAmount); // user2 locked for themselves
      expect(user3FinalBalance).to.equal(bridgeAmount); // owner locked for user3
    });
  });
});

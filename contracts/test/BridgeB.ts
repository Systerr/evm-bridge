import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import {
  getAddress,
  parseEther,
  zeroAddress,
  keccak256,
  encodePacked,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

describe("BridgeB", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployBridgeBFixture() {
    const initialSupply = parseEther("1000000"); // 1 million tokens

    // Contracts are deployed using the first signer/account by default
    const [owner, user1, user2] = await hre.viem.getWalletClients();

    // Create a dedicated bridge signer with known private key for signature testing
    const relayerPrivateKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const relayerAccount = privateKeyToAccount(relayerPrivateKey);
    const relayerAddress = relayerAccount.address;

    // Deploy SuperTokenB first
    const superTokenB = await hre.viem.deployContract("SuperTokenB", [
      initialSupply,
    ]);

    // Deploy BridgeB with SuperTokenB address
    const bridgeB = await hre.viem.deployContract("BridgeB", [
      superTokenB.address,
    ]);

    // Set BridgeB as relay for SuperTokenB so it can mint tokens
    await superTokenB.write.setRelay([bridgeB.address]);

    // Set the bridge address in BridgeB contract
    await bridgeB.write.updateRelayerAddress([relayerAddress]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      bridgeB,
      superTokenB,
      initialSupply,
      owner,
      user1,
      user2,
      relayerAccount,
      relayerAddress,
      relayerPrivateKey,
      publicClient,
    };
  }

  // Helper function to create a valid signature
  async function createValidSignature(
    recipient: string,
    amount: bigint,
    nonce: bigint,
    relayerAccount: any
  ) {
    // Create message hash exactly as the contract does
    const messageHash = keccak256(
      encodePacked(
        ["address", "uint256", "uint256"],
        [recipient as `0x${string}`, amount, nonce]
      )
    );

    // Sign the message hash
    const signature = await relayerAccount.signMessage({
      message: { raw: messageHash },
    });

    return signature;
  }

  describe("Deployment", function () {
    it("Should set the correct SuperTokenB address", async function () {
      const { bridgeB, superTokenB } = await loadFixture(deployBridgeBFixture);

      expect(await bridgeB.read.superTokenB()).to.equal(
        getAddress(superTokenB.address)
      );
    });

    it("Should set the owner correctly", async function () {
      const { bridgeB, owner } = await loadFixture(deployBridgeBFixture);

      expect(await bridgeB.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });

    it("Should revert if SuperTokenB address is zero", async function () {
      await expect(
        hre.viem.deployContract("BridgeB", [zeroAddress])
      ).to.be.rejectedWith("Token address cannot be zero");
    });

    it("Should initialize with zero bridge address", async function () {
      const { superTokenB } = await loadFixture(deployBridgeBFixture);

      const bridgeB = await hre.viem.deployContract("BridgeB", [
        superTokenB.address,
      ]);

      expect(await bridgeB.read.relayerAddress()).to.equal(zeroAddress);
    });
  });

  describe("Bridge Address Management", function () {
    it("Should allow owner to update bridge address", async function () {
      const { bridgeB, user1, publicClient } = await loadFixture(
        deployBridgeBFixture
      );

      const hash = await bridgeB.write.updateRelayerAddress([
        getAddress(user1.account.address),
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      expect(await bridgeB.read.relayerAddress()).to.equal(
        getAddress(user1.account.address)
      );
    });

    it("Should revert when non-owner tries to update bridge address", async function () {
      const { bridgeB, user1, user2 } = await loadFixture(deployBridgeBFixture);

      await expect(
        bridgeB.write.updateRelayerAddress(
          [getAddress(user2.account.address)],
          {
            account: user1.account,
          }
        )
      ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Should allow setting bridge address to zero (emergency case)", async function () {
      const { bridgeB, publicClient } = await loadFixture(deployBridgeBFixture);

      const hash = await bridgeB.write.updateRelayerAddress([zeroAddress]);
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await bridgeB.read.relayerAddress()).to.equal(zeroAddress);
    });
  });

  describe("Message Hash Generation", function () {
    it("Should generate consistent message hash", async function () {
      const { bridgeB } = await loadFixture(deployBridgeBFixture);

      const recipient = "0x1234567890123456789012345678901234567890";
      const amount = parseEther("100");
      const nonce = 1n;

      const hash1 = await bridgeB.read.getMessageHash([
        recipient,
        amount,
        nonce,
      ]);
      const hash2 = await bridgeB.read.getMessageHash([
        recipient,
        amount,
        nonce,
      ]);

      expect(hash1).to.equal(hash2);
    });

    it("Should generate different hashes for different parameters", async function () {
      const { bridgeB } = await loadFixture(deployBridgeBFixture);

      const recipient = "0x1234567890123456789012345678901234567890";
      const amount = parseEther("100");
      const nonce = 1n;

      const hash1 = await bridgeB.read.getMessageHash([
        recipient,
        amount,
        nonce,
      ]);
      const hash2 = await bridgeB.read.getMessageHash([
        recipient,
        amount,
        nonce + 1n,
      ]);
      const hash3 = await bridgeB.read.getMessageHash([
        recipient,
        amount + 1n,
        nonce,
      ]);

      expect(hash1).to.not.equal(hash2);
      expect(hash1).to.not.equal(hash3);
      expect(hash2).to.not.equal(hash3);
    });

    it("Should match JavaScript implementation of message hash", async function () {
      const { bridgeB } = await loadFixture(deployBridgeBFixture);

      const recipient = "0x1234567890123456789012345678901234567890";
      const amount = parseEther("100");
      const nonce = 42n;

      // Get hash from contract
      const contractHash = await bridgeB.read.getMessageHash([
        recipient,
        amount,
        nonce,
      ]);

      // Create same hash using JavaScript/viem (same as createValidSignature helper)
      const jsHash = keccak256(
        encodePacked(
          ["address", "uint256", "uint256"],
          [recipient as `0x${string}`, amount, nonce]
        )
      );

      // They should be identical
      expect(contractHash).to.equal(jsHash);
    });
  });

  describe("Token Release - Valid Scenarios", function () {
    it("Should successfully release tokens with valid signature from bridge", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 1n;

      // Create valid signature
      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      // Check initial balance
      const initialBalance = await superTokenB.read.balanceOf([recipient]);

      // Release tokens
      const hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce,
        signature,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      // Check final balance
      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(initialBalance + amount);
    });

    it("Should emit TokensClaimed event on successful release", async function () {
      const { bridgeB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("50");
      const nonce = 2n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      const hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce,
        signature,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      // Check events
      const events = await bridgeB.getEvents.TokensClaimed();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.nonce).to.equal(nonce);
      expect(events[0].args.recipient?.toLowerCase()).to.equal(
        recipient.toLowerCase()
      );
      expect(events[0].args.amount).to.equal(amount);
    });

    it("Should handle multiple token releases with different nonces", async function () {
      const {
        bridgeB,
        superTokenB,
        user1,
        user2,
        relayerAccount,
        publicClient,
      } = await loadFixture(deployBridgeBFixture);

      const recipient1 = getAddress(user1.account.address);
      const recipient2 = getAddress(user2.account.address);
      const amount1 = parseEther("100");
      const amount2 = parseEther("200");
      const nonce1 = 10n;
      const nonce2 = 11n;

      // Create signatures
      const signature1 = await createValidSignature(
        recipient1,
        amount1,
        nonce1,
        relayerAccount
      );
      const signature2 = await createValidSignature(
        recipient2,
        amount2,
        nonce2,
        relayerAccount
      );

      // Release tokens for user1
      let hash = await bridgeB.write.releaseTokens([
        recipient1,
        amount1,
        nonce1,
        signature1,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Release tokens for user2
      hash = await bridgeB.write.releaseTokens([
        recipient2,
        amount2,
        nonce2,
        signature2,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Check balances
      const balance1 = await superTokenB.read.balanceOf([recipient1]);
      const balance2 = await superTokenB.read.balanceOf([recipient2]);

      expect(balance1).to.equal(amount1);
      expect(balance2).to.equal(amount2);
    });

    it("Should work when called by any address (not just recipient)", async function () {
      const {
        bridgeB,
        superTokenB,
        user1,
        user2,
        relayerAccount,
        publicClient,
      } = await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("75");
      const nonce = 20n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      // user2 calls the function on behalf of user1
      const hash = await bridgeB.write.releaseTokens(
        [recipient, amount, nonce, signature],
        {
          account: user2.account,
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      // Check that user1 received the tokens
      const balance = await superTokenB.read.balanceOf([recipient]);
      expect(balance).to.equal(amount);
    });
  });

  describe("Token Release - Security & Validation", function () {
    it("Should revert with invalid signature", async function () {
      const { bridgeB, user1 } = await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 30n;

      // Create signature with wrong signer
      const maliciousAccount = privateKeyToAccount(
        "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
      );
      const invalidSignature = await createValidSignature(
        recipient,
        amount,
        nonce,
        maliciousAccount
      );

      await expect(
        bridgeB.write.releaseTokens([
          recipient,
          amount,
          nonce,
          invalidSignature,
        ])
      ).to.be.rejectedWith("Bridge: Invalid signature.");
    });

    it("Should revert when nonce is already used", async function () {
      const { bridgeB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 40n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      // First release should succeed
      let hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce,
        signature,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Second release with same nonce should fail
      await expect(
        bridgeB.write.releaseTokens([recipient, amount, nonce, signature])
      ).to.be.rejectedWith("Bridge: Nonce has already been used.");
    });

    it("Should revert with malformed signature", async function () {
      const { bridgeB, user1 } = await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 50n;

      // Invalid signature (too short)
      const invalidSignature = "0x1234";

      await expect(
        bridgeB.write.releaseTokens([
          recipient,
          amount,
          nonce,
          invalidSignature,
        ])
      ).to.be.rejected;
    });

    it("Should revert when bridge address is not set", async function () {
      const { superTokenB, user1 } = await loadFixture(deployBridgeBFixture);

      // Deploy new BridgeB without setting bridge address
      const newBridgeB = await hre.viem.deployContract("BridgeB", [
        superTokenB.address,
      ]);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 60n;

      // Create signature with any account
      const someAccount = privateKeyToAccount(
        "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
      );
      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        someAccount
      );

      await expect(
        newBridgeB.write.releaseTokens([recipient, amount, nonce, signature])
      ).to.be.rejectedWith("Bridge: Invalid signature.");
    });

    it("Should revert when signature is for different parameters", async function () {
      const { bridgeB, user1, user2, relayerAccount } = await loadFixture(
        deployBridgeBFixture
      );

      const recipient1 = getAddress(user1.account.address);
      const recipient2 = getAddress(user2.account.address);
      const amount = parseEther("100");
      const nonce = 70n;

      // Create signature for recipient1 but try to use for recipient2
      const signature = await createValidSignature(
        recipient1,
        amount,
        nonce,
        relayerAccount
      );

      await expect(
        bridgeB.write.releaseTokens([
          recipient2, // Different recipient
          amount,
          nonce,
          signature,
        ])
      ).to.be.rejectedWith("Bridge: Invalid signature.");
    });
  });

  describe("External Bridge System Integration", function () {
    it("Should handle signature from external bridge system", async function () {
      const { bridgeB, superTokenB, user1, publicClient } = await loadFixture(
        deployBridgeBFixture
      );

      // Simulate external bridge system generating signature
      const externalBridgeKey =
        "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
      const externalrelayerAccount = privateKeyToAccount(externalBridgeKey);

      // Update bridge address to external bridge
      let hash = await bridgeB.write.updateRelayerAddress([
        externalrelayerAccount.address,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("500");
      const nonce = 80n;

      // External system creates signature
      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        externalrelayerAccount
      );

      // Release tokens
      hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce,
        signature,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const balance = await superTokenB.read.balanceOf([recipient]);
      expect(balance).to.equal(amount);
    });

    it("Should handle bridge address rotation", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");

      // Use old bridge for first transaction
      const nonce1 = 90n;
      const signature1 = await createValidSignature(
        recipient,
        amount,
        nonce1,
        relayerAccount
      );

      let hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce1,
        signature1,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Rotate to new bridge
      const newBridgeKey =
        "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
      const newrelayerAccount = privateKeyToAccount(newBridgeKey);

      hash = await bridgeB.write.updateRelayerAddress([
        newrelayerAccount.address,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Old bridge signature should fail
      const nonce2 = 91n;
      const oldSignature = await createValidSignature(
        recipient,
        amount,
        nonce2,
        relayerAccount
      );

      await expect(
        bridgeB.write.releaseTokens([recipient, amount, nonce2, oldSignature])
      ).to.be.rejectedWith("Bridge: Invalid signature.");

      // New bridge signature should work
      const newSignature = await createValidSignature(
        recipient,
        amount,
        nonce2,
        newrelayerAccount
      );

      hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce2,
        newSignature,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(amount * 2n);
    });
  });

  describe("ETH Handling and Gas Considerations", function () {
    it("Should work with normal gas requirements", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      // Release tokens should work normally
      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 100n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      const releaseHash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce,
        signature,
      ]);
      await publicClient.waitForTransactionReceipt({ hash: releaseHash });

      const tokenBalance = await superTokenB.read.balanceOf([recipient]);
      expect(tokenBalance).to.equal(amount);
    });

    it("Should work when user pays gas for transaction", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 110n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      // User pays gas for their own transaction
      const initialEthBalance = await publicClient.getBalance({
        address: user1.account.address,
      });

      const hash = await bridgeB.write.releaseTokens(
        [recipient, amount, nonce, signature],
        {
          account: user1.account,
        }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Check that user paid gas
      const finalEthBalance = await publicClient.getBalance({
        address: user1.account.address,
      });
      const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
      expect(finalEthBalance).to.equal(initialEthBalance - gasUsed);

      // Check that tokens were received
      const tokenBalance = await superTokenB.read.balanceOf([recipient]);
      expect(tokenBalance).to.equal(amount);
    });

    it("Should work when external relayer pays gas", async function () {
      const {
        bridgeB,
        superTokenB,
        user1,
        user2,
        relayerAccount,
        publicClient,
      } = await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 120n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      // user2 acts as relayer and pays gas for user1's transaction
      const relayerInitialBalance = await publicClient.getBalance({
        address: user2.account.address,
      });

      const hash = await bridgeB.write.releaseTokens(
        [recipient, amount, nonce, signature],
        {
          account: user2.account, // Relayer pays gas
        }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Check that relayer paid gas
      const relayerFinalBalance = await publicClient.getBalance({
        address: user2.account.address,
      });
      const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
      expect(relayerFinalBalance).to.equal(relayerInitialBalance - gasUsed);

      // Check that user1 received tokens
      const tokenBalance = await superTokenB.read.balanceOf([recipient]);
      expect(tokenBalance).to.equal(amount);
    });
  });

  describe("Edge Cases and Stress Tests", function () {
    it("Should handle very large amounts", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const largeAmount = parseEther("1000000000"); // 1 billion tokens
      const nonce = 130n;

      const signature = await createValidSignature(
        recipient,
        largeAmount,
        nonce,
        relayerAccount
      );

      const hash = await bridgeB.write.releaseTokens([
        recipient,
        largeAmount,
        nonce,
        signature,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const balance = await superTokenB.read.balanceOf([recipient]);
      expect(balance).to.equal(largeAmount);
    });

    it("Should handle very large nonce values", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const largeNonce = 2n ** 200n; // Very large nonce

      const signature = await createValidSignature(
        recipient,
        amount,
        largeNonce,
        relayerAccount
      );

      const hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        largeNonce,
        signature,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const balance = await superTokenB.read.balanceOf([recipient]);
      expect(balance).to.equal(amount);
    });

    it("Should handle zero amount (edge case)", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const zeroAmount = 0n;
      const nonce = 140n;

      const signature = await createValidSignature(
        recipient,
        zeroAmount,
        nonce,
        relayerAccount
      );

      const hash = await bridgeB.write.releaseTokens([
        recipient,
        zeroAmount,
        nonce,
        signature,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      // Should emit event even for zero amount
      const events = await bridgeB.getEvents.TokensClaimed();
      const relevantEvents = events.filter((e) => e.args.nonce === nonce);
      expect(relevantEvents).to.have.lengthOf(1);
      expect(relevantEvents[0].args.amount).to.equal(zeroAmount);
    });

    it("Should handle rapid sequential transactions", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("10");
      const numTransactions = 5;

      const promises = [];
      for (let i = 0; i < numTransactions; i++) {
        const nonce = BigInt(150 + i);
        const signature = await createValidSignature(
          recipient,
          amount,
          nonce,
          relayerAccount
        );

        promises.push(
          bridgeB.write.releaseTokens([recipient, amount, nonce, signature])
        );
      }

      // Execute all transactions
      const hashes = await Promise.all(promises);

      // Wait for all receipts
      await Promise.all(
        hashes.map((hash) => publicClient.waitForTransactionReceipt({ hash }))
      );

      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(amount * BigInt(numTransactions));
    });
  });

  describe("Integration with SuperTokenB", function () {
    it("Should fail if BridgeB is not set as relay in SuperTokenB", async function () {
      const { superTokenB, user1, relayerAccount } = await loadFixture(
        deployBridgeBFixture
      );

      // Deploy new BridgeB without setting it as relay
      const newBridgeB = await hre.viem.deployContract("BridgeB", [
        superTokenB.address,
      ]);

      await newBridgeB.write.updateRelayerAddress([relayerAccount.address]);

      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce = 160n;

      const signature = await createValidSignature(
        recipient,
        amount,
        nonce,
        relayerAccount
      );

      await expect(
        newBridgeB.write.releaseTokens([recipient, amount, nonce, signature])
      ).to.be.rejectedWith("Caller is not the owner or the relay");
    });

    it("Should work correctly when SuperTokenB relay is changed", async function () {
      const { bridgeB, superTokenB, user1, relayerAccount, publicClient } =
        await loadFixture(deployBridgeBFixture);

      // First transaction should work
      const recipient = getAddress(user1.account.address);
      const amount = parseEther("100");
      const nonce1 = 170n;

      const signature1 = await createValidSignature(
        recipient,
        amount,
        nonce1,
        relayerAccount
      );

      let hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce1,
        signature1,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Remove BridgeB as relay
      hash = await superTokenB.write.setRelay([
        getAddress(user1.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Second transaction should fail
      const nonce2 = 171n;
      const signature2 = await createValidSignature(
        recipient,
        amount,
        nonce2,
        relayerAccount
      );

      await expect(
        bridgeB.write.releaseTokens([recipient, amount, nonce2, signature2])
      ).to.be.rejectedWith("Caller is not the owner or the relay");

      // Restore BridgeB as relay
      hash = await superTokenB.write.setRelay([bridgeB.address]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Third transaction should work again
      const nonce3 = 172n;
      const signature3 = await createValidSignature(
        recipient,
        amount,
        nonce3,
        relayerAccount
      );

      hash = await bridgeB.write.releaseTokens([
        recipient,
        amount,
        nonce3,
        signature3,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const finalBalance = await superTokenB.read.balanceOf([recipient]);
      expect(finalBalance).to.equal(amount * 2n); // Only first and third transactions succeeded
    });
  });
});

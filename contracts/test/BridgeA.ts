import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, zeroAddress, parseAbiItem } from "viem";

describe("BridgeA", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployBridgeFixture() {
    const initialSupply = parseEther("1000000"); // 1 million tokens

    // Contracts are deployed using the first signer/account by default
    const [owner, addr1, addr2, addr3] = await hre.viem.getWalletClients();

    // Deploy SuperToken first
    const superToken = await hre.viem.deployContract("SuperToken", [
      initialSupply,
    ]);

    // Deploy Bridge with SuperToken address
    const bridge = await hre.viem.deployContract("BridgeA", [
      superToken.address,
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      bridge,
      superToken,
      initialSupply,
      owner,
      addr1,
      addr2,
      addr3,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct SuperToken address", async function () {
      const { bridge, superToken } = await loadFixture(deployBridgeFixture);

      expect(await bridge.read.superToken()).to.equal(
        getAddress(superToken.address)
      );
    });

    it("Should set the correct owner", async function () {
      const { bridge, owner } = await loadFixture(deployBridgeFixture);

      expect(await bridge.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });

    it("Should revert if SuperToken address is zero", async function () {
      await expect(
        hre.viem.deployContract("BridgeA", [zeroAddress])
      ).to.be.rejectedWith("Token address cannot be zero");
    });

    it("Should initialize nonce correctly", async function () {
      const { bridge, superToken, owner, publicClient } = await loadFixture(
        deployBridgeFixture
      );

      // Since _currentNonce is private, we can test it indirectly by checking the first lock operation
      const amount = parseEther("100");

      // First approve tokens
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Lock tokens and check the event
      const hash = await bridge.write.lockTokens(
        [amount, getAddress(owner.account.address)],
        {
          account: owner.account,
        }
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Get TokensLocked events using the contract's getEvents method
      const tokensLockedEvents = await bridge.getEvents.TokensLocked();

      expect(tokensLockedEvents).to.have.length(1);
      // The nonce should be 1 for the first transaction (starts from 1, not 0)
      expect(tokensLockedEvents[0].args.nonce).to.equal(1n);
      expect(tokensLockedEvents[0].args.destinationAddress).to.equal(
        getAddress(owner.account.address)
      );
      expect(tokensLockedEvents[0].args.amount).to.equal(amount);
    });
  });

  describe("Lock Tokens", function () {
    it("Should lock tokens successfully", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("100");

      // Approve tokens first
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Check initial balances
      const initialOwnerBalance = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      const initialBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      // Lock tokens
      await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Check final balances
      const finalOwnerBalance = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      const finalBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      expect(finalOwnerBalance).to.equal(initialOwnerBalance - amount);
      expect(finalBridgeBalance).to.equal(initialBridgeBalance + amount);
    });

    it("Should emit TokensLocked event with correct parameters", async function () {
      const { bridge, superToken, owner, addr1, publicClient } =
        await loadFixture(deployBridgeFixture);
      const amount = parseEther("100");

      // Approve tokens first
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Lock tokens and get transaction hash
      const hash = await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      // Get TokensLocked events using the contract's getEvents method
      const tokensLockedEvents = await bridge.getEvents.TokensLocked();

      expect(tokensLockedEvents).to.have.length(1);

      // Check event parameters with type safety
      const event = tokensLockedEvents[0];
      expect(event.args.nonce).to.equal(1n); // First nonce should be 1
      expect(event.args.destinationAddress).to.equal(
        getAddress(addr1.account.address)
      );
      expect(event.args.amount).to.equal(amount);
    });

    it("Should increment nonce for each lock operation", async function () {
      // Deploy fresh contracts for this test to avoid event pollution
      const initialSupply = parseEther("1000000");
      const [owner, addr1, addr2] = await hre.viem.getWalletClients();

      const superToken = await hre.viem.deployContract("SuperToken", [
        initialSupply,
      ]);
      const bridge = await hre.viem.deployContract("BridgeA", [
        superToken.address,
      ]);
      const publicClient = await hre.viem.getPublicClient();

      const amount = parseEther("100");

      // Approve tokens for multiple operations
      await superToken.write.approve([bridge.address, amount * 3n], {
        account: owner.account,
      });

      // First lock
      const hash1 = await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Second lock
      const hash2 = await bridge.write.lockTokens(
        [amount, getAddress(addr2.account.address)],
        {
          account: owner.account,
        }
      );

      // Third lock
      const hash3 = await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Get all receipts
      const receipt1 = await publicClient.waitForTransactionReceipt({
        hash: hash1,
      });
      const receipt2 = await publicClient.waitForTransactionReceipt({
        hash: hash2,
      });
      const receipt3 = await publicClient.waitForTransactionReceipt({
        hash: hash3,
      });

      // Get all TokensLocked events using getLogs with proper event parsing
      const allEvents = await publicClient.getLogs({
        address: bridge.address,
        event: parseAbiItem(
          "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
        ),
        fromBlock: receipt1.blockNumber,
        toBlock: receipt3.blockNumber,
      });

      // Should have 3 events total
      expect(allEvents).to.have.length(3);

      // Check nonces increment correctly
      expect(allEvents[0].args.nonce).to.equal(1n);
      expect(allEvents[1].args.nonce).to.equal(2n);
      expect(allEvents[2].args.nonce).to.equal(3n);

      // Also verify destination addresses
      expect(allEvents[0].args.destinationAddress).to.equal(
        getAddress(addr1.account.address)
      );
      expect(allEvents[1].args.destinationAddress).to.equal(
        getAddress(addr2.account.address)
      );
      expect(allEvents[2].args.destinationAddress).to.equal(
        getAddress(addr1.account.address)
      );
    });

    it("Should revert if insufficient allowance", async function () {
      const { bridge, owner, addr1 } = await loadFixture(deployBridgeFixture);
      const amount = parseEther("100");

      // Don't approve tokens, try to lock
      await expect(
        bridge.write.lockTokens([amount, getAddress(addr1.account.address)], {
          account: owner.account,
        })
      ).to.be.rejectedWith("ERC20InsufficientAllowance");
    });

    it("Should revert if insufficient balance", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("2000000"); // More than initial supply

      // Approve more than balance
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Try to lock more than balance
      await expect(
        bridge.write.lockTokens([amount, getAddress(addr1.account.address)], {
          account: owner.account,
        })
      ).to.be.rejectedWith("ERC20InsufficientBalance");
    });

    it("Should handle zero amount", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const amount = 0n;

      // Approve zero amount
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Lock zero tokens - should work but not transfer anything
      await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Bridge balance should still be zero
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(0n);
    });
  });

  describe("Withdraw Tokens", function () {
    it("Should withdraw tokens successfully", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const lockAmount = parseEther("100");
      const withdrawAmount = parseEther("50");

      // First lock some tokens
      await superToken.write.approve([bridge.address, lockAmount], {
        account: owner.account,
      });
      await bridge.write.lockTokens(
        [lockAmount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Check initial balances
      const initialAddr1Balance = await superToken.read.balanceOf([
        getAddress(addr1.account.address),
      ]);
      const initialBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      // Withdraw tokens to addr1
      await bridge.write.withdrawTokens(
        [getAddress(addr1.account.address), withdrawAmount],
        {
          account: owner.account,
        }
      );

      // Check final balances
      const finalAddr1Balance = await superToken.read.balanceOf([
        getAddress(addr1.account.address),
      ]);
      const finalBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      expect(finalAddr1Balance).to.equal(initialAddr1Balance + withdrawAmount);
      expect(finalBridgeBalance).to.equal(
        initialBridgeBalance - withdrawAmount
      );
    });

    it("Should withdraw all tokens", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("100");

      // First lock some tokens
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });
      await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Withdraw all tokens
      await bridge.write.withdrawTokens(
        [getAddress(addr1.account.address), amount],
        {
          account: owner.account,
        }
      );

      // Bridge should have zero balance
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(0n);
    });

    it("Should allow non-owner to lock tokens", async function () {
      const { bridge, superToken, owner, addr1, addr2 } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("100");

      // Transfer some tokens to addr1 first
      await superToken.write.transfer([getAddress(addr1.account.address), amount], {
        account: owner.account,
      });

      // Approve tokens from addr1
      await superToken.write.approve([bridge.address, amount], {
        account: addr1.account,
      });

      // addr1 should be able to lock tokens
      await bridge.write.lockTokens([amount, getAddress(addr2.account.address)], {
        account: addr1.account,
      });

      // Check that tokens were locked
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(amount);
    });

    it("Should revert if insufficient bridge balance", async function () {
      const { bridge, owner, addr1 } = await loadFixture(deployBridgeFixture);
      const amount = parseEther("100");

      // Try to withdraw without any locked tokens
      await expect(
        bridge.write.withdrawTokens(
          [getAddress(addr1.account.address), amount],
          {
            account: owner.account,
          }
        )
      ).to.be.rejectedWith("ERC20InsufficientBalance");
    });

    it("Should handle zero amount withdrawal", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const lockAmount = parseEther("100");

      // First lock some tokens
      await superToken.write.approve([bridge.address, lockAmount], {
        account: owner.account,
      });
      await bridge.write.lockTokens(
        [lockAmount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );

      // Withdraw zero amount - should work but not transfer anything
      const initialBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      await bridge.write.withdrawTokens(
        [getAddress(addr1.account.address), 0n],
        {
          account: owner.account,
        }
      );

      const finalBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);
      expect(finalBridgeBalance).to.equal(initialBridgeBalance);
    });
  });

  describe("Integration Tests", function () {
    it("Should handle multiple lock and withdraw operations", async function () {
      const { bridge, superToken, owner, addr1, addr2 } = await loadFixture(
        deployBridgeFixture
      );
      const amount1 = parseEther("100");
      const amount2 = parseEther("200");
      const withdrawAmount = parseEther("150");

      // Approve total amount
      await superToken.write.approve([bridge.address, amount1 + amount2], {
        account: owner.account,
      });

      // Lock tokens twice
      await bridge.write.lockTokens(
        [amount1, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );
      await bridge.write.lockTokens(
        [amount2, getAddress(addr2.account.address)],
        {
          account: owner.account,
        }
      );

      // Check bridge balance
      let bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(amount1 + amount2);

      // Withdraw partial amount
      await bridge.write.withdrawTokens(
        [getAddress(addr1.account.address), withdrawAmount],
        {
          account: owner.account,
        }
      );

      // Check final bridge balance
      bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(amount1 + amount2 - withdrawAmount);
    });

    it("Should work with different recipient addresses", async function () {
      const { bridge, superToken, owner, addr1, addr2, addr3 } =
        await loadFixture(deployBridgeFixture);
      const amount = parseEther("100");

      // Approve tokens
      await superToken.write.approve([bridge.address, amount * 3n], {
        account: owner.account,
      });

      // Lock tokens for different recipients
      await bridge.write.lockTokens(
        [amount, getAddress(addr1.account.address)],
        {
          account: owner.account,
        }
      );
      await bridge.write.lockTokens(
        [amount, getAddress(addr2.account.address)],
        {
          account: owner.account,
        }
      );
      await bridge.write.lockTokens(
        [amount, getAddress(addr3.account.address)],
        {
          account: owner.account,
        }
      );

      // Check bridge balance
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(amount * 3n);
    });
  });

  describe("Lock Tokens (Single Parameter)", function () {
    it("Should lock tokens with msg.sender as recipient", async function () {
      const { bridge, superToken, owner } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("100");

      // Approve tokens first
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Check initial balances
      const initialOwnerBalance = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      const initialBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      // Lock tokens using single parameter function
      await bridge.write.lockTokens([amount], {
        account: owner.account,
      });

      // Check final balances
      const finalOwnerBalance = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      const finalBridgeBalance = await superToken.read.balanceOf([
        bridge.address,
      ]);

      expect(finalOwnerBalance).to.equal(initialOwnerBalance - amount);
      expect(finalBridgeBalance).to.equal(initialBridgeBalance + amount);
    });

    it("Should emit TokensLocked event with msg.sender as destination", async function () {
      const { bridge, superToken, owner, publicClient } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("100");

      // Approve tokens first
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Lock tokens using single parameter function
      const hash = await bridge.write.lockTokens([amount], {
        account: owner.account,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Get TokensLocked events
      const tokensLockedEvents = await bridge.getEvents.TokensLocked();

      expect(tokensLockedEvents).to.have.length(1);

      // Check event parameters - destination should be msg.sender (owner)
      const event = tokensLockedEvents[0];
      expect(event.args.nonce).to.equal(1n);
      expect(event.args.destinationAddress).to.equal(getAddress(owner.account.address));
      expect(event.args.amount).to.equal(amount);
    });

    it("Should work for non-owner users", async function () {
      const { bridge, superToken, owner, addr1, publicClient } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("100");

      // Transfer tokens to addr1
      await superToken.write.transfer([getAddress(addr1.account.address), amount], {
        account: owner.account,
      });

      // Approve tokens from addr1
      await superToken.write.approve([bridge.address, amount], {
        account: addr1.account,
      });

      // addr1 locks tokens for themselves
      const hash = await bridge.write.lockTokens([amount], {
        account: addr1.account,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Check event - destination should be addr1
      const tokensLockedEvents = await bridge.getEvents.TokensLocked();
      expect(tokensLockedEvents).to.have.length(1);
      expect(tokensLockedEvents[0].args.destinationAddress).to.equal(
        getAddress(addr1.account.address)
      );

      // Check balances
      const addr1Balance = await superToken.read.balanceOf([
        getAddress(addr1.account.address),
      ]);
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      
      expect(addr1Balance).to.equal(0n);
      expect(bridgeBalance).to.equal(amount);
    });

    it("Should increment nonce correctly with single parameter function", async function () {
      // Deploy fresh contracts for this test
      const initialSupply = parseEther("1000000");
      const [owner, addr1] = await hre.viem.getWalletClients();
      
      const superToken = await hre.viem.deployContract("SuperToken", [
        initialSupply,
      ]);
      const bridge = await hre.viem.deployContract("BridgeA", [
        superToken.address,
      ]);
      const publicClient = await hre.viem.getPublicClient();

      const amount = parseEther("100");

      // Transfer some tokens to addr1
      await superToken.write.transfer([getAddress(addr1.account.address), amount * 2n], {
        account: owner.account,
      });

      // Approve tokens for both users
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });
      await superToken.write.approve([bridge.address, amount], {
        account: addr1.account,
      });

      // First lock by owner
      const hash1 = await bridge.write.lockTokens([amount], {
        account: owner.account,
      });

      // Second lock by addr1
      const hash2 = await bridge.write.lockTokens([amount], {
        account: addr1.account,
      });

      // Get receipts
      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });

      // Get all events
      const allEvents = await publicClient.getLogs({
        address: bridge.address,
        event: parseAbiItem(
          "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
        ),
        fromBlock: receipt1.blockNumber,
        toBlock: receipt2.blockNumber,
      });

      // Should have 2 events with incrementing nonces
      expect(allEvents).to.have.length(2);
      expect(allEvents[0].args.nonce).to.equal(1n);
      expect(allEvents[1].args.nonce).to.equal(2n);

      // Check destinations are correct
      expect(allEvents[0].args.destinationAddress).to.equal(getAddress(owner.account.address));
      expect(allEvents[1].args.destinationAddress).to.equal(getAddress(addr1.account.address));
    });

    it("Should revert if insufficient allowance (single parameter)", async function () {
      const { bridge, owner } = await loadFixture(deployBridgeFixture);
      const amount = parseEther("100");

      // Don't approve tokens, try to lock
      await expect(
        bridge.write.lockTokens([amount], {
          account: owner.account,
        })
      ).to.be.rejectedWith("ERC20InsufficientAllowance");
    });

    it("Should revert if insufficient balance (single parameter)", async function () {
      const { bridge, superToken, owner } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("2000000"); // More than initial supply

      // Approve more than balance
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Try to lock more than balance
      await expect(
        bridge.write.lockTokens([amount], {
          account: owner.account,
        })
      ).to.be.rejectedWith("ERC20InsufficientBalance");
    });

    it("Should handle zero amount (single parameter)", async function () {
      const { bridge, superToken, owner } = await loadFixture(
        deployBridgeFixture
      );
      const amount = 0n;

      // Approve zero amount
      await superToken.write.approve([bridge.address, amount], {
        account: owner.account,
      });

      // Lock zero tokens - should work but not transfer anything
      await bridge.write.lockTokens([amount], {
        account: owner.account,
      });

      // Bridge balance should still be zero
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(0n);
    });

    it("Should work with both function overloads in same transaction block", async function () {
      // Deploy fresh contracts for this test to avoid event pollution
      const initialSupply = parseEther("1000000");
      const [owner, addr1, addr2] = await hre.viem.getWalletClients();
      
      const superToken = await hre.viem.deployContract("SuperToken", [
        initialSupply,
      ]);
      const bridge = await hre.viem.deployContract("BridgeA", [
        superToken.address,
      ]);
      const publicClient = await hre.viem.getPublicClient();

      const amount = parseEther("100");

      // Approve tokens for multiple operations
      await superToken.write.approve([bridge.address, amount * 2n], {
        account: owner.account,
      });

      // Use both function overloads
      const hash1 = await bridge.write.lockTokens([amount], {
        account: owner.account,
      });
      
      const hash2 = await bridge.write.lockTokens([amount, getAddress(addr2.account.address)], {
        account: owner.account,
      });

      // Wait for both transactions
      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });

      // Get events using getLogs with proper event parsing
      const allEvents = await publicClient.getLogs({
        address: bridge.address,
        event: parseAbiItem(
          "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)"
        ),
        fromBlock: receipt1.blockNumber,
        toBlock: receipt2.blockNumber,
      });

      expect(allEvents).to.have.length(2);

      // First event should have owner as destination (single parameter function)
      expect(allEvents[0].args.destinationAddress).to.equal(
        getAddress(owner.account.address)
      );
      
      // Second event should have addr2 as destination (two parameter function)
      expect(allEvents[1].args.destinationAddress).to.equal(
        getAddress(addr2.account.address)
      );

      // Check bridge balance
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(amount * 2n);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle maximum uint256 amounts", async function () {
      const { owner } = await loadFixture(deployBridgeFixture);
      const maxSupply = 2n ** 256n - 1n;

      // Deploy with maximum supply
      const maxSupplyToken = await hre.viem.deployContract("SuperToken", [
        maxSupply,
      ]);
      const bridge = await hre.viem.deployContract("BridgeA", [
        maxSupplyToken.address,
      ]);

      // Should be able to approve and lock maximum amount
      await maxSupplyToken.write.approve([bridge.address, maxSupply], {
        account: owner.account,
      });

      await bridge.write.lockTokens(
        [maxSupply, getAddress(owner.account.address)],
        {
          account: owner.account,
        }
      );

      const bridgeBalance = await maxSupplyToken.read.balanceOf([
        bridge.address,
      ]);
      expect(bridgeBalance).to.equal(maxSupply);
    });

    it("Should handle rapid successive operations", async function () {
      const { bridge, superToken, owner, addr1 } = await loadFixture(
        deployBridgeFixture
      );
      const amount = parseEther("10");
      const operations = 10;

      // Approve for all operations
      await superToken.write.approve(
        [bridge.address, amount * BigInt(operations)],
        {
          account: owner.account,
        }
      );

      // Perform rapid lock operations
      for (let i = 0; i < operations; i++) {
        await bridge.write.lockTokens(
          [amount, getAddress(addr1.account.address)],
          {
            account: owner.account,
          }
        );
      }

      // Check final balance
      const bridgeBalance = await superToken.read.balanceOf([bridge.address]);
      expect(bridgeBalance).to.equal(amount * BigInt(operations));
    });
  });
});

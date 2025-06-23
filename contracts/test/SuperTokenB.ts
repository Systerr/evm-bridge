import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, zeroAddress } from "viem";

describe("SuperTokenB", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deploySuperTokenBFixture() {
    const initialSupply = parseEther("1000000"); // 1 million tokens

    // Contracts are deployed using the first signer/account by default
    const [owner, addr1, addr2, relay] = await hre.viem.getWalletClients();

    const superTokenB = await hre.viem.deployContract("SuperTokenB", [
      initialSupply,
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      superTokenB,
      initialSupply,
      owner,
      addr1,
      addr2,
      relay,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { superTokenB } = await loadFixture(deploySuperTokenBFixture);

      expect(await superTokenB.read.name()).to.equal("SuperTokenB");
      expect(await superTokenB.read.symbol()).to.equal("SUPB");
    });

    it("Should set the right decimals", async function () {
      const { superTokenB } = await loadFixture(deploySuperTokenBFixture);

      expect(await superTokenB.read.decimals()).to.equal(18);
    });

    it("Should assign the total supply to the owner", async function () {
      const { superTokenB, initialSupply, owner } = await loadFixture(
        deploySuperTokenBFixture
      );

      const ownerBalance = await superTokenB.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      expect(ownerBalance).to.equal(initialSupply);
    });

    it("Should set the right total supply", async function () {
      const { superTokenB, initialSupply } = await loadFixture(
        deploySuperTokenBFixture
      );

      expect(await superTokenB.read.totalSupply()).to.equal(initialSupply);
    });

    it("Should set the owner correctly", async function () {
      const { superTokenB, owner } = await loadFixture(
        deploySuperTokenBFixture
      );

      expect(await superTokenB.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });

    it("Should initialize with no relay set", async function () {
      const { superTokenB } = await loadFixture(deploySuperTokenBFixture);

      expect(await superTokenB.read.relay()).to.equal(zeroAddress);
    });
  });

  describe("Relay Management", function () {
    it("Should allow owner to set relay", async function () {
      const { superTokenB, owner, relay, publicClient } = await loadFixture(
        deploySuperTokenBFixture
      );

      const hash = await superTokenB.write.setRelay([
        getAddress(relay.account.address),
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      expect(await superTokenB.read.relay()).to.equal(
        getAddress(relay.account.address)
      );
    });

    it("Should emit RelaySet event when relay is set", async function () {
      const { superTokenB, relay, publicClient } = await loadFixture(
        deploySuperTokenBFixture
      );

      const hash = await superTokenB.write.setRelay([
        getAddress(relay.account.address),
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const relaySetEvents = await superTokenB.getEvents.RelaySet();

      // Check that the relay was set correctly
      expect(relaySetEvents).to.have.lengthOf(1);
      expect(relaySetEvents[0].args.newRelay?.toLowerCase()).to.equal(
        relay.account.address.toLowerCase()
      );
    });

    it("Should allow owner to update relay", async function () {
      const { superTokenB, owner, addr1, addr2, publicClient } =
        await loadFixture(deploySuperTokenBFixture);

      // Set initial relay
      let hash = await superTokenB.write.setRelay([
        getAddress(addr1.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await superTokenB.read.relay()).to.equal(
        getAddress(addr1.account.address)
      );

      // Update relay
      hash = await superTokenB.write.setRelay([
        getAddress(addr2.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await superTokenB.read.relay()).to.equal(
        getAddress(addr2.account.address)
      );
    });

    it("Should revert when non-owner tries to set relay", async function () {
      const { superTokenB, addr1, relay } = await loadFixture(
        deploySuperTokenBFixture
      );

      await expect(
        superTokenB.write.setRelay([getAddress(relay.account.address)], {
          account: addr1.account,
        })
      ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Should revert when trying to set relay to zero address", async function () {
      const { superTokenB } = await loadFixture(deploySuperTokenBFixture);

      await expect(
        superTokenB.write.setRelay([zeroAddress])
      ).to.be.rejectedWith("Relay cannot be the zero address");
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      const { superTokenB, owner, addr1, publicClient } = await loadFixture(
        deploySuperTokenBFixture
      );

      const mintAmount = parseEther("1000");
      const initialBalance = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);

      const hash = await superTokenB.write.mint([
        getAddress(addr1.account.address),
        mintAmount,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const finalBalance = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);

      expect(finalBalance).to.equal(initialBalance + mintAmount);
    });

    it("Should allow relay to mint tokens", async function () {
      const { superTokenB, relay, addr1, publicClient } = await loadFixture(
        deploySuperTokenBFixture
      );

      // First set the relay
      let hash = await superTokenB.write.setRelay([
        getAddress(relay.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const mintAmount = parseEther("500");
      const initialBalance = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);

      // Mint as relay
      hash = await superTokenB.write.mint(
        [getAddress(addr1.account.address), mintAmount],
        {
          account: relay.account,
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });

      const finalBalance = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);

      expect(finalBalance).to.equal(initialBalance + mintAmount);
    });

    it("Should revert when non-owner and non-relay tries to mint", async function () {
      const { superTokenB, addr1, addr2 } = await loadFixture(
        deploySuperTokenBFixture
      );

      const mintAmount = parseEther("100");

      await expect(
        superTokenB.write.mint(
          [getAddress(addr2.account.address), mintAmount],
          {
            account: addr1.account,
          }
        )
      ).to.be.rejectedWith("Caller is not the owner or the relay");
    });

    it("Should revert when previous relay tries to mint after relay change", async function () {
      const { superTokenB, addr1, addr2, relay, publicClient } =
        await loadFixture(deploySuperTokenBFixture);

      // Set initial relay
      let hash = await superTokenB.write.setRelay([
        getAddress(addr1.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Change relay to addr2
      hash = await superTokenB.write.setRelay([
        getAddress(addr2.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const mintAmount = parseEther("100");

      // Previous relay (addr1) should not be able to mint
      await expect(
        superTokenB.write.mint(
          [getAddress(relay.account.address), mintAmount],
          {
            account: addr1.account,
          }
        )
      ).to.be.rejectedWith("Caller is not the owner or the relay");
    });
  });

  describe("Access Control Integration", function () {
    it("Should maintain owner functionality after setting relay", async function () {
      const { superTokenB, owner, relay, addr1, publicClient } =
        await loadFixture(deploySuperTokenBFixture);

      // Set relay
      let hash = await superTokenB.write.setRelay([
        getAddress(relay.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Owner should still be able to mint
      const mintAmount = parseEther("100");
      hash = await superTokenB.write.mint([
        getAddress(addr1.account.address),
        mintAmount,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const balance = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);
      expect(balance).to.equal(mintAmount);
    });

    it("Should allow both owner and relay to mint simultaneously", async function () {
      const { superTokenB, owner, relay, addr1, addr2, publicClient } =
        await loadFixture(deploySuperTokenBFixture);

      // Set relay
      let hash = await superTokenB.write.setRelay([
        getAddress(relay.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const mintAmount = parseEther("100");

      // Owner mints to addr1
      hash = await superTokenB.write.mint([
        getAddress(addr1.account.address),
        mintAmount,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      // Relay mints to addr2
      hash = await superTokenB.write.mint(
        [getAddress(addr2.account.address), mintAmount],
        {
          account: relay.account,
        }
      );
      await publicClient.waitForTransactionReceipt({ hash });

      const balance1 = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);
      const balance2 = await superTokenB.read.balanceOf([
        getAddress(addr2.account.address),
      ]);

      expect(balance1).to.equal(mintAmount);
      expect(balance2).to.equal(mintAmount);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle large mint amounts", async function () {
      const { superTokenB, owner, addr1, publicClient } = await loadFixture(
        deploySuperTokenBFixture
      );

      // Mint a very large amount (close to uint256 max, but reasonable)
      const largeMintAmount = parseEther("1000000000"); // 1 billion tokens

      const hash = await superTokenB.write.mint([
        getAddress(addr1.account.address),
        largeMintAmount,
      ]);

      await publicClient.waitForTransactionReceipt({ hash });

      const balance = await superTokenB.read.balanceOf([
        getAddress(addr1.account.address),
      ]);
      expect(balance).to.equal(largeMintAmount);
    });

    it("Should handle multiple relay changes", async function () {
      const { superTokenB, owner, addr1, addr2, relay, publicClient } =
        await loadFixture(deploySuperTokenBFixture);

      // Set relay to addr1
      let hash = await superTokenB.write.setRelay([
        getAddress(addr1.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });
      expect(await superTokenB.read.relay()).to.equal(
        getAddress(addr1.account.address)
      );

      // Change relay to addr2
      hash = await superTokenB.write.setRelay([
        getAddress(addr2.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });
      expect(await superTokenB.read.relay()).to.equal(
        getAddress(addr2.account.address)
      );

      // Change relay to relay
      hash = await superTokenB.write.setRelay([
        getAddress(relay.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash });
      expect(await superTokenB.read.relay()).to.equal(
        getAddress(relay.account.address)
      );
    });
  });
});

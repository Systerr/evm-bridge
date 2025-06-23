import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("SuperToken", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deploySuperTokenFixture() {
    const initialSupply = parseEther("1000000"); // 1 million tokens

    // Contracts are deployed using the first signer/account by default
    const [owner, addr1, addr2] = await hre.viem.getWalletClients();

    const superToken = await hre.viem.deployContract("SuperToken", [
      initialSupply,
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      superToken,
      initialSupply,
      owner,
      addr1,
      addr2,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { superToken } = await loadFixture(deploySuperTokenFixture);

      expect(await superToken.read.name()).to.equal("SuperToken");
      expect(await superToken.read.symbol()).to.equal("SUP");
    });

    it("Should set the right decimals", async function () {
      const { superToken } = await loadFixture(deploySuperTokenFixture);

      expect(await superToken.read.decimals()).to.equal(18);
    });

    it("Should assign the total supply to the owner", async function () {
      const { superToken, initialSupply, owner } = await loadFixture(
        deploySuperTokenFixture
      );

      const ownerBalance = await superToken.read.balanceOf([
        getAddress(owner.account.address),
      ]);
      expect(ownerBalance).to.equal(initialSupply);
    });

    it("Should set the right total supply", async function () {
      const { superToken, initialSupply } = await loadFixture(
        deploySuperTokenFixture
      );

      expect(await superToken.read.totalSupply()).to.equal(initialSupply);
    });

    it("Should deploy with zero initial supply", async function () {
      const [owner] = await hre.viem.getWalletClients();
      const zeroSupplyToken = await hre.viem.deployContract("SuperToken", [0n]);

      expect(await zeroSupplyToken.read.totalSupply()).to.equal(0n);
      expect(
        await zeroSupplyToken.read.balanceOf([
          getAddress(owner.account.address),
        ])
      ).to.equal(0n);
    });
  });

  // other tests not needed. This is a OpenZepelin with own tests, we do not need to copy paste tests
});

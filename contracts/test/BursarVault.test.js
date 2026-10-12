const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const usd = (n) => ethers.parseUnits(String(n), 6);
const cat = (s) => ethers.encodeBytes32String(s);
const ref = (s) => ethers.id(s);

describe("BursarVault", () => {
  let usdc, factory, vault, owner, agent, supplier, stranger;

  beforeEach(async () => {
    [owner, agent, supplier, stranger] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    factory = await (await ethers.getContractFactory("BursarFactory")).deploy(usdc);
    await factory.createVault(agent.address, usd(100), usd(50));
    const [addr] = await factory.vaultsOf(owner.address);
    vault = await ethers.getContractAt("BursarVault", addr);
    await usdc.mint(addr, usd(1000));
    await vault.setBudget(cat("suppliers"), usd(300));
    await vault.setPayee(supplier.address, true);
  });

  it("is owned by the business wallet that created it", async () => {
    expect(await vault.owner()).to.equal(owner.address);
    expect(await vault.agent()).to.equal(agent.address);
  });

  describe("agentPay", () => {
    it("pays an approved supplier inside the rules", async () => {
      await expect(vault.connect(agent).agentPay(supplier, usd(80), cat("suppliers"), ref("inv-1")))
        .to.emit(vault, "Paid")
        .withArgs(supplier.address, usd(80), cat("suppliers"), ref("inv-1"), false);
      expect(await usdc.balanceOf(supplier)).to.equal(usd(80));
      expect(await vault.budgetLeft(cat("suppliers"))).to.equal(usd(220));
    });

    it("refuses anyone but the agent", async () => {
      await expect(vault.connect(stranger).agentPay(supplier, usd(10), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "NotAgent");
    });

    it("refuses a wallet the owner hasn't approved", async () => {
      await expect(vault.connect(agent).agentPay(stranger, usd(10), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "PayeeNotApproved");
    });

    it("never pays the same bill twice", async () => {
      await vault.connect(agent).agentPay(supplier, usd(10), cat("suppliers"), ref("inv-1"));
      await expect(vault.connect(agent).agentPay(supplier, usd(10), cat("suppliers"), ref("inv-1")))
        .to.be.revertedWithCustomError(vault, "AlreadyPaid");
    });

    it("refuses a payment over the per-payment limit", async () => {
      await expect(vault.connect(agent).agentPay(supplier, usd(101), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "OverPaymentLimit");
    });

    it("refuses a payment over the category budget", async () => {
      for (let i = 0; i < 3; i++) await vault.connect(agent).agentPay(supplier, usd(100), cat("suppliers"), ref(`b${i}`));
      await expect(vault.connect(agent).agentPay(supplier, usd(1), cat("suppliers"), ref("b3")))
        .to.be.revertedWithCustomError(vault, "OverBudget");
    });

    it("refuses a category with no budget", async () => {
      await expect(vault.connect(agent).agentPay(supplier, usd(1), cat("software"), ref("x")))
        .to.be.revertedWithCustomError(vault, "OverBudget");
    });

    it("resets the budget after 30 days", async () => {
      for (let i = 0; i < 3; i++) await vault.connect(agent).agentPay(supplier, usd(100), cat("suppliers"), ref(`b${i}`));
      await time.increase(30 * 24 * 3600);
      await expect(vault.connect(agent).agentPay(supplier, usd(100), cat("suppliers"), ref("b3"))).to.emit(vault, "Paid");
    });

    it("keeps the cash floor", async () => {
      await vault.setBudget(cat("suppliers"), usd(10000));
      await vault.setRules(usd(1000), usd(50));
      await expect(vault.connect(agent).agentPay(supplier, usd(951), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "BelowCashFloor");
      await expect(vault.connect(agent).agentPay(supplier, usd(950), cat("suppliers"), ref("y"))).to.emit(vault, "Paid");
    });

    it("stops when paused, and when the agent is removed", async () => {
      await vault.setPaused(true);
      await expect(vault.connect(agent).agentPay(supplier, usd(1), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "IsPaused");
      await vault.setPaused(false);
      await vault.setAgent(ethers.ZeroAddress);
      await expect(vault.connect(agent).agentPay(supplier, usd(1), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "NotAgent");
    });
  });

  describe("check (dry run)", () => {
    it("reports the rule a payment would break", async () => {
      expect(await vault.check(supplier, usd(10), cat("suppliers"), ref("a"))).to.equal("0x00000000");
      const sel = (name) => vault.interface.getError(name).selector;
      expect(await vault.check(stranger, usd(10), cat("suppliers"), ref("a"))).to.equal(sel("PayeeNotApproved"));
      expect(await vault.check(supplier, usd(500), cat("suppliers"), ref("a"))).to.equal(sel("OverPaymentLimit"));
      await vault.connect(agent).agentPay(supplier, usd(10), cat("suppliers"), ref("a"));
      expect(await vault.check(supplier, usd(10), cat("suppliers"), ref("a"))).to.equal(sel("AlreadyPaid"));
    });
  });

  describe("approvals", () => {
    it("lets the owner approve a held payment over the limit", async () => {
      await expect(vault.connect(agent).requestApproval(supplier, usd(250), cat("suppliers"), ref("big"), ethers.id("why")))
        .to.emit(vault, "ApprovalRequested");
      await expect(vault.connect(agent).agentPay(supplier, usd(10), cat("suppliers"), ref("big")))
        .to.be.revertedWithCustomError(vault, "AlreadyPending");
      await expect(vault.connect(agent).approve(0)).to.be.revertedWithCustomError(vault, "NotOwner");
      await expect(vault.approve(0)).to.emit(vault, "Paid").withArgs(supplier.address, usd(250), cat("suppliers"), ref("big"), true);
      await expect(vault.approve(0)).to.be.revertedWithCustomError(vault, "NotOpen");
    });

    it("lets the owner reject, after which the bill can be raised again", async () => {
      await vault.connect(agent).requestApproval(supplier, usd(250), cat("suppliers"), ref("big"), ethers.ZeroHash);
      await expect(vault.reject(0)).to.emit(vault, "ApprovalRejected").withArgs(0);
      expect(await vault.refPending(ref("big"))).to.equal(false);
      await expect(vault.approve(0)).to.be.revertedWithCustomError(vault, "NotOpen");
    });

    it("won't hold a bill that is already paid", async () => {
      await vault.connect(agent).agentPay(supplier, usd(10), cat("suppliers"), ref("a"));
      await expect(vault.connect(agent).requestApproval(supplier, usd(10), cat("suppliers"), ref("a"), ethers.ZeroHash))
        .to.be.revertedWithCustomError(vault, "AlreadyPaid");
    });
  });

  describe("reserve", () => {
    it("moves cash in and out of the reserve without dropping below the floor", async () => {
      await vault.connect(agent).moveToReserve(usd(900));
      expect(await vault.reserve()).to.equal(usd(900));
      expect(await vault.operating()).to.equal(usd(100));
      await expect(vault.connect(agent).moveToReserve(usd(51))).to.be.revertedWithCustomError(vault, "BelowCashFloor");
      // reserve can't be spent by the agent
      await expect(vault.connect(agent).agentPay(supplier, usd(60), cat("suppliers"), ref("x")))
        .to.be.revertedWithCustomError(vault, "BelowCashFloor");
      await vault.connect(agent).releaseReserve(usd(400));
      expect(await vault.operating()).to.equal(usd(500));
      await expect(vault.connect(agent).releaseReserve(usd(501))).to.be.revertedWithCustomError(vault, "InsufficientReserve");
    });
  });

  describe("owner", () => {
    it("can always withdraw, reserve included", async () => {
      await vault.connect(agent).moveToReserve(usd(900));
      await vault.withdraw(owner.address, usd(1000));
      expect(await usdc.balanceOf(owner)).to.equal(usd(1000));
      expect(await vault.reserve()).to.equal(0);
    });

    it("is the only one who can change rules, payees or the agent", async () => {
      for (const call of [
        vault.connect(agent).setRules(1, 1),
        vault.connect(agent).setBudget(cat("x"), 1),
        vault.connect(agent).setPayee(stranger, true),
        vault.connect(agent).setAgent(stranger),
        vault.connect(agent).withdraw(agent.address, 1),
        vault.connect(agent).setPaused(true),
      ]) {
        await expect(call).to.be.revertedWithCustomError(vault, "NotOwner");
      }
    });

    it("anchors decision-log fingerprints", async () => {
      await expect(vault.connect(agent).recordDecision(ethers.id("log-1"))).to.emit(vault, "Decision").withArgs(ethers.id("log-1"));
    });
  });
});

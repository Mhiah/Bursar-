const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const usd = (n) => ethers.parseUnits(String(n), 6);
const cat = (s) => ethers.encodeBytes32String(s);
const ref = (s) => ethers.id(s);
const Kind = { Flex: 0, Locked: 1, Target: 2 };

describe("BursarSavings", () => {
  let usdc, vault, savings, owner, agent, stranger;

  beforeEach(async () => {
    [owner, agent, stranger] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    const vf = await (await ethers.getContractFactory("BursarFactory")).deploy(usdc);
    await vf.createVault(agent.address, usd(100), usd(0));
    vault = await ethers.getContractAt("BursarVault", (await vf.vaultsOf(owner.address))[0]);
    const sf = await (await ethers.getContractFactory("BursarSavingsFactory")).deploy(usdc);
    await sf.createSavings(agent.address);
    savings = await ethers.getContractAt("BursarSavings", (await sf.savingsOf(owner.address))[0]);
    await usdc.mint(await vault.getAddress(), usd(1000));
  });

  const flex = () => savings.createPot("Rainy day", Kind.Flex, 0, 0);

  it("is owned by the business that created it", async () => {
    expect(await savings.owner()).to.equal(owner.address);
    expect(await savings.agent()).to.equal(agent.address);
  });

  it("lets the agent move money from the vault into a pot, inside the savings budget", async () => {
    await flex();
    const s = await savings.getAddress();
    // The owner's one-time setup on the vault: savings is an approved payee with a monthly cap.
    await vault.multicall([
      vault.interface.encodeFunctionData("setPayee", [s, true]),
      vault.interface.encodeFunctionData("setBudget", [cat("savings"), usd(50)]),
    ]);
    await vault.connect(agent).agentPay(s, usd(30), cat("savings"), ref("auto-1"));
    expect(await savings.unassigned()).to.equal(usd(30));
    await savings.connect(agent).allocate(0, usd(30));
    expect((await savings.pot(0)).balance).to.equal(usd(30));
    expect(await savings.unassigned()).to.equal(0);
    // The cap holds: 30 + 30 is over the 50 budget.
    await expect(vault.connect(agent).agentPay(s, usd(30), cat("savings"), ref("auto-2"))).to.be.revertedWithCustomError(vault, "OverBudget");
  });

  it("won't let the agent take money out", async () => {
    await flex();
    await usdc.mint(await savings.getAddress(), usd(10));
    await savings.allocate(0, usd(10));
    await expect(savings.connect(agent).withdraw(0, agent.address, usd(1))).to.be.revertedWithCustomError(savings, "NotOwner");
    await expect(savings.connect(stranger).allocate(0, 1)).to.be.revertedWithCustomError(savings, "NotOwnerOrAgent");
  });

  it("can't put in more than has arrived", async () => {
    await flex();
    await usdc.mint(await savings.getAddress(), usd(5));
    await expect(savings.allocate(0, usd(6))).to.be.revertedWithCustomError(savings, "NotEnough");
  });

  it("lets the owner take money out of a Flex or Target pot anytime", async () => {
    await flex();
    await savings.createPot("New oven", Kind.Target, usd(500), 0);
    await usdc.mint(await savings.getAddress(), usd(20));
    await savings.allocate(0, usd(10));
    await savings.allocate(1, usd(10));
    await savings.withdraw(0, owner.address, usd(4));
    await savings.withdraw(1, owner.address, usd(10));
    expect(await usdc.balanceOf(owner.address)).to.equal(usd(14));
    expect((await savings.pot(0)).balance).to.equal(usd(6));
    expect((await savings.pot(1)).goal).to.equal(usd(500));
    await expect(savings.withdraw(0, owner.address, usd(7))).to.be.revertedWithCustomError(savings, "NotEnough");
  });

  it("keeps a Locked pot shut until its date, even for the owner", async () => {
    const unlock = (await time.latest()) + 30 * 86400;
    await savings.createPot("Tax", Kind.Locked, 0, unlock);
    await usdc.mint(await savings.getAddress(), usd(10));
    await savings.allocate(0, usd(10));
    await expect(savings.withdraw(0, owner.address, usd(1))).to.be.revertedWithCustomError(savings, "StillLocked");
    await expect(savings.extendLock(0, unlock - 1)).to.be.revertedWithCustomError(savings, "LockShorter");
    await time.increaseTo(unlock);
    await savings.withdraw(0, owner.address, usd(10));
    expect(await usdc.balanceOf(owner.address)).to.equal(usd(10));
  });

  it("won't make a lock that's already open", async () => {
    await expect(savings.createPot("x", Kind.Locked, 0, await time.latest())).to.be.revertedWithCustomError(savings, "LockInPast");
  });

  it("only lets the owner make pots and change the agent", async () => {
    await expect(savings.connect(agent).createPot("x", Kind.Flex, 0, 0)).to.be.revertedWithCustomError(savings, "NotOwner");
    await expect(savings.connect(agent).setAgent(agent.address)).to.be.revertedWithCustomError(savings, "NotOwner");
  });
});

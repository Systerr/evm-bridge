import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const ChainAModule = buildModule("ChainAModule", (m) => {
  // Parameters with defaults
  const initialSupply = m.getParameter("initialSupply", parseEther("1000000"));

  // Deploy SuperToken first
  const superToken = m.contract("SuperToken", [initialSupply]);

  // Deploy Bridge with SuperToken address
  const bridge = m.contract("Bridge", [superToken]);

  return { 
    superToken, 
    bridge 
  };
});

export default ChainAModule;

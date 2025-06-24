import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const ChainBModule = buildModule("ChainBModule", (m) => {
  // Parameters with defaults
  const initialSupply = m.getParameter("initialSupply", parseEther("1000000"));

  // Deploy SuperTokenB first
  const superTokenB = m.contract("SuperTokenB", [initialSupply]);

  // Deploy BridgeB with SuperTokenB address
  const bridgeB = m.contract("BridgeB", [superTokenB]);

  // Set BridgeB as relay for SuperTokenB so it can mint tokens
  m.call(superTokenB, "setRelay", [bridgeB]);

  const relayersAddress = m.getParameter(
    "CHAIN_B_RELAY_ADDRESS",
    process.env.CHAIN_B_RELAY_ADDRESS!
  );

  if (!relayersAddress) {
    console.warn("Please provide bridgeAddress to bridge smart contract");
  } else {
    // Set BridgeB as relay for SuperTokenB so it can mint tokens
    m.call(bridgeB, "relayerAddress", [relayersAddress]);
  }

  return {
    superTokenB,
    bridgeB,
  };
});

export default ChainBModule;

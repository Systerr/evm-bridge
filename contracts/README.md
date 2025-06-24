# Bridge contract

This folder contains solidity contracts for bridge

## Overview

The bridge system consists of:

**Chain A:**

- `SuperToken` - ERC20 token that can be locked in the bridge
- `Bridge` - Contract that locks tokens and emits events for cross-chain transfers

**Chain B:**

- `SuperTokenB` - Mintable ERC20 token that represents bridged tokens. Only owner and BridgeB can mint tokens
- `BridgeB` - Contract that mints tokens based on verified signatures

## Super Token

There are two simple OpenZepelin ERC20 constract. Both with premint amount of token, no any caps (in real world cap shouls be set, at least max cap)

### Permissions

- `SuperToken` - SuperToken have no special owner methods
- `SuperTokenB` - have two additional permissions - owner and relay address. Both of this users able to mint new tokens. Owner is a EOA in most cases but relay is a smart contract address of bridge that will mint tokens after verify signatures
  Secod option mostly to have more security (in case relayer private key will be compomized and final implementation will implement limits of mint tokens with proper monitoring)

## Bridge contracts

There are two bridge contracts for chain A and chain B

- `Bridge` have only one permissions - owner. With ability to widwdraw token from brifge

- `BridgeB` have more complicated permission. Owner is one role there, but it also should known bridgeAddress (signer) - address of the system to sign transfers

# Instalitaion

Please follow Docker guilde on main folder for easier setup.

## Prerequisites

1. Node.js (v24) and npm installed
2. Private keys with sufficient funds on both chains
3. RPC endpoints for both target chains
4. Bridge relay address for signing cross-chain transactions

5. **Install dependencies:**

   ```bash
   npm install
   ```

6. **Configure environment:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:

   ```
   # Private keys for deployment (without 0x prefix)
   OWNER_A_PRIVATE_KEY=your_chain_a_private_key_here
   OWNER_B_PRIVATE_KEY=your_chain_b_private_key_here

   # Chain A Configuration (e.g., Ethereum mainnet, Polygon, etc.)
   CHAIN_A_RPC_URL=https://your-chain-a-rpc-url

   # Chain B Configuration (e.g., Binance Smart Chain, Arbitrum, etc.)
   CHAIN_B_RPC_URL=https://your-chain-b-rpc-url

   # Bridge relay address for signatures
   CHAIN_B_RELAY_ADDRESS=relay_address_for_signatures
   ```

# Deployment

This guide explains how to deploy the bridge system to two separate chains using Hardhat Ignition.

## Using npm scripts (Recommended)

**Deploy to Chain A:**

```bash
npm run ignition:chainA
```

**Deploy to Chain B:**

```bash
npm run ignition:chainB
```

### Using Hardhat Ignition directly

**Deploy to Chain A:**

```bash
npx hardhat ignition deploy ignition/modules/ChainA.ts --network chainA
```

**Deploy to Chain B:**

```bash
npx hardhat ignition deploy ignition/modules/ChainB.ts --network chainB
```

### Custom Parameters

You can customize the initial token supply using inline parameters:

**Chain A with custom supply:**

```bash
npx hardhat ignition deploy ignition/modules/ChainA.ts --network chainA --parameters '{"ChainAModule": {"initialSupply": "2000000000000000000000000"}}'
```

**Chain B with custom supply:**

```bash
npx hardhat ignition deploy ignition/modules/ChainB.ts --network chainB --parameters '{"ChainBModule": {"initialSupply": "2000000000000000000000000"}}'
```

## Deployment Process Details

### Chain A Deployment

1. Deploys `SuperToken` with initial supply (default: 1,000,000 tokens)
2. Deploys `Bridge` contract with SuperToken address

### Chain B Deployment

1. Deploys `SuperTokenB` with initial supply (default: 1,000,000 tokens)
2. Deploys `BridgeB` contract with SuperTokenB address
3. Sets `BridgeB` as relay for `SuperTokenB` (allows minting)
4. Sets the bridge relay address in `BridgeB` (if `CHAIN_B_RELAY_ADDRESS` is provided)

## Post-Deployment

After successful deployment:

1. **Save contract addresses** from the deployment output
2. **Verify the relay address** is correctly set in BridgeB contract
3. **Test with small amounts** before production use

## Bridge Operation Flow

1. **Lock tokens on Chain A:**

   - User calls `lockTokens(amount, recipientOnChainB)` on Bridge contract
   - Bridge emits `TokensLocked` event with nonce, recipient, and amount

2. **Release tokens on Chain B:**
   - Off-chain service monitors `TokensLocked` events
   - Service creates signature for the transfer
   - User (or service) calls `releaseTokens(recipient, amount, nonce, signature)` on BridgeB
   - BridgeB verifies signature and mints tokens to recipient

## Security Considerations

1. **Private Key Security:** Keep deployment private keys secure and separate
2. **Bridge Relay Address:** The relay address should be properly secured as it signs cross-chain transfers
3. **Initial Supply:** Default is 1M tokens per chain - adjust as needed
4. **Permissions:** Only BridgeB contract can mint SuperTokenB tokens

## Troubleshooting

**Common Issues:**

1. **Missing CHAIN_B_RELAY_ADDRESS:** Deployment will warn if not provided - set this for production
2. **Insufficient funds:** Ensure deployment accounts have enough native tokens for gas
3. **Network configuration:** Verify RPC URLs are accessible
4. **Private key format:** Ensure private keys are without '0x' prefix

**Available Commands:**

- `npm test` - Run contract tests
- `npm run compile` - Compile contracts
- `npm run coverage` - Generate test coverage report

# Testing

Project uses hardhat test enviroument for testing

```bash
npm test
```

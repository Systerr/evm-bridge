# Bridge Contracts

This folder contains Solidity contracts for the bridge system.

## Overview

The bridge system consists of:

**Chain A:**

- `SuperToken` - ERC20 token that can be locked in the bridge
- `Bridge` - Contract that locks tokens and emits events for cross-chain transfers

**Chain B:**

- `SuperTokenB` - Mintable ERC20 token that represents bridged tokens. Only owner and BridgeB can mint tokens
- `BridgeB` - Contract that mints tokens based on verified signatures

## Super Token

There are two simple OpenZeppelin ERC20 contracts. Both have a preminted amount of tokens with no caps (in the real world, caps should be set, at least a maximum cap).

### Permissions

- `SuperToken` - SuperToken has no special owner methods
- `SuperTokenB` - has two additional permissions: owner and relay address. Both of these users are able to mint new tokens. The owner is an EOA in most cases, but the relay is a smart contract address of the bridge that will mint tokens after verifying signatures.
  The second option is mostly to have more security (in case the relayer private key is compromised, the final implementation will implement limits on minting tokens with proper monitoring).

## Bridge Contracts

There are two bridge contracts for Chain A and Chain B:

- `Bridge` has only one permission - owner, with the ability to withdraw tokens from the bridge
- `BridgeB` has more complicated permissions. Owner is one role, but it also needs to know the bridgeAddress (signer) - the address of the system that signs transfers

# Installation

Please follow the Docker guide in the main folder for easier setup.

## Prerequisites

1. Node.js (v24) and npm installed
2. Private keys with sufficient funds on both chains
3. RPC endpoints for both target chains
4. Bridge relay address for signing cross-chain transactions

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment:**

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

## Using npm Scripts (Recommended)

**Deploy to Chain A:**

```bash
npm run ignition:chainA
```

**Deploy to Chain B:**

```bash
npm run ignition:chainB
```

## Using Hardhat Ignition Directly

**Deploy to Chain A:**

```bash
npx hardhat ignition deploy ignition/modules/ChainA.ts --network chainA
```

**Deploy to Chain B:**

```bash
npx hardhat ignition deploy ignition/modules/ChainB.ts --network chainB
```

## Custom Parameters

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
2. **Verify the relay address** is correctly set in the BridgeB contract
3. **Test with small amounts** before production use

## Bridge Operation Flow

1. **Lock tokens on Chain A:**

   - User calls `lockTokens(amount, recipientOnChainB)` on the Bridge contract
   - Bridge emits `TokensLocked` event with nonce, recipient, and amount

2. **Release tokens on Chain B:**
   - Off-chain service monitors `TokensLocked` events
   - Service creates a signature for the transfer
   - User (or service) calls `releaseTokens(recipient, amount, nonce, signature)` on BridgeB
   - BridgeB verifies the signature and mints tokens to the recipient

## Security Considerations

1. **Private Key Security:** Keep deployment private keys secure and separate
2. **Bridge Relay Address:** The relay address should be properly secured as it signs cross-chain transfers
3. **Initial Supply:** Default is 1M tokens per chain - adjust as needed
4. **Permissions:** Only the BridgeB contract can mint SuperTokenB tokens

## Troubleshooting

**Common Issues:**

1. **Missing CHAIN_B_RELAY_ADDRESS:** Deployment will warn if not provided - set this for production
2. **Insufficient funds:** Ensure deployment accounts have enough native tokens for gas
3. **Network configuration:** Verify RPC URLs are accessible
4. **Private key format:** Ensure private keys are without the '0x' prefix

## Available Commands

- `npm test` - Run contract tests
- `npm run compile` - Compile contracts
- `npm run coverage` - Generate test coverage report
- `npm run ignition:chainA` - Deploy to Chain A
- `npm run ignition:chainB` - Deploy to Chain B

# Testing

The project uses the Hardhat test environment for testing:

```bash
npm test
```

## Test Coverage

Generate test coverage report:

```bash
npm run coverage
```

## Code Style

The project follows standard Solidity formatting and linting practices. Compile contracts to check for any issues:

```bash
npm run compile
```

## Environment Variables

The contracts use the following environment variables for deployment:

| Variable                | Required | Description                                    |
| ----------------------- | -------- | ---------------------------------------------- |
| `OWNER_A_PRIVATE_KEY`   | Yes      | Private key for Chain A deployment             |
| `OWNER_B_PRIVATE_KEY`   | Yes      | Private key for Chain B deployment             |
| `CHAIN_A_RPC_URL`       | Yes      | RPC endpoint for Chain A                       |
| `CHAIN_B_RPC_URL`       | Yes      | RPC endpoint for Chain B                       |
| `CHAIN_B_RELAY_ADDRESS` | No       | Bridge relay address for signing transactions |


## Architecture Details

### Contract Interactions

```
User ──► SuperToken.approve() ──► Bridge.lockTokens()
                                      │
                                      ▼
                              TokensLocked Event
                                      │
                                      ▼
                              Relayer Service
                                      │
                                      ▼
                          BridgeB.releaseTokens()
                                      │
                                      ▼
                          SuperTokenB.mint() ──► User receives tokens
```

### Security Features

- **Nonce-based replay protection**: Each transaction has a unique nonce
- **Signature verification**: Only authorized relayer can trigger mints
- **Owner controls**: Emergency withdrawal and relay address management
- **Immutable token addresses**: Prevents unauthorized token changes

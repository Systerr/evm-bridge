# Bridge Project

> ⚠️ **WARNING: NOT FOR PRODUCTION USE**
>
> This project is for development, testing, and educational purposes only. Do not use this code in production environments. The code may contain security vulnerabilities, bugs, or incomplete features that could result in loss of funds or other critical issues.

## Bridge Working Flow

```
                    CROSS-CHAIN TOKEN BRIDGE ARCHITECTURE
                    =====================================

    CHAIN A (Source)                                    CHAIN B (Destination)
    ┌─────────────────┐                                ┌─────────────────┐
    │                 │                                │                 │
    │   SuperToken    │                                │  SuperTokenB    │
    │   (ERC20)       │                                │  (ERC20+Mint)   │
    │                 │                                │                 │
    └─────────────────┘                                └─────────────────┘
            │                                                    ▲
            │ 1. transferFrom()                                  │ 5. mint()
            ▼                                                    │
    ┌─────────────────┐                                ┌─────────────────┐
    │                 │                                │                 │
    │   Bridge.sol    │                                │  BridgeB.sol    │
    │                 │                                │                 │
    │ • lockTokens()  │                                │ • releaseTokens │
    │ • nonce counter │                                │ • signature     │
    │ • emit events   │                                │   verification  │
    │                 │                                │ • nonce replay  │
    └─────────────────┘                                │   protection    │
            │                                          └─────────────────┘
            │ 2. TokensLocked Event                              ▲
            │    (nonce, recipient, amount)                      │
            ▼                                                    │
    ┌─────────────────────────────────────────────────────────────────────┐
    │                    OFF-CHAIN BRIDGE SERVICE                         │
    │                                                                     │
    │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
    │  │   Event     │    │  Signature  │    │   Relay     │              │
    │  │  Listener   │───▶│  Generator  │───▶│  Service    │              │
    │  │             │    │             │    │             │              │
    │  └─────────────┘    └─────────────┘    └─────────────┘              │
    │         │                   │                   │                   │
    │         │ 3. Detect         │ 4. Sign           │ 6. Submit         │
    │         │    Events         │    Message        │    Transaction    │
    └─────────────────────────────────────────────────────────────────────┘
                                                                    │
                                                                    │
                                                                    ▼
                                            ┌─────────────────────────────┐
                                            │        USER RECEIVES        │
                                            │      TOKENS ON CHAIN B      │
                                            └─────────────────────────────┘

    DETAILED FLOW:
    ==============

    1. USER LOCKS TOKENS (Chain A)
       ┌─────────────────────────────────────────────────────────────────┐
       │ User calls Bridge.lockTokens(amount, recipientOnChainB)         │
       │ ├─ SuperToken.transferFrom(user, bridge, amount)                │
       │ ├─ Increment nonce                                              │
       │ └─ Emit TokensLocked(nonce, recipient, amount)                  │
       └─────────────────────────────────────────────────────────────────┘

    2. OFF-CHAIN DETECTION
       ┌─────────────────────────────────────────────────────────────────┐
       │ Bridge Service monitors TokensLocked events                     │
       │ ├─ Parse event data (nonce, recipient, amount)                  │
       │ ├─ Create message hash: keccak256(recipient, amount, nonce)     │
       │ └─ Sign hash with bridge private key                            │
       └─────────────────────────────────────────────────────────────────┘

    3. TOKEN RELEASE (Chain B)
       ┌─────────────────────────────────────────────────────────────────┐
       │ Anyone calls BridgeB.releaseTokens(recipient, amount, nonce,    │
       │                                     signature)                  │
       │ ├─ Verify signature matches bridge address                      │
       │ ├─ Check nonce not already used (replay protection)             │
       │ ├─ Mark nonce as used                                           │
       │ ├─ SuperTokenB.mint(recipient, amount)                          │
       │ └─ Emit TokensClaimed(nonce, recipient, amount)                 │
       └─────────────────────────────────────────────────────────────────┘

    SECURITY FEATURES:
    ==================
    • Cryptographic signatures prevent unauthorized minting
    • Nonce-based replay attack protection
    • Event-driven architecture ensures transparency
    • Owner-only emergency withdrawal functions
    • Separate bridge signer key for operational security

    DOCKER SETUP:
    =============
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │   Chain A       │    │   Chain B       │    │  Bridge Service │
    │  (Port 8545)    │    │  (Port 8546)    │    │   (Node.js)     │
    │                 │    │                 │    │                 │
    │ • Anvil Node    │    │ • Anvil Node    │    │ • Event Monitor │
    │ • Bridge.sol    │    │ • BridgeB.sol   │    │ • Signature Gen │
    │ • SuperToken    │    │ • SuperTokenB   │    │ • Auto Relay    │
    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

# Project Status

- ✅ **Contracts**: Fully implemented with comprehensive tests
- ✅ **Relayer**: Basic implementation with event monitoring and transaction submission
- ✅ **Docker Setup**: Complete containerized environment
- ✅ **CI/CD**: GitHub Actions for testing, code style checks and docker image build
- ⚠️ **Production Ready**: Not recommended for production use (see warning above)

# Quick Start

1. **Clone and setup:**

   ```bash
   git clone git@github.com:Systerr/evm-bridge.git
   cd bridge
   ```

2. **Start with Docker (Recommended):**

   ```bash
   docker compose up
   ```

3. **Manual setup (Alternative):**

   ```bash
   # Install dependencies for each component
   cd contracts && npm install && cd ..
   cd relayer && npm install && cd ..

   # Configure environment files
   cp contracts/.env.example contracts/.env
   cp relayer/.env.example relayer/.env

   # Edit .env files with your configuration
   ```

4. Run demo interaction

   ```bash
   npm run bridge:terminal
   node src/simpleInteraction.ts

   ```

# AI Generation

Part of the code (especially tests) was generated using AI (Cline + different models). All AI-generated code was reviewed by humans.

# Docker compose Usage

You should not run code downloaded from the internet on your local computer, especially when dealing with blockchain projects.
Docker provides necessary isolation for you to work with the project safely.

It starts two chains based on regular well-known private keys:

```
(0) 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 (we are using it as owner on chain A)
(1) 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d (we are using it as owner on chain B)
(2) 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a (we are using it as relayer for bridge itself)
(3) 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 (we are using this as a demo user)
(4) 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
(5) 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
(6) 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e
(7) 0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356
(8) 0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97
(9) 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
```

That corresponds to accounts:

```
(0) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000.000000000000000000 ETH)
(1) 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000.000000000000000000 ETH)
(2) 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000.000000000000000000 ETH)
(3) 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (10000.000000000000000000 ETH)
(4) 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (10000.000000000000000000 ETH)
(5) 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (10000.000000000000000000 ETH)
(6) 0x976EA74026E726554dB657fA54763abd0C3a0aa9 (10000.000000000000000000 ETH)
(7) 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 (10000.000000000000000000 ETH)
(8) 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f (10000.000000000000000000 ETH)
(9) 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 (10000.000000000000000000 ETH)
```

All this is based on the well-known mnemonic "test test test test test test test test test test test junk"

It also runs deployment and the bridge itself, plus a Node.js container for you to communicate with the nodes.

```
Be aware of different architectures. Do not run npm i locally and then inside Docker. In case of different architecture, this can cause problems and you'll need to remove the node_modules folder and run it again.
```

# Structure

The project contains multiple folders that are part of one project, but do not depend on each other.
Each folder contains its own modules, build system, and test system.

For each project, you can check available commands via:

```bash
npm run
```

Please follow the "contracts" and "relayer" folder README files for each component of the project.

# Installation

Each folder contains its own installation process. In general, you need to have Node.js installed (version 24).

```bash
https://nodejs.org/en/download
```

```bash
npm i
```

However, we definitely recommend using Docker Compose to run everything:

```bash
docker compose up
```

## Environment Notes

Docker has preconfigured variables to work independently. It's possible to use deployed addresses of contracts before they are deployed - not because of the CREATE2 command, but because we have the same chain, same deploy bytecode, and same nonces of accounts.

In real life, you should deploy first and then configure ENV variables with real addresses.

# Deployment

Each component has its own deployment mechanics:

- **contracts** - uses Hardhat Ignition module to deploy
- **relayer** - can be deployed on Docker or directly with pm2

Please follow each component's documentation for more information.

# Moving Tokens Back to Original Chain

This part is not implemented, but the idea is the same:

- Send tokens to BridgeB
- BridgeB will lock or burn them (new feature)
- BridgeB will emit an event
- Relayer will listen for the event
- Relayer will send data back to BridgeA to unlock tokens

# Smart Contract Design Choices

## BridgeA.sol Design Decisions

### Architecture Choices

- **Lock-and-Mint Pattern**: Implemented a lock-and-mint mechanism where tokens are locked on the source chain rather than burned. 
- **Immutable Token Address**: The `superToken` address is immutable to prevent unauthorized token changes after deployment, ensuring the bridge only works with the intended token.
- **Sequential Nonce System**: Uses a simple incrementing counter starting from 1 (not 0) to ensure unique transaction identification and prevent replay attacks.
- **Event-Driven Architecture**: Emits `TokensLocked` events with indexed parameters for efficient off-chain monitoring and filtering.

### Security Features

- **SafeERC20 Usage**: Implements OpenZeppelin's SafeERC20 to handle tokens that don't return boolean values properly.
- **Owner-Only Withdrawal**: Emergency `withdrawTokens()` function restricted to contract owner for fund recovery scenarios.
- **Input Validation**: Validates token address is not zero during construction.

### Gas Optimization

- **Minimal Storage**: Only stores essential data (nonce counter and immutable token address).
- **Efficient Event Emission**: Uses indexed parameters for gas-efficient event filtering.

## BridgeB.sol Design Decisions

### Signature Verification System

- **ECDSA + Message Hashing**: Uses OpenZeppelin's ECDSA library with `MessageHashUtils` for secure signature verification.
- **Deterministic Message Hash**: Creates consistent message hashes using `keccak256(abi.encodePacked(recipient, amount, nonce))` to match off-chain signing.
- **Ethereum Signed Message Hash**: Applies Ethereum's signed message prefix for standard wallet compatibility.

### Access Control

- **Dual Permission Model**: Separates owner permissions from relayer permissions for operational security.
- **Updatable Relayer**: Allows owner to update relayer address in case of key compromise.
- **Mint Authorization**: Only the bridge contract can mint tokens, preventing unauthorized token creation.

### Replay Protection

- **Nonce Mapping**: Maintains a mapping of used nonces to prevent replay attacks.
- **Permanent Nonce Marking**: Once used, nonces cannot be reused, ensuring transaction uniqueness.

# Relayer Service Logic

## Event Monitoring System

### Polling Strategy

- **Block Range Processing**: Processes events in block ranges rather than individual blocks for efficiency.
- **Resumable Operation**: Saves last processed block to file system for restart capability.
- **Configurable Polling**: Adjustable polling interval (default 5 seconds) to balance responsiveness and resource usage.

### Event Detection

```typescript
// Event filtering and processing
const filter = this.bridgeAContract.filters.TokensLocked();
const events = await this.bridgeAContract.queryFilter(
  filter,
  fromBlock,
  toBlock
);
```

## Message Construction and Signing

### Cryptographic Process

1. **Message Hash Creation**:

   ```typescript
   const messageHash = ethers.keccak256(
     ethers.solidityPacked(
       ["address", "uint256", "uint256"],
       [recipient, amount, nonce]
     )
   );
   ```

2. **Signature Generation**:
   ```typescript
   const signature = await this.wallet.signMessage(
     ethers.getBytes(messageHash)
   );
   ```

### Security Considerations

- **Private Key Management**: Uses ethers.js Wallet for secure key handling.
- **Message Consistency**: Ensures message hash format matches smart contract expectations exactly.

## Nonce Management and Replay Protection

### In-Memory Tracking

- **Processed Nonces Set**: Maintains `Set<string>` of processed nonces to prevent duplicate processing.
- **Persistent State**: Saves last processed block number to file system for recovery.

### Error Handling Strategy

- **Duplicate Detection**: Gracefully handles already-processed nonces without failing.
- **Network Resilience**: Implements retry logic with exponential backoff for network issues.
- **Transaction Monitoring**: Waits for transaction confirmation before marking nonces as processed.

## Transaction Submission Process

### Chain B Interaction

```typescript
const tx = await this.bridgeBContract.releaseTokens(
  event.destinationAddress,
  event.amount,
  event.nonce,
  signature
);
```

### Confirmation Strategy

- **Receipt Waiting**: Waits for transaction receipt before considering operation complete.
- **Status Verification**: Checks transaction status (success/failure) before proceeding.
- **Gas Management**: Monitors wallet balance and warns about insufficient funds.

# Security Implications and Trust Assumptions

## Current Security Model

### Trust Assumptions

1. **Single Relayer Trust**: The current implementation relies on a single relayer private key, creating a central point of trust and failure.
2. **Key Security**: Security depends entirely on the relayer private key remaining secure and not being compromised.
3. **Operational Honesty**: Assumes the relayer will operate honestly and not sign fraudulent transactions.
4. **Network Availability**: Relies on both chains being available and the relayer service running continuously.

### Attack Vectors

1. **Relayer Key Compromise**: If the relayer private key is stolen, attackers could mint unlimited tokens on Chain B.

### Current Mitigations

- **Nonce-Based Replay Protection**: Prevents transaction replay attacks.
- **Signature Verification**: Ensures only authorized relayer can trigger mints.
- **Event-Driven Architecture**: Provides transparency and auditability.
- **Emergency Withdrawal**: Owner can recover locked funds if needed.

## Production-Grade Bridge Mitigation Strategies

### Multi-Signature Relayers

```solidity
// Example: Multi-sig verification
mapping(address => bool) public authorizedRelayers;
uint256 public requiredSignatures = 3;

function releaseTokensMultiSig(
    address recipient,
    uint256 amount,
    uint256 nonce,
    bytes[] memory signatures
) external {
    require(signatures.length >= requiredSignatures, "Insufficient signatures");

    bytes32 messageHash = getMessageHash(recipient, amount, nonce);
    address[] memory signers = new address[](signatures.length);

    for (uint i = 0; i < signatures.length; i++) {
        address signer = messageHash.toEthSignedMessageHash().recover(signatures[i]);
        require(authorizedRelayers[signer], "Unauthorized signer");
        // Check for duplicate signers
        for (uint j = 0; j < i; j++) {
            require(signers[j] != signer, "Duplicate signer");
        }
        signers[i] = signer;
    }

    // Proceed with minting...
}
```

### Optimistic Fraud Proofs

- **Challenge Period**: Implement a delay period where transactions can be challenged.
- **Fraud Proof System**: Allow validators to submit proofs of invalid transactions.
- **Slashing Mechanism**: Penalize malicious relayers by slashing their staked tokens.

### Zero-Knowledge Proof Systems

- **ZK-SNARKs/STARKs**: Use zero-knowledge proofs to verify transaction validity without revealing sensitive data.
- **Merkle Tree Proofs**: Batch multiple transactions and prove inclusion in a Merkle tree.
- **Recursive Proofs**: Enable efficient verification of large transaction batches.

### Decentralized Validator Networks

- **Proof-of-Stake Validation**: Implement a network of staked validators who must reach consensus.
- **Economic Incentives**: Reward honest validators and slash malicious ones.
- **Rotation Mechanism**: Regularly rotate validator sets to prevent collusion.

# Design Trade-offs and Time Constraints

## Simplifications Made

### Single Relayer Design

**Trade-off**: Chose single relayer for simplicity over multi-signature system.

- **Benefit**: Faster development, easier testing, lower gas costs.
- **Cost**: Single point of failure, higher trust requirements.
- **Production Alternative**: Multi-signature relayer network with consensus mechanism.

### In-Memory State Management

**Trade-off**: Used in-memory nonce tracking instead of persistent database.

- **Benefit**: Simpler implementation, no database dependencies.
- **Cost**: State loss on service restart, limited scalability.
- **Production Alternative**: Redis/PostgreSQL for persistent state management.

### Polling vs WebSocket

**Trade-off**: Implemented polling instead of WebSocket event listening.

- **Benefit**: More reliable, easier error handling, works with any RPC provider.
- **Cost**: Higher latency, more resource usage.
- **Production Alternative**: WebSocket with fallback to polling for reliability.

### Basic Error Handling

**Trade-off**: Simple retry logic instead of sophisticated error recovery.

- **Benefit**: Easier to understand and debug.
- **Cost**: May not handle all edge cases optimally.
- **Production Alternative**: Exponential backoff, dead letter queues.

## Available Commands

Each component has its own set of commands. Check available commands for each component:

**Root level:**

```bash
npm run                 # Show available commands
npm run bridge:terminal # go to relayer terminal
npm run bridge:logs     # show bridge logs
docker compose up       # Start all services
docker compose down     # Stop all services
```

**Contracts:**

```bash
cd contracts
npm test               # Run contract tests
npm run compile        # Compile contracts
npm run coverage       # Generate test coverage
npm run ignition:chainA # Deploy to Chain A
npm run ignition:chainB # Deploy to Chain B
```

**Relayer:**

```bash
cd relayer
npm start              # Run in production mode
npm run dev            # Run in development mode
npm run check          # Run linting
npm run docker         # Build and run Docker container
```

# Future Updates

- Implement modern monitoring solutions (Pino.js) for log integrations and alerting
- Move codebase to Foundry or Hardhat v3 (at development time it was an early alpha version)
- Add support for multiple token types
- Implement bidirectional bridging (Chain B → Chain A)
- Add multi-signature relayer support
- Refine documentation

# Bridge Relayer Service

A TypeScript-based relayer service that monitors TokensLocked events on Chain A and automatically submits corresponding transactions to Chain B to release tokens. This service acts as the bridge between two blockchain networks.

## Features

- **Event Monitoring**: Continuously polls Chain A for TokensLocked events from BridgeA contract
- **Message Signing**: Cryptographically signs messages using the relayer's private key
- **Automatic Submission**: Submits signed transactions to BridgeB contract on Chain B
- **Nonce Management**: Tracks processed nonces to prevent replay attacks and duplicate processing (simple version, in memory; for production you should use a database)
- **Persistence**: Saves last processed block number to resume from correct position after restart (same simple implementation; for production use a database)
- **Error Handling**: Robust error handling for network issues and transaction failures
- **Graceful Shutdown**: Handles SIGINT and SIGTERM signals for clean shutdown

## Architecture

```
Chain A (Source)          Relayer Service          Chain B (Destination)
┌─────────────┐           ┌─────────────────┐      ┌─────────────────┐
│  BridgeA    │           │                 │      │    BridgeB      │
│             │           │  1. Monitor     │      │                 │
│ lockTokens()│ ────────► │     Events      │      │ releaseTokens() │
│             │           │                 │      │                 │
│ TokensLocked│           │  2. Sign        │ ───► │                 │
│   Event     │           │     Message     │      │                 │
└─────────────┘           │                 │      └─────────────────┘
                          │  3. Submit TX   │
                          └─────────────────┘
```

## Prerequisites

- Node.js 24+ (for `loadEnvFile` support and TypeScript support out of the box without compilers)
- Access to RPC endpoints for both chains
- Private key for the relayer wallet (must be registered as relayer on Chain B)
- Sufficient balance on Chain B for gas fees

## Installation

1. Clone the repository and navigate to the relayer directory:

```bash
cd relayer
```

2. Install dependencies:

```bash
npm install
```

3. Copy the environment example and configure:

```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file with your configuration:

```env
# Required Configuration
CHAIN_A_RPC_URL=http://localhost:8545
CHAIN_B_RPC_URL=http://localhost:8546
BRIDGE_A_ADDRESS=0x...                    # BridgeA contract address
BRIDGE_B_ADDRESS=0x...                  # BridgeB contract address
PRIVATE_KEY=0x...                       # Relayer private key

# Optional Configuration
POLL_INTERVAL=5000                      # Polling interval in milliseconds (default: 5000)
LAST_BLOCK_FILE=./last_block.txt       # File to store last processed block (default: ./last_block.txt)

# Optional for debug only
OWNER_A_PRIVATE_KEY=0x..
DEMO_USER_PRIVATE_KEY=0x...
```

### Environment Variables

| Variable               | Required | Description                                                         |
| ---------------------- | -------- | ------------------------------------------------------------------- |
| `CHAIN_A_RPC_URL`      | Yes      | RPC endpoint for Chain A (source chain)                             |
| `CHAIN_B_RPC_URL`      | Yes      | RPC endpoint for Chain B (destination chain)                        |
| `BRIDGE_A_ADDRESS`     | Yes      | Address of BridgeA contract on Chain A                              |
| `BRIDGE_B_ADDRESS`     | Yes      | Address of BridgeB contract on Chain B                              |
| `PRIVATE_KEY`          | Yes      | Private key of the relayer wallet                                   |
| `POLL_INTERVAL`        | No       | Polling interval in milliseconds (default: 5000)                    |
| `LAST_BLOCK_FILE`      | No       | File path to store last processed block (default: ./last_block.txt) |
| `OWNER_A_PRIVATE_KEY`  | No       | For usage in demo file (e2e interaction from user perspective)      |
| `DEMO_USER_PRIVATE_KEY`| No       | For usage in demo file (e2e interaction from user perspective)      |

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Docker

```bash
npm run docker
```

## How It Works

### 1. Event Monitoring

The relayer continuously polls Chain A for `TokensLocked` events emitted by the BridgeA contract:

```solidity
event TokensLocked(
    uint256 indexed nonce,
    address indexed destinationAddress,
    uint256 indexed amount
);
```

Instead of polling, it's possible to use a WebSocket connection and receive events from the chain.

### 2. Message Construction & Signing

For each detected event, the relayer:

1. Constructs a message hash using `keccak256(abi.encodePacked(recipient, amount, nonce))`
2. Signs the message hash using the relayer's private key
3. Creates an Ethereum signed message hash for verification

### 3. Transaction Submission

The relayer submits a transaction to Chain B calling:

```solidity
function releaseTokens(
    address recipient,
    uint256 amount,
    uint256 nonce,
    bytes memory signature
)
```

### 4. State Management

- **Nonce Tracking**: Maintains an in-memory set of processed nonces
- **Block Persistence**: Saves the last processed block number to file (in case of emergency stop)
- **Resume Capability**: On restart, resumes from the last processed block

## Error Handling

The relayer includes comprehensive error handling:

- **Network Issues**: Retries with exponential backoff
- **Transaction Failures**: Logs errors and continues processing
- **Duplicate Nonces**: Detects and skips already processed events
- **Invalid Signatures**: Logs validation errors
- **Insufficient Balance**: Warns about low gas balance

## Monitoring & Logging

The service provides detailed logging:

```
🚀 Starting Bridge Relayer...
Connected to Chain A: hardhat (31337)
Connected to Chain B: hardhat (31338)
Relayer wallet address: 0x...
Bridge A address: 0x...
Bridge B address: 0x...
Wallet balance on Chain B: 10.0 ETH
Starting from block 100 (current: 150)
Fetching TokensLocked events from block 101 to 150
Found 2 TokensLocked events
Processing TokensLocked event: {...}
✅ Successfully processed nonce 1 in block 151
```

## Security Considerations

1. **Private Key Security**: Store private keys securely, never commit to version control
2. **RPC Endpoints**: Use trusted RPC providers
3. **Network Isolation**: Run in secure network environment
4. **Monitoring**: Monitor for unusual activity or failed transactions
5. **Balance Management**: Maintain sufficient balance for gas fees

## Troubleshooting

### Common Issues

1. **"Missing required environment variable"**

   - Ensure all required environment variables are set in `.env`

2. **"Nonce has already been used"**

   - This is normal behavior for duplicate events, the relayer will skip them

3. **"Insufficient funds for gas"**

   - Add more ETH to the relayer wallet on Chain B

4. **Connection errors**
   - Verify RPC endpoints are accessible and correct

### Logs Location

- Console output shows real-time activity
- Last processed block is saved to `./last_block.txt` (configurable)

## Code Style

Code style and linting based on Biome - a modern successor of ESLint + Prettier written in Rust.

```bash
npm run check          # Run linting
```

## Docker Support

The service includes Docker support for containerized deployment:

```dockerfile
# Build and run
docker build -t bridge-relayer .
docker run --env-file .env bridge-relayer
```

# Deployment

You can use the Docker image to deploy on Docker environments (Kubernetes, ECS, etc.). You can also use a simple process with pm2.

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t {YOUR_REGISTRY}:latest . --push
```

## Available Commands

- `npm run start` - Run the relayer in production mode
- `npm run dev` - Run the relayer in development mode with auto-restart
- `npm run docker` - Build and run Docker container
- `npm run check` - Run code style and linting checks

## Architecture Details

### Event Processing Flow

```
1. Poll Chain A for new blocks
2. Query TokensLocked events in block range
3. For each event:
   ├─ Check if nonce already processed
   ├─ Construct message hash
   ├─ Sign message with relayer key
   ├─ Submit transaction to Chain B
   └─ Mark nonce as processed
4. Save last processed block
5. Repeat
```

### State Management

- **In-Memory Nonce Set**: Tracks processed nonces during runtime
- **File-Based Block Persistence**: Saves last processed block to disk
- **Graceful Recovery**: Resumes from last saved block on restart

### Error Recovery

The relayer implements several error recovery mechanisms:

- **Network Retries**: Automatic retry with exponential backoff
- **Transaction Monitoring**: Waits for confirmation before proceeding
- **Duplicate Handling**: Skips already processed events gracefully
- **Balance Monitoring**: Warns when gas balance is low

## Performance Considerations

- **Batch Processing**: Processes multiple events in a single polling cycle
- **Configurable Polling**: Adjustable interval to balance latency vs resource usage
- **Memory Efficient**: Uses Set for O(1) nonce lookups
- **Minimal Storage**: Only persists essential state information

## Production Recommendations

For production deployment, consider:

1. **Database Integration**: Replace file-based persistence with MongoDB/PostgreSQL/Redis
2. **Monitoring**: Add metrics collection (Prometheus/Grafana)
3. **Alerting**: Set up alerts for failed transactions or low balance
4. **Load Balancing**: Deploy multiple instances with shared state
5. **Key Management**: Use secure key management systems (AWS KMS, HashiCorp Vault)

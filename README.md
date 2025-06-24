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

# AI generation

Part of code (expecially tests) generated uses AI (cline + different model). All AI code was revieved by humans

# CI

Repo contains github code to run tests and check styles on each push. This is a good approach to have CI with tests and codestyle on each push

# Docker usage

You should not run code downloaded from the 'internet' on your local compoter, expecially when we talk about blockchain projects.
Docker provide nessesasry isilations fo for you to work with

It strats two chains based on regular well knonw private keys

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

that corresponds to accounts

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

All this based of well known mnemonic "test test test test test test test test test test test junk"

As well it runs deploy and bridge itself and node js container for you to communicate with nodes

```
Aware of different architecture. Do not run npm i locally and the inside docker. In case of different architecture that can cause a problem and need to remove node_modules folder and run it again
```

# Structure

Project contains multiple folders that part of one project, but not depend of each other.
Each of folders contains own modules, own build and test system

For each project you able to check avaialbe commands via

```bash
npm run
```

Please follow "contract" and "bridge" folder for readme file for each of the project

# Instalation

Each folder contain own instalation process. But on general you need to have nodejs isntallde (version 24)

```bash
https://nodejs.org/en/download
```

```bash
npm i
```

But we defenetely recomenned to use docker compsoe to run efveretrhing

```bash
docker compose up
```

## Env notes

Docekr have preconfigured variables to work independendty. It possible to use deployed adresses of contracts before it deployed not because of CREATE2 command, but because we have same chain and same deploy bytecode and same nonces of account

In real live you shoud deploy and then configure ENV variables for a real addresses

# Deploy

Each component have own deploy mechanics

- contract - uses hardhat ignation module to deploy
- relayer - can be deployed on docker or directly wiht pm2

Please follow each component documentation for more info

# Moving tokens back to original chain

This part not implemented but idea tha same

- send it to bridgeB
- bridgeB will lock it or burn (new feature)
- brideB will emit event
- relayer will listen for event
- relayer will send data back to bridgeA to unlock tokens

# Tech details (both contracts and relayer)

## Contracts

# Bridge contract

This folder contains solidity contracts for bridge

## Super Token

There are two simple OpenZepelin ERC20 constract. Both with premint amount of token, no any caps (in real workd cap shouls be set, at least max cap)

SuperToken - simple token

SuperTokenB - repesent same token on chain B. In additional this is a mintable token by owner or relayer. Secod option mostly to have more security (in case relayer private key will be compomized and final implementation will implement limits of mint tokens with proper monitoring)

### Permissions

SuperToken have no special owner methods
SuperTokenB have two additional permissions - owner and relay address. Both of this users able to mint new tokens. Owner is a EOA in most cases but relay is a smart contract address of bridge that will mint tokens after verify signatures

## Bridge contracts

There are two bridge contracts for chain A and chain B

Bridge.sol have only one permissions - owner. With ability to widwdraw token from brifge

BridgeB.sol have more complicated permission. Owner is one role there, but it also should known bridgeAddress (signer) - address of the system to sign transfers

# Instalitaion

Please follow Docker guilde on main folder for easier setup.

But if you want still to use it locally then install node js (v24) and do

```bash
npm i
```

# Enviroument variables

Project contain multiple variables.
Copy .env.example as .env

```bash
cp .env.example .env
```

and edit .env after with your data

# Deployment

# Testing

```bash
npm test
```

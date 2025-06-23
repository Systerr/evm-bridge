# Bridge project

> ⚠️ **WARNING: NOT FOR PRODUCTION USE**
>
> This project is for development, testing, and educational purposes only. Do not use this code in production environments. The code may contain security vulnerabilities, bugs, or incomplete features that could result in loss of funds or other critical issues.

# AI generation

Part of code (expecially tests) generated uses AI (cline + different model). All AI code was revieved by humans

# CI

Repo contains github code to run tests and check styles on each push. This is a good approach to have CI with tests and codestyle on each push

# Structure

Project contains multiple folders that part of one project, but not depend of each other.
Each of folders contains own modules, own build and test system

For each project you able to check avaialbe commands via

```bash
npm run
```

## Contract folder

This folder contains solidity contracts for bridge

### Super Token

there are two simple OpenZepelin ERC20 constract. Both with premint amount of token, no any caps (in real workd cap shouls be set, at least max cap)

SuperToken - simple token

SuperTokenB - repesent same tokne on chain B. In additional this is a mintable token by owner or relayer. Secod option mostly to have more security (in case relayer private key will be compomized and final implementation will implement limits of mint tokens with proper monitoring)

## Bridge folder

This is a Typescript code to forward messages between chains

# Deploy

# Testing

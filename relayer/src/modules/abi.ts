// Bridge A ABI - events and functions we need
export const BRIDGE_A_ABI = [
  "event TokensLocked(uint256 indexed nonce, address indexed destinationAddress, uint256 indexed amount)",
  "function lockTokens(uint256 amount, address recipientOnChainB) public",
  "function superToken() public view returns (address)",
];

// Bridge B ABI - functions we need
export const BRIDGE_B_ABI = [
  "event TokensClaimed(uint256 indexed nonce, address indexed recipient, uint256 indexed amount)",
  "function releaseTokens(address recipient, uint256 amount, uint256 nonce, bytes memory signature) public",
  "function superTokenB() public view returns (address)",
];

// SuperToken ABI - ERC20 functions we need
export const SUPER_TOKEN_ABI = [
  "function balanceOf(address account) public view returns (uint256)",
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function mint(address to, uint256 amount) public",
];

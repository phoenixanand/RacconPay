// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Holds USDC the mock vault has "lent out"; only the vault can pull it back.
contract MockInvestedSink {
    address public immutable vault;

    constructor() {
        vault = msg.sender;
    }

    function pay(MockERC20 token, uint256 amount) external {
        require(msg.sender == vault, "vault only");
        require(token.transfer(vault, amount), "pay failed");
    }
}

/// @dev Minimal ERC-4626-style vault for tests. NOT for production use.
///      Share accounting is exact (no virtual offset): 1:1 on an empty vault, afterwards
///      shares * totalAssets / totalShares. Assets = underlying balance of this vault, so
///      donate() raises the share price (yield) and burn() lowers it (loss).
///      Test controls: donate, burn, setMaxRedeem, setIlliquid, setDepositFeeBps,
///      setMaxFunctionsReturnZero, invest/divest/setLiquidity (partial liquidity via the vault's real USDC balance).
///      Assets that were moved to the "invested" sink still count in totalAssets() (share price unchanged) but
///      cannot be paid out: redeem/withdraw revert with "insufficient liquidity" when the vault lacks USDC.
contract MockERC4626Vault {
    MockERC20 public immutable underlying;
    address public constant FEE_SINK = address(0xFEE);
    address public constant BURN_SINK = address(0xdead);

    uint256 public totalShares;
    mapping(address => uint256) public balanceOf;

    uint256 public maxRedeemCap = type(uint256).max;
    bool public illiquid;
    uint256 public depositFeeBps;
    /// @notice When true every max* function returns 0 (mimics Morpho VaultV2); operations still work.
    bool public maxFunctionsReturnZero;
    /// @notice Holder of USDC the vault has "lent out"; counted in totalAssets() but not redeemable.
    MockInvestedSink public immutable invested;

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares
    );

    constructor(MockERC20 _underlying) {
        underlying = _underlying;
        invested = new MockInvestedSink();
    }

    // ── test controls ────────────────────────────────────────────────────────

    /// @notice Simulate yield: raises assets without minting shares.
    function donate(uint256 amount) external {
        underlying.mint(address(this), amount);
    }

    /// @notice Simulate loss: removes assets without burning shares.
    function burn(uint256 amount) external {
        underlying.transfer(BURN_SINK, amount);
    }

    /// @notice Cap the number of shares any single owner may redeem (maxRedeem).
    function setMaxRedeem(uint256 cap) external {
        maxRedeemCap = cap;
    }

    /// @notice Make every max* function (maxDeposit/maxMint/maxWithdraw/maxRedeem) return 0, like VaultV2.
    ///         deposit/redeem/withdraw keep working normally.
    function setMaxFunctionsReturnZero(bool v) external {
        maxFunctionsReturnZero = v;
    }

    /// @notice Move `amount` of the vault's USDC to the invested sink (simulates illiquidity).
    function invest(uint256 amount) public {
        require(underlying.transfer(address(invested), amount), "invest failed");
    }

    /// @notice Move the vault's entire USDC balance to the invested sink (fully illiquid by balance).
    function investAll() external {
        invest(underlying.balanceOf(address(this)));
    }

    /// @notice Bring `amount` of invested USDC back to the vault.
    function divest(uint256 amount) public {
        invested.pay(underlying, amount);
    }

    /// @notice Bring all invested USDC back to the vault.
    function divestAll() external {
        divest(underlying.balanceOf(address(invested)));
    }

    /// @notice Adjust invested funds so the vault holds exactly min(target, totalAssets()) USDC.
    function setLiquidity(uint256 target) external {
        uint256 ta = totalAssets();
        if (target > ta) target = ta;
        uint256 bal = underlying.balanceOf(address(this));
        if (bal > target) invest(bal - target);
        else if (bal < target) divest(target - bal);
    }

    /// @notice Block all redemptions (maxRedeem == 0 and redeem/withdraw revert).
    function setIlliquid(bool v) external {
        illiquid = v;
    }

    /// @notice Fee on deposits, taken from the deposited assets and sent to a sink (a pure loss to the depositor).
    function setDepositFeeBps(uint256 bps) external {
        depositFeeBps = bps;
    }

    // ── ERC-4626 surface ─────────────────────────────────────────────────────

    function asset() external view returns (address) {
        return address(underlying);
    }

    /// @dev Idle USDC plus USDC currently out in the invested sink.
    function totalAssets() public view returns (uint256) {
        return underlying.balanceOf(address(this)) + underlying.balanceOf(address(invested));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 ts = totalShares;
        uint256 ta = totalAssets();
        if (ts == 0 || ta == 0) return assets;
        return assets * ts / ta;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 ts = totalShares;
        if (ts == 0) return shares;
        return shares * totalAssets() / ts;
    }

    function maxDeposit(address) external view returns (uint256) {
        return maxFunctionsReturnZero ? 0 : type(uint256).max;
    }

    function maxMint(address) external view returns (uint256) {
        return maxFunctionsReturnZero ? 0 : type(uint256).max;
    }

    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets - assets * depositFeeBps / 10_000);
    }

    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        uint256 ts = totalShares;
        uint256 ta = totalAssets();
        if (ts == 0 || ta == 0) return assets;
        return (assets * ts + ta - 1) / ta;
    }

    /// @dev Real per-owner redeem limit enforced by redeem/withdraw; independent of maxFunctionsReturnZero.
    function _redeemLimit(address owner) internal view returns (uint256) {
        if (illiquid) return 0;
        uint256 bal = balanceOf[owner];
        return bal < maxRedeemCap ? bal : maxRedeemCap;
    }

    function maxRedeem(address owner) public view returns (uint256) {
        return maxFunctionsReturnZero ? 0 : _redeemLimit(owner);
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return maxFunctionsReturnZero ? 0 : convertToAssets(_redeemLimit(owner));
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        uint256 fee = assets * depositFeeBps / 10_000;
        shares = convertToShares(assets - fee); // priced before the assets arrive
        require(underlying.transferFrom(msg.sender, address(this), assets), "pull failed");
        if (fee > 0) require(underlying.transfer(FEE_SINK, fee), "fee failed");
        balanceOf[receiver] += shares;
        totalShares += shares;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        require(!illiquid, "illiquid");
        require(msg.sender == owner, "owner only");
        require(shares <= _redeemLimit(owner), "exceeds maxRedeem");
        assets = convertToAssets(shares);
        require(underlying.balanceOf(address(this)) >= assets, "insufficient liquidity");
        balanceOf[owner] -= shares;
        totalShares -= shares;
        require(underlying.transfer(receiver, assets), "transfer failed");
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        require(!illiquid, "illiquid");
        require(msg.sender == owner, "owner only");
        shares = previewWithdraw(assets);
        require(shares <= _redeemLimit(owner), "exceeds maxRedeem");
        require(underlying.balanceOf(address(this)) >= assets, "insufficient liquidity");
        balanceOf[owner] -= shares;
        totalShares -= shares;
        require(underlying.transfer(receiver, assets), "transfer failed");
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}

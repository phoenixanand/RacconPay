# Wallets

RacconPay connects two kinds of wallet.

| Wallet | Networks | Notes |
|---|---|---|
| Injected (MetaMask etc.) | Arc Mainnet, Arc Testnet | Works on every page |
| WalletConnect | Arc Mainnet, Arc Testnet | Needs `VITE_WALLETCONNECT_PROJECT_ID` |

## WalletConnect setup
1. Create a project at WalletConnect Cloud and copy its project ID.
2. Put it in `.env` as `VITE_WALLETCONNECT_PROJECT_ID`, then restart the dev server.

Without an ID the WalletConnect option is simply not shown.

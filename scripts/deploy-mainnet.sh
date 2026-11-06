#!/usr/bin/env bash
#
# Deploy RacconPay vesting contracts to Arc MAINNET from YOUR OWN computer.
#
#   Pauses contract (default):   scripts/deploy-mainnet.sh <keystore-account>
#   Yield contract (optional):   scripts/deploy-mainnet.sh <keystore-account> --yield <vault-address>
#
# Your private key never goes in a file in this repo. Import it once into an encrypted
# keystore (you choose a password):
#
#   cast wallet import <keystore-account> --interactive
#
# On success this script writes the new addresses to .env.local (git-ignored), which the
# frontend reads after you restart `bun run dev`. Mainnet moves real USDC and is irreversible.
#
set -euo pipefail

USDC="0x3600000000000000000000000000000000000000"
RPC="${ARC_MAINNET_RPC_URL:-https://rpc.mainnet.arc.io}"
EXPECTED_CHAIN_ID="5042"
ENV_FILE=".env.local"

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[ $# -ge 1 ] || usage
ACCOUNT="$1"; shift
WITH_YIELD="no"
VAULT=""
if [ "${1:-}" = "--yield" ]; then
  WITH_YIELD="yes"
  VAULT="${2:-}"
  [ -n "$VAULT" ] || { echo "Error: --yield needs a vault address"; usage; }
fi

# Prefer Arc's Foundry fork when installed (standard Foundry cannot simulate Arc's native USDC).
if command -v arc-forge >/dev/null 2>&1; then FORGE="arc-forge"; else FORGE="forge"; fi
command -v "$FORGE" >/dev/null 2>&1 || { echo "Error: $FORGE not found. Install Arc Foundry: https://docs.arc.io/arc/tutorials/install-arc-foundry.md"; exit 1; }
command -v cast >/dev/null 2>&1 || command -v arc-cast >/dev/null 2>&1 || { echo "Error: cast not found"; exit 1; }
if command -v arc-cast >/dev/null 2>&1; then CAST="arc-cast"; else CAST="cast"; fi

lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }

echo "Using: $FORGE / $CAST"
echo "RPC:   $RPC"

CHAIN_ID="$($CAST chain-id --rpc-url "$RPC")"
if [ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]; then
  echo "Error: RPC reports chain id $CHAIN_ID, expected $EXPECTED_CHAIN_ID (Arc Mainnet). Aborting."
  exit 1
fi

DEPLOYER="$($CAST wallet address --account "$ACCOUNT")"
BALANCE_WEI="$($CAST balance "$DEPLOYER" --rpc-url "$RPC")"
echo "Deployer: $DEPLOYER"
echo "Native USDC balance (18-decimal units for gas): $BALANCE_WEI"
if [ "$BALANCE_WEI" = "0" ]; then echo "Error: deployer has no gas USDC on Arc Mainnet."; exit 1; fi

if [ "$WITH_YIELD" = "yes" ]; then
  echo
  echo "== Vault checks for $VAULT =="
  [ "$($CAST code "$VAULT" --rpc-url "$RPC")" != "0x" ] || { echo "Error: no contract at the vault address."; exit 1; }
  VAULT_ASSET="$($CAST call "$VAULT" "asset()(address)" --rpc-url "$RPC")"
  if [ "$(lower "$VAULT_ASSET")" != "$(lower "$USDC")" ]; then
    echo "Error: vault asset is $VAULT_ASSET, not USDC ($USDC). Aborting."
    exit 1
  fi
  echo "Vault asset:        USDC (ok)"
  echo "Vault totalAssets:  $($CAST call "$VAULT" "totalAssets()(uint256)" --rpc-url "$RPC")"
  echo "Share price check:  convertToAssets(1e18) = $($CAST call "$VAULT" "convertToAssets(uint256)(uint256)" 1000000000000000000 --rpc-url "$RPC")"
  echo
  echo "The yield contract is NOT independently audited, is tied to this one vault forever,"
  echo "and has only been tested against a mock of the Arc Testnet vault."
  echo "Aave is not supported: the contract needs an ERC-4626 vault."
  read -r -p 'Type "I UNDERSTAND THE YIELD RISK" to continue: ' ACK
  [ "$ACK" = "I UNDERSTAND THE YIELD RISK" ] || { echo "Aborted."; exit 1; }
  CONTRACT="contracts/VestingStreamV2Yield.sol:VestingStreamV2Yield"
  ARGS=("$USDC" "$VAULT")
else
  CONTRACT="contracts/VestingStreamV2.sol:VestingStreamV2"
  ARGS=("$USDC")
fi

echo
echo "About to deploy $CONTRACT to ARC MAINNET (chain $CHAIN_ID) from $DEPLOYER."
echo "Constructor args: ${ARGS[*]}"
read -r -p 'Type DEPLOY to continue: ' CONFIRM
[ "$CONFIRM" = "DEPLOY" ] || { echo "Aborted."; exit 1; }

$FORGE build

OUT="$($FORGE create "$CONTRACT" --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --json --constructor-args "${ARGS[@]}")"
echo "$OUT"

ADDRESS="$(echo "$OUT" | sed -n 's/.*"deployedTo"[[:space:]]*:[[:space:]]*"\(0x[0-9a-fA-F]\{40\}\)".*/\1/p' | head -n1)"
TX="$(echo "$OUT" | sed -n 's/.*"transactionHash"[[:space:]]*:[[:space:]]*"\(0x[0-9a-fA-F]\{64\}\)".*/\1/p' | head -n1)"
[ -n "$ADDRESS" ] || { echo "Could not read the deployed address from the output above. Check the explorer for your deployer address."; exit 1; }

echo
echo "Deployed at: $ADDRESS"
echo "Tx:          $TX"

# Post-deploy check: contract exists and points at USDC.
[ "$($CAST code "$ADDRESS" --rpc-url "$RPC")" != "0x" ] || { echo "Warning: no code at $ADDRESS yet. Wait a moment and check the explorer."; exit 1; }
ONCHAIN_USDC="$($CAST call "$ADDRESS" "usdc()(address)" --rpc-url "$RPC")"
if [ "$(lower "$ONCHAIN_USDC")" != "$(lower "$USDC")" ]; then echo "Warning: usdc() returned $ONCHAIN_USDC"; exit 1; fi
echo "Check passed: usdc() = $ONCHAIN_USDC"

set_env() { # set_env KEY VALUE  (replace or append in .env.local)
  touch "$ENV_FILE"
  grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  echo "$1=$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

if [ "$WITH_YIELD" = "yes" ]; then
  set_env VITE_VESTING_YIELD_ADDRESS_MAINNET "$ADDRESS"
  set_env VITE_VESTING_YIELD_DEPLOY_TX_MAINNET "$TX"
  set_env VITE_VESTING_YIELD_VAULT_MAINNET "$VAULT"
else
  set_env VITE_VESTING_V2_ADDRESS_MAINNET "$ADDRESS"
  set_env VITE_VESTING_V2_DEPLOY_TX_MAINNET "$TX"
fi

echo
echo "Saved to $ENV_FILE. Restart the frontend (bun run dev) to pick it up."
echo "Next: open the Vesting page, switch to Arc Mainnet, and test with a tiny stream first."

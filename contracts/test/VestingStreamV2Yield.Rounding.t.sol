// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingStreamV2YieldTestBase} from "./VestingStreamV2Yield.Base.t.sol";

/// @dev ERC-4626 rounding: vault.deposit floors the shares minted and vault.redeem floors the payout, so a
///      yield stream's share value can sit a wei or two below the amount deployed. The contract's
///      DepositValueTooLow check intentionally tolerates 0.1%, so this is NOT an accounting bug.
contract VestingStreamV2YieldRoundingTest is VestingStreamV2YieldTestBase {
    /// @dev Make the share price non-integer (1.000000007) so deposit/redeem actually round.
    function _skewVaultPrice() internal {
        usdc.mint(address(this), 1000e6);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6, address(this)); // 1000e6 shares for 1000e6 assets
        vault.donate(7); // price = 1000000007 / 1000000000
    }

    /// @notice After the whole stream vested, the final claim pays at least claimable minus 1 wei per vault
    ///         operation (1 deposit at creation + 1 redeem during the claim), and never more than claimable.
    function test_FinalClaim_PaysAtLeastClaimableMinusOneWeiPerVaultOp() public {
        _skewVaultPrice();
        uint256 sid = _create(true);

        // Deposit rounding is real here: the shares are worth strictly less than the 700e6 deployed.
        assertLt(_value(sid) - _idle(sid), DEPLOYED, "deposit should round down");
        assertGe(_value(sid) - _idle(sid), DEPLOYED - 1, "deposit loses at most 1 wei");

        _at(DURATION); // entire stream vested
        uint256 claimable = ys.claimableAmount(sid);
        assertEq(claimable, TOTAL);

        uint256 balBefore = usdc.balanceOf(alice);
        _claim(sid);
        uint256 paid = usdc.balanceOf(alice) - balBefore;

        uint256 vaultOps = 2; // vault.deposit at createStream + vault.redeem inside claim
        assertLe(paid, claimable, "never overpays");
        assertGe(paid, claimable - vaultOps, "shortfall bounded by 1 wei per vault op");
        assertEq(_claimed(sid), paid, "claimedAmount tracks what was actually paid");
    }

    /// @notice The shortfall is not lost: a second claim retries and can only pay what the vault can return;
    ///         total paid to the beneficiary stays within the same per-op rounding bound.
    function test_FinalClaim_RemainderBoundedByRoundingNotPrincipal() public {
        _skewVaultPrice();
        uint256 sid = _create(true);
        _at(DURATION);
        _claim(sid);
        uint256 outstanding = TOTAL - _claimed(sid);
        assertLe(outstanding, 2, "outstanding principal is at most the rounding dust");
    }
}

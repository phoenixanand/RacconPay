// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {BlocklistERC20} from "../test-helpers/BlocklistERC20.sol";

/// @dev V2 invariant handler: fixed payer/payee/arbiter, bounded random actions across both tokens,
///      including requestChanges, resubmission, escalation and refunds of ChangesRequested milestones.
///      Every action checks its preconditions so calls succeed often and explore real state.
contract MilestoneEscrowV2Handler is Test {
    MilestoneEscrowV2 public esc;
    MockERC20 public usdc;
    BlocklistERC20 public eurc;
    bool public immutable allowDonate;

    address public payer = address(0xA11CE);
    address public payee = address(0xB0B);
    address public arbiter = address(0xCAFE);
    address public anyone = address(0xDEAD);

    // ghost counters so tests can confirm the interesting paths are actually reached
    uint256 public requests;
    uint256 public resubmits;
    uint256 public escalations;
    uint256 public crRefunds;

    constructor(MilestoneEscrowV2 esc_, MockERC20 usdc_, BlocklistERC20 eurc_, bool allowDonate_) {
        esc = esc_;
        usdc = usdc_;
        eurc = eurc_;
        allowDonate = allowDonate_;
        vm.startPrank(payer);
        usdc.approve(address(esc), type(uint256).max);
        eurc.approve(address(esc), type(uint256).max);
        vm.stopPrank();
    }

    function _pick(uint256 idSeed, uint256 iSeed)
        internal
        view
        returns (
            bool ok,
            uint256 id,
            uint256 i,
            MilestoneEscrowV2.Milestone memory m,
            MilestoneEscrowV2.Escrow memory e
        )
    {
        uint256 n = esc.escrowCount();
        if (n == 0) return (false, 0, 0, m, e);
        id = bound(idSeed, 1, n);
        e = esc.getEscrow(id);
        i = bound(iSeed, 0, e.milestoneCount - 1);
        m = esc.getMilestone(id, i);
        ok = true;
    }

    function create(uint256 seed, uint256 count, bool useEurc, bool withArb) external {
        if (esc.escrowCount() >= 12) return;
        address token = useEurc ? address(eurc) : address(usdc);
        if (useEurc && eurc.blocked(payer)) return;
        count = bound(count, 1, 5);
        uint256[] memory a = new uint256[](count);
        string[] memory titles = new string[](count);
        uint256 total;
        for (uint256 k; k < count; ++k) {
            a[k] = bound(uint256(keccak256(abi.encode(seed, k))), 1, 1e9);
            titles[k] = k % 2 == 0 ? "title" : "";
            total += a[k];
        }
        MockERC20(token).mint(payer, total);
        vm.prank(payer);
        esc.createEscrow(
            payee,
            withArb ? arbiter : address(0),
            token,
            a,
            titles,
            uint64(bound(seed, 1 days, 90 days)),
            uint64(block.timestamp + bound(seed >> 16, 1, 60 days)),
            "memo"
        );
    }

    /// @dev Initial submission (Funded) or resubmission (ChangesRequested).
    function submit(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m,) = _pick(idSeed, iSeed);
        if (!ok) return;
        if (m.status == MilestoneEscrowV2.Status.ChangesRequested) ++resubmits;
        else if (m.status != MilestoneEscrowV2.Status.Funded) return;
        vm.prank(payee);
        esc.submitMilestone(id, i, "ipfs://note");
    }

    function requestChanges(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m, MilestoneEscrowV2.Escrow memory e) =
            _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.Submitted) return;
        if (block.timestamp >= m.submittedAt + e.reviewWindow) return;
        if (m.revisions >= esc.MAX_REVISIONS()) return;
        vm.prank(payer);
        esc.requestChanges(id, i, "please revise");
        ++requests;
    }

    function escalate(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m, MilestoneEscrowV2.Escrow memory e) =
            _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.ChangesRequested || e.arbiter == address(0)) return;
        vm.prank(payee);
        esc.escalate(id, i);
        ++escalations;
    }

    function approve(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m,) = _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.Submitted) return;
        vm.prank(payer);
        esc.approveMilestone(id, i);
    }

    function claim(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m, MilestoneEscrowV2.Escrow memory e) =
            _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.Submitted) return;
        if (block.timestamp < m.submittedAt + e.reviewWindow) return;
        vm.prank(payee);
        esc.claimAfterWindow(id, i);
    }

    function dispute(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m, MilestoneEscrowV2.Escrow memory e) =
            _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.Submitted || e.arbiter == address(0)) return;
        if (block.timestamp >= m.submittedAt + e.reviewWindow) return;
        vm.prank(payer);
        esc.dispute(id, i);
    }

    function resolve(uint256 idSeed, uint256 iSeed, uint256 split) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m,) = _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.Disputed) return;
        vm.prank(arbiter);
        esc.resolve(id, i, bound(split, 0, m.amount));
    }

    function resolveByTimeout(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m,) = _pick(idSeed, iSeed);
        if (!ok || m.status != MilestoneEscrowV2.Status.Disputed) return;
        if (block.timestamp < m.disputedAt + 30 days) return;
        vm.prank(anyone);
        esc.resolveByTimeout(id, i);
    }

    /// @dev Refunds Funded milestones after the deadline and ChangesRequested ones after the response window.
    function refund(uint256 idSeed, uint256 iSeed) external {
        (bool ok, uint256 id, uint256 i, MilestoneEscrowV2.Milestone memory m, MilestoneEscrowV2.Escrow memory e) =
            _pick(idSeed, iSeed);
        if (!ok) return;
        uint256 after_ = e.deadline;
        if (m.status == MilestoneEscrowV2.Status.ChangesRequested) {
            if (m.changesRequestedAt > after_) after_ = m.changesRequestedAt;
            after_ += e.reviewWindow;
            ++crRefunds;
        } else if (m.status != MilestoneEscrowV2.Status.Funded) {
            return;
        }
        if (block.timestamp <= after_) {
            if (m.status == MilestoneEscrowV2.Status.ChangesRequested) --crRefunds;
            return;
        }
        vm.prank(payer);
        esc.refundUnstarted(id, i);
    }

    function cancel(uint256 idSeed, bool byPayer) external {
        uint256 n = esc.escrowCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        MilestoneEscrowV2.Escrow memory e = esc.getEscrow(id);
        if (e.cancelled) return;
        if (byPayer ? e.payerConfirmed : e.payeeConfirmed) return;
        vm.prank(byPayer ? payer : payee);
        esc.cancelByAgreement(id);
    }

    function withdraw(bool byPayer, bool useEurc) external {
        address who = byPayer ? payer : payee;
        address token = useEurc ? address(eurc) : address(usdc);
        if (esc.creditOf(who, token) == 0) return;
        if (useEurc && eurc.blocked(who)) return;
        vm.prank(who);
        esc.withdraw(token);
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 0, 40 days));
    }

    /// @dev Toggle EURC blocklisting for payer or payee; may also flip the false-return mode.
    function setBlocked(bool payerSide, bool on, bool returnFalse) external {
        eurc.setBlocked(payerSide ? payer : payee, on);
        eurc.setReturnFalseOnBlocked(returnFalse);
    }

    /// @dev Unsolicited transfer straight to the escrow (surplus). No-op unless allowed.
    function donate(uint256 amount, bool useEurc) external {
        if (!allowDonate) return;
        MockERC20(useEurc ? address(eurc) : address(usdc)).mint(address(esc), bound(amount, 1, 1e9));
    }
}

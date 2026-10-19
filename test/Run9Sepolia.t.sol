// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SepoliaFixture} from "./utils/SepoliaFixture.sol";
import {MockIMD, MockStacker, MockIntake, BuyRouter} from "./utils/Mocks.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {PLEA} from "../src/PLEA.sol";
import {CabalGate} from "../src/CabalGate.sol";
import {Seasons} from "../src/Seasons.sol";
import {Tribunal} from "../src/Tribunal.sol";
import {PleaHook} from "../src/PleaHook.sol";
import {OracleAttestation, OracleAttestationConsumer} from "../src/OracleAttestation.sol";

/// @dev Run 9 on Sepolia: imdTEST is the pool currency AND the oracle fee asset (the launch's mint
/// flag is 0), Objection! is on, and imd/acc's Stacker stakes the earlier test IMD, a different token,
/// so its credit reverts and the hook must fall back to plain imdTEST cashback. Sepolia timings
/// (18000 / 118800) and credit gas 1300000 come from SepoliaFixture.
abstract contract Run9Base is SepoliaFixture {
    uint256 constant FEE = 0.5e18;
    uint256 constant STAKE = 0.35e18;
    address constant PAY_TO = address(0xFEE);

    address dave = makeAddr("dave");
    address erin = makeAddr("erin");

    function withTribunal() internal pure override returns (bool) {
        return true;
    }

    /// @dev imdTEST is the oracle fee asset, so the launch's mint flag (`feeToken != imd`) is 0.
    function oracleFeeToken() internal view override returns (MockIMD) {
        return imd;
    }

    function setUp() public virtual override {
        super.setUp();
        // The Sepolia Stacker stakes the earlier open-mint test IMD (`oimd` here), not imdTEST: its
        // `imd` is storage slot 0 of MockStacker.
        vm.store(address(stacker), bytes32(uint256(0)), bytes32(uint256(uint160(address(oimd)))));
        assertEq(address(stacker.imd()), address(oimd));
        fund(dave);
        fund(erin);
    }

    function imdId() internal view returns (uint256) {
        return uint256(uint160(address(imd)));
    }

    function claimsOf(address who) internal view returns (uint256) {
        return pm.balanceOf(who, imdId());
    }

    /// @dev The agreed 2 imdTEST opening buy (its payouts join the pool).
    function openingBuy() internal {
        imd.mint(OWNER, 2e18);
        vm.prank(OWNER);
        imd.approve(address(router), type(uint256).max);
        vm.prank(OWNER);
        router.buyExactIn(2e18, abi.encode(OWNER));
    }
}

contract Run9SepoliaTest is Run9Base {
    // ---------------------------------------------------------------- the agreed numbers

    function test_run9FeeAndGuardNumbers() public view {
        assertEq(hook.OWNER_BPS(), 100, "owner 1%");
        assertEq(hook.CASHBACK_BPS(), 50);
        assertEq(hook.PRIZE_BPS(), 25);
        assertEq(hook.POOL_BPS(), 25);
        assertEq(hook.IMD_FEE_BPS(), 200);
        // 2% IMD + 0.25% PLEA burn = the 2.25% the Letterbox's HOOK_SALE_FEE_BPS (225) counts.
        assertEq(hook.IMD_FEE_BPS() + hook.PLEA_BURN_BPS(), 225, "fees 2.25%");
        assertEq(hook.WALL_GUARD_TICKS_PER_DAY(), 700);
        assertEq(hook.PAYOUT_RESERVE(), 2e18);
        assertEq(gate.ORACLE_FEE(), 0.5e18);
        assertEq(gate.PASS_MARK(), 71);
        assertEq(gate.MAX_PLEA_SCORE(), 45);
        assertEq(tribunal.STAKE(), 0.35e18);
        assertEq(tribunal.OBJECTION_WINDOW(), 20 minutes);
        assertEq(tribunal.MARGIN(), 2);
        assertEq(tribunal.MAX_OBJECTIONS(), 2);
    }

    function test_imdTESTIsBothThePoolCurrencyAndTheOracleFee_mintFlagZero() public view {
        assertEq(address(gate.oracleAsset()), address(imd));
        assertEq(address(gate.imd()), address(imd));
        assertEq(launch.oracleAsset(), address(imd));
        assertFalse(launch.mintOracleFee(), "mint flag 0");
        assertEq(address(tribunal.oracleAsset()), address(imd));
        assertEq(address(tribunal.imd()), address(imd));
        assertFalse(tribunal.mintOracleFee());
    }

    // ---------------------------------------------------------------- PAYOUT_RESERVE

    /// @dev The PoolManager holds no imdTEST after seed: the 2 imdTEST opening buy's payouts (owner,
    /// prize, cashback) join the pool; nothing is paid as ERC-20 or claims.
    function test_openingTwoImdTESTBuy_payoutsJoinThePool() public {
        assertEq(imd.balanceOf(address(pm)), 0);
        imd.mint(OWNER, 2e18);
        vm.prank(OWNER);
        imd.approve(address(router), type(uint256).max);
        vm.expectEmit(false, false, false, false, address(hook));
        emit PleaHook.PayoutsToPool(0);
        vm.prank(OWNER);
        router.buyExactIn(2e18, abi.encode(OWNER));
        assertEq(hook.totalOwnerFees(), 0);
        assertEq(hook.totalPrize(), 0);
        assertEq(hook.totalCashback(), 0);
        assertEq(imd.balanceOf(OWNER), 0, "the opening buyer gets no cashback back");
        assertEq(claimsOf(OWNER), 0);
        assertEq(claimsOf(address(seasons)), 0);
        assertEq(hook.totalPoolFees(), hook.retainClaims());
        assertGt(hook.totalPoolFees(), 0);

        // The next buy finds imdTEST in the PoolManager and pays plainly: 1% to the owner.
        uint256 before = imd.balanceOf(alice);
        buy(alice, 10.2e18); // a 10 imdTEST fill plus its 2% fee on top
        assertEq(imd.balanceOf(OWNER), hook.totalOwnerFees());
        assertApproxEqAbs(hook.totalOwnerFees(), 0.1e18, 1, "owner 1% of a 10 imdTEST fill");
        assertApproxEqAbs(hook.totalPrize(), 0.025e18, 1);
        assertApproxEqAbs(hook.totalCashback(), 0.05e18, 1);
        assertEq(before - imd.balanceOf(alice), 10.2e18 - hook.totalCashback(), "cashback paid back in plain imdTEST");
        assertEq(claimsOf(OWNER), 0);
    }

    /// @dev A dust buy first cannot use the exception up: the 2 imdTEST buy after it still joins.
    function test_dustBuyFirst_openingBuyStillJoinsThePool() public {
        buy(alice, 0.01e18);
        assertEq(hook.totalOwnerFees(), 0);
        openingBuy();
        assertEq(hook.totalOwnerFees(), 0);
        assertEq(claimsOf(OWNER), 0);
        assertEq(imd.balanceOf(OWNER), 0);
    }

    /// @dev Without the opening buy, a first buy whose own fee reaches the reserve finds an empty
    /// PoolManager: its payouts are ERC-6909 imdTEST claims, cashback included (no Stacker call).
    function test_largeFirstBuy_payoutsAreClaims() public {
        vm.recordLogs();
        buy(alice, 204e18);
        assertEq(imd.balanceOf(OWNER), 0);
        assertEq(claimsOf(OWNER), hook.totalOwnerFees());
        assertApproxEqAbs(hook.totalOwnerFees(), 2e18, 1, "1% of a 200 imdTEST fill");
        assertApproxEqAbs(claimsOf(alice), 1e18, 1, "0.5% cashback as a claim");
        assertEq(hook.totalCashback(), claimsOf(alice));
        assertEq(claimsOf(address(seasons)) + imd.balanceOf(address(seasons)), hook.totalPrize());
        assertEq(simd.balanceOf(alice), 0);
        // The claims are redeemable: the PoolManager holds at least every claim it issued.
        assertGe(
            imd.balanceOf(address(pm)),
            claimsOf(OWNER) + claimsOf(alice) + claimsOf(address(seasons)) + claimsOf(address(hook))
        );
    }

    // ---------------------------------------------------------------- the Stacker fallback

    function test_stackerCreditReverts_cashbackPaidInPlainImdTEST() public {
        openingBuy();
        uint256 before = imd.balanceOf(alice);
        vm.expectEmit(true, false, false, true, address(hook));
        emit PleaHook.CashbackPaidPlain(alice, 0.25e18);
        buy(alice, 51e18);
        assertEq(before - imd.balanceOf(alice), 51e18 - 0.25e18);
        assertEq(simd.balanceOf(alice), 0, "no sIMD: the credit reverted");
        assertEq(imd.allowance(address(hook), address(stacker)), 0, "no allowance left behind");
        assertEq(imd.balanceOf(address(hook)), hook.retainedImd(), "the hook keeps no cashback");
        assertEq(hook.totalCashback(), 0.25e18);
        assertEq(hook.totalOwnerFees(), 0.5e18);
    }

    /// @dev Control: the same buy against a Stacker that stakes imdTEST stacks the cashback, so the
    /// fallback above is caused by the token mismatch alone.
    function test_control_stackerOfImdTEST_stacks() public {
        vm.store(address(stacker), bytes32(uint256(0)), bytes32(uint256(uint160(address(imd)))));
        openingBuy();
        vm.expectEmit(true, false, false, true, address(hook));
        emit PleaHook.CashbackStacked(alice, 0.25e18);
        buy(alice, 51e18);
        assertEq(simd.balanceOf(alice), 0.25e18);
    }

    /// @dev Exact-in buys of any size after the opening buy: the 2% is charged on top of the fill, so
    /// the fill is amount / 1.02 and owner 1%, prize 0.25%, cashback 0.5% (plain imdTEST) and pool
    /// 0.25% are shares of it, each rounded down.
    /// forge-config: default.fuzz.runs = 64
    function testFuzz_buyFeeSplit(uint256 amount) public {
        amount = bound(amount, 1e15, 2_000e18);
        openingBuy();
        uint256 o0 = hook.totalOwnerFees();
        uint256 p0 = hook.totalPrize();
        uint256 c0 = hook.totalCashback();
        uint256 f0 = hook.totalPoolFees();
        uint256 bal = imd.balanceOf(alice);
        buy(alice, amount);
        uint256 dOwner = hook.totalOwnerFees() - o0;
        uint256 dCash = hook.totalCashback() - c0;
        uint256 fill = amount * 10_000 / 10_200;
        assertApproxEqAbs(dOwner, fill * 100 / 10_000, 1);
        assertApproxEqAbs(hook.totalPrize() - p0, fill * 25 / 10_000, 1);
        assertApproxEqAbs(dCash, fill * 50 / 10_000, 1);
        // Nothing leaks: the four shares add up to the fee, which is the input minus the fill.
        assertApproxEqAbs(dOwner + dCash + (hook.totalPrize() - p0) + (hook.totalPoolFees() - f0), amount - fill, 1);
        // A buy whose payouts exceed the PoolManager's imdTEST pays them as ERC-6909 claims.
        assertEq(imd.balanceOf(OWNER) + claimsOf(OWNER), hook.totalOwnerFees());
        assertEq(bal - imd.balanceOf(alice) + dCash - claimsOf(alice), amount);
    }

    // ---------------------------------------------------------------- share bands (L85-M-1)

    function _holder() internal returns (uint256 bal) {
        openingBuy();
        buy(alice, 200e18);
        skip(1 days);
        buy(bob, 1e18); // a checkpoint in the new hour
        bal = plea.balanceOf(alice);
        (, uint256 heldPlea,) = hook.basisOf(alice);
        // Every wei of alice's PLEA is covered by her buy record, so the share band is the only term
        // of the fact score that depends on the amount.
        assertGe(heldPlea, bal);
    }

    function test_shareBandEdgesAreExact() public {
        uint256 bal = _holder();
        uint256 at20 = bal * 2000 / 10_000;
        uint256 at35 = bal * 3500 / 10_000;
        assertEq(uint256(gate.factScore(alice, at20)) - gate.factScore(alice, at20 + 1), 7, "20% edge: 16 -> 9");
        assertEq(uint256(gate.factScore(alice, at35)) - gate.factScore(alice, at35 + 1), 6, "35% edge: 9 -> 3");
        assertEq(gate.factScore(alice, 1), gate.factScore(alice, at20));
        assertEq(gate.factScore(alice, at35 + 1), gate.factScore(alice, bal));
    }

    /// forge-config: default.fuzz.runs = 128
    function testFuzz_shareBandMatchesExactShare(uint256 amount) public {
        uint256 bal = _holder();
        amount = bound(amount, 1, bal);
        uint256 base = uint256(gate.factScore(alice, 1)) - 16;
        uint256 band = amount * 10_000 <= bal * 2000 ? 16 : amount * 10_000 <= bal * 3500 ? 9 : 3;
        assertEq(gate.factScore(alice, amount), base + band);
    }

    /// @dev need = 71 - fact; a plea whose need is above 45 is refused with CannotPass(need).
    function test_cannotPassAboveFortyFive() public {
        openingBuy();
        buy(alice, 15e18);
        uint256 bal = plea.balanceOf(alice);
        uint256 big = bal * 45 / 100;
        assertLe(big, 2_500_000e18);
        uint256 fact = gate.factScore(alice, big);
        assertGt(71 - fact, 45, "a fresh 45% plea cannot pass");
        vm.expectRevert(abi.encodeWithSelector(CabalGate.CannotPass.selector, 71 - fact));
        vm.prank(alice);
        gate.submitSell(big, "I have held through every candle and need to pay rent; I keep the rest.");
    }

    // ---------------------------------------------------------------- the hand plea pays imdTEST

    function test_handPleaPaysTheOracleFeeInImdTEST() public {
        openingBuy();
        buy(alice, 200e18);
        skip(1 days);
        uint256 before = imd.balanceOf(alice);
        uint256 pay0 = imd.balanceOf(PAY_TO);
        uint256 oimd0 = oimd.balanceOf(alice);
        uint256 id = plead(alice, small(alice));
        assertEq(before - imd.balanceOf(alice), FEE);
        assertEq(imd.balanceOf(PAY_TO) - pay0, FEE);
        assertEq(oimd.balanceOf(alice), oimd0, "the earlier test IMD is not touched");
        assertEq(imd.balanceOf(address(gate)), 0);
        assertTrue(gate.getPlea(id).intakeId != bytes32(0));
    }

    function test_handPleaWithoutImdTESTAllowance_reverts() public {
        openingBuy();
        buy(alice, 200e18);
        skip(1 days);
        vm.prank(alice);
        imd.approve(address(gate), 0);
        uint256 amount = small(alice);
        vm.expectRevert();
        vm.prank(alice);
        gate.submitSell(amount, "I have held through every candle and need to pay rent; I keep the rest.");
    }

    function test_handPleaWithoutImdTESTBalance_reverts() public {
        openingBuy();
        buy(alice, 200e18);
        skip(1 days);
        // The earlier test IMD does not pay: alice holds plenty of it but no imdTEST.
        uint256 left = imd.balanceOf(alice);
        vm.prank(alice);
        imd.transfer(bob, left);
        assertGt(oimd.balanceOf(alice), FEE);
        uint256 amount = small(alice);
        vm.expectRevert();
        vm.prank(alice);
        gate.submitSell(amount, "I have held through every candle and need to pay rent; I keep the rest.");
    }

    // ---------------------------------------------------------------- objections in imdTEST

    function _approvedAtNeed() internal returns (uint256 id, uint8 need) {
        openingBuy();
        for (uint256 i; i < users.length; ++i) {
            buy(users[i], 50e18);
        }
        buy(dave, 50e18);
        skip(1 days);
        id = plead(alice, plea.balanceOf(alice) / 10);
        need = gate.getPlea(id).need;
        require(answer(id, need), "not delivered");
    }

    function test_objectionPaysFeeAndStakeInImdTEST_sustainedReturnsStake() public {
        (uint256 id, uint8 need) = _approvedAtNeed();
        uint256 b0 = imd.balanceOf(bob);
        uint256 pay0 = imd.balanceOf(PAY_TO);
        uint256 o = objectTo(bob, id);
        assertEq(b0 - imd.balanceOf(bob), FEE + STAKE, "0.5 fee + 0.35 stake, both imdTEST");
        assertEq(imd.balanceOf(PAY_TO) - pay0, FEE);
        assertEq(imd.balanceOf(address(tribunal)), STAKE);
        assertTrue(rule(o, need - 3));
        assertEq(uint8(tribunal.objection(o).ruling), uint8(Tribunal.Ruling.Sustained));
        tribunal.settle(o);
        assertEq(b0 - imd.balanceOf(bob), FEE, "stake back");
        assertEq(imd.balanceOf(address(tribunal)), 0);
        vm.expectRevert(abi.encodeWithSelector(Tribunal.AlreadySettled.selector, o));
        tribunal.settle(o);
        // A sustained case is closed.
        objectFails(carol, id, abi.encodeWithSelector(Tribunal.CaseClosed.selector, id));
    }

    function test_objectionAtTheMarginIsOverruled_stakeToSeasonPot() public {
        (uint256 id, uint8 need) = _approvedAtNeed();
        uint256 o = objectTo(bob, id);
        assertTrue(rule(o, need - 2));
        assertEq(uint8(tribunal.objection(o).ruling), uint8(Tribunal.Ruling.Overruled));
        uint256 s0 = imd.balanceOf(address(seasons));
        tribunal.settle(o);
        assertEq(imd.balanceOf(address(seasons)) - s0, STAKE);
    }

    function test_objectionRefusals() public {
        (uint256 id, uint8 need) = _approvedAtNeed();
        objectFails(alice, id, Tribunal.NotEligible.selector); // the seller
        objectFails(OWNER, id, Tribunal.NotEligible.selector); // excluded by Seasons
        uint256 o1 = objectTo(bob, id);
        objectFails(bob, id, Tribunal.SameObjector.selector);
        assertTrue(rule(o1, need - 2));
        objectFails(bob, id, Tribunal.SameObjector.selector);
        uint256 o2 = objectTo(carol, id);
        assertTrue(rule(o2, need));
        objectFails(dave, id, abi.encodeWithSelector(Tribunal.CaseClosed.selector, id));
        // Not settled yet: an unruled id cannot settle.
        vm.expectRevert(abi.encodeWithSelector(Tribunal.NotRuled.selector, 99));
        tribunal.settle(99);
    }

    function test_objectionAfterTwentyMinutes_windowClosed() public {
        (uint256 id,) = _approvedAtNeed();
        skip(20 minutes + 1);
        objectFails(bob, id, abi.encodeWithSelector(Tribunal.WindowClosed.selector, id));
    }

    function test_objectionAtExactlyTwentyMinutes_accepted() public {
        (uint256 id,) = _approvedAtNeed();
        skip(20 minutes);
        objectTo(bob, id);
    }

    function test_objectionWithoutImdTEST_reverts() public {
        (uint256 id,) = _approvedAtNeed();
        uint256 left = imd.balanceOf(erin);
        vm.prank(erin);
        imd.transfer(bob, left - (FEE + STAKE - 1)); // one wei short of fee + stake
        vm.startPrank(erin);
        imd.approve(address(tribunal), type(uint256).max);
        vm.expectRevert();
        tribunal.object(id, "That plea is boilerplate: the same three lines as every other sell this week.");
        vm.stopPrank();
    }

    function test_unansweredObjectionIsVoid_stakeBack() public {
        (uint256 id,) = _approvedAtNeed();
        uint256 b0 = imd.balanceOf(bob);
        uint256 o = objectTo(bob, id);
        vm.expectRevert(Tribunal.NotStale.selector);
        tribunal.expire(o);
        skip(20 minutes + 1);
        tribunal.expire(o);
        assertEq(uint8(tribunal.objection(o).ruling), uint8(Tribunal.Ruling.Void));
        tribunal.settle(o);
        assertEq(b0 - imd.balanceOf(bob), FEE);
    }

    function test_deniedPleaCannotBeObjected() public {
        openingBuy();
        buy(alice, 50e18);
        skip(1 days);
        uint256 id = plead(alice, plea.balanceOf(alice) / 10);
        require(answer(id, 0), "not delivered");
        objectFails(bob, id, abi.encodeWithSelector(Tribunal.NotApproved.selector, id));
    }
}

// ==================================================================== invariants

/// @dev Drives the run-9 pool with random buys, hand pleas with random scores and the clock.
contract Run9Handler is Test {
    uint256 constant SIGNER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    MockIMD public imd;
    PLEA public plea;
    CabalGate public gate;
    PleaHook public hook;
    BuyRouter public router;
    MockIntake public intake;
    address[] public actors;

    uint256 public ghostImdIn;
    uint256 public ghostBuys;
    uint256 public ghostPleas;
    uint256 public ghostAnswered;
    mapping(address => uint256) public ghostSpent;

    constructor(
        MockIMD imd_,
        PLEA plea_,
        CabalGate gate_,
        PleaHook hook_,
        BuyRouter router_,
        MockIntake intake_,
        address[] memory actors_
    ) {
        (imd, plea, gate, hook, router, intake) = (imd_, plea_, gate_, hook_, router_, intake_);
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function buy(uint256 who, uint256 amount) external {
        address a = actors[who % actors.length];
        amount = bound(amount, 1e15, 300e18);
        uint256 before = imd.balanceOf(a);
        vm.prank(a);
        try router.buyExactIn(amount, abi.encode(a)) {
            ghostImdIn += amount;
            ghostBuys++;
            ghostSpent[a] += before - imd.balanceOf(a);
        } catch {}
    }

    function plead(uint256 who, uint256 shareBps, uint256 score) external {
        address a = actors[who % actors.length];
        uint256 bal = plea.balanceOf(a);
        if (bal == 0) return;
        uint256 amount = bal * bound(shareBps, 100, 2_000) / 10_000;
        if (amount > 2_500_000e18) amount = 2_500_000e18;
        uint256 before = imd.balanceOf(a);
        vm.prank(a);
        try gate.submitSell(amount, "I have held through every candle and need to pay rent; I keep the rest.") returns (
            uint256 id
        ) {
            ghostPleas++;
            ghostSpent[a] += before - imd.balanceOf(a);
            score = bound(score, 0, 45);
            bytes32 intakeId = gate.getPlea(id).intakeId;
            OracleAttestation.Attestation memory att = OracleAttestation.Attestation({
                requestId: keccak256(abi.encode("oracle", id)),
                chainId: 1,
                questionHash: keccak256("question"),
                answerType: OracleAttestation.ANSWER_UINT256,
                answer: abi.encode(score),
                figure: score,
                fromBlock: 26_000_000,
                toBlock: 26_000_300,
                blockHash: keccak256("block"),
                panelJobId: keccak256(abi.encode("job", id)),
                panelSize: 30,
                quorum: 17,
                agreed: 20,
                issuedAt: uint64(block.timestamp),
                expiresAt: uint64(block.timestamp + 3600)
            });
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(SIGNER_KEY, OracleAttestationConsumer(address(gate)).attestationDigest(att));
            uint256 b2 = imd.balanceOf(a);
            if (intake.complete(intakeId, 0, abi.encode(intakeId, att, abi.encodePacked(r, s, v)))) ghostAnswered++;
            // An approved sale pays the seller imdTEST: that is income, not spending.
            uint256 b3 = imd.balanceOf(a);
            if (b3 < b2) ghostSpent[a] += b2 - b3;
        } catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1, 12 hours));
    }
}

contract Run9InvariantTest is Run9Base {
    Run9Handler handler;
    uint256 supplyAtStart;
    uint256 burnedAtStart;

    function setUp() public override {
        super.setUp();
        openingBuy();
        address[] memory actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        actors[3] = dave;
        handler = new Run9Handler(imd, plea, gate, hook, router, intake, actors);
        // Every actor holds PLEA a day before the sequence starts, so a plea call can land at once.
        for (uint256 i; i < actors.length; ++i) {
            buy(actors[i], 20e18);
        }
        skip(1 days);
        supplyAtStart = plea.totalSupply();
        burnedAtStart = hook.totalBurned();
        targetContract(address(handler));
    }

    /// @dev Everything the hook says it paid the owner is in the owner's hands, as ERC-20 or claims.
    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 30
    function invariant_ownerFeesAreHeld() public view {
        assertEq(imd.balanceOf(OWNER) + claimsOf(OWNER), hook.totalOwnerFees());
    }

    /// @dev The prize's 0.25% never exceeds a quarter of the owner's 1% (it stops once the Cabal's
    /// dead-man lapses and joins the pool), and the owner's 1% is twice the 0.5% cashback up to one wei
    /// of rounding per trade (every trade here names its trader).
    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 30
    function invariant_feeRatios() public view {
        uint256 o = hook.totalOwnerFees();
        // one wei of rounding per trade: the handler's, plus the opening buy and the four in setUp
        uint256 n = handler.ghostBuys() + handler.ghostAnswered() + 5;
        assertLe(hook.totalPrize() * 4, o);
        assertLe(hook.totalCashback() * 2, o + n);
        assertLe(o, hook.totalCashback() * 2 + 2 * n);
    }

    /// @dev The PoolManager can redeem every imdTEST claim the hook issued.
    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 30
    function invariant_poolManagerCoversClaims() public view {
        uint256 claims = claimsOf(OWNER) + claimsOf(address(seasons)) + claimsOf(address(hook));
        for (uint256 i; i < handler.actorCount(); ++i) {
            claims += claimsOf(handler.actors(i));
        }
        assertGe(imd.balanceOf(address(pm)), claims);
        assertGe(claimsOf(address(hook)), hook.retainClaims());
    }

    /// @dev The Stacker fallback never strands cashback in the hook or leaves an allowance.
    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 30
    function invariant_noCashbackStranded() public view {
        assertEq(imd.allowance(address(hook), address(stacker)), 0);
        assertEq(simd.totalSupply(), 0);
        assertLe(imd.balanceOf(address(hook)), hook.retainedImd() + 1);
    }

    function afterInvariant() public view {
        // Non-vacuity: the sequence reached the gate (a run with no plea call at all is (2/3)^30 rare).
        assertGt(handler.ghostBuys() + handler.ghostPleas(), 0, "nothing traded");
    }

    /// @dev After seed PLEA is only burned: the supply never grows and the hook's burn count fits.
    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 30
    function invariant_pleaSupplyOnlyShrinks() public view {
        assertLe(plea.totalSupply(), supplyAtStart);
        assertLe(hook.totalBurned() - burnedAtStart, supplyAtStart - plea.totalSupply());
    }
}

# PLEA Sepolia test run 9 adaptation

The checkout arrived with run 9's code already in place: run 8.5's code (launch #1981, branch
testnet8.5 @ af57f6d) plus every change the brief lists. This adaptation checks each of those
changes against the brief, fixes the one import-audit finding that reproduces (documentation only),
and adds a test for it. No deployment, signing or broadcast was done.

## Run 9's changes, as imported (verified, retained)

Diff `af57f6d..HEAD` over `src/`, `launch.json` and the launch suites:

| Change | File | Why |
| --- | --- | --- |
| Share bands compare the exact share: `_shareBps` rounds up, also for an appeal's lesser share | `src/CabalGate.sol` | Run 8.5 launch audit L85-M-1 (brief item 1). |
| Seat-NFT word in EIP-55 form, plus a manifest test of every static address word | `launch.json`, `test/LaunchManifest.t.sol` | Run 8.5 launch audit L85-F-1 (brief item 1). |
| `PleaHook.OWNER_BPS` 75 -> 100 (fees 2.25% in all) | `src/PleaHook.sol` | Brief item 2. |
| `Letterbox.HOOK_SALE_FEE_BPS` 200 -> 225, so the 95% delivery floor counts the 2.25% sale fees; new Letterbox hash as PleaLaunch's 12th argument | `src/Letterbox.sol`, `launch.json` | Brief item 2. |
| `WALL_GUARD_TICKS_PER_DAY` 400 -> 700 | `src/PleaHook.sol` | Brief item 3. |
| imdTEST `0x56bc…f2a5` as the gate's oracle fee asset and pool IMD, Seasons' IMD, PleaLaunch's IMD and oracle fee asset; mint flag `0`; START 1792594800 | `launch.json`, `test/LaunchManifest.t.sol`, `test/fork/ForkTestnet.t.sol` | Brief item 4. |
| Comments naming the 1% / 2.25% fees | `src/Seasons.sol`, `src/PleaHook.sol`, `src/Letterbox.sol` | Follow the fee change. |

Every other number the brief fixes is unchanged. That includes the timings, panel 30, quorum 17,
5-hour seasons, the 33-hour dead-man, credit gas 1,300,000, letters at 20%, the 0-45 fact table,
`need = 71 - fact`, the plea limits, the 0.70 minimum plea value, the 95% sale minimum, the +10% fee
cap, and Objection!'s 20-minute window, 0.35 stake, margin 2 and two objections per plea.
`PLEA.setLauncher` still accepts either the deploy-transaction flag or PLEA's deployment block.
`foundry.toml` and the other build files are unchanged.

## Import audit findings

1. **imdTEST has a 25-wei supply and a minter-only mint** (`bafce8be…e889`, info). This is about the
   chain's state, not the code, and it is not a defect in these contracts. The contracts behave as
   the brief specifies: the opening buy, the fees and the stakes are pulled in imdTEST, and the
   README already says that only imdTEST's owner and its minters can mint it. **No code change.**
   This is an open item for the launch: before the run can trade, plead or object, IMD's minters
   must give imdTEST to the owner (the 2 imdTEST opening buy) and to the testers (0.5 per hand
   plea, 0.85 per objection).
2. **CabalGate's NatSpec names runs 2-8.5's two tokens** (`52b08268…bf2`, info). It reproduces:
   `src/CabalGate.sol` said `oracleAsset` was "test IMD 0x44a1…" and `imd` was "TestIMD 0x2b69…".
   `launch.json` passes imdTEST for both. **Fixed:** the two notices now name imdTEST, and the pool
   IMD's notice says it is the same token as `oracleAsset`. The bytecode does not change
   (`bytecode_hash = "none"`, `cbor_metadata = false`): CabalGate's creation and runtime code from
   a build of the imported tree and from a build of this tree are byte-identical, so neither
   committed hash moves. The new test is
   `test/LaunchManifest.t.sol::test_gateTakesImdTestForBothRolesAndItsNatSpecSaysSo`. It checks
   that launch.json's two gate words are the same token, that a deployed gate returns imdTEST for
   both `oracleAsset()` and `imd()`, and that the built userdoc names imdTEST and neither old
   address.

## Launch requirements (unchanged)

- PLEA, CabalGate, Seasons, PleaDistributor and PleaLaunch are deployed in that order, in one
  transaction, through nonpayable constructors. Their argument counts are 1/7/4/2/13. None of the
  constructors calls an outside contract. PLEA and PleaDistributor take `$owner`, and PleaLaunch
  reads its owner from PLEA.
- The Letterbox, the Tribunal and PleaHook are deployed later through PleaLaunch, against the
  committed hashes (Letterbox `0xd3371a7f…c8d5`, Tribunal `0x4869…7274`). The hook uses a salt mined
  off chain.
- None of the contracts uses DELEGATECALL, CALLCODE or SELFDESTRUCT. No contract has a proxy, and
  nothing can be minted after the hook's fixed 82/6/12 split.

## Verification

All runs used `FOUNDRY_FUZZ_SEED=0xa6cba06cd0cfd14c067608edd38925cc93f7c13d428dfcb1072fac2940fd0489`.

- `forge build` (default profile): passed. Only the existing compiler warnings appear.
- `forge test` (default profile): 23 passed, 0 failed, in 5 suites. That includes the new test.
- The atomic five-contract launch costs 13,490,574 gas as charged, 16,458,500 with IMD's 22%
  headroom. That is 318,716 under the 16,777,216 cap.
- `FOUNDRY_PROFILE=full forge test`, run seven files at a time over all 48 files in `test/full/`:
  803 passed, 0 failed, in 84 suites. With the default profile's 23 tests, 826 tests passed. The
  brief's count of 852 also includes the forks in `test/fork/`. Those need RPC variables, so they
  were not run here.

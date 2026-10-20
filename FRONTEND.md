# PLEA run 9 frontend

The static Vite, React, TypeScript and viem app is in `web/`; publish the complete `dist/` directory. It works under a gateway subpath with `base: ./` and hash routes. This revision changes no contracts and broadcasts no public-chain transactions.

## Install, build and preview

```sh
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
npm --prefix web run preview
```

The existing package manifest and lockfile are unchanged. On this worker, installation and compilation were performed in a temporary copy under `/tmp` to keep dependency directories outside the submission. A normal checkout can use the commands above. Dependencies, caches, browser binaries and source maps are not part of the export.

The build writes `dist/` and then generates `dist/imd-deployment.json`. From the repository root, `node web/scripts/check-export.mjs` verifies the exact deployment handoff, unchanged network/wallet blocks, canonical ABI hashes and complete SHA-256 asset inventory. Run it with Node able to resolve the installed `web` dependencies (the script itself resides beside those dependencies).

## Configuration

`web/deployment-input.json` and `web/network-input.json` preserve the supplied inputs. `web/src/config.ts` loads `./imd-deployment.json` at runtime and centralizes chain parameters, public RPCs, contract interfaces, partner addresses and wallet setup. The five handoff ABIs are checked against their attested hashes; the three auxiliary ABIs are checked against `web/src/abi-hashes.json`. Auxiliary addresses are discovered from PleaLaunch and checked against the brief. PoolManager must match the network handoff; the pool key comes from PleaHook. No private endpoint, credential, relay ID or key is in the app.

This specific run uses the brief’s PoolSwapTest router. It requires its exact ERC-20 approval and identifies the buyer in hookData. The network’s Uniswap addresses remain unchanged in the runtime handoff. No replacement router or contract is deployed. Exact bigint TickMath walks the hook’s market and wall bands, including the untouched seed boundary. Quotes refresh from live sqrt price, bands and launch fee. Approval does not depend on a quote, except for the launch-cap safety check. A trade is simulated with its final arguments immediately before signing; a short input fill is refused. Receipt transfers, refunds and cashback events determine the displayed real fill.

PoolSwapTest has no `amountOutMinimum`. Price limits are based on the quoted post-trade price. Simulation checks a full input fill, but cannot make simulation and mining atomic; another trade can move the price before inclusion. An unexpected partial fill is reported explicitly from the receipt. Manual gate sales use an enforceable 1% minimum calculated from a fresh `executeSell(0)` simulation.

Letterbox’s immutable internal constants are named in `models.ts` with source provenance. All public fees, caps, windows, multipliers, symbols, decimals and shares are read from chain. A shared model clears stale pleas for eligibility, includes returned escrow before auto appeals, and keeps each season’s fees separate from rollover.

## Routes

- Home, `#/how`, `#/contracts`: live numbers, latest case, rules, fees, supply, owner powers and ordered checksummed contract links. Rebalance appears only when work is ready; there is no donation form.
- `#/buy`: exact-amount approval and buy; owner-only seed before opening, followed by the opening amount and focus; Buy/Sell after death.
- `#/plead`: facts, need, range, text, automatic/manual fee breakdowns, cooldown and stale-request handling. Automatic selling is selected initially.
- `#/p/<id>`: case facts, verdict, live sale, one eligible appeal, escrow return, points, objections, history, details and the share card. A missing case is a normal empty state.
- `#/letters`: Write Contract and raw UTF-8 data instructions, checker, direct send, fees, limits, examples and live status. No delivery service is promised.
- `#/objections`: second-panel cases, exact fee/stake approval, ruling meanings, expiry, settlement and a rulings table.
- `#/seasons`: running and awaiting-close seasons, separate pots, standing, own recordable pleas, seat multiplier, leaderboard, payouts, rollover, past seasons and final leftovers.
- `#/wall`: verdict families and counts, optional Sold/Appeals/By letter/Objected filters, sort and incremental history.
- `#/profile[/<address>]`: own wallet controls or an explicitly read-only public profile; display names, facts, seasons, cashback and one ERC-6909 claims row.
- `#/claim`: zero-root state; when a real list exists, local sorted-pair proof verification, typed recipients and incoming delegate.xyz vaults. Claims always pay the listed account.
- `#/share[/<id>]`: browser-drawn 1200 × 675 PNG, bounded post text, X intent, download and clipboard fallback. The image library loads only when drawing an image.

## Wallets, reads and writes

EIP-6963 discovery and injected wallets share one connect sheet. Mobile deep links open the page in the wallet app. The Coinbase SDK connector is removed; Coinbase’s injected extension and mobile link remain. An unknown chain is added with the supplied `walletAddChain`, then switched again. The connected control links to Profile; Profile provides Disconnect.

Reads use bounded 6-second transports, five-call HTTP batches, shared 60-second endpoint cooldown and Multicall3. Visible tabs check blocks every 12 seconds. Snapshots refresh on relevant events, receipts or after 60 seconds; failures back off to 15/30/60 seconds. A receipt refresh queues behind an active poll. Old data survives background refresh and a transient failure. Time-driven states use the chain timestamp plus elapsed local time.

Every write simulates and estimates first, then sends `ceil(estimate × 1.3)` gas. Buttons stay focusable when unavailable, explain why, distinguish wallet/confirmation waits, and retain receipt feedback until navigation. Errors unwrap PoolManager’s WrappedError and translate every error in the pinned ABIs. There are no unlimited approvals.

A claimed allocation must have string index and amount (decimal or hex), a valid account/address and a bytes32 proof array. Arrays, a `claims` array and address-keyed maps are accepted. Entries are verified against the live root before their amounts are displayed. No claims file or allocation is fabricated while the root is zero.

## Validation

`FIXES.md` maps all 73 review references. `VALIDATION.md` records the final checks and limitations. The `run9-*.mjs` scripts accept a Playwright module through `IMD_PLAYWRIGHT`; browser binaries can live outside the repository. `PLEA_AXE` can name the installed axe script. Reports and screenshots go only to `test/scratch/`.

```sh
# Read-only browser matrix; PLEA_QA_RPC is an optional local read-through override.
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-browser.mjs

# Fresh local Sepolia fork only; never point the fork transaction scripts at a public RPC.
anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8545
node web/scripts/run9-fork-prepare.mjs
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-fork.mjs
node web/scripts/run9-fork-seat.mjs # optional seat fixture before point recording
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-fork-court.mjs
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-fork-profile-claim.mjs
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-fork-death.mjs
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-fork-partial.mjs
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node web/scripts/run9-fork-maintenance.mjs
```

The prepare script funds and impersonates local fork accounts and changes a fork token balance slot. The transaction scripts generate a temporary signer, set the gate and Tribunal’s signer storage on the fork only, sign EIP-712 verdicts in the Sepolia consumer domain, and use each consumer’s `QUESTION_CHAIN`. Keys are never exported. Public Sepolia checks are read-only. The app runs no oracle signer, runner, backend or automatic points recorder.

The optional seat helper changes a balance on the fork and verifies `holdsSeat`; it never mints a real NFT. The profile/claim check snapshots and restores its test root and names. Run the death check after the court/season scenarios; the final partial-fill and maintenance checks snapshot and restore that state. `run9-fork-seasons.mjs` can resume the season portion after the court's case setup, deriving its case IDs from fork state. RPC fault, idle, cold-load and PNG checks are in the other `run9-*.mjs` helpers. They require a separate Playwright installation; the matrix also uses the locked axe-core dependency.

## Independent review regression check

Run `web/scripts/revision-court.mjs` on a fresh loopback Sepolia fork **after** prepare and the primary `run9-fork.mjs` scenario, before the other scenarios change its six pleas. It snapshots the fork, creates #7–32, signs #7’s verdict with an in-process fork signer, checks older active-case discovery/counts/pagination, sets the no-history holder’s seat balance, then closes season 1 without recording the original cases. It restores its snapshot on completion. No public RPC is accepted for writes.

```sh
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs PLEA_REVISION_MATRIX=1 node web/scripts/revision-court.mjs
```

`PLEA_REVISION_MATRIX=1` adds the 180-run affected-state browser/axe sweep at five widths, both themes and wallet states. `PLEA_AXE` may specify an external axe script; otherwise it uses the locked frontend dependency. The normal mode checks the interactions and state assertions without the full matrix. `PLEA_EXPECT_OLD=1` is available to reproduce the old behavior against an export built before these repairs. Reports/screenshots remain under disposable `test/scratch/fork/`.

# Run 9 round-2 validation

This records the worker’s checks for the 45-item review at `228e355be9e9a8a460c35d3af1465b96adeafef5`. `FIXES.md` maps every item and distinguishes browser/transaction evidence from source review. These results have no independent audit authority. Contracts, dependency manifests/lockfiles, existing build configuration, pinned token/component CSS and ignore files are unchanged.

All transactions ran on a fresh local Anvil fork of Sepolia, chain 11155111. Only the fork’s gate/Tribunal signer slots were changed to an ephemeral signer, with signed EIP-712 verdicts delivered through the impersonated fork Intake. No key was saved. Other fixture-only balance/root/seat changes are described in the scripts. Public Sepolia checks were read-only, through the configured Sepolia RPCs; the worker’s read-through connection used the source represented by `https://ethereum-sepolia-rpc.publicnode.com`. No public trade, claim, deployment or oracle submission was broadcast.

## Build and integrity

- Unchanged lockfile installed in `/tmp/plea-run9/web`; Playwright, Chromium, formatting tools and npm cache also stayed outside the repository. Source was copied there for compilation; the complete generated export was copied back to `dist/`.
- `npm run typecheck` passed. `npm test`: **39 passed, 0 failed**. Tests include RPC classification and exact cooldown expiry, HTTP range bodies, all-cooling recovery, season boundaries/waiting/final states, seat event matching/ties, case closure, shared fee arithmetic, malformed oracle data, invalid decimal input, wrapped errors and the existing contract/text/claim checks.
- `npm run build` passed with the existing upstream dependency annotation/directive warnings. Relative Vite base and hash routes remain. The export is **27 inventoried assets, 1,377,388 bytes**, excluding its manifest.
- `node web/scripts/check-export.mjs` passed: exact handoff/network/wallet blocks, complete SHA-256 inventory and all eight canonical ABI hashes. `dist/imd-deployment.json` is the configuration the app loads at runtime.
- Build-time D3 scan found **zero** `cbwsdk`, `cca-lite`, `@coinbase/wallet-sdk` or `keyval-store` markers in exported JavaScript. The unchanged lockfile’s unused transitive SDK packages are not bundled.
- Submission paths/bytes were checked separately. No dependency/cache directory, archive, new submodule or forbidden file change is included. Total submission file content is below 8 MiB; final count after cleanup is **7,506,266 bytes across 603 files**, including source, unchanged dependencies’ source and the required export.

## Transaction and interaction checks

The final fresh-fork sequence used `run9-fork-prepare.mjs`, `run9-fork.mjs`, `revision-court.mjs`, `run9-fork-seat.mjs`, `run9-fork-court.mjs`, `round2-fork.mjs`, `run9-fork-profile-claim.mjs` and `round2-mined-revert.mjs`, followed by death, partial-fill and maintenance checks. Browser scripts use `IMD_PLAYWRIGHT`, `PLAYWRIGHT_BROWSERS_PATH`, and `PLEA_AXE` for external test dependencies. Writes are restricted to loopback fork endpoints.

| Check | Observed result |
| --- | --- |
| Primary: 26 wallet transactions | Owner seeds before START; non-owner has no seed control; opening amount/focus; exact approvals; first and post-launch buys; cap on the invalid field; confirmed form reset; manual sale; returned automatic escrow before appeal; sold appeal; lapse/cooldown and unanswered expiry. No page/console errors. |
| Preserved review regressions | Older active #7 and full-history counts remain correct beyond 24 cards; seat holder with no history sees the seat notice; closed-season unrecorded points cannot be recorded. The complete 180-run revision matrix passed. |
| Court: 42 wallet transactions | Overruled objection lowers points; overruled stake enters the season pot; unanswered objection becomes VOID and returns stake; sustained objection blocks points; zero-score denied/upheld appeal; grace/season close; six explicit records; ranked prize/bonus payouts, burn and rollover. No page/console errors. |
| Round-2 isolated fixture | Real seat records show 54/48 points and 45/40 judges, with +54 toast; void frees a slot; pending/sustained lapse copy agrees; two waiting seasons with intermediate own Record and one seat anchor; invalid public-profile target; malformed oracle objects; direct anchors at 320/768/1280; older loaded card refreshes for both a signed verdict and objection without losing focus/scroll; denied hero says no points. The 80-run matrix passed. Snapshot restored. |
| Mined revert race | A competing swap exhausts the visitor’s price limit between preflight and broadcast. Receipt is reverted; replay decodes PriceLimitAlreadyExceeded into the selected-slippage title/body, keeps the hash and labels the failed transaction link. No page/console errors. Snapshot restored. |
| Profile/claim: 3 wallet transactions | Exact unknown-chain 4902 → add-chain → switch behavior; save/current/clear name; fork-only root/list; sorted proof validation, third-party recipient balance/receipt, claimed state and invalid-list error. No page/console errors. Snapshot restored. |
| Death: 10 wallet transactions | Free PLEA sale; fill matches only PoolManager transfer proceeds, with hook cashback reported separately; closed Plead/Objections; all remaining seasons close oldest first; final leftovers flush to the wall. No page/console errors. |
| Partial-fill race | Actual spend 24.834126784007792514 imdTEST plus separate refund/cashback is reported after requesting 50; the remainder stays in the wallet and is stated in the fill. Snapshot restored. |
| Maintenance | Small public Rebalance succeeds, clears pending work and disappears; no donation form. Snapshot restored. |
| PNG/share | Default and sold-appeal PNG exports are 1200 × 675; local fonts load, X intent fits its budget and unsupported image clipboard gives download instructions. |

Preliminary harness attempts expected obsolete cap/Record labels and a literal `0.00` for cashback below 0.01. Those assertions were repaired. The final death check was rerun after correcting that sub-cent expectation, and passed before the remaining partial-fill/maintenance checks. Earlier partial attempts are not counted as successful checks. Browser testing also found an actual future-UTC pill overflow and unsorted best-three presentation; both source fixes were rechecked successfully.

## Browser coverage

Chromium rendered the static export from a `/preview/` subpath. Axe used WCAG 2 A/AA and 2.1 AA tags. The required 320/360/768/1280 widths were included, plus 390.

| Matrix | Runs | Result |
| --- | ---: | --- |
| Live Sepolia, 18 routes, disconnected | 180 | 0 overflow, 0 page/console errors, 0 axe violations |
| Live Sepolia, same routes, injected test-provider connection | 180 | 0 overflow, 0 page/console errors, 0 axe violations |
| Preserved populated-fork regression states, both viewer states | 180 | 0 overflow, 0 page/console errors, 0 axe violations |
| Round-2 populated states, both viewer states | 80 | 0 overflow, 0 page/console errors, 0 axe violations |
| Dead fork, 22 routes including sold/appealed/lapsed/sustained/upheld cases and connected profile | 220 | 0 overflow, 0 page/console errors, 0 axe violations |

The last corrections guard malformed decimal input, use a span for the quote’s loading label, prioritize closed-case copy for the seller as well as other viewers, and deduplicate identical receipt feedback by hash. Fresh build/type/unit checks passed. The primary scenario (including a pending hero) and the 80-state round-2 fixture were rechecked after the closure fix, including the seller’s closed-case notice. Targeted Buy checks in both viewer states and themes at all five widths covered: incomplete/invalid text, sub-cent values, six-decimal amounts, 100-imdTEST costs and the delayed quote skeleton. The affected route has no overflow, render errors or axe violations in those checks.

`round2-layout.mjs` walked **732 keyboard Tab stops** across Home, Contracts and Claim at 320/360/1280 in both themes. All tested indicators had at least a 2 px outline and no clipping ancestor; page width stayed within the viewport. A saved dark 320-px Contracts screenshot was inspected and shows the complete Copy ring inside the padded panel.

The browser tool also inspected the final Home at 320 and 390. At 390 × 844, document width is 390; Buy occupies y=426.28–478.28, Connect y=12–56, and fonts report loaded. Product and primary action are on the first screen. At 320 “Buying is open.” stays on one line. Browser screenshots of the populated fork were inspected for standing, sustained/no-points and case layouts.

## RPC fault checks

`round2-rpc.mjs` intercepts the app’s three configured public URLs and forwards successful reads to a read-through RPC. Every scenario runs in a fresh browser context.

- Hung first endpoint: ready in **7.61 s** through fallback.
- HTTP 429 first endpoint: ready in **1.52 s**, no further first-endpoint request during the observed cooldown period. A unit test verifies the exact 59,999/60,001 ms boundary.
- First two endpoints 503; Sentio-only HTTP 429 `{code:8,message:"public eth_getLogs is limited to 1000 blocks"}`: full history ready in **1.54 s**, with 1,000-block chunks and no incomplete-history notice.
- One head-lag answer: next endpoint still receives the original 10,000-block range; ready in **1.47 s**.
- All three 503 for 15 seconds: Try again sends immediately and recovers in under 15 seconds (report measured sub-second recovery).
- All endpoints return eth_call -32603: repeated snapshot failures surface the error; getBlock continues; restoring calls and retrying clears it.
- Thirteen seconds browser offline, then online: recovery completes within 15 seconds. The app’s online handler resets endpoint health.

Intentional transport failures produce network errors by design; the fault report’s zero errors refers to JavaScript page errors. Normal live/fork matrices also listen to console errors and report zero.

## Better Interface review

All six pinned domains were applied to the existing PLEA direction. The six-domain core principles and documentation guide were read; no palette/font/effect redesign was introduced.

| Domain | Coverage and corrections | Limitations |
| --- | --- | --- |
| Accessibility | Labels and invalid hints; explicit disabled reasons; safe status/alert roles; named Record buttons; native details; heading levels; skeleton semantics; complete keyboard/focus sweep and axe matrices. | No native screen reader, physical wallet/device, native 200% zoom or forced-colors session. |
| Layout | Phone/medium/desktop reflow; numeric/unit wrapping; future-date pills; correct panel padding; waiting-season disclosure and unique seat anchor; primary controls above the fold. | Not every possible long name/language/font fallback combination was rendered. |
| Writing | State-specific sale/points/objection outcomes, UTC deadlines, one fee estimate, title/body errors, singular/plural and action-specific connect text. | Every API refusal/split/late-runner wording branch was reviewed in source, but not every external-service variant was separately triggered. |
| Typography | Existing Archivo/Plex and token scale retained; fact values separate from points; signed percentages; no split numeric strings; responsive hero corrected with an existing token. | The exact pinned design exceeds the generic probe’s type-size/weight budgets. |
| Colors | Existing semantic tokens and text/state labels retained; light/dark axe and measured solid text contrast in the probe pass. | Eight image/striped-background boxes in the taste probe were unmeasured; no contrast ratio is invented for them. |
| UI | Correct flush surfaces, receipts, error/loading/empty states, quote freeze/reset, route boundary, counted season rows and partial-history recovery. Reduced-motion probe has no ongoing animation. | No production runner/oracle service, mobile wallet deep-link handoff, WebKit or clipboard image support on physical devices was tested. |

Consolidated findings/fixes: high-impact transport and money/state defects are in `web/src/rpc-health.ts`, `config.ts`, `context.tsx:520`, `models.ts:137`, `chain.ts:823`, `pages-court.tsx:1699` and `seasons.tsx:37`. Repeated layout/keyboard causes were corrected in `components.tsx:66` and `site.css`; pending/denied card presentation is shared at `components.tsx:1013`. Oracle validation is in `oracle.ts`, with the routed fallback in `page-boundary.tsx`. Exact round-2 references and check coverage are in `FIXES.md`.

The required pinned taste command ran on the export:

```sh
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

**13/16 checks pass.** Render, reflow/overlap/clipping, targets, measured contrast, casing/tracking, copy budget, motion and metadata pass. Three findings are deliberate pinned-design exceptions: the supplied fluid type scale, supplied weights (including logo/display), and hard ink borders/shadows plus fact cells inside panels. The brief requires those tokens/components unchanged; those visual requirements take precedence over generic thresholds.

## Evidence and remaining external behavior

Disposable evidence includes `test/scratch/final-*.log`, `final-fork-results.json`, `fork/revision-after.json`, `fork/round2.json`, per-scenario fork reports/screenshots, `run9-browser/final-live*.json`, `final-dead-wallet.json`, `round2-layout.json`, `round2-buy*.json`, `round2-rpc/report.json`, `final-first-screen.json` and `taste/`. These files are removed before submission; the reusable checks and this report are delivered.

No real extension/passkey/mobile app, production delegate allocation, production runner, externally delivered signed oracle verdict, production hosting or public-chain transaction was exercised. There was no real allocation file while the live root was zero. Every state/copy permutation in the review is implemented; the item ledger explicitly identifies branches checked by source review rather than an external live workflow. Axe and these worker tests do not establish universal accessibility or an independent contract audit.

Completion: the requested source/export and all 45 fixes are delivered, with the checks above and these stated external-behavior limits. Historical round-1 implementation evidence is retained in `FIXES.md`; previous validation claims are not presented as new runs here.

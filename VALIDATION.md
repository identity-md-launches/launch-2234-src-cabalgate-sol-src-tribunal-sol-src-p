# Frontend validation

These are worker-run checks of this frontend, not an independent audit or certification. No contract source, Foundry configuration, existing dependency tree or launch manifest was changed. No transaction was broadcast to Sepolia.

## Results

| Check | Coverage | Result |
| --- | --- | --- |
| Build | Strict TypeScript and production Vite export, relative base | Passed |
| Unit tests | UTF-8 limits, invisible characters, markers, commands, names, fee/price-limit math, liquidity crossings, errors and oracle UUID mapping | 11 passed |
| Live browser reads | 11 routes at 320/360/390/768/1280, light and dark; real public Sepolia RPC reads with test-side read-through caching | 110 runs, no horizontal overflow, console/resource errors or axe WCAG 2.1 AA violations |
| Wallet and future contract states | EIP-6963 fixture wallet, wrong chain, add-chain, approvals, manual/automatic pleas, appeals, sales, claims, names, objections, delivery, settlement, points, close/flush and RPC recovery | 39 interaction assertions passed |
| Verdict/share layout | Six application routes plus every main verdict and objection combination at 320/360/768/1280, light and dark | 224 runs, no overflow, script/console errors or axe violations |
| Phone wallet sheet | Four native-browser links, Coinbase Smart Wallet, labelled native dialog, Escape, exact Rabby command; four widths and both themes | 8 runs, no overflow or axe violations |
| Share image bytes | Browser download/clipboard; one PNG per verdict/objection state; 280-byte natural plea with the widest stamp and a 280-byte unbroken wide-glyph string | 1200 × 675 PNGs; all text clear of stamps and footer |
| Source/deployment binding | Offline ABI extraction; canonical Keccak against the five handoff hashes; runtime chain/code/discovered-address checks | Passed |
| Export integrity | Exact handoff fields, network/wallet blocks, every exported asset SHA-256 and raw ABI array; no unlisted files | Passed; `web/scripts/check-export.mjs` |
| Pinned styling | tokens.css, components.css and text-check.js compared with the specified design commit | Unchanged |

The live state observed during validation was **unseeded**, START **2026-10-21 15:00 UTC**, no run 9 pleas, and a zero distributor Merkle root. The UI shows those actual states, not the mockup's invented cases. The API's public oracle list/detail routes and wildcard CORS were checked; no run 9 verdict metadata existed to exercise live.

## Reproduction

From the repository root, after installation and building as described in `FRONTEND.md`:

```sh
npm --prefix web run typecheck
npm --prefix web test
node web/scripts/check-export.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node web/scripts/qa.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node web/scripts/mock-qa.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node web/scripts/mobile-qa.mjs
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The worker's pinned Playwright/Chromium runtime was used. The browser connector transport did not attach; direct Playwright ran the real browser checks. No additional browser was installed. QA servers are temporary and serve the actual production export under `/preview/`, exercising gateway-relative assets and hash routes.

Scripts write reports, screenshots and downloaded PNGs only beneath `test/scratch/`; those are disposable and are not submitted. `qa.mjs` also renders the local OG PNG from the same production share-card component into `web/public/og.png`. Rebuild afterward and recheck the inventory if its bytes change. `web/tests/fixtures/run9-reads.json` is a small public-read fixture for repeatable UI tests. Synthetic wallet balances, pleas, claims and receipts exist only in the test runner; none is imported by production code.

## Better Interface review

The six domains were applied during construction and reviewed together against the mockups and rendered export. Phone and desktop screenshots, every verdict/share-card state, both themes, the empty live deployment, the wallet sheet and the following fixes were inspected. The first 390-wide screen shows PLEA, Buy/Plead and Connect. The Buy and Plead action now follows the trading-state notice instead of the long form breakdown.

| Domain | Source / observed issue | Final disposition |
| --- | --- | --- |
| Accessibility | `web/src/wallet.tsx:116`: dialog needed an explicit accessible name; narrow address/footer links needed adequate targets | Labelled native dialog, focus return/Escape, 44 px controls and links; open-sheet axe runs pass |
| Layout | `web/src/pages-trade.tsx:255`: action buried below costs; `web/src/site.css:190`: a 280-byte unbroken plea could force the detail grid wider | Action moved up; anywhere wrapping and zero minimum text width; all tested widths pass |
| Writing | `web/src/pages-info.tsx:106`: a missing pre-seed price appeared as a dash with a token unit | Says “Not open”; test-token status and no-value wording remain explicit |
| Typography | `web/src/share.tsx:47`: long text could touch the widest stamp | Kit's wide-stamp modifier plus measured fitting to existing 22/18 px steps; full text retained |
| Colors | `web/src/design/tokens.css`, stamps and notices | Exact token palette; state words plus pending stripes/lapsed dashes; measured solid text pairs pass |
| UI | `web/src/context.tsx:234`, `components.tsx`: signing-client lag after switching, approval receipt labelled pending, and success could be resent | Current connector provider, separate approval/receipt state, busy lock and reset on edits; interaction tests pass |

Additional correctness fixes found while reviewing the finished app:

- `web/src/chain.ts`: unrecorded points now use the Tribunal's lowest panel score through Seasons.pointsFor; recorded points use pointsOf. Excluded sellers cannot record points or receive a displayed eligible prize.
- `web/src/appeal.ts`: automatic appeal amounts are read-only and follow the original-share clamp. The fact preview adjusts only the immutable share-band difference; holding/profit/trend facts still come from chain.
- `web/src/oracle.ts` and `oracle-id.ts`: API calls use the oracle UUID, not the Intake hash. Pending requests are matched by the exact on-chain question.
- `web/src/share.tsx`: secondary objection stamps use the mockup's annotation style; static image stamps do not animate. The browser output was inspected, not just its dimensions.
- `web/src/context.tsx`: a live verdict stamp lands once, reduced motion disables it, and revisiting does not replay it. No other element animates.

### Pinned taste probe

The required probe ran from the repository root. **14 of 16 checks pass.** Rendering, responsive layout, target spacing, measured contrast, casing, tracking, eyebrows, font families/weights, glyphs, slogans, repetition, copy budget, motion and metadata pass. Screenshots confirm the root product and its main action at 390.

Two generic checks are deliberately overridden by the explicit brief: **“Use tokens.css and components.css as they are.”** The probe counts seven recurring sizes from the kit's fluid typography and flags its border-plus-hard-shadow cards/logo/buttons, including the supplied nested empty state. Changing those would replace the requested design. The tokens' SHA-256 is `0f15958461fba9d70976be60d8102fbb12926a3c34c6ed38b70a9efacb2a7580`; components' is `d1db8f7adcdd64a99799a35e5449c64cf34db65db2a6421123d242750febd43f`.

The probe cannot measure text directly over stripes; axe and rendered state inspection supplement those pairs. Screen-reader software, native iPhone wallet apps and WebKit were not run. Keyboard checks cover the menu, wallet dialog, Escape/focus return and native controls; automated axe results are not a claim of a complete manual WCAG certification.

## Limits and handoff

- A real funded-wallet trade, oracle callback, appeal, objection, payout or delivery was not broadcast. Pre-seed live reads and mocked signing flows do not prove future on-chain execution. Some secondary maintenance/expiry controls were checked structurally rather than through a positive wallet sequence.
- PoolSwapTest has no minimum-output argument. The UI discloses indicative output, its price limit and possible partial fills. Execution is simulated and gas estimated before signing. Manual executeSell does enforce the visitor's positive minOut.
- No runner service is deployed by a static frontend. Deliver is permissionless and exposed; point recording remains an explicit action after the objection hold.
- The root-zero Claim state is complete for the observed deployment. Real allocations/proofs must be published when the root is set; no stand-in claims file was made. On-chain verification rejects a mismatched proof.
- Coinbase/passkey vendor prompts and native app deep links need a visitor's wallet/device for end-to-end verification. The rows, exact add-chain data, error/retry paths and mobile link parameters were tested.
- OG paths are relative because publication is a later network step. The default PNG is included; hash routes cannot make social crawlers fetch a different server-rendered OG image per plea. Per-plea PNG download/copy and X text/link sharing work in the browser.
- Browser evidence and local diagnostics are excluded from the submission. The complete tracked source/export bundle is checked below the 8 MiB cap before commit; no dependency caches, node_modules or archives are included.

## Submission status

The final production export contains 29 inventoried assets (1,970,401 bytes, excluding its manifest). The complete existing tree plus new deliverables is below 7.2 MiB, within the 8 MiB submission cap; the inventory excludes ignored dependencies, caches and scratch evidence. Existing protected build files and contracts are unchanged.

Local staging/commit could not complete: `git add` returned `.git/index.lock: Read-only file system`. No Git metadata workaround was attempted. The complete source, lockfile, docs and static export remain in the workspace for the network handoff.

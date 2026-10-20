# Run 9 frontend validation

## Independent review revision

This section records the current bounded revision; the original run 9 validation below is retained as historical evidence, not claimed as a new run. All three findings in `.imd-responses.json` reproduced before implementation. No contract, dependency, build configuration, pinned design asset or ignore file changed.

| Current check | Result |
| --- | --- |
| Before: history | Local fork, #1–32: approved #7 absent from Open now, present by direct link; Home/Wall showed 24 pending / 3 no verdict instead of 26 / 1. |
| Before: seat | The no-history wallet’s `holdsSeat` returned true; positive seat notice count was zero. |
| Before: season closed | `closed(0)=true`, `recorded(1)=false`; Record enabled and “+40 points once recorded” shown. Clicking failed simulation with `SeasonClosed`; zero broadcasts. |
| After: targeted fork | `revision-court.mjs` passed: #7 open and latest, whole-history totals 4 approved / 1 denied / 26 pending / 1 no verdict, 24 initial cards then 32, positive seat notices. Unclosed-season Record is enabled and simulates successfully. Closed manual sale #1, sold appeal #3 and lapsed approval #4 show the missed recording deadline and disable Record. |
| After: rendered fork matrix | **180 runs**, affected Home/Wall/Objections/Seasons/case states, 320/360/390/768/1280 px, light/dark, disconnected/connected. **0 horizontal overflows, 0 console/page errors, 0 axe WCAG 2.1 AA violations.** |
| After: live read-only browser | **140 runs**, the existing 14-route × five-width × two-theme sweep; **0 failures, errors or axe violations**. The configured Sepolia reads used a test-side read-through; no public-chain write occurred. |
| Final unit/type/build | `npm test`: **27/27**, including four new court-history/deadline/season-boundary regressions. `npm run typecheck` and `npm run build` passed against the unchanged lockfile. Existing upstream Vite directive/annotation warnings remain. |
| Export | `check-export.mjs` verifies **27 assets, 1,340,144 bytes** (excluding manifest), all eight canonical ABI hashes, exact handoff/network blocks and final SHA-256 inventory. Relative asset paths and static hash routes remain intact. |
| Taste probe | Required pinned `taste.mjs --out test/scratch/taste` ran on the final export: **13/16 checks pass**. Render, overflow/overlap/clipping, targets, measured contrast, copy, motion and metadata pass. The same three pinned-design exceptions remain: type sizes, weights, hard borders/shadows. |

Better Interface coverage was reviewed on the affected states across all six domains. Accessibility: existing semantic controls/labels remain; closed Record stays focusable with an explanation and guards activation. Layout: the 180-run matrix and inspected 390/1280 screenshots show the restored older case and wrapped missed-deadline copy. Writing: removed the misleading closed-season promise from the points panel, timeline, detail card and sale summary. Typography/colors: existing tokens, fonts, scale and weights are unchanged; the probe measures solid contrast pairs successfully, with eight striped/image-backed boxes unmeasured. UI: page size, active-court discovery and actual recording eligibility now have separate state, with reads cached where their facts are immutable.

Final finding locations: `web/src/chain.ts:388` (active court/history), `web/src/pages-info.tsx:60` and `web/src/pages-court.tsx:95` (shared totals/latest), `web/src/seasons.tsx:128` (connected seat), and `web/src/pages-court.tsx:533` (plea-season eligibility). Related point-state presentation is in `components.tsx`, `details.tsx` and `SaleSummary` in `pages-court.tsx`.

Manual browser-tool inspection at 390 × 844 also confirmed the final live-read export: document width 390, Connect visible, and Buy PLEA at y=418–470 on the first screen. The complete submission file content is about 7.31 MB, below 8 MiB; no dependency/cache/archive directories or submodules are included.

Current evidence is disposable: `test/scratch/fork/revision-after.json` and its screenshots, `closed-before.json`, `seat-before.json`, the initial history reproduction report, `test/scratch/run9-browser/revision-live.json`, `test/scratch/taste/`, and build/test logs. The fixture restores its fork snapshot, and signer keys exist only in process. Preliminary harness attempts hit duplicate-selector errors and one receipt-watcher timeout; selectors and the fork fixture’s receipt read were repaired, then the final complete 180-run check passed. These were harness failures, not successful app checks.

Limitations: this revision did not repeat every original seed/objection/death/claim transaction scenario on the final export. The original primary scenario passed its 26 browser transactions during reproduction, and original checks below are preserved. No public signing, oracle-service response, production hosting change, physical wallet, native screen reader, WebKit or native zoom session was attempted. Axe does not establish full accessibility conformance. The scoped revision is complete for the three reported findings.

These are worker-run checks, not an independent audit. This repair implements the 73 references mapped in `FIXES.md`. Contracts, existing build configuration, dependencies and lockfiles are unchanged. All transactions below went to a local Anvil fork; public Sepolia verification was read-only.

## Results

| Check | Coverage and result |
| --- | --- |
| TypeScript / production build | `npm run typecheck`, `npm test`, `npm run build` passed. Vite exports relative assets and hash routes. The unchanged dependency graph produces upstream directive/annotation warnings, without a build failure. |
| Unit / integration tests | **23 passed**: exact TickMath endpoints and seed edge, range crossings, post-trade limits, signed deltas, season pots/rollover, escrow-restored appeal clamp and actual `openOf` tuple, exact stale deadlines, weighted facts, wrapped hook errors, every custom error in eight ABIs, UTF-8/checker/name rules, allocation parsing/proofs and time formats. |
| Live Sepolia browser | **140 runs**, 14 routes × 320/360/390/768/1280 × light/dark. Zero horizontal overflow, console errors or axe WCAG 2.1 AA violations. The browser reads the configured public RPC through a test-side read-through connection. |
| Populated fork browser | **340 runs**, 17 routes × five widths × two themes, separately disconnected and connected. Includes manual sale, overturned sold appeal, lapse, objections, sustained and upheld cases, leaderboard, payouts and own/public profiles. Zero overflow, console errors or axe violations after repairing the card-link finding. |
| Dead fork browser | **180 runs**, nine routes × five widths × two themes, disconnected and connected. Zero overflow, console errors or axe violations. |
| Browser transactions on fork | **83 wallet-sent transactions** across the primary (26), court (21), resumed season (20), profile/claim (3), death (10), partial-fill race (2) and maintenance (1) scenarios. Every sent action was simulated by the app; expected transactions have successful receipts. Additional oracle/setup calls were sent directly to the fork. |
| Final maintenance / smoke | The small public Rebalance action succeeded and disappeared after its receipt. Forty additional Home/Buy viewport/theme/wallet checks passed after its styling change. |
| RPC faults | A hanging first endpoint recovered in 9.22 s; 429 recovered in 2.97 s; third-endpoint-only recovered in 4.28 s. Failed URLs cooled down, batches stayed at ≤5 requests, and 1,000-block log limits shrank the scan without discarding history. |
| Idle / hidden tab | After initial load, **10 requests in 66 seconds**: five block reads and five log checks, no `eth_call` burst. **Zero requests in 13 seconds hidden**. |
| Cold load / small interactions | No Coinbase/WalletConnect/SDK telemetry request and no cookie. Only the local static origin and configured Sepolia RPC appeared on cold load. Letter hex bytes, copy reset on editing/after 1.5 s, invalid-address associations, menu Escape/focus and form checks passed. |
| PNG / sharing | Default and sold-appeal downloads were 1200 × 675. Inspected both actual PNGs. Stable filenames, unsupported-image-clipboard instructions, bounded X text and the actual case link passed. The included OG PNG uses the public site URL. |
| Handoff / export | All **eight canonical ABI hashes**, the exact five-contract handoff, unchanged network/add-chain blocks, every asset SHA-256 and relative base passed `check-export.mjs`. **27 inventoried assets, 1,337,756 bytes** before the manifest. No stale chunks or source maps remain. |
| Protected inputs / size | No changes to contracts, protected build/dependency paths, pinned CSS, checker, sprite or ignore files. No submodule entries. Complete submitted file content is about 7.26 MB, below 8 MiB; dependencies, browser binaries and caches stayed outside the tree. |

The observed public deployment remained **unseeded**, with START **2026-10-21 15:00 UTC**, no run 9 pleas and a zero claim root. Public API verdict metadata consequently could not be positively checked for this run. The app shows those states rather than sample cases. Public source names are the RPC URLs in `web/network-input.json`, including `https://ethereum-sepolia-rpc.publicnode.com`.

## Fork interaction evidence

`run9-fork-prepare.mjs` funded and impersonated local fork accounts. The primary scenario exercised owner-only pre-START seed and opening-input focus, the first buy at the untouched tick edge, explicit exact approvals, a wrong-chain switch, launch-cap refusal before approval, a 30 imdTEST post-launch full buy, manual plea and signed approval followed by a sale, the automatic minimum/fee preflight, denied auto plea followed by an automatic appeal and delivery, and successful retries after a lapsed approval and an expired unanswered request.

The court scenario exercised approved cases, overruled and unanswered/VOID objections, stake settlement, sustained/no-points treatment, a zero-score denial and an UPHELD appeal with no further appeal form. An exact-text test selector initially failed on the stamp's secondary text; the selector was corrected. The app also initially selected `Recorded` before `Closed` from a season-close receipt; that reporting bug was fixed. The season portion resumed from the actual fork IDs, recorded six approvals explicitly, closed in order, and observed three prize/bonus payouts, bonus burning and rollover. A fork-only seat balance mutation was verified with `holdsSeat` before these records.

The profile/claim scenario verified an unknown-chain 4902 response → the exact supplied `wallet_addEthereumChain` parameters → successful second switch. It saved, reloaded and cleared a display name. A snapshot-scoped fork root plus a browser-supplied claim list exercised strict numeric rejection, local proof verification, an invalid address, a third-party claim, the exact listed recipient's balance increase and the subsequent claimed receipt. A file containing only an invalid proof showed the requested error-box state. This fixture root and the names were reverted afterward; no claim list was added to the app.

A further snapshot-scoped race check inserted a competing 50 imdTEST buy between the visitor’s simulation and broadcast. The mined visitor trade filled **24.854225325947589453 imdTEST** of the requested 50 and refunded **0.493054405373576678 imdTEST** in hook fees. The browser reported **3,976,499 PLEA for 24.86 imdTEST** (cost rounded upward), 0.12 cashback and 25.14 unfilled, with a receipt link. A smaller preliminary price move stayed within the limit and filled normally.

Finally, a time warp beyond the 33-hour dead-man window exercised free selling without a plea, no prize fee, closed court routes, final-season selection, ordered closes and the leftovers transaction. Fork signer keys were generated in process and never written. Only the local fork's gate and Tribunal signer storage was changed. The consumers' on-chain `QUESTION_CHAIN` and Sepolia EIP-712 domains were used for signed callbacks.

Reports, screenshots, transaction ledgers and diagnostics are in disposable `test/scratch/`; they are not submitted. The 21 court writes are recorded in its partial ledger because of the corrected selector; the continuation has its own successful report. This is stated explicitly rather than presenting it as one uninterrupted harness run.

## Better Interface review

The pinned guide's accessibility, layout, writing, typography, colors and UI principles were applied and reviewed together. `DESIGN.md` describes final source values and components; notices/licenses remain in `web/licenses/`. Consequential choices follow the review's D1/D2/D3 and the pinned page mockups: owner seed control, no donation flow, injected wallets, and fields/costs before form submission.

| Domain | Finding and repair | Evidence / limit |
| --- | --- | --- |
| Accessibility | `components.tsx:1029`: the kit-style concise labelled card link failed label-content-name-mismatch on populated cases. A full-card link now references visible sibling labels/descriptions. `pages-info.tsx` and `profile.tsx` associate address errors/checks; Panel levels follow route outlines. | Populated and dead axe sweeps pass. Menu focus/Escape, invalid address and name checks ran. A native screen reader was not run. |
| Layout | `site.css:215`: the fact table clipped on phones; fixed table layout and wrapping repaired it. Long money stat wrapping was removed and the token unit uses the kit's smaller type. `site.css:205` makes the footer reach the viewport bottom. | Five widths, both themes; probe reports no scroll, overlap or clipping at 320/390/1440. Home and Buy first-screen screenshots inspected at 390. |
| Writing | Seed copy described public seeding instead of the owner's flow; fee, refund, sale, stale and death states lacked the necessary distinctions. | Plain words now sit beside each action, with units, UTC deadlines and state-specific remedies. Fork transactions verified the critical amounts and resulting messages. |
| Typography | Generic stat wrapping split figures; generic headings did not follow page hierarchy. The kit's type scale and Archivo/mono roles are preserved, with explicit heading levels. | Source and rendered heading outlines reviewed. Exact kit scale/weights intentionally exceed the generic probe's limit. |
| Colors | Meter color did not follow denials/zero scores; impossible needs escaped the bar. | Verdict controls meter state, marker is bounded, and impossible needs have prose instead of a bar. The probe's measured solid text pairs pass; eight striped/image-backed text boxes are unmeasured. |
| UI | Float tick math blocked the first buy; partial fills, stale requests, escrow appeals, pots, polling and receipt reporting were inconsistent. | Bigint math, live preflight/simulation, shared models, receipt amounts and bounded reads; units, fault tests and actual fork flows above. No public-chain signing claim. |

The required pinned `taste.mjs --out test/scratch/taste` probe ran after the final application corrections: **13/16 checks pass**. Render, layout, targets, measured contrast, casing, tracking, eyebrows, glyphs, slogans, repetition, copy budget, motion and metadata pass. The 390 screenshot shows the product, Connect and Buy/Plead in the first screen.

Three generic findings remain as explicit design-reference exceptions: seven recurring fluid sizes rather than six, four rendered weights (400/600/800/900), and the brief's ink-border/hard-shadow controls plus a notice inside the fact panel. The assignment requires the pinned `tokens.css` and `components.css` unchanged. Their SHA-256 hashes remain `0f15958461fba9d70976be60d8102fbb12926a3c34c6ed38b70a9efacb2a7580` and `d1db8f7adcdd64a99799a35e5449c64cf34db65db2a6421123d242750febd43f`.

## Reproduction and limits

Build/install instructions and the ordered fork commands are in `FRONTEND.md`. Use Node 22.18+ or Node 24+ (the unit tests load TypeScript), the locked frontend dependencies, Anvil and a separate Playwright/Chromium installation. The QA scripts accept `IMD_PLAYWRIGHT` and browser binary paths. The browser matrix additionally accepts `PLEA_AXE`, `PLEA_QA_RPC`, `PLEA_QA_WALLET`, route lists and a report label. All fork write harnesses use only loopback endpoints. The optional seat helper is also fixed to loopback.

No real public-chain transaction, oracle-service response or production publication was attempted. Fork signatures and a browser-provided wallet validate local execution, not a hardware wallet or a running oracle/runner service. The run's real claim root/list and a positive incoming delegate.xyz vault could not be exercised live; a fork third-party claim was tested, and delegated-vault controls were reviewed structurally. Direct raw-data letter transmission and every owner maintenance setting were not separately broadcast in this revision.

Chromium was used for rendered checks. WebKit installed but could not launch because this worker lacks its GTK/GStreamer runtime libraries; WebKit, physical mobile wallet apps, screen-reader software and every possible pathological input/state combination remain unverified. Automatic axe checks do not establish complete WCAG conformance. Missing image clipboard support was tested as a fallback; OS clipboard delivery to X was not.

PoolSwapTest is the pinned brief's integration. It lacks a minimum-output parameter: a full-fill simulation and post-trade price limit cannot prevent price movement before mining. Unexpected partial fills are reported from receipt transfers/refunds. Manual gate sales have an enforceable fresh minimum. The static app runs no automatic runner or point recorder.

Social metadata has the known public absolute URL, but publication is a later handoff. Static hash routes cannot supply server-rendered per-plea OG tags; per-plea PNG and post sharing are browser actions. Git metadata was left untouched as required; source, existing lockfile and the complete static export are present together for submission.

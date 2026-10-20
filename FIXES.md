# Run 9 review fixes

Scope: the 73 items in [run9-site-review.md at 3eb565e](https://github.com/khaed1/claude/blob/3eb565e0e4f39d1926250c6eadb2f7dbf235f852/plea/site-design/run9-site-review.md), retaining the pinned design system at `91b34fe4b8e5`. No contract or existing dependency/build manifest was changed. Decisions D1, D2 and D3 are implemented.

Evidence names below refer to `web/tests/`, the bounded `web/scripts/run9-*.mjs` checks, and the results in `VALIDATION.md`. Browser reports/screenshots and fork ledgers are written to disposable `test/scratch/`. Source inspection is identified separately from a rendered or transaction check; it does not imply a live public-chain write.

## P1

| Ref | Change | Check |
| --- | --- | --- |
| T1 | Exact bigint v4 TickMath, including the seed band edge; allowance approval is independent of quote state. | Tick endpoints and 2-token seed regression unit tests; owner’s first browser buy on the fork. |
| T2 | Live PLEA owner check; owner-only seed copy/link, reserve-sized opening input and focus; no elapsed timer at START. | Fork owner seeds before START; non-owner has no seed button; input/focus assertions. |
| T3 | Estimator returns gross output and post-trade sqrt; limit applies beyond that price; full input simulation and receipt-derived fill/refunds/cashback. | Signed BalanceDelta and price-limit units; 30 imdTEST fills after launch; a competing buy forces a mined 24.85/50 partial fill that the browser reports accurately. |
| T4 | Recursive WrappedError decoding and a remedy for every pinned ABI error; launch cap checked before approval and again at approval time. | All-eight-ABI error coverage and nested wrapper units; fork over-cap approval blocked. |
| T5 | Per-input normal fee parts, separate declining launch fee and dead-state wall share; amounts have token units. | Browser fee rows and source arithmetic; fork launch and post-launch buys. |
| T6 | Dead Buy/Sell chips first, free-sale costs and copy; closed-plea links and alive notices removed. | Fork death and free-sale scenario; dead browser matrix. |
| C1 | One stale/open eligibility model, including Intake completion; lapse cooldown starts at verdict. Removed the reverting lapse-expiry control. | Exact-boundary units; fork lapse → cooldown → successful retry and unanswered expiry → successful retry. |
| C2 | Spot/band estimate before approval, exact gate sale simulation once approved and a fresh 99% minimum immediately before signing. | Fork manual approval and sale; source verifies no latestPrice-based minimum remains. |
| C3 | Auto minimum includes the 0.70 floor; fee cap ≤10% and returned escrow included; actionable preflight/error copy. | Fork small-wallet preflight blocks auto-sell; automatic plea after funding; arithmetic/source checks. |
| C4 | Unwrap `(id, openCount)` from openOf, return settleable escrow first, then apply exact original-share, minimum and fee clamps. | ABI-shape integration unit and clamp units; denied auto plea → automatic appeal on fork. |
| C5 | Appeal form only for an eligible original denial; state-specific sale summaries, deadlines, refund and letter alternative. | Fork denial, sold appeal, lapse, no verdict and upheld states; rendered case pages. |
| C6 | Meter receives verdict, distinguishes score zero from no score, colors denials and names the margin. | Zero-score denied/upheld fork case; browser meter states. |
| C7 | A sold successful appeal remains OVERTURNED; sale amount remains in its foot/details. | Fork automatic appeal and delivery; stamp assertion. |
| C8 | Shared objection line omits invented VOID scores and includes OVERRULED points. | Fork overruled, stale/void and sustained rulings; table and stamp checks. |
| S1 | Shared displayed/death/awaiting season state; seasonFees plus rollover only for nextToClose. | Season-pot unit; fork season boundaries, close order and rollover; strip/Home/Seasons/Profile use shared model. |
| S2 | Three season panels, full own standing, own record controls, seat panel and final leftovers state. | Fork explicit recording and closes; browser Seasons states; own-wallet filtering inspected. |
| X1 | Six-second transports, shared health cooldown, five-call batches and adaptive log ranges including nested HTTP error text. | Browser faults: hanging first RPC, 429 cooldown, third RPC only and 1,000-block limits. |
| X2 | Multicall3, block checks, event/receipt/60-second snapshots, backoff, queued refresh and hidden-tab pause. | Browser request counts and idle probe; receipt-triggered updates in fork scenarios. |
| X3 | Clamp score/need; impossible needs have no bar; zero-balance profile has no plea meter/link. | Boundary unit; 320/360/390/768/1280 profile browser sweep. |

## P2

| Ref | Change | Check |
| --- | --- | --- |
| T7 | Buy/Plead form order follows mockups; unit-bearing balance/Max, quote age, slippage aside, invalid fields and final action. | Rendered Buy/Plead; disconnected and balance states; exact Max state retained behind formatted input. |
| T8 | Buy record P/L, meaningful open-plea link/cooldown and plain-token cashback wording; seeded empty Home state. | Fork buy records and stale-plea scenarios; source and browser panels. |
| T9 | Launch notice, UTC end, elapsed minutes, cap, normal fees and per-second linear extra. | Fork opening window; timestamp-derived fee rows inspected. |
| T10 | Home fee/supply section, all-burn supply difference, no donation/approval, small conditional Rebalance action. | Source removal search; Home browser view and live supplies; public small Rebalance succeeds on the fork. |
| C9 | Distinct disconnected/open/cooldown/range/CannotPass notices; chip-score alternatives; dead form replaced by closed state. | Fork cooldown, floor and expired request; browser narrow layouts. |
| C10 | Four fact cells, weighted uncovered holdings, on-chain total fallback, form order, timeline and contract rules. | Fact-band/weighting units; fork facts and rendered Plead. |
| C11 | Named internal constants, mode-specific plea/appeal fee and output rows, tip, PLEA estimate/cap and button costs. | Auto/manual fork submissions and appeals; cost arithmetic/source review. |
| C12 | Positive-only single pressed chip, disabled empty-wallet chips, formatted whole amounts and read-only appeal amount. | Browser chips and integration appeal preview; exact bigint transaction amounts. |
| C13 | Kit-ordered checks, idle/over-limit states, stable-code polite announcement and token-aware letter interpretation. | UTF-8/text units; browser text edits and hidden-character rejection. |
| C14 | Ink sell controls, block urgent countdown/bar, closing time and quote-based costs. | Fork manual sale and auto delivery; rendered seller/visitor states. |
| C15 | Detailed case card/facts, state-aware timeline, seller badge, verified judge metadata, share workbench and transaction details. | Historical reads with explicit fallback; browser case routes; fork submit/verdict/sale logs. |
| C16 | One writer net amount; Delivered runner/tip/auto-fee breakdown; manual gross sale labelled separately. | Fork manual sale and automatic delivery receipts; shared soldFor helper. |
| C17 | Objections only on approved-family cases, counts/deadlines/rules and viewer-specific controls. | Fork own/other-wallet objection views; direct non-approved case guarded. |
| C18 | Case anatomy, no seller/full/closed form, header rules, side explanation and rulings table with settlement. | Fork object/overrule/void/sustain/settle controls; responsive table browser checks. |
| C19 | Honest anyone-can-deliver letter wording, complete commands/fees/limits/examples/status and pre-seed fixed costs. | Live unseeded Letters browser; source commands; checker units. |
| C20 | Validate case number before RPC; breadcrumb and no-case empty state with a way back. | Browser p/0, p/999999 and malformed/share states. |
| S3 | Leaderboard heads, threshold bar, judge-score brackets, rounded prizes, projected payouts and close guidance. | Fork ranks/recording and close; browser leaderboard and source share sums. |
| S4 | Closed-season pot, payouts, rollover, bonus burn, dates/closer, receipt and top-three/own rows; event ranks treated as one-based. | Fork close logs and payouts; past-season browser views. |
| S5 | Removed anywhere-breaking stat override; preserved numbers and adjusted token-unit typography. | Browser 320/360/390/768/1280; rendered clipping probe. |
| S6 | Verdict-family matching, full-history counts, optional filters/sort, filter-aware empty/load-more/end copy. | Wall browser and fork state families; history/source checks. |
| S7 | State-specific card feet, names/mono addresses, exclusive letter/auto badges and concise accessible card names. | Wall/Home/Profile browser cards; sold appeal and ruling fork cases. |
| S8 | Current-name check requires a real name; idle/clear/taken treatment, preview and description. | Name text units; browser profile states and name interaction check. |
| S9 | Read-only public profile, third-person copy and no owner edit/plea controls for another wallet. | Connected/disconnected public profile browser sweeps. |
| S10 | Profile lookup/loading/error, four stats, open plea, buy facts, season table and one claims row. | Live and fork profile browser views; shared eligibility/fact logic. |
| S11 | Claim allocation totals, list/root/receipt metadata, direct vault claim and proper loading/empty states. | Live zero-root browser; snapshot-scoped fork claim verifies the recipient, allocation and receipt; positive delegated vault remains untested. |
| S12 | Address error ID, described-by, invalid wrapper and exact repair message on Claim/Profile. | Browser invalid-address interaction and axe checks. |
| S13 | State-aware PNG/post, badges, score/need/points/sale/rank facts, actual link and bounded sentence quote. | Browser PNG generation, state previews and X-intent text; downloaded dimensions. |
| X4 | Preserve data across background reads; clear only for changed inputs; tolerate one failed re-read. | Fork receipt updates and browser source/state review; no snapshot flash on unchanged inputs. |
| X5 | Six Home cells, total supply burns, trend/families, own season pot and real Cabal state. | Live Home, fork states and rendered first screen. |
| X6 | Natural strip wrapping, hours-based dead-man, season time/pot/bonus and complete death banner. | Live/fork strip and death scenario. |
| X7 | Removed Coinbase SDK connector/branches; retained mobile link and lazy image drawing import. | Export search for telemetry strings; cold-load network/storage check. |
| X8 | Three stateful plain-language toasts, receipt/event amounts, live verdict/ruling/window notices and icon dismiss. | Fork submissions, approvals, sales, appeals, rulings, records and closes. |
| X9 | Focusable disabled actions, distinct wallet/chain waits, cost sub-labels and route-persistent confirmation lines. | Keyboard browser checks and transaction state/receipt assertions. |
| X10 | Separate countdown, hours-based dead-man, prose spans, ages, held time and UTC clocks. | Exact time-boundary units; fork time warps; rendered copy. |
| X11 | Read-specific errors, first-load skeletons, retained stale data, guarded writes and a real unknown-route view. | Read-only browser loading/error/not-found routes; RPC fault checks. |
| X12 | Correct-size SVG empty states, relevant icons/actions and one Home empty state. | Rendered empty routes and first phone screen. |
| X13 | Connected name/seat profile link, yellow chain switch, connect-only dialog and Profile disconnect. | Fork discovery/connection/switch; profile browser states. |
| X14 | Menu opening/escape/route focus, correct drawer links, moon toggle and mapped titles. | Browser keyboard focus assertions and route titles. |
| X15 | Dedicated latest-verdict hero, facts/meter/summary/countdowns/link, spaced headline and full lead. | Fork Home with real cases; live empty Home and browser screenshot. |
| X16 | Dead Home headline/lead/actions/stats and closed Plead state. | Fork death scenario and dead browser routes. |
| X17 | Four full steps, fact table, CannotPass explanation, worked example and four information panels. | Source constants/fact rules; browser layout/contrast probe. |
| X18 | Ordered role-bearing contract lists, partner reads, checksummed copy and owner/warning text. | Live discovery/code checks; rendered Contracts and copied address behavior. |

## P3

| Ref | Change | Check |
| --- | --- | --- |
| T11 | Opening-payout mode prediction and receipt message; one explanatory ERC-6909 row; nonzero dust shown as less than 0.01. | Fork opening buy events; amount/source checks and Profile browser. |
| T12 | Keep exact approvals, skip sufficient allowance, preserve input/quote and explain both steps. | Fork approve → buy and repeated actions; captured exact spender amounts. |
| C21 | Hold follows Tribunal only; no hold on excluded/sustained/recorded cases; correct finished-state copy. | Two-panel and sustained fork cases; record controls after holds. |
| C22 | Check at most three question matches and require the consumer contract/chain before trusting metadata; encode request ID. | Source verification; no fabricated oracle metadata; public API limitations documented. |
| C23 | Hex-copy label resets on edit and after 1.5 seconds; copy failure announced. | Browser clipboard bytes, edit reset and 1.5-second reset; source check. |
| S14 | Reject unsafe numeric allocations, parse decimal/hex strings and verify proofs locally before display. | Parser/proof units and a fork root/list claim; unsafe JSON numbers rejected. |
| S15 | Correct small-button icons/shape, stable filenames and friendly copy/download messages. | Browser 1200 × 675 download and clipboard-fallback interaction. |
| X19 | Bigint truncation with upward cost mode; strict deadline semantics; all eight ABI hashes checked. | Tick/deadline/ABI units, export hash check and live configuration. |
| X20 | Absolute public OG/Twitter image URL and dimensions/alt; bounded post length; checker uses imdTEST. | Export metadata, PNG dimensions, browser intents/checker. |
| X21 | Panel heading-level API; section/panel/fact headings selected by context. | Browser heading inspection and semantic source pass. |
| X22 | Page roots no longer add a second section gap; flex root keeps the footer at the bottom. | Short-page and desktop/mobile browser views. |
| X23 | Profile Wall link is a proper link-button; filters use chips. | Browser keyboard/target checks. |

## Retained behavior and limits

The pinned CSS, sprite, checker and local fonts remain unchanged. The app retains static subpath hosting, live deployment/ABI verification, exact approvals, simulation and explicit gas, safe text rendering, public history, seat accounting, account-bound claims and wallet add-chain fallback. The donation control and Coinbase SDK are intentionally removed by D2/D3. The seed control and final form order intentionally follow this review.

Publication and actual public-chain state-changing behavior are outside these local checks. The live run remained unseeded with a zero claim root during read-only verification. See `VALIDATION.md` for the final evidence counts and unperformed subchecks; this document is a worker record, not an independent certification.

## Independent revision findings

All three reports reproduced; `.imd-responses.json` supplies the full finding IDs and verdicts. Changes preserve the accepted interface, contracts, dependencies and design system.

| Finding / original refs | Targeted change | Reproduction and recheck |
| --- | --- | --- |
| `663e8572…` · C18, S6, X5, X15 | Separate complete event-history court index from the 24-card page. Read older unresolved requests, open objection cases and latest verdict; share totals between Home and Wall. Cache immutable expired submissions/verdict block times. | Before: #7 missing, 24 pending / 3 no verdict. After: #7 open/latest, 26 / 1; pagination 24 → 32. Four new unit regressions and final browser matrix. |
| `73b8478d…` · S2 | Read the connected wallet’s `holdsSeat` independently; use it in the seat panel and own standing. Omit a before-multiplier score row until there are recorded scores. | Before: true on chain, zero notices for a no-history holder. After: positive notices without a plea/leaderboard row, including both themes and phone widths. |
| `92ffcc71…` · S2 | Derive the plea season from verdict time, read its closed flag, guard unknown/error states, disable closed-season Record and hide other closed record controls. Correct panel, timeline, detail-card and sale-summary copy. | Before: enabled Record, then `SeasonClosed`, no broadcast. After: explicit missed deadline on manual sale, sold appeal and lapse; positive unclosed-season control/simulation retained. |

`VALIDATION.md` separates the current 27 tests, 180 affected fork views and 140 live read-only views from the previous delivery’s broader evidence. No real public-chain transaction was sent.

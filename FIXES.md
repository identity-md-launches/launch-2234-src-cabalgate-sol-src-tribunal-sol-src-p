# Run 9 round-2 fixes

Scope: all 45 items in [run9-site-review-2.md at 228e355](https://github.com/khaed1/claude/blob/228e355be9e9a8a460c35d3af1465b96adeafef5/plea/site-design/run9-site-review-2.md), with its continued round-1 requirements and the design system at `91b34fe4b8e5`. The earlier fix ledger follows as history. Contracts, dependency manifests/lockfiles, build configuration and ignore files are unchanged. D1 (owner-only seed), D2 (small Rebalance; no donation flow) and D3 (no Coinbase SDK) remain.

Checks below are worker-run evidence, not an independent audit. `VALIDATION.md` records final outcomes and limitations. All writes use a local Sepolia fork; live Sepolia checks are read-only. Fixture keys are generated in process and never exported. Browser output stays in disposable `test/scratch/`.

Check names: **units** = `web/tests/round2.test.mjs` and the existing unit suite; **primary** = `run9-fork.mjs`; **court** = `run9-fork-court.mjs`; **round2** = `round2-fork.mjs`; **race** = `round2-mined-revert.mjs`; **RPC** = `round2-rpc.mjs`; **profile/claim** and **death** = their `run9-fork-*.mjs` scripts; **matrix** = browser overflow/axe sweeps in both themes at 320/360/390/768/1280. Where only source inspection checks a specific variant, it is stated.

| Round-2 ref | What changed | How checked |
| --- | --- | --- |
| T1 (P1) | Errors carry title/body and live cap/slippage values. Both approval and swap use overrides; a mined revert replays at its receipt block, retains its hash and labels the failed link. Cap/balance errors use one invalid field hint. Added HookCallFailed. | Race forces a real mined PriceLimitAlreadyExceeded; primary checks cap, disabled approval and aria-invalid; units cover decoding/overrides. |
| T2 (P1) | One bigint fee-display helper rounds parts once, sums those displayed parts, preserves typed/Max payment, derives pool remainder, and supplies Price/Reaches/total/part rows. Percentages have the requested precision. Very small payments increase precision instead of displaying a negative remainder. | Units reconcile 100, launch inputs 2/7/48, fractional inputs and Max; primary buys and matrix. |
| T3 (P1) | Sell output counts only PoolManager-to-wallet transfers; hook cashback stays separate. | Death check independently decodes both transfer sources and compares each to the fill text. |
| T4 | Added quote skeleton; notes follow approval state. A confirmed trade freezes its prepared quote and stops costs/cap/balance validation. Make another trade clears amount and Max. | Primary checks valid done state and cleared amount; source inspection of frozen quote/read guard; matrix. |
| T5 | Balance label, signed P/L, shared approved/pending open-plea copy and correct lapse/sale times; pre-seed price and Plead link suppressed. | Primary open/lapse states, units for shared timing; pre-seed/live and populated matrices; source review of signed formatting. |
| T6 | Home uses the same fee helper, two-decimal percentages and total rows. Supply allocations come from mint logs, with a single-block fallback; burn is signed. Rebalance copy uses the pair symbol. | Fee units, live mint/read inspection and matrix; maintenance checks small public Rebalance. |
| C1 (P1) | Plead and Buy use verdict + cooldown for lapse, now + cooldown for a sale now, and verdict + execute window for sell-by. | Timing units and primary lapse/cooldown flow; shared helper source review. |
| C2 (P1) | Pending/sustained objections have objector, threshold, sale/lapse outcome and stake copy. Sustained/excluded pleas never promise points. Appeals show original and appeal verdicts, sale rows and seat multiplier; appeal countdown names its deadline. Sale times use cached block timestamps. | Court objections/appeals, round2 pending/sustained lapse fixtures, primary sold appeal; matrix. API agreement is optional and validated. |
| C3 (P1) | Shared caseState excludes voids and distinguishes closure, full slots and pending rulings. Plea panel, timeline, form and Open now agree; no future close time or free-slot promise on a closed case. | Units exercise every closure reason and exact boundary; round2 void → free slot → pending → sustained; court expiry/settlement; matrix. |
| C4 | Oracle responses are identity checked and reduced to safe bounded scalars. Missing agreement is omitted; panel size falls back to chain. Routed error boundary preserves the shell and offers retry/Home. | Malformed-object fixture in a browser, sanitizer units and matrix; error-boundary recovery path inspected in source. |
| C5 | Seller, other-wallet and visitor objection/points controls have their own copy and labels; pending objections name their objector. | Round2 and court with both viewer states; matrix; explicit non-owner Record label assertion. |
| C6 | Fact cells show historical/current values plus separate points, a labelled group, signed percentages and an exact sum when the score decomposes without uncovered PLEA. | Existing fact-band units, primary facts and historical populated cards; matrix. Archive failure intentionally uses the two-cell/no-data fallback. |
| C7 | Shared noVerdict state drives stamp, timeline, judges, sale copy and share card/post; expiry differs from Intake-reported failure and never displays a fabricated 0/0 tally. | Primary unanswered expiry, court/Share state reads and matrix; helper branches inspected for refusal/split. |
| C8 | Cooldown identifies its latest cause; both Submit paths use explicit connect copy; fact reads have icon/skeleton/aria-busy. | Primary cooldown and invalid-text controls; live/disconnected and fork matrices; cause selection reviewed against all three timestamps. |
| C9 | Both Plead modes distinguish not seeded, no amount, reading, failed quote and actual values in You get/At least. | Seeded fork form and disconnected matrix; shared value function source review. |
| C10 | One feeInPlea calculation feeds all five fee estimates with upward display rounding. Added computed NAME UTF-8 hex example. | Letters/appeal browser reads, primary auto appeal; single-helper call-site inspection and matrix. |
| C11 | Connect text is required at each action call site. lockedReason takes precedence for globally unavailable actions; Record explains recorded/held/closed/excluded/sustained states. Appeal/objection text errors are explicit. | Court blocked Record; round2 closed/sustained cases; profile/claim unknown-chain flow; matrix and all call-site source review. |
| C12 | Manual and letter sale summaries append the sale block's UTC timestamp. | Primary manual/auto sale and sold appeal; cached timestamp helper/source check. |
| C13 | Empty supports multiple links or a button. Missing plea/share pages offer Wall and, while eligible, Plead. | Missing-page matrix; source review of alive/seeded guard. |
| C14 | Extra issues use warning-circle, singular problem announcement is correct, and Reads as uses envelope-simple. | Existing text/name tests, profile/claim name interaction, browser text checker; shared renderer inspection. |
| S1 (P1) | Lists every waiting season oldest first; intermediate seasons expand on demand with their pot and own recordable pleas. Rollover names the preceding season. Only the displayed view owns #seat; ended headings are h3. | Season-state units; round2 creates two waiting seasons, opens the intermediate one and checks own Record and one seat anchor. |
| S2 (P1) | Counted pleas match per-plea score/SeatMultiplier, with tie order and no unknown placeholders. Displays filled slots, sorted by points; Profile uses the same lookup. | Units include ties/running-total trap; round2 records two seat pleas and checks 54/48 with 45/40 judges; record toast checked. |
| S3 (P1) | Last-season bars, projections, closing copy, historical payout and close toast leave funds for the wall. Empty running and ended boards have separate copy/actions. | Death closes all remaining seasons and flushes leftovers; season units and populated matrix; final-season copy source inspection. |
| S4 (P1) | Loaded older cards retain their IDs/objects and re-read on relevant new plea/objection logs, replacing in place. | Round2 loads older pending #21, applies a signed verdict and objection, and verifies both refreshes plus retained focus/scroll. |
| S5 | Standing uses flexible stats, omits rank-0 prizes, labels each own plea and uniquely names Record. Held projections calculate next best three/rank/prize and the no-plea state explains the threshold. | Round2 own records/seat and waiting-season controls, court payouts; matrix; projection arithmetic source review. |
| S6 | Three summary panels use the pinned grid/spans. Seat panel has computed examples/units, exact record-time explanation and labelled short address. | Round2 season matrix and single-anchor assertions; multiplier units and source values. |
| S7 | Column classes, rank screen-reader text, seat badges and filled scores align. All shares/rollover use integer bps and pct. Closing/loading/error/retry states are explicit. | Court ranked payouts, round2 board, season units, RPC recovery and matrix. |
| S8 | Past cards use topOf for top three plus own ranked wallet, names, (you), checksummed closer, unpaid/empty cases, and final-wall remainder. | Court closes and pays seasons; death final closes; populated matrix and historical row source review. |
| S9 | Ported Wall page CSS/labelled filter groups, contextual counts and wallet names. One reset button works in place; older/end controls are centered with count copy. | Round2 pagination/refresh and matrix; filter/reset browser controls and source check. |
| S10 | Profile title badges, address-before-lead, name preview, nonzero seasons, status/rank/prize cells, counted-plea links and dead copy use the shared components/state. | Profile/claim name workflow, own/public matrix, round2 seat records; death read-only profiles. |
| S11 | Invalid targets never fall back to the viewer. The invalid lookup stays filled; valid mixed-case hex is normalized without requiring a checksum. | Round2 connected invalid target and lookup assertions; live invalid-route matrix. |
| S12 | Flush vault/list panels, short vault/claimable rows, gas-only actions, loading skeleton, already-claimed receipt, retry key and distinct list-failure messages. | Profile/claim real fork root/proof/recipient/claimed workflow; root-zero live matrix; delegated-vault/error markup source review (no production delegated allocation supplied). |
| S13 | Share labels/posts follow state and objection re-score; pending/sustained/overruled cases precede generic sold copy. No-answer cards use noVerdict without a tally. | Round2 case/share markup in matrix, court states; PNG/Share interaction check; per-state label/post source review. |
| S14 | Home values split numeric and runtime-unit nowrap spans, allowing the unit to wrap. | Live and populated 320/360 matrix; 320/390 screenshots and taste overflow probe. |
| X1 (P1) | Typed cause classification, preserved HTTP bodies, unbatched logs, request-only fallback for coded answers, cooldown recovery/reset, explicit range limits, local halving, head retry and retained history prefixes. Poll head is separate from scan progress; failures back off correctly. | RPC fault proxy: hung/429 first endpoint, Sentio-only HTTP-429 1000-block limit, head lag, all-three outage/retry, -32603 errors. Unit classifications and endpoint retries. |
| X2 (P1) | Hero and Wall share the same per-state foot; denied/pending/no-verdict cannot claim a sale or points, and dead pleas cannot offer an appeal. | Round2 denied/approved hero and older-card assertions; primary pending hero assertion; per-state helper/death guards inspected. |
| X3 | Deferred anchor target waits for actual data/DOM, runs once and cancels on user input/20 seconds. | Round2 direct how/contracts/seat at 320/768/1280; footer navigation and matrix. |
| X4 | Panel has real flush head/body and meta slots; contracts, claim/vaults and profile seasons use them. | Live/fork matrices and keyboard/ring inspection; source padding/focus review. |
| X5 | Route-specific busy bands, Home stats/hero and Wall cards; snapshot refresh returns success/failure, reports repeated failure and clears only on successful snapshot. Retry has icon/row and resets health. | RPC repeated-request-error and outage recovery checks; loading skeleton probe, matrix and source review. |
| X6 | Delivered resolves the seller, suppresses duplicate Verdict/identical receipt feedback and includes sale/runner/tip/times. Record reads per-plea points and bestOf/rank. Denied, letter, claim, sale and lapse messages have their requested bodies/hash behavior. | Round2 second record toast, primary sales/appeal, profile/claim and death; Delivered/letter branches inspected; no production runner was invoked. |
| X7 | Hero quote hook is shared with the case page, adds seat math/window meta, XL stamp and fact values. Pinned Home rules plus the existing smaller title token prevent the 320-px headline break. | Round2 approved hero quote/seat assertion; 320/390 screenshots, matrix and taste. |
| X8 | Semantic four-step list removes duplicate numbers, restores dynamic copy and two-column fact example; info headings include icons and dead-man uses Countdown. | Live how/anchor matrix, screenshots/taste and source comparison with pinned mockup. |
| X9 | Contracts stack both lists, owner panel and warning. Names and role metadata are separate; Copy uses concise labels and owner text matches the mockup. | Contracts live matrix, direct-anchor and keyboard checks; pinned-copy source comparison. |
| X10 | Shared signedPercent uses + and U+2212; TradingGate uses clock for today/future. | Formatting/fact units, live gate screenshots and source inspection. |
| X11 | Lockfile preserved. Export generation rejects cbwsdk, cca-lite, @coinbase/wallet-sdk and keyval-store in JavaScript. | Production build marker check and final export validation. |

## Earlier round-1 ledger (historical)

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

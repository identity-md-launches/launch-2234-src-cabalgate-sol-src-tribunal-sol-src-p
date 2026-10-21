# PLEA frontend design

## Overview

The site is the public case file and trading interface for PLEA's Sepolia test run 9. It uses the requested **neo-brutal docket**: warm paper, heavy Archivo headings, ink outlines, hard offset shadows, and a tilted verdict stamp. Money, eligibility, deadlines and errors use plain wording. Pleas remain their authors' plain text.

The source of the visual system is `khaed1/claude@91b34fe4b8e5`, `plea/site-design/`. `web/src/design/tokens.css` and `components.css` are byte-for-byte copies. The supplied `text-check.js` and Phosphor sprite are also unchanged. React components preserve the kit's reusable markup; live empty, loading and transaction states replace mock data. The dashed design-reference bands and sample history are absent from the production app.

## Colors

Canonical definitions are in `web/src/design/tokens.css`. Additional application CSS uses these variables, with no added UI palette.

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Page | `--paper` | `#FBF6EA` | `#17150F` |
| Sunken surface | `--paper-2` | `#F3EDDD` | `#201D16` |
| Card/input | `--card` | `#FFFFFF` | `#26221A` |
| Text/outline | `--ink`, `--line` | `#121212` | `#F5F0E4` |
| Secondary text | `--ink-2` | `#4A463E` | `#C9C1AE` |
| Tertiary text | `--ink-3` | `#6B665B` | `#A89F8B` |
| Action | `--action` | `#FFD92E` | `#FFD92E` |
| Your row/selection | `--action-soft` | `#FFF3B0` | `#3D3519` |
| Focus | `--focus` | `#1F4FE0` | `#FFD92E` |
| Hard shadow | `--shadow-color` | `#121212` | `#5E5644` |

Verdict fills remain the same in both themes: approved/overturned `#4BE08F`, denied/upheld `#FF5A4E`, pending stripes `#FFC247` / `#FFE08A`, no verdict `#C9C3B6`, sold `#6FA8FF`, and objection/sustained/overruled `#C8A6FF`. Every filled state uses `--on-state: #121212`. Lapsed has a dashed outline and the card surface. The state is always written in words; color alone carries no outcome. An objection is a second small stamp, never a replacement for the original sale/verdict.

The urgent sell-window pair uses ink/yellow in light and yellow/ink in dark. Stripes are the kit's only gradient and are also used by its warning component. There are no blur, glass, glow or soft-shadow effects. Wallet vendor marks retain their official colors separately from the UI palette.

Light is the default. `web/index.html` applies localStorage `plea-theme` before first paint. The toggle updates `html[data-theme]` and suppresses transitions during the change.

## Typography

`web/src/site.css` declares local fonts under `web/public/fonts/`: Archivo variable weight 100–900 and width 62–125, plus IBM Plex Mono 400/500/600. The Archivo axes were checked during conversion to woff2. Both families' SIL OFL notices are included; no font CDN is requested.

Archivo is body and display; headings request 125% stretch and 800 weight. Body uses 400, labels/buttons 600, and the kit's share text uses 500. The kit logo uses weight 900. IBM Plex Mono serves addresses, inputs, request IDs and countdowns. Figures are tabular throughout.

The pinned scale is 12/14/16/18/22 px, fluid section headings 22–28, page titles 28–36 and the home heading 36–56. Line-height tokens are 1.1, 1.3 and 1.5. Headings balance, prose uses the kit's measured line length of 65ch, and long addresses wrap. The supplied scale is preserved even where the generic review probe prefers six sizes; that exception is recorded in `VALIDATION.md`.

## Layout

`.page` centers a maximum 1200 px content area. Gutters are 16 px, 24 px from 768, and 32 px from 1280. Spacing tokens are 4/8/12/16/24/32/48/64/96 px.

The kit supplies the 4/8/12-column grid, `.split` (7/5 from 1100), `.split--even`, `.auto-grid`, `.wall-grid`, `.stack`, `.cluster`, `.stats`, tables and leaderboards. Below 1100, two-column forms and details stack. The plea status page uses the kit's ordering to bring the sale controls before the case text on phones. Full navigation begins at 1100; the menu drawer uses two columns below that. Under 400, the theme control moves into the drawer.

The home Buy/Plead controls and wallet button are visible in the first 390 px-wide screen. On Buy and Plead, fields, slippage or facts, text and costs precede the final action, following the pinned page mockups. The header’s wallet control and Home’s main Buy link remain on the first phone screen. Submissions still require valid text, current facts, eligibility and the right chain.

`web/src/site.css` adds the native wallet sheet, wrapping safeguards, 44 px address-link targets, local font declarations and the offscreen export container. It introduces no independent color or type scale. The status-page mobile ordering and objection annotation style also come from the mockups’ own style blocks. Plea text uses anywhere wrapping to accommodate a 280-byte unbroken word. Layouts were exercised at 320/360/390/768/1280, with the review probe additionally covering 1440. See validation for exact coverage.

## Elevation & Depth

The system uses 2 px fine and 3 px main ink borders. Hard shadows have 3/4/6 px offsets and zero blur. Pressable cards, buttons and stamps use them; static panels use structure and spacing. The native wallet dialog uses the same card surface and hard shadow, with a token-colored opaque backdrop. Toasts use the existing fixed toast region; page-based workflows use routes rather than dialogs.

## Shapes

Radii are 4 px for stamps/badges, 8 px for controls and 12 px for cards/panels, with pill controls at 999 px. The logo and verdict stamps share a −3° tilt. Pending stripes and lapsed dashes distinguish states in grayscale. Decorative icons are the locally bundled Phosphor Bold sprite, marked aria-hidden; icon-only controls have accessible names.

## Components

- `web/src/components.tsx`: Title, Panel, Notice, Empty, Costs, AmountInput, AddressView, Countdown, TextBox, Meter, Action, TxButton, ApprovedAction, Stamp, ObjectionStamps and PleaCard. They reuse the kit's classes and money/date formatting.
- `TextBox` calls the unchanged text checker. Plea, appeal, objection, letter and name inputs have live UTF-8 counters, associated labels/checks, invalid states and a polite summary. APPEAL letter counts use the command body's byte count. A current wallet name says “This is your current name.”
- `Action` handles disconnected/wrong-chain guidance, disabled prerequisites, busy, confirmed receipt and a remedy. Approval is an explicit step. Completion resets for edited forms; an unchanged confirmed action cannot be sent twice.
- `web/src/wallet.tsx`: the single top-bar control and labelled native dialog. It discovers EIP-6963 and injected wallets, offers phone deep links, traps focus natively, closes on Escape/backdrop/close, and restores trigger focus. The Coinbase SDK connector was removed under D3. Unknown-chain switching uses the exact supplied add-chain block.
- `web/src/context.tsx`: read/error state, bounded polling, per-action transaction state and live-verdict tracking. A verdict stamp lands once per live arrival. The kit's 420 ms landing honors reduced motion. All other transitions are disabled in `site.css`.
- `web/src/share.tsx`: one share-card component for preview and export. Font-loaded browser rendering produces exactly 1200 × 675 PNG bytes; text remains text. The wide-stamp modifier is used only for NO VERDICT and OVERTURNED. Measured text fitting can fall back to the existing 22 or 18 px scale steps for pathological wide-glyph input, keeping text clear of the footer. Static image stamps do not animate. Download/copy have their own busy/error states.
- `web/src/details.tsx`: fee, supply, letter and timeline panels composed from the same primitives.
- `web/src/seasons.tsx` and `profile.tsx`: one season model for active, awaiting-close and final states; leaderboard, payout and profile tables retain the kit's horizontal table wrapper on phones. Wall cards use a full-card link over labelled content so their concise accessible names and separate descriptions pass axe.

The stamps use the original plea score against its need. After an objection, the foot's unrecorded points use the lowest panel score with Seasons.pointsFor. Recorded points use pointsOf. Excluded sellers and sustained cases cannot record points. Timer labels include the UTC deadline without announcing a changing digit every second.

## Do's and Don'ts

Start a page with Title and the kit's grid/stack primitives. Read live values through the shared runtime; keep directions next to the control. Use Action/ApprovedAction for writes, exact token units, UTC times and a real receipt link. Add a state through the existing stamp/notice palette and always write its name.

Keep the two pinned CSS files unchanged. Do not invent balances, histories, fees, recipients or oracle quotes. Do not render plea text as HTML, hide a missing input behind sample data, add an IMD diamond, introduce new fonts/colors/effects, or animate the page around a verdict. Retain the footer's statement that this is not an official IMD page.

For another route, add a React page to the hash-router switch, compose the shared components, connect existing runtime reads and simulate every write. Recheck mobile reflow, keyboard focus, both themes, long values, failure states, and regenerate the asset manifest after the final build.

## Preserved court and recording states

The 24-card Wall page is a presentation limit. Home’s latest-verdict card, objection cases and totals use a separate complete-history model in `web/src/chain.ts`; loading older active cases does not enlarge the initial card grid. The connected seat notice uses a direct `holdsSeat` read even before the holder records a plea.

An unrecorded eligible approval from a closed season uses “Not recorded” and a plain sentence identifying that season. Its disabled Record action explains that recording is closed. The sale summary, detail card and timeline use the same missed-deadline state, including sold appeals and lapsed approvals. An unresolved season-status read keeps the action unavailable with a loading/error explanation. Existing token colors, typography, spacing, buttons and panel hierarchy are preserved; the round-2 additions below continue those visual tokens. Current rendered coverage and limits are recorded in `VALIDATION.md`.

## Round-2 components and responsive states

The pinned token files remain byte-for-byte unchanged. New rules live in `web/src/site.css`, use existing tokens and port the Home/Wall/Seasons page rules. At 320–359 px the hero uses the existing `--text-3xl` token so “Buying is open.” remains a single line. At 360 px and above it uses the pinned hero token, with the mockup’s 4 px gutter allowance below 400. Numeric Home values and pair symbols have separate nowrap spans; quote summaries and future-date pills may wrap between words. Numbers retain tabular figures and do not split inside their digits.

`Panel` accepts `flush`, `meta`, `id` and heading level. A flush panel renders `.panel__head` and `.panel__body.stack`; padding is 16 px on phones and 24 px from 768. `Costs` rows carry an optional `part` or `total` kind, so inserting a row preserves the correct hierarchy. `Title.aside` groups profile badges with its h1. `AddressView.shortDisplay` shortens only the visible address; the explorer and Copy retain the checksum address. `Empty` accepts one or several link/button actions.

`AmountInput.loading` renders the kit skeleton with aria-busy. `Action`, `TxButton` and `ApprovedAction` require call-site connect text; `lockedReason` explains an unavailable action to every viewer, and `srLabel` distinguishes otherwise identical Record buttons. Error titles are bold inline with an optional explanatory body. Pending, confirmed and failed receipts have distinct link labels. Unavailable controls stay focusable and guard activation.

Hero and Wall share `PleaFoot`: only approved-family pleas can display season points. Hero uses the shared sale quote and an XL stamp, with fact values separate from their points. `FactCells` is a labelled group with historical values on a plea and live values on Plead/Profile; missing archive data is explicitly “no data”. No-verdict, objection closure and sustained points are shared contract-derived states, not page-local wording.

Seasons uses the pinned 8/4/4 medium and 4/4/4 large grid spans for its three summaries. Every ended season remains reachable: the oldest is expanded; intermediate seasons use native details with on-demand reads and h3 panel headings. The displayed season has the only `#seat` panel. Standing stats wrap as a cluster, counted seat scores omit empty slots, and final leftovers consistently name the buy wall. Past seasons are article panels with a heading/Closed cluster, payout and top-wallet columns.

Loading bands have each route’s real title and state labels, with Home stats/hero and a row of Wall skeleton cards. The routed error boundary keeps navigation and footer available if rendering fails. Deferred hash anchors wait for their actual section and stop after user input or 20 seconds.

Final rendered coverage: 320/360/390/768/1280 in both themes, disconnected and connected, including populated fork cases and two waiting seasons. Keyboard/ring checks covered Home, Contracts and Claim at 320/360/1280 in both themes; screenshot inspection confirmed the padded dark Contracts Copy ring. The pinned taste probe also covered 1440. Exact commands, findings and limitations are in `VALIDATION.md`.

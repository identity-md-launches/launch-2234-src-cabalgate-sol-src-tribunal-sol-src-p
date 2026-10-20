# PLEA Sepolia test run 9 frontend

The static application is in `web/`; the ready-to-host export is `dist/`. It continues launch #2234 without changing or deploying contracts. Test tokens have no value. No backend, credentials, hosted font service, relay or WalletConnect project ID is used.

## Build and preview

Node 22.12 or later and npm are required. From the repository root:

```sh
npm --prefix web ci --cache /tmp/plea-npm-cache
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
npm --prefix web run preview -- --port 4173
node web/scripts/check-export.mjs
```

Open the preview URL printed by Vite. `base: './'`, local assets and hash routes support a gateway subpath with no server rewrites. Publish the complete `dist/` directory together; do not serve `web/index.html` directly. Source maps, dependency archives, caches and node_modules are not exported or committed. Publication is handled by the network after review.

## Configuration and source binding

`web/deployment-input.json` and `web/network-input.json` preserve the supplied handoff and network table. `web/scripts/manifest.mjs` creates `dist/imd-deployment.json` after Vite finishes, with exactly the handoff's five contracts, their ABI hashes, source commit, launch ID, attestation hash, unchanged network and wallet-add-chain blocks, and a SHA-256 inventory of every other exported file. The handoff has no poolKey; no pool key is invented in the manifest.

The app loads that same manifest at runtime through `web/src/config.ts`. That module centralizes ABIs, public RPC settings, EIP-6963/Coinbase connectors, the brief's expected auxiliary addresses, PoolSwapTest and delegate.xyz v2. It checks ABI canonical Keccak hashes, the RPC chain ID, deployed code and PleaLaunch's discovered Letterbox, Tribunal, hook and paired token. Its PoolManager must equal the supplied network table. The pool key is read from PleaHook. Public RPC fallback uses the supplied Sepolia endpoints, in order.

The eight raw ABI arrays in `web/public/abi/` came from the existing source's successful offline Foundry build. All five handoff hashes matched. To regenerate them after an authorized contract/handoff change, build the pinned source, run `node web/scripts/export-abi.mjs`, then rebuild. A normal frontend rebuild uses the committed ABI files and does not need Foundry.

Fees, time windows, caps, season length, seat multiplier, rank shares, balances, decimals and symbols use contract reads. Mint allocations and cashback use events from block 11948819. The text rules and immutable appeal share-band definition come from the accepted implementation. `appeal.ts` supplements `factScore` with the gate's original-share clamp; automatic appeal amounts are read-only. Run 9's internal Letterbox sale floor equals twice the public appeal-wall-share constant, as documented in that module. Every action is simulated before asking for a signature.

## Routes and actions

- `#/`, `#/how`, `#/contracts`: live overview, rules, fees, supply, owner powers and verified contract links. Public seed and buy-wall maintenance controls are included.
- `#/buy`: paired-token approval to PoolSwapTest, exact-input buy with `abi.encode(buyer)` hookData; Buy/Sell after the Cabal dies. Quotes use the configured v4 Quoter where it reports an output. A hook that transfers PLEA directly can report zero swap delta, so the app also offers a clearly labelled indicative calculation from its live liquidity bands.
- `#/plead`: fact score, need, amount limits, text checks, cooldown/open-plea states and default-on automatic selling. Automatic uses Letterbox.plead; manual approves the oracle fee to CabalGate and calls submitSell.
- `#/p/<id>`: every verdict, objection stamps, approval window, manual executeSell(minOut), Letterbox delivery, escrow settlement, expiry, appeals, point recording, timeline and public oracle details. Automatic appeals use appealAuto(originalId,text); manual appeals can reduce the amount.
- `#/letters`: Sepolia Write Contract and wallet raw-data instructions, the exact letter checker, hex data, direct letter(text), fee breakdown and on-chain status instructions. No mainnet-only Etherscan message-page card is shown.
- `#/objections`: eligible cases, fee/stake approval, object, rulings, expiry and stake settlement. The sale always stands.
- `#/seasons`: pointsFor/holdsSeat, best three, shareBps, held points, explicit record, first-six-season bonus, close after CLOSE_GRACE, past payouts and final flush.
- `#/wall`: public history, status/letter/mine/objection filters and older-page loading.
- `#/claim`: zero-root empty state; typed-address claims, isClaimed, incoming delegate.xyz vaults and per-vault claims.
- `#/profile[/<address>]`: public balances, buy record, nameOf/setName, current-name/taken-name states, current facts, seasons, seat and the wallet's separate ERC-6909 paired-token claims on PoolManager.
- `#/share/<id>`: a browser-rendered 1200 × 675 PNG in every state, X text/link intent, download and PNG clipboard copy with a download fallback. `#/share` is the default link card. X media attachments require the visitor to attach the downloaded image.

Every write has its own busy/done/error state, explicit gas of ceil(estimate × 1.3), a confirmed receipt link, wrong-network blocking and a decoded remedy. Confirmed actions cannot be double-submitted; changing the form or choosing another trade resets its completion state. The top bar owns the single wallet connect/switch control. An unknown chain triggers wallet_addEthereumChain with the exact handoff parameters, then switches again. Mobile links open this same URL in the wallet's own browser.

## History, claims and oracle requests

History scans cover at most 10,000 blocks per request, split on range-limit errors and use the configured RPC fallbacks. Transient outages are bounded; incomplete history is reported and wallet cashback is hidden until complete. Cashback includes CashbackStacked, CashbackPaidPlain and CashbackPaidClaims only for the selected wallet. There is no sample history in the production app.

At validation, trading was unseeded and the distributor root was zero. The Claim empty state is intentional; no allocation was invented. When the owner publishes the real list, put its `claims.json` in `web/public/` and rebuild. Accepted entries contain decimal `index`/`amount`, `account` (or `address`) and a bytes32 `proof` array; arrays, a `claims` array and address-keyed maps are supported. A local published-list loader is also offered if the root is set before the file reaches this export. Simulation/on-chain verification rejects a mismatched proof. Claims always pay the listed account, including delegated vaults.

Public oracle data comes from api.imd.fun's `/oracle/requests` and `/oracle/requests/<uuid>`. The Intake hash is not used as an API UUID: a verdict's OracleAttestation requestId is decoded from its padded UUID; a pending plea is matched by the exact on-chain question in the public request list. Unavailable oracle metadata is stated plainly; on-chain verdicts remain authoritative.

## Execution limits

PoolSwapTest exposes a sqrt-price limit but no amountOutMinimum. Its exact-input trade may partially fill. The UI explicitly calls the displayed minimum an estimate and discloses that it is not a guaranteed output; it applies a price limit and simulates the actual router. Indicative liquidity-band calculations are estimates, including tick-boundary rounding. Manual CabalGate.executeSell uses a real positive minOut chosen by the visitor. No substitute router or new contract was introduced.

The interface does not run a delivery bot. Any wallet can use the deliver control, and external runners may do so. No automation service or automatic point recording is implied. Runtime reads poll every 15 seconds while visible. A real funded-wallet buy, verdict callback, delivery, objection or payout was not broadcast in this task. See `VALIDATION.md` for the checks and remaining coverage limits.

`DESIGN.md` describes the final implementation. Font and third-party licenses are retained in `web/public/fonts/` and `web/licenses/`.

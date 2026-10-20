import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
} from "viem";
const messages: Record<string, string> = {
  ERC20InsufficientAllowance:
    "The token approval is too small. Approve the amount shown, then try again.",
  ERC20InsufficientBalance:
    "There are not enough tokens in your wallet. Lower the amount or add test tokens.",
  SafeERC20FailedOperation:
    "The token transfer failed. Check your balance and approval, then try again.",
  RebalanceNotNeeded:
    "The buy wall has no work ready. Wait for more fees or a market move.",
  NoPrice:
    "No hourly snapshot price is available yet. Wait for trading to open and try again.",
  NotSeller:
    "Only the seller can send this action. Connect the wallet that wrote the plea.",
  NotDenied: "This plea was not denied. Refresh its status before appealing.",
  NothingToAppeal:
    "There is no eligible denied plea to appeal. Open your latest plea to check its state.",
  NotStale:
    "The deadline has not passed. Wait for the countdown to reach zero.",
  NotPending: "This request is no longer pending. Refresh its status.",
  AlreadySettled:
    "This escrow or stake has already been returned. Refresh its status.",
  NotRuled:
    "The objection has no ruling yet. Wait for the panel or expire it after the deadline.",
  SellerExcluded:
    "This seller cannot earn season points, so there is no eligible objection.",
  OwnerExcluded:
    "This wallet is excluded from season prizes. Use an eligible holder wallet.",
  SeasonClosed:
    "This season has already closed. Its points can no longer change.",
  SellsOnlyViaGate:
    "While the Cabal lives, sell through an approved plea. Open Plead to make your case.",
  ExactOutputBuyRefused:
    "Exact-output buys are unavailable while the Cabal lives. Use the exact-input Buy control.",
  PartialFill:
    "The pool could not fill the required trade. Lower the amount or refresh the quote.",
  RecipientRequired:
    "The buy needs your wallet as recipient. Reconnect in the top bar and try again.",
  AlreadySeeded:
    "Trading is already seeded. Refresh the page to see the open market.",
  OwnableUnauthorizedAccount:
    "This action needs the contract owner. Connect its owner wallet.",
  NotLauncher:
    "This action belongs to the launch contract. Use the Seed trading control.",
  HookNotDeployed:
    "The hook is not deployed yet. Wait for launch setup to complete.",
  LetterboxNotDeployed:
    "The Letterbox is not deployed yet. Wait for launch setup to complete.",
  TribunalNotDeployed:
    "The Tribunal is not deployed yet. Wait for launch setup to complete.",

  CannotPass:
    "This plea cannot pass: your need is above 45. Sell a smaller share or wait for your facts to improve.",
  Cooldown:
    "Your cooldown is still running. Wait until the time shown before sending another plea.",
  CabalNotWatching:
    "The Cabal is not taking pleas. Check whether trading has opened or the Cabal has died.",
  NotSeeded: "Trading is not open yet. Anyone may seed from the opening time.",
  PendingExists: "You already have an open plea. Open its status page first.",
  BadPleaText:
    "Your plea contains refused text. Fix the checks under the text box.",
  BadObjectionText:
    "Your objection contains refused text. Fix the checks under the text box.",
  AmountTooLarge: "The amount is over the limit. Reduce it or press Max.",
  AmountTooSmall:
    "The amount is below the minimum. Increase it to the minimum shown.",
  LetterTooLong:
    "The letter is over the byte limit. Shorten it until the byte counter passes.",
  LetterTooSmall:
    "The letter amount is too small. You need more PLEA to send a letter.",
  FeeTooHigh:
    "The fee would take too much PLEA. Try a larger eligible sale or wait for the snapshot price to improve.",
  TooSmallForTheFee:
    "The sale is too small to cover its fees. Increase the amount.",
  SlippageExceeded:
    "The price moved beyond your minimum. Refresh the quote or raise your slippage.",
  PriceMoved: "The price moved. Refresh the quote and try again.",
  WindowLapsed:
    "The sell window closed. The plea has lapsed; its points may still count.",
  NotApproved: "This plea is not approved. Check its current verdict.",
  UseLetterbox: "This plea is in escrow. Use Sell yourself on its status page.",
  AlreadyRecorded: "These points were already recorded. Refresh to see them.",
  Held: "Points are held while objections are open or a panel is pending. Wait for the window to end.",
  ObjectionSustained: "An objection was sustained. This plea earns no points.",
  WindowClosed: "The objection window closed. No fee was paid.",
  CaseClosed: "This case is closed. No more objections can be filed.",
  ObjectionPending: "Both objection slots are occupied. Wait for a ruling.",
  SameObjector:
    "You already objected to this plea. A different wallet must file the next objection.",
  NotEligible:
    "You cannot object to your own plea, or from an excluded wallet.",
  NameTaken: "That name belongs to another wallet. Choose another name.",
  BadName:
    "Use 3–20 lowercase letters, digits or underscores. Reserved names are refused.",
  AlreadyClaimed:
    "This allocation was already claimed. Check the recipient wallet.",
  InvalidProof:
    "This proof does not match the on-chain root. Use the published claims.json list.",
  RootNotSet:
    "The claim list is not open yet. The Merkle root has not been set.",
  NotReady: "The season cannot close yet. Wait until the grace period ends.",
  NotFinished:
    "The Cabal still lives or a season needs closing. Close the remaining seasons first.",
  NotOpen: "This escrow is no longer open. Refresh the plea.",
  NotSettleable: "This plea cannot be settled yet. Wait for its final state.",
  AlreadyAppealed: "This plea has already been appealed.",
  AppealClosed: "The appeal window closed. Wait for your next plea.",
  BuyTooLarge:
    "This buy exceeds the launch cap. Lower the amount or wait for the launch window to end.",
  NotEnoughGas:
    "The swap needs more gas for cashback. Retry with a fresh estimate.",
  CabalIsWatching: "While the Cabal lives, sell through an approved plea.",
  TooEarly: "Trading is not open yet. Wait until the start time shown.",
};
export function explainError(e: any, abis: Abi[] = []): string {
  if (e?.code === 4001 || /user rejected|user denied/i.test(e?.message || ""))
    return "You declined the wallet request. Nothing was sent; try again when ready.";
  if (
    /Connect in the top bar|Switch to Sepolia in the top bar/.test(
      e?.message || "",
    )
  )
    return e.message;
  let name = e?.data?.errorName;
  if (e instanceof BaseError) {
    const r = e.walk(
      (x) => x instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    name = r?.data?.errorName || name;
  }
  const seen = new Set();
  let node = e;
  for (let i = 0; i < 8 && node && !seen.has(node); i++) {
    seen.add(node);
    const data = typeof node.data === "string" ? node.data : node.data?.data;
    if (data?.startsWith("0x"))
      for (const abi of abis)
        try {
          name = decodeErrorResult({ abi, data }).errorName;
        } catch {}
    node = node.cause;
  }
  if (name && messages[name]) return messages[name];
  if (/insufficient funds/i.test(e?.message || ""))
    return "You need Sepolia ETH for gas and enough tokens for this action. Add test funds and try again.";
  return "The request could not complete. Refresh the chain data, check your wallet is on Sepolia, and try again. Nothing is confirmed until a receipt appears.";
}

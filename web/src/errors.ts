import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  parseAbi,
  type Abi,
} from "viem";
export const messages: Record<string, string> = {
  AlreadyBegun: "Trading has already begun. Refresh the market.",
  AlreadyConsumed: "This verdict was already used. Refresh the plea.",
  AlreadySet: "This setting is already configured.",
  AttestationExpired: "This signed verdict expired. Request a current verdict.",
  AttestationNotYetValid:
    "This verdict is not valid yet. Wait for its start time.",
  BadFlags: "This plea mode is not supported. Refresh the page.",
  BadSignature: "The panel signature could not be verified. Nothing was paid.",
  BelowAgreedMarketCap: "The pool must open at the agreed market cap.",
  BelowAgreedTiming: "The opening time cannot precede the agreed start.",
  CallbackNotExpected: "The pool callback was not expected. Refresh and retry.",
  ERC20InvalidApprover: "The token cannot approve this wallet.",
  ERC20InvalidReceiver: "The token cannot be sent to that recipient.",
  ERC20InvalidSender: "The token cannot be sent from that wallet.",
  ERC20InvalidSpender: "This token spender is not valid.",
  HookAlreadyDeployed: "The pool hook is already deployed.",
  HookDeployFailed:
    "The pool hook deployment failed. The launch owner must check setup.",
  InitializationRestrictedToHook:
    "Only the launch hook can initialize this pool.",
  InvalidLiquidity: "This liquidity amount is not valid. Lower the amount.",
  InvalidPool: "This pool does not match the launch. Refresh the deployment.",
  InvalidShortString: "This text cannot be encoded. Shorten it.",
  LetterboxAlreadyDeployed: "The Letterbox is already deployed.",
  LetterboxDeployFailed:
    "The Letterbox deployment failed. The launch owner must check setup.",
  LiquidityRestrictedToHook:
    "Only the launch hook can manage this pool liquidity.",
  MintOnMainnet: "Oracle fee minting is unavailable on this chain.",
  MintWithPoolImd: "Oracle fees must be bought using the configured fee token.",
  NotDeployTx: "This setup action is only available during deployment.",
  NotIntake: "Only the oracle Intake can call this action.",
  NotLetterbox: "Only the Letterbox can submit this escrowed plea.",
  NotPoolManager: "Only the pool manager can call this action.",
  NotTribunal: "Only the Tribunal can update these points.",
  OracleAssetMismatch: "The oracle fee token does not match the launch.",
  OracleAssetNotImd: "The oracle fee token is not supported.",
  OwnableInvalidOwner: "This owner address cannot be used.",
  ReentrancyGuardReentrantCall:
    "Another contract action is still in progress. Retry after it ends.",
  RootAlreadySet: "The claim list root is final and cannot change.",
  SafeCastOverflowedUintDowncast:
    "This amount exceeds the contract limit. Lower it.",
  ScoreOutOfRange: "The score is outside the judges\u2019 permitted range.",
  StringTooLong: "The text is too long. Shorten it.",
  StringsInsufficientHexLength:
    "This identifier cannot be encoded. Refresh it.",
  TooLate: "The deadline has passed. Refresh to see the next action.",
  TribunalAlreadyDeployed: "The Tribunal is already deployed.",
  TribunalDeployFailed:
    "The Tribunal deployment failed. The launch owner must check setup.",
  TribunalOff: "Objections are not configured for this launch.",
  UnexpectedLiquidityDelta:
    "The pool could not supply the expected liquidity. Lower the amount.",
  UnfundedStake:
    "The objection stake has not reached Seasons. Retry settlement.",
  UnknownRequest: "This oracle request is unknown. Check its plea number.",
  WrongAnswerType:
    "The oracle answer has the wrong format. No verdict was applied.",
  WrongFlags: "The pool hook flags do not match the launch.",
  WrongInitCode: "This contract build does not match the committed launch.",
  WrongPanel: "This verdict came from the wrong oracle panel.",
  ZeroAddress: "A required address is missing. Check the recipient.",
  ZeroRoot: "The claim list has not been configured.",
  ZeroSigner: "The oracle signer is not configured.",
  ZeroTiming: "The launch timing is not configured.",
  PriceLimitAlreadyExceeded:
    "The price moved past your limit. Nothing was bought; refresh the quote or raise slippage.",
  PriceLimitOutOfBounds:
    "This price limit is outside the pool range. Lower the amount.",
  PoolNotInitialized: "Trading is not open yet. Wait for the seed.",
  SwapAmountCannotBeZero: "Enter an amount greater than zero.",
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
  NotSeeded: "Trading is not open yet. Wait until the pool is seeded.",
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
    "The price fell since the hourly snapshot, so the fee needs more PLEA than its 10% margin. Nothing was paid; try again after the next snapshot or untick auto-sell.",
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
const poolErrors = parseAbi([
  "error WrappedError(address target,bytes4 selector,bytes reason,bytes details)",
  "error PriceLimitAlreadyExceeded(uint160 sqrtPriceCurrentX96,uint160 sqrtPriceLimitX96)",
  "error PriceLimitOutOfBounds(uint160 sqrtPriceLimitX96)",
  "error PoolNotInitialized()",
  "error SwapAmountCannotBeZero()",
]);
export function decodeCustomError(
  e: any,
  abis: Abi[] = [],
): { name: string; args?: any } | undefined {
  const seen = new Set<any>();
  function decode(data: any, depth = 0): any {
    if (depth > 8 || typeof data !== "string" || !data.startsWith("0x")) return;
    for (const abi of [poolErrors, ...abis])
      try {
        const result = decodeErrorResult({ abi, data: data as `0x${string}` });
        if (result.errorName === "WrappedError")
          return (
            decode(result.args?.[2], depth + 1) ||
            decode(result.args?.[3], depth + 1)
          );
        return { name: result.errorName, args: result.args };
      } catch {}
  }
  let node = e;
  for (let i = 0; i < 16 && node && !seen.has(node); i++) {
    seen.add(node);
    if (node.data?.errorName)
      return { name: node.data.errorName, args: node.data.args };
    const decoded =
      decode(typeof node.data === "string" ? node.data : node.data?.data) ||
      decode(node.error?.data);
    if (decoded) return decoded;
    node = node.cause || node.error;
  }
}
export function explainReadError(e: any) {
  if (
    e?.constructor === Error &&
    !/fetch|network|HTTP|timeout|RPC/i.test(e.message)
  )
    return e.message;
  return "The public RPC did not answer. The site tries the next one by itself; your funds are not affected.";
}
export type ErrorMap = Record<string, string | ((args: any) => string)>;
export function explainError(
  e: any,
  abis: Abi[] = [],
  overrides: ErrorMap = {},
): string {
  if (e?.code === 4001 || /user rejected|user denied/i.test(e?.message || ""))
    return "You declined the wallet request. Nothing was sent; try again when ready.";
  const decoded = decodeCustomError(e, abis);
  const override = decoded && overrides[decoded.name];
  if (decoded)
    return (
      (typeof override === "function" ? override(decoded.args) : override) ||
      messages[decoded.name] ||
      `The contract refused this action (${decoded.name}). Refresh its state before retrying.`
    );
  if (/insufficient funds/i.test(e?.message || ""))
    return "You need Sepolia ETH for gas and enough tokens for this action. Add test funds and try again.";
  if (e?.constructor === Error) return e.message;
  return "The transaction could not be simulated. Refresh the chain data and try again. Nothing was sent.";
}

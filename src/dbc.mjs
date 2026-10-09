import { createHash } from 'node:crypto';
import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, swapQuote, getBaseFeeHandler,
  DAMM_V2_MIGRATION_FEE_ADDRESS, deriveDammV2PoolAddress, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { ApiError } from './errors.mjs';

export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const DBC_SDK_VERSION = '1.5.13';
export const CLOCK_ADDRESS = 'SysvarC1ock11111111111111111111111111111111';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SYSVAR_PROGRAM = 'Sysvar1111111111111111111111111111111111111';
const MAX_U64 = (1n << 64n) - 1n;
const Q128 = 1n << 128n;
const FEE_DENOMINATOR = 1_000_000_000n;

// Only the SDK's account coder is used. This object has no transport, signer,
// wallet or transaction method. All actual reads pass through the injected RPC.
const coder = new DynamicBondingCurveClient(Object.freeze({ commitment: 'confirmed' }), 'confirmed').state.program.coder.accounts;
const invalid = (message = 'The account data could not be verified. No launch evidence was produced.') =>
  new ApiError(502, 'DBC_DATA_INVALID', message);
const integer = value => BigInt(value.toString(10));
const str = value => value.toString(10);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const key = value => value.toBase58();

export const DBC_EXAMPLES = Object.freeze([
  { id: '7chtSL1MVDZ3kMShbnWH8htZE5gayon4t4NMF21cKyqn', title: 'An active SOL launch',
    detail: 'A real mainnet example discovered 9 October 2026. Current state is fetched again; no endorsement.' },
  { id: '5ktYWjqP8xYTpsiATvUNgW3r62hc9Vg9uQHsjeayvDvo', title: 'A migrated launch',
    detail: 'Illustrates why a small remaining DBC reserve is not proof that graduation failed.' },
  { id: '6tdNjDNFzDdEuKyyvtKtke4Zuarp3MyZwCiERwTsq5Xg', title: 'A transfer-hook launch',
    detail: 'Inspect the configuration; the calculator abstains because external hook execution is not verified.' }
]);

export function validatePoolAddress(value) {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))
    throw new ApiError(400, 'INVALID_POOL_ADDRESS', 'Enter a full Solana pool address.');
  try { if (new PublicKey(value).toBase58() !== value) throw new Error(); }
  catch { throw new ApiError(400, 'INVALID_POOL_ADDRESS', 'Enter a full Solana pool address.'); }
  return value;
}

/** Exact decimal input. No Number conversion, exponent syntax or hidden rounding. */
export function parseTokenAmount(value, decimals) {
  if (typeof value !== 'string' || value.length > 60 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value))
    throw new ApiError(400, 'INVALID_QUOTE_AMOUNT', 'Use a positive decimal amount, without commas or exponent notation.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw invalid();
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new ApiError(400, 'QUOTE_PRECISION', `This quote token supports ${decimals} decimal places.`);
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (result <= 0n || result > MAX_U64) throw new ApiError(400, 'QUOTE_RANGE', 'The amount must fit a positive unsigned 64-bit token balance.');
  return result;
}

export function formatTokenAmount(raw, decimals) {
  const value = BigInt(raw);
  if (value < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 60) throw invalid();
  if (!decimals) return value.toString();
  const padded = value.toString().padStart(decimals + 1, '0');
  return `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`.replace(/\.?0+$/, '');
}

/** Display-only ratio, rounded down. Exact numerator/denominator are also exported. */
export function decimalRatio(numerator, denominator, places = 18) {
  const n = BigInt(numerator), d = BigInt(denominator);
  if (n < 0n || d <= 0n || !Number.isInteger(places) || places < 0 || places > 60) throw invalid();
  return formatTokenAmount(n * 10n ** BigInt(places) / d, places);
}

function accountBytes(account, expectedOwner, minLength, maxLength, label) {
  if (!account) throw new ApiError(404, 'DBC_ACCOUNT_NOT_FOUND', `${label} was not found at the requested mainnet context.`);
  if (account.owner !== expectedOwner || account.executable !== false) throw new ApiError(422, 'DBC_WRONG_OWNER', `${label} is not owned by the expected program.`);
  if (!Array.isArray(account.data) || account.data.length !== 2 || account.data[1] !== 'base64'
      || typeof account.data[0] !== 'string' || account.data[0].length > Math.ceil(maxLength / 3) * 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(account.data[0])) throw invalid();
  const bytes = Buffer.from(account.data[0], 'base64');
  if (bytes.length < minLength || bytes.length > maxLength || bytes.toString('base64') !== account.data[0]) throw invalid();
  if (account.space !== undefined && account.space !== bytes.length) throw invalid();
  return bytes;
}

function decodePool(account) {
  const bytes = accountBytes(account, DBC_PROGRAM, 424, 424, 'Pool');
  for (const type of ['virtualPool', 'transferHookPool']) {
    try {
      const decoded = coder.decode(type, bytes);
      const state = decoded.poolState;
      if (![0, 1].includes(state.isMigrated) || ![0, 1].includes(state.hasSwap)
          || state.migrationProgress > 3 || integer(state.sqrtPrice) <= 0n) throw invalid();
      return { type, decoded, state, bytes };
    } catch (error) { if (error instanceof ApiError) throw error; }
  }
  throw new ApiError(422, 'NOT_DBC_POOL', 'The address is not a supported Meteora DBC pool account.');
}

function decodeConfig(account, poolType) {
  const hook = poolType === 'transferHookPool';
  const bytes = accountBytes(account, DBC_PROGRAM, hook ? 1128 : 1048, hook ? 1128 : 1048, 'Pool configuration');
  let decoded;
  try { decoded = coder.decode(hook ? 'configWithTransferHook' : 'poolConfig', bytes); }
  catch { throw new ApiError(422, 'NOT_DBC_CONFIG', 'The pool configuration has an unsupported discriminator or layout.'); }
  const config = hook ? decoded.config : decoded;
  if (![0, 1].includes(config.activationType) || ![0, 1].includes(config.collectFeeMode)
      || ![0, 1].includes(config.migrationOption) || ![0, 1].includes(config.tokenType)
      || config.tokenDecimal > 18 || integer(config.migrationQuoteThreshold) <= 0n
      || integer(config.sqrtStartPrice) <= 0n || integer(config.migrationSqrtPrice) <= 0n
      || ![0, 1, 2].includes(config.poolFees.baseFee.baseFeeMode)
      || integer(config.poolFees.baseFee.cliffFeeNumerator) >= FEE_DENOMINATOR) throw invalid();
  return { config, bytes, transferHookProgram: hook ? key(decoded.transferHookProgram) : null };
}

function decodeMint(account, address) {
  if (![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(account?.owner))
    throw new ApiError(422, 'NOT_TOKEN_MINT', 'The referenced token mint has an unsupported owner.');
  const token2022 = account.owner === TOKEN_2022_PROGRAM;
  const bytes = accountBytes(account, account.owner, 82, token2022 ? 4096 : 82, 'Token mint');
  const mintAuthorityFlag = bytes.readUInt32LE(0), freezeAuthorityFlag = bytes.readUInt32LE(46);
  if (bytes[45] !== 1 || bytes[44] > 18 || ![0, 1].includes(mintAuthorityFlag) || ![0, 1].includes(freezeAuthorityFlag)) throw invalid();
  const decimals = bytes[44];
  return { mint: address, symbol: address === 'So11111111111111111111111111111111111111112' ? 'SOL'
    : address === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 'USDC' : null,
    decimals, supplyRaw: bytes.readBigUInt64LE(36).toString(), supply: formatTokenAmount(bytes.readBigUInt64LE(36), decimals),
    mintAuthority: mintAuthorityFlag ? new PublicKey(bytes.subarray(4, 36)).toBase58() : null,
    freezeAuthority: freezeAuthorityFlag ? new PublicKey(bytes.subarray(50, 82)).toBase58() : null,
    program: token2022 ? 'Token-2022' : 'SPL Token', extensionsPresent: bytes.length > 82,
    accountHash: sha256(bytes) };
}

function decodeClock(account) {
  const bytes = accountBytes(account, SYSVAR_PROGRAM, 40, 40, 'Clock');
  const slot = bytes.readBigUInt64LE(0), unixTimestamp = bytes.readBigInt64LE(32);
  if (unixTimestamp < 0n || unixTimestamp > 253402300799n || slot > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  return { slot: slot.toString(), unixTimestamp: unixTimestamp.toString(), hash: sha256(bytes) };
}

function price(sqrtPrice, baseDecimals, quoteDecimals) {
  const sqrt = integer(sqrtPrice);
  const numerator = sqrt * sqrt * 10n ** BigInt(baseDecimals);
  const denominator = Q128 * 10n ** BigInt(quoteDecimals);
  let places = 18;
  // Never turn a positive tiny price into an apparent free token. Keep ordinary
  // values compact; retain extra decimal places only when 18 would underflow.
  if (numerator > 0n && numerator * 10n ** 18n < denominator) {
    while (places < 54 && numerator * 10n ** BigInt(places) < denominator) places++;
    places += 6;
  }
  return { value: decimalRatio(numerator, denominator, places), numerator: numerator.toString(), denominator: denominator.toString() };
}

function ratioPercent(numerator, denominator) { return decimalRatio(BigInt(numerator) * 100n, denominator, 4); }
const finding = (code, severity, title, detail) => ({ code, severity, title, detail });

/** Decode a single coherent getMultipleAccounts response. Also used by exact captured-fixture tests. */
export function buildDbcBrief({ poolAddress, configAddress, baseMintAddress, quoteMintAddress, result, provenance,
  quoteAmount = '0.1', slippageBps = 50 }) {
  for (const address of [poolAddress, configAddress, baseMintAddress, quoteMintAddress]) validatePoolAddress(address);
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500) throw new ApiError(400, 'INVALID_SLIPPAGE', 'The read-only quote tolerance must be between 0 and 500 bps.');
  if (!result || !Number.isSafeInteger(result.context?.slot) || result.context.slot < 0
      || !Array.isArray(result.value) || result.value.length !== 5) throw invalid();
  if (!provenance || provenance.network !== 'mainnet-beta' || provenance.genesisHash !== MAINNET_GENESIS
      || !['live', 'recorded'].includes(provenance.mode) || !Number.isFinite(Date.parse(provenance.fetchedAt))) throw invalid('A mainnet source, observation time and live/recorded mode are required.');
  const [poolAccount, configAccount, baseAccount, quoteAccount, clockAccount] = result.value;
  const { type, decoded, state, bytes: poolBytes } = decodePool(poolAccount);
  const { config, bytes: configBytes, transferHookProgram } = decodeConfig(configAccount, type);
  if (key(state.config) !== configAddress || key(state.baseMint) !== baseMintAddress || key(config.quoteMint) !== quoteMintAddress)
    throw new ApiError(409, 'DBC_SNAPSHOT_CHANGED', 'Referenced accounts changed while loading. Refresh to obtain a coherent evidence bundle.');
  if (deriveDbcPoolAddress(new PublicKey(quoteMintAddress), new PublicKey(baseMintAddress), new PublicKey(configAddress)).toBase58() !== poolAddress)
    throw invalid('The account address does not match the DBC pool derived from its mints and configuration.');
  const base = decodeMint(baseAccount, baseMintAddress), quoteToken = decodeMint(quoteAccount, quoteMintAddress);
  if (base.decimals !== config.tokenDecimal || (config.tokenType === 0) !== (base.program === 'SPL Token')) throw invalid();
  const clock = decodeClock(clockAccount);
  if (BigInt(clock.slot) > BigInt(result.context.slot)) throw invalid();
  const currentPoint = new BN(config.activationType === 0 ? clock.slot : clock.unixTimestamp);
  const activated = currentPoint.gte(state.activationPoint);
  const inputRaw = parseTokenAmount(quoteAmount, quoteToken.decimals);
  const threshold = integer(config.migrationQuoteThreshold), reserve = integer(state.quoteReserve);
  const graduated = state.isMigrated === 1;
  const complete = reserve >= threshold || integer(state.finishCurveTimestamp) > 0n || state.migrationProgress > 0;
  const remaining = graduated || complete ? 0n : threshold - reserve;
  const status = graduated ? 'Migrated' : complete ? 'Curve complete · migration pending' : activated ? 'Bonding curve active' : 'Not active yet';
  const currentPrice = price(state.sqrtPrice, base.decimals, quoteToken.decimals);
  const startPrice = price(config.sqrtStartPrice, base.decimals, quoteToken.decimals);
  const migrationPrice = price(config.migrationSqrtPrice, base.decimals, quoteToken.decimals);
  let previous = integer(config.sqrtStartPrice), endSeen = false;
  const segments = [];
  for (const point of config.curve) {
    const sqrt = integer(point.sqrtPrice), liquidity = integer(point.liquidity);
    if (sqrt === 0n && liquidity === 0n) { endSeen = true; continue; }
    if (endSeen || sqrt <= previous || liquidity <= 0n) throw invalid('The configured curve has an unsupported segment order.');
    const p = price(point.sqrtPrice, base.decimals, quoteToken.decimals);
    segments.push({ index: segments.length + 1, price: p.value, sqrtPriceRaw: sqrt.toString(), liquidityRaw: liquidity.toString(),
      active: integer(state.sqrtPrice) >= previous && integer(state.sqrtPrice) < sqrt });
    previous = sqrt;
  }
  if (!segments.length) throw invalid();
  const baseFee = config.poolFees.baseFee;
  const feeHandler = getBaseFeeHandler(baseFee.cliffFeeNumerator, baseFee.firstFactor, baseFee.secondFactor, baseFee.thirdFactor, baseFee.baseFeeMode);
  const firstSwapMinimum = config.enableFirstSwapWithMinFee === 1 && state.hasSwap === 0;
  let baseBps = null;
  try {
    if (activated) baseBps = decimalRatio(integer(firstSwapMinimum ? feeHandler.getMinBaseFeeNumerator()
      : feeHandler.getBaseFeeNumeratorFromIncludedFeeAmount(currentPoint,
        state.activationPoint, 1, new BN(inputRaw.toString()))) * 10_000n, FEE_DENOMINATOR, 5);
  } catch { /* Unsupported fee math is exposed as unavailable, never guessed. */ }
  const locks = {
    partnerPermanentPercent: config.partnerPermanentLockedLiquidityPercentage,
    creatorPermanentPercent: config.creatorPermanentLockedLiquidityPercentage,
    partnerUnlockedPercent: config.partnerLiquidityPercentage,
    creatorUnlockedPercent: config.creatorLiquidityPercentage,
    partnerVestedPercent: config.partnerLiquidityVestingInfo.vestingPercentage,
    creatorVestedPercent: config.creatorLiquidityVestingInfo.vestingPercentage
  };
  let targetPool = null;
  if (config.migrationOption === 1 && config.migrationFeeOption >= 0 && config.migrationFeeOption < DAMM_V2_MIGRATION_FEE_ADDRESS.length)
    targetPool = deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption], new PublicKey(baseMintAddress), new PublicKey(quoteMintAddress)).toBase58();
  const findings = [];
  const clockAgeSeconds = Math.floor(Date.parse(provenance.fetchedAt) / 1000) - Number(clock.unixTimestamp);
  if (clockAgeSeconds > 120) findings.push(finding('STALE_CHAIN_CLOCK', 'attention', 'Chain observation may be stale',
    `The captured chain Clock trails the response observation by ${clockAgeSeconds} seconds. Request a fresh snapshot before interpreting it as current.`));
  if (graduated) findings.push(finding('MIGRATED', 'info', 'DBC trading has ended', 'The pool migration flag is set. A residual DBC reserve is not current DAMM liquidity. Inspect the derived destination separately.'));
  else if (complete) findings.push(finding('MIGRATION_PENDING', 'attention', 'Completion is not migration', 'The curve is complete, but the migration flag is not set. No completion time or destination liquidity is promised.'));
  else findings.push(finding('THRESHOLD_NOT_REACHED', 'info', 'Threshold still ahead', `${formatTokenAmount(remaining, quoteToken.decimals)} quote tokens remain to the configured reserve threshold at this snapshot. Future movement is not predicted.`));
  if (!activated) findings.push(finding('NOT_ACTIVE', 'attention', 'Activation is in the future', 'The on-chain Clock has not reached the configured activation point. The calculator abstains.'));
  if (transferHookProgram) findings.push(finding('TRANSFER_HOOK', 'attention', 'External transfer hook', 'A separate program can affect transfer behavior. Its execution is outside this evidence brief; no executable quote is inferred.'));
  if (base.mintAuthority) findings.push(finding('MINT_AUTHORITY', 'attention', 'Mint authority remains', 'The mint account still has a mint authority. This is an observed permission, not evidence of malicious use.'));
  if (base.freezeAuthority) findings.push(finding('FREEZE_AUTHORITY', 'attention', 'Freeze authority remains', 'The mint account still has a freeze authority. This brief does not determine whether it will be exercised.'));
  if (config.poolFees.dynamicFee.initialized) findings.push(finding('DYNAMIC_FEE', 'info', 'Fees can vary', 'Dynamic fees depend on the captured volatility state. A later quote can differ.'));
  findings.push(finding('CONFIGURED_LOCKS', 'info', 'Liquidity split is configuration evidence', 'Configured permanent, vested and unlocked shares do not verify ownership or balances in the destination pool.'));
  const refusal = graduated || complete ? 'DBC curve trading has ended; quote the destination AMM separately.'
    : !activated ? 'The pool has not activated.' : transferHookProgram ? 'External transfer-hook execution is not verified.'
    : base.program !== 'SPL Token' || quoteToken.program !== 'SPL Token' ? 'Token-2022 behavior is not simulated by this calculator.' : null;
  let quote = { status: 'unavailable', reason: refusal, inputAmount: formatTokenAmount(inputRaw, quoteToken.decimals), inputRaw: inputRaw.toString(),
    slippageBps, direction: 'quote-to-base', simulation: true, method: `Meteora SDK ${DBC_SDK_VERSION} swapQuote`,
    note: 'Local mathematical scenario on captured accounts. No transaction simulation, signing, broadcast or execution.' };
  if (!refusal) {
    try {
      const q = swapQuote(decoded, config, false, new BN(inputRaw.toString()), slippageBps, false, currentPoint,
        firstSwapMinimum);
      const feeRaw = integer(q.tradingFee) + integer(q.protocolFee) + integer(q.referralFee);
      const feeDecimals = config.collectFeeMode === 0 ? quoteToken.decimals : base.decimals;
      quote = { ...quote, status: 'available', reason: null, outputRaw: str(q.outputAmount), outputAmount: formatTokenAmount(str(q.outputAmount), base.decimals),
        minimumOutputRaw: str(q.minimumAmountOut), minimumOutputAmount: formatTokenAmount(str(q.minimumAmountOut), base.decimals),
        actualInputRaw: str(q.actualInputAmount), actualInputAmount: formatTokenAmount(str(q.actualInputAmount), quoteToken.decimals),
        feeRaw: feeRaw.toString(), feeAmount: formatTokenAmount(feeRaw, feeDecimals), feeToken: config.collectFeeMode === 0 ? 'quote' : 'base',
        tradingFeeRaw: str(q.tradingFee), protocolFeeRaw: str(q.protocolFee), referralFeeRaw: str(q.referralFee),
        nextPrice: price(q.nextSqrtPrice, base.decimals, quoteToken.decimals).value };
    } catch {
      quote.reason = 'The SDK could not quote this amount on the captured curve. It may exceed remaining liquidity or an SDK constraint.';
    }
  }
  const hashes = [
    { role: 'pool', address: poolAddress, sha256: sha256(poolBytes) },
    { role: 'config', address: configAddress, sha256: sha256(configBytes) },
    { role: 'base-mint', address: baseMintAddress, sha256: base.accountHash },
    { role: 'quote-mint', address: quoteMintAddress, sha256: quoteToken.accountHash },
    { role: 'clock', address: CLOCK_ADDRESS, sha256: clock.hash }
  ];
  return { version: 1, type: 'dbc-launch', pool: { id: poolAddress, config: configAddress, creator: key(state.creator),
    baseMint: baseMintAddress, quoteMint: quoteMintAddress, accountType: type, transferHookProgram, derivedAddressVerified: true }, tokens: { base, quote: quoteToken },
    reserves: { baseRaw: str(state.baseReserve), quoteRaw: str(state.quoteReserve), base: formatTokenAmount(str(state.baseReserve), base.decimals), quote: formatTokenAmount(reserve, quoteToken.decimals) },
    migration: { status, target: config.migrationOption === 1 ? 'DAMM v2' : 'DAMM v1 (legacy)', targetPool,
      targetVerified: false, graduated, curveComplete: complete, flag: state.isMigrated, progressFlag: state.migrationProgress,
      thresholdRaw: threshold.toString(), threshold: formatTokenAmount(threshold, quoteToken.decimals),
      remainingRaw: remaining.toString(), remaining: formatTokenAmount(remaining, quoteToken.decimals),
      progressPercent: graduated || complete ? '100' : ratioPercent(reserve, threshold),
      finishCurveTimestamp: str(state.finishCurveTimestamp), migrationFeePercent: config.migrationFeePercentage,
      protocolLiquidityMigrationFeeBps: state.protocolLiquidityMigrationFeeBps, configuredLiquidity: locks },
    fees: { mode: ['Fixed / linear schedule', 'Exponential schedule', 'Rate limiter (legacy)'][baseFee.baseFeeMode],
      baseBps, baseLabel: 'Current base fee for the entered quote-token input',
      cliffBps: decimalRatio(integer(baseFee.cliffFeeNumerator) * 10_000n, FEE_DENOMINATOR, 5),
      dynamicEnabled: config.poolFees.dynamicFee.initialized === 1, creatorSharePercent: config.creatorTradingFeePercentage,
      collectedIn: config.collectFeeMode === 0 ? 'quote token' : 'output token',
      destinationBps: config.migrationFeeOption === 6 ? String(config.migratedPoolFeeBps) : String([25, 30, 100, 200, 400, 600][config.migrationFeeOption] ?? 'unknown'),
      feeClaimer: key(config.feeClaimer) },
    curve: { currentPrice: currentPrice.value, startPrice: startPrice.value, migrationPrice: migrationPrice.value,
      priceUnit: 'quote tokens per base token', exactPrice: { numerator: currentPrice.numerator, denominator: currentPrice.denominator },
      displayRounding: 'down to 18 decimal places; more for positive values that would round to zero', sqrtPriceRaw: str(state.sqrtPrice), segments,
      activation: { type: config.activationType === 0 ? 'slot' : 'unix timestamp', point: str(state.activationPoint), currentPoint: currentPoint.toString(), active: activated } },
    quote, findings, provenance: { ...provenance, slot: result.context.slot, commitment: 'confirmed',
      method: 'getMultipleAccounts', clockSlot: clock.slot, clockUnixTimestamp: clock.unixTimestamp, clockAgeSeconds,
      program: DBC_PROGRAM, decoder: `Meteora DBC SDK ${DBC_SDK_VERSION}`, hashes,
      snapshotHash: sha256(Buffer.from(JSON.stringify(hashes))),
      scope: 'Five accounts from one RPC context. Configuration and arithmetic do not prove asset safety, future price, users or destination liquidity.' } };
}

/** Injectable Solami RPC object. There is deliberately no public RPC fallback. */
export function createDbcService({ rpc } = {}) {
  const call = typeof rpc === 'function' ? rpc : rpc?.rpc?.bind(rpc);
  if (!call) throw new TypeError('An injected read-only RPC service is required.');
  return {
    async brief(poolAddress, { refresh = false, quoteAmount = '0.1' } = {}) {
      validatePoolAddress(poolAddress);
      if (typeof quoteAmount !== 'string' || quoteAmount.length > 60 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(quoteAmount))
        throw new ApiError(400, 'INVALID_QUOTE_AMOUNT', 'Use a positive decimal amount, without commas or exponent notation.');
      if (/^0(?:\.0+)?$/.test(quoteAmount)) throw new ApiError(400, 'QUOTE_RANGE', 'Use a positive amount for the mathematical scenario.');
      const opts = { encoding: 'base64', commitment: 'confirmed' };
      const first = await call('getAccountInfo', [poolAddress, opts], { refresh });
      if (!Number.isSafeInteger(first.result?.context?.slot)) throw invalid();
      const initialPool = decodePool(first.result.value);
      const configAddress = key(initialPool.state.config), baseMintAddress = key(initialPool.state.baseMint);
      const second = await call('getAccountInfo', [configAddress, { ...opts, minContextSlot: first.result.context.slot }], { refresh });
      if (!Number.isSafeInteger(second.result?.context?.slot) || second.result.context.slot < first.result.context.slot) throw invalid();
      const initialConfig = decodeConfig(second.result.value, initialPool.type);
      const quoteMintAddress = key(initialConfig.config.quoteMint);
      const final = await call('getMultipleAccounts', [[poolAddress, configAddress, baseMintAddress, quoteMintAddress, CLOCK_ADDRESS],
        { ...opts, minContextSlot: second.result.context.slot }], { refresh });
      if (final.result?.context?.slot < second.result.context.slot) throw invalid();
      return buildDbcBrief({ poolAddress, configAddress, baseMintAddress, quoteMintAddress, result: final.result,
        provenance: final.provenance, quoteAmount });
    }
  };
}

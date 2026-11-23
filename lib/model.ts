// Token Radar's model: one sealed snapshot in, one ranked board out.
//
// The board ranks pre-token protocols by an implied value that comes only from the snapshot's own
// figures. No protocol name is ever special-cased: one function scores every row.
//
//   multiple     = the category's market multiple: the median market-cap / TVL of the launched
//                  (token already trades) protocols in that category, from this snapshot alone.
//                  A category with fewer than 3 launched peers uses the global median instead.
//                  Multiples are clamped to [0.03, 1.50] so one odd peer cannot warp a category.
//   growth       = clamp(change_7d, -60, 120) per cent; growthMult = 1 + growth/100 x 0.5
//   maturity     = 0.6 + min(age_days, 1095) / 1095 x 0.4 (age unknown: 365 days)
//   implied      = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The board covers every slug on the snapshot's watchlist (the floor, never the ceiling) and adds
// the early radar: pre-token protocols below the floor, by TVL. A row is rankable only when it
// records no token AND is not a wrapped, staked or bridged product of a token that already trades:
// the watchlist's own rule (excluded categories, versioned names, wrapped/staked words, exchange
// names) is applied to the early rows too, so every ranked row is a genuine pre-token subject.
// Live-token protocols are kept apart in their own view with the market's own values, never mixed
// into the ranking. "Records no token" is DefiLlama's record, never proof a protocol has none.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_min: number;
  multiple_max: number;
  multiple_min_peers: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_min: 0.03,
  multiple_max: 1.5,
  multiple_min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    multiple_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the farm plan is generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  chain_count: number;
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  multiple_peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  chain_count: number;
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's market multiple, as the dashboard's model table shows it. */
export interface MultipleRow {
  category: string;
  multiple: number;
  peers: number;
  fallback: boolean;
}

/** Everything the dashboard needs: the board, the live set, the multiples and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  multiples: MultipleRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Every category's market multiple, from the snapshot's launched protocols alone: for each
 * category, the median market-cap / TVL of its protocols whose token already trades (and whose
 * market cap and TVL are both recorded), excluding CEX. A category with fewer than
 * `multiple_min_peers` launched peers falls back to the global median across all categories.
 * Every multiple is clamped to [multiple_min, multiple_max].
 */
export function categoryMultiples(
  protocols: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): { byCategory: Map<string, { multiple: number; peers: number; fallback: boolean }>; global: number } {
  const perCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const key = p.category ?? '(no category)';
    const list = perCategory.get(key) ?? [];
    list.push(ratio);
    perCategory.set(key, list);
    all.push(ratio);
  }
  const globalRaw = median(all) ?? 0.2;
  const global = Math.min(model.multiple_max, Math.max(model.multiple_min, globalRaw));
  const byCategory = new Map<string, { multiple: number; peers: number; fallback: boolean }>();
  for (const [category, ratios] of perCategory) {
    if (ratios.length >= model.multiple_min_peers) {
      const m = median(ratios) ?? globalRaw;
      byCategory.set(category, {
        multiple: Math.min(model.multiple_max, Math.max(model.multiple_min, m)),
        peers: ratios.length,
        fallback: false,
      });
    }
  }
  return { byCategory, global };
}

/** A protocol's category multiple: its category's, or the global one when it has too few peers. */
export function multipleFor(
  category: string | null,
  multiples: { byCategory: Map<string, { multiple: number; peers: number; fallback: boolean }>; global: number },
): { multiple: number; peers: number; fallback: boolean } {
  const key = category ?? '(no category)';
  const hit = multiples.byCategory.get(key);
  if (hit !== undefined) return hit;
  return { multiple: multiples.global, peers: 0, fallback: true };
}

/** The multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, { multiple: number; peers: number; fallback: boolean }>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; peers: number; fallback: boolean; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, peers, fallback } = multipleFor(protocol.category, multiples);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, peers, fallback, growthPct, growthMult, maturityMult, age };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are wrapped, staked or bridged products of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names: a protocol beginning with one is the exchange's own product. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** A whole word that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades, by the watchlist's own rule.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== null &&
    !PRODUCT_CATEGORIES.has(p.category) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_NAME.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the position open so it earns interest.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the LP position open.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC into ${chain} through ${name} and use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then leave it to settle.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the whole season.`;
  if (c.includes('stable') || c.includes('algo')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa') || c.includes('reserve')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it in your wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('launchpad')) return `Stake $${capital} to join ${name}'s next allocation round on ${chain} and claim only from its own page.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $${capital} through ${name} on ${chain} and keep the receipts for the activity record.`;
  if (c.includes('synthetic') || c.includes('basis')) return `Mint $${capital} of the synthetic asset on ${name} and hold the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-specific action for the weekly step, so the plan is not one move repeated. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) return `Swap $25 through ${name} on ${chain} once a week to keep trading volume on your wallet.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $20 against your deposit on ${name} once a week, then repay it the same day.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $25 to ${chain} through ${name} once a week and bring it back the same day.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close and reopen a $25 position on ${name} once a week to keep activity fresh.`;
  if (c.includes('prediction')) return `Place one $10 market position on ${name} each week and let it settle.`;
  return `Make one qualifying action each week on ${name}, such as a deposit, a swap, a vote or a claim.`;
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, chain),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text:
        secondChain === null
          ? `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`
          : `Repeat the same position on ${secondChain} with $25 so the wallet is active on two chains.`,
      cost: secondChain === null ? `the $${capital} stays in the position` : '$25 of capital and about $3 of gas',
      time: secondChain === null ? `${hold} days` : '15 minutes',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot, count: number): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, count)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains.slice(0, 3),
      chain_count: p.chains.length,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains.slice(0, 3),
    chain_count: row.chains.length,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    multiple_peers: row.model.multiple_peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n and strictly falling values. */
export function buildBoard(
  snapshot: Snapshot,
  multiples: { byCategory: Map<string, { multiple: number; peers: number; fallback: boolean }>; global: number },
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Ranks 1..n, implied values strictly falling: a tie is broken by one dollar so the board is a
  // ranking, not a list of equal values.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    const implied = Math.min(s.implied, prev - 1);
    prev = Math.max(1, implied);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: Math.max(1, implied),
      model: {
        category_multiple: s.multiple,
        multiple_peers: s.peers,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const multiples = categoryMultiples(snapshot.protocols, model);
  const board = buildBoard(snapshot, multiples, model);
  const live = liveRows(snapshot, 24);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const multiplesTable: MultipleRow[] = [...multiples.byCategory.entries()]
    .map(([category, v]) => ({ category, multiple: v.multiple, peers: v.peers, fallback: false }))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: multiples.global,
    multiples: multiplesTable,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
/** The dashboard's data, as compact arrays with lookup tables, so the dossier's text cap holds
 *  the whole page source: a board row is [rank, slug, name, category, chains, chain_count, tvl,
 *  change_7d, age_days, implied, multiple, peers, growth_multiplier, maturity_multiplier], a
 *  live row is [slug, name, category, chains, chain_count, tvl, change_7d, mcap] and a multiple
 *  is [category, multiple, peers], where category and chains are indexes into the tables (-1 for
 *  no category). The page expands them back into named fields on load, so the table, the detail
 *  view and the recompute read the same numbers board.json carries. */
export function dataScript(radar: RadarData): string {
  const cats = [...new Set([...radar.rows, ...radar.live].map((r) => r.category).concat(radar.multiples.map((m) => m.category)))].filter((c): c is string => c !== null).sort();
  const chains = [...new Set([...radar.rows, ...radar.live].flatMap((r) => r.chains))].sort();
  const catIndex = (c: string | null): number => (c === null ? -1 : cats.indexOf(c));
  const chainIndex = (c: string): number => chains.indexOf(c);
  const data = {
    as_of: radar.as_of,
    floor_usd: radar.floor_usd,
    model_version: radar.model_version,
    model: radar.model,
    global_multiple: radar.global_multiple,
    watchlist_size: radar.watchlist_size,
    board_size: radar.board_size,
    early_size: radar.early_size,
    live_size: radar.live_size,
    categories: cats,
    chains,
    multiples: radar.multiples.map((m) => [catIndex(m.category), m.multiple, m.peers]),
    rows: radar.rows.map((r) => [
      r.rank, r.slug, r.name, catIndex(r.category), r.chains.map(chainIndex), r.chain_count,
      r.tvl_usd, r.change_7d, r.age_days, r.implied_value_usd, r.category_multiple,
      r.multiple_peers, r.growth_multiplier, r.maturity_multiplier,
    ]),
    live: radar.live.map((r) => [
      r.slug, r.name, catIndex(r.category), r.chains.map(chainIndex), r.chain_count,
      r.tvl_usd, r.change_7d, r.mcap_usd,
    ]),
  };
  return `window.RADAR=${JSON.stringify(data)};\n`;
}

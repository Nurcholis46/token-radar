// lib/model.test.ts — the ranking model's own test suite (Node 22, standard library only).
//
// Every pinned number below was computed by hand, not copied from the implementation: the
// fixture expectations were worked out independently, and the board checks recompute
// board.json from each row's own figures, so a drift in the model fails here first.
//
// Run: `node --test lib/model.test.ts` (or `npm test`).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MODEL,
  ageDays,
  boardIssue,
  buildBoard,
  buildRadar,
  categoryMultiples,
  dataScript,
  farmSteps,
  impliedValue,
  isPreToken,
  isRankable,
  liveRows,
  multipleFor,
  parseSnapshot,
  stepText,
  type BoardRow,
  type Snapshot,
  type SnapshotProtocol,
} from './model.ts';

/** A protocol record: the fields a test sets, the rest a harmless default. */
function protocol(partial: Partial<SnapshotProtocol> & { slug: string; name: string }): SnapshotProtocol {
  return {
    category: null,
    chains: ['Ethereum'],
    tvl_usd: 1_000_000,
    change_7d: null,
    mcap_usd: null,
    listed_at: null,
    gecko_id: null,
    symbol: null,
    ...partial,
  };
}

/** The sealed snapshot's watchlist: all 40 slugs the board must cover. */
const WATCHLIST = [
  'armitage-by-wintermute', 'axis', 'b14g', 'bittensor-dtao', 'clearstar', 'curvance',
  'doppler-finance', 'ember', 'firelight', 'galaxy-curation', 'gami-labs', 'gauntlet',
  'hive-protocol', 'hyperithm', 'infinifi', 'k3-capital', 'keyrock', 'lagoon',
  'lightning-network', 'lofty', 'mezo-earn', 'noble', 'nonce-capital', 'onre', 'opentrade',
  'plume-vaults', 'r25', 'reti-pooling', 'rockawayx', 'saturn', 'steakhouse-financial',
  'symbiotic', 'tori-finance', 'tulipa-capital', 'tydro', 'upshift', 'usdd', 'valos',
  'veda', 'yuzu-money',
];

/**
 * A small snapshot whose every multiple is known by hand. Launched ratios:
 * Lending 0.4 / 0.5 / 0.6 (median 0.5), DEXes 0.1 / 0.9 (too few peers: fallback),
 * Yield 0.8 / 1.0 / 1.2 plus the live token below the floor at a tiny ratio
 * (median 0.9 across its 4 launched peers), one uncategorised launched ratio 0.7
 * and one Oracles launched ratio 0.7. Global median of the 11 launched non-CEX
 * ratios is 0.7.
 */
const FIXTURE: Snapshot = {
  as_of: '2026-11-14',
  source: 'test fixture',
  floor_usd: 50_000_000,
  protocols: [
    protocol({ slug: 'lend-a', name: 'Lend A', category: 'Lending', tvl_usd: 1000, mcap_usd: 400, gecko_id: 'lend-a', symbol: 'LA' }),
    protocol({ slug: 'lend-b', name: 'Lend B', category: 'Lending', tvl_usd: 1000, mcap_usd: 500, gecko_id: 'lend-b', symbol: 'LB' }),
    protocol({ slug: 'lend-c', name: 'Lend C', category: 'Lending', tvl_usd: 1000, mcap_usd: 600, gecko_id: 'lend-c', symbol: 'LC' }),
    protocol({ slug: 'dex-a', name: 'Dex A', category: 'DEXes', tvl_usd: 1000, mcap_usd: 100, gecko_id: 'dex-a', symbol: 'DA' }),
    protocol({ slug: 'dex-b', name: 'Dex B', category: 'DEXes', tvl_usd: 1000, mcap_usd: 900, gecko_id: 'dex-b', symbol: 'DB' }),
    protocol({ slug: 'yield-a', name: 'Yield A', category: 'Yield', tvl_usd: 1000, mcap_usd: 800, gecko_id: 'yield-a', symbol: 'YA' }),
    protocol({ slug: 'yield-b', name: 'Yield B', category: 'Yield', tvl_usd: 1000, mcap_usd: 1000, gecko_id: 'yield-b', symbol: 'YB' }),
    protocol({ slug: 'yield-c', name: 'Yield C', category: 'Yield', tvl_usd: 1000, mcap_usd: 1200, gecko_id: 'yield-c', symbol: 'YC' }),
    protocol({ slug: 'no-cat', name: 'No Cat', category: null, tvl_usd: 1000, mcap_usd: 700, gecko_id: 'no-cat', symbol: 'NC' }),
    protocol({ slug: 'oracle-a', name: 'Oracle A', category: 'Oracles', tvl_usd: 1000, mcap_usd: 700, gecko_id: 'oracle-a', symbol: 'OA' }),
    protocol({ slug: 'cex-a', name: 'Cex A', category: 'CEX', tvl_usd: 1000, mcap_usd: 5000, gecko_id: 'cex-a', symbol: 'CA' }),
    protocol({ slug: 'zero-tvl', name: 'Zero Tvl', category: 'Lending', tvl_usd: 0, mcap_usd: 100, gecko_id: 'zero-tvl', symbol: 'ZT' }),
    protocol({ slug: 'alpha-lend', name: 'Alpha Lend', category: 'Lending', tvl_usd: 100_000_000, change_7d: 10, listed_at: '2025-01-01' }),
    protocol({ slug: 'beta-dex', name: 'Beta Dex', category: 'DEXes', tvl_usd: 200_000_000, change_7d: 0, listed_at: null }),
    protocol({ slug: 'gamma-yield', name: 'Gamma Yield', category: 'Yield', tvl_usd: 10_000_000, change_7d: 20, listed_at: '2026-01-01' }),
    protocol({ slug: 'delta-bridge', name: 'Delta Bridge', category: 'Bridge', tvl_usd: 90_000_000, change_7d: 0, listed_at: null }),
    protocol({ slug: 'epsilon-v2', name: 'Epsilon V2', category: 'Yield', tvl_usd: 90_000_000, change_7d: 0, listed_at: null }),
    protocol({ slug: 'zeta-live', name: 'Zeta Live', category: 'Yield', tvl_usd: 90_000_000, change_7d: 0, listed_at: null, mcap_usd: 1000, gecko_id: 'zeta-live', symbol: 'ZL' }),
  ],
  watchlist: ['alpha-lend', 'beta-dex'],
};

/** Four decimals, the way the board stores its multipliers. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

describe('ageDays', () => {
  it('returns null when the listing date is unknown', () => {
    assert.equal(ageDays('2026-11-14', null), null);
  });
  it('counts whole days from listing to the snapshot date', () => {
    assert.equal(ageDays('2026-11-14', '2026-11-14'), 0);
    assert.equal(ageDays('2026-11-14', '2025-01-01'), 682);
    assert.equal(ageDays('2026-11-14', '2026-01-01'), 317);
  });
  it('clamps a future listing to zero days, never negative', () => {
    assert.equal(ageDays('2026-11-14', '2027-01-01'), 0);
  });
  it('returns null for a date that does not parse', () => {
    assert.equal(ageDays('2026-11-14', 'not-a-date'), null);
    assert.equal(ageDays('not-a-date', '2025-01-01'), null);
  });
});

describe('categoryMultiples', () => {
  it('takes the global median across launched non-CEX protocols', () => {
    const { global } = categoryMultiples(FIXTURE.protocols);
    assert.equal(global, 0.7);
  });
  it('gives a category its own median once it has three launched peers', () => {
    const { byCategory } = categoryMultiples(FIXTURE.protocols);
    assert.deepEqual(byCategory.get('Lending'), { multiple: 0.5, peers: 3, fallback: false });
    assert.deepEqual(byCategory.get('Yield'), { multiple: 0.9, peers: 4, fallback: false });
  });
  it('leaves a category with too few peers out of the table', () => {
    const { byCategory } = categoryMultiples(FIXTURE.protocols);
    assert.equal(byCategory.has('DEXes'), false);
    assert.equal(byCategory.has('(no category)'), false);
  });
  it('falls back to the global median for a thin category and for no category', () => {
    const multiples = categoryMultiples(FIXTURE.protocols);
    assert.deepEqual(multipleFor('DEXes', multiples), { multiple: 0.7, peers: 0, fallback: true });
    assert.deepEqual(multipleFor(null, multiples), { multiple: 0.7, peers: 0, fallback: true });
    assert.deepEqual(multipleFor('Lending', multiples), { multiple: 0.5, peers: 3, fallback: false });
  });
  it('ignores the CEX and the zero-TVL protocol when taking medians', () => {
    // A CEX ratio of 5.0 or a zero TVL would move the global median off 0.7.
    const { global } = categoryMultiples(FIXTURE.protocols);
    assert.equal(global, 0.7);
  });
  it('clamps multiples to [0.03, 1.50]', () => {
    const tiny = [0.001, 0.002, 0.003].map((r, i) =>
      protocol({ slug: `tiny-${i}`, name: `Tiny ${i}`, category: 'Tiny', tvl_usd: 1000, mcap_usd: r * 1000, gecko_id: `tiny-${i}`, symbol: `T${i}` }),
    );
    const huge = [5, 6, 7].map((r, i) =>
      protocol({ slug: `huge-${i}`, name: `Huge ${i}`, category: 'Huge', tvl_usd: 1000, mcap_usd: r * 1000, gecko_id: `huge-${i}`, symbol: `H${i}` }),
    );
    const { byCategory } = categoryMultiples([...tiny, ...huge]);
    assert.equal(byCategory.get('Tiny')!.multiple, 0.03);
    assert.equal(byCategory.get('Huge')!.multiple, 1.5);
  });
  it('falls back to 0.2 when no protocol has launched at all', () => {
    const { global } = categoryMultiples([protocol({ slug: 'only-pre', name: 'Only Pre', category: 'Lending' })]);
    assert.equal(global, 0.2);
  });
});

describe('impliedValue', () => {
  const multiples = categoryMultiples(FIXTURE.protocols);
  const bySlug = new Map(FIXTURE.protocols.map((p) => [p.slug, p]));

  it('scores the watchlist Lending row at its hand-computed value', () => {
    const v = impliedValue(bySlug.get('alpha-lend')!, FIXTURE.as_of, multiples);
    // TVL 100M x multiple 0.5 x growth 1.05 x maturity (682 days) 0.8491324200913242.
    assert.equal(v.implied, 44_579_452);
    assert.equal(v.multiple, 0.5);
    assert.equal(v.peers, 3);
    assert.equal(v.fallback, false);
    assert.equal(v.growthPct, 10);
    assert.equal(v.growthMult, 1.05);
    assert.equal(v.age, 682);
  });
  it('scores the thin-category row on the global fallback with unknown age', () => {
    const v = impliedValue(bySlug.get('beta-dex')!, FIXTURE.as_of, multiples);
    // TVL 200M x global 0.7 x growth 1.0 x maturity (unknown age -> 365 days) 0.7333...
    assert.equal(v.implied, 102_666_667);
    assert.equal(v.multiple, 0.7);
    assert.equal(v.peers, 0);
    assert.equal(v.fallback, true);
    assert.equal(v.age, null);
    assert.equal(round4(v.maturityMult), 0.7333);
  });
  it('clamps weekly growth to [-60, 120] before halving it', () => {
    const hot = protocol({ slug: 'hot', name: 'Hot', category: 'Lending', tvl_usd: 1_000_000, change_7d: 200 });
    const cold = protocol({ slug: 'cold', name: 'Cold', category: 'Lending', tvl_usd: 1_000_000, change_7d: -100 });
    assert.equal(impliedValue(hot, FIXTURE.as_of, multiples).growthPct, 120);
    assert.equal(impliedValue(hot, FIXTURE.as_of, multiples).growthMult, 1.6);
    assert.equal(impliedValue(cold, FIXTURE.as_of, multiples).growthPct, -60);
    assert.equal(impliedValue(cold, FIXTURE.as_of, multiples).growthMult, 0.7);
    const flat = protocol({ slug: 'flat', name: 'Flat', category: 'Lending', tvl_usd: 1_000_000, change_7d: null });
    assert.equal(impliedValue(flat, FIXTURE.as_of, multiples).growthPct, 0);
    assert.equal(impliedValue(flat, FIXTURE.as_of, multiples).growthMult, 1);
  });
  it('caps maturity at 1095 days and floors the implied value at one dollar', () => {
    const old = protocol({ slug: 'old', name: 'Old', category: 'Lending', tvl_usd: 1_000_000, listed_at: '2020-01-01' });
    assert.equal(round4(impliedValue(old, FIXTURE.as_of, multiples).maturityMult), 1);
    const dust = protocol({ slug: 'dust', name: 'Dust', category: 'Lending', tvl_usd: 1, change_7d: -60 });
    assert.equal(impliedValue(dust, FIXTURE.as_of, multiples).implied, 1);
  });
  it('uses the model constants the dashboard states, not hidden ones', () => {
    assert.deepEqual(MODEL, {
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
    });
  });
});

describe('isPreToken and isRankable', () => {
  it('a protocol records no token only when market cap, gecko id and symbol are all absent', () => {
    const pre = protocol({ slug: 'pre', name: 'Pre', category: 'Lending' });
    assert.equal(isPreToken(pre), true);
    assert.equal(isPreToken({ ...pre, mcap_usd: 1 }), false);
    assert.equal(isPreToken({ ...pre, gecko_id: 'pre' }), false);
    assert.equal(isPreToken({ ...pre, symbol: 'PRE' }), false);
  });
  it('ranks an ordinary pre-token protocol', () => {
    assert.equal(isRankable(protocol({ slug: 'ok', name: 'Ok', category: 'Lending' })), true);
  });
  it('refuses wrapped, staked and bridged products of tokens that already trade', () => {
    const cases: Array<[string, Partial<SnapshotProtocol>]> = [
      ['a Bridge category', { category: 'Bridge' }],
      ['a Liquid Staking category', { category: 'Liquid Staking' }],
      ['a CEX category', { category: 'CEX' }],
      ['a versioned name', { category: 'Yield', name: 'Foo V2' }],
      ['a dotted version name', { category: 'Yield', name: 'Foo 2.0' }],
      ['a wrapped word in the name', { category: 'Yield', name: 'Wrapped Foo' }],
      ['a staked word in the name', { category: 'Yield', name: 'Foo Staked' }],
      ['an exchange name', { category: 'Yield', name: 'Binance Earn' }],
      ['no category at all', { category: null }],
    ];
    for (const [why, extra] of cases) {
      assert.equal(isRankable(protocol({ slug: 'x', name: 'X', ...extra })), false, why);
    }
  });
  it('still ranks a live-token protocol out of the early radar', () => {
    const live = protocol({ slug: 'live', name: 'Live', category: 'Yield', mcap_usd: 1000, gecko_id: 'live', symbol: 'LIVE' });
    assert.equal(isRankable(live), false);
  });
});

describe('stepText and farmSteps', () => {
  it('pads a short step to twenty characters and caps a long one at six hundred', () => {
    const short = stepText({ text: 'Do it.', cost: 'free', time: 'now' });
    assert.ok(short.length >= 20, `short step is ${short.length} characters`);
    const long = stepText({ text: 'x'.repeat(900), cost: 'free', time: 'now' });
    assert.equal(long.length, 599, 'a step over the cap is cut to 596 characters plus an ellipsis');
    assert.ok(long.endsWith('...'));
  });
  it('writes five steps, each inside the gate, derived from the protocol itself', () => {
    const p = protocol({ slug: 'alpha-lend', name: 'Alpha Lend', category: 'Lending', tvl_usd: 100_000_000, change_7d: 10, listed_at: '2025-01-01', chains: ['Ethereum', 'Arbitrum'] });
    const steps = farmSteps(p, 682);
    assert.equal(steps.length, 5);
    for (const s of steps) {
      const text = stepText(s);
      assert.ok(text.length >= 20 && text.length <= 600, `step of ${text.length} characters`);
    }
    assert.ok(stepText(steps[1]!).includes('Alpha Lend'));
    assert.ok(stepText(steps[1]!).includes('$100'), 'a $100M TVL takes the $100 capital tier');
    assert.ok(stepText(steps[3]!).includes('Arbitrum'), 'a second chain gets its own step');
  });
  it('sizes capital by TVL and holds young protocols longer', () => {
    const whale = protocol({ slug: 'whale', name: 'Whale', category: 'Lending', tvl_usd: 6_000_000_000 });
    assert.ok(stepText(farmSteps(whale, 900)[1]!).includes('$250'));
    const small = protocol({ slug: 'small', name: 'Small', category: 'Lending', tvl_usd: 10_000_000 });
    assert.ok(stepText(farmSteps(small, 10)[1]!).includes('$50'));
    assert.ok(stepText(farmSteps(small, 10)[3]!).includes('60 days'), 'a young protocol holds 60 days');
    assert.ok(stepText(farmSteps(small, null)[3]!).includes('30 days'), 'unknown age holds 30 days');
  });
});

describe('parseSnapshot', () => {
  it('parses a well-formed snapshot and coerces a bad change into null', () => {
    const parsed = parseSnapshot(JSON.stringify({
      as_of: '2026-11-14', source: 'test', floor_usd: 50_000_000,
      protocols: [{ slug: 'a', name: 'A', category: 'Lending', chains: ['Ethereum'], tvl_usd: 100, change_7d: 'up', mcap_usd: null, listed_at: null, gecko_id: null, symbol: null }],
      watchlist: ['a'],
    }));
    assert.equal(parsed.protocols[0]!.change_7d, null);
    assert.deepEqual(parsed.watchlist, ['a']);
  });
  it('refuses text that is not JSON, and a snapshot missing its shape', () => {
    assert.throws(() => parseSnapshot('not json'), /not JSON/);
    assert.throws(() => parseSnapshot('[]'), /not a JSON object/);
    assert.throws(() => parseSnapshot('{}'), /as_of/);
    assert.throws(() => parseSnapshot(JSON.stringify({ as_of: '2026-11-14', source: 't', floor_usd: 1, protocols: 'no', watchlist: [] })), /protocols array/);
    assert.throws(() => parseSnapshot(JSON.stringify({ as_of: '2026-11-14', source: 't', floor_usd: 1, protocols: [{ slug: 'a' }], watchlist: [] })), /lacks a slug/);
  });
});

describe('liveRows', () => {
  it('lists live-token protocols by market cap, without the CEX', () => {
    const live = liveRows(FIXTURE, 24);
    assert.equal(live.length, 12);
    assert.equal(live[0]!.slug, 'yield-c');
    assert.equal(live[0]!.mcap_usd, 1200);
    assert.ok(live.every((r) => r.category !== 'CEX'));
    assert.ok(live.every((r) => r.mcap_usd !== null));
    assert.deepEqual(liveRows(FIXTURE, 2).map((r) => r.slug), ['yield-c', 'zeta-live']);
  });
});

describe('buildBoard and buildRadar on the fixture', () => {
  const multiples = categoryMultiples(FIXTURE.protocols);
  const board = buildBoard(FIXTURE, multiples);

  it('ranks the watchlist plus the early radar, strongest first', () => {
    assert.equal(board.length, 3);
    assert.deepEqual(board.map((r) => r.slug), ['beta-dex', 'alpha-lend', 'gamma-yield']);
    assert.deepEqual(board.map((r) => r.rank), [1, 2, 3]);
    assert.deepEqual(board.map((r) => r.implied_value_usd), [102_666_667, 44_579_452, 7_086_411]);
  });
  it('keeps the bridge, the versioned name and the live token out of the early radar', () => {
    const slugs = new Set(board.map((r) => r.slug));
    assert.equal(slugs.has('delta-bridge'), false);
    assert.equal(slugs.has('epsilon-v2'), false);
    assert.equal(slugs.has('zeta-live'), false);
  });
  it('passes the gate’s own board check', () => {
    assert.equal(boardIssue(board, FIXTURE), null);
  });
  it('builds the dashboard data with the same numbers', () => {
    const { board: b2, radar } = buildRadar(FIXTURE);
    assert.deepEqual(b2, board);
    assert.equal(radar.board_size, 3);
    assert.equal(radar.early_size, 1);
    assert.equal(radar.live_size, 12);
    assert.equal(radar.watchlist_size, 2);
    assert.equal(radar.global_multiple, 0.7);
    assert.equal(radar.model_version, 'radar-2');
    assert.deepEqual(radar.multiples, [
      { category: 'Yield', multiple: 0.9, peers: 4, fallback: false },
      { category: 'Lending', multiple: 0.5, peers: 3, fallback: false },
    ]);
  });
  it('is deterministic: the same snapshot scores the same board twice', () => {
    assert.equal(JSON.stringify(buildRadar(FIXTURE)), JSON.stringify(buildRadar(FIXTURE)));
    assert.equal(JSON.stringify(buildBoard(FIXTURE, multiples)), JSON.stringify(buildBoard(FIXTURE, multiples)));
  });
});

/** The shipped board, read from the repository root. */
const boardPath = fileURLToPath(new URL('../board.json', import.meta.url));
const board = (JSON.parse(readFileSync(boardPath, 'utf8')) as { rows: BoardRow[] }).rows;
const bySlug = new Map(board.map((r) => [r.slug, r]));

describe('board.json', () => {
  it('holds 178 rows ranked 1..178 with strictly falling implied values', () => {
    assert.equal(board.length, 178);
    assert.deepEqual(board.map((r) => r.rank), Array.from({ length: 178 }, (_, i) => i + 1));
    for (let i = 1; i < board.length; i++) {
      assert.ok(board[i]!.implied_value_usd < board[i - 1]!.implied_value_usd, `row ${i + 1} does not fall below row ${i}`);
      assert.ok(Number.isSafeInteger(board[i]!.implied_value_usd) && board[i]!.implied_value_usd > 0);
    }
  });
  it('covers every one of the 40 watchlist protocols', () => {
    assert.equal(WATCHLIST.length, 40);
    for (const slug of WATCHLIST) assert.ok(bySlug.has(slug), `watchlist slug ${slug} is missing from the board`);
  });
  it('marks every row pre-token with a five-step farm plan inside the gate', () => {
    for (const r of board) {
      assert.equal(r.token_status, 'pre-token');
      assert.equal(r.farm_steps.length, 5, `${r.slug} has ${r.farm_steps.length} farm steps`);
      for (const s of r.farm_steps) assert.ok(s.length >= 20 && s.length <= 600, `${r.slug} has a farm step of ${s.length} characters`);
    }
  });
  it('recomputes every implied value exactly, tie-break included', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (const r of board) {
      const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, r.change_7d ?? 0));
      const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
      const ageForModel = r.age_days ?? MODEL.unknown_age_days;
      const maturityMult = MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
      const raw = Math.max(1, Math.round(r.tvl_usd * r.model.category_multiple * growthMult * maturityMult));
      const expected = Math.max(1, Math.min(raw, prev - 1));
      assert.equal(r.implied_value_usd, expected, `${r.slug}: board says ${r.implied_value_usd}, recompute says ${expected}`);
      prev = expected;
    }
  });
  it('stores the same multipliers the formula gives, rounded to four decimals', () => {
    for (const r of board) {
      const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, r.change_7d ?? 0));
      assert.equal(r.model.growth_pct, growthPct, `${r.slug} growth_pct`);
      assert.equal(r.model.growth_multiplier, round4(1 + (growthPct / 100) * MODEL.growth_weight), `${r.slug} growth_multiplier`);
      const ageForModel = r.age_days ?? MODEL.unknown_age_days;
      const maturity = MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
      assert.equal(r.model.maturity_multiplier, round4(maturity), `${r.slug} maturity_multiplier`);
      assert.equal(r.model.age_days, r.age_days, `${r.slug} age_days`);
      assert.ok(r.model.category_multiple >= MODEL.multiple_min && r.model.category_multiple <= MODEL.multiple_max);
    }
  });
  it('gives every row in one category the same multiple and peer count', () => {
    const seen = new Map<string, { multiple: number; peers: number }>();
    for (const r of board) {
      const key = r.category ?? '(no category)';
      const v = { multiple: r.model.category_multiple, peers: r.model.multiple_peers };
      if (seen.has(key)) assert.deepEqual(seen.get(key), v, `category ${key} disagrees on its multiple`);
      seen.set(key, v);
    }
  });
  it('falls back to the global median for Risk Curators, whose one launched peer is too few', () => {
    const risk = board.filter((r) => r.category === 'Risk Curators');
    assert.equal(risk.length, 33);
    for (const r of risk) {
      assert.equal(r.model.multiple_peers, 0, `${r.slug} should fall back`);
      assert.equal(r.model.category_multiple, 0.2459877056611089, `${r.slug} should use the global median`);
    }
    const top = bySlug.get('steakhouse-financial')!;
    assert.equal(top.rank, 1);
    assert.equal(top.implied_value_usd, 534_911_168);
    assert.equal(bySlug.get('gauntlet')!.implied_value_usd, 318_580_117);
    assert.equal(bySlug.get('veda')!.implied_value_usd, 306_291_432);
  });
  it('pins the named rows the brief calls out', () => {
    assert.equal(bySlug.get('nonce-capital')!.rank, 7);
    assert.equal(bySlug.get('nonce-capital')!.implied_value_usd, 74_114_998);
    assert.equal(bySlug.get('usdd')!.implied_value_usd, 144_565_339);
    assert.equal(board[board.length - 1]!.slug, 'nucleus');
    assert.equal(board[board.length - 1]!.implied_value_usd, 569_159);
  });
  it('uses 365 days of maturity when the listing date is unknown', () => {
    for (const slug of ['lightning-network', 'noble', 'plasma-one', 'abstract', 'kava-mint', 'set-protocol']) {
      const r = bySlug.get(slug)!;
      assert.equal(r.age_days, null, `${slug} age_days`);
      assert.equal(r.model.age_days, null, `${slug} model age_days`);
      assert.equal(r.model.maturity_multiplier, 0.7333, `${slug} maturity_multiplier`);
    }
  });
  it('uses zero growth when the seven-day change is unknown', () => {
    for (const slug of ['estate-protocol', 'swan-dao']) {
      const r = bySlug.get(slug)!;
      assert.equal(r.change_7d, null, `${slug} change_7d`);
      assert.equal(r.model.growth_pct, 0, `${slug} growth_pct`);
      assert.equal(r.model.growth_multiplier, 1, `${slug} growth_multiplier`);
    }
  });
  it('passes the gate’s own board check', () => {
    const snapshot: Snapshot = { as_of: '2026-11-14', source: 'test', floor_usd: 50_000_000, protocols: [], watchlist: WATCHLIST };
    assert.equal(boardIssue(board, snapshot), null);
  });
});

describe('dataScript', () => {
  it('packs the fixture radar so the page reads the same numbers the board carries', () => {
    const { board: b, radar } = buildRadar(FIXTURE);
    const script = dataScript(radar);
    assert.ok(script.startsWith('window.RADAR='));
    const data = JSON.parse(script.slice('window.RADAR='.length, -2)) as {
      global_multiple: number;
      multiples: Array<[number, number, number]>;
      rows: Array<[number, string, string, number, number[], number, number, number | null, number | null, number, number, number, number, number]>;
      live: Array<unknown>;
    };
    assert.equal(data.global_multiple, 0.7);
    assert.equal(data.rows.length, b.length);
    assert.equal(data.live.length, 12);
    for (let i = 0; i < b.length; i++) {
      const row = data.rows[i]!;
      const boardRow = b[i]!;
      assert.equal(row[0], boardRow.rank);
      assert.equal(row[1], boardRow.slug);
      assert.equal(row[9], boardRow.implied_value_usd);
      assert.equal(row[10], boardRow.model.category_multiple);
      assert.equal(row[11], boardRow.model.multiple_peers);
      assert.equal(row[12], boardRow.model.growth_multiplier);
      assert.equal(row[13], boardRow.model.maturity_multiplier);
    }
    assert.deepEqual(data.multiples, [[3, 0.9, 4], [1, 0.5, 3]]);
  });
});

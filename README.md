[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Nurcholis46/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Nurcholis46/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

A ranked board of the pre-token protocols in DefiLlama's index, scored by what their launch would be worth — plus a dashboard that shows the board, a detail view per protocol, and the steps to farm it. An entry for the [make.fun bounty "Build the best token launch radar"](https://make.fun/bounty/token-radar-01).

Referral code: `mt29fv3h`

## What it ranks

The sealed snapshot (`input/snapshot.json` in the kit) holds 758 protocols as of 2026-11-14. The watchlist is the floor: 40 protocols with at least $50M of TVL and no token on record. The radar adds 138 pre-token protocols below that floor — every protocol that records no token and is not a wrapped, staked, bridged or versioned product of one that trades — for **178 ranked rows**. A further 24 protocols whose token already trades are set aside in the live-token view: their market caps are the facts the model learns from, not rows in the ranking.

Top of the board: Steakhouse Financial ($2.75B TVL, implied value $534.9M), Gauntlet ($318.6M), Veda ($306.3M), USDD ($144.6M), Upshift ($109.9M).

## How implied value is computed

One function of the snapshot figures, no protocol name special-cased:

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

The category multiple is the median market-cap / TVL of the launched protocols in that category, read from this snapshot alone. A category with fewer than 3 launched peers uses the global median (x0.246), and every multiple is clamped to [0.03, 1.50]. Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses 365 days.

"Records no token" means the snapshot's DefiLlama record shows no token for the protocol — it is not proof the protocol has none, and a launch is never promised. Implied value is the model's claim from TVL, growth and age, not a price and not a prediction.

## The dashboard

`dashboard/` is a static page with no network: `index.html`, `app.css`, `app.js` read the data beside them. It has a sortable, filterable board (search, category, chain, pre-token / live-token tabs), a detail view per protocol with the model's own inputs and a recompute check, the formula and the per-category multiples table, and a five-step farm plan per row with cost and time. The page regenerates each farm plan from the same templates `main.ts` writes to `board.json`, so the screen and the board always agree.

Screenshots in `screenshots/`: the board, a detail view, and a filtered view — all taken from the actual rendered dashboard.

## Run it

Node 22, standard library only:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

It writes `board.json`, `dashboard/` (with `data.js`), `screenshots/` and `dossier.json` — the summary the judge reads — into the output directory. Run twice and the bytes are identical.

## Layout

- `main.ts` — entrypoint: reads the snapshot, scores the board, writes the outputs
- `lib/model.ts` — the model: multiples, implied value, farm plans, board checks
- `vendor/makefun-board.ts` — the vendored make.fun dossier library, unchanged
- `dashboard/` — the static page
- `screenshots/` — the three screenshots
- `board.json` — the ranked board (178 rows)

## License

MIT — see [LICENSE](LICENSE).

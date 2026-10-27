# Pump Market

**A live Solana volume board.** The busiest boosted assets, ranked by 24h volume, in one dense view.

[![Live site](https://img.shields.io/badge/live_site-pumpmarket.ink-informational?style=flat-square)](https://pumpmarket.ink)
[![Chain: Solana](https://img.shields.io/badge/chain-Solana-informational?style=flat-square)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-informational?style=flat-square)](LICENSE)

| | |
|---|---|
| Chain | Solana |
| Contract address | _pending, to be announced_ |
| Site | https://pumpmarket.ink |

## Overview

Pump Market reads the public DexScreener API, keeps the Solana entries, picks each asset's busiest pool and shows the ten with the heaviest 24h volume. Price, swing, volume and liquidity refresh every minute. The page is read-only: nothing to connect and nothing to sign.

Every outside fact (chain, market source, contract address, social links) lives in one record in `register.json`. A record is `stated`, `absent` or `unconfirmed`. Anything that is not stated renders inert and shows `pending`.

## Features

- Top ten Solana assets by 24h volume with logo, price, 24h change, volume, liquidity and a copy-address button
- Rolling ticker fed by the same data
- Skeleton loaders, count-up numbers with change flashes, spring-physics reveals, hero parallax
- Polls every 60 seconds, pauses while the tab is hidden, backs off exponentially on failure and keeps the last good data
- Full `prefers-reduced-motion` support
- Contract-address slot at the top of the page, inert until the address is stated

## Links

- Site: https://pumpmarket.ink
- X: _pending_
- GitHub: _pending_

## Develop

```bash
npm run build   # writes dist/
npm run gates   # builds both branches of every register record and checks the output
npm run serve   # serves dist/ on http://localhost:4173
```

`dist/` is the deploy folder. Drag it to Cloudflare Pages.

## License

MIT, see [LICENSE](LICENSE).

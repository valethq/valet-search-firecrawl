# valet-search-firecrawl

`tools@1` provider with two tools backed by [Firecrawl](https://firecrawl.dev): `web_search_firecrawl` and
`web_fetch_firecrawl`. No runtime dependencies, just `fetch`. Available to `trusted` and `owner` runs by default
(ARCHITECTURE decision 5: friends get search and fetch); `guest` runs get nothing.

## Setup

None is required. Without a key the tools run in Firecrawl's keyless mode: free, capped per IP address per day
by a request limit and a credit limit, and limited to search and scrape (which is all this plugin uses). When the
cap is hit the tool says so and where to put a key.

For higher limits put an API key (`fc-...`) in `~/.valet/secrets/firecrawl_api_key` (mode 0600) or set
`FIRECRAWL_API_KEY` for valet. The key is read on every call, so adding or rotating it needs no restart.

## Tools

`web_search_firecrawl { query, numResults?, includeDomains?, excludeDomains?, recency?, categories?, contents?, maxCharacters? }`

- `POST /v2/search`. `recency` is `day | week | month | year` and becomes `tbs`.
- `includeDomains` and `excludeDomains` are mutually exclusive at Firecrawl; if both are given the allow-list wins.
- `categories`: any of `research`, `pdf`, `developer`.
- `contents`: `highlights` (default, Firecrawl's search snippets) or `text` (each result scraped to markdown, which costs more credits).
- Returns numbered results: title, URL, date (news only), excerpt.

`web_fetch_firecrawl { urls, maxCharacters? }`

- `POST /v2/scrape` once per URL (up to 10, in parallel), main content as markdown. URLs Firecrawl could not scrape are listed after the results.

## Config

All optional, under `plugins.valet-search-firecrawl.config`:

- `secret`: secret name (default `firecrawl_api_key`)
- `baseUrl`: default `https://api.firecrawl.dev/v2`
- `mode`: which index `web_search_firecrawl` queries, `web` (default) or `news`
- `numResults`: default 8, max 20
- `maxCharacters`: per-result excerpt size, default 2000 (`web_fetch_firecrawl` uses 4x)
- `timeoutMs`: default 30000
- `minRole`: lowest role served, default `trusted`

Config changes apply without a restart.

## Settings

Settings are this plugin's config block (ARCHITECTURE 12.1). Core merges defaults from `configSchema`, the config
file, and `<valetHome>/settings.json`; `ctx.config` is the effective block. The settings page form is built from
the enriched schema (titles, defaults, min/max, `x-group: tools`, `x-widget: secret` on the secret name). A small
view-only panel above it shows whether an API key is present (or that the plugin is running keyless) and a Refresh action.

## Checks

`bun run typecheck`, `bun run lint`, `bun test`.

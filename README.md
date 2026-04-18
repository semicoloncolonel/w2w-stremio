# What to Watch — Stremio Addon

A Stremio catalog addon that aggregates editorial picks, festival lineups, and award nominees into browsable catalogs. Data is refreshed daily server-side — **users don't need a TMDB key**.

## Catalogs

- **What to Watch** — editorial picks merged from Decider, Variety, Vulture, IndieWire, and the NYT (movies and series). Filter by source via the `genre` dropdown.
- **Sundance / Cannes / Berlinale / Venice / TIFF** — festival lineups. Filter by year (defaults to most recent).
- **Oscar / Golden Globe / Emmy Nominees** — award nominees. Filter by year and by category (e.g. "Best Picture", "Outstanding Drama Series") via the `genre` dropdown.

All catalogs are enabled by default; the configure page lets users opt out of any of them.

### Filters

Each catalog exposes Stremio's standard `extra` filters:

- **`year`** — narrows the catalog to nominations from that year. If omitted (and the catalog isn't editorial), the most recent year is shown by default. Editorial catalogs ignore the default and show all entries since editorial nominations are always tagged with the current calendar year.
- **`genre`** — for awards, filters by category name (e.g. `Best Director`). For editorial catalogs, filters by source outlet (e.g. `Variety`). Festivals do not have a `genre` extra. Year and genre AND-combine when both are set.

The dropdown options shown in Stremio are populated dynamically from the actually-scraped data each refresh, so they always reflect what's currently available.

## How it works

```
 ┌─────────────────┐     Vercel Cron (daily)        ┌──────────────────┐
 │  /api/refresh   │ ◄─────────────────────────────│  Scheduled HTTP  │
 └────────┬────────┘                                └──────────────────┘
          │  scrape sources → resolve via TMDB
          ▼
 ┌─────────────────┐                                ┌──────────────────┐
 │  Vercel Blob    │ ◄──────────────────────────────│  lib/storage.js  │
 │  catalog/*.json │                                └──────────────────┘
 │  manifest.json  │
 └────────┬────────┘
          │  fast read on every request
          ▼
 ┌─────────────────┐     Stremio client             ┌──────────────────┐
 │ catalog handler │ ──────────────────────────────►│  user's Stremio  │
 └─────────────────┘                                └──────────────────┘
```

1. **Refresh job** (`lib/refresh.js`, triggered by Vercel Cron at `/api/refresh`) runs daily.
2. It scrapes each source, resolves titles to IMDb metas via a **server-owned** TMDB key, and writes pre-built catalog JSON to persistent storage. It also writes a top-level `manifest.json` blob containing the full Stremio manifest with `extra.options` populated from the scraped years/categories so the in-app dropdowns reflect what's actually available.
3. The addon's catalog handler becomes a cheap storage read — no scraping or TMDB traffic on the hot path. The `/manifest.json` route reads the storage blob directly so dropdown options stay fresh between deploys.

## Version 3.0.0 — breaking schema change

The 3.0.0 release drops the `now-streaming` and `*-all` catalog variants in favor of single catalogs that span the historical window via the new `year` filter. Existing installs continue to work for the catalogs that survived the rename (`oscars`, `goldenGlobes`, `emmys`, `sundance`, `cannes`, `berlinale`, `w2w`); Stremio refetches the manifest periodically and the new catalogs and dropdowns will appear automatically. Users who want the year/genre dropdowns to populate with options on first sight may need to re-install (since Stremio caches `extra.options` aggressively per install).

## Requirements

- Node.js 20+
- **Server-only**: a TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api)), plus either Vercel Blob or a writable filesystem for storage.

## Environment variables

Copy `.env.example` to `.env` for local development. Full list lives in that file; highlights:

- `TMDB_API_KEY` — server-side key used by the refresh job. **Never exposed to clients.**
- `BLOB_READ_WRITE_TOKEN` — auto-injected on Vercel; set locally only if using the Blob backend.
- `STORAGE_BACKEND` — `blob` or `file`. Defaults to `blob` on Vercel, `file` otherwise.
- `STORAGE_ROOT` — override for the file backend's root (tests use this; ignore otherwise).
- `CRON_SECRET` — shared secret for manually triggering `/api/refresh` outside Vercel Cron.
- `REFRESH_YEARS_BACK` — how many years the festival catalogs should look back (default `10`).
- `REFRESH_EDITIONS_BACK` — how many editions the award catalogs should look back (default: same as `REFRESH_YEARS_BACK`).
- `PORT` — local dev HTTP port (default `7500`).

## Local development

```bash
npm install
cp .env.example .env
# edit .env — at minimum set TMDB_API_KEY; STORAGE_BACKEND defaults to "file" locally

# one-time: populate the local catalog store
node -e 'require("./lib/refresh").run().then(r => console.log(r))'

# run the addon
npm start
```

Open `http://localhost:7500/configure` to pick exclusions and install into Stremio.

### Scripts

```bash
npm test              # jest
npm run lint          # eslint
npm run format        # prettier --write
npm run format:check  # prettier --check (CI)
```

## Deployment (Vercel)

1. Set the following in the Vercel project's env: `TMDB_API_KEY`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN` (auto-created when you attach a Blob store).
2. Attach a **Vercel Blob** store to the project (one-click in the Vercel dashboard).
3. Deploy. Vercel Cron runs `/api/refresh` daily automatically (see `vercel.json`).
4. Trigger the first refresh manually so users don't see an empty catalog:
   ```bash
   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<your-deploy>.vercel.app/api/refresh
   ```

## URL stability (important)

The addon's manifest URL and surviving catalog ids are treated as a stable contract.

- New features land behind new optional config fields when possible.
- The manifest URL never changes. If we move domains, we keep the old URL serving too.
- Breaking changes (such as the 3.0.0 cleanup of `now-streaming` and `*-all` variants) are intentional and bump the major version.

## License

MIT

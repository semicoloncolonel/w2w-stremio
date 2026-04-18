# What to Watch — Stremio Addon

A Stremio catalog addon that aggregates editorial picks, festival lineups, and award nominees into browsable catalogs. Data is refreshed every 6 hours server-side — **users don't need a TMDB key**.

## Catalogs

**Current**

- **What to Watch** — editorial picks merged from Decider, Variety, Vulture, IndieWire, and the NYT (movies and series)
- **Now Streaming** — newly added movies on streaming platforms (Rotten Tomatoes)
- **Sundance / Cannes / Berlinale** — current-year festival lineups
- **Oscar / Golden Globe / Emmy Nominees** — latest-edition nominees

**Historical (`-all` variants)**

- **Sundance / Cannes / Berlinale — All Years** — last 10 years of festival lineups, merged + deduped
- **Oscar / Golden Globe / Emmy Nominees — All Editions** — last 10 editions of nominees

All catalogs are enabled by default; the configure page lets users opt out of any of them.

## How it works

```
 ┌─────────────────┐     Vercel Cron (every 6h)     ┌──────────────────┐
 │  /api/refresh   │ ◄─────────────────────────────│  Scheduled HTTP  │
 └────────┬────────┘                                └──────────────────┘
          │  scrape sources → resolve via TMDB
          ▼
 ┌─────────────────┐                                ┌──────────────────┐
 │  Vercel Blob    │ ◄──────────────────────────────│  lib/storage.js  │
 │  catalog/*.json │                                └──────────────────┘
 └────────┬────────┘
          │  fast read on every request
          ▼
 ┌─────────────────┐     Stremio client             ┌──────────────────┐
 │ catalog handler │ ──────────────────────────────►│  user's Stremio  │
 └─────────────────┘                                └──────────────────┘
```

1. **Refresh job** (`lib/refresh.js`, triggered by Vercel Cron at `/api/refresh`) runs every 6 hours.
2. It scrapes each source, resolves titles to IMDb metas via a **server-owned** TMDB key, and writes pre-built catalog JSON to persistent storage.
3. The addon's catalog handler becomes a cheap storage read — no scraping or TMDB traffic on the hot path.

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
- `REFRESH_YEARS_BACK` — how many years/editions the historical catalogs should look back (default `10`).
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
3. Deploy. Vercel Cron runs `/api/refresh` every 6 hours automatically (see `vercel.json`).
4. Trigger the first refresh manually so users don't see an empty catalog:
   ```bash
   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<your-deploy>.vercel.app/api/refresh
   ```

## URL stability (important)

The addon's manifest URL and catalog ids are treated as a stable contract. Breaking them forces every user to re-install.

- New features land behind new optional config fields, never breaking changes.
- New catalogs get new ids; existing catalog ids never change or disappear.
- The manifest URL never changes. If we move domains, we keep the old URL serving too.

## License

MIT

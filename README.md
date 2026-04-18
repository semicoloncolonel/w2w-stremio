# What to Watch — Stremio Addon

A Stremio catalog addon that aggregates editorial "What to Watch" recommendations from multiple reputable TV and movie news sources into browsable catalogs.

## Catalogs

- **What to Watch** — Curated editorial picks merged from all sources (movies and series)
- **Now Streaming** — Recently added movies to streaming platforms via Rotten Tomatoes

## Sources

- **Decider** — Stream It or Skip It reviews and recommendations
- **Variety** — What to Watch streaming picks
- **Vulture** — Weekly watch recommendations scraped from their weekend guides
- **IndieWire** — Best new TV shows
- **New York Times** — Weekly "What to Watch" column picks (no API key needed)

All sources are enabled by default. You can exclude any source from the configure page.

## Requirements

- Node.js 20+
- TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))

## Environment Variables

Copy `.env.example` to `.env` for local development. See that file for the full list. Highlights:

- `TMDB_API_KEY` — server-side key used by the refresh job (Phase 2+).
- `BLOB_READ_WRITE_TOKEN` — auto-set on Vercel; needed locally only if using the Blob backend.
- `STORAGE_BACKEND` — `blob` or `file`. Defaults to `blob` on Vercel, `file` otherwise.
- `CRON_SECRET` — shared secret for protecting manual `/api/refresh` calls.
- `PORT` — local dev HTTP port (default `7500`).

## Setup

```bash
npm install
npm start
```

The addon starts at `http://localhost:7500`. Open `http://localhost:7500/configure` to:

1. Enter your TMDB API key
2. Optionally exclude any sources you don't want
3. Click Install to add it to Stremio

## How It Works

1. Each source module fetches recommendations via RSS feeds or web scraping
2. Extracted titles are resolved to IMDb IDs using the TMDB API
3. Results are merged into unified catalogs with posters and metadata
4. Each title's description is prefixed with its source (e.g. `[Decider]`, `[Vulture]`)
5. Source data is cached for 6 hours, TMDB resolutions for 7 days

## Configuration

| Setting            | Required | Description                                          |
| ------------------ | -------- | ---------------------------------------------------- |
| TMDB API Key       | Yes      | Used to resolve titles to IMDb IDs and fetch posters |
| Exclude checkboxes | No       | Opt out of any source you don't want                 |

## Deployment

The addon is deployment-agnostic. Run it locally with `node index.js`, or deploy to Vercel, Beamup, or Docker. For quick public access during development, use `cloudflared tunnel --url http://localhost:7500`.

## License

MIT

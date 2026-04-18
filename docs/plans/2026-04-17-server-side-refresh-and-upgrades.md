# Server-Side Refresh Architecture + Historical Years Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the Stremio addon from on-demand scraping to a server-side pre-built catalog model (Vercel Cron refreshes → persistent storage → addon serves pre-built JSON), add historical year support for awards/festivals, and bring baseline quality (lint, CI, tests) to the repo.

**Architecture:**

- **Refresh job** (`api/refresh.js`): Vercel Cron triggers this on a schedule. It runs every scraper, resolves titles to IMDb metas via a _server-owned_ TMDB key, and writes one JSON blob per catalog to Vercel Blob storage.
- **Catalog handler** becomes a cache read: load the blob for a catalog id + type, slice for pagination, return. No live scraping, no user TMDB key.
- **Configure page** simplifies to just source-exclusion toggles.
- **Historical years**: awards/festivals sources accept a list of year URLs (derived from a `YEARS_BACK` config), scraped + merged + deduped into an "all-time" catalog variant.

**Tech Stack:** Node 20, stremio-addon-sdk, cheerio, fast-xml-parser, Vercel Blob (`@vercel/blob`), Vercel Cron, Jest, ESLint, Prettier, GitHub Actions.

---

## Phase 1: Quick Fixes (foundation)

### Task 1.1: Bump Node target to 20

**Files:**

- Modify: `package.json`

**Steps:**

1. Change `"node": ">=18.0.0"` → `"node": ">=20.0.0"`
2. Run `node --version` — confirm local >= 20
3. Commit: `chore: bump Node requirement to >=20`

### Task 1.2: Add .env.example and document env vars

**Files:**

- Create: `.env.example`
- Modify: `README.md` (add env var section)

**Content for `.env.example`:**

```
# Server-side TMDB key (refresh job only — never exposed to clients)
TMDB_API_KEY=

# Vercel Blob read/write token (auto-set on Vercel; needed only locally)
BLOB_READ_WRITE_TOKEN=

# Optional: addon HTTP port for local dev
PORT=7500
```

**Commit:** `docs: add .env.example and env var documentation`

### Task 1.3: Add Prettier

**Files:**

- Create: `.prettierrc.json`, `.prettierignore`
- Modify: `package.json` (devDep + script)

**`.prettierrc.json`:**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**`.prettierignore`:**

```
node_modules
package-lock.json
.vercel
```

**package.json scripts:** add `"format": "prettier --write ."` and `"format:check": "prettier --check ."`.

**Steps:**

1. `npm install --save-dev prettier`
2. Run `npm run format` once to normalize
3. Commit: `chore: add prettier config and format codebase`

### Task 1.4: Add ESLint

**Files:**

- Create: `eslint.config.js` (flat config, ESLint 9+)
- Modify: `package.json`

**`eslint.config.js`:**

```js
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.js", "**/*.test.js"],
    languageOptions: { globals: { ...globals.jest } },
  },
];
```

**package.json script:** `"lint": "eslint ."`

**Steps:**

1. `npm install --save-dev eslint @eslint/js globals`
2. Run `npm run lint` — fix errors (likely unused vars; address them)
3. Commit: `chore: add eslint with flat config`

### Task 1.5: Add Jest + first test

**Files:**

- Modify: `package.json` (devDep + script)
- Create: `tests/lib/parser.test.js`

**Test (failing-first):**

```js
const { extractYear } = require("../../lib/parser");

describe("extractYear", () => {
  test("pulls four-digit year out of a title string", () => {
    expect(extractYear("Oppenheimer (2023)")).toBe(2023);
  });
  test("returns undefined when no year present", () => {
    expect(extractYear("Oppenheimer")).toBeUndefined();
  });
});
```

**Steps:**

1. `npm install --save-dev jest`
2. Add `"test": "jest"` to scripts
3. Inspect `lib/parser.js` — if `extractYear` isn't exported, export it
4. Run `npm test` — expect PASS
5. Commit: `test: add jest with initial parser coverage`

### Task 1.6: Add resolver tests with mocked fetch

**Files:**

- Create: `tests/lib/resolver.test.js`

**Approach:** mock `global.fetch` via Jest to return canned TMDB responses; verify caching, 429-retry logic, IMDb lookup.

**Test cases:**

- returns null when title is empty
- returns null when tmdbKey missing
- calls `/search/movie` for type=movie, `/search/tv` for type=series, `/search/multi` otherwise
- retries once on 429
- caches successful resolutions

**Steps:**

1. Write the failing tests
2. Run `npm test` — confirm shape is right; fix resolver if any bug surfaces (don't force test changes unless the test is wrong)
3. Commit: `test: cover resolver search + retry + cache paths`

### Task 1.7: Add GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

**Content:**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
```

**Commit:** `ci: add GitHub Actions for lint + format + test`

### Task 1.8: Phase 1 verification

- Run `npm run lint && npm run format:check && npm test` locally → all pass
- Open a PR; confirm CI is green
- **Do not merge yet** — Phase 2 will stack on this branch.

---

## Phase 2: Server-Side Refresh Architecture

**Architectural note:** After this phase, `lib/cache.js` (in-memory Map) is gone. The refresh job writes to Vercel Blob; the catalog handler reads from Vercel Blob. Users no longer need a TMDB key.

### Task 2.1: Add `@vercel/blob` dependency

**Files:** `package.json`

**Steps:**

1. `npm install @vercel/blob`
2. Commit: `chore: add @vercel/blob for persistent catalog storage`

### Task 2.2: Create storage abstraction

**Files:**

- Create: `lib/storage.js`
- Create: `tests/lib/storage.test.js`

**Purpose:** thin wrapper so local dev (filesystem) and prod (Blob) are interchangeable. Selects backend via `STORAGE_BACKEND` env (`blob` | `file`, default `blob` in prod, `file` otherwise).

**Interface:**

```js
// lib/storage.js
async function putJSON(key, data) {
  /* ... */
} // key e.g. "catalog/oscars/movie.json"
async function getJSON(key) {
  /* returns null if missing */
}
async function listKeys(prefix) {
  /* optional: used by a debug endpoint */
}
module.exports = { putJSON, getJSON, listKeys };
```

**Local backend:** write to `.cache/storage/<key>`. Gitignore the dir.

**Tests:** round-trip put → get, returns null on missing key, handles nested paths.

**Commit:** `feat: add storage abstraction with blob + file backends`

### Task 2.3: Add years-config module

**Files:**

- Create: `config/years.js`
- Create: `tests/config/years.test.js`

**Purpose:** single source of truth for award/festival year data. Eliminates hardcoded URLs strewn across source files.

**Shape:**

```js
// config/years.js
// CURRENT is the most recent edition. HISTORICAL extends backward.
// When a new year's ceremony/festival happens, bump CURRENT and append the old entry.
module.exports = {
  oscars: {
    current: 98, // 98th Academy Awards
    latestYear: 2026,
    buildLetterboxdUrl: (n) =>
      `https://letterboxd.com/oscars/list/the-${ordinal(n)}-academy-award-nominees-all-feature/`,
    buildWikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Academy_Awards`,
  },
  goldenGlobes: {
    current: 83,
    latestYear: 2026,
    buildLetterboxdUrl: (n) =>
      `https://letterboxd.com/filmfestival/list/${2026 - (83 - n)}-golden-globes-nominations/`,
    buildWikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Golden_Globe_Awards`,
  },
  emmys: {
    current: 77,
    latestYear: 2025,
    buildWikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Primetime_Emmy_Awards`,
  },
  sundance: {
    latestYear: 2026,
    buildLetterboxdUrl: (y) => `https://letterboxd.com/.../${y}/`, // actual pattern TBD during impl
  },
  // cannes, berlinale similar
};

function ordinal(n) {
  /* 98 -> "98th", 83 -> "83rd", 77 -> "77th" */
}
```

**Tests:** ordinal() edge cases (1st, 2nd, 3rd, 11th, 21st, 22nd, 23rd, 98th), URL generation for each key.

**Commit:** `feat: centralize award/festival year config`

### Task 2.4: Refactor `sources/awards.js` to accept year parameter

**Files:**

- Modify: `sources/awards.js`

**Changes:**

- Remove hardcoded URLs (keep as lookup fallback).
- Each source exports `fetchTitlesForYear(n)` that uses `config/years.js` to build URLs for edition `n`.
- Keep existing `fetchTitles()` as a thin wrapper: `return fetchTitlesForYear(current)`.
- Drop the in-module `cache.get/set` calls entirely — caching now lives in the refresh job / storage layer.

**Tests:** add `tests/sources/awards.test.js` covering URL selection for a given year (mock `fetchPage`).

**Commit:** `refactor: parameterize awards sources by edition/year`

### Task 2.5: Same refactor for `sources/festivals.js`

Mirror Task 2.4 for Sundance/Cannes/Berlinale.

**Commit:** `refactor: parameterize festival sources by year`

### Task 2.6: Create the refresh job

**Files:**

- Create: `api/refresh.js`
- Create: `lib/refresh.js` (core logic, for testability)

**Flow in `lib/refresh.js`:**

1. Read `process.env.TMDB_API_KEY` — fail with 500 if missing.
2. Accept optional `{ yearsBack }` param (default 10).
3. For each catalog we serve, gather raw titles:
   - Editorial sources (Decider, Variety, etc.): current only.
   - Awards/festivals `*-current`: current year only.
   - Awards/festivals `*-all`: iterate backward `yearsBack` editions; merge + dedupe by lowercased title.
4. Resolve titles via `lib/resolver.js` (using env TMDB key) in batches.
5. Write pre-built metas per catalog via `storage.putJSON("catalog/<id>/<type>.json", { metas, generatedAt })`.
6. Return `{ ok: true, counts: { ... } }`.

**`api/refresh.js`:** thin wrapper — verifies a `CRON_SECRET` header (or `x-vercel-cron`), calls `lib/refresh.js`, returns JSON.

**Tests:** `tests/lib/refresh.test.js` — mock sources + resolver + storage, assert it writes one entry per catalog, assert `*-all` catalogs call multiple year URLs.

**Commit:** `feat: implement refresh job that builds and stores catalog metas`

### Task 2.7: Wire up Vercel Cron

**Files:**

- Modify: `vercel.json`

**Add:**

```json
{
  "crons": [{ "path": "/api/refresh", "schedule": "0 */6 * * *" }]
}
```

(Every 6h. Editorial sources change ~daily; award nominees change rarely; 6h is a sensible default.)

**Commit:** `chore: schedule refresh job via vercel cron`

### Task 2.8: Rewrite catalog handler to read from storage

**Files:**

- Modify: `addon.js`
- Update: `tests/addon.test.js` (new)

**New handler flow:**

```js
builder.defineCatalogHandler(async ({ type, id, extra, config }) => {
  if (isExcluded(config, exclusionKeyFor(id))) return { metas: [] };
  const skip = parseInt(extra?.skip) || 0;
  const data = await storage.getJSON(`catalog/${id}/${type}.json`);
  if (!data) return { metas: [] };
  const metas = data.metas.slice(skip, skip + 100);
  return { metas, cacheMaxAge: 3600, staleRevalidate: 21600, staleError: 604800 };
});
```

- Drop `resolveTitles`, the TMDB key usage, all the live scraping branches.
- Manifest: remove the `tmdbKey` config field; drop `configurationRequired: true` (since config is now optional — exclusions only).
- Add new catalogs: `oscars-all`, `goldenGlobes-all`, `emmys-all`, `sundance-all`, `cannes-all`, `berlinale-all`.

**Tests:** assert handler returns pre-built metas from storage, respects skip, returns empty on exclusion or missing blob.

**Commit:** `feat: serve catalogs from pre-built storage; drop live scraping`

### Task 2.9: Simplify configure page

**Files:**

- Modify: `lib/configure.js`

**Changes:**

- Remove TMDB key input entirely.
- Update the prefill + URL-encoding helpers (exclusions only).
- Update copy: "No API key needed — data is refreshed every 6 hours."
- Add checkboxes for each new `*-all` catalog exclusion.

**Commit:** `feat: simplify configure page — remove TMDB key requirement`

### Task 2.10: Delete dead code

**Files:**

- Delete: `lib/cache.js` (replaced by storage + per-request blob reads)
- Modify: `lib/resolver.js` — keep (still used by refresh job), but drop the module-level `cache` import; caching of resolutions now lives inside the refresh job (resolve once per title across the entire run).

**Tests:** make sure no tests reference `lib/cache`.

**Commit:** `chore: remove in-memory cache module`

### Task 2.11: Update README

**Files:** `README.md`

**Sections:**

- "How it works" — explain refresh job + pre-built catalogs
- "Local development" — `npm run refresh:local` one-shot, `STORAGE_BACKEND=file`
- "Deployment" — env vars to set on Vercel (`TMDB_API_KEY`, `CRON_SECRET`), Vercel Blob setup link
- Remove the "you need a TMDB key" requirement from the user-facing section

**Commit:** `docs: update README for server-side refresh architecture`

### Task 2.12: Phase 2 verification

- Set up a local `.env` with `TMDB_API_KEY` and `STORAGE_BACKEND=file`
- Run `node -e 'require("./lib/refresh").run()'` — confirm it writes JSON to `.cache/storage/catalog/...`
- Start the server: `npm start`
- Hit a catalog URL (e.g., `curl localhost:7500/manifest.json`, then a catalog endpoint) — confirm metas returned
- **Deploy to Vercel preview** and verify Cron fires (check Vercel dashboard)
- Merge PR

---

## Phase 3: Longer-term Polish

These are follow-ups; detail-out as separate plans when we get there.

### Task 3.1: Sentry for error tracking

Wire `@sentry/node` into `lib/refresh.js` and `addon.js`. Alert on source failures, blob read failures, TMDB quota hits.

### Task 3.2: User feedback mechanism

Add a "report a broken source" link on the configure page → opens a prefilled GitHub issue. Low-effort, high-signal.

### Task 3.3: TypeScript migration

Incremental: add `tsconfig.json` with `allowJs`, convert `lib/` first, then `sources/`, then `api/`.

### Task 3.4: Richer metadata

Parse and surface per-title metadata: which sources flagged it, which awards it was nominated for across years, streaming platform (from Decider/RT signals). Attach as `description` or `behaviorHints`.

### Task 3.5: Catalog filters

Stremio supports catalog `extra` filters. Add a year filter to `*-all` catalogs so users can browse "Oscars 2020" without needing a separate catalog entry per year.

---

## Risk & Rollout Notes

- **Existing installed users** lose their TMDB key config on Phase 2 deploy. Because `configurationRequired: false` in the new manifest, Stremio should just re-install silently with no key. Old URLs with embedded keys still resolve — the catalog handler ignores the key.
- **First post-deploy request will be empty** until the first cron run populates storage. Trigger `/api/refresh` manually once after deploy.
- **TMDB quota**: one refresh run across ~10 years of awards + festivals + editorial ≈ 2000–4000 TMDB requests. Free tier (40/sec) handles it in ~2 minutes. No paid plan needed.
- **Letterboxd ToS**: scraping is already in use; this change doesn't increase request volume (arguably decreases it, since we scrape once centrally vs. once per user).

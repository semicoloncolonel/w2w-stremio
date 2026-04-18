#!/usr/bin/env node
// Stand-alone CLI wrapper around lib/refresh.run(). Used by the GitHub Actions
// refresh workflow (.github/workflows/refresh.yml) so the same code that
// powers the on-demand /api/refresh endpoint also runs from cron without
// going through Vercel's function-timeout cap.
//
// Reads BLOB_READ_WRITE_TOKEN, TMDB_API_KEY, STORAGE_BACKEND from env.
// Prints the JSON result on success, exits non-zero on failure.

const { run } = require("../lib/refresh");

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

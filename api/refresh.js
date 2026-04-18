// HTTP handler for the refresh job. Used by Vercel Cron and (in dev) callable
// directly from curl. Vercel's Node function signature is `(req, res)` so this
// works as a stand-alone serverless function and as a route in
// api/serverless.js.

const { run } = require("../lib/refresh");

function isAuthorized(req) {
  // Vercel Cron sets x-vercel-cron on requests it issues.
  if (req.headers && req.headers["x-vercel-cron"]) return true;

  const secret = process.env.CRON_SECRET;
  const provided = req.headers && req.headers["x-cron-secret"];
  if (secret && provided && provided === secret) return true;

  // Local dev / tests should not need a secret.
  if (process.env.NODE_ENV !== "production") return true;

  return false;
}

module.exports = async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    return;
  }

  try {
    const result = await run();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
};

// Azure Functions v4 HTTP entry point.
//
// A single catch-all function routes every request through the existing
// api/serverless.js handler so we keep one place for routing logic (manifest,
// catalog, configure, refresh). We adapt Azure's request/response shape to the
// Node-style (req, res) interface the handler was originally written for on
// Vercel.

const { app } = require("@azure/functions");
const handler = require("../../api/serverless");

app.http("addon", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request, context) => {
    const url = new URL(request.url);

    // Build a Node-http-shaped `req`. The handler only reads `url`, `method`,
    // and `headers.host`.
    const headersObj = {};
    if (request.headers && typeof request.headers.entries === "function") {
      for (const [k, v] of request.headers.entries()) headersObj[k.toLowerCase()] = v;
    }
    if (!headersObj.host) headersObj.host = url.host;

    const req = {
      url: url.pathname + url.search,
      method: request.method,
      headers: headersObj,
    };

    let statusCode = 200;
    const headers = {};
    const chunks = [];
    let done;
    const finished = new Promise((resolve) => {
      done = resolve;
    });

    const res = {
      get statusCode() { return statusCode; },
      set statusCode(v) { statusCode = v; },
      setHeader(name, value) { headers[name] = value; },
      getHeader(name) { return headers[name]; },
      writeHead(code, hdrs) {
        statusCode = code;
        if (hdrs) for (const k of Object.keys(hdrs)) headers[k] = hdrs[k];
      },
      write(chunk) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
      end(chunk) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        done();
      },
      redirect(code, location) {
        if (typeof code === "string") { location = code; code = 302; }
        statusCode = code;
        headers["Location"] = location;
        done();
      },
    };

    try {
      handler(req, res);
    } catch (err) {
      context.error("addon handler threw synchronously", err);
      return { status: 500, body: "handler error" };
    }
    await finished;

    return {
      status: statusCode,
      headers,
      body: Buffer.concat(chunks),
    };
  },
});

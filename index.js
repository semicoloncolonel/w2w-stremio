const { serveHTTP } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

const port = process.env.PORT || 7500;

serveHTTP(addonInterface, { port });
console.log(`W2W Stremio addon running at http://localhost:${port}`);
console.log(`Configure at http://localhost:${port}/configure`);

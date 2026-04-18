// Storage abstraction with two interchangeable backends:
// - "blob": Vercel Blob (production, persistent across deploys)
// - "file": local filesystem under .cache/storage/ (development, tests)
//
// The active backend is read from process.env.STORAGE_BACKEND on every call
// so tests can swap it without re-requiring the module.
//
// All keys are forward-slashed paths (e.g. "catalog/oscars/movie.json"). The
// file backend translates these to platform-native paths internally and
// normalizes them back to forward slashes when returned from listKeys.

const fs = require("fs/promises");
const path = require("path");

const FILE_ROOT_DEFAULT = ".cache/storage";

function getStorageRoot() {
  // Tests can pin the file backend to a temp dir without touching cwd.
  if (process.env.STORAGE_ROOT) {
    return process.env.STORAGE_ROOT;
  }
  return path.join(process.cwd(), FILE_ROOT_DEFAULT);
}

function selectBackend() {
  const explicit = process.env.STORAGE_BACKEND;
  let value = explicit;
  if (!value) {
    value = process.env.VERCEL === "1" ? "blob" : "file";
  }
  if (value === "blob") return blobBackend;
  if (value === "file") return fileBackend;
  throw new Error(`Unknown STORAGE_BACKEND: ${value}`);
}

// ---------------------------------------------------------------------------
// File backend
// ---------------------------------------------------------------------------

const fileBackend = {
  async putJSON(key, data) {
    const full = path.join(getStorageRoot(), key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, JSON.stringify(data), "utf8");
  },

  async getJSON(key) {
    const full = path.join(getStorageRoot(), key);
    try {
      const raw = await fs.readFile(full, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },

  async listKeys(prefix) {
    const root = getStorageRoot();
    let entries;
    try {
      entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    const keys = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // entry.parentPath is the absolute directory containing the file (Node 20+).
      const parentDir = entry.parentPath || entry.path || root;
      const abs = path.join(parentDir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (!prefix || rel.startsWith(prefix)) {
        keys.push(rel);
      }
    }
    return keys;
  },
};

// ---------------------------------------------------------------------------
// Blob backend (lazy require so the file backend works without the package
// being usable / a token being set)
// ---------------------------------------------------------------------------

const blobBackend = {
  async putJSON(key, data) {
    const { put } = require("@vercel/blob");
    await put(key, JSON.stringify(data), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  },

  async getJSON(key) {
    const { list } = require("@vercel/blob");
    const result = await list({ prefix: key, limit: 1 });
    const blob = result.blobs.find((b) => b.pathname === key);
    if (!blob) return null;
    const res = await fetch(blob.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch blob ${key}: ${res.status} ${res.statusText}`);
    }
    return res.json();
  },

  async listKeys(prefix) {
    const { list } = require("@vercel/blob");
    const keys = [];
    let cursor;
    do {
      const result = await list({ prefix, cursor });
      for (const blob of result.blobs) {
        keys.push(blob.pathname);
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    return keys;
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function putJSON(key, data) {
  return selectBackend().putJSON(key, data);
}

async function getJSON(key) {
  return selectBackend().getJSON(key);
}

async function listKeys(prefix) {
  return selectBackend().listKeys(prefix);
}

module.exports = { putJSON, getJSON, listKeys };

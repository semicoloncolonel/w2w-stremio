const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Tests cover the file backend only. The blob backend requires a real
// BLOB_READ_WRITE_TOKEN and a network round-trip to Vercel Blob; mocking
// `@vercel/blob` would only verify that we call functions we already inspected,
// so we skip it here. Round-trip behavior across backends is asserted by
// keeping their public surfaces identical.

const ORIGINAL_ENV = { ...process.env };

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2w-storage-"));
  process.env.STORAGE_BACKEND = "file";
  process.env.STORAGE_ROOT = path.join(tmpDir, ".cache", "storage");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

function freshStorage() {
  // selectBackend() reads env on every call, but require'ing fresh keeps the
  // test isolated from any module-state surprises.
  jest.resetModules();
  return require("../../lib/storage");
}

describe("file backend", () => {
  test("putJSON then getJSON round-trips a nested object at a nested key", async () => {
    const storage = freshStorage();
    const data = { title: "Oppenheimer", year: 2023, cast: ["Cillian", "Emily"] };
    await storage.putJSON("catalog/oscars/movie.json", data);
    const got = await storage.getJSON("catalog/oscars/movie.json");
    expect(got).toEqual(data);
  });

  test("getJSON returns null for a key that was never written", async () => {
    const storage = freshStorage();
    expect(await storage.getJSON("missing/key.json")).toBeNull();
  });

  test("putJSON overwrites an existing key", async () => {
    const storage = freshStorage();
    await storage.putJSON("catalog/a.json", { v: 1 });
    await storage.putJSON("catalog/a.json", { v: 2 });
    expect(await storage.getJSON("catalog/a.json")).toEqual({ v: 2 });
  });

  test("listKeys returns prefix-matching keys with forward slashes and excludes others", async () => {
    const storage = freshStorage();
    await storage.putJSON("catalog/oscars/movie.json", { id: 1 });
    await storage.putJSON("catalog/oscars/series.json", { id: 2 });
    await storage.putJSON("catalog/cannes/movie.json", { id: 3 });
    await storage.putJSON("other/note.json", { id: 4 });

    const keys = await storage.listKeys("catalog/");
    expect(keys.sort()).toEqual(
      [
        "catalog/cannes/movie.json",
        "catalog/oscars/movie.json",
        "catalog/oscars/series.json",
      ].sort()
    );
    for (const k of keys) {
      expect(k).not.toContain("\\");
    }
  });

  test("listKeys returns [] when the storage root does not exist yet", async () => {
    const storage = freshStorage();
    expect(await storage.listKeys("anything/")).toEqual([]);
  });
});

describe("backend selection", () => {
  test("throws a helpful error when STORAGE_BACKEND is an unknown value", async () => {
    const storage = freshStorage();
    process.env.STORAGE_BACKEND = "garbage";
    await expect(storage.getJSON("x")).rejects.toThrow("Unknown STORAGE_BACKEND: garbage");
  });
});

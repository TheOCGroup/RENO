import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";

test("constructor preserves original SQLite initialization error when close also throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-double-failure-"));
  const path = join(dir, "corrupt.db");
  const invalidBytes = Buffer.from("this is not a SQLite database and must not be overwritten");
  writeFileSync(path, invalidBytes);
  const originalClose = DatabaseSync.prototype.close;
  let closeCalls = 0;
  try {
    DatabaseSync.prototype.close = function (...args) {
      closeCalls++;
      originalClose.apply(this, args);
      throw new Error("injected_cleanup_failure");
    };
    assert.throws(() => new MissionControlStore(path), error => {
      assert.match(error.message, /file is not a database/i);
      assert.doesNotMatch(error.message, /injected_cleanup_failure/);
      return true;
    });
    assert.equal(closeCalls, 1);
    assert.deepEqual(readFileSync(path), invalidBytes);
  } finally {
    DatabaseSync.prototype.close = originalClose;
    rmSync(dir, { recursive: true, force: true });
  }
});

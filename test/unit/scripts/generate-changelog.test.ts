import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/generate-changelog.mjs", import.meta.url),
);
let directory: string;

function init() {
  return Bun.spawn([process.execPath, script, "init"], {
    cwd: directory,
    stdout: "ignore",
    stderr: "ignore",
  }).exited;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ecs-pf-changelog-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("changelog init", () => {
  it("creates a complete changelog even with concurrent initializers", async () => {
    expect(await Promise.all(Array.from({ length: 8 }, () => init()))).toEqual(
      Array(8).fill(0),
    );
    const content = readFileSync(join(directory, "CHANGELOG.md"), "utf8");
    expect(content.startsWith("# Changelog\n")).toBe(true);
    expect(content.endsWith("従っています。\n\n")).toBe(true);
  });

  it("preserves an existing changelog", async () => {
    const path = join(directory, "CHANGELOG.md");
    writeFileSync(path, "Existing release notes\n");
    expect(await init()).toBe(0);
    expect(readFileSync(path, "utf8")).toBe("Existing release notes\n");
  });

  it("does not follow a dangling symlink to create another file", async () => {
    const target = join(directory, "target.md");
    symlinkSync(target, join(directory, "CHANGELOG.md"));
    expect(await init()).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  it("does not overwrite a symlink target", async () => {
    const target = join(directory, "target.md");
    writeFileSync(target, "Keep this content");
    symlinkSync(target, join(directory, "CHANGELOG.md"));
    expect(await init()).toBe(0);
    expect(readFileSync(target, "utf8")).toBe("Keep this content");
  });
});

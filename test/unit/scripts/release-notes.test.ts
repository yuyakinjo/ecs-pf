import { describe, expect, it } from "bun:test";
import {
  breakingChanges,
  type Commit,
  parseLog,
  releaseNotes,
} from "../../../scripts/release-notes.ts";

function commit(subject: string, body = ""): Commit {
  return { subject, body };
}

describe("parseLog", () => {
  it("NUL 区切りで件名と本文に切り分ける", () => {
    expect(parseLog("feat: a\n\nbody of a\0fix: b\0")).toEqual([
      { subject: "feat: a", body: "body of a" },
      { subject: "fix: b", body: "" },
    ]);
  });

  it("空の区切りを落とす (末尾の NUL で空要素が出る)", () => {
    expect(parseLog("\0\0fix: only\0\0")).toEqual([
      { subject: "fix: only", body: "" },
    ]);
  });

  it("履歴が無ければ空になる", () => {
    expect(parseLog("")).toEqual([]);
  });
});

describe("breakingChanges", () => {
  it("`type!:` の説明を拾う", () => {
    expect(breakingChanges([commit("feat!: drop node 20")])).toEqual([
      "drop node 20",
    ]);
  });

  it("scope 付きの `type(scope)!:` も拾う", () => {
    expect(breakingChanges([commit("refactor(cli)!: rename connect")])).toEqual(
      ["rename connect"],
    );
  });

  it("`BREAKING CHANGE:` フッタを拾う", () => {
    expect(
      breakingChanges([
        commit("feat: exit codes", "BREAKING CHANGE: usage errors exit 2"),
      ]),
    ).toEqual(["usage errors exit 2"]);
  });

  it("ハイフン表記のフッタも拾う", () => {
    expect(breakingChanges([commit("feat: x", "BREAKING-CHANGE: y")])).toEqual([
      "y",
    ]);
  });

  it("両方あればフッタを採る (そちらが詳しく書ける)", () => {
    expect(
      breakingChanges([
        commit("feat!: short", "BREAKING CHANGE: the long explanation"),
      ]),
    ).toEqual(["the long explanation"]);
  });

  it("普通のコミットは拾わない", () => {
    expect(
      breakingChanges([
        commit("fix: typo"),
        commit("chore: bump deps", "just a body"),
      ]),
    ).toEqual([]);
  });

  it("コミットの並び順を保つ", () => {
    expect(
      breakingChanges([
        commit("feat!: first"),
        commit("fix: unrelated"),
        commit("feat!: second"),
      ]),
    ).toEqual(["first", "second"]);
  });
});

describe("releaseNotes", () => {
  it("破壊的変更を先頭に出す", () => {
    const notes = releaseNotes("2026.914.1830", [
      commit("feat!: drop node 20"),
      commit("fix: typo"),
    ]);
    expect(notes.indexOf("## Breaking changes")).toBeLessThan(
      notes.indexOf("## Changes"),
    );
    expect(notes).toContain("- drop node 20");
  });

  it("破壊的変更が無ければその節を出さない", () => {
    const notes = releaseNotes("2026.914.1830", [commit("fix: typo")]);
    expect(notes).not.toContain("## Breaking changes");
    expect(notes).toContain("## Changes");
  });

  it("全部の件名を並べる", () => {
    const notes = releaseNotes("2026.914.1830", [
      commit("fix: a"),
      commit("feat: b"),
    ]);
    expect(notes).toContain("- fix: a");
    expect(notes).toContain("- feat: b");
  });

  it("そのバージョンの導入方法を示す", () => {
    expect(releaseNotes("2026.914.1830", [])).toContain(
      "npx ecs-pf@2026.914.1830 connect",
    );
  });

  it("末尾を改行で終える", () => {
    expect(releaseNotes("2026.914.1830", [commit("fix: a")])).toEndWith("\n");
  });
});

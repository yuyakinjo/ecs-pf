/**
 * リリースの手順が壊れていないことを担保する。
 *
 * publish してから気づいても取り消せないので、ワークフローと manifest の
 * 「これを外すと事故る」点だけを本文から読んで押さえる。
 */
import { beforeAll, describe, expect, it } from "bun:test";

interface Manifest {
  version: string;
  files: string[];
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

let workflow: string;
let manifest: Manifest;

beforeAll(async () => {
  workflow = await Bun.file(".github/workflows/release.yml").text();
  manifest = (await Bun.file("package.json").json()) as Manifest;
});

describe("リリースの手順", () => {
  it("手で実行するときだけ動く (タグは引き金ではなく結果)", () => {
    expect(workflow).toContain("workflow_dispatch");
    // タグを引き金にすると、番号を人が決めることになる
    expect(workflow).not.toMatch(/^on:\s*\n\s*push:\s*\n\s*tags:/m);
    expect(workflow).not.toMatch(/^on:\s*\n\s*release:/m);
  });

  it("バージョンは日付から決める", () => {
    expect(workflow).toContain("version:next");
    expect(manifest.scripts["version:next"]).toBe(
      "bun scripts/next-version.ts",
    );
  });

  it("Release の本文は自前で組む (破壊的変更を落とさないため)", () => {
    expect(workflow).toContain("release-notes.ts");
    expect(workflow).toContain("--notes-file");
    // --generate-notes と併用するとどちらが残るか保証されない
    expect(workflow).not.toContain("--generate-notes");
  });

  it("全履歴を取る (リリースノートが直前のタグから読むため)", () => {
    expect(workflow).toContain("fetch-depth: 0");
  });

  it("トークンではなく OIDC で公開する", () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("--provenance");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toMatch(/secrets\.\w*NPM/);
  });

  it("公開の前に ci とテストを通している", () => {
    const ciAt = workflow.indexOf("bun run ci");
    const testAt = workflow.indexOf("bun run test");
    const publishAt = workflow.indexOf("npm publish");
    expect(ciAt).toBeGreaterThan(0);
    expect(testAt).toBeGreaterThan(0);
    expect(publishAt).toBeGreaterThan(ciAt);
    expect(publishAt).toBeGreaterThan(testAt);
  });

  it("公開が通ってからタグを打つ", () => {
    // 逆順だと、公開できていないのにバージョンだけ進んだ履歴が残る
    const publishAt = workflow.indexOf("npm publish");
    const tagAt = workflow.indexOf("git tag");
    expect(tagAt).toBeGreaterThan(publishAt);
  });

  it("公開したものを main にも記録する", () => {
    // 記録しないと main の package.json が公開版とずれ続ける。
    // これが通るように main の ruleset から pull_request を外してある
    // (docs/RELEASE.md)
    expect(workflow).toContain("git push origin HEAD --tags");
  });

  it("試し打ちができる", () => {
    expect(workflow).toContain("dry-run");
    expect(workflow).toContain("if: ${{ !inputs.dry-run }}");
  });

  it("同時に 2 本走らせない (同じ分の番号で衝突する)", () => {
    expect(workflow).toMatch(/concurrency:\s*\n\s*group: release/);
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("publish するワークフローは 1 本だけ", async () => {
    // release: published を引き金にした publish.yml と併存させると、
    // 同じバージョンを二重に publish して必ず失敗する
    expect(await Bun.file(".github/workflows/publish.yml").exists()).toBe(
      false,
    );
  });
});

describe("公開するパッケージ", () => {
  it("dist と README だけを同梱する", () => {
    // CHANGELOG.md は凍結したので配らない (履歴は GitHub Releases)
    expect(manifest.files.sort()).toEqual(["README.md", "dist/**/*"]);
  });

  it("publish 時にソースを書き換えない", () => {
    // prepublishOnly は npm publish の中で走る。ここで --fix すると、
    // 公開するものと commit するものがずれる
    expect(manifest.scripts.prepublishOnly).toBe("bun run check:dry");
    expect(manifest.scripts["check:dry"]).not.toContain("--fix");
  });

  it("CHANGELOG 生成の道具を残していない", () => {
    expect(
      Object.keys(manifest.scripts).filter((name) =>
        name.includes("changelog"),
      ),
    ).toEqual([]);
    expect(
      Object.keys(manifest.devDependencies).filter((name) =>
        name.includes("conventional-changelog"),
      ),
    ).toEqual([]);
  });

  it("build がバージョンを焼き直す (src/version.ts は生成物)", () => {
    expect(manifest.scripts.build).toContain("generate-version");
  });
});

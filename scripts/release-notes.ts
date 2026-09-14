#!/usr/bin/env bun
/**
 * GitHub Release の本文を組み立てる。
 *
 *   bun scripts/release-notes.ts 2026.914.1830 > notes.md
 *
 * CalVer の番号は日付なので、**互換性を伝えられない**。`2.x` から `3.x` の
 * ような合図が無いので、破壊的変更は番号ではなく本文で知らせるしかない。
 * Conventional Commits の `!` と `BREAKING CHANGE:` フッタを拾って先頭に出す。
 *
 * `gh release create --generate-notes` は使わない。`--notes-file` と併用した
 * ときにどちらが残るかが保証されておらず、破壊的変更が黙って落ちうるため。
 */

export interface Commit {
  /** 1 行目 */
  subject: string;
  /** 2 行目以降 */
  body: string;
}

/** `type(scope)!: description` の `!` */
const BANG = /^(?<type>\w+)(?<scope>\([^)]*\))?!:\s*(?<description>.+)$/;

/** `BREAKING CHANGE:` / `BREAKING-CHANGE:` フッタ */
const FOOTER = /^BREAKING[ -]CHANGE:\s*(?<description>.+)$/im;

/**
 * 破壊的変更の説明を、コミットの並び順で返す。
 *
 * `!` とフッタの両方がある場合はフッタを採る (そちらが詳しく書ける)
 */
export function breakingChanges(commits: readonly Commit[]): string[] {
  const changes: string[] = [];
  for (const commit of commits) {
    const footer = FOOTER.exec(commit.body)?.groups?.["description"];
    if (footer !== undefined) {
      changes.push(footer.trim());
      continue;
    }
    const bang = BANG.exec(commit.subject)?.groups?.["description"];
    if (bang !== undefined) changes.push(bang.trim());
  }
  return changes;
}

/** 履歴を追いたい人のために、全部の件名も並べる */
export function releaseNotes(
  version: string,
  commits: readonly Commit[],
): string {
  const sections: string[] = [];

  const breaking = breakingChanges(commits);
  if (breaking.length > 0) {
    sections.push(
      [
        "## Breaking changes",
        "",
        "Version numbers are dates, so they cannot tell you whether an upgrade",
        "is safe. Read this before upgrading.",
        "",
        ...breaking.map((change) => `- ${change}`),
      ].join("\n"),
    );
  }

  sections.push(
    ["## Changes", "", ...commits.map((commit) => `- ${commit.subject}`)].join(
      "\n",
    ),
  );

  sections.push(
    ["## Install", "", "```sh", `npx ecs-pf@${version} connect`, "```"].join(
      "\n",
    ),
  );

  return `${sections.join("\n\n")}\n`;
}

/** `git log` の出力を Commit に切り分ける (区切りは NUL) */
export function parseLog(log: string): Commit[] {
  return log
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const newline = entry.indexOf("\n");
      return newline === -1
        ? { subject: entry, body: "" }
        : {
            subject: entry.slice(0, newline),
            body: entry.slice(newline + 1).trim(),
          };
    });
}

if (import.meta.main) {
  const version = process.argv[2];
  if (version === undefined) {
    console.error("usage: bun scripts/release-notes.ts <version>");
    process.exit(2);
  }

  // 直前のタグから今回まで。タグが 1 つも無ければ全履歴
  const described = Bun.spawnSync(["git", "describe", "--tags", "--abbrev=0"]);
  const previous = described.success
    ? described.stdout.toString().trim()
    : undefined;
  const range = previous === undefined ? "HEAD" : `${previous}..HEAD`;

  const log = Bun.spawnSync(["git", "log", range, "--format=%B%x00"]);
  console.log(releaseNotes(version, parseLog(log.stdout.toString())));
}

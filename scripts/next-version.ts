#!/usr/bin/env bun
/**
 * バージョンを時刻から決める (CalVer `YYYY.MMdd.HHmm`、UTC)。
 *
 *   bun scripts/next-version.ts           番号を出すだけ
 *   bun scripts/next-version.ts --write   package.json を書き換える
 *
 * 時刻だけで決まるので、公開済みの一覧やタグを調べる必要がない。
 * 番号は単調に増え、衝突もしない (同じ分に 2 回出さない限り)。
 *
 * `yyyy.MM.dd.HHmm` の 4 つ組にしないのは、npm がそれを
 * `2026.9.14-18.30` という**プレリリース**として解釈してしまうため。
 * エラーにはならず、通常のインストールで拾われなくなる。
 *
 * `src/version.ts` はここでは触らない。`bun run build` の第 1 段
 * (`generate-version`) が package.json から毎回作り直すので、
 * 書き換える場所を 2 つに増やすとずれる余地が生まれる。
 */

/** 日付と時刻を 3 つ組に畳んだ形。先頭ゼロは semver で不正なので付けない */
export const CALVER = /^(\d{4})\.(\d{3,4})\.(\d{1,4})$/;

/**
 * `Temporal.ZonedDateTime` のうち、この計算で読む部分だけ。
 *
 * 構造だけを要求するので、Temporal の型定義が無い環境でも
 * この関数と単体テストは型が付く。
 */
export interface DateTimeParts {
  readonly year: number;
  /** 1-12 (`Date#getUTCMonth` の 0 始まりではない) */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** その文字列が CalVer として妥当か (月日と時分の範囲まで見る) */
export function isCalVer(version: string): boolean {
  const match = CALVER.exec(version);
  if (match === null) return false;
  // 先頭ゼロは semver として不正 (npm が黙って解釈を変える)
  if (match.slice(1).some((part) => part.length > 1 && part.startsWith("0"))) {
    return false;
  }

  const date = Number(match[2]);
  const time = Number(match[3]);
  const month = Math.floor(date / 100);
  const day = date % 100;
  const hour = Math.floor(time / 100);
  const minute = time % 100;

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31 &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

/**
 * @param now 基準にする時刻。`Temporal.ZonedDateTime` なので、どの時間帯で
 *   読むかが値そのものに入っている (`Date` のように getUTC* を呼び忘れる余地がない)
 */
export function calver(now: DateTimeParts): string {
  const date = now.month * 100 + now.day;
  const time = now.hour * 100 + now.minute;
  return `${now.year}.${date}.${time}`;
}

if (import.meta.main) {
  // UTC で決める。手元と CI で番号がぶれないため
  const version = calver(Temporal.Now.zonedDateTimeISO("UTC"));

  if (process.argv.includes("--write")) {
    const manifest = await Bun.file("package.json").text();
    const updated = manifest.replace(
      /"version": "[^"]*"/,
      `"version": "${version}"`,
    );
    if (updated === manifest) {
      console.error("package.json の version を書き換えられなかった");
      process.exit(1);
    }
    await Bun.write("package.json", updated);
  }

  console.log(version);
}

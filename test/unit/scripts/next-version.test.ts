import { describe, expect, it } from "bun:test";
import {
  calver,
  type DateTimeParts,
  isCalVer,
} from "../../../scripts/next-version.ts";

function at(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): DateTimeParts {
  return { year, month, day, hour, minute };
}

describe("calver", () => {
  it("日付と時刻を 3 つ組に畳む", () => {
    expect(calver(at(2026, 9, 14, 18, 30))).toBe("2026.914.1830");
  });

  it("先頭ゼロを付けない (semver として不正で npm が解釈を変える)", () => {
    expect(calver(at(2026, 1, 1, 0, 5))).toBe("2026.101.5");
    expect(calver(at(2026, 9, 14, 9, 34))).toBe("2026.914.934");
  });

  it("真夜中は時刻が 0 になる", () => {
    expect(calver(at(2026, 12, 31, 0, 0))).toBe("2026.1231.0");
  });

  it("年内で単調に増える", () => {
    const versions = [
      calver(at(2026, 1, 1, 0, 0)),
      calver(at(2026, 1, 1, 0, 1)),
      calver(at(2026, 1, 2, 0, 0)),
      calver(at(2026, 9, 14, 18, 30)),
      calver(at(2026, 12, 31, 23, 59)),
    ];
    expect(versions).toEqual([
      "2026.101.0",
      "2026.101.1",
      "2026.102.0",
      "2026.914.1830",
      "2026.1231.2359",
    ]);
    expect(versions.every((version) => isCalVer(version))).toBe(true);
  });

  it("出力は必ず 3 つ組 (4 つ組は npm がプレリリース扱いする)", () => {
    expect(calver(at(2026, 9, 14, 18, 30)).split(".")).toHaveLength(3);
  });
});

describe("isCalVer", () => {
  it("妥当な番号を通す", () => {
    expect(isCalVer("2026.914.1830")).toBe(true);
    expect(isCalVer("2026.101.5")).toBe(true);
    expect(isCalVer("2026.1231.2359")).toBe(true);
    expect(isCalVer("2026.914.0")).toBe(true);
  });

  it("先頭ゼロを弾く", () => {
    expect(isCalVer("2026.0914.1830")).toBe(false);
    expect(isCalVer("2026.914.0930")).toBe(false);
  });

  it("月日と時分の範囲を見る", () => {
    expect(isCalVer("2026.1314.1830")).toBe(false); // 13 月
    expect(isCalVer("2026.932.1830")).toBe(false); // 32 日
    expect(isCalVer("2026.914.2430")).toBe(false); // 24 時
    expect(isCalVer("2026.914.1860")).toBe(false); // 60 分
  });

  it("移行前の semver を CalVer と間違えない", () => {
    expect(isCalVer("2.2.28")).toBe(false);
    expect(isCalVer("1.0.1")).toBe(false);
  });

  it("4 つ組やプレリリースを弾く", () => {
    expect(isCalVer("2026.9.14.1830")).toBe(false);
    expect(isCalVer("2026.914.1830-rc.1")).toBe(false);
    expect(isCalVer("v2026.914.1830")).toBe(false);
  });
});

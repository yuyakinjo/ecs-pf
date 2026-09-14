# リリース

## 出し方

GitHub の Actions タブから **release** ワークフローを手で実行する。それだけ。

- `dry-run` にチェックを入れると、**publish せず**に決まるバージョンとリリースノートだけを出す。
  結果は実行結果ページの Summary に出るので、先に中身を見てから本番を回せる。
- バージョンを入力する欄は無い。実行した時刻から決まる。
- タグを push してもリリースは始まらない。タグは引き金ではなく**結果**。

ワークフローの中身は [`.github/workflows/release.yml`](../.github/workflows/release.yml)。
手順が壊れていないことは [`test/unit/scripts/release-workflow.test.ts`](../test/unit/scripts/release-workflow.test.ts)
が本文を読んで担保しているので、ここを書き換えるとテストが落ちる。

## バージョンは日付 (CalVer)

`YYYY.MMdd.HHmm` を UTC で作る。例: `2026.914.1830` は 2026-09-14 18:30 UTC。

生成は [`scripts/next-version.ts`](../scripts/next-version.ts)。

時刻だけで決まるので、公開済みの一覧やタグを調べる必要がない。番号は単調に増え、
同じ分に 2 回出さない限り衝突しない (同時実行は `concurrency: release` で止めている)。

形式の制約が 2 つある。どちらも npm の semver 解釈に由来する。

- **`yyyy.MM.dd.HHmm` の 4 つ組にしない。** npm がそれを `2026.9.14-18.30` という
  **プレリリース**として解釈するため。エラーにはならず、通常のインストールで拾われなくなる。
  月日と時分をそれぞれ 1 つに畳んで 3 つ組にしている。
- **先頭ゼロを付けない。** `2026.0914.1830` は semver として不正で、npm が黙って解釈を変える。
  9 時 34 分は `934`、真夜中は `0`。

`2.2.28` までは semver だった。`2026 > 2` なので npm の `latest` は素直に進む。
タグも `v2.2.28` から `v2026.914.1830` に変わるが、`git describe --tags --abbrev=0` は
どちらの形式でも直前のタグを返すので、リリースノートの範囲計算は連続する。

### 利用者側の指定

番号が日付なので `^` は意味を持たない (`^2026.914.1830` は年内なら何でも許す)。
`npx ecs-pf@<version>` のように固定して使うことを勧める。ecs-pf 自身も依存の
`decopin-cli` を完全固定で指定している。

## 認証は Trusted Publishing (OIDC)

`NPM_TOKEN` は使わない。secrets に長期トークンを置かない。

npm 側の trusted publisher は次の内容で登録してある。**ワークフロー名で束縛される**ので、
`release.yml` をリネームすると publish が認証に失敗する。

| 項目                | 値            |
| ------------------- | ------------- |
| Organization / User | `yuyakinjo`   |
| Repository          | `ecs-pf`      |
| Workflow            | `release.yml` |
| Environment         | (空欄)        |

publish は `npm publish --provenance --access public`。provenance を付けるために
ビルドとテストは bun、publish だけ npm CLI を使っている。

publish するワークフローは `release.yml` の 1 本だけにしてある。以前は
`release: published` を引き金にした `publish.yml` が併存していて、`release.yml` が
publish した直後に同じバージョンをもう一度 publish しようとして必ず失敗していた。

## リリースノート

CHANGELOG.md は持たない。履歴は GitHub Releases で辿る。
[`CHANGELOG.md`](../CHANGELOG.md) は `v2.2.28` までの記録として凍結してある。

本文は [`scripts/release-notes.ts`](../scripts/release-notes.ts) が組み立てる。
直前のタグから `HEAD` までの `git log` を読んで、

- **Breaking changes** — Conventional Commits の `type(scope)!:` と `BREAKING CHANGE:` フッタ
  (両方あればフッタを採る)
- **Changes** — 全コミットの件名
- **Install** — そのバージョンの `npx` コマンド

を出す。CalVer の番号は日付なので、`2.x` → `3.x` のような互換性の合図が出せない。
破壊的変更は番号ではなく本文で知らせるしかないので、先頭に置いている。

`gh release create --generate-notes` は使わない。`--notes-file` と併用したときに
どちらが残るかが保証されておらず、破壊的変更が黙って落ちうるため。

## 前提: main への直 push が通ること

ワークフローは publish が通ってから `chore: release <version>` を commit して
`git push origin HEAD --tags` する。ここが通らないとリリースを記録できない。

そのため main の ruleset (`main`, id `6468579`) から **`pull_request` ルールを外してある**。

| ルール             | 状態       | 理由                               |
| ------------------ | ---------- | ---------------------------------- |
| `deletion`         | 有効       | main の削除を防ぐ                  |
| `non_fast_forward` | 有効       | 履歴の書き換えを防ぐ               |
| `pull_request`     | **外した** | リリースのコミットが push できない |

日々の変更を PR 経由にする運用は変えていない。強制されなくなっただけ。

`pull_request` を残したまま GitHub Actions を bypass actor に指定する道は取れない。
bypass に指定できる Integration は org 所有リポジトリが前提で、ecs-pf は個人アカウント
所有のため API が 422 を返す
(`Actor GitHub Actions integration must be part of the ruleset source or owner organization`)。
手本にしている decopin-cli はそもそも ruleset を 1 つも持っていない。

`pull_request` が有効だった間、release ワークフローは **10 回連続で失敗**していた。
毎回 publish の手前ではなく後段の push で
`GH013: Repository rule violations found for refs/heads/main` になっていた。

元に戻す場合はこれを流す。ただし**戻すとリリースが再び失敗する**。

```sh
gh api -X PUT repos/yuyakinjo/ecs-pf/rulesets/6468579 --input - <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "exclude": [], "include": ["~DEFAULT_BRANCH"] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "require_extra_approval_for_unattributed_changes": true,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    }
  ]
}
JSON
```

## 事故ったときの話

publish の後に push で失敗した場合、npm には出ているがリポジトリにコミットとタグが
無い状態になる。**同じバージョンを publish し直すことはできない**ので、復旧は手で行う。

```sh
git fetch origin
git checkout main
bun scripts/next-version.ts --write   # 出てしまった版に合わせる場合は手で書く
bun run generate-version              # src/version.ts を追随させる
git add package.json src/version.ts
git commit -m "chore: release <version>"
git tag "v<version>"
git push origin HEAD --tags
bun scripts/release-notes.ts "<version>" > notes.md
gh release create "v<version>" --notes-file notes.md
```

逆 (publish の前にタグを打つ) にすると、公開できていないのにバージョンだけ進んだ履歴が
残る。そちらのほうが後始末が面倒なので、この順序を選んでいる。

## src/version.ts は生成物

[`src/version.ts`](../src/version.ts) は git 管理下にあるが手で編集しない。
`bun run build` の第 1 段 (`bun run generate-version`) が package.json から毎回作り直す。

`next-version.ts --write` が package.json だけを書き換えるのは、書き換える場所を
2 つに増やすとずれる余地が生まれるため。リリースの途中で
`bun dist/index.js --version` が出す番号と決めた番号を突き合わせているので、
ずれたまま publish されることはない。

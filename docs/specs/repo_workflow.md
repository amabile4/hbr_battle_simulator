# Repo Workflow

> **ステータス**: 📚 参照 | 📅 作成: 2026-03-15

## 目的

- このリポジトリ固有の branch 運用、merge 方針、shared 変更の流し方をまとめる
- `AGENTS.md` / `CLAUDE.md` に長い運用説明を持たせず、詳細はこの文書へ集約する
- `ui-next` と engine 改修を並行で進めても、shared 層の正本を見失わないようにする

## 正本ブランチ

- `main` を安定した共通土台として扱う
- shared asset、shared resolver、shared contract、既存 engine の確定 bugfix は `main` に入れる
- `main` は feature branch 間の共有変更を受け渡すハブとする

## ブランチ命名

- 既存 engine 改修: `feature/engine-<topic>`
- 新 UI: `feature/ui-next-<topic>`

補足:

- `ui-next` は既存 `ui/` の改造ブランチではなく、新規 UI 実装の作業場所として扱う
- shared 化が必要な変更は、feature branch の中だけで正本化しない

## Merge 方針

- `feature/ui-next-*` と `feature/engine-*` の間で直接 merge しない
- shared したい変更は `main` を経由して伝播させる
- engine bugfix や shared 変更を `ui-next` 側だけで正本化しない
- `feature/ui-next-*` は `main` を定期的に取り込み、engine 側の bugfix や shared 変更を追従してよい
- 履歴の明快さを優先し、必要なら `merge main` を選んでよい

## 変更の流れ

### 1. 新 UI 専用変更

- `feature/ui-next-*` で作業する
- 新ページ、新 UI ロジック、新 UI 専用 docs はその branch で進める
- engine 本体に reusable でない暫定実装を混ぜない

### 2. engine 共通変更

- `feature/engine-*` で作業する
- shared 変更や bugfix は `main` に戻す
- 必要なら `ui-next` 側が `main` から取り込む

### 3. shared 変更

- asset、resolver、adapter contract など、複数 branch で使うものは `main` を正本にする
- `ui-next` 側だけで作った shared 変更を長く抱え込まない

## 日常運用

### UI Next を進める日

1. `main` を最新にする
2. `feature/ui-next-<topic>` を切るか、既存 branch を更新する
3. 新 UI の変更はその branch で進める
4. engine bugfix が `main` に入ったら、必要なタイミングで `main` を取り込む

### engine 改修を進める日

1. `main` を最新にする
2. `feature/engine-<topic>` を切るか、既存 branch を更新する
3. engine 本体の修正はその branch で進める
4. shared 変更は `main` へ戻してから他 branch へ流す

## Git 実行安全ルール

- 同じ repo で複数の `git` コマンドを並列実行しない
- 特に `git add` / `git commit` / `git push` / `git merge` / `git switch` / `git checkout` / `git fetch` / `git pull` / `git rebase` を同時に走らせない
- `multi_tool_use.parallel` のような並列実行手段で複数の git 操作をまとめて投げない
- git は必ず直列に実行し、1 つのコマンドが完全に終了してから次へ進む

## Lock エラー時の扱い

- `index.lock` などの lock エラーが出たら、まず現行の git プロセスや lock の残存を確認する
- 安全確認前に機械的な再試行や削除をしない
- 並列実行が原因の可能性を先に疑う

## Commit / Push 手順

1. 変更内容を確認する
2. `git add` を実行する
3. `git commit` が完了したことを確認する
4. その後に `git push` を実行する
5. `HEAD` と tracking branch が一致していることを確認する

## この文書を更新する時

- branch 命名
- merge 方針
- shared 変更の流し方
- git 運用安全ルール

これらの project-specific な運用が変わった時に更新する。

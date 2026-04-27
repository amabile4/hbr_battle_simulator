# Code Review Graph Workspace Setup

ステータス: ✅ 完了
最終更新: 2026-04-28

## 方針

Code Review Graph は、この workspace の `.venv` にインストールされた CLI だけを使用する。`uvx`、グローバル Python、グローバル PATH の `code-review-graph` には依存しない。

## 実行入口

- CLI: `scripts/code-review-graph-local`
- status: `npm run crg:status`
- file watcher: `npm run crg:watch`
- MCP server: `npm run crg:mcp`

`scripts/code-review-graph-local` は repo root を自動解決し、`./.venv/bin/code-review-graph` を実行する。`.venv` に CLI がない場合は失敗させ、別環境の CLI へフォールバックしない。

## MCP 設定

MCP クライアント設定は、クライアントによって `command` の相対パス解決基準が異なる。repo に push する共有設定へ個人環境の絶対パスを書かない。

ローカル環境で MCP をこの workspace の `.venv` に固定したい場合は、各ユーザーのローカル設定で `<repo>/scripts/code-review-graph-local serve` を起動する。Codex Desktop のグローバル MCP 設定はユーザーの Codex 設定ディレクトリにあるため、repo 内ファイルだけでは上書きされない。

## Git Hook

`.git/hooks/pre-commit` は機密情報チェック後、`scripts/code-review-graph-local detect-changes --brief` を実行する。Code Review Graph の失敗で commit 自体は止めない。

## 保存時更新

保存時に graph を更新したい場合は、作業中に `npm run crg:watch` を起動しておく。git hook は commit 時のみ実行され、ファイル保存時の常駐監視は watcher プロセスが担当する。

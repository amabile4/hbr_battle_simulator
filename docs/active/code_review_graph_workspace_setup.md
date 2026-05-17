# Code Review Graph Workspace Setup

ステータス: ✅ 完了
最終更新: 2026-05-17

## 方針

Code Review Graph は、`pipx` でインストールしたグローバル CLI を標準入口として使用する。macOS の system Python / Homebrew Python へ直接 `pip install` せず、`pipx install code-review-graph` で `code-review-graph` コマンドを PATH に置く。

## 実行入口

- CLI: `code-review-graph`
- status: `npm run crg:status`
- file watcher: `npm run crg:watch`
- MCP server: `npm run crg:mcp`

`scripts/code-review-graph-local` は過去の `.venv` 固定運用との互換用として残すが、新規設定や通常運用では使用しない。

## MCP 設定

MCP クライアント設定は、クライアントによって `command` の相対パス解決基準が異なる。repo に push する共有設定では `code-review-graph serve` を使い、個人環境の絶対パスや `uvx` に依存しない。

Codex Desktop のグローバル MCP 設定はユーザーの Codex 設定ディレクトリにあるため、repo 内ファイルだけでは上書きされない。複数 workspace で使う場合は、各 workspace で `code-review-graph install` と `code-review-graph build` を実行して有効化する。

Cursor / Qoder / VS Code / Gemini などの個別設定ディレクトリはローカル metadata として扱い、repo にはコミットしない。必要な設定は `code-review-graph install` で各ユーザー環境に生成する。

## Git Hook

`.git/hooks/pre-commit` は機密情報チェック後、`code-review-graph update` と `code-review-graph detect-changes --brief` を実行する。Code Review Graph の失敗で commit 自体は止めない。

## 保存時更新

保存時に graph を更新したい場合は、作業中に `npm run crg:watch` を起動しておく。git hook は commit 時のみ実行され、ファイル保存時の常駐監視は watcher プロセスが担当する。

Codex / Claude / Gemini などの AI クライアント hook も `code-review-graph update --skip-flows` を呼ぶ。hook 実行環境で PATH が極端に制限される場合だけ、ローカルのユーザー別設定で `/Users/<user>/.local/bin/code-review-graph` のような絶対パスを使う。

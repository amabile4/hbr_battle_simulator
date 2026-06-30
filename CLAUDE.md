# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際にClaude Code (claude.ai/code) にガイダンスを提供します。

## プロジェクト概要

これは「ヘブンバーンズレッド」のバトルシミュレータです。プレイヤーが戦闘行動を計画・記録するためのWebベースの戦術シミュレータで、特にSP（スキルポイント）管理とパーティー編成に焦点を当てています。

## アーキテクチャ

プロジェクトはモジュラーなHTML/CSS/JavaScript構成を使用：

- **HTML**: `hbr_gui_simulator_modular.html` - メインアプリケーション
- **CSS**: `/css/`フォルダで各UIセクション別に整理
- **JavaScript**: `/js/`フォルダで責任別にモジュール分割
- **データ**: `skillDatabase.json` - キャラクターとスキルデータ

## 現在のUI実装方針

- 現在の主実装対象は `ui-next/` です。
- `ui/` および `src/ui/` の `dom_adapter` 系は、過去に検討した旧 UI / 参照用ソースとして扱います。
- 新しい UI 体験や通常の機能追加では、旧 `dom_adapter` との parity を前提にせず、`ui-next/` と shared engine / replay / contract を優先して進めてください。
- 旧 `dom_adapter` 側の修正は、明示依頼がある場合、または shared contract の整合維持に必要な場合に限定します。

### 主要JavaScriptモジュール

- `globals.js` - グローバル変数と設定
- `data-manager.js` - データ読み込み・管理
- `party-manager.js` - パーティー編成・設定
- `display-manager.js` - UI表示・更新
- `event-handlers.js` - ユーザー操作・スキル管理
- `control-manager.js` - 戦闘制御・ターン管理
- `results-manager.js` - 結果表示・テーブル管理

## 核となる概念

### 戦闘システム

- **パーティー**: 6人編成（ポジション1-6）
- **配置**: 前衛（1-3）が行動可能、後衛（4-6）は待機
- **SP管理**: 各キャラクターのスキルポイント（0-20+）、毎ターン回復
- **ターンシステム**: 通常ターン、オーバードライブ（OD1-3）、追加ターンを含む

### 主要機能

- パーティー編成と配置入れ替え
- スキル選択とSPコスト管理  
- ターン別戦闘記録
- Google Spreadsheet互換のCSV出力

## 開発方法

クライアントサイドWebアプリケーションでビルド不要：

1. **ローカル実行**: `hbr_gui_simulator_modular.html`をブラウザで開く
2. **テスト**: ブラウザ開発者ツールでデバッグ
3. **データ編集**: `skillDatabase.json`でキャラクター・スキル変更

## ファイル構造

```
/css/              - UIセクション別スタイルシート
/js/               - 責任別JavaScriptモジュール
skillDatabase.json - キャラクター・スキルデータ
*.html             - アプリケーションエントリポイント
*.md               - ドキュメントファイル
```

## 重要な注意点

- 日本のゲームシミュレータでUIテキストは日本語
- SP回復、ターン種別、パーティー配置を含む複雑な戦闘状態を管理
- Google Spreadsheet互換の特定CSV形式でデータ出力
- モジュラー設計により保守性と機能追加が容易

## json/ フォルダの取り扱い

- `json/` フォルダ配下のファイルは全て **1行のminified JSON** であるため、`grep` / `rg` によるテキスト検索は機能しない。
- これらのファイルを検索・調査する際は必ず `jq` または `node` の JSON パーサーを使うこと。
  - 例（jq）: `cat json/foo.json | jq '.key'`
  - 例（node）: `node -e "const d=require('./json/foo.json'); console.log(JSON.stringify(d.key, null, 2))"`
- Grep ツールや grep コマンドで `json/` 以下を検索しない。

## Repo Workflow

- project 固有の branch 命名、merge 方針、shared 変更の流し方は [docs/specs/repo_workflow.md](docs/specs/repo_workflow.md) を参照する。
- 同じ repo で複数の `git` コマンドを並列実行しない。git は必ず直列に実行する。

## Documentation Conventions

- `docs/` 内のファイルを参照・更新する際は、必ず `docs/README.md` を確認し、記載のドキュメント管理ルールに従うこと。
- 実装タスクの完了時は、対応ドキュメントのステータス更新を実装とセットで行うこと（必須）。

## 開発原則（バグ修正・実装時の必須事項）

不具合修正・新規実装を行う前に必ず読むこと:
→ [docs/specs/dev_principles.md](docs/specs/dev_principles.md)

要点:
- 不具合発生時はまずエンジン層 / UI 層の切り分けを行う
- UI 層で誤魔化す修正（offset 加算・逆算・推測値）を行わない
- 既存の類似処理を確認してから実装する
- エンジンが既に正しいデータを返している場合、UI 側の参照ソースを直す

## E2Eテストに関するAIアシスタントへの指示

- 実装者は、自分が変更した範囲のテスト作成・更新・実行まで一貫して担当すること。
- browser 実挙動が論点の変更では、unit / integration test だけで閉じず、必要な Playwright coverage を追加・更新して自ら確認すること。
- `tests/e2e` や Playwright 関連設定も、対象変更に必要なら同じ実装者が修正してよい。
- 主対象 UI は `ui-next/` であり、Playwright も原則 `http://localhost:4173/ui-next/index.html` を起点に組むこと。
- 旧 `ui/` / `dom_adapter` 系は廃止済みであり、通常の実装判断の主対象にしない。

## Fixture Governance（実測値の扱い）

- fixture は「計算生成 fixture」と「実機確認 fixture」を区別する。
- 計算生成 fixture（例: `tests/fixtures/test_cases_*.json`）は、式変更で期待値が正しく変わる場合に再生成してよい。ただし、再生成理由・実行コマンド・影響件数を最終報告または commit message に残す。
- 実機確認 fixture（実測コメント・動画コマ送り・実機スクリーンショット等を正本にした fixture、例: `tests/e2e/fixtures/` の session regression）は regression oracle として扱い、計算結果に合わせて気軽に期待値を書き換えない。
- 実機確認 fixture の期待値更新は、ユーザーの明示確認または新しい実測根拠がある場合に限る。
- 実機確認 fixture を変更する場合は、実測ソース（コメント、動画、スクリーンショット、JSON path、観測日時）と、どの値を正本として採用したかを docs かテストコメントに残す。
- 計算式変更で実機確認 fixture とずれた場合は、fixture を直す前に「実装が誤りか、仮説が古いか、実測データが更新されたか」を切り分ける。

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

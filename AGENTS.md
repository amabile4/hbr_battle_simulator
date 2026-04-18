# Implementation And Test Ownership

- 実装者は、自分が変更した範囲のテスト作成・更新・実行まで一貫して担当する。
- `tests/e2e/` と Playwright config も、対象変更に必要なら同じ実装者が修正してよい。
- browser 実挙動に依存する UI 修正では、unit/integration test だけで閉じず、必要な Playwright coverage を追加して自ら確認する。
- 共有 fixture / selector / contract を変える場合は、実装とテストを同じ変更集合で整合させる。

## UI Migration Stance

- `ui-next/` を現在の主実装対象とする。
- `ui/` および `src/ui/` の `dom_adapter` 系は、過去に検討した旧 UI / 参照用ソースとして扱う。
- 新しい UI 体験や通常の機能追加・改修では、旧 `dom_adapter` との parity を前提にしない。まず `ui-next/` と shared engine / replay / contract を優先して進めること。
- 旧 `dom_adapter` 側の修正は、ユーザーが明示的に求めた場合、または shared contract の整合維持に必要な場合に限って行う。

## Test Writing Conventions

- テスト作成時に「行動なし」を他キャラクターへさせたい場合は、原則として `プロテクション`（`SP0`、自らの防御力を上げる）を使用する。
- これは完全な no-op ではないが、現在の実装と実データ運用では「行動なしにかなり近い代替」として扱う。
- 今後の unit/integration test でも、明示的な意図がない限り `行動なし` の代替として `プロテクション` を優先する。

## Implementation Conventions

- マジックナンバーは原則として新規導入しない。ゲーム仕様値、UI制約値、既定値は意味のある定数名を与えて管理する。
- 既存コードにマジックナンバーを見つけた場合は、周辺の設計を崩さない範囲で定数化を優先する。

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

- Mermaid 図を Markdown に書くときは、必ず fenced code block を使い、開始フェンスは ```` ```mermaid ```` とする。
- Mermaid の図だけを裸で置かず、通常のコードブロックと同じく閉じフェンス ```` ``` ```` まで含める。
- `docs/` 内のファイルを参照・更新する際は、必ず `docs/README.md` を確認し、記載のドキュメント管理ルールに従うこと。
- 実装タスクの完了時は、対応ドキュメントのステータス更新を実装とセットで行うこと（必須）。

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

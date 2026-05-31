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
- 通常攻撃のOD上昇は、武器種や実データの raw hit 数に関わらず **固定3hit相当 = 7.5%** として扱う。Eシールド減算などOD以外のhit判定では raw hit 数を使うため、混同しないこと。

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

## Code Intelligence: codegraph

- この project では `codegraph` CLI をコード探索・影響調査の補助に使う。
- 実装調査では、必要に応じて `codegraph query <search>` / `codegraph context <task>` / `codegraph affected [files...]` / `codegraph files` を優先的に試す。
- index が古い、未作成、または対象を十分に返さない場合は、`rg` / `rg --files` / 通常の file read へフォールバックしてよい。
- index 更新が必要なときは `codegraph status` で状態を確認し、必要に応じて `codegraph sync` または `codegraph index` を実行する。

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "How does X reach/become Y? / trace the flow from X to Y" | `codegraph_trace` (one call = the whole path, incl. callback/React/JSX dynamic hops) |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore` for the source of the symbols it surfaces. For a specific **flow** ("how does X reach Y") start with `codegraph_trace` from→to — one call returns the whole path with dynamic hops bridged — then ONE `codegraph_explore` for the bodies; don't rebuild the path with `codegraph_search` + `codegraph_callers`. Codegraph IS the pre-built index, so spawning a separate file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did and costs more for the same answer.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep — that's slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster and returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** when you just want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` call returns several symbols' source grouped in a single capped call, while each separate node/Read call re-reads the whole context and costs far more.
- **Index lag**: the file watcher debounces ~500ms behind writes; don't re-query immediately after editing a file in the same turn.

### If `.codegraph/` doesn't exist

The MCP server returns "not initialized." Ask the user: *"I notice this project doesn't have CodeGraph initialized. Want me to run `codegraph init -i` to build the index?"*
<!-- CODEGRAPH_END -->

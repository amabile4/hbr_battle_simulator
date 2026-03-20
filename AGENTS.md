# Role Split (Codex + Gemini Antigravity)

- Codex owns implementation and refactoring in `src/`, `json/`, `ui/`, and unit/integration tests except `tests/e2e/`.
- Gemini Antigravity owns Playwright E2E work in `tests/e2e/` and related Playwright config files.
- Codex must not modify `tests/e2e/` or Playwright config unless explicitly requested by the user.
- Codex must not run Playwright E2E commands (example: `npm run test:e2e -- --grep "First Commit Enables Ops Button Test"`); E2E execution is owned by Gemini Antigravity.
- Gemini Antigravity must not modify `src/` domain logic unless explicitly requested by the user.
- Shared changes (fixtures/selectors/contracts) should be coordinated via user instruction before cross-boundary edits.

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

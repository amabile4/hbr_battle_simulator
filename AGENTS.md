# Role Split (Codex + Gemini Antigravity)

- Codex owns implementation and refactoring in `src/`, `json/`, `ui/`, and unit/integration tests except `tests/e2e/`.
- Gemini Antigravity owns Playwright E2E work in `tests/e2e/` and related Playwright config files.
- Codex must not modify `tests/e2e/` or Playwright config unless explicitly requested by the user.
- Codex must not run Playwright E2E commands (example: `npm run test:e2e -- --grep "First Commit Enables Ops Button Test"`); E2E execution is owned by Gemini Antigravity.
- Gemini Antigravity must not modify `src/` domain logic unless explicitly requested by the user.
- Shared changes (fixtures/selectors/contracts) should be coordinated via user instruction before cross-boundary edits.

## Test Writing Conventions

- テスト作成時に「行動なし」を他キャラクターへさせたい場合は、原則として `プロテクション`（`SP0`、自らの防御力を上げる）を使用する。
- これは完全な no-op ではないが、現在の実装と実データ運用では「行動なしにかなり近い代替」として扱う。
- 今後の unit/integration test でも、明示的な意図がない限り `行動なし` の代替として `プロテクション` を優先する。

## Implementation Conventions

- マジックナンバーは原則として新規導入しない。ゲーム仕様値、UI制約値、既定値は意味のある定数名を与えて管理する。
- 既存コードにマジックナンバーを見つけた場合は、周辺の設計を崩さない範囲で定数化を優先する。

## Documentation Conventions

- Mermaid 図を Markdown に書くときは、必ず fenced code block を使い、開始フェンスは ```` ```mermaid ```` とする。
- Mermaid の図だけを裸で置かず、通常のコードブロックと同じく閉じフェンス ```` ``` ```` まで含める。

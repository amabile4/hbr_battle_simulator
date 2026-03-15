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

## Branch And Merge Conventions

- `main` は安定した共通土台とし、共有アセット、共有 resolver、共有 contract、既存 engine の確定 bugfix を取り込む正本ブランチとして扱う。
- 既存 engine 改修は `feature/engine-<topic>`、新 UI は `feature/ui-next-<topic>` の命名を基本とする。
- `ui-next` 系ブランチは既存 `ui/` の改造ブランチではなく、新規 UI 実装の作業場所として扱い、既存 UI を壊さない構成を優先する。
- engine bugfix や shared 変更を `ui-next` 側だけで正本化しない。再利用する変更は、原則として `main` に先に入れるか、`feature/engine-*` から `main` へ入れてから `ui-next` 側へ取り込む。
- `feature/ui-next-*` と `feature/engine-*` の間で直接 merge する運用は原則避ける。共有したい変更は `main` を経由して伝播させる。
- `feature/ui-next-*` は `main` を定期的に取り込み、engine 側の bugfix や shared 変更を追従してよい。履歴の明快さを優先し、必要なら `merge main` を選んでよい。
- 片方のブランチでしか使わない試験実装を、安易に shared 層へ混ぜない。shared 化するのは、複数ブランチから使うことが明確になってからにする。

## Documentation Conventions

- Mermaid 図を Markdown に書くときは、必ず fenced code block を使い、開始フェンスは ```` ```mermaid ```` とする。
- Mermaid の図だけを裸で置かず、通常のコードブロックと同じく閉じフェンス ```` ``` ```` まで含める。
- `docs/` 内のファイルを参照・更新する際は、必ず `docs/README.md` を確認し、記載のドキュメント管理ルールに従うこと。
- 実装タスクの完了時は、対応ドキュメントのステータス更新を実装とセットで行うこと（必須）。

# Role Split (Codex + Gemini Antigravity)

- Codex owns implementation and refactoring in `src/`, `json/`, `ui/`, and unit/integration tests except `tests/e2e/`.
- Gemini Antigravity owns Playwright E2E work in `tests/e2e/` and related Playwright config files.
- Codex must not modify `tests/e2e/` or Playwright config unless explicitly requested by the user.
- Gemini Antigravity must not modify `src/` domain logic unless explicitly requested by the user.
- Shared changes (fixtures/selectors/contracts) should be coordinated via user instruction before cross-boundary edits.

# Child A (Codex) Notes – hbr_battle_simulator

## 1. Code/feature layout snapshot
- The UX is a single-page modular simulator (`hbr_gui_simulator_modular.html`) that wires five CSS modules for global layout, party setup, party display, controls, and results, then loads seven ES modules (`globals`, `data-manager`, `party-manager`, `display-manager`, `event-handlers`, `control-manager`, `results-manager`).
- Runtime starts on `DOMContentLoaded` via `globals.js`, which defines shared state (`CONFIG`, party/turn trackers, default party) and immediately calls `DataManager.loadSkillData()`. Data load triggers `PartyManager.generateCharacterConfig()` to render slot-based selectors.
- The UI flow covers dynamic party configuration (selection, SP inputs), formation display (front/back slots with skill indicators), control buttons (swap, execute, next turn), skill selection modal, and a tabular battle result log with debug metadata.

## 2. Key module responsibilities
- `DataManager`: fetches `skillDatabase.json`, populates `characterDatabase`, and falls back to hard-coded mock data. It acts as the only dependency point between JSON skill data and the UI builders.
- `PartyManager`: builds the six character slots, enforces unique selection, applies `defaultPartySettings`, stores each party entry (`name`, `initialSP`, `currentSP`, `spBonus`, `skills`), auto-collapses the setup panel after loading, and exposes a reset routine.
- `DisplayManager`: renders the on-field cards based on `positionMap` (type-safe map of 6 slots), decorates skill displays per front-line positions, keeps skill text trimmed, and updates the execute button state via `ControlManager.updateExecuteButton()`.
- `EventHandler` + `SwapManager` + `SkillManager`: handle clicks on cards, toggle swap mode (including preview restore and turn recalculation), manage skill selection modal (blocking non-front-line characters, disabling unaffordable skills), and persist user choice in `turnActions`.
- `ControlManager`: central turn logic—previewing turns with `savedSPState`, executing/overwriting `battleHistory` entries, confirming SP consumption, advancing turns, capping SP at `CONFIG.MAX_SP`, auto-assigning zero-cost defaults, and invoking `DisplayManager`/`ResultsManager` updates.
- `ResultsManager`: rebuilds the results table whenever `battleHistory` changes, maintains debug text about column widths, and formats each action cell with titles for clarity.

## 3. Data and dependencies
- `skillDatabase.json` is the canonical skill catalogue (metadata with `characterCount`/`totalSkills`, then a map of character→skill array). Classes expect every character to have at least one zero-cost “通常攻撃”.
- Shared config constants live in `globals.js` (max characters/slots, SP limits, base recovery) so all managers read the same values.
- Node dev tooling is minimal: `vitest` for tests, `jsdom` for DOM mocks, plus optional UI/coverage helpers. No bundler—HTML loads ES modules via `type="module"` semantics.

## 4. Tests and reusable pieces
- `tests/control-manager.test.js` mocks globals and validates `confirmSPChanges`, SP save/restore, and front-line-only consumption (reusing `fixtures/test-data.js` for characters/skills). It shows how to isolate `ControlManager` logic for assertions.
- `tests/skill-database.test.js` validates `skillDatabase.json` structure, metadata counters, cost bounds, and ensures every character exposes a normalized zero-cost attack. These tests are simple reads using Node `fs` and rely on the real JSON.
- Reusable blocks: the modular managers (Data, Party, Display, Control, Results) follow a clear separation of concerns, so each can be reused independently for future UIs (e.g., replace DOM rendering but keep logic); `CONFIG`, `positionMap`, and `turnActions` are the shared state contracts between them.

## 5. Observations for rebuilding
- The simulator currently tracks SP in `battleHistory` but never persists to backend; runs purely in-browser with `fetch` for skill DB and `alert` for validations.
- Formation swaps temporarily preview SP/skills and recompute the current turn when swap completes, making `SwapManager.updateBattleResultAfterSwap()` a candidate for reuse in any feature that mutates formation metadata mid-turn.
- The HTML structure already separates party setup, display, controls, and results, so new components (e.g., timeline view) can hook into `battleHistory` and `turnActions` without touching the core logic.

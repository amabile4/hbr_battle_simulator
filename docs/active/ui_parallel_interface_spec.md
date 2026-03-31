# UI Parallel Development Interface Spec (Shared UI Modules + Engine)

> **ステータス**: 📚 参照 | 📅 最終更新: 2026-03-31
- Scope: `src/ui` shared modules + `src/turn` / `ui-next` integration contract
- Target reader: AI agents and developers implementing `ui-next/` or shared engine-adjacent UI helpers

## 1. Current Architecture (Implemented)

The legacy top-level `ui/` surface and DOM controller chain are removed from live code. The current UI architecture is split into 2 responsibilities.

1. `ui-next/`
- Canonical UI surface and browser entry
- Owns components, controller flow, selectors, and browser-only interaction behavior

2. `src/ui/`
- Shared, DOM-independent modules reused by `ui-next/` and tests
- Public surface is limited to the files that still exist in the working tree

Current shared modules:

1. `src/ui/adapter-core.js`
- Battle initialization snapshot build
- preview/commit wrappers around `src/turn/turn-controller.js`
- record export helpers and status normalization used by `ui-next`

2. `src/ui/lightweight-replay-script.js`
- Replay script schema and constants
- setup / override normalization helpers shared across turn editing flows

3. `src/ui/style-asset-url.js`
- Shared asset URL resolver for style and UI icons
- Used by `ui-next` components and exported from `src/index.js`

## 2. Independence Evaluation

### 2.1 Can GUI be developed in parallel?

Yes. Parallel work is practical if teams follow the fixed contracts below.

- Engine/state logic is isolated in `src/turn/` and exposed through `src/ui/adapter-core.js`
- Replay schema and setup/override contracts are isolated in `src/ui/lightweight-replay-script.js`
- Visual layout, selectors, and interaction code are isolated in `ui-next/`

### 2.2 Remaining coupling

- `style-asset-url.js` currently resolves relative to the repository asset layout, so moving `src/ui/` would require coordinated path updates
- Existing tests validate the shared module behavior and `ui-next` integration points

Conclusion:

- For current GUI development, implement behavior directly in `ui-next/` and reuse only the shared modules in `src/ui/`
- Treat removed DOM-adapter era files as archive-only reference, not as live extension points

## 3. Engine Interface (Main Entry Points)

From `src/turn/turn-controller.js`:

1. `createBattleStateFromParty(party, turnState?)`
- Input: `Party` or 6-member array + optional `turnState`
- Output: battle state `{ party, turnState, positionMap, initialParty }`

2. `previewTurn(state, actions, enemyAction = null, enemyCount = 1, options = {})`
- Input: state + action dict
- Output: preview `TurnRecord` (`recordStatus: "preview"`)

3. `commitTurn(state, previewRecord, swapEvents = [], options = {})`
- Input: preview record + optional commit options
- Output: `{ nextState, committedRecord }`

4. `activateOverdrive(state, level, context = 'preemptive', options = {})`
- Input: OD level/context/options
- Output: updated state in OD turn

5. `grantExtraTurn(state, allowedCharacterIds)`
- Input: allowed actor IDs
- Output: extra-turn state

## 4. Legacy DOM Selector Contract (Archived)

旧 DOM controller は廃止済みであり、以下は historical note としてのみ残す。`ui-next/` の通常開発では互換対象にしない。

### 4.1 Required action selectors

- `[data-action="initialize"]`
- `[data-action="preview"]`
- `[data-action="commit"]`
- `[data-action="swap"]`
- `[data-action="open-od"]`
- `[data-action="open-interrupt-od"]`
- `[data-action="export-csv"]`
- `[data-action="export-records-json"]`
- `[data-action="clear-records"]`
- `[data-action="turn-plan-recalc"]`
- `[data-action="scenario-load"]`
- `[data-action="scenario-apply-setup"]`
- `[data-action="scenario-run-next"]`
- `[data-action="scenario-run-all"]`

### 4.2 Required role selectors

- `[data-role="style-slots"]`
- `[data-role="action-slots"]`
- `[data-role="turn-label"]`
- `[data-role="party-state"]`
- `[data-role="status"]`
- `[data-role="preview-output"]`
- `[data-role="csv-output"]`
- `[data-role="records-json-output"]`
- `[data-role="record-head"]`
- `[data-role="record-body"]`
- `[data-role="enemy-count"]`
- `[data-role="enemy-action"]`
- `[data-role="initial-od-gauge"]`
- `[data-role="scenario-json"]`
- `[data-role="scenario-status"]`

Note:
- 削除済み legacy page の selector 契約メモであり、現行 UI の canonical sample ではない。
- Visual style/theme を変えても、`ui-next` で必要な selector はそのコンポーネント内で閉じて管理する。

## 5. Parallel Development Guide for AI Agents

1. Keep shared logic in `adapter-core`, `lightweight-replay-script`, `style-asset-url`
2. Keep `ui-next` 固有の controller / component / selector contract は `ui-next/` 配下へ閉じる
3. Do not revive legacy DOM controller as a dependency for new UI work
4. Update the relevant tests in the same change set, including `tests/e2e` when browser behavior is part of the change
5. Validate regressions with:

```bash
node --test tests/*.test.js
```

When browser behavior is the point of the change, also run the relevant Playwright spec(s).

## 6. Current Independence Status

Status: legacy hard cutover 後の current state.

1. Legacy DOM controller chain is removed
- `src/ui/battle-adapter-facade.js`
- `src/ui/dom-view.js`
- `src/ui/dom-adapter.js`

2. Shared modules that remain reusable
- `src/ui/adapter-core.js`
- `src/ui/lightweight-replay-script.js`
- `src/ui/style-asset-url.js`

3. Current recommendation
- Implement new UI behavior directly in `ui-next/`
- Reuse only the shared modules above
- Treat Section 4 as archive-only reference

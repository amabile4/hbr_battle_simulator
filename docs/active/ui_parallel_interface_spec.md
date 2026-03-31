# UI Parallel Development Interface Spec (DOM Adapter + Engine)

> **ステータス**: 📚 参照 | 📅 最終更新: 2026-03-08
- Scope: `src/ui` + `src/turn` integration contract for parallel GUI development
- Target reader: AI agents and developers implementing UI in parallel

## 1. Current Architecture (Implemented)

The UI layer is now split into 3 layers.

1. `src/ui/adapter-core.js`
- DOM-independent pure core helpers
- Battle initialization snapshot build
- preview/commit wrappers
- swap state mutation wrappers
- CSV/JSON export wrappers

2. `src/ui/battle-adapter-facade.js`
- State transition facade (no DOM rendering)
- Holds battle/session state
- Uses `adapter-core` to mutate/advance state

3. `src/ui/dom-view.js`
- DOM update/view utility only
- Status/output writing and scenario status rendering
- DOM value setter

4. `src/ui/dom-adapter.js`
- Orchestrator/controller
- Event binding and UI flow
- Delegates engine/state transitions to `BattleAdapterFacade`
- Delegates DOM output to `BattleDomView`

## 2. Independence Evaluation

### 2.1 Can GUI be developed in parallel?

Yes. Parallel work is practical if teams follow the fixed contracts below.

- Engine/state logic is isolated into facade/core (`adapter-core`, `battle-adapter-facade`)
- DOM rendering is isolated into `dom-view`
- `dom-adapter` remains integration/controller

### 2.2 Remaining coupling

- `dom-adapter` still expects fixed `data-role` / `data-action` selectors
- Existing tests validate current selector contract and behavior

Conclusion:

- For short-term parallel GUI development, keep selector contract and replace visual layout/CSS freely
- For long-term complete decoupling, use `adapter-core` + engine directly with a custom view/controller

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

## 4. Facade Interface (`BattleAdapterFacade`)

`src/ui/battle-adapter-facade.js`

1. `initializeBattleState(options)`
- Builds party/state and resets runtime records

2. `queueSwapInState(fromPositionIndex, toPositionIndex)`
- Applies swap directly to state party positions
- Returns swap event payload

3. `previewCurrentTurnState({ actions, enemyAction, enemyCount, options })`
- Stores and returns `previewRecord`

4. `commitCurrentTurnState(options)`
- Commits from current `previewRecord`
- Updates state, records, turn plan arrays

5. `clearRecordsState()`
- Clears records and turn-plan replay artifacts

6. `exportCsvState()` / `exportRecordsJsonState()`
- Export text payloads

## 5. View Interface (`BattleDomView`)

`src/ui/dom-view.js`

1. `setStatus(message)`
2. `writePreviewOutput(text)`
3. `writeCsvOutput(text)`
4. `writeRecordsJsonOutput(text)`
5. `renderScenarioStatus({ scenario, cursor, stagedTurnIndex })`
6. `setDomValue(selector, value)`

Rule:
- `BattleDomView` should only perform DOM read/write helpers and simple display formatting.

## 6. Legacy DOM Selector Contract (Archived)

旧 DOM controller は廃止済みであり、以下は historical note としてのみ残す。`ui-next/` の通常開発では互換対象にしない。

### 6.1 Required action selectors

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

### 6.2 Required role selectors

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

## 7. Parallel Development Guide for AI Agents

1. Keep shared logic in `adapter-core`, `lightweight-replay-script`, `style-asset-url`
2. Keep `ui-next` 固有の controller / component / selector contract は `ui-next/` 配下へ閉じる
3. Do not revive legacy DOM controller as a dependency for new UI work
4. Update the relevant tests in the same change set, including `tests/e2e` when browser behavior is part of the change
5. Validate regressions with:

```bash
node --test tests/*.test.js
```

When browser behavior is the point of the change, also run the relevant Playwright spec(s).

## 8. Current Independence Status

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
- Treat Section 6 as archive-only reference

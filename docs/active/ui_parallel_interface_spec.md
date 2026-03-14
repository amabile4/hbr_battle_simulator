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

## 6. DOM Selector Contract (Fixed)

When implementing another GUI while reusing `BattleDomAdapter`, keep these selectors compatible.

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
- Existing `ui/index.html` is the canonical contract sample.
- Visual style/theme can be changed without changing these contracts.

## 7. Parallel Development Guide for AI Agents

1. Keep core logic in facade/core files (`adapter-core`, `battle-adapter-facade`)
2. Keep DOM output in `dom-view`
3. Keep `dom-adapter` as integration/controller
4. Do not modify `tests/e2e` or run Playwright E2E from Codex side
5. Validate regressions with:

```bash
node --test tests/*.test.js
```

## 8. Next Actions to Increase Independence

Status: implemented in this iteration.

1. `src/ui/dom-adapter.js` split into Facade + View
- Implemented:
  - `src/ui/battle-adapter-facade.js` added
  - `src/ui/dom-view.js` added
  - `src/ui/dom-adapter.js` now delegates state transitions to Facade and display writes to View

2. Fix `data-role` contract in docs
- Implemented in this document (Section 6)

3. Add DOM-independent `adapter-core`
- Implemented as `src/ui/adapter-core.js`
- Can be reused by non-DOM controllers

4. Full decoupling roadmap
- Step A: Move turn-status/party-state/table rendering into `dom-view`
- Step B: Keep `dom-adapter` event routing only
- Step C: Add alternative controller for non-DOM GUI using `BattleAdapterFacade`

## 9. Minimal Usage Example

```js
import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { BattleDomAdapter } from '../src/ui/dom-adapter.js';

const dataStore = HbrDataStore.fromRawData(payload);
const root = document.querySelector('#app');

const adapter = new BattleDomAdapter({ root, dataStore, initialSP: 4 });
adapter.mount();

adapter.previewCurrentTurn();
adapter.commitCurrentTurn();
```

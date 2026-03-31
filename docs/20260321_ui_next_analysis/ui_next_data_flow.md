# UI Next: データフロー

> **ステータス**: 📚 仕様書 | **作成**: 2026-03-21
>
> **関連**: [ui_next_architecture_overview.md](./ui_next_architecture_overview.md)

---

## 概要

このドキュメントでは、ユーザー操作からエンジン実行までのデータフローを詳細に説明します。

## 全体フロー

```
ユーザー操作
  ↓
UIコントローラー（PartySetup / TurnRow）
  ↓
TurnEngineManager（状態管理）
  ↓
adapter-core.js（エンジンブリッジ）
  ↓
turn-controller.js（エンジン実行）
  ↓
結果返却
  ↓
TurnEngineManager（状態更新）
  ↓
UIコントローラー（更新）
```

## 初期化フロー

### 1. アプリ起動

```javascript
// app.js
const store = new HbrDataStore();
const engineManager = new TurnEngineManager({
  store,
  validationPolicy: { /* ... */ }
});

// 初期バトル状態の構築
const initialState = buildInitialState({
  partySetup: partySetupSnapshot,
  enemySetup: enemySetup
});

// エンジンマネージャー初期化
engineManager.initialize(initialState, enemySetup);
```

### 2. Party Setup変更

```javascript
// PartySetupController
onChange(snapshot, meta) {
  // 新しい初期バトル状態を構築
  const newInitialState = buildInitialState({
    partySetup: snapshot,
    enemySetup: currentEnemySetup
  });
  
  // 全ターンを再計算
  engineManager.recalculateAll(newInitialState);
  
  // 全UI行の更新
  updateAllTurnRows();
}
```

**データフロー**:
```
PartySetupController.onChange
  → buildInitialState(partySetupSnapshot)
  → TurnEngineManager.recalculateAll(newInitialState)
    → TurnEngineManager#initialState = newInitialState
    → recalculateFrom(0)
      → 各ターンを再計算
      → computedStates / computedRecords を更新
  → updateAllTurnRows()
    → 各TurnRow.update({ stateBefore, stateAfter })
```

## ターン実行フロー

### 3. スキル選択（未コミット行）

```javascript
// TurnRowController
[Skill Select Change] → (event) => {
  const skillId = event.target.value;
  const partyIndex = Number(event.target.dataset.partyIndex);
  
  // ドラフト状態を更新
  this.#draftSlotSkills[partyIndex] = { partyIndex, skillId };
  
  // プレビューリクエスト
  this.#onPreviewRequest?.(turnIndex, this.getCurrentSlotActions());
}

// TurnAreaController
onPreviewRequest(turnIndex, slotActions) {
  // エンジンマネージャーでプレビュー
  const preview = engineManager.previewCurrentTurn(slotActions, {
    enemyCount: currentEnemyCount,
    actionOutcomeOverrides: currentActionOutcomeOverrides
  });
  
  // 未コミット行の更新
  turnRow.update({
    previewResourceState: preview.previewResourceState,
    odState: {
      activatableInterrupt: preview.activatableInterrupt
    }
  });
  
  // OD予測値の更新
  turnRow.updateOdPreview(preview.odGaugeAfter);
}
```

**データフロー**:
```
TurnRowController [スキルselect change]
  → draftSlotSkills[partyIndex] 更新
  → onPreviewRequest(turnIndex, slotActions)
    → TurnEngineManager.previewCurrentTurn(slotActions, options)
      → buildPendingBeforeCommitOperations()
      → previewTurnRecord(state, actions, ...)
        → エンジン実行（実際のターンをシミュレート）
      → { odGaugeAfter, activatableInterrupt, previewResourceState }
  → turnRow.update({ previewResourceState, odState })
  → turnRow.updateOdPreview(odGaugeAfter)
```

### 4. ターンコミット

```javascript
// TurnRowController
[実行ボタン] → () => {
  const slotActions = this.getCurrentSlotActions();
  const note = this.getCurrentNote();
  
  this.#onCommit?.(turnIndex);
}

// TurnAreaController
onCommit(turnIndex) {
  const turnRow = this.turnRows[turnIndex];
  const slotActions = turnRow.getCurrentSlotActions();
  const note = turnRow.getCurrentNote();
  const actionOutcomeOverrides = turnRow.getCurrentActionOutcomeOverrides();
  
  // エンジンマネージャーでコミット
  const committedRecord = engineManager.commitNextTurn(slotActions, {
    note,
    actionOutcomeOverrides,
    enemyCount: currentEnemyCount
  });
  
  // 新しい未コミット行を追加
  this.addNewTurnRow();
  
  // 全UI行の更新
  this.updateAllTurnRows();
}
```

**データフロー**:
```
TurnRowController [実行ボタン]
  → getCurrentSlotActions()
  → onCommit(turnIndex)
    → TurnEngineManager.commitNextTurn(slotActions, options)
      → buildCommittedOperations()
        → pendingSpecialOperations
        → ACTIVATE_PREEMPTIVE_OD（予約あり）
      → previewTurnRecord(state, actions, ...)
        → エンジン実行（プレビュー）
      → state.party をdeep copy
      → commitTurnRecord(state, previewRecord, swapEvents, options)
        → エンジン実行（コミット）
        → { nextState, committedRecord }
      → buildReplayTurn(state, slotActions, note, operations, ...)
      → computedStates.push(nextState)
      → computedRecords.push(committedRecord)
      → replayScript.turns.push(replayTurn)
      → 未コミット操作を全てクリア
    → addNewTurnRow()
    → updateAllTurnRows()
      → 各TurnRow.update({ stateBefore, stateAfter, record, replayTurn })
```

## 過去ターン編集フロー

### 5. スキル変更（コミット済み行）

```javascript
// TurnRowController
[Skill Select Change] → (event) => {
  const skillId = event.target.value;
  const position = Number(event.target.dataset.position);
  
  // コールバック
  this.#onSlotChange?.(turnIndex, position, { skillId });
}

// TurnAreaController
onSlotChange(turnIndex, position, action) {
  // エンジンマネージャーで更新
  engineManager.updateSlot(turnIndex, position, action);
  
  // 全UI行の更新
  this.updateAllTurnRows();
}
```

**データフロー**:
```
TurnRowController [スキルselect change]
  → onSlotChange(turnIndex, position, { skillId })
    → TurnEngineManager.updateSlot(turnIndex, position, action)
      → replayScript.turns[turnIndex].slots[position].skillId = skillId
      → recalculateFrom(turnIndex)
        → computedStates[turnIndex:] 削除
        → computedRecords[turnIndex:] 削除
        → 開始点stateから再計算
        → 各ターンを再実行
        → computedStates / computedRecords を再構築
    → updateAllTurnRows()
      → 各TurnRow.update({ stateBefore, stateAfter, record, replayTurn })
```

### 6. ブレイク編集

```javascript
// TurnRowController
[ブレイクエディタ] → (event) => {
  const partyIndex = Number(event.target.dataset.partyIndex);
  const enemyIndex = Number(event.target.dataset.enemyIndex);
  
  // ドラフト状態を更新
  this.#updateDraftBreakEnemyIndexes(partyIndex, enemyIndex);
  
  // プレビューリクエスト
  this.#onPreviewRequest?.(turnIndex, this.getCurrentSlotActions());
}

[コミット済み行のブレイク編集] → (event) => {
  const overrides = this.#getCurrentActionOutcomeOverridesForDisplay(true);
  
  // コールバック
  this.#onActionOutcomeChange?.(turnIndex, overrides);
}

// TurnAreaController
onActionOutcomeChange(turnIndex, actionOutcomeOverrides) {
  // エンジンマネージャーで更新
  engineManager.updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides);
  
  // 全UI行の更新
  this.updateAllTurnRows();
}
```

**データフロー（未コミット行）**:
```
TurnRowController [ブレイク候補クリック]
  → draftBreakEnemyIndexesByPartyIndex 更新
  → onPreviewRequest(turnIndex, slotActions)
    → previewCurrentTurn(slotActions, { actionOutcomeOverrides })
      → previewTurnRecord(state, actions, ...)
      → { odGaugeAfter, ... }
  → turnRow.updateOdPreview(odGaugeAfter)
```

**データフロー（コミット済み行）**:
```
TurnRowController [ブレイク候補クリック]
  → getCurrentActionOutcomeOverridesForDisplay(true)
  → onActionOutcomeChange(turnIndex, overrides)
    → TurnEngineManager.updateActionOutcomeOverrides(turnIndex, overrides)
      → replayScript.turns[turnIndex].overrideEntries に設定
      → recalculateFrom(turnIndex)
        → 該当ターンから再計算
    → updateAllTurnRows()
      → 各TurnRow.update({ stateBefore, stateAfter, record, replayTurn })
```

## 特殊操作フロー

### 7. OD予約

```javascript
// TurnRowController
[先制OD select] → (event) => {
  const level = event.target.value === '' ? null : Number(event.target.value);
  
  // コールバック
  this.#onOdChange?.(turnIndex, 'preemptive', level);
}

// TurnAreaController
onOdChange(turnIndex, odType, level) {
  if (odType === 'preemptive') {
    engineManager.setPendingPreemptiveOd(level);
  } else {
    engineManager.setPendingInterruptOd(level);
  }
  
  // プレビューリクエスト
  const slotActions = turnRow.getCurrentSlotActions();
  const preview = engineManager.previewCurrentTurn(slotActions, {
    enemyCount: currentEnemyCount
  });
  
  turnRow.update({
    odState: {
      activatableInterrupt: preview.activatableInterrupt
    }
  });
}
```

**データフロー**:
```
TurnRowController [OD select change]
  → onOdChange(turnIndex, odType, level)
    → TurnEngineManager.setPendingPreemptiveOd(level)
      → pendingPreemptiveOdLevel = level
    → previewCurrentTurn(slotActions, options)
      → buildPendingBeforeCommitOperations()
        → ACTIVATE_PREEMPTIVE_OD 操作を構築
      → previewTurnRecord(state, actions, ...)
      → { odGaugeAfter, activatableInterrupt, ... }
    → turnRow.update({ odState })
```

### 8. 鬼神化操作

```javascript
// TurnRowController
[鬼神化ボタン] → () => {
  // コールバック
  this.#onOperationAdd?.(turnIndex, {
    type: REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA
  });
}

// TurnAreaController
onOperationAdd(turnIndex, operation) {
  const success = engineManager.addPendingSpecialOperation(operation);
  if (!success) return; // 発動条件不満で失敗
  
  // 特殊操作チップを更新
  this.updateOperationChips(turnIndex);
}
```

**データフロー**:
```
TurnRowController [鬼神化ボタン]
  → onOperationAdd(turnIndex, { type: 'ACTIVATE_KISHINKA' })
    → TurnEngineManager.addPendingSpecialOperation(operation)
      → 正規化
      → 重複チェック
      → 発動条件チェック（手塚咲いる？鬼神化中でない？）
      → pendingSpecialOperations.push(operation)
    → updateOperationChips(turnIndex)
      → getOperationState()
      → turnRow.update({ operations, operationState })
```

## エンジン実行フロー

### 9. previewTurnRecord

```javascript
// adapter-core.js
export function previewTurnRecord(state, actions, enemyAction, enemyCount) {
  // 敵の行動を生成
  const finalEnemyAction = enemyAction || buildDefaultEnemyAction(state, enemyCount);
  
  // ターン前処理
  const { state: beforeState, records: beforeRecords } = applyTurnStartEffects(state);
  
  // スキル実行
  const { state: afterSkills, records: skillRecords } = executeSkills(
    beforeState,
    actions,
    finalEnemyAction
  );
  
  // ターン終了処理
  const { state: afterTurn, records: afterTurnRecords } = applyTurnEndEffects(afterSkills);
  
  // プレビューレコードを構築
  const previewRecord = buildPreviewRecord({
    state: afterTurn,
    beforeRecords,
    skillRecords,
    afterTurnRecords
  });
  
  return previewRecord;
}
```

**データフロー**:
```
previewTurnRecord(state, actions, enemyAction, enemyCount)
  → buildDefaultEnemyAction(state, enemyCount) / 使用enemyAction
  → applyTurnStartEffects(state)
    → ターン開始時の効果適用（OD、パッシブなど）
    → { state: beforeState, records: beforeRecords }
  → executeSkills(beforeState, actions, enemyAction)
    → 各スキルを順に実行
    → SP消費、ダメージ計算、OD増加
    → { state: afterSkills, records: skillRecords }
  → applyTurnEndEffects(afterSkills)
    → ターン終了時の効果適用（SP回復など）
    → { state: afterTurn, records: afterTurnRecords }
  → buildPreviewRecord({ state, records })
  → return previewRecord
```

### 10. commitTurnRecord

```javascript
// adapter-core.js
export function commitTurnRecord(state, previewRecord, swapEvents, options) {
  // state.party をdeep copy（既に呼び出し元で実行済み）
  const workingState = state;
  
  // スワップイベントを適用
  const { state: afterSwaps, swapRecords } = applySwapEvents(workingState, swapEvents);
  
  // previewTurnRecordの結果を適用
  const { state: nextState, records: commitRecords } = applyPreviewRecord(afterSwaps, previewRecord);
  
  // コミットレコードを構築
  const committedRecord = buildCommittedRecord({
    state: nextState,
    swapRecords,
    commitRecords,
    options
  });
  
  return { nextState, committedRecord };
}
```

**データフロー**:
```
commitTurnRecord(state, previewRecord, swapEvents, options)
  → state.party は既にdeep copy済み（呼び出し元）
  → applySwapEvents(state, swapEvents)
    → positionの入れ替えを適用
    → { state: afterSwaps, swapRecords }
  → applyPreviewRecord(afterSwaps, previewRecord)
    → previewTurnRecordの結果をstateに適用
    → { state: nextState, records: commitRecords }
  → buildCommittedRecord({ state, records, options })
    → snapBefore: ターン開始時のスナップショット
    → actions: 実行したアクション
    → projections: ターン終了時の予測値
  → return { nextState, committedRecord }
```

## 状態管理フロー

### 11. 再計算時のstate不変性

```javascript
// TurnEngineManager#recalculateFrom
for (let i = fromIndex; i < replayScript.turns.length; i++) {
  const replayTurn = replayScript.turns[i];
  const stateBefore = i === 0 ? initialState : computedStates[i - 1];
  
  // state.party をdeep copyして汚染防止
  const state = {
    ...stateBefore,
    party: stateBefore.party.map((m) => m.clone())
  };
  
  // positionを復元（D&Dによる変更を再現）
  alignPositionsToSlots(state, replayTurn);
  
  // 操作を適用
  const operations = replayTurn.operations;
  applyBeforeCommitOperations(state, operations, options);
  
  // ターン実行
  const actions = buildActionsDict(state, replayTurn.slots, replayTurn.overrideEntries);
  const preview = previewTurnRecord(state, actions, null, enemyCount);
  const { nextState, committedRecord } = commitTurnRecord(state, preview, null, options);
  
  // 結果を保存
  computedStates.push(nextState);
  computedRecords.push(committedRecord);
}
```

**重要ポイント**:
1. 各ターン開始時に `state.party` をdeep copy
2. 過去ターンの汚染を防止（SP消費などが次ターンに影響しない）
3. D&Dによるposition変更を `alignPositionsToSlots` で復元
4. OD operationsも再現（`applyBeforeCommitOperations`）

## UI更新フロー

### 12. TurnRow更新

```javascript
// TurnRowController#update
update({
  record,              // コミット済みレコード
  replayTurn,          // リプレイトーン
  operations,          // 操作配列
  operationState,      // 操作ステータス
  stateBefore,         // ターン開始時のstate
  stateAfter,          // ターン終了時のstate
  previewResourceState, // プレビュー後のリソース
  odState,            // ODステータス
  simulatorSettings,   // シミュレーター設定
  openTargetPickerPartyIndex,  // ターゲットピッカーの開閉
  isBreakEditorOpen    // ブレイクエディタの開閉
}) {
  // 未コミット行か判定
  const isCommitted = this.#record !== null;
  
  // ドラフト状態の初期化/同期
  if (!isCommitted) {
    this.#initializeDraftState();
  }
  
  // HTMLを再構築
  this.#root.innerHTML = this.#buildHtml();
  
  // イベントを再バインド
  this.#bindEvents();
  
  // 選択ビジュアルを復元
  if (this.#selectedSlotPosition !== null) {
    this.#updateSelectionVisual();
  }
}
```

**最適化**: 差分更新メソッドを提供
- `refreshSkillSelects()`: スキルselectのみ更新
- `updateOdPreview(odGaugeAfter)`: OD予測値のみ更新
- `updateInterruptOdCandidates(candidates)`: 割込候補のみ更新

## 関連ドキュメント

- [ui_next_architecture_overview.md](./ui_next_architecture_overview.md) - 全体アーキテクチャ
- [ui_next_turn_engine_manager_spec.md](./ui_next_turn_engine_manager_spec.md) - TurnEngineManager仕様
- [ui_next_component_interaction.md](./ui_next_component_interaction.md) - コンポーネント間相互作用
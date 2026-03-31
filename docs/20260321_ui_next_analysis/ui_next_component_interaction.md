# UI Next: コンポーネント間相互作用

> **ステータス**: 📚 仕様書 | **作成**: 2026-03-21
>
> **関連**: [ui_next_architecture_overview.md](./ui_next_architecture_overview.md)

---

## 概要

このドキュメントでは、`ui-next/` 内のコンポーネント間の相互作用について説明します。

## コンポーネント階層

```
app.js
  ├─ PartySetupController
  │   └─ StylePickerController
  │       └─ SkillSettingsPanel
  └─ TurnAreaController
      ├─ TurnRowController (複数）
      │   └─ (ターゲットピッカー: ポップオーバー）
      └─ TurnEngineManager
```

## 主要コンポーネント

### app.js

アプリケーションのルートで、すべてのコンポーネントを管理します。

**責務**:
- HbrDataStore の初期化
- TurnEngineManager の初期化
- PartySetupController / TurnAreaController のマウント
- コンポーネント間のコールバック連携

**主なコールバック**:
```javascript
// PartySetup → app
onChange(snapshot, meta) {
  // Party Setup変更時
  // → buildInitialState()
  // → turnEngineManager.recalculateAll()
  // → turnArea.updateAllRows()
}

// TurnArea → app
onBattleStateChange(hasActiveBattle, hasRecords) {
  // バトル状態変化時
  // → partySetup.setBattleState()
}
```

### PartySetupController

6スロットの編成を管理します。

**親コンポーネント**: app.js
**子コンポーネント**: StylePickerController, SkillSettingsPanel

#### app.js との連携

**onChange コールバック**:
```javascript
partySetup.onChange((snapshot, meta) => {
  // 新しい初期バトル状態を構築
  const newInitialState = buildInitialState({
    partySetup: snapshot,
    enemySetup: currentEnemySetup
  });
  
  // 全ターンを再計算
  turnEngineManager.recalculateAll(newInitialState);
  
  // TurnAreaを更新
  turnArea.updateAllRows();
});
```

**setBattleState メソッド呼び出し**:
```javascript
app.onBattleStateChange(hasActiveBattle, hasRecords) {
  // Party SetupのUI状態を更新
  partySetup.setBattleState({
    hasActiveBattle,
    hasRecords
  });
}
```

#### StylePickerController との連携

**onSelect コールバック**:
```javascript
stylePicker.onSelect((style) => {
  // スタイルが選択された
  // → メイン/サポートスロットを更新
  // → 重複排除ルール適用
  // → スナップショット更新
  // → onChange コールバック
});
```

**onSlotSwitch コールバック**:
```javascript
stylePicker.onSlotSwitch((slotIndex, mode) => {
  // 次のスロットへ切り替え（連続選択モード）
  // → StylePicker.open(current, mode, mainStyle, partyContext)
});
```

#### SkillSettingsPanel との連携

**onSelectionChange コールバック**:
```javascript
skillSettingsPanel.onSelectionChange((slotIndex, skillId, checked) => {
  // スキル選択/解除
  // → slot.equippedSkillIds を更新
  // → onChange コールバック
});
```

### TurnAreaController

ターン行の管理を担当し、TurnRowController と TurnEngineManager を仲介します。

**親コンポーネント**: app.js
**子コンポーネント**: TurnRowController (複数)
**管理する**: TurnEngineManager

#### app.js との連携

**onBattleStateChange コールバック**:
```javascript
turnArea.onBattleStateChange((hasActiveBattle, hasRecords) => {
  // バトル状態変化を通知
  app.onBattleStateChange(hasActiveBattle, hasRecords);
});
```

#### TurnRowController との連携

**各TurnRowへのupdate呼び出し**:
```javascript
updateAllRows() {
  for (let i = 0; i < this.turnRows.length; i++) {
    const turnRow = this.turnRows[i];
    const snapshot = this.turnEngineManager.buildInputRowSnapshot({
      slotActions: this.currentSlotActions[i],
      enemyCount: this.currentEnemyCount,
      actionOutcomeOverrides: this.currentActionOutcomeOverrides[i]
    });
    
    turnRow.update({
      record: this.turnEngineManager.computedRecords[i],
      replayTurn: this.turnEngineManager.replayScript?.turns[i],
      operations: snapshot.operations,
      operationState: snapshot.operationState,
      stateBefore: snapshot.stateBefore,
      stateAfter: this.turnEngineManager.computedStates[i],
      previewResourceState: snapshot.previewResourceState,
      odState: {
        activatablePreemptive: snapshot.activatablePreemptive,
        activatableInterrupt: snapshot.activatableInterrupt
      },
      simulatorSettings: this.simulatorSettings
    });
  }
}
```

**コールバック受信**:
```javascript
// TurnRow → TurnArea
onSlotChange(turnIndex, position, action) {
  // スキル変更/スワップ
  this.turnEngineManager.updateSlot(turnIndex, position, action);
  this.updateAllRows();
}

onCommit(turnIndex) {
  // ターンコミット
  const slotActions = this.turnRows[turnIndex].getCurrentSlotActions();
  this.turnEngineManager.commitNextTurn(slotActions, {
    note: this.turnRows[turnIndex].getCurrentNote(),
    actionOutcomeOverrides: this.turnRows[turnIndex].getCurrentActionOutcomeOverrides(),
    enemyCount: this.currentEnemyCount
  });
  
  // 新しい未コミット行を追加
  this.addNewTurnRow();
  this.updateAllRows();
}

onPreviewRequest(turnIndex, slotActions) {
  // プレビューリクエスト
  const preview = this.turnEngineManager.previewCurrentTurn(slotActions, {
    enemyCount: this.currentEnemyCount,
    actionOutcomeOverrides: this.currentActionOutcomeOverrides[turnIndex]
  });
  
  // 未コミット行を更新
  this.turnRows[turnIndex].updateOdPreview(preview.odGaugeAfter);
  this.turnRows[turnIndex].update({
    previewResourceState: preview.previewResourceState,
    odState: {
      activatableInterrupt: preview.activatableInterrupt
    }
  });
}

onOdChange(turnIndex, odType, level) {
  // OD予約変更
  if (odType === 'preemptive') {
    this.turnEngineManager.setPendingPreemptiveOd(level);
  } else {
    this.turnEngineManager.setPendingInterruptOd(level);
  }
  
  // プレビュー更新
  const preview = this.turnEngineManager.previewCurrentTurn(
    this.turnRows[turnIndex].getCurrentSlotActions(),
    { enemyCount: this.currentEnemyCount }
  );
  
  this.turnRows[turnIndex].update({
    odState: {
      activatableInterrupt: preview.activatableInterrupt
    }
  });
}

onOperationAdd(turnIndex, operation) {
  // 特殊操作追加（鬼神化/魔騎兵）
  const success = this.turnEngineManager.addPendingSpecialOperation(operation);
  if (!success) return;
  
  // 操作チップ更新
  this.updateOperationChips(turnIndex);
}

onOperationRemove(turnIndex, operationIndex) {
  // 特殊操作削除
  this.turnEngineManager.removePendingSpecialOperation(operationIndex);
  this.updateOperationChips(turnIndex);
}

onEnemyCountChange(turnIndex, enemyCount) {
  // 敵数変更
  this.currentEnemyCount = enemyCount;
  this.turnEngineManager.updateEnemyCount(turnIndex, enemyCount);
  this.updateAllRows();
}

onActionOutcomeChange(turnIndex, actionOutcomeOverrides) {
  // ブレイク編集変更
  this.turnEngineManager.updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides);
  this.updateAllRows();
}

onNoteChange(turnIndex, note) {
  // メモ変更
  this.turnEngineManager.updateNote(turnIndex, note);
}
```

### TurnEngineManager

リプレイスクリプトを管理し、ターン計算を調整します。

**親コンポーネント**: TurnAreaController
**依存**: HbrDataStore

#### TurnAreaController との連携

**メソッド呼び出し**:
- `initialize(initialState, replaySetup, options)` - 初期化
- `loadReplayScript(initialState, replayScript, options)` - リプレイ読み込み
- `commitNextTurn(slotActions, options)` - ターンコミット
- `recalculateFrom(fromIndex)` - 再計算
- `recalculateAll(newInitialState)` - 全再計算
- `previewCurrentTurn(slotActions, options)` - プレビュー
- `updateSlot(turnIndex, position, action)` - スロット更新
- `updateOperations(turnIndex, operations)` - 操作更新
- `updateEnemyCount(turnIndex, enemyCount)` - 敵数更新
- `updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides)` - ブレイク更新
- `updateNote(turnIndex, note)` - メモ更新
- `setPendingPreemptiveOd(level)` - 先制OD予約
- `setPendingInterruptOd(level)` - 割込OD予約
- `addPendingSpecialOperation(operation)` - 特殊操作追加
- `removePendingSpecialOperation(index)` - 特殊操作削除
- `buildInputRowSnapshot(options)` - 入力スナップショット構築

#### HbrDataStore との連携

**メソッド呼び出し**:
- `store.getStyleById(styleId)` - スタイル取得
- `store.listEquipableSkillsByStyleId(styleId)` - 装備可能スキル一覧
- `store.getCharacterById(characterId)` - キャラクター取得

### StylePickerController

全画面スタイルピッカーを管理します。

**親コンポーネント**: PartySetupController

#### PartySetupController との連携

**初期化**:
```javascript
partySetup.#picker = new StylePickerController({
  overlay: pickerOverlay,
  styles: store.styles,
  store: store,
  onSelect: (style) => this.#onStyleSelected(style),
  onSlotSwitch: (slotIndex, mode) => {
    this.#activeSlotIndex = slotIndex;
    this.#activeMode = mode;
    const slot = this.#slots[slotIndex];
    const current = mode === 'main' ? slot.style : slot.supportStyle;
    const mainStyle = mode === 'support' ? slot.style : null;
    this.#picker.open(current, mode, mainStyle, this.#getPartyContext());
  }
});
```

**スタイル選択時**:
```javascript
// PartySetupController#onStyleSelected
onStyleSelected(style) {
  if (mode === 'main') {
    // メイン選択
    // 重複排除ルール適用
    this.#slots[idx].style = style;
    this.#slots[idx].styleId = style.id;
    this.#slots[idx].lb = 0;
  } else {
    // サポート選択
    this.#slots[idx].supportStyle = style;
    this.#slots[idx].supportStyleId = style.id;
  }
  
  // レンダリング
  this.#render();
  
  // 変更通知
  this.#notifyChange();
  
  // 連続選択モード
  if (this.#picker.isContinuousMode) {
    const next = this.#findNextEmptySlot();
    if (next !== null) {
      this.#activeSlotIndex = next.slotIndex;
      this.#activeMode = next.mode;
      this.#picker.open(current, next.mode, mainStyle, this.#getPartyContext());
      return;
    }
    this.#picker.close();
  }
}
```

#### HbrDataStore との連携

**メソッド呼び出し**:
- `store.styles` - 全スタイル一覧
- `store.getCharacterById(characterId)` - キャラクター取得

### SkillSettingsPanel

スキル設定パネルを管理します。

**親コンポーネント**: PartySetupController

#### PartySetupController との連携

**初期化**:
```javascript
partySetup.#skillSettingsPanel = new SkillSettingsPanel({
  store: store,
  resolveSlot: (slotIndex) => this.#slots[slotIndex] ?? null,
  onSelectionChange: (slotIndex, skillId, checked) => {
    this.#toggleSkillForSlot(slotIndex, skillId, checked);
  },
  onSelectAll: (slotIndex) => {
    this.#selectAllSkillsForSlot(slotIndex);
  },
  onClearAll: (slotIndex) => {
    this.#clearSkillsForSlot(slotIndex);
  }
});
```

**スキル選択/解除時**:
```javascript
// PartySetupController#toggleSkillForSlot
toggleSkillForSlot(slotIndex, skillId, checked) {
  const slot = this.#slots[slotIndex];
  const selectedIds = new Set(slot.equippedSkillIds);
  
  if (checked) {
    selectedIds.add(skillId);
  } else {
    selectedIds.delete(skillId);
  }
  
  // 正規化（必須スキル自動追加、重複排除）
  this.#updateEquippedSkillIds(slotIndex, [...selectedIds]);
}
```

#### HbrDataStore との連携

**メソッド呼び出し**:
- `store.listEquipableSkillsByStyleId(styleId)` - 装備可能スキル一覧
- `store.getSkillById(skillId)` - スキル取得

## データの流れ

### Party Setup変更時

```
PartySetupController.onChange(snapshot, meta)
  → app.js
    → buildInitialState(partySetupSnapshot)
    → TurnEngineManager.recalculateAll(newInitialState)
      → computedStates / computedRecords を更新
    → TurnAreaController.updateAllRows()
      → 各TurnRowController.update()
```

### ターン実行時

```
TurnRowController.onCommit(turnIndex)
  → TurnAreaController.onCommit(turnIndex)
    → TurnEngineManager.commitNextTurn(slotActions, options)
      → previewTurnRecord()
      → commitTurnRecord()
      → computedStates / computedRecords / replayScript を更新
    → TurnAreaController.addNewTurnRow()
    → TurnAreaController.updateAllRows()
      → 各TurnRowController.update()
```

### 過去ターン編集時

```
TurnRowController.onSlotChange(turnIndex, position, action)
  → TurnAreaController.onSlotChange(turnIndex, position, action)
    → TurnEngineManager.updateSlot(turnIndex, position, action)
      → replayScript.turns[turnIndex].slots[position] を更新
      → recalculateFrom(turnIndex)
        → computedStates[turnIndex:] / computedRecords[turnIndex:] を再計算
    → TurnAreaController.updateAllRows()
      → 各TurnRowController.update()
```

### プレビュー時

```
TurnRowController.onPreviewRequest(turnIndex, slotActions)
  → TurnAreaController.onPreviewRequest(turnIndex, slotActions)
    → TurnEngineManager.previewCurrentTurn(slotActions, options)
      → previewTurnRecord()
      → { odGaugeAfter, activatableInterrupt, previewResourceState }
    → TurnRowController.updateOdPreview(odGaugeAfter)
    → TurnRowController.update({ previewResourceState, odState })
```

## イベントの伝播

### 上方向（UI → エンジン）

```
ユーザー操作
  → UIコントローラー
    → TurnEngineManager
      → adapter-core.js
        → turn-controller.js（エンジン）
```

### 下方向（エンジン → UI）

```
エンジン実行結果
  → TurnEngineManager
    → TurnAreaController
      → 各UIコントローラー
        → UI更新
```

## 共有ストアの利用

### HbrDataStore

全コンポーネントで共有されるデータストアです。

**提供されるデータ**:
- スタイル情報
- キャラクター情報
- スキル情報
- 装備可能スキル一覧

**利用箇所**:
- TurnEngineManager: スタイル/キャラクター取得
- StylePickerController: スタイル一覧表示
- SkillSettingsPanel: スキル一覧表示
- TurnRowController: スタイル画像URL解決

### BattleState

各ターンのバトル状態で、エンジン層で生成されます。

**構成要素**:
- `party`: パーティーメンバー配列
- `turnState`: ターン情報（ターン番号、OD、EXなど）
- `enemyState`: 敵情報
- `odGauge`: ODゲージ値

**利用箇所**:
- TurnEngineManager: 計算の開始点/終了点
- TurnRowController: stateBefore/stateAfterとして表示

### LightweightReplayScript

リプレイスクリプトで、全ターンの操作を保持します。

**構成要素**:
- `setup`: 初期設定
- `turns`: ターン操作配列

**利用箇所**:
- TurnEngineManager: 正本として管理
- TurnRowController: record/replayTurnとして参照

## コールバックパターン

### 変更通知パターン

**例**: Party Setup変更

```javascript
// 親コンポーネント（app.js）
partySetup.onChange((snapshot, meta) => {
  // 変更処理
  processChange(snapshot, meta);
});

// 子コンポーネント（PartySetupController）
#notifyChange(meta = {}) {
  this.#onChange?.(this.getSnapshot(), this.#normalizeChangeMeta(meta));
}
```

### プレビューパターン

**例**: スキル選択

```javascript
// TurnRowController
onPreviewRequest(turnIndex, slotActions) {
  const preview = turnEngineManager.previewCurrentTurn(slotActions, options);
  
  // 部分更新
  turnRow.updateOdPreview(preview.odGaugeAfter);
  turnRow.update({
    previewResourceState: preview.previewResourceState,
    odState: {
      activatableInterrupt: preview.activatableInterrupt
    }
  });
}
```

### 再計算パターン

**例**: 過去ターン編集

```javascript
// TurnAreaController
onSlotChange(turnIndex, position, action) {
  turnEngineManager.updateSlot(turnIndex, position, action);
  
  // 全ターンを更新
  this.updateAllRows();
}

// TurnEngineManager
updateSlot(turnIndex, position, action) {
  replayScript.turns[turnIndex].slots[position] = action;
  recalculateFrom(turnIndex);
}
```

## エラーハンドリング

### UI層でのエラー

**TurnRowController**:
- `updateOdPreview()` でのエラーを無視（nullチェック）
- プレビュー失敗時は「→ —」表示

**TurnEngineManager**:
- `recalculateFrom()` でのエラーは警告出力して停止
- `previewCurrentTurn()` でのエラーはnullを返す

### エンジン層でのエラー

**adapter-core.js**:
- `previewTurnRecord()` でのエラーは再スロー
- `commitTurnRecord()` でのエラーは再スロー

**turn-controller.js**:
- エンジン実行時のエラーは例外をスロー
- 呼び出し元でキャッチして処理

## 関連ドキュメント

- [ui_next_architecture_overview.md](./ui_next_architecture_overview.md) - 全体アーキテクチャ
- [ui_next_party_setup_spec.md](./ui_next_party_setup_spec.md) - Party Setup仕様
- [ui_next_turn_row_spec.md](./ui_next_turn_row_spec.md) - Turn Row仕様
- [ui_next_turn_engine_manager_spec.md](./ui_next_turn_engine_manager_spec.md) - TurnEngineManager仕様
- [ui_next_data_flow.md](./ui_next_data_flow.md) - データフロー
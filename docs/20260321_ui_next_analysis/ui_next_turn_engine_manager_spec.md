# UI Next: TurnEngineManager 仕様

> **ステータス**: 📚 仕様書 | **作成**: 2026-03-21
>
> **実装**: `ui-next/engine/turn-engine-manager.js` | **関連**: [ui_next_architecture_overview.md](./ui_next_architecture_overview.md)

---

## 概要

TurnEngineManager は、リプレイスクリプトを正本として管理し、ターン計算を調整する中心的なクラスです。UI層での状態管理を担当し、エンジン層へのブリッジ機能を提供します。

## 責務

1. リプレイスクリプト（LightweightReplayScript）の保持と管理
2. preview/commitの2段階処理
3. 過去ターンの再計算（`recalculateFrom`）
4. OD操作（先制/割込）の管理
5. 特殊操作（鬼神化/魔騎兵起動）の管理
6. stateBefore/stateAfterの提供

## 状態管理

### 内部状態

```javascript
{
  #initialState: BattleState,           // 初期バトル状態
  #replayScript: LightweightReplayScript, // リプレイスクリプト（正本）
  #computedStates: BattleState[],       // [i] = turn i の commit 後 state
  #computedRecords: CommittedRecord[],  // [i] = turn i の committedRecord
  
  // 未コミット行の予約
  #pendingPreemptiveOdLevel: number | null,  // 先制ODレベル
  #pendingInterruptOdLevel: number | null,   // 割込ODレベル
  #pendingSpecialOperations: ReplayOperation[], // 特殊操作配列
  
  #validationPolicy: ValidationPolicy,     // 検証ポリシー
}
```

### プロパティアクセサー

| プロパティ | 戻り値 | 説明 |
|-----------|---------|--------|
| `replayScript` | `LightweightReplayScript` | リプレイスクリプトの参照 |
| `computedRecords` | `CommittedRecord[]` | コミット済みレコード配列 |
| `computedStates` | `BattleState[]` | コミット済みstate配列 |
| `initialState` | `BattleState` | 初期バトル状態 |
| `currentState` | `BattleState` | 現在の最新state（`computedStates[-1]` or `initialState`） |
| `currentStateWithPending` | `BattleState` | 予約済み操作適用後のstate |
| `committedTurnCount` | `number` | コミット済みターン数 |
| `pendingPreemptiveOdLevel` | `number \| null` | 未コミット行の先制OD予約 |
| `pendingInterruptOdLevel` | `number \| null` | 未コミット行の割込OD予約 |
| `pendingSpecialOperations` | `ReplayOperation[]` | 未コミット行の特殊操作 |
| `validationPolicy` | `ValidationPolicy` | 検証ポリシー |

## 主要メソッド

### initialize(initialState, replaySetup, options)

初期化を行い、空のリプレイスクリプトを設定します。

**パラメータ**:
- `initialState`: BattleState - 初期バトル状態
- `replaySetup`: object - 初期設定（敵情報など）
- `options`: object
  - `validationPolicy`: ValidationPolicy - 検証ポリシー

**挙動**:
- `#initialState` を設定
- 空の `LightweightReplayScript` を作成
- `#computedStates` / `#computedRecords` をクリア
- 未コミット操作を全てクリア

### loadReplayScript(initialState, replayScript, options)

リプレイスクリプトを読み込み、全ターンを再計算します。

**パラメータ**:
- `initialState`: BattleState - 初期バトル状態
- `replayScript`: object - 読み込むリプレイスクリプト
- `options`: object
  - `validationPolicy`: ValidationPolicy - 検証ポリシー

**挙動**:
- `#initialState` を設定
- `replayScript` を正規化（`normalizeLightweightReplayScript`）
- `#computedStates` / `#computedRecords` をクリア
- 未コミット操作を全てクリア
- `recalculateFrom(0)` を実行

### commitNextTurn(slotActions, options)

現在の最終stateに1ターン追加してコミットします。

**パラメータ**:
- `slotActions`: Object<number, {skillId, target}> - positionキーのスキル選択
- `options`: object
  - `interruptOdLevel`: number - 割込ODレベル（`#pendingInterruptOdLevel`の優先）
  - `enemyAction`: object - 敵の行動（未使用）
  - `note`: string - ターンメモ
  - `actionOutcomeOverrides`: ActionOutcomeOverride[] - 手動ブレイク指定
  - `enemyCount`: number - 敵数

**挙動**:
1. 未コミット操作を構築（`#buildCommittedOperations`）
2. Before-commit操作を適用（OD予約、鬼神化など）
3. `previewTurnRecord` でプレビュー計算
4. `state.party` をdeep copy（汚染防止）
5. `commitTurnRecord` でコミット
6. `LightweightReplayTurn` を構築して追加
7. `#computedStates` / `#computedRecords` に追加
8. 未コミット操作を全てクリア

**戻り値**: `committedRecord`

### recalculateFrom(fromIndex)

指定ターンから再計算します。

**パラメータ**:
- `fromIndex`: number - 再計算開始ターンインデックス（0始まり）

**挙動**:
1. `#computedStates[fromIndex]` 以降を削除
2. `#computedRecords[fromIndex]` 以降を削除
3. 未コミット操作を全てクリア
4. `fromIndex === 0` の場合: `#initialState` を開始点
5. `fromIndex > 0` の場合: `#computedStates[fromIndex-1]` を開始点
6. 各ターンについて:
   - `state.party` をdeep copy
   - `#alignPositionsToSlots` でpositionを復元
   - `replayTurn.operations` を適用
   - `previewTurnRecord` + `commitTurnRecord` を実行
   - `#computedStates` / `#computedRecords` に追加
7. エラー発生時は警告を出して停止

**注意**:
- 各ターンで party をdeep copy することで、過去ターンの汚染を防止
- OD operations（ACTIVATE_PREEMPTIVE_OD / RESERVE_INTERRUPT_OD）も再現

### recalculateAll(newInitialState)

初期バトル状態を差し替えて全ターンを再計算します。

**パラメータ**:
- `newInitialState`: BattleState - 新しい初期バトル状態

**挙動**:
1. `#initialState` を更新
2. `recalculateFrom(0)` を実行

**用途**: Party Setup変更後の全再計算

### previewCurrentTurn(slotActions, options)

未コミット行のスキル選択に基づいてプレビューします。

**パラメータ**:
- `slotActions`: Object<number, {skillId, target}> - positionキーのスキル選択
- `options`: object
  - `actionOutcomeOverrides`: ActionOutcomeOverride[] - 手動ブレイク指定
  - `enemyCount`: number - 敵数

**戻り値**:
```javascript
{
  odGaugeAfter: number | null,    // プレビュー後のODゲージ
  activatableInterrupt: number[],   // 発動可能な割込ODレベル
  previewResourceState: {         // プレビュー後のリソース状態
    spAfterByPartyIndex: {
      [partyIndex]: number  // ターン終了後のSP
    }
  }
}
```

**挙動**:
1. 未コミット操作を適用（`#buildPendingBeforeCommitOperations`）
2. `previewTurnRecord` を実行
3. ODゲージと割込候補を算出

### updateSlot(turnIndex, position, action)

指定ターンのスロットを更新して再計算します。

**パラメータ**:
- `turnIndex`: number - ターンインデックス
- `position`: number - 更新するposition（0-5）
- `action`: object
  - `skillId`: number | null - スキルID
  - `swapWith`: number | null - スワップ先position

**挙動**:
1. `replayScript.turns[turnIndex]` の `slots[position]` を更新
2. `recalculateFrom(turnIndex)` を実行

### updateOperations(turnIndex, operations)

指定ターンの操作を更新して再計算します。

**パラメータ**:
- `turnIndex`: number - ターンインデックス
- `operations`: ReplayOperation[] - 操作配列

**挙動**:
1. `replayScript.turns[turnIndex]` の `operations` を更新
2. `recalculateFrom(turnIndex)` を実行

### updateEnemyCount(turnIndex, enemyCount)

指定ターンの敵数を更新して再計算します。

**パラメータ**:
- `turnIndex`: number - ターンインデックス
- `enemyCount`: number - 敵数（1-3）

**挙動**:
1. `overrideEntries` に `ENEMY_COUNT` を設定
2. `actionOutcomeOverrides` を正規化（敵数変更に応じて）
3. `recalculateFrom(turnIndex)` を実行

### updateActionOutcomeOverrides(turnIndex, actionOutcomeOverrides)

指定ターンのブレイク指定を更新して再計算します。

**パラメータ**:
- `turnIndex`: number - ターンインデックス
- `actionOutcomeOverrides`: ActionOutcomeOverride[] - ブレイク指定

**挙動**:
1. `overrideEntries` に `ACTION_OUTCOME_OVERRIDES` を設定
2. `recalculateFrom(turnIndex)` を実行

### updateNote(turnIndex, note)

指定ターンのメモを更新します（再計算不要）。

**パラメータ**:
- `turnIndex`: number - ターンインデックス
- `note`: string - メモ

**挙動**:
- `replayScript.turns[turnIndex].note` を設定

### setPendingPreemptiveOd(level)

未コミット行の先制ODを予約/解除します。

**パラメータ**:
- `level`: number | null - ODレベル（1-3）、nullで解除

**挙動**:
- `#pendingPreemptiveOdLevel` を設定

### setPendingInterruptOd(level)

未コミット行の割込ODを予約/解除します。

**パラメータ**:
- `level`: number | null - ODレベル（1-3）、nullで解除

**挙動**:
- `#pendingInterruptOdLevel` を設定

### addPendingSpecialOperation(operation)

未コミット行に特殊操作を追加します。

**パラメータ**:
- `operation`: ReplayOperation - 追加する操作

**戻り値**: `boolean` - 追加成功か

**挙動**:
1. 操作を正規化（`#normalizeReplayOperation`）
2. 重複チェック（`allowMultiple: false`の場合）
3. 発動条件チェック（鬼神化/魔騎兵）
4. `#pendingSpecialOperations` に追加

### removePendingSpecialOperation(index)

未コミット行の特殊操作を削除します。

**パラメータ**:
- `index`: number - 削除する操作のインデックス

**戻り値**: `boolean` - 削除成功か

**挙動**:
- `#pendingSpecialOperations[index]` を削除

### getStateBefore(turnIndex)

指定ターンのコミット済み行に渡すstateBeforeを返します。

**パラメータ**:
- `turnIndex`: number - ターンインデックス

**戻り値**: `BattleState`

**挙動**:
1. `turnIndex === 0` の場合: `#initialState` を返す
2. それ以外の場合: `#computedStates[turnIndex-1]` を返す
3. 鬼神化operationがある場合、適用済みstateを返す

**用途**: 鬼神化後にコミットしたSP0スキルが再描画時も正しく選択状態を保持するため

### buildInputRowSnapshot(options)

未コミット行の入力スナップショットを構築します。

**パラメータ**:
- `options`: object
  - `slotActions`: Object - スキル選択
  - `enemyCount`: number - 敵数
  - `actionOutcomeOverrides`: ActionOverride[] - ブレイク指定

**戻り値**:
```javascript
{
  stateBefore: BattleState,
  slotActions: Object,
  odGaugeAfter: number | null,
  previewResourceState: { spAfterByPartyIndex: {...} },
  activatablePreemptive: number[],
  activatableInterrupt: number[],
  operationState: {
    kishinkaStatus: { ... },
    makaiKiheiStatus: { ... }
  }
}
```

## 特殊操作管理

### 鬼神化

**発動条件** (`isKishinkaAvailable()`):
- 手塚咲（`TEZUKA_CHARACTER_ID`）がパーティにいる
- 鬼神化中でない
- 行動不能中でない

**ステータス取得** (`getKishinkaStatus()`):
```javascript
{
  hasTezuka: boolean,
  available: boolean,
  activePending: boolean,      // 予約済みか
  isActive: boolean,            // 発動中か
  turnsRemaining: number,      // 残ターン数
  actionDisabledTurns: number  // 行動不能残ターン数
}
```

**操作追加** (`addPendingSpecialOperation`):
- `ACTIVATE_KISHINKA` タイプ
- 発動条件チェック後に追加

### 魔騎兵起動

**発動条件** (`getMakaiKiheiStatus()`):
- 山脇玲巴がパーティにいる
- 残使用回数 > 0
- 最大使用回数: `MAKAI_KIHEI_MAX_USES`

**ステータス取得** (`getMakaiKiheiStatus()`):
```javascript
{
  hasYamawaki: boolean,
  available: boolean,
  remainingUses: number,
  pendingCount: number,  // 予約済み数
  maxUses: number
}
```

**操作追加** (`addPendingSpecialOperation`):
- `ACTIVATE_MAKAI_KIHEI` タイプ
- 残使用回数チェック後に追加

### OD操作

#### 先制OD（ACTIVATE_PREEMPTIVE_OD）

**発動条件** (`#getOdActivationStatus`):
- 通常ターンかつOD/EX文脈でないこと

**予約設定**:
- `#pendingPreemptiveOdLevel` にレベルを設定
- `commitNextTurn` 時に `ACTIVATE_PREEMPTIVE_OD` 操作として追加

#### 割込OD（RESERVE_INTERRUPT_OD）

**発動条件** (`#getOdActivationStatus`):
- OD文脈でないこと

**予約設定**:
- `#pendingInterruptOdLevel` にレベルを設定
- `commitNextTurn` 時に `RESERVE_INTERRUPT_OD` 操作として追加

**OD発動文脈判定**:
```javascript
{
  canPreemptive: !inOdContext && !inExtraContext,
  canInterrupt: !inOdContext
}
```
- `inOdContext`: ODターン or OD一時停止中（EX中のOD）or OD発動待機中（EX後のOD）
- `inExtraContext`: EXターン or extraTurnStateが存在

## ポジション管理

### swapCurrentPositions(srcPosition, dstPosition)

未コミット行のpositionを入れ替えます。

**パラメータ**:
- `srcPosition`: number - 元position（0-5）
- `dstPosition`: number - 先position（0-5）

**挙動**:
- `currentState.party` のメンバーのposition値を交換
- Party Setup変更とは異なり、ターン内の一時的なスワップ

### #alignPositionsToSlots(state, replayTurn)

リプレイトーンのslotsに従ってstate.partyのpositionを復元します。

**用途**:
- `recalculateFrom` でD&Dによるposition変更を正確に再現
- `commitTurnRecord` がpartyをdeep copyするため、mutationは次ターンに影響しない

**挙動**:
```javascript
for (let i = 0; i < replayTurn.slots.length; i++) {
  const slot = replayTurn.slots[i];
  if (slot?.styleId == null) continue;
  const member = state.party.find(m => m.styleId === slot.styleId);
  if (member) member.position = i;
}
```

## Before-commit操作

### #buildPendingBeforeCommitOperations()

未コミット行の操作を構築します。

**戻り値**: `ReplayOperation[]`

**構成要素**:
1. `#pendingSpecialOperations` のコピー
2. `#pendingPreemptiveOdLevel` が設定されている場合、`ACTIVATE_PREEMPTIVE_OD` 操作

### #buildCommittedOperations()

コミット用の操作を構築します。

**戻り値**: `ReplayOperation[]`

**構成要素**:
- `#buildPendingBeforeCommitOperations()` の結果
- `#pendingInterruptOdLevel` が設定されている場合、`RESERVE_INTERRUPT_OD` 操作

### applyBeforeCommitOperations(state, operations, options)

Before-commit操作をstateに適用します（エンジン層の関数）。

**用途**:
- 未コミット行のプレビュー時に予約操作を適用
- `recalculateFrom` でリプレイ操作を再現

**処理**:
- `ACTIVATE_KISHINKA`: 鬼神化発動
- `ACTIVATE_MAKAI_KIHEI`: 魔騎兵起動
- `ACTIVATE_PREEMPTIVE_OD`: 先制OD発動

## 検証ポリシー

### normalizeValidationPolicy(options)

検証ポリシーを正規化します。

**パラメータ**:
- `options`: object | null

**戻り値**: `ValidationPolicy`

**デフォルト値**:
```javascript
{
  // 将来的な拡張ポイント
}
```

## リプレイトーン構築

### #buildReplayTurn(state, slotActions, note, operations, enemyCount, actionOutcomeOverrides)

commit時点のstate + slotActionsからLightweightReplayTurnを生成します。

**パラメータ**:
- `state`: BattleState - commit前のstate
- `slotActions`: Object - positionキーのスキル選択
- `note`: string - ターンメモ
- `operations`: ReplayOperation[] - 操作配列
- `enemyCount`: number - 敵数
- `actionOutcomeOverrides`: ActionOverride[] - ブレイク指定

**戻り値**: `LightweightReplayTurn`

**構造**:
```javascript
{
  turn: state.turnState.turnIndex,
  slots: [
    {
      styleId: state.party[i].styleId,
      skillId: slotActions[i]?.skillId,
      target: slotActions[i]?.target
    },
    // ... 6スロット分
  ],
  note,
  operations,
  overrideEntries: [
    { type: "ENEMY_COUNT", payload: enemyCount },
    { type: "ACTION_OUTCOME_OVERRIDES", payload: [...] }
  ]
}
```

### #slotActionsFromReplayTurn(replayTurn)

ReplayTurnからslotActionsを復元します。

**戻り値**: `Object<number, {skillId, styleId, target}>`

**用途**:
- `recalculateFrom` でスキル選択を復元

### #buildActionsDict(state, slotActions, actionOutcomeOverrides)

UIのslotActionsをエンジンのactions dictに変換します。

**パラメータ**:
- `state`: BattleState
- `slotActions`: Object - positionキーのスキル選択
- `actionOutcomeOverrides`: ActionOverride[] - ブレイク指定

**戻り値**: `Object<number, {skillId, targetEnemyIndex, targetCharacterId, breakHitCount, manualBreakEnemyIndexes}>`

**処理**:
1. position 0-2（前衛）のみ処理
2. 後衛はスキル使用不可のため除外
3. EXターン時は `allowedCharacterIds` チェック
4. `resolveEffectiveSkillForAction` で有効スキル解決
5. `#materializeActionTarget` でターゲット実体化
6. ブレイク指定を適用

## ターゲット処理

### #materializeActionTarget(state, target)

ReplayTargetをエンジンのtargetEnemyIndex/targetCharacterIdに変換します。

**パラメータ**:
- `state`: BattleState
- `target`: ReplayTarget - `{type, enemyIndex, styleId, characterId}`

**戻り値**: `Object`

**処理**:
- `type: 'enemy'` → `targetEnemyIndex: number`
- `type: 'ally'` → `targetCharacterId: string`（characterIdで検索）

## ActionOutcome正規化

### #normalizeActionOutcomeOverridesForState(state, slotActions, actionOutcomeOverrides, enemyCount)

stateのコンテキストでactionOutcomeOverridesを正規化します。

**処理**:
1. 敵数正規化（`clampEnemyCount`）
2. 各overrideについて:
   - `breakAttributionMode` が NONE の場合は除外
   - `breakAttributionMode` が ALL の場合はそのまま採用
   - `breakAttributionMode` が SINGLE の場合はターゲット単一化

## エラーハンドリング

### recalculateFrom

**エラー時の挙動**:
- `console.warn` で警告を出力
- `#computedStates` / `#computedRecords` にエラー時のstateを追加
- ループを中断（`break`）

### previewCurrentTurn

**エラー時の挙動**:
- `try-catch` でエラーをキャッチ
- エラー時は `null` を返す
- UI側でnullをチェックして適切な表示

## パフォーマンス考慮

### Deep Copy

**目的**: 過去ターンのstate汚染を防止

**実装**:
```javascript
const stateForCommit = { ...state, party: state.party.map((m) => m.clone()) };
```

**タイミング**:
- `commitNextTurn` 時
- `recalculateFrom` の各ターン開始時

### Position復元

**目的**: D&Dによるposition変更を正確に再現

**実装**:
- `#alignPositionsToSlots` で `slots[i].styleId` に基づいてpositionを復元
- 各ターンで独立したpartyコピーを使用

## 関連ドキュメント

- [ui_next_architecture_overview.md](./ui_next_architecture_overview.md) - 全体アーキテクチャ
- [ui_next_turn_row_spec.md](./ui_next_turn_row_spec.md) - Turn Row仕様
- [ui_next_component_interaction.md](./ui_next_component_interaction.md) - コンポーネント間相互作用
- [ui_next_data_flow.md](./ui_next_data_flow.md) - データフロー
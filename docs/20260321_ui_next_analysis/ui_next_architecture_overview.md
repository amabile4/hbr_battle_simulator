# UI Next: 全体アーキテクチャ概要

> **ステータス**: 📚 仕様書 | **作成**: 2026-03-21
>
> **関連**: [ui_next_game_rules_index.md](./ui_next_game_rules_index.md) - エンジンルール参照インデックス

---

## 概要

`ui-next/` は、Heaven Burns Red バトルシミュレーターの新UI実装です。エンジン層（`src/`）とUI層を明確に分離し、リプレイスクリプトによる状態管理を行うアーキテクチャを採用しています。

## 責務分離

### エンジン層 (`src/`)

ゲームルールの純粋な実装を担当し、UIに依存しません。

| ディレクトリ | 主な責務 |
|-----------|-----------|
| `src/domain/` | ドメインモデル（CharacterStyle, Party, SPなど） |
| `src/turn/` | ターン制御、スキル解決、OD管理 |
| `src/config/` | ゲーム設定定数（ODコスト、SP回復量など） |
| `src/contracts/` | インターフェース定義、データ構造 |
| `src/data/` | データストア、スキーマ検証 |
| `src/ui/adapter-core.js` | UI ↔ エンジンのブリッジ（previewTurn/commitTurn） |

**重要**: `src/ui/dom-adapter.js` は旧UI実装であり、`ui-next/` では使用しません。

### UI層 (`ui-next/`)

ユーザー操作の受け付けと表示を担当し、エンジン層に委譲します。

| ディレクトリ | 主な責務 |
|-----------|-----------|
| `ui-next/components/` | UIコンポーネント（PartySetup, TurnRow, StylePickerなど） |
| `ui-next/engine/` | UI層での状態管理（TurnEngineManager） |
| `ui-next/utils/` | UIユーティリティ（ターゲット設定、ブレイク編集など） |

## データフロー

```
ユーザー操作
  ↓
UIコントローラー (PartySetupController / TurnRowController)
  ↓
TurnEngineManager
  ↓
adapter-core.js (previewTurnRecord / commitTurnRecord)
  ↓
turn-controller.js (エンジン実行)
  ↓
結果返却 → TurnEngineManager → UI更新
```

## リプレイスクリプト

### LightweightReplayScript

すべてのターン操作を永続化するデータ構造です。

```javascript
{
  setup: {
    // 初期設定（敵情報など）
  },
  turns: [
    {
      turn: 0,
      slots: [
        { styleId, skillId, target: { type, enemyIndex, styleId } }
        // position 0-5 の6スロット
      ],
      note: "メモ",
      operations: [
        { type: "ACTIVATE_PREEMPTIVE_OD", payload: { level: 1 } },
        { type: "ACTIVATE_KISHINKA" },
        // その他特殊操作
      ],
      overrideEntries: [
        { type: "ENEMY_COUNT", payload: 2 },
        { type: "ACTION_OUTCOME_OVERRIDES", payload: [...] }
      ]
    }
  ]
}
```

### 特徴

- **不変性**: 各ターンの操作はコミット時に確定し、過去ターンの変更は再計算で反映
- **可逆性**: 任意のターンから再計算可能（`recalculateFrom(turnIndex)`）
- **軽量性**: 必要な情報のみを保持（完全なstateは保持せず、computedStatesで再現）

## 主要コンポーネント

### TurnEngineManager

リプレイスクリプトを正本として管理し、ターン計算を調整する中心的なクラスです。

**責務**:
- リプレイスクリプトの保持と管理
- preview/commitの2段階処理
- 過去ターンの再計算（`recalculateFrom`）
- OD操作（先制/割込）の管理
- 特殊操作（鬼神化/魔騎兵起動）の管理
- stateBefore/stateAfterの提供

**メソッド**:
- `initialize(initialState, replaySetup)` - 初期化
- `loadReplayScript(initialState, replayScript)` - リロード
- `commitNextTurn(slotActions, options)` - ターン実行とコミット
- `recalculateFrom(fromIndex)` - 指定ターンから再計算
- `previewCurrentTurn(slotActions)` - プレビュー計算
- `updateSlot(turnIndex, position, action)` - スロット更新と再計算
- `updateOperations(turnIndex, operations)` - 操作更新と再計算

### PartySetupController

6スロットの編成を管理するコンポーネントです。

**責務**:
- 6スロット（前衛3/後衛3）の編成
- メイン/サポートスタイルの選択
- 限突/DP/SP装備/属性ベルトの設定
- 重複排除ルールの適用
- プリセット機能（保存/読込）
- スキル設定パネルの連携

**重複排除ルール**:
- メイン同士: 同一キャラクター不可 → 既存をクリア
- メイン↔サポート: 同一スタイル不可 → 既存サポートをクリア
- サポート同士: 同一スタイル不可 → 既存をクリア

### TurnRowController

1ターン分の横長UIを管理するコンポーネントです。

**責務**:
- 前衛スロット（0-2）のスキル選択
- 後衛スロット（3-5）の表示
- ODゲージの表示と予約（先制/割込）
- 敵数設定（1-3）
- ブレイク編集UI
- ターゲット指定（敵/味方）
- ドラッグ&ドロップによるスワップ
- EXターン時の行動制約表示

**状態**:
- 未コミット行: `record=null`、`stateBefore` のみ
- コミット済み行: `record` あり、`stateBefore`/`stateAfter` 両方

### StylePickerController

全画面スタイルピッカーを管理するコンポーネントです。

**責務**:
- スタイル一覧の表示と検索
- フィルタリング（レアリティ、属性、武器タイプ）
- 重複スタイルのグレーアウト
- 連続選択モード（次の空きスロットへ自動進行）

## エンジンとの連携

### previewTurnRecord

ターン実行の予測を行い、結果を返します。

```javascript
const previewRecord = previewTurnRecord(state, actions, enemyAction, enemyCount);
// previewRecord.projections.odGaugeAtEnd でODゲージ予測
// previewRecord.actions[].spChanges でSP変動
```

### commitTurnRecord

ターン実行を確定し、次ターンのstateを生成します。

```javascript
const { nextState, committedRecord } = commitTurnRecord(state, previewRecord, swapEvents, options);
// nextState: 次ターンのBattleState
// committedRecord: 永続化用レコード
```

### resolveEffectiveSkillForAction

スキルの有効形態を解決します（パッシブ効果、スキル変形など）。

```javascript
const effectiveSkill = resolveEffectiveSkillForAction(state, member, skill);
```

## 状態管理の原則

1. **単一の真実**: `TurnEngineManager` がリプレイスクリプトと computedStates を保持し、これが正本
2. **不変性**: エンジン実行時に party を deep copy し、過去ターンの汚染を防止
3. **再計算ベース**: 過去ターンの変更は、そのターンから再計算して反映
4. **UIはビュー**: UIコントローラーは状態を持たず、`update()` で渡された値を表示のみ

## スレッドセーフティ

- すべての処理はメインスレッドで同期実行
- 非同期処理なし（Web Workers未使用）
- UI更新は同期的に行われる

## パフォーマンス考慮

- `recalculateFrom` はターン数に比例して計算時間が増加
- 大量ターン（100ターン以上）の再計算は数秒かかる可能性あり
- UI更新は差分更新（`refreshSkillSelects`など）で最適化

## 拡張ポイント

### 新規特殊操作の追加

`REPLAY_OPERATION_TYPES` に新規タイプを追加し、`replayOperationRegistry` に登録します。

### 新規overrideエントリの追加

`REPLAY_OVERRIDE_ENTRY_TYPES` に新規タイプを追加し、`applyReplayOverrideEntriesToScenarioTurn` で処理します。

### 新規UIコンポーネントの追加

既存コンポーネントと同じパターンで実装します：
1. コンストラクタで `root` と `store` を受け取る
2. `mount()` で初期HTML生成とイベントバインド
3. `update()` で状態更新と再描画
4. コールバックで親コンポーネントに通知

## 関連ドキュメント

- [ui_next_party_setup_spec.md](./ui_next_party_setup_spec.md) - Party Setup詳細仕様
- [ui_next_turn_row_spec.md](./ui_next_turn_row_spec.md) - Turn Row詳細仕様
- [ui_next_turn_engine_manager_spec.md](./ui_next_turn_engine_manager_spec.md) - TurnEngineManager詳細仕様
- [ui_next_data_flow.md](./ui_next_data_flow.md) - データフロー詳細
- [ui_next_component_interaction.md](./ui_next_component_interaction.md) - コンポーネント間相互作用
- [ui_next_game_rules_index.md](./ui_next_game_rules_index.md) - エンジンルール参照
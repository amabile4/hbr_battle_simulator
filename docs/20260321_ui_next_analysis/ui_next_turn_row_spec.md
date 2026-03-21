# UI Next: Turn Row 仕様

> **ステータス**: 📚 仕様書 | **作成**: 2026-03-21
>
> **実装**: `ui-next/components/turn-row.js` | **関連**: [ui_next_architecture_overview.md](./ui_next_architecture_overview.md)

---

## 概要

Turn Row は、1ターン分の横長UIを管理するコンポーネントです。未コミット行（入力中）とコミット済み行（実行済み）の両方を表示し、スキル選択、OD予約、敵数設定、ブレイク編集などの機能を提供します。

## 状態区分

### 未コミット行

**条件**: `record === null`

**特徴**:
- `stateBefore` のみ提供
- スキル選択可能
- OD予約（先制/割込）可能
- 敵数設定可能
- ブレイク編集可能
- 「実行」ボタン表示

**用途**: ユーザーが次のターンの行動を計画中

### コミット済み行

**条件**: `record !== null`

**特徴**:
- `stateBefore` と `stateAfter` の両方提供
- スキル選択不可（readonly）
- OD予約不可
- 敵数設定可能（再計算トリガー）
- ブレイク編集可能（再計算トリガー）
- 「実行」ボタンなし

**用途**: 過去ターンの結果表示と編集

## UI構造

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ターン情報 │ 前衛スロット │ 後衛スロット │ ボタン │ メモ │
├─────────────┼─────────────────┼─────────────────┼───────┼──────┤
│ T1         │ [P1][P2][P3]   │ [P4][P5][P6]   │ 実行   │      │
│ OD: 100%   │ SPスキル        │ 後衛          │ OD1    │      │
│            │ ターゲット      │                │ 割込   │      │
│            │                 │                │ 鬼神化 │      │
└─────────────┴─────────────────┴─────────────────┴───────┴──────┘
```

### 各セクションの詳細

#### ターン情報（左端）

| 要素 | 未コミット | コミット済み |
|------|----------|----------|
| ターン番号 | `T${nextTurnNo}` | `#${seqId} T${turnNo}` |
| OD/EXラベル | 予測値 | 確定値 |
| 敵数選択 | ○ | ○ |
| ODゲージ | `000.00% → —` | `000.00% → 000.00%` |

#### 前衛スロット（position 0-2）

```
[属性バッジ][スキルselect]
[アイコン][ターゲット][トークン][士気]
```

**要素**:
- **属性バッジ**: スキルの攻撃タイプ（斬/突/打）と属性（火/氷/雷/光/闇）
- **スキルselect**: SPコスト付きスキル選択
- **アイコン**: スタイル画像 + SPバッジ
- **ターゲット**: 敵/味方ターゲット指定（必要な場合のみ）
- **トークン**: 5×2グリッドで現在値表示
- **士気**: 大丸（5）+ 小丸（1）で現在値表示

**EXターン時**:
- 行動可能メンバー: 通常表示
- 非行動メンバー: 「EX待機」表示（琥珀色）

#### 後衛スロット（position 3-5）

```
[後衛ラベル]
[アイコン（薄暗い）]
[トークン][士気]
```

**特徴**:
- スキルselectなし（後衛はスキル使用不可）
- トークン/士気は表示（パッシブ効果適用）
- アイコンは不透明度0.7で表示

#### ボタン列（右端）

| ボタン | 未コミット | コミット済み |
|-------|----------|----------|
| 実行 | ○ | × |
| 先制OD | ○（select） | × |
| 割込OD | ○（select） | × |
| 鬼神化 | ○（条件付き） | × |
| 魔騎兵起動 | ○（条件付き） | × |
| ブレイク | ○（トグル） | × |

#### メモ欄（最右）

- **行数**: 2行
- **プレースホルダー**: なし
- **変更**: 即座に `onNoteChange` コールバック

## スキル選択

### 表示形式

```
[SP3]スキル名
```

- **幅に応じた表示切り替え**:
  - 広い（≥90px）: `[SP3]スキル名`
  - 狭い（<90px）: `スキル名`（SP省略）
  - ヒステリシス: ±8pxで切り替え

### SPバッジ表示

- **位置**: アイコン右上（absolute -top-0.5 -right-0.5）
- **フォント**: 太字、中央揃え、パディングあり
- **色**:
  - SP < 0: 赤（`#ef4444`）
  - SP ≥ 0: 白（`#ffffff`）
- **テキストシャドウ**: 黒枠で視認性確保

### スキルバッジ

- **位置**: スキルselect左側
- **内容**: 攻撃タイプアイコン + 属性アイコン
- **表示条件**: スキルが攻撃タイプか属性を持つ場合
- **幅制御**: スキルselect幅に応じて表示/非表示

## OD管理

### ODゲージ表示

**フォーマット**: `000.00%`（負値は `-000.00%`）

**未コミット行**:
```
OD: 100.50% → —
```
- 「→ —」はプレビュー結果待ち状態
- `updateOdPreview(odGaugeAfter)` で更新

**コミット済み行**:
```
OD: 050.00% → 075.00%
```
- ターン開始時と終了時の両方を表示

### 先制OD予約

**selectオプション**:
- 先制—（解除）
- OD1
- OD2
- OD3

**発動条件**:
- 通常ターンかつOD/EX文脈でないこと
- ODゲージが要件量以上であること
- 該当レベルが発動可能であること

**UI制御**:
- 発動可能レベルのみ選択可能
- 選択時: 紫色のハイライト（border-purple-400 bg-purple-100）

### 割込OD予約

**selectオプション**:
- 割込—（解除）
- OD1
- OD2
- OD3

**発動条件**:
- OD文脈でないこと
- プレビュー後のODゲージが要件量以上であること
- 該当レベルが発動可能であること

**UI制御**:
- `updateInterruptOdCandidates(candidates)` で動的に更新
- 発動可能レベルのみ選択可能
- 選択中レベルが候補から外れた場合は自動リセット

## 敵数設定

### selectオプション

- 1
- 2
- 3

### デフォルト値

- 未コミット行: `stateBefore.turnState.enemyState.enemyCount`
- コミット済み行: `overrideEntries` から取得

### 変更時の挙動

**未コミット行**:
- 即座にプレビュー更新（`onPreviewRequest`）
- ターゲット候補の更新

**コミット済み行**:
- `onEnemyCountChange` コールバック
- 該当ターンから再計算（`recalculateFrom`）

## ブレイク編集

### ブレイク編集ボタン

- **位置**: ボタン列下部
- **ラベル**: 「ブレイク」
- **色**: 琥珀色（border-amber-300 bg-amber-50）

### ブレイク編集エディタ（ポップオーバー）

**構造**:
```
┌─────────────────────────────┐
│ ブレイクを編集           │
├─────────────────────────────┤
│ [キャラ1]               │
│   [E1] [E2] [E3]      │
├─────────────────────────────┤
│ [キャラ2]               │
│   [E2] をブレイク       │
└─────────────────────────────┘
```

**開閉**: ボタンクリックでトグル

### ブレイク帰属モード（TurnBreakAttributionMode）

| モード | UI | 説明 |
|--------|-----|------|
| NONE | 「敵を攻撃しないため指定なし」 | 攻撃スキルなし |
| ALL | 敵1/敵2/敵3（複数選択可） | 全体攻撃 |
| SINGLE | [E2] をブレイク | 単体攻撃 |

### 手動ブレイク指定

**ALLモード**:
- 敵ごとのボタンをクリックでブレイク指定/解除
- 複数選択可

**SINGLEモード**:
- 攻撃対象（自動選択または手動選択）のボタンで切り替え
- 「[E2] をブレイク」形式

**敵数変更時**:
- 候補が自動更新（敵名を反映）

## ターゲット指定

### ターゲット種別

| 種別 | UI | 説明 |
|------|-----|------|
| 敵 | `敵: E1 敵名` | 敵単体/複数指定 |
| 味方 | `味方: キャラ名` | 味方単体指定 |

### 敵ターゲット

**手動モード**:
- 敵ごとのボタンをクリックで指定
- ラベル: `E1 敵名` または `E1`（敵名なし）

**自動モード**:
- エンジンが自動選択した敵を表示
- 手動オーバーライド可能

### 味方ターゲット

**UI形式**: 3×2グリッド（スタイル画像）

**選択方法**:
- スタイル画像をクリックで指定
- ラベル: `P1`（position + 1）

**制限**:
- 同一キャラクター選択不可（`characterId` 重複）
- エンジン制約による除外スキルあり

### ターゲット保存

**未コミット行**:
- `draftTargets[partyIndex]` に一時保存
- プレビュー時に反映

**コミット済み行**:
- `replayTurn.slots[position].target` に保存
- 変更時 `onSlotChange` で再計算

## 特殊操作

### 鬼神化

**発動条件**:
- 手塚咲（`TEZUKA_CHARACTER_ID`）がパーティにいること
- 鬼神化中でないこと
- 行動不能中でないこと

**UI制御**:
- **未発動**: 「鬼神化」ボタン（白背景、紫枠）
- **発動待機**: 「鬼神化待機」ボタン（紫背景、無効）
- **発動中**: 「鬼神化中 残3T」ラベル（紫背景）
- **行動不能**: 「行動不能 残2T」ラベル（灰色背景）

### 魔騎兵起動

**発動条件**:
- 山脇玲巴がパーティにいること
- 残使用回数 > 0
- 最大使用回数: `MAKAI_KIHEI_MAX_USES`

**UI制御**:
- **使用可能**: 「騎兵起動 残2」ボタン（白背景、赤枠）
- **使用不可**: 「騎兵起動 残0」ボタン（赤背景、無効）

## ドラッグ&ドロップによるスワップ

### 機能

- スロット（前衛/後衛）をドラッグして位置入れ替え
- 未コミット行のみ有効

### EXターン時の制約

**発動条件**:
- 両方のスロットのキャラクターが `allowedCharacterIds` に含まれること

**判定**:
```javascript
isSwapAllowed(srcPosition, dstPosition) {
  if (!isExtraTurn()) return true;
  const src = party.find(m => m.position === srcPosition);
  const dst = party.find(m => m.position === dstPosition);
  const allowed = new Set(turnState.extraTurnState.allowedCharacterIds);
  return allowed.has(src.characterId) && allowed.has(dst.characterId);
}
```

**失敗時**:
- ドロップ無効（ドロップターゲットのリング表示なし）
- 位置変更なし

### アイコンタップによるスワップ

**用途**: ドラッグが使えない環境（iOS）での代替操作

**手順**:
1. アイコンをタップして選択（アンバーリング表示）
2. 同じアイコンをタップして選択解除
3. 別スロットのアイコンをタップしてスワップ

## EXターン表示

### 行動可能メンバー

**条件**:
- `turnState.turnType === 'extra'`
- `turnState.extraTurnState.allowedCharacterIds` に含まれる

**表示**:
- 前衛スロット: 通常表示
- スキルselect: 有効
- ターゲット指定: 有効

### 非行動メンバー

**条件**:
- EXターン中で `allowedCharacterIds` に含まれない
- コミット済み行でEXターン中に `record.actions` がない

**表示**:
- **未コミット行**: 「EX待機」（琥珀色ラベル、`text-amber-400`）
- **コミット済み行**: 「EX待機」（灰色ラベル、`text-gray-300`）
- スキルselect: 「EX待機」ラベル（無効）
- アイコン: 不透明度0.5

## コールバック

### onSlotChange

スロット操作（スキル変更、スワップ）時に呼ばれます。

```javascript
onSlotChange(turnIndex, position, action) {
  // action: {
  //   skillId: number | null,
  //   swapWith: number | null
  //   target?: { type, enemyIndex, styleId }
  // }
}
```

### onCommit

「実行」ボタン押下時に呼ばれます。

```javascript
onCommit(turnIndex) {
  // TurnEngineManager.commitNextTurn() をトリガー
}
```

### onNoteChange

メモ欄入力時に呼ばれます。

```javascript
onNoteChange(turnIndex, note) {
  // TurnEngineManager.updateNote() をトリガー
}
```

### onPreviewRequest

プレビューリクエスト時に呼ばれます。

```javascript
onPreviewRequest(turnIndex, slotActions) {
  // TurnEngineManager.previewCurrentTurn() をトリガー
}
```

### onOdChange

OD予約変更時に呼ばれます。

```javascript
onOdChange(turnIndex, odType, level) {
  // odType: 'preemptive' | 'interrupt'
  // level: number | null
}
```

### onEnemyCountChange

敵数変更時に呼ばれます。

```javascript
onEnemyCountChange(turnIndex, enemyCount) {
  // TurnEngineManager.updateEnemyCount() をトリガー
}
```

### onActionOutcomeChange

ブレイク編集変更時に呼ばれます。

```javascript
onActionOutcomeChange(turnIndex, actionOutcomeOverrides) {
  // TurnEngineManager.updateActionOutcomeOverrides() をトリガー
}
```

## UI実装の特徴

### レスポンシブデザイン

- 横スクロールで狭い画面対応
- スキルselect幅に応じたSPコスト表示切り替え
- ブレイク編集エディタの絶対配置（右端基準）

### アニメーション

- ドラッグ時の不透明度変更（opacity-40）
- ドロップターゲットのリング表示（ring-2 ring-blue-400）
- ターゲットピッカーのフェードイン/アウト

### アイコン表現

- **空スロット**: 青色の「＋」アイコン
- **SPバッジ**: 角丸パディング、テキストシャドウ
- **トークン**: 10個の丸（白/アクティブ/アフターグロー）
- **士気**: 大丸（白）+ 小丸（赤）の組み合わせ

## パフォーマンス考慮

### リサイズオブザーバー

- スキルselect幅を監視し、SPコスト表示を動的に切り替え
- 初回コールバックを即時実行（非同期の待ちなし）

### 差分更新

- `refreshSkillSelects()` でスキルselectのみ更新（全体再描画なし）
- `updateOdPreview()` でOD予測値のみ更新
- `updateInterruptOdCandidates()` で割込候補のみ更新

## 関連ドキュメント

- [ui_next_architecture_overview.md](./ui_next_architecture_overview.md) - 全体アーキテクチャ
- [ui_next_party_setup_spec.md](./ui_next_party_setup_spec.md) - Party Setup仕様
- [ui_next_turn_engine_manager_spec.md](./ui_next_turn_engine_manager_spec.md) - TurnEngineManager仕様
- [ui_next_component_interaction.md](./ui_next_component_interaction.md) - コンポーネント間相互作用
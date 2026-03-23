# UI Next: Party Setup 仕様

> **ステータス**: 📚 仕様書 | **作成**: 2026-03-21
>
> **実装**: `ui-next/components/party-setup.js` | **関連**: [ui_next_architecture_overview.md](./ui_next_architecture_overview.md)

---

## 概要

Party Setup パネルは、6スロット（前衛3 + 後衛3）のパーティー編成を行うコンポーネントです。メインスタイルとサポートスタイルの選択、各種設定（限突/DP/SP装備/属性ベルト）、プリセット機能を提供します。

## スロット構造

### 6スロット配置

| インデックス | 位置 | 役割 |
|-----------|------|------|
| 0-2 | 前衛 | スキル使用可能、行動主体 |
| 3-5 | 後衛 | スキル使用不可（通常） |

### 各スロットの構成要素

```
[スロット番号（ドラッグハンドル）]
├─ メインアイコン（クリックでStylePicker）
├─ 設定欄（リストボックス）
│  ├─ 限突レベル
│  ├─ ドライブピアス
│  ├─ SP装備
│  ├─ 属性ベルト
│  └─ やる気（該当キャラのみ）
├─ スキル設定ボタン
└─ サポートセクション
   ├─ サポートアイコン（クリックでStylePicker）
   └─ サポートLB
```

## メインスタイル選択

### 選択方法

1. メインアイコンをクリック
2. StylePickerが全画面で開く
3. スタイルを選択して決定

### 重複排除ルール

| 条件 | 挙動 |
|------|------|
| **メイン同士で同一キャラクター** | 既存のメインをクリアして上書き |
| **メイン↔サポートで同一スタイル** | 既存のサポートをクリア |
| **サポート同士で同一スタイル** | 既存のサポートをクリア |

**実装**:
```javascript
// メイン同士: 同一キャラクター不可
this.#slots.forEach((s, i) => {
  if (i !== idx && s.style?.chara_label === style.chara_label) {
    s.style = null;
    s.styleId = null;
  }
});

// メイン↔サポート: 同一スタイル不可
this.#slots.forEach((s) => {
  if (s.supportStyle?.id === style.id) {
    s.supportStyle = null;
    s.supportStyleId = null;
  }
});
```

### 連続選択モード

StylePickerの「連続選択」モードが有効な場合：
- 選択後、次の空きスロットへ自動進行
- 優先順: 残りのメイン空きスロット → サポート空きスロット（スロット0から）
- 空きがなくなったらピッカーを閉じる

## サポートスタイル選択

### 有効条件

- **メインスタイルがSSまたはSSRであること**
- それ以外のレアリティ（A/S）は「SUP非対応」として表示

### 共鳴アビリティ

- メインがSSRでサポートが共鳴アビリティ持ちの場合、サポートアイコンに煌めきエフェクト
- 属性一致チェックはStylePicker側で行われるため、PartySetupでは不要

### 重複排除ルール

| 条件 | 挙動 |
|------|------|
| **サポート同士で同一スタイル** | 既存のサポートをクリア |
| **メイン↔サポートで同一スタイル** | StylePicker側でグレーアウト済み |

## 設定項目

### 限突レベル（LB）

- **範囲**: 0 〜 Tier別上限
- **Tier別上限**:
  - A: 20
  - S: 10
  - SS: 4
  - SSR: 4
- **デフォルト**: 0
- **適用箇所**: スタイルの基本ステータス補正

### ドライブピアス（DP）

- **オプション**:
  - ドライブピアスなし
  - ドライブピアス +1
  - ドライブピアス +2
- **デフォルト**: なし（0）
- **適用箇所**: ドライブ攻撃のダメージ補正

### SP装備

- **オプション**:
  - SP装備なし
  - SP +1
  - SP +2
  - SP +3
- **デフォルト**: SP +3（`DEFAULT_SP_EQUIP_ID = '3'`）
- **適用箇所**: 戦闘開始時のSP最大値

**注意**: SP装備なしは空文字で表現し、エンジン側で0として扱う。

### 属性ベルト

- **オプション**:
  - ベルトなし
  - 火（Fire）
  - 氷（Ice）
  - 雷（Thunder）
  - 光（Light）
  - 闇（Dark）
- **デフォルト**: ベルトなし（空文字）
- **適用箇所**: スキルの属性補正

### やる気

- **オプション**: 標準
- **表示条件**: いずれかのキャラが「やる気」パッシブを持つ場合のみ表示
- **判定方法**:
```javascript
function hasMoralePassive(style) {
  return style?.passives?.some((p) => p.label?.includes('Motivation')) ?? false;
}
```

## スキル設定

### スキル設定パネル

各スロットの「🔧 スキル設定」ボタンから開きます。

### 機能

- **スキル一覧表示**: そのスタイルで装備可能なスキル
- **必須スキル**: 自動選択（解除不可）
  - 判定: `isRequiredSkillSetting(skill)` がtrueのスキル
- **全選択/全解除**: 一括操作
- **個別選択**: チェックボックスで切り替え

### 重複排除ルール

- 同一スキルを複数選択しても、内部で重複排除される
- `dedupeNumericIds()` で数値IDのユニーク化

## プリセット機能

### プリセット構造

- **保存先**: `localStorage`（キー: `hbr.ui_next.party_presets.v1`）
- **保存数**: 3個（インデックス0-2）
- **保存内容**:
```javascript
{
  label: "キャラ1・キャラ2・キャラ3", // 自動生成
  savedAt: "2026-03-21T12:00:00.000Z",
  slots: [
    {
      styleId: 12345,
      supportStyleId: 67890,
      lb: 4,
      supportLb: 2,
      drivePierce: 2,
      spEquipId: "3",
      belt: "Fire",
      morale: "normal",
      equippedSkillIds: [100, 200, 300]
    },
    // ... 6スロット分
  ]
}
```

### 操作

- **保存**: 「保」ボタンで上書き（確認ダイアログあり）
- **読込**: 「読」ボタンで適用（プリセットが空の場合は無効）
- **表示**: 未保存は「○」、保存済みは「●」

### ラベル生成

```javascript
function makePresetLabel() {
  const names = this.#slots
    .slice(0, 3)
    .filter((s) => s.style)
    .map((s) => extractCharaName(s.style));
  return names.length > 0 ? names.join('・') : '（空）';
}
```

## ドラッグ&ドロップによるスワップ

### 機能

- スロット番号エリアをドラッグハンドルとして使用
- 同一スロットへのドロップは無視
- スワップ後、即座に再描画と変更通知

### 制約

- なし（PartySetup時は常にスワップ可能）
- EXターン時の制約はTurnRow側で管理

## スナップショット

### getSnapshot() メソッド

現在のスロット状態をスナップショットとして返します。

```javascript
{
  isFrontFilled: boolean,      // 前衛3スロットが全て埋まっているか
  styleIds: (number|null)[],  // position 0-5のメインstyleId
  supportStyleIds: (number|null)[], // position 0-5のサポートstyleId
  limitBreakLevelsByPartyIndex: { [partyIndex]: number },
  supportLimitBreakLevelsByPartyIndex: { [partyIndex]: number },
  drivePierceByPartyIndex: { [partyIndex]: number },
  startSpEquipByPartyIndex: { [partyIndex]: number }, // ''は0に変換
  skillSetsByPartyIndex: { [partyIndex]: number[] }
}
```

### applySnapshot() メソッド

スナップショットからスロット状態を復元します。

- `styleId` がないスロットは null として扱う
- `spEquipId` の空文字はデフォルト値（'3'）に変換
- スキル設定は `resolveEquippedSkillIdsForStyle()` で正規化

## バトル状態連携

### setBattleState() メソッド

バトルの進行状態に応じてUIを制御します。

```javascript
{
  hasActiveBattle: boolean,  // バトル開始済みか
  hasRecords: boolean       // レコードが存在するか
}
```

**制御内容**:
- スキル設定パネルの `hasActiveBattle` / `hasRecords` 反映
- バトル進行中はスキル設定を制限（実装予定）

## コールバック

### onChange

スロット状態が変更されたときに呼ばれます。

```javascript
onChange(snapshot, meta) {
  // snapshot: getSnapshot() の戻り値
  // meta: {
  //   slotIndex: number | null,
  //   addedSkillIds: number[],
  //   removedSkillIds: number[],
  //   hasSkillSetDelta: boolean
  // }
}
```

## UI実装の特徴

### レスポンシブデザイン

- グリッドレイアウト（3カラム）で前衛/後衛を並列表示
- アイコンは正方形（aspect-square）
- 折りたたみ式プリセットパネル

### アニメーション

- ドラッグ時の不透明度変更（opacity-40）
- ドロップターゲットのリング表示（ring-2 ring-inset ring-blue-400）

### アイコン表現

- **空スロット**: 青色の「＋」アイコン
- **SSRメイン**: 紫色のリング（ring-2 ring-purple-400）と煌めきエフェクト
- **SSRサポート**: メインがSSRかつ共鳴アビリティ持ちの場合、紫色のリングと煌めき

## 関連ドキュメント

- [ui_next_architecture_overview.md](./ui_next_architecture_overview.md) - 全体アーキテクチャ
- [ui_next_turn_row_spec.md](./ui_next_turn_row_spec.md) - Turn Row仕様
- [ui_next_component_interaction.md](./ui_next_component_interaction.md) - コンポーネント間相互作用
# 速弾き（Shredding）状態 実装タスクリスト

> **ステータス**: 🟡 調査完了・実装待ち | 📅 作成: 2026-03-12

---

## 1. 調査結果サマリー

### 1.1 速弾き状態とは

「速弾き」状態は **SP がコスト分足りなくても、SP が 0 以上であれば通常スキルを使用できる** 特殊状態。
使用した結果 SP はマイナスになる。

付与源は 2 種類：
1. **かき鳴らせキラーチューン**（芳岡ユイ, id=46040604）: スキル使用で味方全体に 3 ターン付与
2. **31X チームのスキル**（`desc` に「SPが0以上であれば使用可能」と記載): 31X スタイルが対象

### 1.2 JSON データ構造

#### 速弾き付与スキル（かき鳴らせキラーチューン）

```json
{
  "id": 46040604,
  "label": "CathyBSkill51",
  "name": "かき鳴らせキラーチューン",
  "team": "Angel Beats!",
  "sp_cost": 12,
  "cond": "",
  "desc": "類稀なるギターセンスで 3ターンの間 味方全体を\n速弾き状態にする SPが0以上であれば使用可能",
  "parts": [{
    "skill_type": "Shredding",
    "target_type": "AllyAll",
    "effect": {
      "exitCond": "PlayerTurnEnd",
      "exitVal": [3, 0]
    }
  }]
}
```

- `skill_type: "Shredding"` が速弾き付与を示す
- `exitCond: "PlayerTurnEnd"`, `exitVal[0] = 3` → 3ターン継続（プレイヤーターン終了ごとに -1）
- `target_type: "AllyAll"` → 味方全体に付与

#### 速弾き状態でのみ使えるスキル（31X）

| id | name | team | cond | sp_cost | 備考 |
|----|------|------|------|---------|------|
| 46008103 | パニッシャー | 31X | （空） | 10 | desc: "SPが0以上であれば使用可能" |
| 46008105 | ライトニングロア | 31X | （空） | 8 | desc: "SPが0以上であれば使用可能" |
| 46008106 | サンダーストーム | 31X | （空） | 14 | desc: "SPが0以上であれば使用可能" |
| 46008107 | 渦中のヴァイオレット | 31X | （空） | 10 | desc: "SPが0以上であれば使用可能" |
| 46008108 | あなたのヒーロー | 31X | （空） | 8 | desc: "SPが0以上であれば使用可能" |
| 46008209 | 春の宵の塵に同じ | 31X | `Sp()<0` | 0 | SPが**0未満**のときのみ使用可能（速弾きでマイナスになった後に使用） |
| 46008603 | コーシュカ・アルマータ | 31X | （空） | -1 | 現在SP全消費（descなし） |
| ... | （その他多数） | 31X/AngelBeats! | （空） | various | "SPが0以上であれば使用可能" |

**重要**: 多くの対象スキルは `cond` フィールドが**空**。
「SPが0以上であれば使用可能」条件は `desc` テキストにしか記載がなく、JSON の `cond` フィールドには反映されていない。

### 1.3 現状の SP 管理実装

```
src/domain/hbr-data-store.js:1206
  spMin: 0,        ← 全キャラ共通で 0 固定

src/domain/character-style.js:422
  const endSP = applySpChange(startSP, deltaSP, this.sp.min, Number.POSITIVE_INFINITY);
  → sp.min = 0 のため SP は 0 未満にクランプされる

src/ui/dom-adapter.js:6623
  enableForceResourceDeficitMode()
    → member.sp.min = FORCE_RESOURCE_MIN (-999)  ← UI から全員強制解除する既存機能
```

`Sp()` の評価は `turn-controller.js:636` で `member.sp.current` をそのまま返す（負値対応済み）。

`Sp()<0` 条件（春の宵の塵に同じ）の評価ロジックは既に実装済み。

### 1.4 実装ギャップ（未実装項目）

| 項目 | 現状 | 必要な対応 |
|------|------|-----------|
| **Shredding skill_type の処理** | active skill 処理で完全未実装 | active skill commit 時に Shredding part を処理して状態付与 |
| **速弾き状態の保持** | CharacterStyle / TurnState に存在しない | メンバーごとに `shreddingState: { turnsRemaining }` を追加 |
| **速弾き状態のカウントダウン** | 未実装 | PlayerTurnEnd（`applyRecoveryPipeline`）でターン数を -1 |
| **SP下限の動的変更** | 全員 spMin=0 固定 | 速弾き中のメンバーは sp.min を負値（例: -30）に設定 |
| **スキル使用可能判定の拡張** | SP>=sp_cost チェックなし（クランプで実質制限） | 速弾き中は SP>=0 で使用可能、非速弾きは SP>=sp_cost が必要 |
| **"SPが0以上であれば使用可能" の cond 表現** | desc テキストのみ、cond は空 | hbr-data-store の loadSkill 時に desc を解析して cond 補完 OR 設計方針を確定 |
| **IsShredding() 条件関数** | 未実装 | evaluateSingleConditionClause に追加（条件判定の拡張用） |

---

## 2. 設計上の判断事項（実装前に確認）

### D1: "SPが0以上であれば使用可能" のスキルはどう識別するか？

現在 JSON の `cond` フィールドは空。以下の選択肢がある：

- **案A**: `desc` に "SPが0以上" が含まれるスキルを `hbr-data-store.js` のロード時に `cond: 'Sp()>=0'` に変換する
- **案B**: 「速弾き対応スキル」フラグ (`is_shredding_skill: true`) を JSON に追加する（データ変更が必要）
- **案C**: 速弾き状態が付与されているメンバーはすべてのスキルを SP>=0 で使用可能とする（desc 解釈不要）

**現在の判断**: 未確定。**D1 の回答待ち。**

### D2: 31X チームは「常時速弾き」か？

ゲームの仕様では 31X の特殊スキルはチームの固有メカニクス（速弾き状態）で使用する。
31X キャラクターが速弾き状態なしで「SPが0以上であれば使用可能」スキルを使えるか？

- 可能: 31X チームの特定スタイルは常時速弾き状態を持つ（データを確認する必要あり）
- 不可: かき鳴らせキラーチューンで付与するか、31X 固有パッシブが存在する

**現在の判断**: 未確定。**D2 の回答待ち（ゲームの実際の動作を確認する）。**

### D3: 速弾き中の SP 下限は何か？

- 最も大きいスキルコストが 17 (サンダー・オブ・ジャスティス) なので sp.min = -20 程度で実用上は十分
- または `enableForceResourceDeficitMode()` と同様に -999 を使う

**現在の判断**: -30 を採用（最大スキルコスト 17 に余裕を持たせた値）。**D3 は実装時に調整可能。**

---

## 3. タスクリスト

### 調査フェーズ（実装前確認）

- [ ] **D1**: "SPが0以上であれば使用可能" スキルの識別方法を確定する
  - `desc` 解析 vs フラグ追加 vs 全スキル統一扱いのいずれかを選択
  - ユーザーに確認

- [ ] **D2**: 31X チームの「常時速弾き」有無を確認する
  - 31X パッシブデータに速弾き関連エントリがあるか確認
  - 実ゲームの動作仕様を参照

### 実装フェーズ

- [ ] **T1**: `CharacterStyle` に `shreddingState` を追加
  - `this.shreddingState = { turnsRemaining: 0 }`
  - `applyShredding(turns)` メソッドを追加
  - `isShredding()` プロパティを追加

- [ ] **T2**: active skill 処理に `Shredding` skill_type を追加
  - `commitTurn()` → 各 action の parts をループ → `skillType === 'Shredding'` を検出
  - `resolveSupportTargetCharacterIds(state, actor, part.target_type)` で対象を解決
  - 対象メンバーに `member.applyShredding(exitVal[0])` を呼ぶ
  - `passiveEvents` に速弾き付与イベントを記録

- [ ] **T3**: 速弾き状態の PlayerTurnEnd カウントダウン
  - `applyRecoveryPipeline()` 内で各メンバーの `shreddingState.turnsRemaining > 0` なら -1
  - ターン数が 0 になったら速弾き状態を解除

- [ ] **T4**: 速弾き中の SP 下限変更
  - `commitTurn()` の state 更新後、または速弾き付与時に `member.sp.min = -30` に設定
  - 速弾き解除時に `member.sp.min = 0` に戻す

- [ ] **T5**: スキル使用可能判定に速弾き対応を追加（D1 確定後）
  - 速弾き中: `sp.current >= 0` で使用可能（sp_cost を超えても使用可能）
  - 非速弾き: `sp.current >= sp_cost` が要件
  - `buildSortedActionEntries()` または `previewActionEntries()` でチェック追加

- [ ] **T6**: `IsShredding()` 条件関数を追加（将来用 / D2 確定後）
  - `resolveConditionFunctionValue` の `switch` に `'IsShredding'` を追加
  - `{ known: true, value: member.shreddingState.turnsRemaining > 0 ? 1 : 0 }` を返す

- [ ] **T7**: record assembler に速弾き状態を記録
  - `stateSnapshot` に `shreddingStateByPartyIndex` を追加
  - UI 表示用の速弾きターン数残量を記録

### テストフェーズ

- [ ] **T8**: `Shredding 付与: かき鳴らせキラーチューン使用後、全メンバーの shreddingState.turnsRemaining = 3`

- [ ] **T9**: `速弾き中の SP 下限: sp.current = 0 でコスト 14 のスキルを使用 → endSP = -14`

- [ ] **T10**: `速弾き中の Sp()<0 条件スキル: SP がマイナスになった後に 春の宵の塵に同じ が使用可能`

- [ ] **T11**: `速弾き状態のカウントダウン: 3ターン後に turnsRemaining = 0 になる`

- [ ] **T12**: `速弾き非アクティブ時: SP が不足するスキルはエラーになる（D1 確定後）`

- [ ] **T13**: 全テスト実行（500 → 500+N PASS）

### 完了処理

- [ ] **T14**: ドキュメント更新・コミット

---

## 4. 完了条件

- かき鳴らせキラーチューン使用後、全味方の速弾き状態（3ターン）が正しく付与される
- 速弾き中に SP がコスト分足りなくてもスキルが使用でき、SP がマイナスになる
- SP がマイナスになった後に `Sp()<0` 条件スキル（春の宵の塵に同じ）が使用可能になる
- 速弾きが切れたターンから SP >= sp_cost が再度要件になる
- 全テスト PASS

---

## 5. 参照

- `json/skills.json`: Shredding skill_type の定義（id=46040604、46008209 など）
- `src/domain/character-style.js:422`: `previewSkillUseResolved`（SP コスト計算）
- `src/turn/turn-controller.js:636`: `Sp()` 条件評価（`member.sp.current` 返却）
- `src/turn/turn-controller.js:4817`: `buildSortedActionEntries`（スキル cond チェック）
- `src/turn/turn-controller.js:6384`: Zone/Territory 処理（Shredding 実装の参考構造）
- `src/ui/dom-adapter.js:6623`: `enableForceResourceDeficitMode`（sp.min 変更の既存実装）
- `docs/specs/sp_condition_skill_spec.md`: SP 条件スキル仕様（Sp()<0 / Sp()>0 / Sp()>19）

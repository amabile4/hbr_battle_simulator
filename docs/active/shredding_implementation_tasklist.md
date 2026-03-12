# 速弾き（Shredding）状態 実装タスクリスト

> **ステータス**: ✅ 実装完了 | 📅 完了: 2026-03-12

---

## 1. 調査結果サマリー

### 1.1 2 種類の独立した仕組みを区別する

「速弾き状態（Shredding バフ）」と「"SPが0以上であれば使用可能" スキル条件」は**独立した別の仕組み**。

#### 仕組み A: 速弾き状態（Shredding バフ）

- 付与源: かき鳴らせキラーチューン（芳岡ユイ, id=46040604）のみ
- 効果: **バフを持つキャラクターの全スキルが SP0以上で使用可能**になる
- 制限: `sp_cost: -1`（SP全消費）スキルにはこの効果が適用されない
- 期間: 3ターン（PlayerTurnEnd でカウントダウン）

#### 仕組み B: "SPが0以上であれば使用可能" スキル条件

- 付与源: なし（スキルの固有性質として常時有効）
- 効果: そのスキルを SP >= 0 であれば使用可能（速弾き状態は不要）
- 対象: 31X チーム・芳岡ユイなど、`desc` に「SPが0以上であれば使用可能」と記載のある個別スキル
- **JSON 識別子: `is_adv: true` かつ `sp_cost > 0`**
  - 全データベースで `is_adv: true && sp_cost > 0` の全37件が「SP0以上で使用可能」（100%一致）
  - `is_adv: false` で「SP0以上」条件を持つスキルは 0 件
  - `cond` フィールドには記載なし（`desc` テキストのみだが、`is_adv` で確実に判別可能）

**31X チームは「常時速弾き」ではない。** 31X スキルは仕組み B（スキル固有条件）を持つ独立した設計であり、速弾き状態（仕組み A）がなくても SP>=0 で常時使用可能。

### 1.2 JSON データ構造

#### 仕組み A: 速弾き付与スキル（かき鳴らせキラーチューン）

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

#### 仕組み B: 速弾き状態に関係なく SP>=0 で常時使用可能なスキル（31X・Angel Beats!）

| id | name | team | cond | sp_cost | 備考 |
|----|------|------|------|---------|------|
| 46008103 | パニッシャー | 31X | （空） | 10 | desc: "SPが0以上であれば使用可能" |
| 46008105 | ライトニングロア | 31X | （空） | 8 | desc: "SPが0以上であれば使用可能" |
| 46008106 | サンダーストーム | 31X | （空） | 14 | desc: "SPが0以上であれば使用可能" |
| 46008107 | 渦中のヴァイオレット | 31X | （空） | 10 | desc: "SPが0以上であれば使用可能" |
| 46008108 | あなたのヒーロー | 31X | （空） | 8 | desc: "SPが0以上であれば使用可能" |
| 46008209 | 春の宵の塵に同じ | 31X | `Sp()<0` | 0 | SPが **0未満** のときのみ使用可能（速弾きで SP マイナス突入後に使う想定） |
| 46008603 | コーシュカ・アルマータ | 31X | （空） | -1 | 現在SP全消費（sp_cost=-1 → 速弾き適用外） |
| ... | （その他多数） | 31X/Angel Beats! | （空） | various | "SPが0以上であれば使用可能" |

**重要**: `cond` フィールドは空。「SPが0以上であれば使用可能」条件は `desc` テキストにしか記載がない。

### 1.3 現状の SP 管理実装

```
src/domain/hbr-data-store.js:1206
  spMin: 0,        ← 全キャラ共通で 0 固定

src/domain/character-style.js:422
  const endSP = applySpChange(startSP, deltaSP, this.sp.min, Number.POSITIVE_INFINITY);
  → sp.min = 0 のため SP は 0 未満にクランプされる（マイナス突入不可）

src/ui/dom-adapter.js:6623
  enableForceResourceDeficitMode()
    → member.sp.min = FORCE_RESOURCE_MIN (-999)  ← UI から全員強制解除する既存機能
```

`Sp()` の評価は `turn-controller.js:636` で `member.sp.current` をそのまま返す（負値対応済み）。

`Sp()<0` 条件（春の宵の塵に同じ）の評価ロジックは既に実装済み。
ただし現状は `sp.min = 0` のため SP がマイナスにならず、この条件を満たせない。

### 1.4 実装ギャップ（未実装項目）

| 項目 | 現状 | 必要な対応 |
|------|------|-----------|
| **Shredding skill_type の処理（仕組みA）** | active skill 処理で完全未実装 | active skill commit 時に Shredding part を処理して状態付与 |
| **速弾き状態の保持（仕組みA）** | CharacterStyle に存在しない | メンバーごとに `shreddingState: { turnsRemaining }` を追加 |
| **速弾き状態のカウントダウン（仕組みA）** | 未実装 | PlayerTurnEnd（`applyRecoveryPipeline`）でターン数を -1 |
| **速弾き中の SP 下限変更（仕組みA）** | 全員 spMin=0 固定 | 速弾き中のメンバーは sp.min を負値（例: -30）に設定し解除時に戻す |
| **速弾き中のスキル使用可能判定（仕組みA）** | SP>=sp_cost チェックなし（クランプで実質制限） | 速弾き中は全スキルを SP>=0 で使用可能に（sp_cost=-1 除く） |
| **"SPが0以上" スキルの常時判定（仕組みB）** | desc テキストのみ、cond は空 | desc を解析して `cond: 'Sp()>=0'` に変換（hbr-data-store ロード時） |
| **IsShredding() 条件関数** | 未実装 | evaluateSingleConditionClause に追加（将来の条件式拡張用） |

---

## 2. 設計上の判断事項

### D1: 仕組み B（"SPが0以上であれば使用可能" スキル）をどう実装するか → 解決済み

`is_adv: true` フィールドが完全な識別子であることが判明した。

- `is_adv: true && sp_cost > 0` → 全37件が「SP0以上で使用可能」（例外なし）
- `is_adv: false` → 通常スキル扱い（SP0以上条件なし）

**実装方針（確定）**: `hbr-data-store.js` のスキルロード時に `skill.is_adv === true && skill.sp_cost > 0` を条件として `cond: 'Sp()>=0'` を付与する。desc テキストの解析は不要。

### D2: ~~31X チームは常時速弾きか？~~ → 解決済み（NO）

`help/速弾き.md` の確認により判明：速弾き状態の付与源は「かき鳴らせキラーチューン」のみ。
31X チームは「速弾き状態（バフ）」を常時持つのではなく、各スキルが「SPが0以上であれば使用可能」という固有条件（仕組み B）を持つ別設計。

### D3: 速弾き中の SP 下限はいくつか

- 最大スキルコスト 17（サンダー・オブ・ジャスティス）を考慮して sp.min = -20 程度で十分
- `enableForceResourceDeficitMode()` と合わせる場合は -999 も選択肢
- **現在の判断**: `-30` を採用（実装時に調整可）

### D4: sp_cost=-1 スキルへの速弾き非適用

`速弾き.md` の制限事項：「ダメージスキル(SP全消費)」など一部の特殊なSP消費のスキルには速弾き効果が適用されない。

SP全消費スキルは `sp_cost=-1` で表現されるため、速弾き判定ロジックでは `rawCost === -1` のケースを除外すること。

---

## 3. タスクリスト

### 実装フェーズ（仕組みA: 速弾きバフ）

- [x] **T1**: `CharacterStyle` に `shreddingState` を追加
  - `this.shreddingState = { turnsRemaining: 0 }`
  - `applyShredding(turns)` メソッドを追加（既存 turnsRemaining と大きい方を採用するか上書きか確認）
  - `get isShredding()` プロパティを追加（`turnsRemaining > 0`）
  - **検討事項**: 既存の `addStatusEffect()` / `reinforcedTurnsRemaining` / `actionDisabledTurns` など `statusEffects` 経由のパターンと統一するか、専用フィールドで管理するかを実装前に確認すること

- [x] **T2**: active skill 処理に `Shredding` skill_type を追加
  - 新関数 `applyShreddingEffectsFromActions(state, previewRecord)` を作成
  - commitTurn() の `applyGuardEffectsFromActions()` 直後 (turn-controller.js line ~6779) に挿入
  - 各 action の parts をループ → `skillType === 'Shredding'` を検出
  - `resolveSupportTargetCharacterIds(state, actor, part.target_type)` で対象を解決
  - 対象メンバーに速弾き状態を付与（T1 の実装に従う）
  - 速弾き付与イベントを `passiveEvents` または `buffEvents` に記録

- [x] **T3**: 速弾き状態の PlayerTurnEnd カウントダウン
  - commitTurn() の `applyTurnBasedStatusExpiry()` 近傍 (turn-controller.js line ~6904) で実装
  - `applyRecoveryPipeline()` はターン開始時SP回復処理のため、ここには実装しないこと
  - 各メンバーの `shreddingState.turnsRemaining > 0` なら -1、0 になったら速弾き解除 + sp.min を 0 に戻す

- [x] **T4**: 速弾き中の SP 下限変更
  - 速弾き付与時に `member.sp.min = -30` に設定
  - 速弾き解除時（T3 でターン数 0 になったとき）に `member.sp.min = 0` に戻す

- [x] **T5**: スキル使用可能判定に速弾き対応を追加
  - 速弾き中: `sp.current >= 0` で使用可能、かつ `sp_cost !== -1`（全消費スキルは除外）
  - 非速弾き: 通常の SP チェック（`sp.current >= sp_cost`）
  - `buildSortedActionEntries()` のスキル cond チェックと連動させる
  - **実装注記**: validateActionDict への SP<0 ハードチェック追加は T11 との矛盾で削除。sp.min=-30 + cond 式チェックで正しく動作する

- [x] **T6**: `IsShredding()` 条件関数を追加（将来用）
  - `resolveConditionFunctionValue` の `switch` に `'IsShredding'` を追加
  - `{ known: true, value: member.isShredding ? 1 : 0 }` を返す

- [x] **T7**: record assembler に速弾き状態を記録
  - `stateSnapshot` に `shreddingStateByPartyIndex` を追加

### 実装フェーズ（仕組みB: "SPが0以上" スキル常時条件）

- [x] **T8**: `hbr-data-store.js` のスキルロード時に `is_adv` フラグで cond を付与
  - **注意**: 現在 `this.skills = payload.skills`（line 174）は raw 代入のみ（変換処理なし）
  - constructor 内に `this.skills = payload.skills.map(skill => { ... })` のプリプロセスループを新設すること
  - `skill.is_adv === true && skill.sp_cost > 0` かつ `cond` が空の場合に `cond: 'Sp()>=0'` を付与
  - 既存の `cond` がある場合は `&&` で連結
  - desc テキスト解析は不要（`is_adv` が完全識別子）

### テストフェーズ

- [x] **T9**: `速弾き付与: かき鳴らせキラーチューン使用後、全メンバーの shreddingState.turnsRemaining = 3`

- [x] **T10**: `速弾き中の SP 下限: sp.current = 0 でコスト 14 のスキルを使用 → endSP = -14`

- [x] **T11**: `速弾き中の Sp()<0 条件スキル: SP がマイナスになった後に春の宵の塵に同じが使用可能`

- [x] **T12**: `速弾き状態のカウントダウン: 3ターン後に turnsRemaining = 0 になる`

- [x] **T13**: `sp_cost=-1 スキルは速弾き中でも SP>=sp_cost チェックから除外されない`（制限事項の確認）

- [x] **T14**: `"SPが0以上" スキル（仕組みB）: SP >= 0 のとき使用可能、SP < 0 のときエラー`

- [x] **T15**: 全テスト実行（500 → 508 PASS、8テスト追加）

### 完了処理

- [x] **T16**: ドキュメント更新・コミット

---

## 4. 完了条件

- かき鳴らせキラーチューン使用後、全味方の速弾き状態（3ターン）が正しく付与される
- 速弾き中に SP がコスト分足りなくてもスキルが使用でき、SP がマイナスになる
- sp_cost=-1（全消費）スキルは速弾き中でも通常のコストチェックを受ける
- SP がマイナスになった後に `Sp()<0` 条件スキル（春の宵の塵に同じ）が使用可能になる
- 速弾きが切れたターンから通常の SP >= sp_cost が再度要件になる
- "SPが0以上であれば使用可能" スキルは速弾き状態なしでも SP >= 0 で常時使用可能
- 全テスト PASS

---

## 5. 参照

- `help/HEAVEN_BURNS_RED/バトル/速弾き.md`: 速弾き状態の仕様（ID・制限事項を含む）
- `help/HEAVEN_BURNS_RED/バトル/SPが0以上であれば使用可能.md`: 対象スキル一覧
- `docs/specs/sp_condition_skill_spec.md`: SP 条件スキル仕様（Sp()<0 / Sp()>0 / Sp()>19）
- `json/skills.json`: Shredding skill_type の定義（id=46040604）
- `src/domain/character-style.js:422`: `previewSkillUseResolved`（SP コスト計算）
- `src/turn/turn-controller.js:636`: `Sp()` 条件評価（`member.sp.current` 返却）
- `src/turn/turn-controller.js:4817`: `buildSortedActionEntries`（スキル cond チェック）
- `src/turn/turn-controller.js:6384`: Zone/Territory 処理（Shredding 実装の参考構造）
- `src/ui/dom-adapter.js:6623`: `enableForceResourceDeficitMode`（sp.min 変更の既存実装）

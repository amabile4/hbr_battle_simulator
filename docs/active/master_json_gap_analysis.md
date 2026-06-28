# master_json ギャップ分析と回収タスク一覧

> **ステータス**: 🔄 継続調査中 | 📅 作成: 2026-06-27 | 📅 更新: 2026-06-28
>
> **調査経緯**: シミュレーターが参照する `json/`（`hbr_analysis` の view 変換出力）と
> `golden/master_json/` の集合A（キャラ・カード・スキル・能力）を突き合わせ、
> ハードコード・推定値・欠落フィールドを特定した。
>
> **調査担当**:
> - Sonnet サブエージェント: シミュレーター側ソースコードのハードコード・推定値調査
> - Codex（agmsg）: master_json 集合A のフィールドギャップ調査
>
> **関連 PR**: [hbr_analysis#2](https://github.com/amabile4/hbr_analysis/pull/2)（最優先2件を対応済み）

---

## 1. 対応済み（hbr_analysis PR#2 でビュー追加済み）

### 1-1. `sp_cost_by_use_count` — 使用回数連動 SP コスト

| 項目 | 内容 |
|---|---|
| マスターフィールド | `MasterSkill.spListByUsedCount` |
| 対象スキル | `CathyCSkill51`「カラスの鳴き声で」（現在1件） |
| 旧状態 | `skills.json` は `sp_cost=8` 固定 |
| 新フィールド | `sp_cost_by_use_count: [8, 12, 16, 20]`（初回〜4回目以降の完全リスト） |
| シミュレーター側実装 | ✅ 使用前の使用回数に対応するコストを解決し、配列末尾を上限として適用 |

### 1-2. `interval_turn` — 再使用間隔（クールダウン）

| 項目 | 内容 |
|---|---|
| マスターフィールド | `MasterSkill.intervalTurn` |
| 対象スキル | `RKayamoriSkill11`, `EAoiSkill08`, `KMaruyamaSkill53`, `KMaruyamaSkill08`, `KMaruyamaSkill09`（すべて 3 ターン） |
| 旧状態 | `skills.json` に対応フィールドなし → 毎ターン使用可として誤判定 |
| 新フィールド | `interval_turn: 3` |
| シミュレーター側実装 | ✅ 最終使用ターンを保持し、経過ターンが `interval_turn` 未満なら使用不可 |

---

## 2. シミュレーター側の実装タスク（完了）✅


PR#2 で `json/` に追加された `sp_cost_by_use_count` / `interval_turn` を、
シミュレーター本体へ配線した。

### T-A: `interval_turn` 使用可否判定 ✅

- **場所**: `src/turn/turn-controller.js` のスキル使用可否チェック
- **仕様**: 直前の使用ターンから `interval_turn` ターン経過するまで同スキルを使用不可
- **関連**: PRI-018（スキル使用回数制約と回復機能）と同一領域
- **優先度**: ★★★（5スキルで誤判定が確定）
- **実装結果**: `CharacterStyle.skillLastUsedTurns` に最終使用ターンを保持。`interval_turn=3` は T1 使用後の T2/T3 を禁止し、T4 で再使用可能

### T-B: `sp_cost_by_use_count` SP コスト解決 ✅

- **場所**: `src/domain/character-style.js` または SP コスト解決箇所
- **仕様**: `sp_cost_by_use_count` が存在するスキルでは、使用回数インデックスに対応する値を使用
  - 0回目（未使用）→ インデックス 0（= `sp_cost` と同値）
  - 1回目使用後 → インデックス 1
  - 末尾インデックスを超えた場合は末尾値を使用
- **優先度**: ★★★（CathyCSkill51 の SP 管理が誤差確定）
- **実装結果**: 使用前の `skillUseCounts` をインデックスとして解決。`CathyCSkill51` は `8 → 12 → 16 → 20 → 20` を適用

**検証**: 対象統合テスト、clone 独立性、実データ6スキルのメタデータ正規化を追加し、`npm test` 1300件 PASS（2026-06-27）。

### T-E: `define_values.json` 取り込み・data-driven 配線 ✅

| 項目 | 内容 |
|---|---|
| 取り込み元 | `MasterDefineValue.json`（274件のゲーム定数）|
| 出力形式 | flat dict `{ KEY: raw_value }` — 単位変換なし（B案確定）|
| シミュレーター側実装 | ✅ `HbrDataStore` に `defineValues` / `markEffectsConfig` / `highBoostDefaults` 追加 |
| data-driven 対象 | `INTRINSIC_MARK_EFFECTS_BY_ELEMENT`（印効果値）/ `HIGH_BOOST_*`（HB倍率）|
| スケール変換 | `/10000`（rate 系）、`/100`（CRITICAL_RATE_UP）、`+1.0`（multiplier 系）|
| Light Mark | `LIGHT_MARK_*` 追加時は自動反映、未収録の場合は `FIRE_MARK_*` フォールバック |
| gameConfig 伝播 | `createBattleState(members, turnState, gameConfig)` → `state.gameConfig` に保持 |
| テスト | 16件追加（スケール変換・フォールバック・`HbrDataStore` 計算値・`gameConfig` 伝播）|
| コミット | `4935a1b`（JSON取り込み）、`d84ea1f`（配線）、`4daa7af`（テスト）|

---

## 3. 未対応ギャップ（`json/` への追加が必要）

### 3-1. ハードコード定数群（`battle-defaults.js` / `turn-controller.js`）

シミュレーターのソースコード調査で発見。master_json 側にデータがある可能性がある項目。

| ハードコード箇所 | 現在値 | master_json 側での確認状況 | 優先度 |
|---|---|---|---|
| `INTRINSIC_MARK_EFFECTS_BY_ELEMENT`<br>(`src/config/battle-defaults.js:17-58`) | Fire/Ice 等: 0.3/0.1/0.3/0.3/0.3/1 | ✅ **data-driven 配線完了（2026-06-28）**: `buildMarkEffectsFromDefineValues(dv)` 経由で `state.gameConfig.markEffectsConfig` に保持。Light は LIGHT_MARK_* フォールバック対応。コミット `d84ea1f` | ～ |
| `HIGH_BOOST_ATTACK_BUFF_MULTIPLIER = 1.2`<br>`HIGH_BOOST_DEBUFF_MULTIPLIER = 1.2`<br>`HIGH_BOOST_DP_HEAL_MULTIPLIER = 1.5`<br>`HIGH_BOOST_SP_COST_INCREASE = 2` | 1.2 / 1.2 / 1.5 / 2 | ✅ **data-driven 配線完了（2026-06-28）**: `buildHighBoostDefaultsFromDefineValues(dv)` 経由で `state.gameConfig.highBoostDefaults` に保持。HighBoost 付与時に seeding、fallback チェーン維持。コミット `d84ea1f` | ～ |
| `TALISMAN_PENALTY_PER_LEVEL = 10`<br>(`src/turn/turn-controller.js:67`) | 10（1レベルあたり%） | `define_values.json` に `TALISMAN_REF_PARAM_DOWN=10` あり（値は一致）。`adapter-core.js` のデフォルト値は未配線 | ★ |
| `DISASTER_PENALTY_PER_LEVEL = 7`<br>(`src/turn/turn-controller.js:69`) | 7（1レベルあたり%） | `define_values.json` 未収録。`MasterSpecialStatus` 等で根拠確認が必要 | ★ |
| `OD_GAUGE_PER_HIT_PERCENT = 2.5`<br>(`src/config/battle-defaults.js:63`) | 2.5% | `define_values.json` 未収録。`MasterDefineValue.json` / `ELEMENT_GAUGE_*` 系に該当エントリがあるか要確認 | ★ |
| `DEFAULT_ZONE_MULTIPLIER = 1.5`<br>(`src/domain/damage-calculator.js:16`) | 1.5 倍 | `define_values.json` 未収録。`MasterDefineValue.json` / ゾーン系エントリの有無を要確認 | ★ |

### 3-2. MasterPassiveSkill 非カード参照（選別が必要）

| 項目 | 内容 |
|---|---|
| 状況 | MasterPassiveSkill 1038件に対し、passives.json は 334 unique label |
| 差分 | 704 label が未収録（Conquest/ステージ固有パッシブなど） |
| 方針 | カードツリー参照のものに限定して追加する必要がある。一括追加は不可 |
| 優先度 | ★（自動化候補。参照元フィルタの設計が先決） |

### 3-3. 特殊カード 2 件欠落

| 対象 | 内容 |
|---|---|
| `BIYamawaki99`「魔王軍イベント山脇」 | styles.json に未収録 |
| `CSugahara99`「暴走菅原」 | styles.json に未収録 |
| 優先度 | ★（通常編成対象に含める要件がある場合のみ） |

---

## 4. 現状問題なし（調査で確認済み）

以下は master_json と `json/` が既に一致しており、追加対応不要。

| データ | 確認結果 |
|---|---|
| スキル威力・成長率 | `parts[].power`, `parts[].growth` で取り込み済み |
| 能力値ウェイト | `parts[].parameters` で取り込み済み |
| ヒット情報 | プレイヤースキル 768 件で 1152/1152 完全一致 |
| カード基礎値 | `MasterBaseParameter` と styles.json が 360/360 完全一致 |
| キャラ基礎ステータス | `MasterCharacterBaseParameter` と characters.json が 60/60 完全一致 |
| `ignoreRemove` | `parts[].effect.ir` で保持済み |
| `use_count` / `iuc_cond` | `limitCountValues`, `ignoreUsedCountCondition` で保持済み |
| `overwrite_cond` | `overwriteSpCondition` で保持済み |

---

## 5. ゲーム仕様として固定化すべき定数（master_json に無関係）

| 定数 | 値 | 根拠 |
|---|---|---|
| ダメージ変動率 | ±10% | ゲーム全体仕様として固定 |
| クリティカルダメージ基本倍率 | 1.5 倍 | ゲーム全体仕様として固定 |
| 破壊率グローバル上限 | 300% | ゲーム全体仕様として固定 |
| 初期 SP | 3（= 1 + 2） | ゲーム全体仕様として固定 |
| `INTRINSIC_MARK_EFFECTS_BY_ELEMENT`（印効果値） | 0.3/0.1/0.3/0.3/1 | **data-driven 配線済み（2026-06-28）**: `buildMarkEffectsFromDefineValues` 経由で `state.gameConfig.markEffectsConfig` に保持。Light は FIRE_MARK_* フォールバック |
| `HIGH_BOOST_*` 倍率 | 1.8 / 1.2 / 1.5 / SP+2 | **data-driven 配線済み（2026-06-28）**: `buildHighBoostDefaultsFromDefineValues` 経由で `state.gameConfig.highBoostDefaults` に保持。skillAtkRate は effect.power 経由 |

---

## 6. 次アクション

```
完了済み:

[T-A] interval_turn 使用可否判定 ✅ 担当: Codex
[T-B] sp_cost_by_use_count SP コスト解決 ✅ 担当: Codex
[T-C] INTRINSIC_MARK_EFFECTS_BY_ELEMENT 根拠確認 ✅
[T-D] HIGH_BOOST 補正値 根拠確認 ✅
[T-E] define_values.json 取り込み・data-driven 配線 ✅ 担当: Claude（2026-06-28）

---

未完了（優先順位順）:

[T-F] 残存ハードコード定数の master_json 根拠確認
  担当: Codex（調査依頼済み 2026-06-28）

  F-1. TALISMAN_REF_PARAM_DOWN（=10）の adapter-core.js デフォルト値配線
       → define_values.json に根拠あり。adapter-core.js line 392 の penaltyPerLevel:10 を
         dataStore.defineValues?.TALISMAN_REF_PARAM_DOWN に変更（1行）

  F-2. DISASTER_PENALTY_PER_LEVEL（=7）の根拠確認
       → golden/master_json/MasterDefineValue.json / MasterSpecialStatus.json 等で
         DISASTER_* または disasterPenalty 系のエントリを調査

  F-3. OD_GAUGE_PER_HIT_PERCENT（=2.5）の根拠確認
       → MasterDefineValue.json の ELEMENT_GAUGE_* 系エントリに該当値があるか調査
       → なければ「ゲーム全体仕様として固定」として Section 5 に移動

  F-4. DEFAULT_ZONE_MULTIPLIER（=1.5）の根拠確認
       → golden/master_json/ にゾーン補正関連テーブルがあるか調査
       → damage-calculator.js:16 の使用文脈を確認

[T-G] 特殊カード 2件欠落（BIYamawaki99 / CSugahara99）★
  → 通常編成対象に含める要件がある場合のみ対応。現状は保留

[T-H] MasterPassiveSkill 非カード参照 ★
  → カードツリー参照フィルタの設計が先決。1038件中 334 unique label のみ収録
```

---

## 7. 調査コマンドメモ

```bash
# master_json は 1 行 minified JSON。必ず node か jq を使うこと（grep 不可）

# spListByUsedCount を持つスキルを確認
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('./golden/master_json/MasterSkill.json','utf8')); const arr=d.items??d; arr.filter(s=>s.spListByUsedCount?.length>0).forEach(s=>console.log(s.label, s.sp, '->', s.spListByUsedCount))"

# intervalTurn > 0 のスキルを確認
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('./golden/master_json/MasterSkill.json','utf8')); const arr=d.items??d; arr.filter(s=>s.intervalTurn>0).forEach(s=>console.log(s.label, 'intervalTurn:', s.intervalTurn))"

# MasterAbilityEffect の abilityType 一覧
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('./golden/master_json/MasterAbilityEffect.json','utf8')); const arr=d.items??d; const types=[...new Set(arr.map(x=>x.abilityType))].sort(); console.log(types)"
```

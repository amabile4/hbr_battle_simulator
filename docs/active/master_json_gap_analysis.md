# master_json ギャップ分析と回収タスク一覧

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-06-27
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
| シミュレーター側残タスク | SP コスト解決時に `sp_cost_by_use_count` を参照するよう実装 |

### 1-2. `interval_turn` — 再使用間隔（クールダウン）

| 項目 | 内容 |
|---|---|
| マスターフィールド | `MasterSkill.intervalTurn` |
| 対象スキル | `RKayamoriSkill11`, `EAoiSkill08`, `KMaruyamaSkill53`, `KMaruyamaSkill08`, `KMaruyamaSkill09`（すべて 3 ターン） |
| 旧状態 | `skills.json` に対応フィールドなし → 毎ターン使用可として誤判定 |
| 新フィールド | `interval_turn: 3` |
| シミュレーター側残タスク | スキル使用可否判定に `interval_turn` を組み込む（PRI-018 と関連） |

---

## 2. シミュレーター側の実装タスク（ビューに追加済み・未実装）

PR#2 がマージされ `json/` に `sp_cost_by_use_count` / `interval_turn` が含まれるようになった後、
シミュレーター本体での配線が必要。

### T-A: `interval_turn` 使用可否判定

- **場所**: `src/turn/turn-controller.js` のスキル使用可否チェック
- **仕様**: 直前の使用ターンから `interval_turn` ターン経過するまで同スキルを使用不可
- **関連**: PRI-018（スキル使用回数制約と回復機能）と同一領域
- **優先度**: ★★★（5スキルで誤判定が確定）

### T-B: `sp_cost_by_use_count` SP コスト解決

- **場所**: `src/domain/character-style.js` または SP コスト解決箇所
- **仕様**: `sp_cost_by_use_count` が存在するスキルでは、使用回数インデックスに対応する値を使用
  - 0回目（未使用）→ インデックス 0（= `sp_cost` と同値）
  - 1回目使用後 → インデックス 1
  - 末尾インデックスを超えた場合は末尾値を使用
- **優先度**: ★★★（CathyCSkill51 の SP 管理が誤差確定）

---

## 3. 未対応ギャップ（`json/` への追加が必要）

### 3-1. ハードコード定数群（`battle-defaults.js` / `turn-controller.js`）

シミュレーターのソースコード調査で発見。master_json 側にデータがある可能性がある項目。

| ハードコード箇所 | 現在値 | master_json 側での確認状況 | 優先度 |
|---|---|---|---|
| `INTRINSIC_MARK_EFFECTS_BY_ELEMENT`<br>(`src/config/battle-defaults.js:17-58`) | Fire/Ice 等: 0.3/0.1/0.3/0.3/0.3 | MasterAbilityEffect に `abilityType` 23種あり。<br>印関連エントリの value1/value2 を要確認 | ★★ |
| `HIGH_BOOST_SKILL_ATK_RATE = 1.8`<br>(`src/turn/turn-controller.js:85`) | 1.8 | passives.json の metadata で一部対応済み<br>（line 1090-1097）だが不完全 | ★★ |
| `HIGH_BOOST_ATTACK_BUFF_MULTIPLIER = 1.2` | 1.2 | 同上 | ★★ |
| `TALISMAN_PENALTY_PER_LEVEL = 10`<br>(`src/turn/turn-controller.js:67`) | 10（1レベルあたり%） | MasterSpecialStatus 等を要確認 | ★ |
| `DISASTER_PENALTY_PER_LEVEL = 7`<br>(`src/turn/turn-controller.js:69`) | 7（1レベルあたり%） | 同上 | ★ |
| `OD_GAUGE_PER_HIT_PERCENT = 2.5`<br>(`src/config/battle-defaults.js:63`) | 2.5% | ゲーム全体仕様として固定の可能性あり | ★ |
| `DEFAULT_ZONE_MULTIPLIER = 1.5`<br>(`src/domain/damage-calculator.js:16`) | 1.5 倍 | master_json にゾーン補正データがあるか要確認 | ★ |

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

---

## 6. 次アクション

```
優先順位順:

[T-A] interval_turn 使用可否判定 (シミュレーター実装)
  → PR#2 マージ後。PRI-018 に合流させるか独立タスクとするか検討
  担当: Codex 推奨

[T-B] sp_cost_by_use_count SP コスト解決 (シミュレーター実装)
  → PR#2 マージ後。CharacterStyle or ターンコントローラーのコスト解決箇所
  担当: Codex 推奨

[T-C] INTRINSIC_MARK_EFFECTS_BY_ELEMENT の master_json 根拠確認
  → MasterAbilityEffect の印関連エントリを調査し、現在値と一致するか検証
  担当: Codex または Gemini による調査

[T-D] HIGH_BOOST 補正値の passives metadata 完全配線
  → 現在 line 1090-1097 で部分対応済み。残りのフィールドを確認
  担当: 調査後に判断
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

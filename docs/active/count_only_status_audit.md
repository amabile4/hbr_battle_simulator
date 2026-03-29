# Count/Only 併存 status 監査と実機確認マトリクス

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-29
> 調査対象: `json/skills.json`, `json/passives.json`, `src/domain/character-style.js`, `src/turn/turn-controller.js`, `tests/character-party.test.js`, `tests/turn-state-transitions.test.js`

---

## 目的

- `Count` と `Only` が同じ status family に併存する対象を repo から列挙する
- family ごとに現行 runtime の処理経路と既存テストを監査する
- 実機確認が必要な論点を status family 単位で表に整理する
- `AttackUp` 固有ではなく、同じ family rule を持つ候補群を先に切り分ける

## 調査メモ

- `json/` 配下は minified JSON のため、全文検索ではなく `node` による抽出で監査した
- summary の件数は `part` 件数で数えている
- 同一 skill/passive に同種 part が複数あるため、実アビリティ一覧では重複除去後件数も併記する
- family 集計は `parts[].skill_type` 単位だが、実際の適用系統は `parts[].elements` でさらに分かれる
- たとえば `エンハンス` は `AttackUp + elements=[]`、`ホーリーエンハンス` は `AttackUp + elements=["Light"]` で、raw data 上は同じ `AttackUp` family でも別 subgroup として扱う
- `CriticalRateUp` と `CriticalDamageUp` も同様で、無属性 subgroup と属性付き subgroup が混在する。代表例では subgroup が分かるよう属性有無を併記する
- `Funnel` と `MindEye` は 2026-03-29 時点では status 自体の `elements` subgroup を持たず、属性差が見える候補も `target_condition` 側の付与対象制約として扱う
- 2026-03-29 ユーザー確定仕様:
	- `Funnel`: `Only` は 1 件評価、`Count` は上位 2 件を合算して評価し、`Only` と `Count` の高い側を採用する
	- `MindEye`: `Funnel` と同じルールグループとして扱い、`Only` は 1 件評価、`Count` は上位 2 件を合算して評価し、高い側を採用する
	- `CriticalRateUp` / `CriticalDamageUp`: `AttackUp` と同じ `Only` vs `Count` ルールを適用する
	- 属性一致判定は「マッチした属性のみ」を対象にし、無属性 `Count` active buff は全属性スキルにマッチする
- 2026-03-29 時点のデータでは `DefenseUp` は `Count` と `Only` の併存 family ではない
- `AttackUpIncludeNormal` も `Count/Only` 併存候補ではない

---

## 1. 監査対象 family 一覧

### skill_type family 集計

| statusType | part件数 Count Skill | part件数 Only Skill | part件数 Count Passive | part件数 Only Passive | 重複除去後 Skill Count | 重複除去後 Skill Only | 重複除去後 Passive Count | 重複除去後 Passive Only | 監査対象 |
|-----------|----------------------|---------------------|------------------------|-----------------------|------------------------|-----------------------|--------------------------|-------------------------|---------|
| `AttackUp` | 68 | 21 | 0 | 2 | 67 | 18 | 0 | 2 | ✅ |
| `Funnel` | 16 | 7 | 5 | 1 | 16 | 6 | 2 | 1 | ✅ |
| `CriticalRateUp` | 14 | 10 | 0 | 0 | 14 | 10 | 0 | 0 | ✅ |
| `CriticalDamageUp` | 14 | 9 | 0 | 0 | 14 | 9 | 0 | 0 | ✅ |
| `MindEye` | 9 | 8 | 0 | 0 | 9 | 8 | 0 | 0 | ✅ |
| `DefenseUp` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ❌ 今回対象外 |

### elements subgroup 別一覧（ユーザー向け表示）

| family | subgroup | Count Skill | Only Skill | Count Passive | Only Passive | 代表例 |
|--------|----------|-------------|------------|---------------|--------------|--------|
| `AttackUp` | 無属性 | 44 | 11 | 0 | 1 | `エンハンス`, `茜色` |
| `AttackUp` | `Fire` | 3 | 2 | 0 | 0 | `ウィッシュカムトゥルー`, `トロピカルスクランブル` |
| `AttackUp` | `Ice` | 4 | 2 | 0 | 0 | `フローズン・スペクタクル`, `涙雨` |
| `AttackUp` | `Light` | 5 | 2 | 0 | 0 | `ホーリーエンハンス`, `縁` |
| `AttackUp` | `Dark` | 8 | 3 | 0 | 1 | `ピクシースマイル`, `シトラスティント`, `浄化の喝采` |
| `AttackUp` | `Thunder` | 4 | 1 | 0 | 0 | `二律背反スパークピッキング`, `祈りの花、風に託して` |
| `CriticalRateUp` | 無属性 | 12 | 4 | 0 | 0 | `レディ・イン・ミラージュ`, `流れ星に唄えば` |
| `CriticalRateUp` | `Fire` | 1 | 1 | 0 | 0 | `夢見る幻想覚醒`, `トロピカルスクランブル` |
| `CriticalRateUp` | `Ice` | 0 | 1 | 0 | 0 | `ミラージュ・モーメント` |
| `CriticalRateUp` | `Light` | 0 | 1 | 0 | 0 | `蒼星のイリデッセンス` |
| `CriticalRateUp` | `Dark` | 0 | 1 | 0 | 0 | `ネコジェット・シャテキ` |
| `CriticalRateUp` | `Thunder` | 1 | 2 | 0 | 0 | `霓裳羽衣ノ舞・霹靂`, `トリニティ・ブレイジング` |
| `CriticalDamageUp` | 無属性 | 8 | 3 | 0 | 0 | `オープン・ザ・ロード`, `流れ星に唄えば` |
| `CriticalDamageUp` | `Fire` | 1 | 1 | 0 | 0 | `夢見る幻想覚醒`, `トロピカルスクランブル` |
| `CriticalDamageUp` | `Ice` | 1 | 1 | 0 | 0 | `ロリータフルバースト`, `ミラージュ・モーメント` |
| `CriticalDamageUp` | `Light` | 2 | 1 | 0 | 0 | `爽籟に舞う仁慈`, `蒼星のイリデッセンス` |
| `CriticalDamageUp` | `Dark` | 1 | 1 | 0 | 0 | `フグリングクラッシュ`, `ネコジェット・シャテキ` |
| `CriticalDamageUp` | `Thunder` | 1 | 2 | 0 | 0 | `霓裳羽衣ノ舞・霹靂`, `トリニティ・ブレイジング` |
| `Funnel` | 無属性 | 16 | 7 | 5 | 1 | `流星+`, `未来へ繋ぐ蒼の意志`, `陰の5球打ち` |
| `MindEye` | 無属性 | 9 | 8 | 0 | 0 | `炯眼の構え`, `キャッツアイ` |

### subgroup 観点の補足

- 監査上は次の 2 系統を分けて扱う
- `AttackUp` / `CriticalRateUp` / `CriticalDamageUp`: status 自体が `elements` を持つ family。`elements` ごとに別 subgroup として扱う
- `Funnel` / `MindEye`: status 自体は単一 family。属性差が見える候補も `target_condition` による付与対象制約であり、status subgroup ではない
- `エンハンス` と `ホーリーエンハンス` のように、同じ `skill_type` でも `elements` が違えば実際の適用対象は別系統
- `ポッピング・バブル` の `Funnel` や `イルミネイトラボ` の `MindEye` は、光属性/闇属性 subgroup の状態を作るのではなく、該当属性の味方だけに単一の `Funnel` / `MindEye` を付与する

### 代表アビリティ

| statusType | Count 代表 | Only 代表 | Passive 代表 |
|-----------|-----------|----------|--------------|
| `AttackUp` | `エンハンス`（無属性 `AttackUp`）, `ホーリーエンハンス`（光属性 `AttackUp`） | `涙雨`（氷属性 `AttackUp[Only]`） | `浄化の喝采` |
| `Funnel` | `流星+`, `セルフパッション` | `水影`, `未来へ繋ぐ蒼の意志` | `陰の5球打ち` |
| `CriticalRateUp` | `一途なスマイル`（無属性 `CriticalRateUp`）, `夢見る幻想覚醒`（火属性 `CriticalRateUp`） | `流れ星に唄えば`（無属性 `CriticalRateUp[Only]`）, `ミラージュ・モーメント`（氷属性 `CriticalRateUp[Only]`） | なし |
| `CriticalDamageUp` | `オープン・ザ・ロード`（無属性 `CriticalDamageUp`）, `爽籟に舞う仁慈`（光属性 `CriticalDamageUp`） | `流れ星に唄えば`（無属性 `CriticalDamageUp[Only]`）, `蒼星のイリデッセンス`（光属性 `CriticalDamageUp[Only]`） | なし |
| `MindEye` | `炯眼の構え`, `宙舞うハイテンション` | `キャッツアイ`, `神に捧ぐ、勝旗のラ・ピュセル` | なし |

---

## 2. 現行 runtime 経路

| family | 主要関数 | 現行挙動 | 監査メモ |
|--------|---------|---------|---------|
| `AttackUp` / `CriticalRateUp` / `CriticalDamageUp` | `resolveActiveBuffStatusModifiersForAction()`, `applyCommittedActionSideEffects()` | preview で `Only` 最強1件 vs `Count` 上位2件合算を比較し高い側を採用。`Count` は属性一致効果のみ採用（無属性は全属性一致）。commit は採用された Count 効果のみ action ごとに 2 消費する | 2026-03-29 実装反映済み。`consumedCountEffectIds` を action に保持して選択消費を実施 |
| `Funnel` / `MindEye` | `resolveEffectiveFunnelEffects()` / `resolveEffectiveMindEyeEffects()`, `consumeFunnelEffects(2)` / `consumeMindEyeEffects(1)` | `Funnel` は preview で先頭 2 件合算、`MindEye` は preview/commit とも先頭 1 件ベースで処理している | ユーザー確定仕様は両者とも同一ルールグループ（`Only` 1 件 vs `Count` 上位2件合算で高い側採用）。現行は `MindEye` の消費・勝敗比較が未反映 |

### 現行コード参照

- `resolveEffectiveStatusEffects()` in `src/domain/character-style.js`
- `consumeStatusEffectsByType()` in `src/domain/character-style.js`
- `resolveActiveBuffStatusModifiersForAction()` in `src/turn/turn-controller.js`
- `applyCommittedActionSideEffects()` in `src/turn/turn-controller.js`
- `resolveEffectiveFunnelEffects()` / `consumeFunnelEffects()` in `src/domain/character-style.js`
- `resolveEffectiveMindEyeEffects()` / `consumeMindEyeEffects()` in `src/domain/character-style.js`

### 基本バフ消費ルール（現行実装）

- 非ダメージスキルでは Count 型バフを消費しない
	- 実装: `hasDamageForCount` 判定で `hasDamagePartInParts(skill.parts)` が `false` の場合、`tickStatusEffectsWhere()` が走らない
	- 参照: `src/turn/turn-controller.js` (`applyCommittedActionSideEffects()`)
- 追撃では Count 型バフを消費しない（通常攻撃と同列）
	- 実装: `isNormalOrPursuitForCount = isNormalAttackSkill(skill) || isPursuitOnlySkill(skill)` を使い、`includeNormalAttack !== true` 側の消費を除外
	- 参照: `src/turn/turn-controller.js` (`applyCommittedActionSideEffects()`)
- 通常攻撃では Count 型バフを原則消費しない
	- 実装: 上記 `isNormalOrPursuitForCount` で除外。ただし `includeNormalAttack === true` の効果は例外的に消費対象
	- 参照: `src/turn/turn-controller.js` (`applyCommittedActionSideEffects()`)
- Funnel / MindEye の action 消費も「ダメージ skill かつ 非通常攻撃・非追撃」でのみ発生する
	- 実装: `if (hasDamage && !isNormalAttackSkill(skill) && !isPursuitOnlySkill(skill)) { consumeFunnelEffects(2); consumeMindEyeEffects(1); }`
	- 参照: `src/turn/turn-controller.js` (`applyOdGaugeFromActions()`)

### 基本ルールのテスト根拠

- `count-based MindEye is consumed by damage action only`
	- 非ダメージ skill（Buff）では MindEye が消費されないことを確認
	- 参照: `tests/turn-state-transitions.test.js`
- `一途なスマイル stores count-based critical statuses and exposes them on the next preview in real data`
	- follow-up skill 選定時に「通常攻撃（AttackNormal）・追撃（Skill91）」を除外して消費確認している
	- 参照: `tests/turn-state-transitions.test.js`
- `isPursuitOnlySkill matches by name, label suffix, and desc marker`
	- 追撃判定の分類基盤を確認
	- 参照: `tests/skill-classifiers.test.js`

---

## 3. 既存 test カバレッジ

| family | 既存 coverage | 監査結果 |
|--------|---------------|---------|
| `AttackUp` | active status 保存、通常攻撃適用、属性一致、二連 cast 時の Count 消費あり | ✅ 基盤テストあり / ✅ `Count` vs `Only` 競合テスト追加済み |
| `Funnel` | stacking、sourceType 別枠、上位 2 件消費、二連 1 発目のみ消費あり | ✅ 基盤テストあり / ❌ ユーザー確定仕様（`Only` vs `Count` 勝敗）を固定する競合テストなし |
| `CriticalRateUp` | Count 付与と 1 回消費あり | ✅ Count 使用テストあり / ✅ ユーザー確定仕様（`Only` vs `Count` 比較 + 属性一致限定消費）の runtime 反映済み |
| `CriticalDamageUp` | Count 付与と 1 回消費あり | ✅ Count 使用テストあり / ✅ ユーザー確定仕様（`Only` vs `Count` 比較 + 属性一致限定消費）の runtime 反映済み |
| `MindEye` | Count は damage action のみ消費、二連 1 発目のみ 1 件消費あり | ✅ 基盤テストあり / ❌ ユーザー確定仕様（`Funnel` 同等ルールグループ）を固定する競合テストなし |

### family ごとの主な既存テスト

| family | テスト |
|--------|-------|
| `AttackUp` | `指揮行動 stores NormalBuff_Up as active AttackUp status on non-acting frontline allies in real data` |
| `AttackUp` | `涙雨 / ホーリーエンハンス / ねこじゃらし store elemental AttackUp status metadata in real data` |
| `AttackUp` | `active AttackUp: Count(2枠)合算がOnlyを上回る場合はCount側を採用し、採用Countのみ2消費する` |
| `AttackUp` | `active AttackUp: 無属性Countは属性一致扱いで採用対象になり、2消費される` |
| `AttackUp` | `DoubleActionExtraSkill: Count型AttackUpは1発目で切れ、2発目previewには残らない` |
| `AttackUp` | `DoubleActionExtraSkill: passive由来のCount型AttackUpはaction消費されず2発目にも残る` |
| `Funnel` | `statusEffects support Funnel stacking: Default stacks, Only keeps strongest` |
| `Funnel` | `consumeFunnelEffects consumes highest two count-based effects` |
| `Funnel` | `DoubleActionExtraSkill: Funnelは1発目だけで消費され、2発目には乗らない` |
| `MindEye` | `count-based MindEye is consumed by damage action only` |
| `MindEye` | `DoubleActionExtraSkill: MindEyeは1発目だけで消費され、2発目では消費されない` |
| `CriticalRateUp` / `CriticalDamageUp` | `一途なスマイル stores count-based critical statuses and exposes them on the next preview in real data` |
| `CriticalRateUp` / `CriticalDamageUp` | `極彩色 stores nested elemental critical buffs with the selected effect label in real data` |

---

## 4. 実機確認マトリクス

### 共通ケース

| Case | セットアップ | 確認項目 |
|------|-------------|---------|
| 1 | `Count` を 10 個付与した単発ダメージ skill | 有効個数 / 消費個数 / 残数 |
| 2 | `Only` 1 個のみ付与した単発ダメージ skill | 有効個数 / 消費個数 / 残数 |
| 3 | `Count` 多重 + `Only` 併存の単発ダメージ skill | どちらが発揮されるか / 負けた側が消費されるか |
| 4 | Case 3 と同条件の EX 連続発動 / 二連 cast | cast ごとの再評価有無 / cast ごとの消費個数 |

### family 別の確認表

| family | Case 1 | Case 2 | Case 3 | Case 4 | 確認ステータス |
|--------|--------|--------|--------|--------|--------------|
| `AttackUp` | `Count` は属性一致した効果のみ消費する | `Only` は 1 件評価、勝敗は Up型共通ルール | 無属性 `Count` は全属性にマッチ、属性付きは一致属性のみ消費 | Fire スキル時に `ALL` と `Fire` が同時適用・同時消費（各2）を実装で確認 | ✅ 実装反映済み（2026-03-29） |
| `Funnel` | `Count` は上位 2 件合算で評価する | `Only` は 1 件で評価する | `Only` vs `Count` は高い側採用（ユーザー確定） | 採用されなかった側は未消費（AttackUp同等 policy）を実装で確認 | ✅ 仕様確定（実装反映待ち） |
| `CriticalRateUp` | `Count` は属性一致した効果のみ消費する | `Only` は 1 件評価、勝敗は Up型共通ルール | 無属性 `Count` は全属性にマッチ、属性付きは一致属性のみ消費 | Fire スキル時に `ALL` と `Fire` が同時適用・同時消費（各2）を実装で確認 | ✅ 実装反映済み（2026-03-29） |
| `CriticalDamageUp` | `Count` は属性一致した効果のみ消費する | `Only` は 1 件評価、勝敗は Up型共通ルール | 無属性 `Count` は全属性にマッチ、属性付きは一致属性のみ消費 | Fire スキル時に `ALL` と `Fire` が同時適用・同時消費（各2）を実装で確認 | ✅ 実装反映済み（2026-03-29） |
| `MindEye` | `Count` は上位 2 件合算で評価する（`Funnel` 同等） | `Only` は 1 件で評価する（`Funnel` 同等） | `Only` vs `Count` は高い側採用（ユーザー確定） | 採用されなかった側は未消費（`Funnel` 同等 policy）を実装で確認 | ✅ 仕様確定（実装反映待ち） |

### Up型3familyの共通判定基準（`AttackUp` / `CriticalRateUp` / `CriticalDamageUp`）

- `Only` は最強 1 件だけを評価する
- `Count` は属性一致した効果のみを評価・消費する
- 無属性 `Count` は全属性スキルにマッチする
- 属性付き `Count` は一致属性スキルにのみマッチする
- `Only` と `Count` の評価値を比較し、高い側を採用する
- 消費は採用側のみで行い、`Count` 側は 1 cast あたり 2 消費する
- Fire 属性スキル時は、無属性 `Count`（ALL）と Fire `Count` が同時に採用条件を満たすため、両方の消費対象になりうる

### `Funnel` / `MindEye` の共通判定基準

- `Only` は最強 1 件だけを評価する
- `Count` は上位 2 件を合算して評価する
- `Only` と `Count` の評価値を比較し、高い側を採用する
- 消費は採用側のみで行う

### 仕様確定ルール（2026-03-29）

| family | 確定ルール | repo 現行 |
|--------|-----------|----------|
| `AttackUp` / `CriticalRateUp` / `CriticalDamageUp` | Up型3family共通判定基準を適用。`Only` と `Count` を比較し高い側を採用し、`Count` は属性一致対象のみ 1 cast で 2 消費する（無属性 `Count` は全属性マッチ） | 一致。`resolveActiveBuffStatusModifiersForAction()` と `applyCommittedActionSideEffects()` で反映済み（2026-03-29） |
| `Funnel` / `MindEye` | 共通判定基準を適用。`Only` は 1 件評価、`Count` は上位 2 件合算で高い側を採用し、消費は採用側のみで行う | 不一致。現行は `Funnel` が勝敗比較未反映、`MindEye` は `consumeMindEyeEffects(1)` で 2件合算ルール未反映 |

---

## 5. 実装修正前の判断メモ

- `AttackUp` のみを特別扱いするのは避ける
- runtime refactor は family policy table を前提にする
- ただし policy 値は family ごとに持つ
- `AttackUp`, `Funnel`, `CriticalRateUp`, `CriticalDamageUp` は 2026-03-29 ユーザー確定仕様を優先して実装へ反映する
- `MindEye` は `Funnel` と同じルールグループとして同じ policy table へ統合する
- `DefenseUp` は今回の Count/Only 競合監査から外す

---

## 6. family 別候補一覧

- 6章では family を次の 2 種類に分けて並べる
- `AttackUp` / `CriticalRateUp` / `CriticalDamageUp`: status subgroup を持つ family。`elements` ごとに見出しを分ける
- `Funnel` / `MindEye`: status subgroup を持たない family。属性差がある候補は `target_condition` メモとして別記する

### 6.1 `AttackUp`

**Summary**

- part件数: Count Skill `68`, Only Skill `21`, Only Passive `2`
- 重複除去後: Count Skill `67`, Only Skill `18`, Only Passive `2`

#### Count Skill 一覧

##### [無属性]

- 和泉 ユキ [夢幻のSleeping Ocelot] / クールダウン / `YIzumiSkill04`
- 和泉 ユキ [ナイトクルーズ・アテンダント] / スーパーセル / `YIzumiSkill53`
- 逢川 めぐみ [心、躍るFuel] / クールダウン / `MAikawaSkill05`
- 東城 つかさ [Serious or Stupid] / エンハンス / `TTojoSkill01`
- 東城 つかさ [嗟歎のスリーパー] / フィルエンハンス / `TTojoSkill03`
- 東城 つかさ [真夏のPrayer] / ウィッシュカムトゥルー / `TTojoSkill52`
- 國見 タマ [魔法の国のエレメンタル] / リバイブ・ヴェール / `TKunimiSkill52`
- 國見 タマ [トワイライト・メモリーズ] / デヴォーション / `TKunimiSkill08`
- 蒼井 えりか [ヒビケ・Battlecry] / アクセラレーション / `EAoiSkill06`
- 水瀬 いちご [君の瞳にコロしてる] / セルフパッション / `IMinaseSkill04`
- 水瀬 すもも [積乱雲] / 残心撃 / `SMinaseSkill04`
- 水瀬 すもも [愛憐の綻び] / ロココ・デストラクション / `SMinaseSkill53`
- 樋口 聖華 [戦場の科学者] / エンハンス / `SHiguchiSkill01`
- 樋口 聖華 [生者のホメオスタシス] / ドーピング / `SHiguchiSkill02`
- 樋口 聖華 [宙の探究、星の眩耀] / フィルエンハンス / `SHiguchiSkill04`
- 樋口 聖華 [宙の探究、星の眩耀] / アブソリュートフェノメノン / `SHiguchiSkill52`
- 柊木 梢 [蒼きノクターン] / クレール・ド・リュンヌ+ / `KHiiragiSkill51Ev1`
- 山脇・ボン・イヴァール [魔王の帰還] / キリングエッジ / `BIYamawakiSkill03`
- 山脇・ボン・イヴァール [Holy Knight] / デディケイトギフト / `BIYamawakiSkill04`
- 佐月 マリ [ビジネスとスマイル] / エンハンス / `MSatsukiSkill02`
- 佐月 マリ [はにかむ、心かき集め] / フィルエンハンス / `MSatsukiSkill04`
- 白河 ユイナ [Sign] / 導きの号令 / `YShirakawaSkill04`
- 月城 最中 [黄昏、久遠の夢] / 空 / `MTsukishiroSkill03`
- 小笠原 緋雨 [朧月夜のバレット] / 三日月宗近+ / `HOgasawaraSkill51Ev1`
- 蔵 里見 [夜警の空] / 細雪 / `SKuraSkill03`
- 二階堂 三郷 [最年少名人] / ハネ殺し / `MNikaidoSkill01`
- 二階堂 三郷 [今昔の感、想いは往きて] / クールダウン / `MNikaidoSkill02`
- 石井 色葉 [お気楽カラフル] / エンハンス / `IIshiiSkill01`
- 石井 色葉 [撃砕の無彩色] / フィルエンハンス / `IIshiiSkill03`
- 室伏 理沙 [今宵、花明かりの下で] / 胡蝶のいざない、照る初旭 / `RMurohushiSkill53`
- 大島 四ツ葉 [四ツ葉の倦怠] / エンハンス / `YoOhshimaSkill01`
- 大島 四ツ葉 [破られたアンニュイ] / 決戦前夜 / `YoOhshimaSkill03`
- 大島 四ツ葉 [ふわりフリーダム] / フラッフィー / `YoOhshimaSkill05`
- 大島 六宇亜 [さざなみ・フィールグッド] / メルティリトリート / `MuOhshimaSkill07`
- 華村 詩紀 [アバンチュールコンダクター] / エンハンス / `SHanamuraSkill01`
- 華村 詩紀 [再耀のカンタービレ] / 導きのタクト / `SHanamuraSkill04`
- 夏目 祈 [剣の冷徹] / クールダウン / `INatsumeSkill03`
- 黒沢 真希 [青あらし走死走愛] / アクセル全開 / `MKurosawaSkill04`
- キャロル・リーパー [摩天楼のダークヒーロー] / サンダーストーム / `CReaperSkill51`
- キャロル・リーパー [Carnival with You] / 秘密のロマンティック / `CReaperSkill52`
- 李 映夏 [臥龍の代弁者] / エンハンス / `LShanhuaSkill01`
- 李 映夏 [我、勇ならざるは将なきに同じ] / 臥龍天命 / `LShanhuaSkill03`
- 李 映夏 [我、勇ならざるは将なきに同じ] / 第七計 無中生有 / `LShanhuaSkill51`
- アイリーン・レドメイン [月下のハイドアンドシーク] / 解けない謎はない / `IRedmayneSkill04`

##### [Fire]

- 大島 一千子 [果てなき慈愛の守護者] / 慈愛の波動 / `IcOhshimaSkill51`
- 大島 四ツ葉 [破られたアンニュイ] / 夢見る幻想覚醒 / `YoOhshimaSkill51`

##### [Ice]

- 桜庭 星羅 [対決！！エア・ステージ] / フローズン・スペクタクル / `SSakurabaSkill52`
- 神崎 アーデルハイド [氷花のHexerei] / 淡雪 / `AKanzakiSkill04`
- 菅原 千恵 [ロリータ・ストイック] / ロリータフルバースト / `CSugaharaSkill53`
- 二階堂 三郷 [Holiday Ring a Bell] / 北風のスバル / `MNikaidoSkill05`

##### [Thunder]

- 國見 タマ [激突！！エア・ベース] / 二律背反スパークピッキング / `TKunimiSkill53`
- 水瀬 すもも [類は友を呼ぶ] / ねこじゃらし / `SMinaseSkill05`
- 小笠原 緋雨 [希求と渇仰] / とある衝撃 / `HOgasawaraSkill05`
- キャロル・リーパー [摩天楼のダークヒーロー] / ライトニングロア / `CReaperSkill03`

##### [Light]

- 東城 つかさ [シークレットサービス・サイレンス] / ホーリーエンハンス / `TTojoSkill05`
- 山脇・ボン・イヴァール [Holy Knight] / レイジング・レインディア / `BIYamawakiSkill52`
- 蔵 里見 [此に期するは豊穣の御霊] / 夢十夜 / `SKuraSkill02`
- 立華 かなで [Earth Angel] / エンジェルズ・レイ / `AliceASkill51`

##### [Dark]

- 東城 つかさ [バニーファイト・デビエーション] / ピクシースマイル / `TTojoSkill06`
- 樋口 聖華 [暁のカタルシス] / イルミネイトラボ / `SHiguchiSkill53`
- 神崎 アーデルハイド [少女の休息] / 神崎流忍術・散華 / `AKanzakiSkill53`
- 白河 ユイナ [真夏のジャンダルム] / 赤面スティグマ / `YShirakawaSkill06`
- 蔵 里見 [若女将の日々] / 大切り盛り / `SKuraSkill05`
- 伊達 朱里 [テニスコートの悪魔] / 被害妄想 / `ADateSkill03`
- 華村 詩紀 [君のUnisono] / 小鳥たちへのシンフォニー / `SHanamuraSkill51`
- 華村 詩紀 [君のUnisono] / 小鳥たちへのシンフォニー+ / `SHanamuraSkill51Ev1`

#### Only Skill 一覧

##### [無属性]

- 樋口 聖華 [サンセット・ユートピア] / 茜色 / `SHiguchiSkill07`
- ビャッコ [レイジング・ビースト] / ビースト・プリズン+ / `ByakkoSkill51Ev1`
- 白河 ユイナ [勝利を告げる神託の旗] / 神に捧ぐ、勝旗のラ・ピュセル / `YShirakawaSkill56`
- 大島 五十鈴 [夜語りのひとしずく] / エメラルドシロップ / `IrOhshimaSkill06`
- 柳 美音 [夜の香り、薔薇の調べ] / ガーデン・オブ・エデン / `MYanagiSkill53`
- アイリーン・レドメイン [謳うそよ風の向かう先] / リコレクション / `IRedmayneSkill05`
- 岩沢 雅美 [Dreamlike Days] / ジャムセッション / `CathyCSkill02`
- 七瀬 七海 [約束は暁の彼方で] / 祈りの花、風に託して / `NNanaseSkill52`
- 七瀬 七海 [エンジェルクライシス] / ソニックブースト / `NNanaseSkill01`

##### [Fire]

- 樋口 聖華 [サンセット・ユートピア] / トロピカルスクランブル / `SHiguchiSkill54`
- 小笠原 緋雨 [春色イースターバニー] / ハッピー！エッグ・ラッシュ！ / `HOgasawaraSkill55`

##### [Ice]

- 東城 つかさ [哀情のラメント] / 涙雨 / `TTojoSkill07`
- 芳岡 ユイ [Stir Soul Song] / チャーミングボイス / `CathyBSkill01`

##### [Light]

- 月城 最中 [君想う春吹雪] / 縁 / `MTsukishiroSkill06`
- 蔵 里見 [親愛の結び] / 丹精 / `SKuraSkill06`

##### [Dark]

- 大島 二以奈 [渚のピュアメモリー] / シトラスティント / `NiOhshimaSkill06`
- 大島 四ツ葉 [ゆるりたゆたう湯道楽] / ネコジェット・シャテキ / `YoOhshimaSkill53`
- シャルロッタ・スコポフスカヤ [清廉なるニヴェースタ] / クリャートヴァ / `CSkopovskayaSkill05`

#### Only Passive 一覧

##### [無属性]

- 和泉 ユキ [君を待つ紅玉] / 破砕の喝采 / `Passive.Break_AttackUpAll01`

##### [Dark]

- 和泉 ユキ [君を待つ紅玉] / 浄化の喝采 / `Passive.disarmament_AttackUpAll01`

### 6.2 `Funnel`

**Summary**

- part件数: Count Skill `16`, Only Skill `7`, Count Passive `5`, Only Passive `1`
- 重複除去後: Count Skill `16`, Only Skill `6`, Count Passive `2`, Only Passive `1`

#### 状態 subgroup

- `Funnel` は 2026-03-29 時点で全件 `elements=[]`。status subgroup は持たない

#### Count Skill 一覧

- 和泉 ユキ [終いのSpitfire] / 流星+ / `YIzumiSkill51Ev1`
- 東城 つかさ [バニーファイト・デビエーション] / 今宵、快楽ナイトメア / `TTojoSkill54`
- 朝倉 可憐 [シークレットサービス・デモリッシュ] / 破壊のシニシズム / `KAsakuraSkill53`
- 水瀬 いちご [君の瞳にコロしてる] / セルフパッション / `IMinaseSkill04`
- 水瀬 いちご [君の瞳にコロしてる] / 狂騒のヨスガ / `IMinaseSkill52`
- 山脇・ボン・イヴァール [山脇様、ご乱心] / イチコロスマイル / `BIYamawakiSkill05`
- 山脇・ボン・イヴァール [誇り高き魔王の凱旋] / ギガビッグバン / `BIYamawakiSkill55`
- 神崎 アーデルハイド [微光の兆し] / 心意活性 / `AKanzakiSkill03`
- 菅原 千恵 [気まぐれのアンニュイ] / ブリリアント・グローリー / `CSugaharaSkill03`
- 伊達 朱里 [テニスコートの悪魔] / 漆黒トランスサーブ / `ADateSkill51`
- 大島 二以奈 [Brand New Mind] / レヴォリューション / `NiOhshimaSkill03`
- 大島 四ツ葉 [ぐうたらパジャマナイト] / ポッピング・バブル / `YoOhshimaSkill52`
- 松岡 チロル [秘めたる努力] / バックラッシュ / `CMatsuokaSkill02`
- キャロル・リーパー [Carnival with You] / 秘密のロマンティック / `CReaperSkill52`
- 李 映夏 [我、勇ならざるは将なきに同じ] / 第七計 無中生有 / `LShanhuaSkill51`
- アイリーン・レドメイン [碧いカーヴァンクル] / ホールドアップマインド / `IRedmayneSkill02`

#### Only Skill 一覧

- 蒼井 えりか [ツナグ・Legacy] / 未来へ繋ぐ蒼の意志 / `EAoiSkill56`
- 水瀬 いちご [熱闘！かっとばせホームラン！] / 掴め栄冠！グランドスラム！ / `IMinaseSkill54`
- 柊木 梢 [プールサイド・モーメント] / 水影 / `KHiiragiSkill06`
- 白河 ユイナ [勝利を告げる神託の旗] / 神命を宿す瞳 / `YShirakawaSkill09`
- 小笠原 緋雨 [春色イースターバニー] / ハッピー！エッグ・ラッシュ！ / `HOgasawaraSkill55`
- 丸山 奏多 [決起のレガリア] / 進軍を照らす覇光 / `KMaruyamaSkill53`

#### Count Passive 一覧

- 朝倉 可憐 [紅蓮月華のKillrazor] / 狂乱の型 / `Passive.Start_Funnel01`
- 朝倉 可憐 [スカーレット・リベリオン] / 五月雨 / `Passive.Start_Funnel02`

#### Only Passive 一覧

- 伊達 朱里 [幸運ふゆうらら] / 陰の5球打ち / `Passive.Start_Funnel03`

#### 属性付き付与対象条件メモ

- 東城 つかさ [バニーファイト・デビエーション] / 今宵、快楽ナイトメア / `TTojoSkill54`: `target_condition=IsNatureElement(Dark)==1`。闇属性の前衛だけに `Funnel` を付与する
- 大島 四ツ葉 [ぐうたらパジャマナイト] / ポッピング・バブル / `YoOhshimaSkill52`: `target_condition=IsNatureElement(Light)==1`。光属性の後衛だけに `Funnel` を付与する
- キャロル・リーパー [Carnival with You] / 秘密のロマンティック / `CReaperSkill52`: `target_condition=IsNatureElement(Fire)==1`。火属性の前衛だけに `Funnel` を付与する
- 蒼井 えりか [ツナグ・Legacy] / 未来へ繋ぐ蒼の意志 / `EAoiSkill56`: `target_condition=IsNatureElement(Ice)==1`。氷属性の味方だけに `Funnel` を付与する
- 水瀬 いちご [熱闘！かっとばせホームラン！] / 掴め栄冠！グランドスラム！ / `IMinaseSkill54`: `target_condition=IsNatureElement(Light)==1`。光属性の味方だけに `Funnel` を付与する
- 白河 ユイナ [勝利を告げる神託の旗] / 神命を宿す瞳 / `YShirakawaSkill09`: `target_condition=IsNatureElement(Fire)==1`。火属性の味方だけに `Funnel` を付与する
- 小笠原 緋雨 [春色イースターバニー] / ハッピー！エッグ・ラッシュ！ / `HOgasawaraSkill55`: `target_condition=IsNatureElement(Fire)==1`。火属性の味方だけに `Funnel` を付与する
- 丸山 奏多 [決起のレガリア] / 進軍を照らす覇光 / `KMaruyamaSkill53`: `target_condition=IsNatureElement(Thunder)==0`。雷属性以外の味方に `Funnel` を付与する

### 6.3 `CriticalRateUp`

**Summary**

- part件数: Count Skill `14`, Only Skill `10`
- 重複除去後: Count Skill `14`, Only Skill `10`

#### Count Skill 一覧

##### [無属性]

- 東城 つかさ [シークレットサービス・サイレンス] / レディ・イン・ミラージュ / `TTojoSkill53`
- 朝倉 可憐 [盛夏のシャーク・ザ・リッパー] / フグリングクラッシュ / `KAsakuraSkill54`
- 國見 タマ [トワイライト・メモリーズ] / オープン・ザ・ロード / `TKunimiSkill55`
- 樋口 聖華 [宙の探究、星の眩耀] / アブソリュートフェノメノン / `SHiguchiSkill52`
- 柊木 梢 [ホップ・ステップ・スリップ！] / 一途なスマイル / `KHiiragiSkill05`
- 天音 巫呼 [エクスペリメンタルなキミ] / ルーンバースト / `MTenneSkill03`
- 菅原 千恵 [ロリータ・ストイック] / おしおき / `CSugaharaSkill06`
- 大島 三野里 [満艦飾の花乙女] / 染められて、初紅葉 / `MiOhshimaSkill52`
- 松岡 チロル [疾風迅速滅亡の狼煙] / 必滅！ヴェインキック / `CMatsuokaSkill51`
- 松岡 チロル [疾風迅速滅亡の狼煙] / 必滅！ヴェインキック+ / `CMatsuokaSkill51Ev1`
- 夏目 祈 [薫衣香る夢見鳥] / 冀望 / `INatsumeSkill04`
- アイリーン・レドメイン [碧いカーヴァンクル] / ホールドアップマインド / `IRedmayneSkill02`

##### [Fire]

- 大島 四ツ葉 [破られたアンニュイ] / 夢見る幻想覚醒 / `YoOhshimaSkill51`

##### [Thunder]

- 李 映夏 [いざなうつゆくさ] / 霓裳羽衣ノ舞・霹靂 / `LShanhuaSkill52`

#### Only Skill 一覧

##### [無属性]

- 茅森 月歌 [白き華の歌姫] / 流れ星に唄えば / `RKayamoriSkill56`
- 桜庭 星羅 [星の海、たゆたうフォーチュンテラー] / 星屑の航路 / `SSakurabaSkill51`
- 桜庭 星羅 [星の海、たゆたうフォーチュンテラー] / 星屑の航路+ / `SSakurabaSkill51Ev1`
- 柳 美音 [夜の香り、薔薇の調べ] / ガーデン・オブ・エデン / `MYanagiSkill53`

##### [Fire]

- 樋口 聖華 [サンセット・ユートピア] / トロピカルスクランブル / `SHiguchiSkill54`

##### [Ice]

- 東城 つかさ [哀情のラメント] / ミラージュ・モーメント / `TTojoSkill55`

##### [Light]

- 白河 ユイナ [黄昏に咲くスピカ] / 蒼星のイリデッセンス / `YShirakawaSkill55`

##### [Dark]

- 大島 四ツ葉 [ゆるりたゆたう湯道楽] / ネコジェット・シャテキ / `YoOhshimaSkill53`

##### [Thunder]

- 手塚 咲 [希望の暁] / トリニティ・ブレイジング / `STezukaSkill51`
- 七瀬 七海 [エンジェルクライシス] / ノヴァエリミネーション / `NNanaseSkill51`

### 6.4 `CriticalDamageUp`

**Summary**

- part件数: Count Skill `14`, Only Skill `9`
- 重複除去後: Count Skill `14`, Only Skill `9`

#### Count Skill 一覧

##### [無属性]

- 東城 つかさ [シークレットサービス・サイレンス] / レディ・イン・ミラージュ / `TTojoSkill53`
- 朝倉 可憐 [盛夏のシャーク・ザ・リッパー] / フグリングクラッシュ / `KAsakuraSkill54`
- 國見 タマ [トワイライト・メモリーズ] / オープン・ザ・ロード / `TKunimiSkill55`
- 蒼井 えりか [ヒビケ・Battlecry] / アクセラレーション / `EAoiSkill06`
- 樋口 聖華 [宙の探究、星の眩耀] / アブソリュートフェノメノン / `SHiguchiSkill52`
- 柊木 梢 [ホップ・ステップ・スリップ！] / 一途なスマイル / `KHiiragiSkill05`
- 大島 三野里 [満艦飾の花乙女] / 染められて、初紅葉 / `MiOhshimaSkill52`
- 大島 六宇亜 [さざなみ・フィールグッド] / メルティリトリート / `MuOhshimaSkill07`
- アイリーン・レドメイン [月下のハイドアンドシーク] / 解けない謎はない / `IRedmayneSkill04`

##### [Fire]

- 大島 四ツ葉 [破られたアンニュイ] / 夢見る幻想覚醒 / `YoOhshimaSkill51`

##### [Ice]

- 菅原 千恵 [ロリータ・ストイック] / ロリータフルバースト / `CSugaharaSkill53`

##### [Light]

- 大島 二以奈 [心緒、昂る温泉郷] / 爽籟に舞う仁慈 / `NiOhshimaSkill52`
- 大島 四ツ葉 [ぐうたらパジャマナイト] / ポッピング・バブル / `YoOhshimaSkill52`

##### [Thunder]

- 李 映夏 [いざなうつゆくさ] / 霓裳羽衣ノ舞・霹靂 / `LShanhuaSkill52`

#### Only Skill 一覧

##### [無属性]

- 茅森 月歌 [白き華の歌姫] / 流れ星に唄えば / `RKayamoriSkill56`
- 桜庭 星羅 [星の海、たゆたうフォーチュンテラー] / 星屑の航路+ / `SSakurabaSkill51Ev1`
- 柳 美音 [夜の香り、薔薇の調べ] / ガーデン・オブ・エデン / `MYanagiSkill53`

##### [Fire]

- 樋口 聖華 [サンセット・ユートピア] / トロピカルスクランブル / `SHiguchiSkill54`

##### [Ice]

- 東城 つかさ [哀情のラメント] / ミラージュ・モーメント / `TTojoSkill55`

##### [Light]

- 白河 ユイナ [黄昏に咲くスピカ] / 蒼星のイリデッセンス / `YShirakawaSkill55`

##### [Dark]

- 大島 四ツ葉 [ゆるりたゆたう湯道楽] / ネコジェット・シャテキ / `YoOhshimaSkill53`

##### [Thunder]

- 手塚 咲 [希望の暁] / トリニティ・ブレイジング / `STezukaSkill51`
- 七瀬 七海 [エンジェルクライシス] / ノヴァエリミネーション / `NNanaseSkill51`

### 6.5 `MindEye`

**Summary**

- part件数: Count Skill `9`, Only Skill `8`
- 重複除去後: Count Skill `9`, Only Skill `8`

#### 状態 subgroup

- `MindEye` は 2026-03-29 時点で全件 `elements=[]`。status subgroup は持たない

#### Count Skill 一覧

- 茅森 月歌 [The Feel of the Throne] / 炯眼の構え / `RKayamoriSkill08`
- 國見 タマ [トワイライト・メモリーズ] / オープン・ザ・ロード / `TKunimiSkill55`
- 樋口 聖華 [暁のカタルシス] / イルミネイトラボ / `SHiguchiSkill53`
- 室伏 理沙 [今宵、花明かりの下で] / 胡蝶のいざない、照る初旭 / `RMurohushiSkill53`
- 大島 三野里 [Realize Your Mind] / 宙舞うハイテンション / `MiOhshimaSkill51`
- 大島 三野里 [Realize Your Mind] / 宙舞うハイテンション+ / `MiOhshimaSkill51Ev1`
- 大島 六宇亜 [ピンチで最高] / 快感・スプリント！ / `MuOhshimaSkill51`
- 大島 六宇亜 [ピンチで最高] / 快感・スプリント！+ / `MuOhshimaSkill51Ev1`
- 立華 かなで [Earth Angel] / インサイト / `AliceASkill02`

#### Only Skill 一覧

- 水瀬 すもも [いたずらブラックキャット] / キャッツアイ / `SMinaseSkill06`
- 白河 ユイナ [勝利を告げる神託の旗] / 神に捧ぐ、勝旗のラ・ピュセル / `YShirakawaSkill56`
- 月城 最中 [君想う春吹雪] / 縁 / `MTsukishiroSkill06`
- 桐生 美也 [汐風に誘われて] / 咲き昇る宵の幻 / `MKiryuSkill54`
- 大島 五十鈴 [夜語りのひとしずく] / エメラルドシロップ / `IrOhshimaSkill06`
- 柳 美音 [夜の香り、薔薇の調べ] / ガーデン・オブ・エデン / `MYanagiSkill53`
- 丸山 奏多 [決起のレガリア] / 進軍を照らす覇光 / `KMaruyamaSkill53`
- キャロル・リーパー [Have no fear! I'm a hero!] / レジェンドモード / `CReaperSkill06`

#### 属性付き付与対象条件メモ

- 樋口 聖華 [暁のカタルシス] / イルミネイトラボ / `SHiguchiSkill53`: `target_condition=IsNatureElement(Dark)==1`。闇属性の味方だけに `MindEye` を付与する
- 桐生 美也 [汐風に誘われて] / 咲き昇る宵の幻 / `MKiryuSkill54`: `target_condition=IsNatureElement(Fire)==1`。火属性の味方だけに `MindEye` を付与する

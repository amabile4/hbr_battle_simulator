# ダメージ計算機 統合実装プラン

> **ステータス**: 🟢 進行中 | **ブランチ**: `feature/damage-calculator-integration` | **作成日**: 2026-06-03

## 概要

威力詳細タブに `calculateDamage()` を使った実ダメージ計算結果を追加表示する。
現在の倍率ブレイクダウン表示と並列表示し、攻撃者・敵のステータスを入力として
実際に与えるダメージ期待値・最大/最小を表示する。

---

## ゴール

```
威力詳細タブ（現在）         威力詳細タブ（改修後）
┌────────────────┐           ┌──────────┬───────────────┐
│カテゴリ │ 倍率  │           │カテゴリ  │  攻撃者/敵    │
│攻撃バフ │ 1.3  │           │ 倍率     │  ステータス   │
│防御デバフ│ 1.5  │    →     │攻撃バフ  ├───────────────┤
│         │      │           │1.3       │ 計算結果      │
│         │      │           │防御デバフ │ 通常: XXXX   │
│         │      │           │1.5       │ クリ: XXXX   │
└────────────────┘           └──────────┴───────────────┘
```

---

## 確定インターフェース定義（机上設計完了）

### AttackerStatsInput 型定義（T1.1確定）

```js
/**
 * @typedef {object} AttackerStatsInput
 * @property {number|null|undefined} [str]  力。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [dex]  器用さ。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [wis]  知性。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [spr]  精神。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [luk]  運。null/undefined は role 既定値へ fallback。
 * @property {number|null|undefined} [con]  体力。null/undefined は role 既定値へ fallback。
 * @property {0|1|2|3|4} [limitBreakCount=0]         凸数。0〜4 にクランプ。
 * @property {number} [abilitySprCorrection=0]        アビリティ精神補正。
 * @property {number} [tokenCount=0]                  トークン個数。
 * @property {number|null|undefined} [tokenRatio]     トークン倍率。指定時は tokenCount より優先。
 * @property {'Attacker'|'Blaster'|'Breaker'|'Buffer'|'Debuffer'|'Defender'|'Healer'|'Admiral'|'Rider'} [role='Attacker']
 *   role 別デフォルトステータスの選択に使う（styles.json の role フィールドに準拠）。
 */
```

#### role 別デフォルトステータステーブル（ag調査 + Python実装準拠）

| role | str | dex | wis | spr | luk | con |
|------|-----|-----|-----|-----|-----|-----|
| Attacker / Blaster / Breaker | 650 | 650 | 600 | 600 | 600 | 600 |
| Buffer | 600 | 600 | 670 | 620 | 600 | 600 |
| Debuffer | 600 | 600 | 650 | 600 | 670 | 600 |
| Defender / Healer | 600 | 600 | 600 | 670 | 600 | 650 |
| Admiral / Rider / 不明 | 620 | 620 | 620 | 620 | 620 | 620 |

### DamageCalculatorEnemyAdapter 型定義（T1.2確定）

```js
/**
 * @typedef {object} DamageCalculatorEnemyAdapter
 * @property {number|null} [enemyId]              選択中の敵ID（EnemySetupSnapshot.enemySlots[i].selectedEnemyId）
 * @property {string} [enemyName]                 表示用敵名
 * @property {number|null|undefined} [paramBorder] 防御境界値。null → enemies.json から自動取得、未存在時は 770。
 * @property {boolean} [isHpTarget=true]          HP対象: true、DP対象: false。v1 は true 固定。
 * @property {number} [destructionRate=1]         破壊率倍率（1.0〜）。damageContext.effectiveDamageRatesByEnemy から取得。
 * @property {Record<string, number>} [resistances={}] 武器・属性耐性マップ。v1 は空（全属性 1.0）。
 * @property {Array<object>} [statusEffects=[]]   デバフ効果。v1 は空（damageBreakdown groups から逆算しない）。
 */
```

**注意**: `enemies.json` の `base_param` には `param_border` のみで武器属性耐性マップは存在しない。
v1 では `resistances` を省略（全 1.0 扱い）とし、将来的に damageBreakdown の affinity グループから補完を検討する。

### buildDamageCalculationInput() シグネチャ（T1.3確定）

```js
// src/domain/damage-calculator-input-builder.js（新規）

/**
 * damageContext と外部入力から DamageInputContext を組み立てる。
 *
 * 設計方針（Hybrid Approach）:
 *   - スキル・キャラクター情報: damageContext から直接取得
 *   - 攻撃者ステータス: AttackerStatsInput（手動 or role デフォルト）
 *   - バフ倍率: damageBreakdown.groups の合計 multiplier を pre-resolved power として渡す
 *   - 敵パラメータ: DamageCalculatorEnemyAdapter（Enemy Setup から取得）
 *
 * @param {ReturnType<import('./damage-calculation-context.js').buildDamageCalculationContext>} damageContext
 * @param {AttackerStatsInput} [attackerStatsInput={}]
 * @param {DamageCalculatorEnemyAdapter} [enemyAdapter={}]
 * @returns {import('../contracts/damage-calculation.js').DamageInputContext}
 */
export function buildDamageCalculationInput(damageContext, attackerStatsInput = {}, enemyAdapter = {}) {}

/**
 * role と limitBreakCount からデフォルトステータスを解決する。
 * @param {string} role
 * @param {number} limitBreakCount
 * @returns {{ str:number, dex:number, wis:number, spr:number, luk:number, con:number }}
 */
export function resolveDefaultStats(role, limitBreakCount = 0) {}
```

#### 重要な変換ルール

| DamageInputContext フィールド | 取得元 | 変換 |
|---|---|---|
| `skill.kind` | `damageContext.isNormalAttack` | `true` → `'normal_attack'` |
| `skill.skillId` / `skill.name` | `damageContext.skillId` / `skillName` | そのまま |
| `attacker.characterId` / `styleId` | `damageContext.actorCharacterId` / `actorStyleId` | そのまま |
| `attacker.tokenCount` / `tokenRatio` | `damageContext.tokenAttackTokenCount` / `tokenAttackTotalRate` | そのまま |
| `activeZone` | `damageContext.zoneType` + `zonePowerRate` | `zonePowerRate > 0` → `'${zoneType}Zone'`、それ以外 `'None'` |
| `defender.destructionRate` | `damageContext.effectiveDamageRatesByEnemy[targetIndex]` | 破壊率% ÷ 100 |
| `attacker.statusEffects (MindEye)` | `damageContext.selectedMindEyeEffects` | power × 100 で % 変換 |
| `attacker.statusEffects (Funnel)` | `damageBreakdown.groups['funnel'].multiplier` | `(multiplier - 1) * 100` |
| `attacker.statusEffects (AttackUp)` | `damageBreakdown.groups['buff'].contributions` | 各 contribution の value × 100 |

**chargeEffects の注意**: `damageContext` に含まれないため、turn-controller が
`damageContext` に `chargeEffects` を追加保持することが T1.3 の前提条件となる。

### EnemySetupController.getSnapshot() 取得経路（T1.2確定）

```js
// EnemySetupSnapshot の主要フィールド（ag調査確認済み）
{
  // スロット個別データ（E1/E2/E3）
  enemySlots: [{
    slotIndex: 0,
    selectedEnemyId: 13000001,     // ← enemies.json の id に一致
    selectedEnemyName: '○○',
    isManual: false,
    resistances: { element: { Fire: 1.5, Ice: 1.0, ... } },  // 属性耐性（元素のみ）
    od_rate, max_d_rate, ...
  }],
  // Legacy flat fields (E1相当)
  selectedEnemyId,
  selectedEnemyName,
  enemyCount,
  ...
}

// param_border の取得パス
const enemies = loadDamageCalculationData().enemies;
const enemy = enemies.find(e => e.id === snapshot.selectedEnemyId);
const paramBorder = enemy?.base_param?.param_border > 0
  ? enemy.base_param.param_border
  : 770;  // デフォルト（スコアアタック難易度40G35基準）
```

### UI 2カラム HTML 構造仕様（T2.1〜T2.4確定）

```html
<section class="char-popup-damage-action" data-role="char-popup-damage-action">
  <div class="char-popup-damage-action-title">...</div>
  <div class="char-popup-damage-layout" data-role="char-popup-damage-layout">

    <!-- 左カラム: 既存の倍率グループ表示（幅 ~50%） -->
    <div class="char-popup-damage-left" data-role="char-popup-damage-left">
      <!-- 既存: critical note / target breakdowns / group table をそのまま移動 -->
    </div>

    <!-- 右カラム: 計算機パネル（新規） -->
    <aside class="char-popup-damage-right" data-role="char-popup-damage-calculator">

      <!-- 上部: 攻撃者ステータス入力 -->
      <section class="char-popup-damage-calc-section" data-role="damage-calc-attacker">
        <div class="char-popup-damage-calc-heading">攻撃者</div>
        <label class="char-popup-damage-field" data-stat="role">
          <span>ロール</span>
          <select data-role="damage-calc-role">
            <option value="Attacker">Attacker</option>
            <!-- Blaster / Breaker / Buffer / Debuffer / Defender / Healer / Admiral / Rider -->
          </select>
        </label>
        <label class="char-popup-damage-field" data-stat="limitBreakCount">
          <span>凸</span>
          <input type="number" min="0" max="4" step="1" data-role="damage-calc-limit-break">
        </label>
        <div class="char-popup-damage-stat-grid" data-role="damage-calc-stats">
          <label data-stat="str"><span>力</span><input data-role="damage-calc-stat" data-stat="str"></label>
          <label data-stat="dex"><span>器用さ</span><input data-role="damage-calc-stat" data-stat="dex"></label>
          <label data-stat="wis"><span>知性</span><input data-role="damage-calc-stat" data-stat="wis"></label>
          <label data-stat="spr"><span>精神</span><input data-role="damage-calc-stat" data-stat="spr"></label>
          <label data-stat="luk"><span>運</span><input data-role="damage-calc-stat" data-stat="luk"></label>
          <label data-stat="con"><span>体力</span><input data-role="damage-calc-stat" data-stat="con"></label>
        </div>
      </section>

      <!-- 中部: 敵情報 -->
      <section class="char-popup-damage-calc-section" data-role="damage-calc-enemy">
        <div class="char-popup-damage-calc-heading">敵情報</div>
        <div class="char-popup-damage-enemy-name" data-role="damage-calc-enemy-name">（未選択）</div>
        <div class="char-popup-damage-enemy-param">
          <span>防御境界値</span>
          <output data-role="damage-calc-param-border">770</output>
        </div>
      </section>

      <!-- 下部: 計算結果 -->
      <section class="char-popup-damage-calc-section" data-role="damage-calc-result">
        <div class="char-popup-damage-calc-heading">計算結果</div>
        <div class="char-popup-damage-result-table" data-role="damage-calc-result-table">
          <div class="char-popup-damage-result-row" data-result="normal">
            <span>通常</span>
            <output data-value="min"></output>
            <output data-value="expected"></output>
            <output data-value="max"></output>
          </div>
          <div class="char-popup-damage-result-row" data-result="critical">
            <span>クリ</span>
            <output data-value="min"></output>
            <output data-value="expected"></output>
            <output data-value="max"></output>
          </div>
        </div>
      </section>

    </aside>
  </div>
</section>
```

**命名方針**: 既存の `char-popup-damage-*` に準拠。JS操作用は `data-role="damage-calc-*"`、stat識別は `data-stat="str"` で分離。結果値は `<output>` 要素（`data-value="min|expected|max"`）。

---

## WBS タスク一覧（更新）

### 🔴 Phase 1: データ基盤

#### T1.1: ステータス入力スキーマの定義 ✅ 机上設計完了
- 型定義: `AttackerStatsInput`（上記参照）
- role 別デフォルトステータステーブル（上記参照）
- `resolveDefaultStats(role, limitBreakCount)` の関数シグネチャ確定

#### T1.2: 敵ステータス取得アダプタ ✅ 机上設計完了
- `DamageCalculatorEnemyAdapter` 型定義（上記参照）
- `EnemySetupController.getSnapshot()` → `selectedEnemyId` → `enemies.json` → `param_border` の取得パス確定
- **v1 制約**: `resistances` は空（武器耐性データが enemies.json に存在しない）

#### T1.3: DamageInputContext 組み立て関数 ✅ 机上設計完了
- `buildDamageCalculationInput()` シグネチャ確定（上記参照）
- **前提条件**: `chargeEffects` を `damageContext` に追加保持するよう turn-controller を修正する必要がある

---

### 🟡 Phase 2: UI 実装

#### T2.1: 威力詳細タブのレイアウト変更 ✅ 機上設計完了
- 2カラム構造確定（上記参照）

#### T2.2: 攻撃者ステータス入力UI ✅ 机上設計完了
- role select、凸数、6ステータス入力フォーム（上記参照）

#### T2.3: 敵ステータス表示エリア ✅ 机上設計完了
- 敵名・param_border 表示（上記参照）

#### T2.4: 計算結果表示エリア ✅ 机上設計完了
- 通常・クリ 最小/期待/最大 の `<output>` 要素（上記参照）

#### T2.5: CSS スタイリング
- `.char-popup-damage-layout`（flex/grid 2カラム）
- `.char-popup-damage-stat-grid`（6ステータスのグリッド）
- `.char-popup-damage-result-table`（最小/期待/最大 の3列）

---

### 🟢 Phase 3: 計算連携

#### T3.0: turn-controller に chargeEffects を damageContext へ追加（前提条件）
- `buildDamageCalculationContext()` の入力に `chargeEffects` を追加
- turn-controller で `chargeEffects` を damageContext に渡す

#### T3.1: `calculateDamage` の呼び出し接続
- `buildDamageCalculationInput()` 実装
- `resolveDefaultStats()` 実装
- 入力変更時の debounce 再計算（300ms）

#### T3.2: `loadDamageCalculationData()` のキャッシュ
- 初回のみ読み込み、以降はキャッシュ（`HbrDataStore` 既存機構と整合）

---

### 🔵 Phase 4: テスト

#### T4.1: input builder のユニットテスト
- `buildDamageCalculationInput()` の変換ロジックカバレッジ
- `resolveDefaultStats()` の role 別デフォルト値テスト（全 role）

#### T4.2: Playwright E2E テストの追加
- `tests/e2e/damage-calculator-integration.spec.js`

---

## 進捗状況

| タスクID | 分類 | 内容 | 状況 |
|:---|:---|:---|:---|
| T1.1 | Data | ステータス入力スキーマ定義 | ✅ 机上設計完了 |
| T1.2 | Data | 敵ステータス取得アダプタ | ✅ 机上設計完了 |
| T1.3 | Data | DamageInputContext 組み立て関数 | ✅ 机上設計完了 |
| T2.1 | UI | 威力詳細タブ 2カラム化 | ✅ 机上設計完了 |
| T2.2 | UI | 攻撃者ステータス入力フォーム | ✅ 机上設計完了 |
| T2.3 | UI | 敵ステータス表示エリア | ✅ 机上設計完了 |
| T2.4 | UI | 計算結果表示エリア | ✅ 机上設計完了 |
| T2.5 | UI | CSS スタイリング | 未着手 |
| T3.0 | Logic | turn-controller に chargeEffects 追加 | 未着手（T3.1の前提） |
| T3.1 | Logic | calculateDamage 呼び出し接続 | 未着手 |
| T3.2 | Logic | JSON データキャッシュ | 未着手 |
| T4.1 | Test | input builder ユニットテスト | 未着手 |
| T4.2 | Test | E2E テスト追加 | 未着手 |

---

## 参照ドキュメント

- `docs/active/damage_calculator_context_mapping.md` — damageContext フィールドマッピング詳細分析
- `docs/calc/porting_design_guideline.md` — `DamageInputContext` 型定義
- `docs/calc/phase2_design_specification.md` — バフ・デバフ集計ルール
- `docs/specs/damage_breakdown_design.md` — 威力詳細タブ現行設計
- `src/domain/damage-calculator.js` — `calculateDamage()` 実装
- `src/contracts/damage-calculation.js` — 型定義・定数
- `src/domain/damage-calculation-context.js` — damageContext 全フィールド

# ダメージ計算機 統合実装プラン

> **ステータス**: 🟢 進行中 | **ブランチ**: `feature/damage-calculator-integration` | **作成日**: 2026-06-03

## 概要

威力詳細タブに `calculateDamage()` を使った実ダメージ計算結果を追加表示する。
現在の倍率ブレイクダウン表示と並列表示し、攻撃者・敵のステータスを入力として
実際に与えるダメージ期待値・最大/最小を表示する。

---

## ゴール（確定レイアウト v2）

威力詳細タブの中身のみを2ペイン構成に改修する。左ペインは従来表示を横幅半分に縮小して維持、右ペインに計算機を新設する。

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [状態変化] [アビリティ] [パッシブ] [フィールド] [[威力詳細]]      (大元タブ／既存)   │
├────────────────────────────────┬───────────────────────────────────────────────┤
│           左ペイン (~50%)        │                右ペイン (~50%／新規)              │
│                                │                                                 │
│  ★ 従来の威力詳細をそのまま     │   [ E1 ]   [ E2 ]   [ E3 ]   (敵選択タブ)        │
│     横幅半分にして配置          │  ┌─────────────────────────────────────────┐  │
│   ・スキル名                    │  │ ダメージ・補足情報エリア（上部 約3割）     │  │
│   ・クリティカル率              │  │  ・対象の敵へのダメージ（通常/クリ）      │  │
│   ・倍率                        │  │  ・その他補足情報                         │  │
│   ・カテゴリ｜アイコン一覧      │  └─────────────────────────────────────────┘  │
│   (※中身は一切変更なし)        │  ┌────────────────────┬────────────────────┐  │
│                                │  │ 自身のパラメータ    │ 敵のパラメータ      │  │
│                                │  │ （下部7割・左）     │ （下部7割・右）     │  │
│                                │  │ ・攻撃者ステ(元値)  │ ・敵ステ(元値)      │  │
│                                │  │ ・適用バフ/デバフ値 │ ・適用バフ/デバフ値 │  │
│                                │  │                    │ ・補足記述スペース  │  │
│                                │  └────────────────────┴────────────────────┘  │
└────────────────────────────────┴───────────────────────────────────────────────┘
```

### レイアウト構成の要点

- **大元タブ（既存）**: `状態変化 / アビリティ / パッシブ / フィールド / 威力詳細` の5つ。改修は `威力詳細` タブの中身のみ。
- **左ペイン（~50%・従来そのまま）**: スキル名・クリティカル率・倍率・カテゴリ｜アイコン一覧。中身は変更せず横幅だけ半分にする。
- **右ペイン（~50%・新規）**:
  - **敵選択タブ（E1/E2/E3）**: 計算対象の敵を切り替える。Enemy Setup の使用スロット数に連動。
  - **上部（約3割）ダメージ・補足情報エリア**: 選択した敵へのダメージ計算結果（通常/クリティカル）＋補足情報。
  - **下部（約7割）パラメータエリア（左右分割）**:
    - 左: 自身のパラメータ（攻撃者ステータス元値＋適用バフ値/デバフ値）。手動入力・設定可能。
    - 右: 敵のパラメータ（敵ステータス元値＋適用バフ値/デバフ値＋補足記述スペース）。

#### レイアウト v2 設計レビュー反映（codex フィードバック + ユーザー補足）

- **レスポンシブ fallback は必須**: char detail popup は既に情報密度が高く、50/50 では左ペインの contribution block が詰まる。desktop は2ペイン、一定幅未満では縦積み（または右ペインを下に回す）。
- **攻撃者 stat 入力 state は action 単位で保持**: 敵タブ切替で入力中の攻撃者ステータスを消さない。敵タブ切替では敵依存の表示/結果だけ更新する。
- **補足記述 textarea は v1 では非永続のプレースホルダ扱い**（ユーザー補足で確定）: 中身は未定で「将来必要になったら追加できる余白」。save 対象や replay/session schema には入れない。
- **計算結果が出せない場合**は「計算不可」ではなく「敵 param 未取得」等の具体的な missing reason を表示する。
- **実装順**: ① target tab + readonly 計算結果表示 → ② 攻撃者 stat input → ③ 補足 textarea の順が安全。

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

### UI HTML 構造仕様 v2（T2.1〜T2.4確定）

レイアウト確定 v2 に基づく構造。右ペインは「E1/E2/E3 敵選択タブ + 上部ダメージ(3割) + 下部パラメータ左右分割(7割)」。

```html
<section class="char-popup-damage-action" data-role="char-popup-damage-action">
  <div class="char-popup-damage-action-title">...</div>
  <div class="char-popup-damage-layout" data-role="char-popup-damage-layout">

    <!-- ══ 左ペイン: 既存の倍率グループ表示（幅 ~50%・中身不変） ══ -->
    <div class="char-popup-damage-left" data-role="char-popup-damage-left">
      <!-- 既存: critical note / target breakdowns / group table をそのまま移動 -->
    </div>

    <!-- ══ 右ペイン: 計算機（幅 ~50%・新規） ══ -->
    <aside class="char-popup-damage-right" data-role="char-popup-damage-calculator">

      <!-- 敵選択タブ（Enemy Setup の使用スロット数に連動して E1/E2/E3 を出し分け） -->
      <div class="char-popup-damage-enemy-tabs" data-role="damage-calc-enemy-tabs" role="tablist">
        <button type="button" class="char-popup-damage-enemy-tab" data-role="damage-calc-enemy-tab" data-enemy-index="0" aria-selected="true">E1</button>
        <button type="button" class="char-popup-damage-enemy-tab" data-role="damage-calc-enemy-tab" data-enemy-index="1">E2</button>
        <button type="button" class="char-popup-damage-enemy-tab" data-role="damage-calc-enemy-tab" data-enemy-index="2">E3</button>
      </div>

      <!-- ── 上部（約3割）: ダメージ・補足情報エリア ── -->
      <section class="char-popup-damage-calc-result" data-role="damage-calc-result">
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
        <div class="char-popup-damage-result-note" data-role="damage-calc-result-note">
          <!-- その他補足情報（破壊率・対象ゲージ HP/DP など） -->
        </div>
      </section>

      <!-- ── 下部（約7割）: パラメータエリア（左右分割） ── -->
      <div class="char-popup-damage-param-area" data-role="damage-calc-param-area">

        <!-- 左: 自身のパラメータ -->
        <section class="char-popup-damage-param-self" data-role="damage-calc-attacker">
          <div class="char-popup-damage-calc-heading">自身のパラメータ</div>
          <label class="char-popup-damage-field" data-stat="role">
            <span>ロール</span>
            <select data-role="damage-calc-role"><!-- Attacker/Blaster/.../Rider --></select>
          </label>
          <label class="char-popup-damage-field" data-stat="limitBreakCount">
            <span>凸</span>
            <input type="number" min="0" max="4" step="1" data-role="damage-calc-limit-break">
          </label>
          <!-- ステータス: 元値 + バフ値 + デバフ値 の3列構成 -->
          <div class="char-popup-damage-stat-grid" data-role="damage-calc-stats">
            <div class="char-popup-damage-stat-row" data-stat="str">
              <span>力</span>
              <input data-role="damage-calc-stat-base" data-stat="str"><!-- 元値 -->
              <output data-role="damage-calc-stat-buff" data-stat="str"></output><!-- バフ値 -->
              <output data-role="damage-calc-stat-debuff" data-stat="str"></output><!-- デバフ値 -->
            </div>
            <!-- dex/wis/spr/luk/con も同形式 -->
          </div>
        </section>

        <!-- 右: 敵のパラメータ -->
        <section class="char-popup-damage-param-enemy" data-role="damage-calc-enemy">
          <div class="char-popup-damage-calc-heading">敵のパラメータ</div>
          <div class="char-popup-damage-enemy-name" data-role="damage-calc-enemy-name">（未選択）</div>
          <div class="char-popup-damage-enemy-param">
            <span>防御境界値</span>
            <output data-role="damage-calc-param-border">770</output>
          </div>
          <!-- 敵ステータス: 元値 + 適用バフ値 + デバフ値 -->
          <div class="char-popup-damage-enemy-stat-grid" data-role="damage-calc-enemy-stats">
            <!-- 敵ステータス行（元値/バフ/デバフ） -->
          </div>
          <!-- 補足記述スペース -->
          <textarea class="char-popup-damage-enemy-note" data-role="damage-calc-enemy-note" placeholder="補足メモ"></textarea>
        </section>

      </div>
    </aside>
  </div>
</section>
```

**命名方針**:
- 既存の `char-popup-damage-*` に準拠。
- JS操作用は `data-role="damage-calc-*"`、stat識別は `data-stat="str"` で分離。
- 結果値は `<output>`（`data-value="min|expected|max"`）。
- ステータスの元値は `data-role="damage-calc-stat-base"`（入力）、バフ値/デバフ値は `damage-calc-stat-buff` / `damage-calc-stat-debuff`（表示用 output）で分離。
- 敵選択タブ切替時は `data-enemy-index` で計算対象を切り替え、右ペイン全体（ダメージ・敵パラメータ）を再描画する。

**敵選択タブの出し分け**: Enemy Setup の使用スロット数（`enemySlots` のうち `selectedEnemyId !== null` の数）に応じてタブを出す。単体敵時は1タブのみ表示。
- **内部キー / 表示ラベルの分離（ユーザー補足で確定）**: タブの内部キーは `targetEnemyIndex` を正本とする。配列 index ではなく `targetEnemyIndex` 一致で参照する。
- 表示ラベルは **敵名が定義されていれば敵名**（`targetBreakdown.targetLabel`）を使い、**未定義時のみ E1/E2/E3 にフォールバック**する。
- **未使用スロットは出さない**。`dead/unused` の表示状態は区別する。
- `targetBreakdown` が存在しない敵を選んだ場合は disabled / empty 表示にする（calculateDamage 入力不足時は「敵 param 未取得」等の具体的な missing reason を出す）。

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

#### T2.1: 威力詳細タブのレイアウト変更 ✅ 机上設計完了
- 左ペイン（既存・横幅半分）＋右ペイン（新規計算機）の2ペイン構造（v2、上記参照）
- 左ペインは既存 critical note / target breakdowns / group table を中身不変で移設

#### T2.2: 右ペイン上部 ダメージ・補足情報エリア + 敵選択タブ ✅ 机上設計完了
- E1/E2/E3 敵選択タブ（使用スロット数に連動）
- 通常・クリ 最小/期待/最大 の `<output>`、補足情報欄

#### T2.3: 右ペイン下部 自身のパラメータ（左） ✅ 机上設計完了
- role select、凸数、6ステータス（元値入力＋バフ値/デバフ値表示の3列）

#### T2.4: 右ペイン下部 敵のパラメータ（右） ✅ 机上設計完了
- 敵名・param_border、敵ステータス（元値＋バフ/デバフ、stat delta レーン）、補足記述スペース（textarea）
- textarea は v1 では非永続プレースホルダ（save/replay/session schema に入れない）

#### T2.5: CSS スタイリング
- `.char-popup-damage-layout`（左右2ペイン flex、各 ~50%・狭幅で縦積み）
- `.char-popup-damage-right`（敵タブ + 上部3割/下部7割の縦配分）
- `.char-popup-damage-enemy-tabs` / `.char-popup-damage-enemy-tab`（敵選択タブ・選択状態）
- `.char-popup-damage-param-area`（下部7割の左右2分割）
- `.char-popup-damage-stat-grid` / `.char-popup-damage-stat-row`（元値/バフ/デバフの3列）
- `.char-popup-damage-result-table`（最小/期待/最大 の3列）
- `.char-popup-damage-enemy-note`（補足記述 textarea）

---

### 🟢 Phase 3: 計算連携

#### T3.0: turn-controller に chargeEffects を damageContext へ追加（前提条件）
- `buildDamageCalculationContext()` の入力に `chargeEffects` を追加
- turn-controller で `chargeEffects` を damageContext に渡す

#### T3.1: `calculateDamage` の呼び出し接続
- `buildDamageCalculationInput()` 実装
- `resolveDefaultStats()` 実装
- 入力変更時の debounce 再計算（300ms）
- **敵選択タブ切替時**に対象敵を `targetEnemyIndex` 一致で切り替えて再計算・敵依存表示のみ再描画（攻撃者 stat 入力 state は保持）
- 左ペイン倍率表示は `damageContext.damageBreakdown.targetBreakdowns[]` を `targetEnemyIndex` 一致で参照
- 右ペイン計算結果は targetBreakdowns だけでは不足。`paramBorder / isHpTarget / destructionRate / resistances / 敵 status・採用済み debuff` を enemyAdapter または追加 damageContext field から取得する必要あり
- `effectiveDamageRatesByEnemy` / `enemyAllAbilityDownByEnemy` は `targetEnemyIndex` keyed。タブ切替時は同じ index で参照（targetBreakdown=表示倍率、keyed maps=計算入力 という役割差を保つ）

#### T3.2: バフ値/デバフ値の表示連携（v2新規・データソース確定）
- **正本の区別（重要・ユーザー補足で確定）**: 右ペインの「バフ値/デバフ値」は **ステータス実数差分（stat delta）** を指す。例: `STR 650 (+25)` / `DEX 670 (+50)`。
  - これは **`damageBreakdown` contribution（ダメージ倍率カテゴリ）とは別物**。倍率カテゴリの値を流用してはいけない。
  - データソースは **stat base / resolved / delta の正本**（実効ステータス計算経路）から取得する。`damageBreakdown` からは取らない。
  - `damageBreakdown` contribution = 威力カテゴリ表示の正本（左ペイン）。右ペイン stat delta = 能力値表示の正本（別レーン）。両者を混同しない。
- 自身パラメータ: `元値（base）/ バフ値（+delta）/ 最終値（resolved）` を表示。delta は実効ステータスから base を引いて算出。
- 敵パラメータ: 敵ステータス元値＋適用デバフによる実数差分（同じく stat delta レーン）。AllAbilityDown 等の能力値側補正もこちらのレーンで表現する。
- 元値（手動入力）と delta/最終値（自動算出）を視覚的に分離する。

#### T3.3: `loadDamageCalculationData()` のキャッシュ
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
| T2.1 | UI | 威力詳細タブ 2ペイン化（左既存/右計算機） | ✅ 机上設計完了 |
| T2.2 | UI | 右ペイン上部 ダメージ+敵選択タブ(E1/E2/E3) | ✅ 机上設計完了 |
| T2.3 | UI | 右ペイン下部 自身パラメータ（元値+バフ/デバフ） | ✅ 机上設計完了 |
| T2.4 | UI | 右ペイン下部 敵パラメータ+補足記述 | ✅ 机上設計完了 |
| T2.5 | UI | CSS スタイリング（2ペイン+3割/7割+左右分割） | 未着手 |
| T3.0 | Logic | turn-controller に chargeEffects 追加 | 未着手（T3.1の前提） |
| T3.1 | Logic | calculateDamage 呼び出し接続＋敵タブ切替再計算 | 未着手 |
| T3.2 | Logic | バフ値/デバフ値の表示連携（v2新規） | 未着手 |
| T3.3 | Logic | JSON データキャッシュ | 未着手 |
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

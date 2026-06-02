# ダメージ計算機（hbr_calc）との統合インターフェース設計書

本ドキュメントは、`hbr_battle_simulator`（JS/TS）の戦闘シミュレーション状態と、`hbr_calc` から移植されるダメージ計算モジュールを接続するための、データインターフェースおよび連携設計仕様書です。

---

## 1. 結合の全体像とアプローチ

ダメージ計算機をシミュレータに統合するにあたり、以下の設計原則に基づき結合を行います。

1. **JS/TSモジュールとしての内蔵**:
   - `hbr_calc` で検証済みの数式ロジックをJS/TSモジュール（例: `src/domain/damage-calculator.js`）として移植・内蔵します。これにより、外部サーバーを必要とせず、ブラウザ上でゼロ遅延かつオフラインで動作します。
2. **未加工ステータスの引き渡し（計算機の責務）**:
   - シミュレータ側でバフ・デバフを単純に合算するのではなく、適用されているバフ・デバフの「生データ（使用者ステータスやバフ定義）」をそのまま計算機に渡します。
   - 計算機側で、**使用者の知性・運に応じた効果量スケーリング**や、**重複上限ルール（同カテゴリ上位2枠まで適用等）**を厳密に評価・計算します。

---

## 2. 接続インターフェース定義 (JSDoc / TypeScript)

シミュレータ側で定義されている `toCharacterSnapshot` などの既存データ構造をベースにし、将来的に `DamageCalculationHook` を具現化するための型定義です。

### ① 入力パラメータ (`DamageInput`)

ダメージ計算に必要な情報を定義します。シミュレータ側で各能力値（STR/DEX等）を管理していない場合（代表的な計算ケース）と、手動でステータスを入力した場合（精緻な計算ケース）の双方に対応するため、**詳細ステータスはオプション**として設計されています。

```typescript
/**
 * ダメージ計算に必要なコンテキストデータ
 */
interface DamageInput {
  /** 攻撃側のキャラクタースナップショット */
  attacker: {
    characterId: string;
    characterName: string;
    styleId: number;
    /** 攻撃者のレベル。省略時はレアリティ最大値（例: SSなら120）を仮定 */
    level?: number;
    /** 限界突破段階 (0〜4凸)。ステータス自動補完の精度を担保するために強く推奨 (デフォルト: 0) */
    limitBreakCount?: number;
    /** 
     * 精緻な計算ケース用: 力、器用さ、知性、精神、運、体力の現ステータス（装備・宝珠反映済）
     * 省略された場合、計算機側で最大育成・最上位テンプレート装備および限界突破数（limitBreakCount）からステータスを自動引き当てます。
     */
    stats?: {
      str: number;
      dex: number;
      wis: number;
      spr: number;
      luk: number;
      con: number;
    };
    /** 現在付与されているバフの生リスト */
    statusEffects: Array<{
      statusType: string;       // 例: 'AttackUp', 'CritDamageUp', 'Charge'
      power?: number;           // 基礎効果量 (%)
      elements?: string[];      // 属性限定バフの場合の対象属性 (例: ['Fire'])
      providerWis?: number;     // バフ使用者の知性。省略された場合は代表値を使用。
      sourceSkillId?: number;   // 発動元のスキルID
    }>;
    /** 現在のトークン所持数 */
    tokenCount: number;
  };

  /** ターゲット（敵）の情報 */
  defender: {
    enemyId: number;
    enemyName: string;
    /** 
     * 精緻な計算ケース用: 敵の防御ステータス境界 (enemies.json の base_param.param_border)
     * 省略された場合、計算機側で enemyId に基づいてマスタからデフォルトの境界値を引き当てます。
     */
    paramBorder?: number;
    /** ターゲットしている敵の現在の被ダメージ倍率（破壊率。例: 2.50 = 250%） */
    destructionRate: number;
    /** HPゲージを対象とするか (falseの場合はDPゲージへのダメージ) */
    isHpTarget: boolean;
    /** ターゲットしている敵の耐性・弱点マップ (例: { 'Slash': 1.5, 'Fire': 0.5 }) */
    resistances: Record<string, number>;
    /** 敵に付与されているデバフの生リスト */
    statusEffects: Array<{
      statusType: string;       // 例: 'DefenseDown', 'Fragile', 'ElementResistDown'
      power?: number;           // 基礎効果量 (%)
      elements?: string[];      // 属性限定デバフの場合の対象属性
      providerWisOrLuk?: number;// デバフ使用者の知性または運。省略時は代表値を使用。
    }>;
  };

  /** 使用するスキルの情報 (skills.json の構造) */
  skill: {
    skillId: number;
    name: string;
    /** スキルパーツごとの威力・適用パラメータ重み・特効 */
    parts: Array<{
      power: number[]; // 基礎威力 [min, max]
      /** 依存ステータスの重み比率 (例: { str: 1, dex: 1 }) */
      parameters: Record<string, number>;
      /** 特効倍率 (例: { hp: 1.5, dp: 1.0 }) */
      multipliers: {
        hp: number;
        dp: number;
        dr: number;
      };
    }>;
  };

  /** 現在展開されている属性フィールド/ゾーン (例: 'FireZone', 'None') */
  activeZone: string;
}
```

---

## 3. 「代表的な計算」と「精緻な計算」の切り替え設計

シミュレータのUIや設定状態に応じて、以下の2つのモードで計算を切り替えます。

### 🅰️ 代表的な計算ケース (デフォルト/簡易モード)
シミュレータ側でキャラクターの装備や能力値を細かく設定していない場合のケースです。
* **動作仕様**:
  - `attacker.stats` を `undefined` として計算機に渡します。
  - 計算機は、**「キャラクターレベル、スタイルレベル、アビリティツリーはすべて最大値まで育成済み（SSスタイルの場合Lv120）」および「最上位ランクの推奨装備（ブースターやアクセ等）を装着済み」**と仮定します。
  - そのうえで、ユーザーが指定した限界突破数（`limitBreakCount`、0〜4）によるステータス上昇効果（`styles.json` の `limit_break` データを参照）を加算し、最終的な代表ステータス値（STR/DEX/WIS/LUCなど）を自動算出します。
  - デバフ使用者の知性・運（`providerWisOrLuk`）なども同様に、最大育成＋指定限界突破数から自動補完されます。
  - 敵の `paramBorder` がない場合も、`enemies.json` から対象敵のデフォルトの境界値を自動参照します。
* **メリット**: シミュレータ側は「限界突破段階（凸数）」を選択するだけで、一般的なやり込み環境に即した高精度なダメージ期待値を出すことができます。

### 🅱️ 精緻な計算ケース (詳細カスタマイズモード)
ユーザーがシミュレータ上で装備、ブレスレット、宝珠、アビリティ、転生回数などを細かく設定し、ゲーム内の実ステータスと1円単位でダメージを一致させたい場合のケースです。
* **動作仕様**:
  - 計算済みの正確なSTR/DEX/WIS/LUCなどを `attacker.stats` に格納して計算機に渡します。
  - 計算機はマスタからの自動補完をスキップし、渡された実数値をそのまま使用して厳密なダメージ計算を行います。
* **メリット**: 高度なスコアアタック（スコアタ）調整や個別環境の完全再現に対応できます。

### ② 出力パラメータ (`DamageResult`)

計算結果は期待値（平均）と最小・最大値（乱数±10%）、および UI（ブレイクダウンパネル）に渡すための内訳データを含みます。

```typescript
interface DamageResult {
  /** 通常ヒット時のダメージ期待値 */
  normal: {
    expected: number; // Y59相当
    min: number;      // 期待値の90% (Z59)
    max: number;      // 期待値の110% (AA59)
  };
  /** クリティカルヒット時のダメージ期待値 */
  critical: {
    expected: number; // AB59相当
    min: number;      // AC59
    max: number;      // AD59
  };
  /** 威力増加ブレイクダウンパネル (damage_breakdown_design.md) 表示用の積算内訳 */
  breakdown: {
    baseDamageNormal: number;    // 通常時基礎ダメージ (W59)
    baseDamageCrit: number;      // クリティカル時基礎ダメージ (X59)
    buffMultiplier: number;      // 攻撃バフ枠倍率 (積算用、例: 2.10)
    critMindeyeMultiplier: number; // クリティカル・心眼枠倍率 (例: 2.25)
    funnelMultiplier: number;    // 連撃枠倍率 (例: 1.20)
    debuffMultiplier: number;    // 敵デバフ・脆弱枠倍率 (例: 1.80)
    resistMultiplier: number;    // 属性耐性・ゾーン枠倍率 (例: 1.50)
    affinityMultiplier: number;  // 武器属性相性枠倍率 (例: 1.50)
    tokenMultiplier: number;     // トークン・固有パッシブ枠倍率 (例: 1.30)
  };
}
```

---

## 3. UI（ブレイクダウンパネル）とのデータ連携

`docs/specs/damage_breakdown_design.md` にて定義されているUIのグループ分けと、計算結果 `breakdown` のマッピングは以下の通り接続されます。

1. **攻撃バフ枠 (`buff`)** -> `breakdown.buffMultiplier`
   - 内訳表示対象: `attacker.statusEffects` のうち `AttackUp` や `Charge` に該当するもの。
2. **クリティカル・心眼枠 (`crit-mindeye`)** -> `breakdown.critMindeyeMultiplier`
   - 内訳表示対象: `CritDamageUp` や `MindEye` (心眼)。
3. **連撃バフ枠 (`funnel`)** -> `breakdown.funnelMultiplier`
   - 内訳表示対象: `Funnel` (連撃)。
4. **トークン・固有枠 (`token-passive`)** -> `breakdown.tokenMultiplier`
   - 内訳表示対象: キャラクターのアビリティ効果、トークン消費・所持威力アップ。
5. **敵デバフ・脆弱枠 (`debuff`)** -> `breakdown.debuffMultiplier`
   - 内訳表示対象: `defender.statusEffects` の `DefenseDown` (防御ダウン) や `Fragile` (脆弱)。
6. **属性耐性・ゾーン枠 (`resist-down`)** -> `breakdown.resistMultiplier`
   - 内訳表示対象: 属性耐性ダウンおよび展開中の `activeZone` 効果。
7. **基本相性枠 (`affinity`)** -> `breakdown.affinityMultiplier`
   - 内訳表示対象: `defender.resistances` に基づく基本相性。

---

## 4. 実装イメージ

シミュレータ側で `DamageCalculationHook` を使って計算モジュールを呼び出す際のコードイメージです。

```javascript
import { calculateDamage } from '../domain/damage-calculator.js';

export const damageCalculationHookImpl = {
  /**
   * @param {Object} input
   * @param {CharacterSnapshot} input.attacker
   * @param {EnemyState} input.defender
   * @param {Object} input.skill
   * @param {string} input.activeZone
   * @returns {DamageResult}
   */
  calculate({ attacker, defender, skill, activeZone }) {
    // 1. シミュレータ状態を DamageInput 構造に変換
    const input = {
      attacker: {
        characterId: attacker.characterId,
        characterName: attacker.characterName,
        stats: attacker.stats, // キャラクターのステータス
        statusEffects: attacker.statusEffects, // 生のバフ一覧
        tokenCount: attacker.tokenState?.current ?? 0,
      },
      defender: {
        enemyId: defender.enemyId,
        enemyName: defender.enemyName,
        paramBorder: defender.paramBorder, // 敵の防御ステータス境界
        destructionRate: defender.destructionRate ?? 1.0,
        isHpTarget: defender.isHpTarget ?? true,
        resistances: defender.resistances ?? {},
        statusEffects: defender.statusEffects ?? [], // 生のデバフ一覧
      },
      skill: {
        skillId: skill.skillId,
        name: skill.name,
        parts: skill.parts,
      },
      activeZone: activeZone ?? 'None',
    };

    // 2. 移植されたダメージ計算エンジンを呼び出し
    return calculateDamage(input);
  }
};
```

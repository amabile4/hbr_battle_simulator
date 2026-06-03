# フェーズ2 設計仕様書: バフ・デバフ動的解決器と重複上限ルール

本ドキュメントは、グラフィカル戦闘シミュレータ `hbr_battle_simulator` とダメージ計算エンジン `hbr_calc` の結合における、バフ・デバフ効果量の動的解決（知性・運スケーリング）およびカテゴリ別の重複上限適用ロジックの詳細仕様を定義します。

---

## 1. バフ・デバフ効果量の動的解決（知性・運スケーリング）

シミュレータからバフ・デバフの「生データ」が渡された際、計算機は以下の計算式に従って動的に効果量を算出します。

### ① スケーリング計算モデル
使用者のステータス（知性 `wis` または 運 `luk`）を $X$ とし、スキルに定義されたパラメータマスタ（`skills.json` 内）を以下のようにマッピングします。

- $T$ : 閾値（`diff_for_max`）
- $V_{min}$ : 下限効果量（`power[0]`）
- $V_{max}$ : 上限効果量（`power[1]`）
- $G_{min}$ : 下限成長率（`growth[0]`, デフォルト: `0.03`）
- $G_{max}$ : 上限成長率（`growth[1]`, デフォルト: `0.02`）
- $L$ : スキルレベル（デフォルト: 10）
- $O$ : 宝珠強化レベル（デフォルト: 0）

#### スキルレベル・宝珠レベル補正適用後の限界値：
宝珠強化による効果量上昇率を $V_{orb} = 0.04 \times O$ とします（宝珠レベル1ごとに上限効果の4%分が加算されます）。
また、宝珠強化による閾値上昇を $T_{orb} = 60 \times O$ とします。

$$V_{min, L} = V_{min} \times (1 + G_{min} \times (L - 1))$$
$$V_{max, L} = V_{max} \times (1 + G_{max} \times (L - 1)) \times (1 + V_{orb})$$
$$T_{final} = T + T_{orb}$$

#### ステータスによる線形補間式：
使用者の依存ステータス $X$（知性または運）と、敵の対応ステータス（またはデバフの場合は対象の精神など、バフの場合は単純に使用者のステータス値）に基づき、効果量 $Effect$ を算出します。

$$
Effect = 
\begin{cases} 
V_{max, L} & (X \ge T_{final}) \\
\frac{V_{max, L} - V_{min, L}}{T_{final}} \times X + V_{min, L} & (0 \le X < T_{final}) \\
V_{min, L} & (X < 0)
\end{cases}
$$

- **境界条件の補足**: $X = T_{final}$ のとき、線形補間式は $V_{max, L}$ に収束します。また、$X < 0$ のときは下限 $V_{min, L}$ にクランプされます。

*注：ステータス $X$ は、`skills.json` の `parts[].parameters` で重みが `1` となっている能力値（通常はバフは `wis`、デバフは `wis` または `luk`）を使用します。*

---

## 2. カテゴリ別の重複上限（集約ルール）

複数のバフ・デバフが適用されている場合、ゲーム仕様に準拠した重複制限を適用します。

### ① 攻撃バフ・属性バフ枠の集約
サポートされているバフの種類（`statusType`）は、`AttackUp`（攻撃力アップ）、`Charge`（チャージバフ）、`ElementAttackUp`（属性攻撃バフ）、`MindEye`（心眼）です。Field / Zone も公式カテゴリ通りこの攻撃バフ枠へ加算します。
- **通常発動バフ**: スキル名に `[単独発動]` が含まれないバフ。**効果量の高い上位2枠の合計**を適用します。
- **単独発動バフ**: スキル名に `[単独発動]` が含まれるバフ。**最大効果量の1枠のみ**を適用します。
- **最終適用バフ**: `通常発動バフの上位2枠合計` と `単独発動バフの最大1枠` のうち、**効果量の高い方**を最終的なバフ倍率（`buffMultiplier`）として適用します。

### ② デバフ枠の集約
以下のカテゴリごとに独立して重複上限を適用し、最後にそれぞれの集約結果をすべて加算して最終デバフ倍率（`debuffMultiplier`）とします。

1. **通常防御デバフ**: スキル名に `[単独発動]` や `属性` `脆弱` が含まれない通常の防御デバフ。**上位2枠の合計**を適用。
2. **永続通常防御デバフ**: 効果時間制限がない（永続タイプの）防御デバフ。**上位2枠の合計**を適用。
3. **属性防御デバフ**: 特定の属性（火・氷など）に対する防御デバフ。`ElementResistDown` もここに分類されます。**上位2枠の合計**を適用。
4. **永続属性防御デバフ**: 永続タイプの属性防御デバフ。**上位2枠の合計**を適用。
5. **DP防御デバフ**: DPゲージ対象の防御デバフ（例: "ほてるししむら(DP防御)"）。**制限なしで全て加算**。

*注：TS 版では category は必須プロパティです。Python 版の classify_debuff() / classify_fragile() によるスキル名文字列推定分類は TypeScript 版では廃止されており、呼び出し側が必ずカテゴリを明示して渡す契約となっています（phase3_go_decision.md C3 参照）。*

### ③ 脆弱デバフ枠の集約
脆弱デバフ（`statusType == 'Fragile'`）は、防御デバフと同じ防御カテゴリ内の加算枠として集約され、`debuffMultiplier` に含まれます。互換用の `vulnerabilityMultiplier` は積算には使いません。
1. **通常脆弱デバフ**: 弱点攻撃時にのみ適用される脆弱デバフ。**上位2枠の合計**を適用。ただし、攻撃の武器属性・エレメント属性が敵の弱点属性（ゾーン込みの耐性倍率が `1.0` を超えるもの）に合致する場合のみ有効。非弱点属性攻撃時は `0%` として扱います。
2. **永続通常脆弱デバフ**: 常時適用される永続タイプの脆弱デバフ。**上位2枠の合計**を適用（弱点判定に関わらず常時有効）。

### ④ クリティカル・連撃枠
- **クリティカル枠** (`critMindeyeMultiplier`): クリティカル時の基礎ダメージ倍率 `1.5` (150%) に対し、追加のクリティカル威力バフ（`CritDamageUp` / `CritBuff`）を加算した倍率補正 $\frac{1.5 + CritBuff}{1.5}$ です。心眼は公式カテゴリ通り攻撃バフ枠へ加算します。
- **通常攻撃のクリティカル時補正**: 通常攻撃のみ、クリティカル下限補間に $E/2$ を使用します（`e_crit = e / 2`）。
- **連撃枠** (`funnelMultiplier`): 連撃バフ（`Funnel`）の効果量は単純加算され、乗算されます（例: `Funnel: 20%` の場合、連撃倍率 `1.20`）。

---

## 3. 接続インターフェース定義 (JSDoc / TypeScript)

### ① 入力スナップショット (`DamageInputContext`)
```typescript
interface DamageInputContext {
  attacker: {
    characterId: string;
    characterName: string;
    styleId: number;
    level?: number;             // デフォルト: 120
    limitBreakCount?: number;   // 限界突破 (0〜4凸), デフォルト: 0
    /**
     * abilitySprCorrection を正式プロパティとする。
     * as48 (旧エイリアス) の入力は入力正規化レイヤーで abilitySprCorrection ?? as48 ?? 0 として吸収し、
     * 両方指定時は abilitySprCorrection を優先する。TS版の公開API型定義には as48 を含めない。
     */
    abilitySprCorrection?: number; // アビリティ等による精神補正, デフォルト: 0.0
    /** 
     * tokenCount と tokenRatio は両対応。 
     * tokenRatio の指定があれば優先。なければ tokenCount * 0.10 に換算されます。
     */
    tokenCount?: number;        // トークン個数 (例: 3)
    tokenRatio?: number;        // トークン倍率 (例: 0.30)
    stats: {                    // 実ステータス値（必須契約）
      str: number;
      dex: number;
      wis: number;
      spr: number;
      luk: number;
      con: number;
    };
    statusEffects: Array<{
      statusType: 'AttackUp' | 'CritDamageUp' | 'CritBuff' | 'MindEye' | 'Charge' | 'Funnel' | 'ElementAttackUp';
      skillName: string;
      power?: number;           // 指定がある場合はこれを優先
      providerWis?: number;     // バフ使用者の知性
      sourceSkillId?: number;   // 解決のためのスキルID
      skillLevel?: number;      // デフォルト: 10
      orbLevel?: number;        // デフォルト: 0
    }>;
  };

  defender: {
    enemyId: number;
    enemyName: string;
    paramBorder?: number;
    destructionRate: number;    // 破壊率 (倍率表記。例: 2.50 = 250% を指し、250ではない)
    isHpTarget: boolean;        // HPゲージ対象ならtrue, DPならfalse
    resistances: Record<string, number>; // 属性・武器耐性マップ
    passiveDefenseDown?: number; // アビリティ等による常時パッシブデバフ (デフォルト: 0.0)
    statusEffects: Array<
      {
        statusType: 'DefenseDown' | 'ElementResistDown';
        skillName: string;
        category: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense'; // 正規化カテゴリ（必須）
        power?: number;
        providerWisOrLuk?: number;
        sourceSkillId?: number;
        skillLevel?: number;
        orbLevel?: number;
      } | {
        statusType: 'Fragile';
        skillName: string;
        category: 'NormalFragile' | 'PermFragile'; // 正規化カテゴリ（必須）
        power?: number;
        providerWisOrLuk?: number;
        sourceSkillId?: number;
        skillLevel?: number;
        orbLevel?: number;
      }
    >;
  };

  skill: {
    skillId: number | null;
    // skills.json.parts から解決する場合は必ず設定すること。
    // 通常攻撃・追撃も skills.json に実IDが存在するため、判明している場合は必須。
    // null が許容されるのは skills.json に存在しないカスタムスキルや、
    // name のみで解決するフォールバックを明示的に使用するケースに限定する。
    name: string;
    level?: number;
  };
  activeZone: 'None' | 'FireZone' | 'IceZone' | 'ThunderZone' | 'DarkZone' | 'LightZone'; // 展開中のゾーン
}
```

### ② 出力期待値 (`DamageResult`)
```typescript
interface DamageResult {
  normal: {
    expected: number;           // ※ ヒット数を追加乗算しない「スキル単発の合計期待値」です。
    min: number;
    max: number;
  };
  critical: {
    expected: number;
    min: number;
    max: number;
  };
  breakdown: {
    baseDamageNormal: number;
    baseDamageCrit: number;
    buffMultiplier: number;        // バフ・属性バフ・チャージ等の合計乗算値
    critMindeyeMultiplier: number; // クリティカル・心眼の合計倍率
    debuffMultiplier: number;      // デバフ枠（通常・永続・属性・DPなど）の乗算値
    vulnerabilityMultiplier: number; // 脆弱枠（通常脆弱・永続脆弱）の乗算値
    resistMultiplier: number;      // ゾーン等を含む属性耐性の乗算値
    affinityMultiplier: number;    // 武器属性相性の乗算値
    tokenMultiplier: number;       // トークン乗算値
    funnelMultiplier: number;      // 連撃枠の乗算値
    /** 
     * サポートされていないstatusTypeが含まれていた場合、
     * サイレントドロップせずこのリストに入ります。
     */
    ignoredEffects: Array<{
      statusType: string;
      skillName: string;
      side: 'attacker' | 'defender' | 'context';
    }>;
  };
}
```

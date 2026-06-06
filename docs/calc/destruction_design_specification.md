# 破壊率設計仕様書: 破壊率計算エンジンと入出力スキーマ

本ドキュメントは、HBRにおける破壊率（Destruction Rate）の計算を実装するための、入力データコンテキストおよび出力データの構造仕様を定義するものです。

---

## 1. 接続インターフェース定義

### ① 入力コンテキスト (`DestructionInputContext`)
シミュレーターおよびテスト実行環境から、以下の形式で破壊率計算エンジンに入力データが渡されます。

```typescript
interface DestructionInputContext {
  attacker: {
    characterId: string;
    styleId: number;
    limitBreakCount?: number;   // 限界突破 (0〜4凸), デフォルト: 0
    accessories?: Array<'BlastPierce' | 'None' | string>; // 装備アクセサリ（ブラストピアス等）
    accessoryDestructionRateBonus?: number; // 【新規】アクセサリーによる破壊率上昇量ボーナス値（例: 0.15 = +15%）
                                            // 未指定の場合は accessories 配列から自動解決（'BlastPierce' -> 0.15）
    resonanceDestructionRateBonus?: number; // 【新規】共鳴アビリティによる破壊率上昇量ボーナス（例: 0.10 = +10%）
    destructionLimitExceedBonus?: number;   // 【新規】超ブレイク・強ブレイク等の上限超越効果による破壊上限の追加加算値（例: 1.0 = +100%）
    statusEffects: Array<{
      statusType: 'DestructionUp'; // 破壊率上昇バフ
      skillName: string;
      power?: number;           // 固定値指定がある場合はこれを優先
      providerWis?: number;     // バフ使用者の知性（動的解決用）
      sourceSkillId?: number;   // 解決のためのスキルID
      skillLevel?: number;      // デフォルト: 10
      orbLevel?: number;        // デフォルト: 0
    }>;
  };

  defender: {
    enemyId: number;
    enemyName: string;
    destructionRate: number;    // 攻撃前の実際の破壊率（倍率表記。例: 1.0 = 100%）
    destructionLimit?: number;  // 破壊上限（未指定の場合はマスタから引く。スプレッドシートの AK10 相当）
    dp: number;                 // 攻撃開始時の敵の残りDP値（ブレイク判定用。スプレッドシートの BE262/AO11 相当）
    destructionResist?: number; // 敵の破壊率耐性（倍率表記。デフォルト: 0.0。スプレッドシートの AL10 相当）
    destructionMultiplier?: number; // 敵の被破壊率倍率（倍率表記。デフォルト: 1.0。スプレッドシートの BD29 相当）
  };

  skill: {
    skillId: number | null;
    name: string;
    level?: number;             // デフォルト: 10
  };

  /**
   * ダメージ計算後に得られる、各ヒットごとのダメージ情報（シミュレーション用）。
   * ダメージ計算エンジンが算出した期待値（または実ダメージ）の配列を入力します。
   */
  hits: Array<{
    damage: number;             // このヒットの与ダメージ
    isMultiHit: boolean;        // 連撃バフによる追加ヒット（追撃など）かどうか
    hitRatio: number;           // 連撃時のヒット割合（通常ヒット時は 1.0 / 総ヒット数）
  }>;
}
```

### ② 出力期待値 (`DestructionResult`)
計算完了後、エンジンは以下の形式で結果および内訳を返します。

```typescript
interface DestructionResult {
  destructionRate: number;      // 攻撃完了後の最終破壊率（倍率表記。例: 2.6905 = 269.05%）
  breakdown: {
    baseDestruction: number;       // バフ・ロール補正・アクセサリ補正・共鳴補正適用後の基本破壊率 ($D_{\text{base}}$)
    finalBaseDestruction: number;  // 最終基本破壊率（耐性適用後, $D_{\text{final\_base}}$）
    blasterCorrection: number;     // ブラスター補正（スロープ補正適用後の倍率補正。例: 2.0 = +200%）
    buffMultiplier: number;        // 破壊率バフの合計割合（例: 0.30 = +30%）
    accessoryBonus: number;        // 【新規】解決されたアクセサリーボーナス値（例: 0.15）
    resonanceBonus: number;        // 【新規】解決された共鳴アビリティボーナス値（例: 0.10）
    limitExceedBonus: number;      // 【新規】解決された破壊上限超越ボーナス値（例: 1.0）
    ignoredEffects: Array<{        // 未処理エフェクトの警告
      statusType: string;
      skillName: string;
      side: 'attacker' | 'defender' | 'context';
    }>;
  };
}
```

---

## 2. スキーマ設計上の決定事項とフォールバック

1. **ブラスター・アクセサリー補正の解決**:
   - `attacker.accessoryDestructionRateBonus` が指定されている場合、その数値をアクセサリー補正として直接使用します。
   - 未指定かつ `attacker.accessories` に `'BlastPierce'` または `'ブラストピアス'` が含まれている場合、補正値 `0.15` (+15%) が自動適用されます。
   - `styleId` からスタイルを検索し、ロールが `Blaster` の場合は補正値に `2.00` (+200%) が加算されます。
2. **共鳴アビリティの乗算枠化**:
   - 共鳴アビリティ効果は、バフ枠（`AS39`）とは独立した乗算因子 `resonanceDestructionRateBonus`（例: 10%上昇なら `0.10`）として基本破壊率計算に適用します。
3. **上限超越（超ブレイク等）の適用**:
   - `attacker.destructionLimitExceedBonus` が入力されている場合、敵固有の破壊上限値 `destructionLimit` にその値（例: 100%拡張なら `1.0`）を加算し、シミュレーション時のクランプ限界を押し上げます。
4. **破壊率上限のフォールバック**:
   - `defender.destructionLimit` が未指定の場合、`enemies.json` から敵データを引き当て、`max_d_rate / 100` を使用します。敵データが見つからない場合のデフォルトは `3.0` (300%) とします。
5. **敵の被破壊率倍率（`destructionMultiplier`）**:
   - スプレッドシートの `BD29` 相当。未指定の場合は `enemies.json` の `破壊率乗算` (または `destruction_multiplier` など) から引き当て、デフォルトは `1.0` とします。
6. **ヒット情報の入力依存性**:
   - 破壊率はDPが0（ブレイク状態）のときのみ蓄積するため、ダメージ計算と不可分です。本スキーマはダメージ計算が先に完了し、各ヒットのダメージが確定した後に呼び出される前提としています。

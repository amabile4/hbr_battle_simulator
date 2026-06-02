# Python版計算コアロジックのTypeScript移植に伴う設計・命名統一ガイドライン

本ドキュメントは、Python版ダメージ計算エンジン（`calc/damage_calc_engine.py`）をTypeScript（`hbr_battle_simulator`）へ移植するにあたり、フォルダ構成、命名規則、データ構造、接続インターフェースの流儀を統一し、grepによる相互検索やシステム統合をスムーズに行うための調査結果およびガイドラインです。

---

## 1. 移植先のフォルダ構成とファイル配置

シミュレータ（`hbr_battle_simulator`）の既存ディレクトリ構造に則り、以下のように配置を行います。

```
hbr_battle_simulator/
├── src/
│   ├── contracts/
│   │   └── damage-calculation.ts   # [NEW] 計算に関わるTS型定義・インターフェース
│   ├── domain/
│   │   └── damage-calculator.ts    # [NEW] 移植版計算エンジンのコアロジック
│   └── data/
│       └── hbr-data-store.js       # (既存) JSONマスターデータの読み込み基盤
└── tests/
    └── damage-calculator.test.ts   # [NEW] Vitestによる回帰テスト（test_cases_fixed.json を使用）
```

- **ドメインロジックの分離**: 計算処理は `src/domain/damage-calculator.ts` に純粋な関数（またはクラス）として実装し、UI層やターン進行ロジックから独立させます。
- **データローダーの統一**: JSONマスタのロード処理は、既存の `src/data/hbr-data-store.js` のキャッシュ・取得機構と統合し、二重でロードを行わないようにします。

---

## 2. 命名規則・単位・型の統一

コード検索（`grep` / `rg`）の容易性とインターフェース統合の簡和のため、命名規則およびキー名は以下のように統一します。

### ① キャラクター基本ステータス名
ゲーム内ステータスのキー名は、小文字3文字の camelCase 省略形に統一します。
- `str` : 力 (Strength)
- `dex` : 器用さ (Dexterity)
- `wis` : 知性 (Wisdom)
- `spr` : 精神 (Spirit)
- `luk` : 運 (Luck)
- `con` : 体力 (Constitution)

### ② 武器属性およびエレメント属性名
- **武器種 (Weapon Type)**:
  - `Slash`（斬） / `Stab`（突） / `Strike`（打）
  - ※ Python版の一部で `Stab` / `Pierce` の揺らぎがありましたが、マスターデータ（`styles.json`）の `type` フィールドに格納されている表記である `Slash` / `Stab` / `Strike` を正とします。
- **エレメント属性 (Element Type)**:
  - `Fire`（火） / `Ice`（氷） / `Thunder`（雷） / `Dark`（闇） / `Light`（光）
  - ※ ゾーンや属性スキルの判定では大文字小文字を区別せず、内部で `toLowerCase()` して比較します。

### ③ バフ・デバフの `statusType` 名
既存の `src/contracts/interfaces.js` に定義されているバフ・デバフのドメイン定義と完全に一致させます。

- **バフ・その他 (`SUPPORTED_BUFFS`)**:
  - `AttackUp` : 攻撃力アップ
  - `CritDamageUp` / `CritBuff` : クリティカルダメージアップ
  - `MindEye` : 心眼
  - `Charge` : チャージ
  - `Funnel` : 連撃
  - `ElementAttackUp` : 属性攻撃力アップ
- **デバフ (`SUPPORTED_DEBUFFS`)**:
  - `DefenseDown` : 防御力ダウン
  - `ElementResistDown` : 属性防御力ダウン
  - `Fragile` : 脆弱デバフ

### ④ デバフおよび脆弱の正規化カテゴリ (`category`)
重複上限ルール（上位2枠適用やDP防御の全加算など）を適用するための分類キー名です。

- **防御デバフカテゴリ**:
  - `NormalDefense` : 通常防御デバフ
  - `PermDefense` : 永続通常防御デバフ
  - `ElementDefense` : 属性防御デバフ
  - `PermElementDefense` : 永続属性防御デバフ
  - `DPDefense` : DP防御デバフ
- **脆弱デバフカテゴリ**:
  - `NormalFragile` : 通常脆弱デバフ（弱点時のみ有効）
  - `PermFragile` : 永続通常脆弱デバフ（常時有効）

---

## 3. マスターデータ (JSON) 参照の統合

Python版では `seraphdb_json/` ディレクトリのJSONを参照していましたが、移植版ではプロジェクト共通の `json/` フォルダにある最新のデータセットを参照します。

| Python版が参照していたファイル | 移植版が参照するファイル | 備考 |
| :--- | :--- | :--- |
| `seraphdb_json/styles.json` | `json/styles.json` | スタイルの武器タイプ（`type`）の参照 |
| `seraphdb_json/enemies.json` | `json/enemies.json` | 敵の基本境界値（`param_border`）の参照 |
| `seraphdb_json/skills.json` | `json/skills.json` | スキルの威力や依存パラメータ（`parts`）の参照 |
| `seraphdb_json/characters.json` | `json/characters.json` | キャラクター名の参照 |
| `seraphdb_json/skill_sp_mapping.json` | **参照不要** | `skills.json` 側の `parts` から動的解決するため廃止 |

### 💡 設計改善：ハードコーディングの撤廃とマスタ駆動化
Python版では通常攻撃や追撃（Pursuit）の威力閾値（`diff_for_max`）や威力倍率（`power`）がコード内にハードコードされていました（例: `e59 = 114.0`, `l59 = 645.0` など）。
しかし、これらは `json/skills.json` 内の該当スキルデータ（例: ID `46001101` / 通常攻撃）の `parts` 配列内に全く同じ数値が定義されています。
TypeScript移植版では、**ハードコーディングを一切行わず、すべてのスキルに対して `skills.json` からデータを動的に引き当てて解決する汎用的な設計**にします。

#### 1. 攻撃 Part 解決アルゴリズム (Part Selection Algorithm)
`skills.json` の `parts` から攻撃に使用する part を以下のルールで動的に引き当てます。

- **攻撃 Part 識別条件**:
  `parts` 配列内から、`skill_type` が以下の許可リスト（Python の `ALLOWED_ATTACK_TYPES`）に含まれる最初の part を抽出します。
  - `AttackNormal` / `AttackSkill` / `DamageRateChangeAttackSkill` / `PenetrationCriticalAttack` / `PenetrationNormalAttack` / `PenetrationSkill` / `TokenAttack` / `AttackBySp` / `AttackByOwnDpRate` / `FixedHpDamageRateAttack`
- **通常攻撃・追撃の識別**:
  - 通常攻撃: skills.json 上の name フィールドが「通常攻撃」であるもの（IDの末尾が01であるもの、例: 46001101 など）
  - 追撃: skills.json 上の name フィールドが「追撃」であるもの（IDの末尾が91であるもの、例: 46001191 などのシリーズID）
  - 上記に該当しない場合は通常スキルとして処理。
- **威力パラメータマッピング**:
  抽出した part から以下の値を取得します。
  - 閾値 `e59` = `diff_for_max`
  - 下限威力 `l59` = `power[0]` (通常攻撃や追撃などの成長率 0 のものを除き、スキルレベルによる成長成長率補正 `growth` を適用して算出)
  - 上限威力 `m59` = `power[1]` (同上)
- **範囲攻撃（AOE）判定**:
  スキルの `target_type == "All"` の場合に `is_aoe = true` と判定します。

#### 2. 解決失敗時のフォールバック挙動
もし該当する攻撃 part が見つからない場合は、Python 版と互換性のあるフォールバックを行います。
- 攻撃 part 未発見時は `parts` 内の `candidates[0]` (またはデフォルト値) をダミーとして使用し、**基礎ダメージ `baseDamageNormal` および `baseDamageCrit` を `0.0` にクランプ**します。
- このフォールバックが発生した場合は、サイレントに処理せず、出力の `breakdown.ignoredEffects` に `{ statusType: "no_attack_part", skillName: skill.name, side: "context" }` を記録して警告を発生させます。

---

## 4. 接続インターフェース (TypeScript定義)

移植する計算エンジンの入力・出力の型定義です。
既存の `docs/specs/runs/RUN_20260228_001/interfaces.ts` で定義されている `CharacterSnapshot` などとの互換性を保ちながら接続できるように設計します。

### ① 入力コンテキスト (`DamageInputContext`)
```typescript
export interface DamageInputContext {
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
    tokenCount?: number;        // トークン個数 (例: 3)
    tokenRatio?: number;        // トークン倍率 (指定があれば優先。なければ tokenCount * 0.10 に換算)
    stats: {                    // 実ステータス値
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
      power?: number;           // 指定がある場合はスケーリング計算をスキップし優先適用
      providerWis?: number;     // バフ使用者の知性
      sourceSkillId?: number;   // 解決のためのスキルID
      skillLevel?: number;      // デフォルト: 10
      orbLevel?: number;        // デフォルト: 0
    }>;
  };

  defender: {
    enemyId: number;
    enemyName: string;
    paramBorder?: number;       // 明示的指定があれば優先（0も許可）。なければenemies.jsonから自動参照
    destructionRate: number;    // 破壊率倍率（例: 2.50 = 250%）
    isHpTarget: boolean;        // HP対象ならtrue, DP対象ならfalse
    resistances: Record<string, number>; // 属性・武器耐性マップ (例: { Stab: 1.5 })
    passiveDefenseDown?: number; // アビリティ等による常時パッシブデバフ (デフォルト: 0.0)
    statusEffects: Array<
      {
        statusType: 'DefenseDown' | 'ElementResistDown';
        skillName: string;
        category: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense'; // 必須
        power?: number;
        providerWisOrLuk?: number; // 使用者の知性または運
        sourceSkillId?: number;
        skillLevel?: number;
        orbLevel?: number;
      } | {
        statusType: 'Fragile';
        skillName: string;
        category: 'NormalFragile' | 'PermFragile'; // 必須
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
    name: string;               // スキル名（通常攻撃、星火燎原など）
    level?: number;             // スキルレベル（デフォルト: 10）
  };
  activeZone: 'None' | 'FireZone' | 'IceZone' | 'ThunderZone' | 'DarkZone' | 'LightZone'; // 展開中のゾーン
}
```

### ② 出力期待値 (`DamageResult`)
```typescript
export interface DamageResult {
  normal: {
    expected: number;           // スキル単発の合計期待値（ヒット数非乗算）
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
    buffMultiplier: number;          // 攻撃バフ・属性バフ等の合計乗算値
    critMindeyeMultiplier: number;   // クリティカル・心眼の合計倍率
    debuffMultiplier: number;        // 防御デバフ枠の乗算値
    vulnerabilityMultiplier: number; // 脆弱デバフ枠の乗算値
    resistMultiplier: number;        // ゾーン属性耐性の乗算値
    affinityMultiplier: number;      // 武器属性相性の乗算値
    tokenMultiplier: number;         // トークン乗算値
    funnelMultiplier: number;        // 連撃枠の乗算値
    ignoredEffects: Array<{          // サポート外でドロップされた効果の警告リスト
      statusType: string;
      skillName: string;
      side: 'attacker' | 'defender' | 'context';
    }>;
  };
}
```

---

## 5. 移植検証方針（Vitestによる回帰テスト）

移植の正当性を証明するため、Vitestを用いた回帰テスト（`tests/damage-calculator.test.ts`）を作成します。

- **テストケースの完全一致**: `calc/test_cases_fixed.json` に定義された6ケースを入力として TypeScript 版を実行し、通常・クリティカルの `expected`, `min`, `max` および `breakdown` 内の各種乗算値が Python 版と許容誤差（`1e-4`）未満で 100% 完全一致することを確認します。
- **データ整合性の担保**: 今回の調査で、Python版が共通の `json/` データを使ってテストを100%パス（Passed=6/Failed=0）することが実証されたため、TypeScript移植版も共通の `json/` を読み込んで完全に同一の結果を再現可能であることが確認できています。

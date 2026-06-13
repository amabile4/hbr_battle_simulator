# シミュレータ（hbr_battle_simulator）とダメージ計算機（hbr_calc）の結合調査レポート

本ドキュメントは、ターン進行とバフ・デバフの付与状況をグラフィカルにシミュレートする `hbr_battle_simulator` (JS/TS) と、スプレッドシートから抽出した精密なダメージ数式モデルを実行する `hbr_calc` (Python) を結合するための、データ整合性、マッピング、およびアーキテクチャの調査結果です。

---

## 1. 静的マスタデータの同期検証結果

双方のシステムが参照している `seraphdb` 由来のJSONファイル群について、スキーマ構造とデータ件数の突合検証を行いました。

- **検証対象ファイル**:
  - `styles.json`
  - `skills.json`
  - `enemies.json`
  - `passives.json`
  - `characters.json`
- **検証結果**: **完全一致 (SUCCESS)**
  - ファイルサイズ、要素数、およびオブジェクト内のすべてのキー名・データ型が100%一致していることを自動スクリプトで確認しました。
  - **結論**: データソースレベルでのズレは一切なく、同じID体系（`skillId`, `styleId`, `characterId` 等）を用いてシームレスにデータを結合・相互参照できます。

---

## 2. データ構造とバフ・デバフのマッピング

シミュレータのコンテキスト情報（`DamageCalculationContext`）と、ダメージ計算機（Excel数式モデル）の入力パラメータの対応関係は以下のように定義されます。

### ① 基本的な攻撃者・ターゲット情報

| 計算機側 (Excelモデル) | シミュレータ側コンテキスト | 結合ロジック |
| :--- | :--- | :--- |
| **攻撃キャラクター** (`AZ18`) | `actorCharacterId` | `characters.json` および `styles.json` からステータスを引き当てるキー |
| **使用スキル名** (`AZ20`) | `skillId` / `skillName` | `skills.json` からスキル威力・適用ステータス重み・特効を引き当てるキー |
| **仮想敵名** (`AZ5`) | `targetEnemyIndex` | シミュレータが管理する敵オブジェクトを取得し、`enemies.json` の `param_border` (精神) や耐性を引き当てる |
| **敵の破壊率** (`AJ10`) | (敵のステータス状態) | シミュレータがターン進行で記録している現在の破壊率をそのまま乗算 (`AJ10`) に適用する |

### ② バフ・デバフの集約とマッピング

Excelモデルでは、バフは `AJ67` (バフ累計)、デバフは `AJ82` (デバフ累計) に集約され、最終的に通常ダメージ期待値に掛け合わせられます。

シミュレータ側の `DamageCalculationContext` は、以下のように各種バフ・効果量をマッピングして計算モデルに渡すことが可能です。

```
【バフ累計 (AJ67)】
  = attackUpRate (攻撃バフ)
  + highBoostSkillAtkRate (専用パッシブ・ブーストバフ)
  + divaSkillAttackUpRate (歌姫バフ)
  + foodBuffAttackUpRate (食事バフ)
  + (属性ゾーン・フィールドによる補正 ※属性一致時のみ)

【デバフ累計 (AJ82)】
  = defenseDownRate (防御デバフの合算)
  + elementDefenseDownRate (属性防御デバフの合算)
  + (脆弱による追加補正)

【クリティカル威力バフ (AR65)】
  = criticalDamageUpRate
  + markCriticalDamageUp (ターゲット付与マーク補正)

【トークン補正 (AS42)】
  = tokenAttackTotalRate
```

> [!CAUTION]
> **ゲームルール再現上の注意点（計算機の責務）**
> - **知性・運によるスケーリング**: バフ・デバフの効果量は、使用者のステータス（知性・運）によって変動します。
> - **同一カテゴリ重複制限**: 同じバフ・デバフは「上位2枠まで適用」といった重複上限があります。
> - **結論**: シミュレータ側が単純に合算した倍率（`attackUpRate` 等）をそのまま使うのではなく、**「現在付与されているバフ・デバフ効果の未加工リスト」を計算エンジンに渡し、計算エンジン側で上限やステータス依存値を正確に評価する**設計が望ましいです。

---

## 3. 統合アーキテクチャの比較評価

シミュレータ (JS/TS) とダメージ計算機 (Python) の結合方式として、以下の2つのアプローチを評価しました。

### 【プランA】 JS/TS移植アプローチ (推奨)

Python側でスプレッドシートから数式モデルを抽出し、自動検証テスト（リグレッションテスト）を記述して計算の正しさを保証した上で、その**計算ロジック自体をJS/TSの独立したライブラリ（モジュール）として記述してシミュレータに内蔵**する方式。

* **メリット**:
  * **低遅延 (ゼロレイテンシ)**: ブラウザ上のUI操作に対して一瞬でダメージ期待値とブレイクダウンが計算・表示されます。
  * **サーバーレス**: サーバー運用のコストやネットワークエラーの心配がなく、オフラインでも完全に動作します。
  * **シームレスなUI結合**: シミュレータ側の詳細ポップアップ（ブレイクダウンパネル）に、各バフ・デバフ枠の計算プロセスを直接渡して描画することが容易です。
* **デメリット**:
  * 計算ロジックをPython（テスト・数式抽出環境）とJS/TS（本番環境）の両方で管理する必要がある（※ただし、数式パーサーからJSコードを自動生成する、あるいはテストデータをJSON経由で渡してPython/JS両方でテストを走らせることで解決可能）。

### 【プランB】 Python Web API連携アプローチ

Python側で FastAPI 等を用いてダメージ計算の Web API を構築し、シミュレータ（フロントエンド）から HTTP リクエストを送信して計算結果を受け取る方式。

* **メリット**:
  * **ロジックの単一化**: 計算ロジックをPythonコードのみで記述・維持できるため、JS/TSへの移植手間が省けます。
* **デメリット**:
  * **通信遅延**: ターン選択やスキル選択のたびにAPIリクエストが発生し、ユーザー体験がもたつきます。
  * **インフラ運用**: シミュレータを公開する場合、Web APIサーバーのホスティングコストと監視が必要になります。
  * **複雑なローカル起動**: ローカル開発時、`npm run dev` と同時に Python 仮想環境で API サーバーを立ち上げる必要があり、開発環境構築のハードルが上がります。

---

## 4. 接続インターフェース設計案 (DamageCalculationHook)

シミュレータ側で定義されている `DamageCalculationHook` を基にした、プランA（JS/TS移植）での具体的な接続インターフェース案です。

### ① インプット (Input Context)

シミュレータから計算エンジンに渡すコンテキスト情報。バフ・デバフは集約前の生データを渡します。

```typescript
interface DamageInputContext {
  attacker: {
    characterId: string;
    styleId: number;
    /** 攻撃者のレベル。省略時はレアリティ最大値 (例: SSなら120) を仮定 */
    level?: number;
    /** 限界突破数 (0〜4凸)。省略時は 0 (無凸) */
    limitBreakCount?: number;
    // 精緻な計算用: 装備・宝珠などを反映した詳細ステータス（省略時は最大育成テンプレート値）
    stats?: { str: number; dex: number; wis: number; spr: number; luk: number; con: number };
    // 現在付与されているバフの生リスト
    buffs: Array<{
      skillId: number;
      buffType: 'AttackUp' | 'CritDamageUp' | 'Charge' | 'ElementAttackUp';
      basePower: number; // 基礎倍率
      providerWis?: number; // 使用者の知性（省略時は代表値を使用）
    }>;
    tokens: number; // 現在のトークン所持数
  };
  defender: {
    enemyId: number;
    // 精緻な計算用: 敵の防御ステータス境界 (省略時は enemies.json からのデフォルト境界値)
    paramBorder?: number;
    currentBreakRate: number; // 現在の破壊率 (例: 2.50 = 250%)
    isHpTarget: boolean; // HPを攻撃対象とするか (falseならDP)
    // 現在付与されているデバフの生リスト
    debuffs: Array<{
      skillId: number;
      debuffType: 'DefenseDown' | 'Fragile' | 'ElementResistDown';
      basePower: number;
      providerWisOrLuk?: number; // 使用者の知性・運（省略時は代表値を使用）
    }>;
  };
  skill: {
    skillId: number;
    parts: Array<any>; // skills.json からのスキルパーツ情報
  };
  fieldZone: string; // 現在展開されている属性フィールド/ゾーン (例: 'FireZone')
}
```

---

## 4. 「代表的な計算」と「精緻な計算」の切り替え

シミュレータのステータス管理状況に応じて、計算ロジックが使用する数値を自動でフォールバックします。

1. **代表的な計算ケース (デフォルト/簡易モード)**:
   - シミュレータ側でステータスや装備を詳細に入力していない状態。
   - `stats` や `paramBorder` が空で渡された場合、計算機側は**「レベル・アビリティツリー・スタイルレベルはすべて最大（SSならLv120）」および「最上位ランクの推奨装備セット装着済み」**を基本前提とします。
   - 唯一の戦力差となる **「限界突破数 (limitBreakCount: 0〜4凸)」** の値に基づき、`styles.json` の限界突破ボーナスデータを加算した代表ステータスを内部生成して計算を行います。
   - 敵の `paramBorder` がない場合も、`enemies.json` から敵のデフォルトの防御値を自動参照します。
2. **精緻な計算ケース (詳細カスタマイズモード)**:
   - ユーザーが詳細画面で装備やアビリティ、宝珠、限界突破数を手動設定した状態。
   - 正確な能力値を `stats` や `paramBorder` に格納して渡すことで、マスタデータの自動補完をスキップし、実ステータスを用いてゲーム内と一致する精密なダメージ計算を実行します。

### ② アウトプット (DamageResult)

計算エンジンからシミュレータに返却される計算結果。UI表示に必要なブレイクダウン（内訳）も含みます。

```typescript
interface DamageResult {
  // ダメージ期待値
  normal: {
    expected: number; // 平均値
    min: number;      // 期待値の90%
    max: number;      // 期待値の110%
  };
  critical: {
    expected: number; // クリティカル平均値
    min: number;
    max: number;
  };
  // UIの「威力増加ブレイクダウンパネル」にそのまま渡せる計算内訳
  breakdown: {
    baseDamageNormal: number; // 通常時基礎ダメージ (W59)
    baseDamageCrit: number;   // クリティカル基礎ダメージ (X59)
    buffMultiplier: number;   // 攻撃バフ枠倍率 (例: 2.10)
    critMindeyeMultiplier: number; // クリティカル・心眼枠倍率
    debuffMultiplier: number; // 敵デバフ・脆弱枠倍率
    resistMultiplier: number; // 属性耐性ダウン枠倍率
    affinityMultiplier: number; // 基本相性枠倍率
    tokenMultiplier: number; // トークン枠倍率
  };
}
```

---

## 5. 今後の結合ステップ（マイルストーン）

1. **数式パーサーの完成とPythonテスト自動化** (`hbr_calc` 側)
   - スプレッドシートから数式を完全に自動抽出し、Python上でのテストスイート（リグレッションテスト）を確立します。
2. **JS/TSへの数式エンジン移植**
   - 確立された数式モデルをJS/TSコード（`hbr-damage-engine.ts` 等）に移植します。
3. **差分比較テストによる検証**
   - Python側で生成した数万通りのテストデータ（インプットと期待値XLSX出力）をJSON経由でJS移植エンジンに読み込ませ、Pythonでの計算結果とJSでの計算結果が完全に一致することを確認します。
4. **シミュレータへの組み込み**
   - `hbr_battle_simulator` に移植した `hbr-damage-engine.ts` を組み込み、`DamageCalculationHook` を実装してUI（ブレイクダウンパネル）と接続します。

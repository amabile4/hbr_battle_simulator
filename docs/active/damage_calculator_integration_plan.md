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

## WBS タスク一覧

### 🔴 Phase 1: データ基盤

#### T1.1: ステータス入力スキーマの定義
- 攻撃者ステータス入力型を定義する:
  ```javascript
  AttackerStatsInput = {
    str, dex, wis, spr, luk, con,  // 手動入力値（null なら DEFAULT 使用）
    limitBreakCount,               // 凸数（0〜4）
    abilitySprCorrection,          // アビリティ精神補正
    tokenCount, tokenRatio,        // トークン
  }
  ```
- デフォルト値ルール: ロール別テンプレート（Attacker=650相当）

#### T1.2: 敵ステータス取得アダプタの実装
- `EnemySetupController.getSnapshot()` から選択中の敵IDを取得する
- `loadDamageCalculationData().enemies` から `param_border` を引き当てる
- 敵が未選択の場合はデフォルト値 `770`（スコアアタック難易度40G35基準）を使用する

#### T1.3: `DamageInputContext` 組み立て関数の実装
- `src/domain/damage-calculator-input-builder.js` を新規作成
- 以下の入力から `DamageInputContext` を組み立てる:
  - `damageContext`（既存の威力詳細入力）
  - `AttackerStatsInput`（T1.1）
  - 敵ステータス（T1.2）
- 既存の `DamageInputContext` 型（`src/contracts/damage-calculation.js`）に準拠する

---

### 🟡 Phase 2: UI 実装

#### T2.1: 威力詳細タブのレイアウト変更
- `ui-next/utils/char-detail-popup.js` の威力詳細セクションを2カラム構成に変更する
- 左カラム（既存）: 倍率ブレイクダウングループ表示（幅を約50%に縮小）
- 右カラム（新規）: ステータス入力エリア + 計算結果エリア

#### T2.2: 攻撃者ステータス入力UI
- 右カラム上部に攻撃者ステータス入力フォームを追加する:
  - `str / dex / wis / spr / luk / con` の数値入力フィールド（6項目）
  - 空欄時はロール別デフォルト値を使用することをプレースホルダーで示す
  - 「デフォルト値を使用」ボタン（全フィールドをデフォルト値に戻す）
  - 入力変更時に即時再計算する

#### T2.3: 敵ステータス表示エリア
- 右カラム中部に敵ステータス表示を追加する:
  - 敵名・ID
  - 防御境界値 `param_border`（Enemy Setup の選択から自動取得）
  - 敵未選択時はデフォルト値を表示して明示する

#### T2.4: 計算結果表示エリア
- 右カラム下部にダメージ計算結果を表示する:
  ```
  通常攻撃  最小: XXXX / 期待値: XXXX / 最大: XXXX
  クリティカル  最小: XXXX / 期待値: XXXX / 最大: XXXX
  ```
- ステータス未入力でもデフォルト値で計算して表示する（常に何かを表示）
- `calculateDamage()` のエラー時は「計算不可」と表示する

#### T2.5: CSS スタイリング
- `ui-next/styles.css` に2カラムレイアウト・ステータス入力フォームのスタイルを追加する

---

### 🟢 Phase 3: 計算連携

#### T3.1: `calculateDamage` の呼び出し接続
- T1.3 で作成した input builder を使い `calculateDamage()` を呼び出す
- 呼び出しタイミング:
  - 威力詳細タブ表示時（初回）
  - 攻撃者ステータス入力変更時（debounce 300ms）
  - 対象敵変更時

#### T3.2: `loadDamageCalculationData()` のキャッシュ
- JSON 読み込み（skills / styles / enemies）は初回のみ実行しキャッシュする
- `HbrDataStore` 既存のキャッシュ機構と整合させる（二重読み込み禁止）

---

### 🔵 Phase 4: テスト

#### T4.1: input builder のユニットテスト
- `DamageInputContext` が正しく組み立てられることを確認する
  - damageContext → DamageInputContext 変換の主要フィールドをカバー
  - デフォルト値フォールバックの動作確認

#### T4.2: Playwright E2E テストの追加
- `tests/e2e/damage-calculator-integration.spec.js` を新規作成する
- 検証内容:
  - 威力詳細タブにステータス入力エリアが表示されること
  - 数値入力後に計算結果が更新されること
  - デフォルト値で計算結果が表示されること（空欄時）

---

## 設計上の注意点

### 通常攻撃の扱い
- `damageContext` には `isNormalAttack` フラグが存在する
- `DamageInputContext.skill.kind = 'normal_attack'` として渡すことで
  MindEye 除外などの通常攻撃特例が適用される

### 対象敵が複数の場合
- `damageContext` に複数敵への `effectiveDamageRatesByEnemy` が含まれる場合がある
- 初期実装では単一敵（E1）の計算のみを表示する
- 複数敵対応は将来の拡張として WBS 外とする

### `vulnerabilityMultiplier` の扱い
- 現仕様では `vulnerabilityMultiplier = 1`（Fragile は `debuffMultiplier` に統合）
- `calculateDamage` の `breakdown` を参照する際は `debuffMultiplier` を使用する

### デフォルトステータス値
- Attacker ロール: `{ str: 650, dex: 650, wis: 600, spr: 600, luk: 600, con: 600 }`
- 未定義ロールの場合は 620 均一
- 限界突破: デフォルト 0凸

---

## 進捗状況

| タスクID | 分類 | 内容 | 状況 |
| :--- | :--- | :--- | :--- |
| T1.1 | Data | ステータス入力スキーマ定義 | 未着手 |
| T1.2 | Data | 敵ステータス取得アダプタ | 未着手 |
| T1.3 | Data | DamageInputContext 組み立て関数 | 未着手 |
| T2.1 | UI | 威力詳細タブ 2カラム化 | 未着手 |
| T2.2 | UI | 攻撃者ステータス入力フォーム | 未着手 |
| T2.3 | UI | 敵ステータス表示エリア | 未着手 |
| T2.4 | UI | 計算結果表示エリア | 未着手 |
| T2.5 | UI | CSS スタイリング | 未着手 |
| T3.1 | Logic | calculateDamage 呼び出し接続 | 未着手 |
| T3.2 | Logic | JSON データキャッシュ | 未着手 |
| T4.1 | Test | input builder ユニットテスト | 未着手 |
| T4.2 | Test | E2E テスト追加 | 未着手 |

---

## 参照ドキュメント

- `docs/calc/porting_design_guideline.md` — `DamageInputContext` 型定義
- `docs/calc/phase2_design_specification.md` — バフ・デバフ集計ルール
- `docs/specs/damage_breakdown_design.md` — 威力詳細タブ現行設計
- `src/domain/damage-calculator.js` — `calculateDamage()` 実装
- `src/contracts/damage-calculation.js` — 型定義・定数

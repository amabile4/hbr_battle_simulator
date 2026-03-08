# コードレビュー エグゼクティブサマリー

**レビュー対象**: `src/` および `ui/` ディレクトリ以下の全実装ファイル
**レビュー日**: 2026-03-08
**レビュアー**: Claude Code (自動レビュー)

### git ベースライン

| 項目 | 値 |
|------|-----|
| HEADコミット | `9d7c23ff9808c6dbc85c74aec219cc0342e681b7` |
| コミットメッセージ | `Refine phase 6 break-state plan` |
| ブランチ | `feature/record-edit-recalculation` |
| 未コミット変更 | あり（7ファイル、実装途中）|

> 詳細は [REVIEW_BASELINE.md](REVIEW_BASELINE.md) を参照。
> 次回再レビュー時は `git diff 9d7c23ff..HEAD` の差分ファイルのみを対象にする。

---

## 概要

`src/` および `ui/` 以下の計21ファイル（約13,000行相当）をレビューした。
全体的なアーキテクチャ設計は優れており、責任分離・不変スナップショット・リビジョン管理など先進的なパターンが適切に採用されている。一方で、単一ファイルへの機能集中、エラーハンドリング戦略の不統一、型安全性の欠如など、保守性と拡張性に影響する問題が複数存在する。

---

## ファイル構成と品質スコア一覧

| ファイル | 行数 | 品質スコア | 主な問題 |
|---------|------|-----------|---------|
| `src/config/battle-defaults.js` | 85 | 4/5 | 定数重複、マジックナンバー |
| `src/contracts/interfaces.js` | 289 | 3.5/5 | パーティサイズ定数未定義、型安全性 |
| `src/data/hbr-data-store.js` | 1205 | 3/5 | Regex脆弱性、重複mergeロジック、日本語ハードコード |
| `src/data/schema-validator.js` | 143 | 4/5 | Regexキャッシュ欠如 |
| `src/domain/sp.js` | 46 | 4.5/5 | switch-caseのdefault曖昧 |
| `src/domain/party.js` | 86 | 3.5/5 | swap()の原子性なし |
| `src/domain/character-style.js` | 942 | 3.5/5 | delta系メソッド重複、直接ミューテーション |
| `src/domain/dp-state.js` | 82 | 4/5 | 正規化呼び出し冗長 |
| `src/domain/damage-calculation-context.js` | 56 | 3.5/5 | 型変換の冗長性 |
| `src/domain/turn-preview.js` | 53 | 4/5 | エラーメッセージ簡潔過ぎ |
| `src/records/record-assembler.js` | 110 | 3/5 | 型定義不足、複雑な分岐 |
| `src/records/record-editor.js` | 108 | 3/5 | O(n)再インデックス、原子性なし |
| `src/records/record-store.js` | 28 | 4.5/5 | 拡張性が限定的 |
| `src/records/csv-exporter.js` | 155 | 3/5 | ヘッダーハードコード、ラベル形式混在 |
| `src/records/json-exporter.js` | 43 | 3.5/5 | Infinity→文字列変換で型情報喪失 |
| `src/turn/turn-controller.js` | 5563 | 2/5 | 🔴モノリシック、マジックナンバー多数、Regex脆弱性 |
| `src/ui/dom-adapter.js` | 5996 | 1.5/5 | 🔴最大問題、57メソッド、単一責任原則違反 |
| `src/ui/adapter-core.js` | 209 | 3/5 | 状態変更の原子性なし |
| `src/ui/battle-adapter-facade.js` | 162 | 2.5/5 | 24+変数、状態管理複雑 |
| `src/ui/dom-view.js` | 80 | 4/5 | シンプルで良好 |
| `ui/app.js` | 52 | 3.5/5 | 非同期最適化不足、window直接依存 |

**全体平均スコア: 3.4/5**

---

## 問題点一覧（重要度別）

### 🔴 Critical（即座に対応推奨）

| # | 問題 | 対象ファイル | 詳細 |
|---|------|-------------|------|
| C1 | `dom-adapter.js` がモノリシック（5996行・57メソッド） | src/ui/dom-adapter.js | 単一責任原則違反、テスト困難 |
| C2 | `turn-controller.js` がモノリシック（5563行） | src/turn/turn-controller.js | ロジックが1ファイルに集中 |

### 🟠 High（優先対応推奨）

| # | 問題 | 対象ファイル | 詳細 |
|---|------|-------------|------|
| H1 | 状態変数が24+個、因果関係不透明 | battle-adapter-facade.js, dom-adapter.js | OD/シナリオ/ターンプランが混在 |
| H2 | エラーハンドリング戦略が3パターン混在 | dom-adapter.js 全体 | runSafely/throw/try-catch が不統一 |
| H3 | `swap()` と `queueSwapState()` が非原子 | party.js, adapter-core.js | 途中失敗時の状態不整合リスク |
| H4 | パッシブ条件のRegex解析が脆弱 | hbr-data-store.js, turn-controller.js | 特殊文字未エスケープ、マジックナンバー |

### 🟡 Medium（計画的に対応推奨）

| # | 問題 | 対象ファイル | 詳細 |
|---|------|-------------|------|
| M1 | コード重複（delta系メソッド） | character-style.js | applyTokenDelta/applyMoraleDelta/applyMotivationDelta |
| M2 | コード重複（normalize系関数） | hbr-data-store.js, dom-adapter.js | normalizeCharacterName vs normalizeName |
| M3 | コード重複（merge系ロジック） | hbr-data-store.js | mergeSkillVariant/mergeSkillPart/mergeSkillWithOverride |
| M4 | 型安全性の欠如 | 全体 | TypeScript/JSDocなし、サイレントキャスト |
| M5 | DOMセレクター50+箇所ハードコード | dom-adapter.js | 変更時に多数箇所修正 |
| M6 | シナリオ実行の同期ループ | dom-adapter.js | 大規模シナリオでUIフリーズ可能性 |
| M7 | ネストオブジェクトの直接ミューテーション | character-style.js | 外部参照の場合、予期しない副作用 |
| M8 | Record再インデックスのO(n)コスト | record-editor.js | insert/deleteのたびに全ターン再計算 |
| M9 | グローバル依存（window, globalThis） | ui/app.js, dom-adapter.js | テスト困難、DI未適用 |
| M10 | app.js での直列fetchによる性能低下 | ui/app.js | Promise.all() 未使用 |
| M11 | 日本語文字列ハードコード | hbr-data-store.js, turn-controller.js | '通常攻撃', '追撃' 等がソースに直書き |
| M12 | CSVヘッダー・ラベル形式ハードコード | csv-exporter.js | スキーマから生成すべき |

### 🟢 Low（機会があれば対応）

| # | 問題 | 対象ファイル | 詳細 |
|---|------|-------------|------|
| L1 | 命名規則の不統一 | dom-adapter.js | read/sync/render/capture が混在 |
| L2 | マジックナンバーの分散 | character-style.js, interfaces.js | パーティサイズ6、position <= 2 等 |
| L3 | ローカルストレージスキーマ固定 | dom-adapter.js | schemaVersion=1、将来の拡張困難 |
| L4 | Regexの毎回コンパイル | schema-validator.js, hbr-data-store.js | パフォーマンスリスク |
| L5 | json-exporter でInfinity→文字列変換 | json-exporter.js | 復元時に型情報喪失 |
| L6 | エラーメッセージが簡潔過ぎる | turn-preview.js, party.js | デバッグ時の情報不足 |

---

## 良好な点（維持・継続推奨）

- **クリーンなアーキテクチャ**: domain/data/ui の明確な責任分離
- **循環依存なし**: 全モジュールが非循環グラフ
- **スナップショットパターン**: `Object.freeze()` 活用、不変性の確保
- **リビジョン追跡**: `CharacterStyle._revision` によるstale更新防止
- **純粋関数群**: `sp.js`, `dp-state.js` は副作用なし、テスト容易
- **依存性注入**: `BattleDomAdapter({ root, dataStore })` 形式でDOM注入
- **`runSafely()` パターン**: UIイベントのエラーをstatus表示で吸収

---

## 詳細ドキュメント

- [01_domain_layer.md](01_domain_layer.md) - domain/data/records層の詳細レビュー
- [02_ui_layer.md](02_ui_layer.md) - src/ui/, ui/ の詳細レビュー
- [03_turn_layer.md](03_turn_layer.md) - turn/config層の詳細レビュー
- [04_recommendations.md](04_recommendations.md) - 優先度付き改善提案

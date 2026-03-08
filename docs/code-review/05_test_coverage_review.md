# テストカバレッジ レビュー

**対象**: `tests/` ディレクトリ（`tests/e2e/` を除く）
**レビュー日**: 2026-03-08
**git ベースライン**: `9d7c23ff9808c6dbc85c74aec219cc0342e681b7`
**テスト実行結果**: **274 tests / 274 pass / 0 fail**（実行時間 ~35秒）

---

## テストフレームワーク構成

| 項目 | 内容 |
|------|------|
| ランナー | Node.js ネイティブ `node:test` |
| アサーション | `node:assert/strict` |
| DOM環境 | `jsdom` (28.x) |
| E2E（除外対象） | Playwright |
| 実行コマンド | `npm test` → `node --test tests/**/*.test.js` |

---

## テストファイル一覧と規模

| テストファイル | 行数 | テスト数 | 対象モジュール |
|--------------|------|---------|--------------|
| `turn-state-transitions.test.js` | 6,397 | 149 | turn-controller.js（全ゲームロジック） |
| `dom-adapter-records-style.test.js` | 1,295 | 23 | dom-adapter.js（記録・UI） |
| `dom-adapter-ui-selection.test.js` | 794 | 7 | dom-adapter.js（OD・スキル選択） |
| `dom-adapter-battle-scenario.test.js` | 698 | 13 | dom-adapter.js（シナリオ実行） |
| `data-store-operations.test.js` | 469 | 15 | hbr-data-store.js |
| `record-system.test.js` | 374 | 3 | record-editor.js / csv-exporter.js / json-exporter.js |
| `character-party.test.js` | 269 | 8 | character-style.js / party.js / sp.js |
| `dom-adapter-ui-selection.test.js` | 794 | 7 | dom-adapter.js |
| `schema-validation.test.js` | 92 | 3 | schema-validator.js |
| `turn-preview.test.js` | 75 | 2 | turn-preview.js |
| **合計** | **10,463** | **274** | |

**サポートファイル**:
- `helpers.js` (40行) — HbrDataStoreキャッシュ・テスト用スタイルID選定
- `dom-adapter-test-utils.js` (100+行) — JSDOM構築・前衛スキル設定ユーティリティ

---

## モジュール別カバレッジ状況

### ✅ カバー済み（テストあり）

| src ファイル | 対応テストファイル | テスト観点 |
|------------|-----------------|----------|
| `src/domain/sp.js` | character-party.test.js | applySpChange（凍結ルール・上下限） |
| `src/domain/character-style.js` | character-party.test.js, turn-state-transitions.test.js | SP管理・ステータス効果・強化モード・Funnel |
| `src/domain/party.js` | character-party.test.js | 編成・swap・バリデーション |
| `src/domain/turn-preview.js` | turn-preview.test.js | preview/commit・リビジョンガード |
| `src/data/hbr-data-store.js` | data-store-operations.test.js | スキルDB検索・パッシブフィルタ・LB制限 |
| `src/data/schema-validator.js` | schema-validation.test.js | スキーマ検証・エラー診断 |
| `src/turn/turn-controller.js` | turn-state-transitions.test.js | パッシブ・トークン・OD・EXターン・条件評価 |
| `src/records/record-editor.js` | record-system.test.js, turn-preview.test.js | CRUD・再インデックス |
| `src/records/csv-exporter.js` | record-system.test.js, dom-adapter-battle-scenario.test.js | CSV形式・列安定性 |
| `src/records/json-exporter.js` | record-system.test.js | JSON出力・スキーマバージョン |
| `src/records/record-store.js` | record-system.test.js（間接） | ストアAPI |
| `src/ui/dom-adapter.js` | dom-adapter-*.test.js (3ファイル) | 初期化・OD・シナリオ・ターンプラン |
| `src/contracts/interfaces.js` | 全テストで間接利用 | 型定義・状態検証 |

---

### ⚠️ テストなし・カバレッジ不十分

#### 🔴 `src/domain/damage-calculation-context.js` — **直接テストなし**

- `src/index.js` でエクスポートされているが、専用テストが存在しない
- `turn-controller.js` 経由で間接的にカバーされているが、入力バリデーションや境界値のテストがない
- `eligibleEnemyIndexes` のフィルタロジックや `targetEnemyIndex` の三項演算が検証されていない

**推奨**: `damage-calculation-context.test.js` を作成し、以下を検証：
```javascript
// テスト例
test('targetEnemyIndex defaults to 0 when null', () => { ... });
test('eligibleEnemyIndexes filters invalid indexes', () => { ... });
test('isAoE true when no target specified', () => { ... });
```

#### 🟡 `src/ui/adapter-core.js` — **間接テストのみ**

- `dom-adapter.js` のテスト経由で動作確認はされているが、`queueSwapState()` の境界値テストがない
- EXターン中のswap禁止制約の単体検証がない

#### 🟡 `src/ui/battle-adapter-facade.js` — **間接テストのみ**

- `previewCurrentTurnState()` の二重呼び出しシナリオが未検証
- `initializeBattleState({ preserveTurnPlans: true })` のオプション分岐テストが少ない

#### 🟡 `src/ui/dom-view.js` — **テストなし**

- 80行の小クラスで、`dom-adapter.js` 経由で間接的に機能確認はされている
- `renderScenarioStatus()` の表示ロジック（複数の `Number.isFinite` 分岐）が直接検証されていない

#### 🟢 `src/domain/dp-state.js` — **間接テストのみ**

- `turn-state-transitions.test.js` のDP関連テストで動作確認はされている
- `getDpRate()` が `POSITIVE_INFINITY` を返すケース（baseMaxDp=0）の直接テストがない

#### 🟢 `src/config/battle-defaults.js` — **テストなし（定数のみのため許容）**

- 定数定義のみのファイルであり、テスト不要と判断される
- ただし `getOdGaugeRequirement()` と `clampEnemyCount()` の関数部分は検証すべき

---

## テストの質的評価

### ✅ 良好な点

#### 1. `turn-state-transitions.test.js` が網羅的（6,397行・149テスト）
コアゲームロジックの複雑な状態遷移が詳細にテストされている：
- パッシブタイミング（`OnFirstBattleStart`, `OnPlayerTurnStart`, `OnPlayerTurnEnd`, `OnBattleWin` 等）
- トークンシステム（`TokenSet`, `TokenSetByAttacking`）
- ODメカニクス（OD1/2/3・ゲージ管理・SP回復）
- EXターン（付与条件・内部スキル制限）
- 条件評価（`IsFront()`, `SpecialStatusCountByType()`, `DamageRate()` 等）

#### 2. Q-S001（preview/commit二重適用防止）が複数箇所でテスト済み
`character-party.test.js` と `turn-preview.test.js` で独立して検証されており、仕様の核心部分が保護されている。

#### 3. `dom-adapter-test-utils.js` による統一されたテスト環境
JSDOM構築とデフォルトスキル選択の共通化により、UIテストの重複コードが削減されている。

#### 4. データストア操作のエッジケースカバー（15テスト）
- LBレベル別パッシブフィルタ
- 同名パッシブの共存（発動条件が異なる場合）
- Admiral/Restricted スキルルール
- Orb・マスタースキルの可視性

---

### ⚠️ 問題点

#### T-H1: テスト設計上の懸念 — `turn-state-transitions.test.js` の肥大化（High）

**6,397行のテストファイル**が存在しており、`dom-adapter.js` と同じモノリシック問題がテスト側にも発生している。

- テストケースを探すのが困難
- 特定機能のテストを追加する際にどこに書くべきか不明確
- テスト実行の粒度が粗い（`node:test` のサブセット実行が困難）

**推奨**: 機能カテゴリ別にファイル分割
```
tests/
├── turn-passive-timing.test.js    （パッシブタイミング）
├── turn-token-system.test.js      （トークンシステム）
├── turn-od-mechanics.test.js      （ODメカニクス）
├── turn-extra-turn.test.js        （EXターン）
├── turn-condition-eval.test.js    （条件評価）
└── turn-dp-system.test.js         （DPシステム）
```

#### T-H2: `dom-adapter.js` テストが統合テストに偏りすぎ（High）

3つのdom-adapterテストファイル（合計2,787行・43テスト）は、完全なDOM環境（JSDOM）を構築してから検証するため：
- テスト実行が遅い（DOM初期化コストが毎テストで発生）
- テスト失敗時の原因特定が難しい（どの層で失敗しているか不明）
- `adapter-core.js` や `battle-adapter-facade.js` の単体ロジックが直接テストされていない

**推奨**: `adapter-core.js` と `battle-adapter-facade.js` の単体テストを追加し、DOMを必要としないロジックを分離して高速化する。

#### T-M1: テストの境界値カバレッジ不足（Medium）

以下の境界値が未テスト：

| 機能 | 未テストの境界値 |
|------|---------------|
| SP管理 | `current < 0`（マイナスSP特性）の動作 |
| パーティー | 6人未満のパーティー構成でのswap |
| OD | ODゲージが境界値（最小/最大）での遷移 |
| Record | 0件のレコード状態でのCSV出力 |
| CSV | スワップが発生したターンの列出力 |
| JSON | `Infinity` 値を含むレコードのエクスポート・再インポート |

#### T-M2: エラー系テスト（異常系）が少ない（Medium）

現在のテストは主にハッピーパス（正常系）を検証しており、以下のエラー系テストがほぼない：

- 無効なパーティー設定（重複position、未知のstyleId）
- 不正なスキルID・ターゲット指定
- 不正なJSON・CSV入力でのシナリオ読み込み
- preview前にcommitを呼んだ場合の挙動
- データストアに存在しないcharacterIdの扱い

#### T-M3: `record-system.test.js` のテスト数が少ない（Medium）

374行に対してテストケースが3つのみ。以下が未カバー：

- `insertBefore()` の境界（先頭・末尾・存在しないturnId）
- `deleteRecord({ cascade: true })` の連鎖削除範囲
- `reindexTurnLabels()` のOD→EX→normalの混在ケース
- CSV列順序がスワップ後も初期パーティーインデックス固定であることの詳細検証

#### T-L1: テストデータが実ゲームデータに依存（Low）

`helpers.js` の `getSixUsableStyleIds()` が実際のスキルデータベース (`skillDatabase.json`) から取得している。データ変更がテストの前提条件を崩すリスクがある。

**推奨**: 最小限のfixture/stub データをテスト専用に用意する。

#### T-L2: テストの実行時間が長い（Low）

全274テストの実行に約35秒かかっており、開発サイクルでの利用に支障が出る可能性がある。主因は：
- `turn-state-transitions.test.js` の実際のゲームロジック実行（スキルDBロード含む）
- JSDOM環境の初期化（dom-adapterテスト群）

**推奨**: `--test-name-pattern` オプションでのサブセット実行や、高速fixtureの検討。

---

## テスト漏れサマリー（優先度別）

| 優先度 | テスト不足の観点 | 推奨アクション |
|--------|---------------|--------------|
| 🔴 | `damage-calculation-context.js` に専用テストなし | `damage-calculation-context.test.js` を新規作成 |
| 🟠 | `turn-state-transitions.test.js` の肥大化 | 機能別ファイル分割（6→1ファイル） |
| 🟠 | dom-adapterテストが統合テストに偏りすぎ | `adapter-core.test.js`, `battle-adapter-facade.test.js` を追加 |
| 🟡 | 境界値テストが不足（SP負値・ゼロ境界など） | 各ドメインファイルにエッジケース追加 |
| 🟡 | 異常系テスト（エラーパス）が少ない | record-system・data-store の異常入力テスト追加 |
| 🟡 | `record-system.test.js` テスト数が少ない（3件） | cascade削除・insertBefore境界を追加 |
| 🟢 | テストデータがDB依存 | fixture/stubデータの整備 |
| 🟢 | テスト実行時間が長い（35秒） | サブセット実行・軽量fixtureの検討 |

---

## 総合評価

**カバレッジの充実度**: ★★★★☆（4/5）
- 主要なゲームロジック（SP・OD・パッシブ・トークン・EX）は充実してテストされている
- レコードシステム・データストア・スキーマも基本動作は確認済み
- 未カバーは `damage-calculation-context.js`（専用テストなし）と各モジュールの異常系・境界値

**テスト設計の質**: ★★★☆☆（3/5）
- `turn-state-transitions.test.js` の肥大化が最大の設計上の問題
- dom-adapterの統合テスト偏重が保守性を下げている
- `dom-adapter-test-utils.js` による環境共通化は良いパターン

**実行品質**: ★★★★★（5/5）
- 274テスト全件PASS（fail=0）
- 実行が安定しており、CI環境でも利用可能な品質

---

## 参考: テスト実行コマンド

```bash
# 全テスト実行
npm test

# 特定ファイルのみ実行
node --test tests/turn-state-transitions.test.js

# パターン一致テストのみ実行
node --test --test-name-pattern "OD" tests/turn-state-transitions.test.js
```

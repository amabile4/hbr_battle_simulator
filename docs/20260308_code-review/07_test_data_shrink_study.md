# テストデータ シュリンク検討

**調査日**: 2026-03-08
**テーマ**: 実ゲームデータをシュリンクしてテストを高速化できるか？

---

## 前提: 現状の遅さの原因

まず「何がなぜ遅いか」を計測で確定させた。

### 計測結果

| 処理 | 実測時間 | 備考 |
|------|---------|------|
| `HbrDataStore.fromJsonDirectory('json')` | 64ms | **モジュールキャッシュあり（初回のみ）** |
| `createRoot()` (JSDOM大型HTML) | 26ms | テストごとに実行 |
| `new BattleDomAdapter()` | 0.4ms | 軽量 |
| `adapter.mount()` 全体 | **586ms** | テストごとに実行 ← 主犯 |
| `renderPartySelectionSlots()` | 240ms | mount内 |
| `initializeBattle()` | 286ms | mount内 |
| `bindEvents()` | 49ms | mount内 |

**テストごとの固定オーバーヘッド = 612ms（キャッシュ済みstore除く）**

```
dom-adapter テスト 86ケース × 612ms ≒ 52,632ms (逐次合計)
```

### `getStore()` はボトルネックではない

`getStore()` は `storeCache` で静的キャッシュされており、2回目以降は **0ms に近い**。
JSONパースコスト（64ms）はテスト全体で1回のみ。**データサイズを減らしても繰り返しコストは下がらない。**

---

## `renderPartySelectionSlots()` の内部解剖

240ms の内訳を調査した。

### 生成されるDOM要素

| 要素種別 | 数量 |
|---------|------|
| 全DOM要素 | **1,182個** |
| `<option>` 要素 | **613個** |
| うち character-select option | 57候補 × 6スロット = 342個 |
| うち style-select option | ~6スタイル/キャラ × 6スロット = 36個 |
| その他 option (LB, skill, passive等) | 235個 |

### 各関数の単体コスト（1スロットあたり）

| 関数 | 1スロット | 6スロット推計 |
|------|---------|------------|
| `createElement` × 342 | 3ms | — |
| `populateStyleSelect()` | 0.9ms | 5.4ms |
| `populateSkillChecklist()` | 0.5ms | 3.0ms |
| `populatePassiveList()` | 0.4ms | 2.4ms |
| **合計（純DOM操作）** | — | **~11ms** |

**純DOM操作コストは約11ms にすぎない。残りの230ms はどこから来るのか？**

### 真の原因: JSDOM の DOM 変更イベント伝播コスト

JSDOM は DOM 変更（`innerHTML = ''`, `appendChild()`）のたびに内部の mutation observer・イベント伝播処理を実行する。要素数が増えると **O(n)〜O(n log n)** のコストが発生する。

特に `container.innerHTML = ''` はサブツリー全体の破棄処理を引き起こし、1182要素を持つ DOM では数十ms 単位のコストになる。

```
JSDOM innerHTML = '' + appendChild × 1182要素 → ~230ms の JSDOM内部処理
```

---

## シュリンクデータの効果試算

### シナリオA: キャラクター数を 57 → 8 に削減

| 項目 | 現状 | シュリンク後 | 削減率 |
|------|------|------------|------|
| characterCandidates | 57 | 8 | -86% |
| character option 数 | 342 | 48 | -86% |
| 全 `<option>` 数 | 613 | 100程度 | -84% |
| 全DOM要素数 | 1,182 | ~200 | -83% |
| JSDOM処理コスト（推計） | 240ms | **35〜50ms** | -80% |

**推計: renderPartySelectionSlots が 240ms → 40ms に短縮**

### シナリオA の `initializeBattle()` への影響

`initializeBattle()` は `readStyleIdsFromDom()` でDOM値を読み取り、`buildPartyFromStyleIds()` で HbrDataStore からスタイルを取得する。スタイル数の削減は以下に影響：

- `buildPartyFromStyleIds()` のスタイル検索: O(1) Map lookup → 削減効果なし
- `applyInitialPassiveState()` のパッシブ処理: 6キャラ固定 → 削減効果なし

**推計: `initializeBattle()` の 286ms はほぼ変化なし**

### 1テストあたりの期待効果

| 処理 | 現状 | シュリンク後 |
|------|------|------------|
| `createRoot()` | 26ms | 26ms（変化なし） |
| `renderPartySelectionSlots()` | 240ms | **40ms（-200ms）** |
| `initializeBattle()` | 286ms | 286ms（ほぼ変化なし） |
| `bindEvents()` | 49ms | 49ms（変化なし） |
| **mount() 合計** | 601ms | **~401ms（-33%）** |

### 86テスト全体への影響

| 条件 | 逐次合計 | 並列実行（3ファイル同時）推計 |
|------|---------|------------------------|
| 現状 | 80秒 | **35秒** |
| シュリンク後 | 35秒（推計） | **~15〜20秒（推計）** |

**並列実行でおよそ 15〜20秒の削減が見込まれる。**

---

## シュリンクデータの実装コスト・リスク評価

### 実装方法

**案1: `tests/fixtures/` に最小JSONを手作成**

```
tests/fixtures/
├── characters.json     (8キャラのみ)
├── styles.json         (8キャラ × 5スタイル = 40スタイル)
├── skills.json         (40スタイル × 2スキル = 80スキル)
├── passives.json       (基本タイミング × 各1パッシブ = 40パッシブ)
├── accessories.json    (空配列)
└── skill_rule_overrides.json (空オブジェクト)
```

推定工数: **3〜5日**（スキル・パッシブデータの正確な構造理解が必要）

**案2: `HbrDataStore.fromRawData()` を使ったテスト用ファクトリ**

実データから必要な8キャラ分だけ抽出するスクリプトを作成し、
`HbrDataStore.fromRawData(subset)` でシュリンクストアを生成する。

```javascript
// tests/fixtures/minimal-store.js
import { HbrDataStore } from '../src/index.js';
import fullStore from './json-shrink.js'; // 事前抽出したサブセット

export function getMinimalStore() {
  return HbrDataStore.fromRawData(fullStore);
}
```

推定工数: **1〜2日**（抽出スクリプト + fixture生成）

**案3: getStoreキャッシュを活用した `characterCandidates` の絞り込み**

`BattleDomAdapter` コンストラクタに `maxCandidates` オプションを追加し、
テスト時に `new BattleDomAdapter({ ..., maxCandidates: 8 })` と指定する。
実データは変えずに `this.characterCandidates` を truncate するだけ。

```javascript
// テスト側
const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10, maxCandidates: 8 });
```

推定工数: **0.5日**（最小変更）/ リスク: 低（本番挙動に影響しない）

---

## リスク評価

| リスク | 内容 | 対策 |
|--------|------|------|
| テストの有効性低下 | シュリンクデータで実データ依存の挙動が検出できなくなる | 「データ依存テスト」はフルデータで実行するグループに分ける |
| fixture陳腐化 | 実データ更新時にfixture更新漏れが発生 | fixture生成スクリプトを自動化 |
| スキル条件未カバー | 特定パッシブ条件（PlayedSkillCount等）がfixture外になる | 条件別テストは専用fixture or フルデータで実行 |

---

## 結論・推奨

### 短期（即時）: 案3 `maxCandidates` オプション追加

- 工数: 0.5日
- 効果: mount() が ~600ms → ~400ms（推計33%削減）
- リスク: 低（既存テストは全てそのまま動く）
- dom-adapter テスト 86件の並列実行: 35秒 → 推計 25秒前後

### 中期: fixture ファイル整備（案2）

- 工数: 1〜2日
- 効果: mount() が ~600ms → ~200ms未満（推計66%削減）
- dom-adapter テスト 86件の並列実行: 35秒 → 推計 15秒前後
- 「実データ依存テスト」と「fixture依存テスト」を test group で分離

### 参考: 効果に対してコストが高い対策

| 対策 | 期待効果 | 理由 |
|------|---------|------|
| JSON ファイルサイズ削減 | **なし** | `getStore()` はキャッシュ済みで繰り返し実行されない |
| パッシブ数削減 | **ほぼなし** | 個別のpassive処理コストは小さい |
| テスト並列実行数増加 | 小 | すでに `node --test` でファイル並列実行中 |

---

## テストグループとの組み合わせ（06_test_grouping_proposal.md との統合案）

```
test:quick  (GROUP-A) ← フルデータ・1.7秒 → 現状維持
test:dom    (GROUP-B) ← fixture使用・推計8秒  ← 22秒から改善
test:dom:full          ← fixture使用・推計15秒 ← 35秒から改善
```

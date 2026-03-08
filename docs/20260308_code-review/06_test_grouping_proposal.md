# テストグループ化提案 — dom-adapter.js 変更時の高速フィードバック

**作成日**: 2026-03-08
**git ベースライン**: `9d7c23ff8`

---

## 問題: テスト実行時間の分布

### 現状の実行時間（ファイル別、逐次実行）

| テストファイル | テスト数 | 逐次実行時間 | 1ケース平均 |
|--------------|---------|------------|-----------|
| `turn-state-transitions.test.js` | 149 | **933ms** | ~6ms |
| `character-party.test.js` | 8 | 182ms | ~23ms |
| `data-store-operations.test.js` | 15 | 147ms | ~10ms |
| `schema-validation.test.js` | 3 | 105ms | ~35ms |
| `turn-preview.test.js` | 2 | 153ms | ~77ms |
| `record-system.test.js` | 3 | 173ms | ~58ms |
| `dom-adapter-battle-scenario.test.js` | 20 | **22,278ms** | ~1,114ms |
| `dom-adapter-records-style.test.js` | 38 | **32,740ms** | ~861ms |
| `dom-adapter-ui-selection.test.js` | 28 | **24,892ms** | ~889ms |
| **合計（`npm test` 並列実行）** | **274** | **~35秒** | — |

> `npm test` は `node --test tests/**/*.test.js` で複数ファイルを並列実行するため、
> 逐次合計（81秒）より大幅に短い35秒で完了する。
> ただし dom-adapter 3ファイルの逐次待ちが支配的で、**80秒 vs 35秒の差は並列効果のみ**。

---

## 根本原因: `adapter.mount()` のコスト

### 計測結果

```
createRoot() (JSDOM + 大型HTML):  26ms
new BattleDomAdapter():             0.4ms
adapter.mount():                  586ms  ← ここが問題
  └─ renderPartySelectionSlots(): 240ms  ← 全キャラ分の<option>をDOM生成
  └─ initializeBattle():          286ms  ← パーティー初期化・状態構築
  └─ bindEvents():                 49ms  ← 30+個のaddEventListener
  └─ その他:                       11ms
```

**dom-adapter テストは1ケースごとに `createRoot()` + `adapter.mount()` を実行するため、
毎テスト ~612ms の固定オーバーヘッドが発生する。**

### `renderPartySelectionSlots()` が重い理由

実ゲームデータ（`json/`）をロードした `HbrDataStore` から全キャラクター候補を取得し、
6スロット × (全キャラ数分の `<option>`) を JSDOM 上で createElement で構築している。
キャラクター数が多いほど DOM ノード生成コストが比例増大する。

---

## 提案: テストグループの分類

### グループ定義

```
tests/
├── [GROUP-A] 純粋ロジック（高速）
│   ├── character-party.test.js         182ms
│   ├── data-store-operations.test.js   147ms
│   ├── schema-validation.test.js       105ms
│   ├── turn-preview.test.js            153ms
│   ├── record-system.test.js           173ms
│   └── turn-state-transitions.test.js  933ms  ← 149テストだが高速
│                                ─────────────
│                               合計  ~1,700ms   ★ 約1.7秒
│
├── [GROUP-B] DOMアダプター コア（中速）
│   └── dom-adapter-battle-scenario.test.js  22,278ms
│                                ─────────────
│                               合計  ~22秒
│
├── [GROUP-C] DOMアダプター 全部（低速）
│   ├── dom-adapter-battle-scenario.test.js
│   ├── dom-adapter-records-style.test.js
│   └── dom-adapter-ui-selection.test.js
│                                ─────────────
│                  逐次合計  ~80秒 / 並列合計  ~35秒
│
└── [GROUP-ALL] 全テスト（現状 npm test）
    全9ファイル並列                    ~35秒
```

---

## 提案: npm scripts への追加

### `package.json` へ追加するスクリプト

```json
{
  "scripts": {
    "test": "node --test tests/**/*.test.js",

    "test:quick": "node --test tests/character-party.test.js tests/data-store-operations.test.js tests/schema-validation.test.js tests/turn-preview.test.js tests/record-system.test.js tests/turn-state-transitions.test.js",

    "test:dom": "node --test tests/dom-adapter-battle-scenario.test.js",

    "test:dom:full": "node --test tests/dom-adapter-battle-scenario.test.js tests/dom-adapter-records-style.test.js tests/dom-adapter-ui-selection.test.js"
  }
}
```

| スクリプト | 対象グループ | 実行時間目安 | 用途 |
|-----------|------------|------------|------|
| `npm run test:quick` | GROUP-A | **~1.7秒** | ドメインロジック変更時の即時確認 |
| `npm run test:dom` | GROUP-B | **~22秒** | dom-adapter の基本動作確認 |
| `npm run test:dom:full` | GROUP-C | **~35秒（並列）** | dom-adapter 全機能確認 |
| `npm test` | GROUP-ALL | **~35秒（並列）** | PR前・マージ前の全確認 |

---

## 変更種別ごとの推奨実行フロー

### ケース1: `dom-adapter.js` のみを変更した場合

```
修正 → test:quick (1.7秒) → 問題なし → test:dom (22秒) → 問題なし → コミット
                                                                    ↓
                                                           PR前: npm test (35秒)
```

**理由**: dom-adapter.js の変更がドメイン層（sp.js, party.js 等）に影響することはないので
GROUP-A で副作用なしを確認後、GROUP-B でUI動作を確認すれば十分。

### ケース2: `src/turn/turn-controller.js` を変更した場合

```
修正 → test:quick (1.7秒) → 問題なし → コミット
                                        ↓
                              PR前: npm test (35秒)
```

**理由**: turn-controller.js の変更は `turn-state-transitions.test.js`（GROUP-A 内）でカバーされる。
dom-adapter テストは間接的にターンロジックも実行するが、GROUP-A で失敗しなければ
dom-adapter テストで新たな問題が出ることはほぼない。

### ケース3: `src/domain/` または `src/records/` を変更した場合

```
修正 → test:quick (1.7秒) → 問題なし → コミット
                                        ↓
                              PR前: npm test (35秒)
```

### ケース4: `src/data/hbr-data-store.js` を変更した場合

```
修正 → test:quick (1.7秒) → 問題なし → test:dom (22秒) → 問題なし → コミット
                                                                    ↓
                                                           PR前: npm test (35秒)
```

**理由**: データストアはdom-adapterのinitializeBattle（パーティー構築）に直接影響するため、
GROUP-B の確認が追加で必要。

---

## 名前パターンによるさらなる絞り込み

`node:test` の `--test-name-pattern` で特定の機能だけを実行できる。

```bash
# OD関連のテストだけ実行（dom-adapter-ui-selection.test.js から）
node --test --test-name-pattern "OD" tests/dom-adapter-ui-selection.test.js

# シナリオ関連だけ実行
node --test --test-name-pattern "scenario" tests/dom-adapter-battle-scenario.test.js

# ターンプラン関連だけ実行
node --test --test-name-pattern "turn plan" tests/dom-adapter-records-style.test.js

# パッシブ関連だけ実行
node --test --test-name-pattern "passive" tests/turn-state-transitions.test.js
```

これにより特定機能の修正時は **1〜5秒** で確認できる。

---

## 将来的な高速化オプション（中長期）

現状のアーキテクチャを変えずに実施できる改善案：

### オプションA: テストスコープ内での adapter 再利用（高効果・要注意）

```javascript
// 現状: 各テストで毎回 createRoot + mount（~600ms/テスト）
test('test A', () => {
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, ... });
  adapter.mount();  // 600ms
  // ...
});

// 改善案: ファイルレベルで1回だけ mount（リセット関数を用意）
const { root, win } = createRoot();
const adapter = new BattleDomAdapter({ root, ... });
adapter.mount();  // 600ms × 1回のみ

function resetAdapter() {
  adapter.clearRecords();
  adapter.initializeBattle();  // 状態リセット: ~286ms
}

test('test A', () => {
  resetAdapter();  // ~286ms（mountより短い）
  // ...
});
```

**推定効果**: 1テストあたり ~600ms → ~300ms（約50%削減）
**リスク**: テスト間の状態漏れ（要レビュー）

### オプションB: 最小キャラクターデータの fixture 化（高効果）

現在は実ゲームデータ（数百キャラ分）から option を生成している。
テスト専用の小さな fixture（6キャラ分のみ）を用意することで、
`renderPartySelectionSlots()` のコストを大幅削減できる。

```
現状: 実DBから全キャラ読み込み → renderPartySelectionSlots: 240ms
改善: 6キャラfixture        → renderPartySelectionSlots: ~20ms（推定）
```

**推定効果**: mount コスト 586ms → ~100ms（約80%削減）
**リスク**: fixture が実データと乖離した場合、テストの有効性が下がる

### オプションC: DOM-independent ロジックの単体テスト化（設計改善）

`adapter-core.js` と `battle-adapter-facade.js` の単体テストを追加することで、
dom-adapter に依存しないロジックを高速テストでカバーする。

```
adapter-core.test.js         → <200ms（DOM不要）
battle-adapter-facade.test.js → <200ms（DOM不要）
```

この場合、dom-adapter テストのスコープを「DOMイベント→facade呼び出しの結合テスト」に絞れ、
テストケース数自体を削減できる。

---

## 実施優先度

| 優先度 | アクション | 効果 | 工数 |
|--------|-----------|------|------|
| 🟢 **即時** | `package.json` に3つの test スクリプト追加 | 日常作業の確認が1.7秒に短縮 | 15分 |
| 🟢 **即時** | `--test-name-pattern` の活用をチームに周知 | 特定機能の確認が1〜5秒に | 0分（知識のみ） |
| 🟡 **中期** | fixture データの整備（6キャラ分） | mount コスト ~80%削減 | 1〜2日 |
| 🟡 **中期** | `adapter-core.test.js` / `battle-adapter-facade.test.js` 追加 | DOM不要テストでカバレッジ向上 | 1〜2日 |
| 🔵 **長期** | ファイルレベルの adapter 再利用（resetAdapter パターン） | テスト時間 50%削減 | 3〜5日（状態管理の確認含む） |

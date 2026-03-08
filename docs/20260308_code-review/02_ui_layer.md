# UI 層 コードレビュー

**対象ディレクトリ**:
- `src/ui/` (dom-adapter.js, adapter-core.js, battle-adapter-facade.js, dom-view.js)
- `ui/` (app.js, index.html, shims/)

---

## src/ui/dom-adapter.js （5996行）🔴 Critical

**概要**: バトルUIの全機能を担うマスターコントローラー。`BattleAdapterFacade` を継承し、57のメソッドを持つ巨大クラス。

### 問題1: モノリシック設計（Critical）

**57メソッド・5996行が単一ファイルに集中**。以下の機能が混在している：

| 機能ブロック | 行範囲（概算） | 提案分割先 |
|------------|--------------|----------|
| 初期化・マウント処理 | 780-850 | `dom-adapter-core.js` |
| イベントバインディング（30+イベント） | 850-1225 | `dom-adapter-core.js` |
| パーティー選択UI（6スロット×3セレクト） | 1280-2370 | `dom-adapter-selection.js` |
| ターン処理（preview/commit） | 2389-2450 | `dom-adapter-turn.js` |
| 敵設定UI | 2754-3183 | `dom-adapter-enemy.js` |
| ターンプラン（CSV読み込み・リプレイ） | 3373-3873 | `dom-adapter-turn-plan.js` |
| シナリオ実行 | 3873-4549 | `dom-adapter-scenario.js` |
| ローカルストレージ管理 | 1480-1590 | `dom-adapter-storage.js` |

**影響**:
- テストファイルが `dom-adapter-ui-selection.test.js` (32KB), `dom-adapter-records-style.test.js` (51KB), `dom-adapter-battle-scenario.test.js` (26KB) と巨大化している
- 1つの機能変更が無関係なコードへのリグレッションを引き起こすリスク

### 問題2: エラーハンドリング戦略の不統一（High）

同一クラス内に3つの異なるエラー処理パターンが混在：

**パターンA: `runSafely()` ラッパー（UIイベント用）**
```javascript
// DOMイベントからの呼び出しはrunSafelyで保護
root.querySelector('[data-action="preview"]')?.addEventListener('click', () => {
  this.runSafely(() => this.previewCurrentTurn());
});
```

**パターンB: `throw new Error()` （状態チェック用）**
```javascript
// 内部メソッドはthrowで失敗を通知
commitCurrentTurnState(options = {}) {
  if (!this.state) {
    throw new Error('State is not initialized.');  // 呼び出し側がrunSafelyでなければUI破損
  }
}
```

**パターンC: 明示的 `try/catch` with `warn`**
```javascript
try {
  this.activateKishinka();
} catch (error) {
  warn(`kishinka skipped: ${error.message}`);
}
```

**問題**: `throw` した例外が `runSafely` の外側で呼ばれた場合、未捕捉例外としてアプリクラッシュの可能性がある。

### 問題3: 状態管理の複雑性（High）

`BattleDomAdapter` が管理するインスタンス変数（`BattleAdapterFacade` 分含む）：

```javascript
// 基本戦闘状態 (battle-adapter-facade.js)
party, state, recordStore, previewRecord, pendingSwapEvents

// OD関連
pendingInterruptOdLevel, interruptOdProjection, preemptiveOdCheckpoint
kishinkaActivatedThisTurn

// ターンプラン
turnPlans, turnPlanComputedRecords, turnPlanReplayError
turnPlanReplayWarnings, turnPlanEditSession, turnPlanBaseSetup
isReplayingTurnPlans, turnPlanRecalcMode

// シナリオ
scenario, scenarioCursor, scenarioStagedTurnIndex, scenarioSetupApplied

// UIキャッシュ
lastActionSkillByPosition (Map)
lastActionTargetByPosition (Map)
passiveLogEntries

// 選択UI
characterCandidates, defaultSelections

// その他
recordsSimpleMode, _bound
```

**合計: 24+ インスタンス変数**。変数間の因果関係（例: `isReplayingTurnPlans` が `true` のとき `previewRecord` はどうあるべきか）が文書化されていない。

### 問題4: DOMセレクター文字列の分散（Medium）

`this.root.querySelector(...)` に文字列リテラルが50+箇所で直接記述されている。例：

```javascript
this.root.querySelector('[data-action="initialize"]')
this.root.querySelector('[data-role="status"]')
this.root.querySelector('[data-role="swap-from"]')
this.root.querySelector('[data-role="csv-output"]')
// ... 50+ 箇所
```

**問題**: HTMLのdata属性名を変更した際に、対応するJSのセレクターを全箇所修正する必要がある。

**改善案**:
```javascript
// セレクター定数の一元管理
const SELECTORS = Object.freeze({
  INIT_BTN:       '[data-action="initialize"]',
  STATUS:         '[data-role="status"]',
  SWAP_FROM:      '[data-role="swap-from"]',
  CSV_OUTPUT:     '[data-role="csv-output"]',
  // ...
});
```

### 問題5: シナリオ実行の同期ループ（Medium）

```javascript
// dom-adapter.js: シナリオ実行が完全同期
runAllScenarioTurns() {
  while (this.scenarioCursor < turns.length) {
    this.runNextScenarioTurn();  // 同期処理
  }
}
```

**問題**: ターン数が多い場合（50+ターン）、メインスレッドをブロックし、ブラウザの「応答なし」ダイアログが表示される可能性がある。

**改善案**:
```javascript
async runAllScenarioTurns() {
  while (this.scenarioCursor < turns.length) {
    this.runNextScenarioTurn();
    await new Promise(resolve => setTimeout(resolve, 0)); // UIスレッドを解放
  }
}
```

### 問題6: グローバル依存（Medium）

```javascript
// dom-adapter.js: グローバルオブジェクトへのフォールバック
const view = this.doc?.defaultView ?? globalThis;
const BlobCtor = view?.Blob ?? globalThis.Blob;     // DI未適用
const urlApi = view?.URL ?? globalThis.URL;           // DI未適用
```

`Blob` と `URL` は `document.defaultView` 経由で取得できるため、`globalThis` フォールバックは不要。または、コンストラクタで注入する。

### 問題7: 命名規則の不統一（Low）

メソッドの命名パターンが統一されていない：

| パターン | 例 |
|---------|-----|
| `readXFromDom()` | `readStyleIdsFromDom()` |
| `syncX()` | `syncMotivationSelectionControls()` |
| `renderX()` | `renderActionSelectors()` |
| `captureX()` | `captureSelectionState()` |
| `applyX()` | `applySelectionState()` |

**推奨統一パターン**:
- DOM読み取り: `readXFromDom()`
- DOM書き込み: `writeXToDom()` または `renderX()`
- 内部状態同期: `syncX()`

### 問題8: ローカルストレージスキーマの将来性（Low）

```javascript
const SELECTION_SAVE_SCHEMA_VERSION = 1;

readSelectionStore() {
  const parsed = JSON.parse(raw);
  if (parsed.schemaVersion !== SELECTION_SAVE_SCHEMA_VERSION) {
    // Legacy format: slot 0-9 were manual slots 1-10.
    // バージョン1固定でマイグレーション戦略が不完全
  }
}
```

スキーマバージョン2以降への移行パスが定義されていない。

---

## src/ui/battle-adapter-facade.js （162行）⚠️ 要改善

**概要**: UIに依存しないバトル状態管理ファサード。`dom-adapter.js` の継承元。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟠 High | 99-105 | **`previewCurrentTurnState()` が `this.previewRecord` を上書き**: 前のプレビュー状態に戻る手段がない。プレビューを2回連続呼び出すと最初のプレビューが失われる |
| 🟡 Medium | 14-37 | コンストラクタで `null` 初期化される変数が8個以上。初期状態の「正しい形」がコードから読み取れない |
| 🟡 Medium | 39-90 | `initializeBattleState()` の `preserveTurnPlans` オプションによる分岐が複雑。条件によって初期化される変数のセットが異なる |
| 🟡 Medium | 84-87 | `turnPlanBaseSetup` の構築時に `snapshot` と他の変数が密結合されており、リファクタリング困難 |
| 🟡 Medium | 130-136 | `shouldCaptureTurnPlan` フラグによる条件分岐が複数箇所に存在し、テストのセットアップが複雑 |
| 🟢 Low | 115-119 | `commitTurnRecord()` のオプション引数の構造が `battle-adapter-facade.js` の内部に隠れており、外部から呼び出す際の引数が不明瞭 |

---

## src/ui/adapter-core.js （209行）⚠️ 注意

**概要**: バトル状態初期化とpreview/commitの純粋関数群。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟠 High | 138-156 | **`queueSwapState()` が非原子**: `member.setPosition()` 呼び出し後に失敗した場合のロールバック処理がない。`party.js` の `swap()` と同じ問題 |
| 🟡 Medium | 41-46 | `initialSpByPartyIndex` の計算で `Object.entries` + `map` + `Object.fromEntries` の3ステップ変換。可読性が低い |
| 🟡 Medium | 48-58 | `buildPartyFromStyleIds()` に多数のオプション引数を展開して渡している。オプションオブジェクトをそのまま渡す方が保守しやすい |
| 🟡 Medium | 95-96 | `createBattleStateFromParty` → `applyInitialPassiveState` の順序依存が暗黙的。コメントで明示すべき |
| 🟡 Medium | 182-192 | `previewTurnRecord()` と `commitTurnRecord()` のシグネチャが非対称（オプションの種類と数が異なる） |
| 🟢 Low | 152-154 | `hasAnyExtra` を複数回参照しているが、変数定義は1か所。問題ないが、複数回参照されることをコメントで示すべき |

---

## src/ui/dom-view.js （80行）✅ 良好

**概要**: 低レベルのDOM操作クラス。シンプルで責任が明確。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟢 Low | 7-9 | `query()` でセレクター引数の型チェックなし。`null` や `undefined` を渡した場合の挙動が不明 |
| 🟢 Low | 12-15 | `writeText()` で `String()` キャストが冗長（`textContent` は文字列以外も自動変換する） |
| 🟢 Low | 23-24 | `writeValueOrText()` で `'value' in node` チェックをしているが、`readonly` inputへの書き込みが検出されない |
| 🟢 Low | 54-69 | `renderScenarioStatus()` で複数の `Number.isFinite()` チェックが連続し、ロジックが手続き的になっている |

---

## ui/app.js （52行）⚠️ 注意

**概要**: ブラウザ側のエントリーポイント。データロードとアダプター初期化を行う。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 20-31 | **直列fetchによる性能低下**: 複数の `fetchJson()` 呼び出しが `await` で直列実行されている。`Promise.all()` を使えば並列取得でロード時間を短縮できる |
| 🟡 Medium | 5-17 | `window.location.protocol === 'file:'` によるブランチ — ブラウザ環境への直接依存。テスト困難 |
| 🟢 Low | 8 | `import(url, { with: { type: 'json' } })` — JSON import assertionsはまだ実験的仕様。ブラウザ互換性に注意 |
| 🟢 Low | 12-16 | fetch失敗時に `response.status` のみ記録。ステータスコード別の詳細メッセージがない |
| 🟢 Low | 45-51 | エラーハンドラーで `console.error()` 後に `status.textContent` 更新。エラーメッセージの内容が2箇所で異なる |

**修正提案** (Promise.all による並列fetch):
```javascript
// 現状: 直列
const rawCharacters = await fetchJson('./data/characters.json');
const rawStyles     = await fetchJson('./data/styles.json');
const rawSkills     = await fetchJson('./data/skills.json');

// 改善案: 並列
const [rawCharacters, rawStyles, rawSkills] = await Promise.all([
  fetchJson('./data/characters.json'),
  fetchJson('./data/styles.json'),
  fetchJson('./data/skills.json'),
]);
```

---

## ui/ ブラウザ側シム（shims/）

`ui/shims/node-fs.js`, `ui/shims/node-path.js` はブラウザ環境でのNode.js APIシムを提供している。これは設計上の意図的な選択であり、問題なし。ただし、シムの機能範囲とNode.js APIとの差異についてのコメントが不足している。

---

## 総括

UI層の最大問題は `dom-adapter.js` の巨大化（5996行）であり、これが全ての保守性問題の根本原因となっている。短期的には機能ブロック単位での**ファイル分割**が最優先の改善アクションとなる。

`battle-adapter-facade.js` の状態変数の整理（状態図の作成とグルーピング）も保守性向上に大きく貢献する。`adapter-core.js` と `dom-view.js` は相対的に良好な品質を維持している。

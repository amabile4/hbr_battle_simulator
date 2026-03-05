# UI Parallel Development Interface Spec (DOM Adapter + Engine)

- 作成日: 2026-03-06
- 対象: `src/ui/dom-adapter.js` を使って新GUIを並行開発する生成AI/開発者
- 目的: 現行DOM Adapterとメインエンジンの境界を明確化し、別実装UIから安全に利用できるようにする

## 1. 結論: `dom-adapter` の独立性評価

`BattleDomAdapter` は「UI層のみ」ではなく、次を同時に担うオーケストレータです。

- DOMイベントバインド
- UI描画
- ターンプラン編集/再計算
- シナリオ実行
- エンジン関数呼び出し
- レコードストア管理

そのため **他ソースからは独立しているが、DOM構造に強く依存** します。

- エンジン依存は明確で限定的
  - `createBattleStateFromParty`
  - `previewTurn`
  - `commitTurn`
  - `activateOverdrive`
  - `resolveEffectiveSkillForAction`
- ただしDOM依存が大きい
  - `[data-role="..."]` / `[data-action="..."]` セレクタ前提
  - `root` 内の要素欠損時に、機能が silently skip か例外になる

評価:

- 並行開発は可能
- ただし「同一 `BattleDomAdapter` を使うGUI」を別AIが作るなら、DOM契約の共有が必須
- DOM契約を避けたい場合は、`turn-controller` 直利用の新UI層を作る方が独立性は高い

## 2. モジュール境界

### 2.1 UI起動側

- `ui/app.js`
  - JSON群を `HbrDataStore.fromRawData(payload)` に投入
  - `new BattleDomAdapter({ root, dataStore, initialSP })`
  - `adapter.mount()`

### 2.2 DOM Adapter側

- `src/ui/dom-adapter.js`
- 役割:
  - UI入力をドメイン入力へ変換
  - エンジン呼び出し
  - 結果をUI出力へ反映

### 2.3 メインエンジン側

- `src/turn/turn-controller.js`
- 純粋ロジック（DOM非依存）

## 3. Engine Interface Spec

### 3.1 `createBattleStateFromParty(party, turnState?)`

- 入力:
  - `party`: `Party` または member配列（6人）
  - `turnState`: 省略可。通常は `createInitialTurnState()` ベース
- 出力:
  - `BattleState`
    - `party`
    - `turnState`
    - `positionMap`
    - `initialParty`

### 3.2 `previewTurn(state, actions, enemyAction = null, enemyCount = 1, options = {})`

- 入力:
  - `state`: `BattleState`
  - `actions`: positionキー辞書
    - 例:
      - `"0": { "characterId": "SRuka", "skillId": 100100101 }`
      - 単体対象系は `targetCharacterId` 追加
  - `enemyAction`: 文字列 or `null`
  - `enemyCount`: 1..3
  - `options`:
    - `skipSkillConditions` など（強制再計算モード用）
- 出力:
  - `TurnRecord` (`recordStatus: "preview"`)
  - `projections.odGaugeAtEnd` を含む

### 3.3 `commitTurn(state, previewRecord, swapEvents = [], options = {})`

- 前提:
  - `previewRecord.recordStatus === "preview"`
- 入力オプション:
  - `applySwapOnCommit` (default true)
  - `interruptOdLevel` (1..3)
  - `forceOdActivation` (ODゲージ不足でも割込OD許可)
  - `forceResourceDeficit` (不足リソース許可)
- 出力:
  - `{ nextState, committedRecord }`
- 主な例外:
  - プレビュー/ステート不整合
  - メンバー不在
  - revision不一致

### 3.4 `activateOverdrive(state, level, context = "preemptive", options = {})`

- 入力:
  - `level`: 1..3
  - `context`: `"preemptive" | "interrupt"`
  - `options.forceActivation`
  - `options.forceConsumeGauge`
- 出力:
  - ODターンへ遷移した `state`

### 3.5 `grantExtraTurn(state, allowedCharacterIds)`

- 入力:
  - `allowedCharacterIds`: 追加ターンで行動可能な characterId 配列
- 出力:
  - Extra Turn化した `state`

## 4. `BattleDomAdapter` Public Usage Spec

実質的に外部から直接使う主メソッドは以下。

- `mount()`
- `initializeBattle(styleIds?, options?)`
- `previewCurrentTurn(options?)`
- `commitCurrentTurn(options?)`
- `queueSwap(fromPos, toPos)`
- `applyEnemyStatusFromDom()` / `clearEnemyStatusFromDom()`
- `exportCsv()`
- `exportRecordsJson()`
- `loadScenarioFromDom()`
- `applyLoadedScenarioSetup()`
- `runNextScenarioTurn()`
- `runAllScenarioTurns()`
- `recalculateTurnPlans({ mode: "strict" | "force" })`
- `captureSelectionState()` / `applySelectionState(state)`

### 4.1 コンストラクタ

```js
const adapter = new BattleDomAdapter({
  root: document.querySelector('#app'),
  dataStore,
  initialSP: 4,
});
```

- `root` と `dataStore` は必須
- `initialSP` は省略時 `4`

### 4.2 初期化シーケンス

```js
adapter.mount();
// mount内部で initializeBattle() が実行される
```

### 4.3 1ターン実行の最小呼び出し

```js
adapter.initializeBattle();
const preview = adapter.previewCurrentTurn();
const committed = adapter.commitCurrentTurn();
```

### 4.4 レコード出力

```js
const csv = adapter.exportCsv();
const jsonText = adapter.exportRecordsJson();
```

`exportRecordsJson()` はUIテキストエリア更新とダウンロード保存処理も行う。

## 5. DOM Contract（Adapterをそのまま使う場合）

`BattleDomAdapter` を使うGUIは、`root` 配下に最低限次の要素を用意する。

- 初期化/ターン操作:
  - `[data-action="initialize"]`
  - `[data-action="preview"]`
  - `[data-action="commit"]`
  - `[data-role="action-slots"]`
  - `[data-role="turn-label"]`
  - `[data-role="status"]`
- 入出力:
  - `[data-role="preview-output"]`
  - `[data-role="csv-output"]`
  - `[data-role="records-json-output"]`
  - `[data-role="record-head"]`
  - `[data-role="record-body"]`
- 戦闘条件:
  - `[data-role="enemy-count"]`
  - `[data-role="enemy-action"]`
  - `[data-role="initial-od-gauge"]`

推奨:

- 既存の `ui/index.html` を契約サンプルとしてコピーし、見た目だけ置換する
- `data-role` / `data-action` 名は変えない

## 6. 並行開発パターン

### パターンA: Adapter互換GUIを並行実装（推奨）

- 目的: 短期で見た目を刷新
- 方針:
  - `BattleDomAdapter` はそのまま利用
  - 新UIは `data-role`/`data-action` 契約を満たす
- メリット:
  - 既存ロジックとテスト資産を活用
  - エンジンロジック変更不要
- 注意:
  - DOM契約破壊で機能が壊れる

### パターンB: Engine直結GUIを新規実装

- 目的: 長期で疎結合化
- 方針:
  - `turn-controller` を直接呼び出すUI層を別実装
  - `dom-adapter` 依存を除去
- メリット:
  - UI自由度が最大
- 注意:
  - 既存のシナリオ/ターンプラン機能を再実装する必要がある

## 7. 生成AI向け実装ガイド

### 7.1 最低限守る呼び出し順

1. JSONロードして `HbrDataStore` を作る
2. `BattleDomAdapter` を `mount()` する
3. `initializeBattle()` 後にターン操作を許可する
4. `previewCurrentTurn()` 後に `commitCurrentTurn()` を呼ぶ

### 7.2 状態の読み取りポイント

- 現在ターン情報: `adapter.state.turnState`
- 現在パーティ: `adapter.state.party`
- 確定レコード: `adapter.recordStore.records`
- ターン計画: `adapter.turnPlans`

### 7.3 エラー処理

- UIイベント経由は `runSafely()` でステータスに表示される
- API直呼びでは `throw` を捕捉してUIに表示する

## 8. 独立性を上げるための次アクション（任意）

- `src/ui/dom-adapter.js` を Facade + View に分割
  - Facade: エンジン呼び出し/状態遷移のみ
  - View: DOM更新のみ
- `data-role` 契約を `docs` に固定化（この文書を基準に更新）
- GUI別実装向けに `adapter-core`（DOM非依存）を新設

## 9. サンプル: 新GUI側からの最小利用

```js
import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { BattleDomAdapter } from '../src/ui/dom-adapter.js';

const dataStore = HbrDataStore.fromRawData(payload);
const root = document.querySelector('#app');
const adapter = new BattleDomAdapter({ root, dataStore, initialSP: 4 });
adapter.mount();

// 任意のUIイベントから
adapter.previewCurrentTurn();
adapter.commitCurrentTurn();
```

---

本仕様は `src/ui/dom-adapter.js` と `src/turn/turn-controller.js` の現実装を基準に作成。

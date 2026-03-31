# 開発原則（このワークスペース固有の注意事項）

> **ステータス**: 📚 参照（変わらない原則・読む専用）
> **作成**: 2026-03-16

---

## 1. バグ修正の切り分け原則

不具合が発生したとき、**最初に「エンジン層の問題か UI 層の問題か」を切り分ける**。

### 切り分けの手順

1. **エンジン出力を直接確認する**
   - `previewTurnRecord` / `commitTurnRecord` が返す `record` オブジェクトの中身をコンソールで確認する
   - 正しいデータが `record` に含まれているなら → UI 層が誤ったソースを参照している問題
   - `record` 自体が誤っているなら → エンジン層の問題

2. **UI 層の責務範囲を確認する**
   - UI 層は「エンジンが返したデータを正しく参照・表示する」責務を持つ
   - UI 層は「エンジンが返さなかったデータを計算・推測する」責務を持たない

3. **既存の正しいパスを探す**
   - 類似の処理（例：別のターン種別の SP 参照、別のゲージの After 値）がどのように実装されているかを確認する
   - 正しい実装のパターンに合わせて修正する

### 禁止事項

- **UI 層で誤魔化す修正を行わない**
  - 例: エンジンの mutation バグを UI 側でコピーして回避する
  - 例: 正しいソースが存在するにもかかわらず、計算値で上書きする
  - 例: `stateAfter` / `currentState` から逆算して「それらしい値」を表示する

- **場当たり的な修正を行わない**
  - 症状だけを隠す変更（表示を誤魔化す offset 加算など）は行わない
  - 根本原因を特定し、正しいソースから正しい値を読む実装をする

---

## 2. 実装前の既存コード確認原則

**既存コードを十分に読んでから実装する。**

### 確認すべき事項

1. **同種の処理が既存コードにあるか**
   - 例: SP を参照するなら、他のスロットや他のターン種別でどのように参照しているか
   - 例: コールバックを追加するなら、他のコールバック（`onSlotChange`, `onCommit` 等）の設計を確認する

2. **データ構造のライフサイクルを把握する**
   - `CharacterStyle` は `commitSkillPreview()` で in-place mutation される（shallow copy の共有参照問題）
   - `snapBefore` は `previewTurn` が mutation 前に取得した不変コピー（`Object.freeze`）
   - エンジンが返す不変データを UI が正しく参照できているかを確認する

3. **状態の流れを追う**
   - `initialState` → `computedStates[0]` → `computedStates[1]` ...
   - どの `state` が「ターン開始前」「ターン終了後」に対応するかを明示的に確認する

### 安易な実装を避ける例

❌ 悪い例（状態参照ソースが不明確）:
```js
const sp = member.sp?.current ?? '—';  // どの時点の SP か不明確
```

✅ 良い例（ソースを明確に選択）:
```js
// コミット済み: mutation 前の不変コピー（previewTurn が保存した値）
// 未コミット: currentState（常に最新・mutation の影響なし）
const sp = isCommitted
  ? (record.snapBefore?.find(s => s.partyIndex === member.partyIndex)?.sp?.current ?? '—')
  : (member.sp?.current ?? '—');
```

---

## 3. エンジンと UI 層の責務境界

```
┌─────────────────────────────────────────────────────────┐
│  エンジン層（src/）                                        │
│  - previewTurn: state を変更せず record を返す            │
│  - commitTurn: nextState + committedRecord を返す         │
│  - snapBefore: mutation 前の不変コピー（Object.freeze）    │
│  ※ 変更は src/ で完結させる。UI 側から mutation しない     │
└─────────────────────────────────────────────────────────┘
        ↓ record / nextState（不変オブジェクト or 凍結済みコピー）
┌─────────────────────────────────────────────────────────┐
│  TurnEngineManager（ui-next/engine/）                    │
│  - record・state の保管と再計算の管理                     │
│  - GUI の操作（slotActions）をエンジン呼び出しに変換       │
│  - previewCurrentTurn: state を変更せず予測値を返す        │
└─────────────────────────────────────────────────────────┘
        ↓ record / stateBefore / stateAfter
┌─────────────────────────────────────────────────────────┐
│  UI コンポーネント（ui-next/components/）                  │
│  - 受け取ったデータを表示するだけ                          │
│  - コミット済み行: record.snapBefore から SP を読む        │
│  - 未コミット行: currentState から SP を読む              │
│  ※ 独自計算・推測・mutation は行わない                    │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 既知の構造的制約

### CharacterStyle の shallow copy / mutation 問題

`commitTurn()` は `party: [...state.party]` という shallow copy を行い、
`commitSkillPreview()` が `CharacterStyle` を in-place mutation する。
結果として `initialState.party[i]` から `computedStates[N].party[i]` まで
すべて同じ `CharacterStyle` インスタンスを共有する。

**UI 層での対処**:
- コミット済み行の SP は `member.sp?.current` ではなく `record.snapBefore` から読む
- `snapBefore` は `snapshotPartyByPartyIndex` → `toCharacterSnapshot` → `Object.freeze` で
  mutation の影響を受けない不変コピー

**この制約はエンジン側の修正で将来解消される予定だが、UI 層でのパッチを適用しない**。
代わりに「正しいソースを参照する」修正を行う。

---

## 5. 新 UI 設計指針（ui-next 向け）

旧実装（`src/ui/dom-adapter.js`、8726行）の肥大化分析から導いた設計指針。
各原則には **旧実装での失敗例（ファイル・行番号付き）** を添付する。

### 肥大化の根本原因（概要）

| 原因 | 旧実装の規模 | 新 UI での対策 |
|-----|------------|--------------|
| ターン種別判定の UI 層重複 | `turnType === 'od'` が 50+ 箇所に散在 | エンジンの出力フィールドをそのまま表示に使う |
| SP 計算・制約検証の UI 再実装 | `spStrictMode` フラグが UI 層に存在 | `applySpChange` はエンジン層のみ、UI は呼び出しのみ |
| 状態の this フィールド分散 | `pendingInterruptOdLevel`, `preemptiveOdCheckpoint` 等 10+ 個 | 状態は `TurnEngineManager` に集約 |
| イベントハンドラ内での直接状態変更 | `this.state.turnState.odGauge = ...` | エンジン呼び出し → 返却 state で置き換え |
| 表示と制御の混在メソッド | `commitCurrentTurn` が 100行・4責務を兼任 | TurnRow / TurnArea / TurnEngineManager で役割分担 |
| 手動 snapshot 復元 | `restorePreemptiveOdCheckpoint` が 100行以上 | エンジン層の state を丸ごと置き換え |

---

### 原則1: エンジンの出力を信頼する

ターン制約・スキル制約・SP 制約の**判定**は `src/` に委ねる。UI は判定結果を受け取るだけ。

❌ 悪い例（`dom-adapter.js:3941`）— エンジンが既に検証しているのに UI 層で再検証:
```js
// UI 層での SP 検証（エンジン層と二重実装）
const rawSpCost = Number(effectiveSkill?.spCost ?? 0);
if (isSpConsuming && rawSpCost > 0 && member.sp.current < rawSpCost) {
  return null; // ← エンジン层が commitTurnRecord() 内で既に行っている
}
```

❌ 悪い例（`dom-adapter.js:6581`）— UI 層で OD ゲージを直接計算・代入:
```js
const nextOd = Math.min(OD_GAUGE_MAX_PERCENT, currentOd + REINFORCED_MODE_OD_GAUGE_BONUS);
this.state.turnState.odGauge = Number(nextOd.toFixed(2)); // ← 直接状態変更
```

✅ 良い例（`ui-next/engine/turn-engine-manager.js`）:
```js
// エンジン呼び出し → 返却された state / record だけを参照する
const { nextState, record } = commitTurnRecord(this.#currentState, replayTurn);
this.#currentState = nextState;
```

> **例外**: `isActionable` 程度の「表示専用の最小判定」は UI に置いてよい（`turn-row.js` の EX 待機表示など）。

---

### 原則2: 状態の持ち場を明確にする

| 状態 | 保持場所 | 禁止事項 |
|-----|---------|---------|
| `BattleState`・`ReplayScript` | `TurnEngineManager` | UI コンポーネントが自前でコピーを持たない |
| `computedRecords[]` | `TurnEngineManager` | UI コンポーネントが配列を直接変更しない |
| UI 固有フラグ（リセット可能） | 各 Controller の private フィールド | エンジン state に混入しない |

❌ 悪い例（`dom-adapter.js:4199`）— 一時状態が `this` フィールドに分散し、手動クリアが必要:
```js
// resetTurnReplayTransientState() で手動クリアが必要な一時状態群
this.pendingSwapEvents = [];
this.pendingInterruptOdLevel = null;
this.preemptiveOdCheckpoint = null;
this.interruptOdProjection = null;
this.previewRecord = null;
```

✅ 良い例（`ui-next/engine/turn-engine-manager.js`）:
```js
// 状態を TurnEngineManager に集約。UI は参照のみ
get currentState() { return this.#currentState; }
get computedRecords() { return this.#computedRecords; }
```

---

### 原則3: 条件分岐をエンジンの出力形式で吸収する

UI に `if (turnType === 'od') ... else if (turnType === 'extra') ...` を書かない。
エンジンが返す `record` / `state` のフィールドをそのまま表示に使う。

❌ 悪い例（`dom-adapter.js:7395` と `7470`）— 同じ判定が 2 か所に重複:
```js
// 判定1（行7395）
const isPreemptiveOdStep1 =
  String(this.state.turnState.turnType ?? '') === 'od' &&
  String(this.state.turnState.odContext ?? '') === 'preemptive' &&
  Number(this.state.turnState.remainingOdActions ?? 0) === Number(this.state.turnState.odLevel ?? 0);

// 判定2（行7470、まったく同じロジック）
const isPreemptiveOdStep1 = ...
```

✅ 良い例（`ui-next/components/turn-row.js`）:
```js
// エンジンが返したフィールドをそのまま表示判定に使う
const isExtra = rec.isExtraTurn;
const odMatch = String(rec.odTurnLabelAtStart ?? '').match(/^(OD\d+)/);
const odLabel = isExtra ? 'EX' : (odMatch ? odMatch[1] : '');
```

---

### 原則4: コンポーネントの責務境界を守る

```
TurnRow
 - 1ターンの表示と入力収集のみ
 - エンジン呼び出しなし、状態保持なし

TurnArea
 - ターンリストの管理
 - TurnEngineManager への委譲（自分で計算しない）

TurnEngineManager
 - エンジン bridge（計算・state 管理）
 - src/ の関数を呼ぶ唯一の場所
```

❌ 悪い例（`dom-adapter.js:3921`）— `commitCurrentTurn`（100行）が 4 責務を兼任:
```
1. UI 入力収集（collectActionDictFromDom）
2. SP 検証（UI 層で独自実装）
3. エンジン呼び出し（commitCurrentTurnState）
4. UI 更新（refreshMutationUi × 6回）
```

✅ 良い例（`ui-next/` の責務分離）:
```
TurnRow.getCurrentSlotActions()  → 入力収集のみ
TurnArea.#handleCommit()         → 委譲のみ（計算なし）
TurnEngineManager.commitNextTurn()→ エンジン呼び出しのみ
TurnRow.update()                 → 表示更新のみ
```

---

### 原則5: エンジン state を直接変更しない

`this.state.turnState.xxx = value` のような UI 層からの直接変更は禁止。
必ずエンジン関数を経由し、返却された新しい state で置き換える。

❌ 悪い例（`dom-adapter.js:6584`）:
```js
this.state.turnState.odGauge = Number(nextOd.toFixed(2)); // ← 直接書き換え
```

❌ 悪い例（`dom-adapter.js:6219`）:
```js
member.sp.current = Number(snap.sp?.current ?? member.sp.current); // ← 直接書き換え
```

✅ 良い例: エンジン関数を呼んで返却された state / record で内部状態を更新する。

# UI Next: エンジン連携バグ修正タスク

> **ステータス**: ✅ 完了（Task A / Task B 実装済み）
> **ブランチ**: `feature/ui-next-initial`（エンジンコード変更不要）
> **最終更新**: 2026-03-16

---

## 背景・共通する根本原因

`commitTurn()` が以下の shallow copy でステートを生成する：

```js
// src/turn/turn-controller.js:8530
let nextState = {
  ...state,
  party: [...state.party],  // ← shallow copy: メンバーオブジェクトは共有参照
  ...
};
```

`commitSkillPreview()` は `CharacterStyle` を in-place mutation する：

```js
// src/domain/character-style.js:549
this.sp.current = Number(preview.endSP);  // ← 直接書き換え
```

結果として `initialState.party[i]` / `computedStates[0].party[i]` / ... が
すべて同じ `CharacterStyle` インスタンスを指すため、commit のたびに
**全 state の SP が最新ターン後の値に上書き**される。

### なぜエンジン変更は不要か

`previewTurn()` が mutation より前に以下を実行している：

```js
// src/turn/turn-controller.js:8212
const snapBefore = snapshotPartyByPartyIndex(state.party);
```

`snapshotPartyByPartyIndex` → `toCharacterSnapshot` が：

```js
// src/contracts/interfaces.js:92
sp: Object.freeze({ ...character.sp })  // ← 不変コピー（mutation の影響を受けない）
```

この `snapBefore` は `fromSnapshot()` → `commitRecord()` を通じて
**`committedRecord.snapBefore[i].sp.current` として既に保持されている**。
正しいデータは既にエンジンの出力に存在する。UI 側が間違ったソースを参照していただけ。

---

## Task A: SP 表示バグ修正（コミット済み行が常に最新 SP を表示する問題）

### 症状

- T1 で SP コスト技を使った後、T1 行の SP 表示が T2 開始 SP と同じになる
- コミット済みの全ターン行が「最後にコミットした直後の SP」を表示してしまう

### 正しい修正

**ファイル**: `ui-next/components/turn-row.js`

`#buildFrontSlotHtml` と `#buildBackSlotHtml` の SP 取得ロジックを変更する。

**現在のコード（誤）**:
```js
// #buildFrontSlotHtml
const spDisplay = member.sp?.current ?? '—';   // mutated な値を読む

// #buildBackSlotHtml
const sp = member.sp?.current ?? '—';           // 同上
```

**修正後のコード**:
```js
// #buildFrontSlotHtml
// コミット済み行: record.snapBefore から読む（previewTurn が mutation 前に取得した不変コピー）
// 未コミット行: currentState から読む（常に正しい）
const spDisplay = isCommitted
  ? (this.#record.snapBefore?.find(s => s.partyIndex === member.partyIndex)?.sp?.current ?? '—')
  : (member.sp?.current ?? '—');

// #buildBackSlotHtml (isCommitted をパラメータで受け取っているので同様に)
const sp = isCommitted
  ? (this.#record.snapBefore?.find(s => s.partyIndex === member.partyIndex)?.sp?.current ?? '—')
  : (member.sp?.current ?? '—');
```

### 注意点

- `member.partyIndex` は D&D で position が変わっても不変なので、snapBefore のルックアップキーとして使える
- `snapBefore` は `Array<CharacterSnapshot>` で partyIndex 順にソート済み
  （`snapshotPartyByPartyIndex` が `sort((a,b) => a.partyIndex - b.partyIndex)` している）
- エンジンコードへの変更は一切不要

### 検証手順

1. T1 で前衛3枠に SP コスト 10 のスキルを選択してコミット
2. T1 行の SP が開始前の値（例: 8,8,8,7,7,7）を表示していることを確認
3. T2 が T1 後の値（例: 3,11,11,9,9,9）を表示していることを確認
4. T2 をコミットして T1 の表示が変化しないことを確認
5. T1 のスキルを変更して再計算 → T1 表示が正しく更新されることを確認

---

## Task B: OD ゲージ未コミット行 After 値ライブプレビュー

### 目的

未コミット行のターン情報列に `→ —` と表示されている OD After 値を、
スキル選択に応じてリアルタイムで `→050.00%` 形式で表示する。

### 修正箇所

#### 1. `ui-next/engine/turn-engine-manager.js` に `previewCurrentTurn()` を追加

```js
/**
 * 未コミット行のスキル選択に基づいて現在ターンをプレビューし、
 * 表示用の予測値を返す。state は変更しない。
 *
 * @param {Object<number, {skillId: number|null}>} slotActions position キー
 * @returns {{ odGaugeAfter: number } | null} プレビュー失敗時は null
 */
previewCurrentTurn(slotActions = {}) {
  const state = this.currentState;
  const actions = this.#buildActionsDict(state, slotActions);
  try {
    const previewRecord = previewTurnRecord(state, actions, null, 1);
    return {
      odGaugeAfter: Number(previewRecord.projections?.odGaugeAtEnd ?? state.turnState.odGauge ?? 0),
    };
  } catch {
    return null;
  }
}
```

#### 2. `ui-next/components/turn-row.js` に `onSkillChange` コールバックを追加（未コミット行用）

現在の `#bindEvents()` は `this.#record !== null` の場合のみ select の change イベントを
バインドしている（コミット済みターンの編集用）。
未コミット行のスキル変更を外部に通知するための専用コールバックが必要。

```js
// constructor / update に onPreviewRequest を追加
// (turnIndex, slotActions) => { odGaugeAfter: number } | null

// #bindEvents() 内、未コミット行のみ
if (this.#record === null) {
  this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const slotActions = this.getCurrentSlotActions();
      this.#onPreviewRequest?.(this.#turnIndex, slotActions);
    });
  });
}
```

#### 3. `ui-next/components/turn-area.js` でプレビュー結果を受け取り表示

```js
// #appendInputRow で onPreviewRequest を渡す
onPreviewRequest: (ti, slotActions) => this.#handlePreviewRequest(ti, slotActions),

// ハンドラ
#handlePreviewRequest(turnIndex, slotActions) {
  const preview = this.#engineManager.previewCurrentTurn(slotActions);
  const lastRow = this.#rowControllers.at(-1);
  lastRow?.updateOdPreview(preview?.odGaugeAfter ?? null);
}
```

#### 4. `TurnRowController.updateOdPreview(odGaugeAfter)` を追加

DOM の OD After 表示要素だけを更新する（full re-render 不要）。

```js
updateOdPreview(odGaugeAfter) {
  const el = this.#root.querySelector('[data-od-after]');
  if (!el) return;
  el.textContent = odGaugeAfter != null
    ? `→${formatOdGauge(odGaugeAfter)}`
    : '→ —';
}
```

`#buildTurnInfoHtml` の未コミット行に `data-od-after` 属性を持つ要素を追加する。

### 注意点

- `previewTurnRecord` は state を変更しない（previewTurn は mutation しない）
- スキル変更のたびに previewTurnRecord を呼ぶが、軽量な処理なのでパフォーマンス問題にはならない
- 失敗時（スキルが使えない等）は `→ —` に戻す

---

## 作業順序

1. **Task A を先に実装・検証する**（単純・独立・既存バグ修正）
2. **Task B を実装する**（Task A の後が望ましいが独立可能）

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `ui-next/components/turn-row.js` | Task A + Task B（スキル変更イベント・OD After 表示） |
| `ui-next/engine/turn-engine-manager.js` | Task B（previewCurrentTurn 追加） |
| `ui-next/components/turn-area.js` | Task B（ハンドラ追加） |
| `src/contracts/interfaces.js` | 参照用: `snapshotPartyByPartyIndex`, `toCharacterSnapshot` |
| `src/turn/turn-controller.js` | 参照用: `previewTurn` (8209行), `commitTurn` (8242行) |
| `src/records/record-assembler.js` | 参照用: `fromSnapshot`, `buildTurnContext`, `commitRecord` |

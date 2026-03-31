# UI Next D&D コードレビュー — Findings

> **ステータス**: ✅ 完了 | 📅 作成: 2026-03-28 | 🔄 最終更新: 2026-03-29
> **依頼元**: [review_ui_next_drag_and_drop.prompt.md](review_ui_next_drag_and_drop.prompt.md)
> **レビュー対象 branch**: `feature/ui-next-layout-rework`

---

## 総括

現行の handler 配線・委譲パターン・swap ロジックは論理的に正しい。大規模な再設計は不要。
ブラウザ native の HTML5 D&D edge case を補完する小さな修正で復旧する可能性が高い。

---

## PartySetup: D&D が開始すらしない

### F-PS-1 (Critical — 最も疑わしい直接原因): drag handle が小さすぎる / テキストノード干渉

**対象**: [ui-next/components/party-setup.js](../../ui-next/components/party-setup.js) `#slotHtml()` 内 (L865 付近)

slot header の構造:

```html
<div data-action="select-reorder-slot"
     role="button" tabindex="0"
     draggable="true"
     class="... py-0.5 cursor-grab active:cursor-grabbing select-none ...">
  ${index + 1}
</div>
```

- `py-0.5` のみの非常に小さな要素。数字 1 文字分の高さしかない
- ブラウザが内部テキストノード（数字 `1`〜`6`）を掴もうとして native text drag を試み、HTML5 D&D の `dragstart` が発火しない可能性
- 実ブラウザで drag ghost が出ないとの報告は、**`dragstart` イベント自体が発火していない** ことを意味する

### F-PS-2 (High): `click` ハンドラとの競合による DOM 破壊の可能性

**対象**: [ui-next/components/party-setup.js](../../ui-next/components/party-setup.js) `#render()` 内 (L804-L827)

同一要素に `click`、`keydown`、`dragstart`、`dragend` の 4 つのリスナーが共存。

- `click` ハンドラ → `#handleTapReorder()` → `this.#tapReorderSrcIndex = slotIndex` → `this.#render()` → **DOM 丸ごと再構築**
- drag 閾値に達する前に mouseup → click が発火すると、DOM が消えて進行中の drag 準備が中断される
- ただし正常動作では drag 操作中は click が発火しないため、**主原因は F-PS-1 の方が疑わしい**

### F-PS-3 (Medium): dragover / drop 委譲は正しく残存

**対象**: [ui-next/components/party-setup.js](../../ui-next/components/party-setup.js) `#bindDragAndDropDelegation()` (L669-L708)

- `mount()` 時に 1 回だけ `this.#root` に `dragover` / `drop` を委譲。`#render()` で innerHTML を書き換えても委譲側は生き残る
- `#resolveSlotElement()` は `target.closest('[data-slot]')` で解決。slot header は `data-slot-index` を持つが `data-slot` は持っていない。ただし parent の `<div data-slot="${index}">` を正しく見つけるため、**この部分は問題なし**
- `event.dataTransfer.setData('text/plain', '')` は呼んでいる → Firefox 問題は OK

### PartySetup 最小修正案

1. slot header に `-webkit-user-drag: element` を CSS で明示
2. slot header の padding を拡大（`py-0.5` → `py-1` 以上）して掴みやすくする
3. 上記で改善しない場合、handle 要素に `mousedown` で `e.preventDefault()` を追加してテキスト選択を抑止（ただし `click` イベントへの影響に注意）

---

## TurnEdit: D&D は発火するが swap が成立しない

### F-TR-1 (Critical — 直接原因): `dragstart` で `setData()` が呼ばれていない

**対象**: [ui-next/components/turn-row.js](../../ui-next/components/turn-row.js) `#bindDragAndDrop()` (L2813-L2818)

```js
slot.addEventListener('dragstart', (event) => {
  this.#dragSrcPosition = Number(slot.dataset.position);
  event.dataTransfer.effectAllowed = 'move';
  // ← event.dataTransfer.setData('text/plain', '') が無い
  slot.classList.add('opacity-40');
});
```

- **Firefox では `dragstart` で `setData()` を 1 回も呼ばないと drag operation 自体がキャンセルされる**
- Chrome は寛容だが将来のバージョンで動作が変わりうる
- PartySetup 側は `setData('text/plain', '')` を呼んでいるのに TurnRow 側は呼んでいない

### F-TR-2 (High): `<select>` 要素が drag を妨害

**対象**: [ui-next/components/turn-row.js](../../ui-next/components/turn-row.js) フロントスロット HTML テンプレート (L1918-L1935)

```html
<div draggable="true" data-turn-slot data-position="${member.position}">
  <div data-role="slot-select-row">
    <select data-skill-select ...>...</select>   ← ここが drag を奪う
  </div>
  <div data-role="slot-body">
    <img draggable="false" .../>
    ...
  </div>
</div>
```

- `<select>` はブラウザがネイティブに interactive として扱い、mousedown をキャプチャする
- `<select>` 上で mousedown するとドロップダウン表示が優先され、親の `draggable="true"` の drag 操作が妨害される
- フロントスロットの上半分（select 領域）をドラッグしようとしても drag が始まらない

### F-TR-3 (Medium): `dragover` の `preventDefault()` が条件付き

**対象**: [ui-next/components/turn-row.js](../../ui-next/components/turn-row.js) `#bindDragAndDrop()` dragover handler (L2833-L2854)

```js
this.#root.addEventListener('dragover', (event) => {
  if (this.#dragSrcPosition === null) return;             // early return → preventDefault 呼ばれない
  const slot = this.#resolveDragSlot(event.target);
  if (!slot) { this.#clearDragHighlights(); return; }     // early return → preventDefault 呼ばれない
  if (!this.#isSwapAllowed(...)) { ...; return; }          // early return → preventDefault 呼ばれない
  event.preventDefault();   // ← ここに到達しないと drop が不可能
});
```

- HTML5 D&D では `dragover` で `preventDefault()` を呼ばないと drop 不可
- swap 不可な場所で drop させない意図は正しいが、`#resolveDragSlot()` が null を返すケース（スロット間 padding やボタン領域を hover 中）で drop 不可になる
- 素早くドラッグして drop すると、直前の dragover が preventDefault していないため drop が無効になる場合がある

### F-TR-4 (Info): `draggable` 属性の文字列化は問題なし

`draggable="${draggable}"` で boolean が `"true"` / `"false"` に文字列化されるが、HTML5 仕様上これは正しい。

### TurnEdit 最小修正案

**最優先 — 1 行追加:**

```js
// turn-row.js #bindDragAndDrop() の dragstart 内
slot.addEventListener('dragstart', (event) => {
  this.#dragSrcPosition = Number(slot.dataset.position);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', '');  // ← 追加
  slot.classList.add('opacity-40');
});
```

**追加対策（必要に応じて）:**

1. `<select>` 上でのドラッグ対策: ドラッグ専用 handle 領域（アイコン `[data-turn-slot-icon]` 等）を分離
2. `dragover` の先頭で常に `preventDefault()` を呼び、`dropEffect` で許可/禁止を視覚表現する方式への変更

---

## JSDOM テストが PASS なのにブラウザで壊れる理由

### F-TEST-1 (Structural): JSDOM は HTML5 D&D の native シーケンスを実装していない

JSDOM テストの D&D 検証は以下をやっている:
1. `new Event('dragstart')` を手動生成し dispatch
2. `dataTransfer` をモック（`{ effectAllowed: '', setData() {} }`）
3. `new Event('drop')` を手動生成し dispatch

ブラウザの実際の D&D では:
- `mousedown` → マウス移動が drag threshold を超える → ブラウザが `dragstart` を生成
- `dragstart` で `setData()` を呼ばないと Firefox は drag をキャンセル
- `dragover` で `preventDefault()` を呼ばないと drop が発火しない
- drag 中の `event.target` はブラウザが hit-test で決定

### 具体的なギャップ一覧

| ブラウザの挙動 | JSDOM テストでカバー | 解説 |
|---|---|---|
| `dragstart` が発火するか | **No** | 手動 dispatch |
| `setData()` が必要か | **No** | モック |
| `dragover` で `preventDefault` 必須 | **No** | party-setup テストでは dragover すら dispatch していない |
| `<select>` が drag を阻害 | **No** | native behavior |
| drop target の hit-test | **No** | 手動で target を指定 |
| drag ghost の生成 | **No** | visual のみ |

### テスト改善案

1. `dragover` → `drop` の完全 sequence をテストに追加
2. `dragOverEvent.defaultPrevented === true` の assert を追加
3. `dragstart` で `setData` が呼ばれることを spy で検証

---

## HTML5 D&D の典型的な罠（参考）

| 罠 | 該当箇所 |
|---|---|
| `dragstart` で `setData()` を呼ばないと Firefox で drag がキャンセル | **turn-row.js で該当 (F-TR-1)** |
| `dragover` で `preventDefault()` しないと drop が不可能 | 条件付きだが構造的には OK (F-TR-3) |
| `<select>` / `<input>` などの form 要素が drag を妨害 | **turn-row.js のフロントスロットで該当 (F-TR-2)** |
| `draggable="true"` の内側に `<img>` があると img 自体の default drag が発動 | `draggable="false"` で対処済み ✅ |
| 小さすぎる drag handle でブラウザの drag threshold に到達しにくい | **party-setup.js の slot header で該当の可能性 (F-PS-1)** |
| innerHTML 再描画で DOM ノードが消えると進行中の drag が中断 | 理論上あるが、drag 中に render を呼ぶ経路は確認されず ✅ |

---

## 修正優先度まとめ

| # | 対象 | Finding | 修正内容 | 工数 |
|---|------|---------|----------|------|
| 1 | turn-row.js | F-TR-1 | `setData('text/plain', '')` 追加 | 1 行 |
| 2 | party-setup.js | F-PS-1 | handle の padding 拡大 + `-webkit-user-drag: element` | 数行 |
| 3 | テスト | F-TEST-1 | dragover dispatch + defaultPrevented assert 追加 | 小 |
| 4 | turn-row.js | F-TR-2 | `<select>` と drag handle の分離検討 | 中（要設計） |
| 5 | turn-row.js | F-TR-3 | dragover の preventDefault 戦略見直し | 中（要設計） |

---

## 実施した修正と追加バグの発見・対処

> 以下は本レビュー結果を受けて 2026-03-28〜29 に実施した修正の記録。

### BUG-1: `#resolveInputRowSlotActions` — 後衛メンバーを解決に含めてしまう

**症状**: iPhone tap-swap / PC D&D でスワップ後、`buildInputRowSnapshot()` → `#buildActionsDict()` が  
`"Action is allowed only for front positions (0..2). got=3"` をスロー。

**原因**: `#resolveInputRowSlotActions()` が `swapCurrentPositions()` 後の stale な `slotActions`（partyIndex キー）を
position に変換する際、前衛から後衛に移動したメンバーのスキルまでマッピングし、back-row position を `#buildActionsDict` に渡していた。

**修正** (`turn-engine-manager.js`):
- `#resolveInputRowSlotActions` に `member.position > 2` ガードを追加。後衛メンバーはスキップ。

### BUG-2: `commitNextTurn` が partyIndex キーの slotActions を未解決のまま渡す

**症状**: BUG-1 修正後も、コミット時に同じ `"Action is allowed only for front positions(0..2) got=3"` が発生。

**原因**: `commitNextTurn` は `getCurrentSlotActions()`（partyIndex キー）を直接 `#buildActionsDict` / `#buildReplayTurn` に渡していた。
`buildInputRowSnapshot` 側で追加した `#resolveInputRowSlotActions` 呼び出しが `commitNextTurn` 経路には適用されていなかった。

**修正** (`turn-engine-manager.js`):
- `commitNextTurn` 内で `#buildActionsDict` / `#buildReplayTurn` に渡す前に `#resolveInputRowSlotActions` を呼ぶよう追加。

### BUG-3: edit モードで D&D / tap-swap が動作しない

**症状**: コミット済みターンを編集モードにした際、D&D や tap-swap でのメンバー入れ替えが一切反映されない。

**原因（3 つの問題の複合）**:

1. **`draggable` / イベントバインドが edit モードで無効**  
   `turn-row.js` の 4 箇所で `#isInputMode()` が使われていたため、`rowMode === 'edit'` では
   `draggable="true"` が設定されず、tap / D&D のイベントバインドもスキップされていた。  
   → `#isInputMode()` を `#isDraftMode()`（input + edit の両方で true）に変更。

2. **edit 行に `onSlotChange` コールバック未設定**  
   `#appendEditRow()` で `TurnRowController` を生成する際、`onSlotChange` コールバックが渡されていなかった。
   そのため swap イベントが `#handleSwap` → `#handleEditSwap` に到達しなかった。  
   → `onSlotChange: (ti, position, action) => this.#handleSlotChange(ti, position, action)` を追加。

3. **`#refreshEditRow()` がスワップ後の draft を上書き**  
   `#handleEditSwap` で `editSession.draft.slots` をスワップした後、`#refreshEditRow()` が
   `row.getCurrentTurnEditDraft()`（行の内部状態 = スワップ前）を読み、`this.#editSession` を上書きしていた。  
   → `#refreshEditRow(draftOverride = null)` にオプションパラメータを追加。
   `#handleEditSwap` からスワップ済み draft を直接渡し、stale な内部状態での上書きを回避。

**修正ファイル**:
- `turn-row.js`: `#isInputMode()` → `#isDraftMode()` を 4 箇所（front slot draggable, back slot draggable, icon tap bind, D&D bind）
- `turn-area.js`: `#appendEditRow` に `onSlotChange` 追加、`#handleEditSwap` 新設、`#refreshEditRow(draftOverride)` パラメータ追加

### 追加した E2E テスト

| テストファイル | カバー内容 |
|---|---|
| `tests/e2e/turn-row-drag-and-drop.spec.js` | tap front↔back, tap front↔front, D&D front↔back, exclusive skill after swap, commit after swap |
| `tests/e2e/party-setup-drag-and-drop.spec.js` | D&D front↔back, tap front↔back, D&D front↔front |
| `tests/e2e/session-save.spec.js` | 4 chars → apply → JSON save → download content verify |
| `tests/e2e/turn-edit-swap.spec.js` | 4 chars → commit #1,#2 → edit #1 → D&D front↔back swap in edit mode |

### テスト結果（2026-03-29）

- E2E (Playwright): **11/11 passed**
- Unit (node --test): **617/617 passed**

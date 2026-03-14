# サポート枠UI改善タスクリスト

> **ステータス**: ✅ 完了 | 📅 最終更新: 2026-03-12

## 目的

1. **共鳴アビリティ表示の改善**: スロット内のサポート枠選択直下に、視覚的に目立つスタイルで表示する
2. **サポート枠選択フィルタリング**: 「共鳴あり / なし / すべて」のトグルで絞り込み表示

## 対象ファイル

- `src/ui/dom-adapter.js` — UI生成・更新ロジック
- `ui/index.html` — インラインCSSスタイル追加

---

## タスクA: 共鳴アビリティ表示のスタイリング改善

### 現状

- `resonance-detail` div はスロット内のサポートLBセレクトの直後に存在する
- プレーンテキスト（`[共鳴] Name: desc`）でスタイリングなし
- サポート選択後に表示されるが視認性が低い

### 実装内容

**A-1: `ui/index.html` に CSS 追加**

```css
[data-role="resonance-detail"] {
  font-size: 0.82rem;
  background: #eef4ff;
  border-left: 3px solid #5b8fd6;
  border-radius: 4px;
  padding: 4px 8px;
  color: #1a3a6b;
  line-height: 1.4;
  min-height: 1.2em;
}
[data-role="resonance-detail"]:empty {
  display: none;
}
```

**A-2: `dom-adapter.js` の `updateResonanceDetail()` 改善**

- パッシブ名を `<strong>` でボールド表示
- desc を改行対応で表示（`\n` → `<br>`）
- 「共鳴なし」（resonance フィールドなし）の場合は明示的に「（共鳴なし）」を薄く表示

### チェックリスト

- [x] `ui/index.html` に `.resonance-detail` CSS を追加
- [x] `updateResonanceDetail()` を innerHTML ベースに変更（strong タグでパッシブ名を強調）
- [x] サポートなし時は空表示（`:empty` CSS で非表示）
- [x] 共鳴パッシブなし（resonance フィールド未設定）のスタイルを選択したとき「（共鳴アビリティなし）」を薄く表示

---

## タスクB: サポート枠選択フィルタリング機能

### 現状

- `populateSupportStyleSelect()` は全候補（属性マッチするSS/SSR）を表示
- 候補が多い場合に共鳴アビリティがあるスタイルを選びにくい

### 実装内容

**B-1: フィルタートグル UI の追加（各スロットに）**

各スロットの `support-style-select` の直前にトグルを追加：
```html
<select data-role="support-resonance-filter" data-slot="i">
  <option value="all">すべて</option>
  <option value="with">共鳴あり</option>
  <option value="without">共鳴なし</option>
</select>
```

**B-2: `populateSupportStyleSelect(slotIndex, mainStyleId)` のフィルタ対応**

- `data-role="support-resonance-filter"` の現在値を読み取る
- `"with"`: `resonance` フィールドが非空のスタイルのみ表示
- `"without"`: `resonance` フィールドが空のスタイルのみ表示
- `"all"`: フィルタなし（現行動作）

**B-3: イベントハンドラに `support-resonance-filter` change を追加**

```js
if (target.matches('[data-role="support-resonance-filter"]')) {
  const slot = toInt(target.getAttribute('data-slot'), 0);
  const styleSelect = this.root.querySelector(`[data-role="style-select"][data-slot="${slot}"]`);
  this.populateSupportStyleSelect(slot, styleSelect?.value ?? '');
}
```

**B-4: `updateSupportSlotVisibility()` でフィルタートグルも表示/非表示制御**

SS/SSR でないとき（サポート枠非対象）はフィルタートグルも非表示にする。

### チェックリスト

- [x] `renderPartySelectionSlots()` にフィルタートグル（select）を追加
- [x] フィルタートグルを `updateSupportSlotVisibility()` で表示/非表示制御
- [x] `populateSupportStyleSelect()` にフィルタリングロジック追加
- [x] イベントハンドラに `support-resonance-filter` change ハンドラを追加
- [x] `applySelectionState()` でフィルタートグルをリセットしないよう確認

---

## テスト計画

ユニットテスト（`tests/dom-adapter-ui-selection.test.js` に追加）:

- [x] フィルタ「共鳴あり」選択後: support-style-select のオプションが全て `resonance` 非空スタイルのみになること
- [x] フィルタ「共鳴なし」選択後: support-style-select のオプションが全て `resonance` 空スタイルのみになること
- [x] フィルタ「すべて」選択後: 候補が全件表示されること
- [x] `resonance-detail` に共鳴あり選択時: パッシブ名が表示されること
- [x] `resonance-detail` に共鳴なし選択時: 空または「共鳴なし」表示になること

---

## バグ修正（実装後発覚）

### `ui/app.js` で `support_skills.json` が未フェッチ（2026-03-12修正）

**症状**: ブラウザで共鳴アビリティが全件「（共鳴アビリティなし）」と表示される

**原因**: `ui/app.js` の `HbrDataStore.fromRawData(payload)` に `support_skills.json` が含まれておらず、`supportSkills = []` で初期化されていた。テスト環境は `HbrDataStore.fromJsonDirectory()` を使うため Node.js から直接読み込まれておりテストでは発覚しなかった。

**修正**: `ui/app.js` の payload に追加：
```js
supportSkills: await fetchJsonOrFallback('../json/support_skills.json', []),
```

**教訓**: `json/` 配下に新しい JSON ファイルを追加した場合は、**必ず `ui/app.js` の payload にも追加すること**。テストが PASS でもブラウザで動作しない可能性がある。

---

## 完了条件

- [x] `npm test` 全件 PASS（476テスト）
- [x] `docs/README.md` ステータス更新

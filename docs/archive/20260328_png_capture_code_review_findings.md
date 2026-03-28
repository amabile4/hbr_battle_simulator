# PNG Capture Code Review — Findings（アーカイブ）

> **ステータス**: 🗄️ アーカイブ | 📅 アーカイブ日: 2026-03-28
>
> **依頼元**: [`../active/ui_next_png_capture_review_request.md`](../active/ui_next_png_capture_review_request.md)
>
> **後継ドキュメント**:
> [`../active/ui_next_design.md`](../active/ui_next_design.md),
> [`../active/ui_next_implementation_tasklist.md`](../active/ui_next_implementation_tasklist.md)

### F1 (Critical) — Note 列の `flex-grow` が Slots の幅を奪っている

**根本原因の最有力候補。「左半分だけ描画・右半分が白い空白」を直接説明できる。**

`ui-next/styles.css` L60-64 の capture 用 CSS：
```css
[data-capture-mode="png"] [data-turn-note] {
  flex: 1 1 12rem !important;
  width: auto !important;
  min-width: 12rem;
}
```

`ui-next/components/turn-row.js` L1617 で note 列の live DOM クラスは `flex-shrink-0 w-36`（固定幅 144px）。
`ui-next/components/turn-row.js` L1641 で slots 列は `flex gap-px flex-1 min-w-0`（Tailwind `flex-1` = `flex: 1 1 0%`）。

**Live DOM の幅配分**（turn-area 幅 ~840px の場合）：
| 要素 | flex | 幅 |
|-------|------|----|
| info | shrink-0 | ~136px |
| slots | flex-1 | **~450px** |
| buttons | shrink-0 w-[110px] | 110px |
| note | shrink-0 w-36 | 144px |

**Clone での幅配分**（buttons が hidden で消えた状態）：

note に `flex: 1 1 12rem` が適用されるため、slots (grow=1, basis=0%) と note (grow=1, basis=12rem) が残り空間を等分配する。

| 要素 | flex | basis | 幅 |
|-------|------|-------|----|
| info | shrink-0 | — | ~136px |
| slots | 1 1 0% | 0px | **~256px** ← 45%縮小 |
| note | 1 1 12rem | 192px | **~448px** ← 3倍膨張 |

6 キャラクターのカード群が 256px に圧縮され「左半分」に見え、note の白い textarea が 448px に膨らんで「右半分が白い空白」に見える。

---

### F2 (High) — Container query コンテキストが clone に存在しない

`ui-next/utils/png-capture.js` L54-66 の `buildPngCaptureClone()` で生成される `captureRoot` は素の `div`。

一方 `ui-next/styles.css` L215-217 で live DOM の `#turn-area` はコンテナを定義している：

```css
#turn-area {
  container-type: inline-size;
  container-name: turn-area;
}
```

`captureRoot` には `container-type` も `container-name` もないため、`@container turn-area (min-width: 720px)` 等のルールは **一切発火しない**。

影響：
- `styles.css` L700-701: `[data-turn-front-group] { flex: 1 }` / `[data-turn-back-group] { flex: 1 }` が適用されず、デフォルトの前衛 2:後衛 1 になる
- `styles.css` L609-665: 狭幅用 2 行レイアウト（wrap + order:10）も発火しない
- `--turn-*` custom property は `png-capture.js` L32-44 の `copyTurnLayoutCustomProperties()` で手動コピーしているため値自体は維持されるが、**非カスタムプロパティの構造ルール**（flex, flex-wrap, order, width override 等）はすべて失われる

---

### F3 (Medium) — `#turn-area` ID セレクタが clone にマッチしない

`styles.css` L763-766 のレイアウト切替ルール：

```css
@container turn-area (min-width: 720px) {
  #turn-area[data-turn-slot-layout="split"] [data-turn-front-group] { flex: 2; }
  ...
}
```

F2 を修正して `captureRoot` にコンテナを設定しても、`#turn-area` というIDセレクタは `captureRoot` にマッチしない。`data-turn-slot-layout` のレイアウト分岐が clone で死ぬ。

---

### F4 (Low) — テストはレイアウト崩れを検出できない

`tests/ui-next-png-capture.test.js` は JSDOM ベースで DOM 構造（行数、hidden 属性、dataset 値）のみを検証している。JSDOM にはレイアウトエンジンがないため flexbox 配分の崩れは原理的に検出できない。これは JSDOM テストとして仕方ないが、今回のバグクラスは test gap に該当する。

---

## 根本原因の仮説（優先度順）

1. **F1 — Note flex-grow 競合**（確信度: 高）
   buttons hidden 後の余白を note に回す CSS が slots も巻き込んで縮小させている。これが直接の「右半分白い」原因。
2. **F2 — Container query コンテキスト欠如**（確信度: 高）
   前衛/後衛の flex 比率・狭幅レイアウト等が正しくない。F1 と併発して悪化を増幅。
3. **F3 — ID セレクタ不一致**（確信度: 中）
   F2 を直しても ID 起因で一部ルールが効かない残留バグ。

---

## 最小修正案

### Step 1: Note 列の flex-grow を止める（F1 解消）

`ui-next/styles.css` L60-64 を変更：

```css
/* 修正前 */
[data-capture-mode="png"] [data-turn-note] {
  flex: 1 1 12rem !important;
  ...
}

/* 修正案 A: note を grow させず、slots に全余白を渡す */
[data-capture-mode="png"] [data-turn-note] {
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: 15rem;   /* buttons 分（~110px）を加味して拡大 */
}

/* 修正案 B: slots の grow を圧倒的に高くする */
[data-capture-mode="png"] [data-turn-slots] {
  flex: 999 1 0% !important;
}
```

修正案 A が最もシンプルで副作用が少ない。

### Step 2: Container query コンテキストを復元（F2 解消）

`ui-next/utils/png-capture.js` L54-66 の `captureRoot` 生成に追加：

```javascript
captureRoot.style.containerType = 'inline-size';
captureRoot.style.containerName = 'turn-area';
```

これで `@container turn-area (min-width: ...)` が `captureWidth` ベースで正しく発火する。

### Step 3: ID セレクタ問題の回避（F3 解消）

`turnAreaRoot` の `data-turn-slot-layout` を `captureRoot` にコピーし、CSS 側の `#turn-area[data-turn-slot-layout="..."]` を `[data-turn-slot-layout="..."]` に緩和する。

---

## 代替案（現方針自体が脆い場合）

**In-place capture**：clone を作らず、live DOM 上で一時的にボタン列を `hidden` にし、直接 `toPng(turnAreaRoot)` で撮る。撮影後に復元。

長所：container query・custom property・flex layout すべてがそのまま動く。clone / offscreen の問題が全滅。
短所：撮影中の一瞬、live DOM に視覚的変化が出る（offscreen なら回避できるが、ちらつきは `requestAnimationFrame` 1 フレーム以内）。

現方針の clone capture は html-to-image の foreignObject シリアライズとコンテナクエリの相性が根本的に脆いため、修正を重ねるよりも **in-place capture + 後復元** に切り替えるほうが堅い選択肢。

---

## html-to-image / clone capture でやりがちな罠（補足）

| 罠 | 影響 |
|----|------|
| Container query が clone で発火しない | 今回の F2。clone が containment context の外にあると全ルール死ぬ |
| CSS custom property の継承チェーンが切れる | `#turn-area` に定義したベース値が clone には引き継がれない（手動コピーで対処済み） |
| Tailwind CDN のスキャンが clone を拾わない可能性 | CDN は MutationObserver でクラスを検出するが、タイミング次第で漏れる |
| SVG foreignObject 内で `@container` が効かない | html-to-image は最終的に SVG で描画するため、container query は二重に効かないリスク |
| `position: fixed` + `left: -100000px` で `getBoundingClientRect` がずれる | 幅自体は正しいが、座標系が大幅にずれるため一部ライブラリが誤認する |

## 実装で参考にしたところ

- `F1`: note 列の `flex-grow` が slots 幅を奪う指摘を採用した。capture 時は note を grow させず、live note 幅と hidden button 幅を clone root の custom property に載せる方針へ修正した。
- `F2`: container query context 欠落の指摘を採用した。`captureRoot` に `container-type` / `container-name` を転写し、clone 側でも `@container turn-area` が発火する前提を復元した。
- `F3`: `#turn-area` ID セレクタ不一致の指摘を採用した。`data-turn-slot-layout` を clone root にコピーし、CSS 側も clone root で効く selector に緩和した。
- `F4`: JSDOM ではレイアウト崩れを直接検出できない test gap の指摘は部分採用した。レイアウトそのものではなく、clone contract（source・metadata・hidden 状態・非破壊性）を JSDOM テストで固定した。

## 今回は採用しなかったところ

- `修正案 B`: `[data-turn-slots] { flex: 999 1 0% }` は採用しなかった。slots 側へ強い比率を足すより、note 幅を明示的に固定するほうが副作用と依存が少ないと判断した。
- `in-place capture + 後復元`: 常用ルートには採用しなかった。live DOM を一時改変すると、ちらつき、focus/scroll 変化、capture 中 rerender、例外時の復元漏れが新しい回帰源になるため。
- `clone capture は根本的に脆いので直ちに方式変更`: 即時の採用は見送った。今回の不具合は clone root への metadata / 幅メトリクス集約で解消し、修正点も `png-capture.js` 周辺に閉じたため、まずは clone contract を明文化して維持する方針を採った。
- `foreignObject` / Tailwind CDN / offscreen 座標系の一般論すべてに対する追加対策`: 追加実装は入れていない。現ブラウザで再現した実害に直結した論点だけを採用し、それ以外は監視項目として残した。

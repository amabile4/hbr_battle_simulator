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

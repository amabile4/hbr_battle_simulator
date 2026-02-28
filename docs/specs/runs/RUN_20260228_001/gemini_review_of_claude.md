[HANDSHAKE] provider=gemini model=gemini-2.0-flash session=n/a ts=2026-02-28T01:15:00Z

Claudeによる「行動記録システム 設計提案書」をレビューしました。全体として、合意済みの要求事項（R1-R10）を網羅し、不変性（Immutability）と依存性の分離が徹底された優れた設計です。

以下にGemini視点でのレビュー結果を報告します。

---

## 1. 整合性レビュー (R1-R10)

合意済みの `spec_review_state.json` (agreed_v1) との整合性は非常に高いです。

*   **R4 (Immutable Store):** `BattleRecordStore` および `RecordEditor` の純粋関数化により、Reduxライクな状態管理が容易になっています。
*   **R6 (SP変動履歴):** `SPChangeEntry` が `source` や `eventCeiling` を持っている点は、HBR特有の複雑なSP計算（OD中の上限99、通常時の上限突破など）を正確にトレースできるため高く評価します。
*   **R9 (編集操作):** `cascade` オプションを伴う `deleteRecord` は、OD/Extraターンの整合性を維持するために必須の機能であり、考慮が漏れていません。

---

## 2. ターン制御システムとのインターフェース

### 観点: `TurnRecord` / `TurnContextInput` の境界

*   **[MAJOR] `swapEvents` の記録タイミング**
    *   設計では `swapEvents` が `commitRecord` (committed段階) でのみ設定されるようになっていますが、UI上の「プレビュー」状態でも、現在の前衛・後衛の入れ替え状態（Swap履歴）を保持・表示する必要があります。
    *   **提案**: `swapEvents` を `TurnRecord` の共通フィールドとし、`previewTurn` 呼び出し時点（あるいはターン内の動的な操作）でも記録可能にすべきです。

*   **[MINOR] `turnLabel` の決定権**
    *   `TurnContextInput` で `turnLabel` を文字列として受け取っていますが、この生成ロジック（"T1", "OD1-1"など）は `TurnController` と `RecordAssembler` のどちらが持つべきか明確にする必要があります。
    *   **提案**: `TurnController` が現在のフェーズを最もよく知っているため、ラベル生成ロジックは `TurnController` に持たせ、`RecordAssembler` はそれを受け取るだけという現在の設計を支持します。

---

## 3. 問題点・不足点

### [MAJOR] CSVエクスポートにおけるキャラクターの固定（列の不変性）
設計 5. のCSV列順序 `[char0.startSP, char0.action, char0.endSP]` において、`char0` が「そのターンのPosition 0」を指す場合、交代（Swap）が発生した際に、同じ列に異なるキャラクターのデータが混在することになります。表計算ソフトでの分析（例：特定キャラのSP推移グラフ作成）が困難になります。

### [MINOR] 負債SPのバリデーション
`SPChangeEntry` で負債SP（マイナス）を許可していますが、ゲームシステム上、特定の条件下（OD終了時など）で0にクランプされる挙動があります。`SpChangeSource` に `clamp` が含まれているのは良いですが、`CharacterSnapshot` の `sp.min` が常に 0 なのか、負債を許容するのかの定義が若干曖昧です。

### [SUGGESTION] `ActionEntry` への `isExtraAction` フラグ
Extra Turn内での行動か、通常ターン内での行動かをアクション単位で識別できると、将来的なダメージ計算時の補正値判定に役立ちます。

---

## 4. 具体的提案

### 修正案 1: CSVエクスポートの列定義（キャラクター固定）
CSVの列は「ポジション順」ではなく、**「初期パーティ組成時のインデックス」**で固定することを推奨します。

```typescript
// CsvExporter.exportToCSV の引数に初期パーティ情報を追加
exportToCSV(
  store: BattleRecordStore,
  initialParty: CharacterSnapshot[] // バトル開始時の6人（固定順）
): string;
```
これにより、列 A=キャラ1(Ruka), 列 B=キャラ2(Karen) ... と固定され、ターン中にポジションが変わっても、同じキャラのデータは常に同じ列に出力されます。

### 修正案 2: `TurnRecord` の `snapBefore` 定義
`Q-CL1` への回答に関連しますが、`snapBefore` は「コマンド入力直前」の状態を指すべきです。
1.  ターン開始時（Base SP回復後）
2.  **[ココ]** スキル選択（Preview生成）
3.  実行
4.  ターン終了処理（SnapAfter）

---

## 5. CSV 仕様の完全性確認

Google Spreadsheet互換性については、以下の構成で概ね完全です。

| 列番号 | ヘッダー例 | 内容 |
| :--- | :--- | :--- |
| 1 | Turn | `turnLabel` (例: OD1-2) |
| 2 | Enemy | `enemyAction` |
| 3-5 | Chara1 (Start/Act/End) | 初期パーティ1人目のSPと行動 |
| 6-8 | Chara2 (Start/Act/End) | 初期パーティ2人目のSPと行動 |
| ... | ... | ... |
| 21-23 | Chara6 (Start/Act/End) | 初期パーティ6人目のSPと行動 |

**[追加提案]**: 交代（Swap）をCSV上でどう表現するか。
`ActionEntry.skillName` に `[Swap] -> Karen` のようにシステム側で合成した文字列を入れるか、あるいは末尾に「交代イベント」専用の列を設けるのが Spreadsheet ユーザーには親切です。

---

## 結論

Claudeの設計案は**「承認 (Approved with Minor Changes)」**レベルです。
特に `BattleRecordStore` のデータ構造は堅牢です。

**次のアクションへの推奨:**
1.  CSVエクスポート時のキャラクター列固定ロジックの確定。
2.  `preview` 状態における `swapEvents` の扱いを許容するようインターフェースを微調整。
3.  上記修正を取り込んだ上で、`js/results-manager.js` の実装（リファクタリング）に移行。

私はこの設計に基づいた実装を強力に支援します。

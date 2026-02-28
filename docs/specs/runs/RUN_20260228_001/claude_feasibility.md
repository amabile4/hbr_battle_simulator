[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:16:00Z

# 実現可能性評価（Claude担当: 行動記録システム視点）

**RUN**: RUN_20260228_001
**評価対象**: 統合仕様 integrated_architecture_spec.md + interfaces.ts

---

## 1. 行動記録システム単体の実現可能性

### 1.1 BattleRecordStore（イミュータブルストア）

**判定: 可能**

`BattleRecordStore`はReduxライクな純粋関数操作で実装可能。
`upsertRecord`, `deleteRecord`, `insertBefore`, `reindexTurnLabels`は全て
「入力→新ストア返却」の純粋関数として実装できる。

**実装複雑度**: 低〜中
- `cascade`削除のOD/extra連鎖判定が唯一の複雑箇所
- OD一連レコードの識別には`turnType='od'`と`turnIndex`の組み合わせで判断可能

### 1.2 RecordAssembler.fromSnapshot()

**判定: 可能**

`BattleState`依存を排除したスナップショット入力設計は実装可能。
TurnController が `CharacterSnapshot[]` を切り出す責務を持つ設計は明確。

**実装複雑度**: 低
- 引数型が全て確定済み
- 副作用なしの純粋関数

### 1.3 CsvExporter（Google Spreadsheet互換）

**判定: 可能**

`initialParty`のpartyIndex順でCSV列を固定する設計（DEC-003）は正しく機能する。
交代後も同キャラが同列になることを保証できる。

**実装複雑度**: 低
- `recordToRow`でpartyIndex順にActionEntryをルックアップするだけ
- 行動なし（後衛）キャラクターは空文字で埋める

### 1.4 表計算ライク編集（insertBefore/deleteRecord）

**判定: 条件付き可能**

**条件**: cascade削除の範囲定義（Q-CL2）が確定していること。
具体的には、OD中のターン3/1を削除した場合に残り2ターンをどう扱うかが未確定。

**最小修正**: Q-CL2を確定させること。仮採用（cascade=trueで一連のODターンを削除）で実装を始めても実用上問題ない。

---

## 2. 他システムとのインターフェース実現可能性

### 2.1 TurnController → RecordAssembler の受け渡し

**判定: 可能**

TurnContextInputはTurnStateから直接取得できる全フィールドを含む。
`previewTurn()`が返したTurnRecordをそのまま`fromSnapshot()`へ渡すフローは一貫している。

### 2.2 CharacterSnapshot の生成タイミング（Q-CL1）

**判定: 条件付き可能**

**条件**: Q-CL1（snapBeforeのタイミング）が確定すること。
仮採用（previewTurn呼び出し直前）で実装開始可能。
ターン開始時SP回復後→スキル選択前が論理的に正しいタイミング。

### 2.3 preview段階のswapEvents

**判定: 可能（DEC-006採用）**

previewTurnでもswapEventsを保持できるよう`swapEvents: SwapEvent[]`を
TurnRecordの共通フィールドとした（preview段階は空配列でも可）。

---

## 3. 現行実装からの移行可能性

### 3.1 ResultsManager（DOM操作）→ RecordEditor + CsvExporter

**判定: 条件付き可能（移行コスト: 中）**

現行ResultsManager:
- `updateResultsTable()`: battleHistory[]をDOM描画
- `updateResultsTableHeaders()`: キャラ名ヘッダー生成

移行後:
- `BattleRecordStore` → `CsvExporter.exportToCSV()` → DOM描画
- キャラ名ヘッダーは`initialParty`から生成

**移行条件**:
- battleHistory[] を BattleRecordStore に変換する移行スクリプト
- DOM描画ロジックをUI Layer に分離

### 3.2 control-manager.js との統合

**判定: 条件付き可能（移行コスト: 高）**

現行`ControlManager.executeTurn()`は:
- savedSPState[] でSP状態を保存/復元している
- previewTurn/commitTurnの2段階に相当する独自実装

新設計では:
- `previewTurn()`: BattleState（不変）→ TurnRecord（preview）
- `commitTurn()`: BattleState + TurnRecord → { nextState, committedRecord }

**移行条件**:
- savedSPState を BattleState のスナップショット方式に置換
- executeTurn → previewTurn, nextTurn → commitTurn の関数名変更（R7確定）

---

## 4. リスク評価

### 4.1 高リスク: Q-CSV1（Swap列表現）
現行UIのCSV出力で交代情報をどう表現するか未確定。
影響度: 中（CSV形式変更はGoogleSpreadsheetテンプレート側の修正も必要）

### 4.2 中リスク: cascade削除の連鎖範囲
OD一連3ターン中の1ターンを削除した場合の整合性。
実装上の考慮漏れがあると記録整合性が壊れる可能性あり。

### 4.3 低リスク: sequenceId のオーバーフロー
長時間セッションでnextSequenceIdが増加し続けるが、JavaScriptのNumber.MAX_SAFE_INTEGER（9007兆）まで問題なし。

---

## 5. 最終判定

| システム | 判定 | 条件 |
|---------|------|------|
| BattleRecordStore（ストア） | **可能** | なし |
| RecordAssembler（スナップショット生成） | **可能** | なし |
| CsvExporter（CSV出力） | **可能** | なし |
| RecordEditor（表計算編集） | **条件付き可能** | Q-CL2確定が必要 |
| 現行ResultsManager移行 | **条件付き可能** | DOM分離が必要（中コスト） |
| control-manager.js移行 | **条件付き可能** | executeTurn/nextTurnのリファクタが必要（高コスト） |

**総合判定: 条件付き可能**

主要な条件:
1. Q-CL2（cascade削除範囲）の確定
2. Q-CL1（snapBeforeタイミング）の確定（仮採用で開始可）
3. BattleRecordStore移行スクリプトの作成
4. UI LayerのDOM分離（段階的移行で実施可能）

**実装着手可能な最小セット**:
- `applySpChange()`, `getEventCeiling()` → 純粋関数（テストから始められる）
- `RecordAssembler.fromSnapshot()` → 純粋関数
- `CsvExporter.exportToCSV()` → 純粋関数
- 上記3点はBattleState不要、即テスト可能

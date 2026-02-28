[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:20:00Z

# 最終判定書

**RUN**: RUN_20260228_001
**策定**: Claude（設計リーダー）
**根拠**: codex_feasibility.md + gemini_feasibility.md + claude_feasibility.md

---

## 総合判定: **条件付き可能**

| 評価者 | 判定 |
|--------|------|
| Codex（キャラクタードメイン視点） | 条件付き可能 |
| Gemini（ターン制御視点） | **可能** |
| Claude（行動記録視点） | 条件付き可能 |

**最終結論**: 条件付き可能。技術的にブロッキングな問題は存在しない。  
前回の条件だった「未確定事項」は解消済みで、残る条件は「現行コードからの段階移行（Adapter導入）」のみ。

---

## 根拠

### 可能化の根拠（Gemini評価）
- ExtraTurnState構造化（DEC-004）により連続extra管理が実装可能
- SP計算パイプライン（R10凍結ルール）が数式として明確化済み
- preview/commit分離は現行ControlManagerの構造と同型
- odPending + odSuspended の同時管理は処理順序で決定論的に担保可能

### 条件付きの根拠（Codex・Claude評価）
1. **現行グローバル依存の広域散在**（Codex評価）
   - `globals.js`, `event-handlers.js`, `results-manager.js`, `export-manager.js` の全モジュールがグローバル変数を直接参照
   - BattleState移行はAdapter層なしには一括変更になり、移行リスクが高い

2. **TurnController実装ガイドの不足**（更新）
   - `turnLabel` 生成関数の責務が仕様上は確定したが、実装タスクとして未着手
   - 実装時に `generateTurnLabel(TurnState): string` を固定する必要がある

### 解消済み条件（ユーザー回答で確定）
- Q-S001: `commitTurn` は `previewRecord` 採用（再計算しない）
- Q-CL2: `deleteRecord` は個別削除のみ（cascadeなし）
- Q-OD1: OD回復はOD開始時に一括適用
- Q-EF1: `EffectSlot.source` はv1で `skill | passive | system`
- Q-CSV1: CSVはポジション1..6固定、1ターン1行ワイド形式
- Q-B2: CSVは `turnIndex + turnLabel` の2列出力

---

## 3システムの責務境界と受け渡しトレーサビリティ

```
1. CharacterDomain
   ↓ 提供: CharacterState, CharacterSnapshot, 純粋関数
   ↓ 境界: shared-types.tsの型のみが外部公開

2. TurnController
   ↓ 消費: CharacterState（読み取り専用）
   ↓ 生成: TurnState, BattleState, TurnContextInput
   ↓ 呼び出し: RecordAssembler.fromSnapshot(snapBefore, TurnContextInput, ...)

3. ActionRecordSystem
   ↓ 消費: CharacterSnapshot[], TurnContextInput（スナップショット経由のみ）
   ↓ 生成: TurnRecord, BattleRecordStore
   ↓ 提供: CsvExporter, RecordEditor
   ↓ 発行: BattleRecordEvent → UILayer

追跡可能なデータフロー:
  previewTurn(BattleState, ActionDict) → TurnRecord{preview}
    → RecordAssembler.fromSnapshot(snapBefore, ...) → TurnRecord{preview}
    → [スキル変更] → upsertRecord → TurnRecord{preview更新}
  commitTurn(BattleState, previewRecord, swapEvents) → {nextState, TurnRecord{committed}}
    → RecordAssembler.commitRecord(preview, snapAfter, swapEvents) → TurnRecord{committed}
    → BattleRecordStore.records.push(committedRecord)
    → RecordCommittedEvent → UILayer → DOM更新
```

---

## 不足点（実装前に解消が必要）

### Must
| ID | 不足点 | 解消方法 |
|----|--------|----------|
| S-002 | BattleState移行Adapterがない | 既存グローバル変数をラップするAdapter関数（getState/setState）を先行実装 |

### Should
| ID | 不足点 | 解消方法 |
|----|--------|----------|
| S-004 | turnLabel生成関数が未定義 | TurnController内にgenerateTurnLabel(TurnState): stringを定義 |

### Could
| ID | 不足点 | 解消方法 |
|----|--------|----------|
| S-005 | 移行後のCSV運用ルール（列表示/非表示）のテンプレ化不足 | ワイドCSV向けSpreadsheetテンプレート（列グルーピング）を追加 |

---

## 可能化のための最小修正セット

既存の3提案と相互レビューから統合された「最小修正セット」:

### STEP 1: 基盤（即時着手可能）
```
□ shared-types.ts 作成（TurnType, ODContext, SpChangeSource等）
□ applySpChange(), getEventCeiling() を純粋関数として実装・テスト
□ CharacterSnapshot型定義
□ RecordAssembler.fromSnapshot() を純粋関数として実装・テスト
□ CsvExporter.exportToCSV() を純粋関数として実装・テスト
```
**理由**: これら全てはBattleState不要の純粋関数。既存コードと並存可能。

### STEP 2: 状態管理（S-002解消）
```
□ BattleState型定義
□ StateAdapter: {getState(): BattleState, setState(s: BattleState): void}
□ globals.js の currentParty/currentTurn/turnActions/battleHistoryをAdapterで包む
□ TurnState型定義 + ExtraTurnState型定義
```

### STEP 3: TurnController移行（既存executeTurn/nextTurn置換）
```
□ previewTurn() 実装（Q-S001確定: previewRecord採用前提）
□ commitTurn() 実装（通常: cost→base→passive、OD回復は開始時一括）
□ OD状態機械実装（normal/od/extra遷移）
□ generateTurnLabel(TurnState): string 実装（S-004）
□ canSwapWith() 実装
```

### STEP 4: RecordEditor + CSVエクスポート
```
□ BattleRecordStore + RecordEditor 実装（Q-CL2確定: 個別削除のみ）
□ CsvExporter を BattleRecordStore基盤に移行
□ CsvExporter.recordToRow() をワイド形式で実装（Q-B2, Q-CSV1確定）
□ ResultsManager のDOM更新をBattleRecordEvent購読方式に変更
```

---

## 最終サマリー

**HBRバトルシミュレータの中核3システムTypeScript再設計は、条件付きで実装可能**

- 技術的ブロッキング要素: なし
- 主要リスク: グローバル依存の段階的除去（Adapter層が必要）
- 推奨アプローチ: STEP1の純粋関数群から着手し、既存コードと並走させながら段階移行
- 仕様未確定事項: 0件（open_questions.mdの回答反映により解消済み）
- 実装前の残課題: S-002（Must）, S-004（Should）
- 想定実装品質: 純粋関数設計によりテストカバレッジの大幅向上が見込める

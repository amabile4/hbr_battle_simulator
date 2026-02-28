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
ただし「現行コードからの移行コスト」と「未確定事項の一部」を解消した上での実装着手を推奨する。

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

2. **未確定事項Q-CL2の影響**（Claude評価）
   - cascade削除の連鎖範囲が未確定
   - OD一連ターン削除時の整合性ロジックが不完全

3. **preview/commit間の二重適用リスク**（Codex評価）
   - commitTurnがpreviewRecordを「検証して採用」するのか「再計算する」のかを明示的に固定しないと、SPの二重消費が発生しうる

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
| S-001 | preview/commitの二重適用防止ロジックが未定義 | commitTurnの「previewRecord検証採用」か「再計算」かをコード仕様に明記 |
| S-002 | BattleState移行Adapterがない | 既存グローバル変数をラップするAdapter関数（getState/setState）を先行実装 |

### Should
| ID | 不足点 | 解消方法 |
|----|--------|----------|
| S-003 | cascade削除の連鎖範囲未定義（Q-CL2） | ODグループID（od_group_id）をTurnRecordに追加し、同一グループを一括削除 |
| S-004 | turnLabel生成関数が未定義 | TurnController内にgenerateTurnLabel(TurnState): stringを定義 |
| S-005 | OD中SP回復タイミング未確定（Q-OD1） | 仮採用「各行動終了後に回復」で実装開始可能 |

### Could
| ID | 不足点 | 解消方法 |
|----|--------|----------|
| S-006 | EffectSlot.source確定値（Q-EF1） | v1ではeffectSlotを記録のみのため、ユーザー確認後に列挙値を確定 |
| S-007 | CSV Swap列表現（Q-CSV1） | ActionEntry.skillNameに「[交代]→キャラ名」を記入で仮実装 |

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
□ previewTurn() 実装（S-001: preview/commit明確化）
□ commitTurn() 実装（SP変動パイプライン5ステップ）
□ OD状態機械実装（normal/od/extra遷移）
□ canSwapWith() 実装
```

### STEP 4: RecordEditor + CSVエクスポート
```
□ BattleRecordStore + RecordEditor 実装（S-003: cascade削除含む）
□ CsvExporter を BattleRecordStore基盤に移行
□ ResultsManager のDOM更新をBattleRecordEvent購読方式に変更
```

---

## 最終サマリー

**HBRバトルシミュレータの中核3システムTypeScript再設計は、条件付きで実装可能**

- 技術的ブロッキング要素: なし
- 主要リスク: グローバル依存の段階的除去（Adapter層が必要）
- 推奨アプローチ: STEP1の純粋関数群から着手し、既存コードと並走させながら段階移行
- 未確定事項: 8件（Must=0件、Should=5件、Could=3件）のうち実装前に解消が必要なものは S-001, S-002 のみ
- 想定実装品質: 純粋関数設計によりテストカバレッジの大幅向上が見込める

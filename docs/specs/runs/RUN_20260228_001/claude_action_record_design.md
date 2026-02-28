[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:00:00Z

# 行動記録システム 設計提案書

**担当**: Claude（本インスタンス）
**RUN**: RUN_20260228_001
**参照根拠**: js/results-manager.js, js/control-manager.js, spec_review_state.json(agreed_v1 R1-R10)

---

## 1. システム概要

行動記録システムは、バトル進行中の全ターン行動を不変ログとして蓄積し、
表計算ライクな編集操作（挿入・更新・削除・詰め）と CSV エクスポートを提供する。
`previewTurn()` が生成するプレビューレコードと `commitTurn()` が確定する
コミットレコードの2段階を管理する。

---

## 2. TypeScript インターフェース定義

### 2.1 SP変更イベント

```typescript
/** SP変動の発生源 */
type SpChangeSource = 'cost' | 'base' | 'od' | 'passive' | 'active' | 'clamp';

/** 単一SP変動エントリ */
interface SPChangeEntry {
  source: SpChangeSource;
  delta: number;       // 正=回復, 負=消費
  preSP: number;       // 変動前SP
  postSP: number;      // 変動後SP（マイナス負債も許可）
  eventCeiling: number; // 適用時の上限値（cost=Infinity, base/active通常=sp.max, od=99）
}
```

### 2.2 スキル行動エントリ

```typescript
/** ターン内の単一スキル行動 */
interface ActionEntry {
  characterId: string;    // キャラクター識別子（chara正規化キー）
  characterName: string;  // 表示名
  positionIndex: number;  // 行動時のポジション(0-5, 前衛=0-2)
  skillId: number;        // スキルID
  skillName: string;      // スキル表示名
  spCost: number;         // 消費SP
  spChanges: SPChangeEntry[]; // このアクションに起因する全SP変動（順序保証）
  startSP: number;        // アクション前SP（snapBeforeより）
  endSP: number;          // アクション後SP（全spChanges適用後）
}
```

### 2.3 交代イベント

```typescript
/** ターン内の入れ替えイベント（commitTurn時点の最終状態のみ記録） */
interface SwapEvent {
  swapSequence: number;         // 同一ターン内の交代順序(1始まり)
  fromPositionIndex: number;    // 交代前の前衛ポジション(0-2)
  toPositionIndex: number;      // 交代前の後衛ポジション(3-5)
  outCharacterId: string;
  outCharacterName: string;
  inCharacterId: string;
  inCharacterName: string;
}
```

### 2.4 エフェクトスナップショット（v1=記録のみ）

```typescript
/** ターン時点でのエフェクト記録 */
interface EffectSnapshot {
  characterId: string;
  effects: Array<{
    effectId: string;
    name: string;
    source: string;
    durationRemaining: number; // -1=永続（v1デフォルト）
  }>;
}
```

### 2.5 ターンレコード（中核）

```typescript
/** レコードの確定状態 */
type RecordStatus = 'preview' | 'committed';

/** ターン種別 */
type TurnType = 'normal' | 'od' | 'extra';

/** ターンレコード */
interface TurnRecord {
  // === 識別子 ===
  turnId: number;           // sequenceId（全commitTurnで+1、単調増加）
  turnIndex: number;        // 表示上のターン番号（OD/extra中は変化しない）
  turnLabel: string;        // 表示値（例: "T3", "OD1-1", "EX"）
  turnType: TurnType;       // 内部種別
  recordStatus: RecordStatus;

  // === ターン文脈 ===
  odContext: 'preemptive' | 'interrupt' | null; // null=OD非活性
  isExtraTurn: boolean;     // extra割り込みターンか
  remainingOdActionsAtStart: number; // このターン開始時点のOD残行動数

  // === 行動前スナップショット ===
  snapBefore: CharacterSnapshot[]; // previewTurn呼び出し直前のキャラ状態

  // === 行動内容 ===
  enemyAction: string | null;      // 敵行動（nullable）
  actions: ActionEntry[];          // 前衛キャラクターの行動（ポジション順）
  swapEvents: SwapEvent[];         // 交代イベント（commitTurn時の最終状態）
  effectSnapshots: EffectSnapshot[]; // エフェクト記録（v1=記録のみ）

  // === 行動後スナップショット ===
  snapAfter: CharacterSnapshot[];  // 全SP変動・交代適用後のキャラ状態

  // === メタ ===
  createdAt: string;     // ISO 8601 UTC
  committedAt: string | null; // commitTurn時刻（preview段階はnull）
}
```

### 2.6 キャラクタースナップショット

```typescript
/** ターン前後のキャラクター状態スナップショット */
interface CharacterSnapshot {
  characterId: string;
  characterName: string;
  positionIndex: number; // スナップショット時点のポジション(0-5)
  isFront: boolean;      // 前衛か
  sp: {
    current: number;
    min: number;
    max: number;
    bonus: number;
  };
  isAlive: boolean;
  isBreak: boolean;
  isExtraActive: boolean;
}
```

### 2.7 バトル記録ストア

```typescript
/** バトル全体の記録ストア（immutable append/replace） */
interface BattleRecordStore {
  records: TurnRecord[];   // sequenceId順に整列
  nextSequenceId: number;  // 次のcommitTurnで使用するsequenceId
}
```

---

## 3. RecordAssembler（純粋関数群）

```typescript
/** RecordAssemblerはBattleState依存を排除した純粋関数モジュール */
interface RecordAssembler {
  /**
   * previewTurn用: snapBeforeを受け取りプレビューレコードを生成
   * BattleState依存を排除するためsnapshotを引数で受け取る
   */
  fromSnapshot(
    snapBefore: CharacterSnapshot[],
    turnContext: TurnContextInput,
    actions: ActionEntry[],
    sequenceId: number
  ): TurnRecord; // recordStatus='preview'

  /**
   * commitTurn用: previewRecordを確定レコードに昇格
   */
  commitRecord(
    preview: TurnRecord,
    snapAfter: CharacterSnapshot[],
    swapEvents: SwapEvent[],
    committedAt: string
  ): TurnRecord; // recordStatus='committed'
}

/** fromSnapshot()への入力コンテキスト */
interface TurnContextInput {
  turnIndex: number;
  turnLabel: string;
  turnType: TurnType;
  odContext: 'preemptive' | 'interrupt' | null;
  isExtraTurn: boolean;
  remainingOdActionsAtStart: number;
  enemyAction: string | null;
}
```

---

## 4. 表計算ライク編集操作

現行 `ResultsManager` はDOM直接操作だが、新設計では純粋なレコード操作として定義する。

```typescript
/** 編集操作インターフェース */
interface RecordEditor {
  /**
   * 指定sequenceIdのレコードを上書き（previewTurnの再実行に対応）
   * 同一turnIndexが既存なら上書き、なければ末尾追加
   */
  upsertRecord(
    store: BattleRecordStore,
    record: TurnRecord
  ): BattleRecordStore;

  /**
   * 指定sequenceIdのレコードを削除し、後続のturnIndexを詰める
   * OD/extraレコードの削除は関連する一連のレコードも削除
   */
  deleteRecord(
    store: BattleRecordStore,
    sequenceId: number,
    opts?: { cascade: boolean } // OD/extra関連レコードも連鎖削除
  ): BattleRecordStore;

  /**
   * 指定位置の前にターンを挿入（ターン番号を繰り下げ）
   * 挿入後のturnIndexを再採番する
   */
  insertBefore(
    store: BattleRecordStore,
    targetSequenceId: number,
    record: TurnRecord
  ): BattleRecordStore;

  /**
   * 全レコードのturnIndexを連番に詰め直す
   * sequenceIdは変更しない（内部一意性を保持）
   */
  reindexTurnLabels(
    store: BattleRecordStore
  ): BattleRecordStore;
}
```

---

## 5. CSV エクスポート仕様

```typescript
/** CSV列定義 */
interface CsvColumnDef {
  header: string;
  getValue: (record: TurnRecord, charIndex?: number) => string;
}

/** CSVエクスポーター */
interface CsvExporter {
  /**
   * Google Spreadsheet互換CSV生成
   * 列構成: ターン | 敵行動 | [キャラ名列]...（始SP, 行動, 終SP）× 6
   */
  exportToCSV(
    store: BattleRecordStore,
    party: CharacterSnapshot[] // 現在のパーティー順
  ): string; // CSV文字列

  /**
   * 単一レコードを1行CSV行に変換
   */
  recordToRow(record: TurnRecord, party: CharacterSnapshot[]): string[];
}
```

### CSV列順序
```
turnLabel, enemyAction,
[char0.startSP, char0.action, char0.endSP],
[char1.startSP, char1.action, char1.endSP],
...
[char5.startSP, char5.action, char5.endSP]
```

**未確定事項 Q-B2**: turnIndex（内部連番）と turnLabel（表示値）をCSV列として両方出力するか、turnLabelのみかは未確定。本設計では turnLabelのみを仮採用。

---

## 6. イベント発行

```typescript
/** 行動記録システムが発行するイベント */
interface RecordCommittedEvent {
  type: 'record.committed';
  sequenceId: number;
  turnIndex: number;
  turnLabel: string;
  record: TurnRecord;
}

interface RecordDeletedEvent {
  type: 'record.deleted';
  sequenceId: number;
  cascadeDeletedIds: number[]; // 連鎖削除されたsequenceId一覧
}

interface StoreReindexedEvent {
  type: 'store.reindexed';
  affectedSequenceIds: number[];
}

type BattleRecordEvent = RecordCommittedEvent | RecordDeletedEvent | StoreReindexedEvent;
```

---

## 7. 依存方向

```
行動記録システム
  ← 読み取る: CharacterState（CharacterSnapshot経由、直接参照なし）
  ← 読み取る: TurnState（TurnContextInput経由、直接参照なし）
  → 書き込む: BattleRecordStore（自システム管理）
  → 発行する: BattleRecordEvent（UIレイヤーが購読）

依存方向（一方向）:
  TurnController → RecordAssembler → BattleRecordStore
  UILayer → CsvExporter / RecordEditor → BattleRecordStore
```

**禁止依存**: BattleRecordStore が TurnState や CharacterState を直接参照しない。
全入力はスナップショット経由で受け取ることで、循環依存を防ぐ。

---

## 8. 状態遷移とレコード生命周期

```
[スキル選択] → previewTurn() → TurnRecord{status='preview'}
                                        ↓
                              [スキル変更で上書き]
                                        ↓
                              upsertRecord() → TurnRecord{status='preview'}（更新）
                                        ↓
                              commitTurn()
                                        ↓
                              commitRecord() → TurnRecord{status='committed'}
                                        ↓
                              [次ターンへ]
```

---

## 9. 拡張ポイント（将来実装）

### 9.1 ダメージ記録
```typescript
// TurnRecord への追加フィールド（将来）
interface ActionEntry {
  // ... 既存フィールド ...
  damageResult?: DamageResult; // 将来実装: ダメージ計算結果
}

interface DamageResult {
  rawDamage: number;
  finalDamage: number;
  isCritical: boolean;
  // 計算根拠は将来のダメージ計算システムが定義
}
```

### 9.2 バフ/デバフ適用ログ
```typescript
// EffectSnapshotの拡張（将来）
interface EffectSnapshot {
  // ... 既存フィールド ...
  appliedEffects?: AppliedEffectEntry[]; // 将来実装: ターン内に付与されたエフェクト
}
```

### 9.3 リプレイ機能
```typescript
// BattleRecordStoreからの状態復元（将来）
interface ReplayEngine {
  reconstructStateAt(
    store: BattleRecordStore,
    targetSequenceId: number
  ): CharacterSnapshot[]; // 指定ターン時点の状態を再構築
}
```

---

## 10. 未確定事項（ユーザー確認が必要）

| ID | 優先度 | テーマ | 質問 | 仮採用 |
|----|--------|--------|------|--------|
| Q-B2 | Should | CSV | turnIndex（内部連番）とturnLabel（表示値）をCSV列として分離するか | turnLabelのみ |
| Q-CL1 | Should | 記録 | snapBeforeはpreviewTurn呼び出し直前のキャラ状態か | 直前スナップショット |
| Q-CL2 | Could | 編集 | deleteRecord時のcascade削除範囲（ODの何ターン目を削除した場合） | cascade=trueで一連のODターンを削除 |
| Q-CL3 | Could | CSV | 空ターン（敵行動のみ）のCSV出力形式 | enemyActionのみ記入、行動列は空文字 |

---

## 11. JSON Schema（行動記録）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hbr-battle-simulator.local/schema/battle_record.schema.json",
  "title": "HBR Battle Record Store",
  "type": "object",
  "required": ["records", "nextSequenceId"],
  "properties": {
    "records": {
      "type": "array",
      "items": { "$ref": "#/$defs/TurnRecord" }
    },
    "nextSequenceId": { "type": "integer", "minimum": 1 }
  },
  "$defs": {
    "TurnRecord": {
      "type": "object",
      "required": ["turnId", "turnIndex", "turnLabel", "turnType", "recordStatus"],
      "properties": {
        "turnId": { "type": "integer", "minimum": 1 },
        "turnIndex": { "type": "integer", "minimum": 1 },
        "turnLabel": { "type": "string" },
        "turnType": { "type": "string", "enum": ["normal", "od", "extra"] },
        "recordStatus": { "type": "string", "enum": ["preview", "committed"] },
        "odContext": { "type": ["string", "null"], "enum": ["preemptive", "interrupt", null] },
        "enemyAction": { "type": ["string", "null"] },
        "actions": { "type": "array", "items": { "$ref": "#/$defs/ActionEntry" } },
        "swapEvents": { "type": "array", "items": { "$ref": "#/$defs/SwapEvent" } },
        "snapBefore": { "type": "array", "items": { "$ref": "#/$defs/CharacterSnapshot" } },
        "snapAfter": { "type": "array", "items": { "$ref": "#/$defs/CharacterSnapshot" } },
        "createdAt": { "type": "string", "format": "date-time" },
        "committedAt": { "type": ["string", "null"], "format": "date-time" }
      }
    },
    "ActionEntry": {
      "type": "object",
      "required": ["characterId", "characterName", "positionIndex", "skillId", "skillName", "spCost", "startSP", "endSP"],
      "properties": {
        "characterId": { "type": "string" },
        "characterName": { "type": "string" },
        "positionIndex": { "type": "integer", "minimum": 0, "maximum": 5 },
        "skillId": { "type": "integer" },
        "skillName": { "type": "string" },
        "spCost": { "type": "integer" },
        "startSP": { "type": "integer" },
        "endSP": { "type": "integer" }
      }
    },
    "SwapEvent": {
      "type": "object",
      "required": ["swapSequence", "fromPositionIndex", "toPositionIndex", "outCharacterId", "inCharacterId"],
      "properties": {
        "swapSequence": { "type": "integer", "minimum": 1 },
        "fromPositionIndex": { "type": "integer", "minimum": 0, "maximum": 2 },
        "toPositionIndex": { "type": "integer", "minimum": 3, "maximum": 5 },
        "outCharacterId": { "type": "string" },
        "outCharacterName": { "type": "string" },
        "inCharacterId": { "type": "string" },
        "inCharacterName": { "type": "string" }
      }
    },
    "CharacterSnapshot": {
      "type": "object",
      "required": ["characterId", "characterName", "positionIndex", "isFront", "sp", "isAlive", "isBreak"],
      "properties": {
        "characterId": { "type": "string" },
        "characterName": { "type": "string" },
        "positionIndex": { "type": "integer", "minimum": 0, "maximum": 5 },
        "isFront": { "type": "boolean" },
        "sp": {
          "type": "object",
          "required": ["current", "min", "max", "bonus"],
          "properties": {
            "current": { "type": "integer" },
            "min": { "type": "integer" },
            "max": { "type": "integer", "minimum": 1 },
            "bonus": { "type": "integer", "minimum": 0 }
          }
        },
        "isAlive": { "type": "boolean" },
        "isBreak": { "type": "boolean" },
        "isExtraActive": { "type": "boolean" }
      }
    }
  }
}
```

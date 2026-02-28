# HBR バトルシミュレータ 最終統合仕様書 v1

> **ステータス**: 実装着手可能
> **作成**: Round 9 完了時点（2026-02-27）
> **チーム**: CLAUDE / GEMINI / CODEX 合同確定
> **Must 級未確定事項**: 0 件

---

## 目次

1. [アーキテクチャ方針](#1-アーキテクチャ方針)
2. [テーマ1: キャラクタークラス設計](#2-テーマ1-キャラクタークラス設計)
3. [テーマ2: ターン管理システム](#3-テーマ2-ターン管理システム)
4. [テーマ3: 行動記録管理システム](#4-テーマ3-行動記録管理システム)
5. [ターンフロー完全仕様](#5-ターンフロー完全仕様)
6. [SP計算仕様](#6-sp計算仕様)
7. [CSV出力仕様](#7-csv出力仕様)
8. [Should 級未確定事項（仮説運用）](#8-should-級未確定事項仮説運用)

---

## 1. アーキテクチャ方針

### 4層構造

```
StateEngine (純粋関数)
  └── UseCase (ユースケース調整)
        └── Renderer (UI描画)
              └── Persistence / Export (永続化・CSV)
```

### 原則

- **StateEngine**: 副作用なし。同じ入力には必ず同じ出力。BattleState 全体への依存禁止
- **CharacterState / TurnState / TurnRecord**: 3 クラスを完全分離
- **previewTurn / commitTurn**: 2 段階確定モデル。preview は UI 表示専用、commit のみが状態を確定する
- **純粋関数境界**: CharacterRuleResolver / RecordAssembler は全て stateless

---

## 2. テーマ1: キャラクタークラス設計

### 2.1 CharacterState（v1 必須フィールド）

```typescript
interface CharacterState {
  characterId: string;         // skillDatabase.json の一意キー
  name: string;                // 日本語表示名
  position: 0 | 1 | 2 | 3 | 4 | 5;  // 0-2=前衛, 3-5=後衛
  sp: {
    current: number;           // 現在SP
    min: number;               // 下限SP（通常0。特性/スキル状態付与でマイナス値可）
    max: number;               // 上限SP（通常20。特性/スキルで25/30まで拡張可）
    bonus: number;             // ターン回復量加算値（BASE_SP_RECOVERY + bonus）
  };
  // SP範囲メモ:
  //   通常clamp: sp.min ≤ current ≤ sp.max
  //   OD中clamp: sp.min ≤ current ≤ 99
  //   sp.max変動（特性解除等）: currentを即時clampしない（次回SP変動時に自然収束）
  skills: SkillSlot[];         // セッション固定コピー（変更不可）
  effects: EffectSlot[];       // v1=空配列可（スキーマのみ定義）
  isExtraActive: boolean;      // このキャラにextra権利があるか
  isAlive: boolean;            // 生存フラグ（DP/HP数値は将来）
  isBreak: boolean;            // ブレイク中フラグ（DP/HP数値は将来）
}
```

### 2.2 SkillSlot

```typescript
interface SkillSlot {
  skillId: string;
  skillName: string;
  cost: number;                    // 0..20 整数
  type: 'damage' | 'non_damage';  // 2値固定（v1）
  spRecoveryCeiling?: number;
  // SP回復スキルの上限。省略時は sp.max 準拠（通常型）。
  // 指定時はその値まで sp.max を無視して回復可能（上限拡張型）。
  // 例: spRecoveryCeiling=30 → sp.max=20 でも 30 まで回復できる
}
```

### 2.3 EffectSlot（v1: スキーマ定義のみ・計算しない）

```typescript
interface EffectSlot {
  effectId: string;
  effectType: 'buff' | 'debuff';
  grantedBy: string;          // skillId または 'passive'
  grantedAt: number;          // turnIndex
  durationRemaining: number;  // -1 = 永続/未設定（v1デフォルト）
}
```

### 2.4 CharacterRuleResolver（純粋関数・stateless）

```typescript
// 前衛判定（position 0-2）
function canAct(char: CharacterState): boolean {
  return char.position < 3;
}

// 交代可否判定
function canSwapWith(
  a: CharacterState,
  b: CharacterState,
  isExtraActive: boolean,
  allowedCharacterIds: string[]
): { valid: boolean; reason?: string } {
  // extra中: allowedCharacterIds に含まれるキャラのみ交代可
  if (isExtraActive) {
    if (!allowedCharacterIds.includes(a.characterId) &&
        !allowedCharacterIds.includes(b.characterId)) {
      return { valid: false, reason: 'extra中は権利者のみ交代可' };
    }
  }
  // 前衛⇔後衛のペアのみ許可
  const aFront = a.position < 3;
  const bFront = b.position < 3;
  if (aFront === bFront) {
    return { valid: false, reason: '同列交代不可' };
  }
  return { valid: true };
}

// ── SP変動統一関数 ──────────────────────────────
// 全てのSP変動をこの1関数で処理する。
//
// [回復（delta > 0）の場合] 凍結ルール適用:
//   effectiveCeiling = Math.max(current, eventCeiling)
//   → current が eventCeiling を超えていたら回復無効（current を上限として保護）
//   → current が eventCeiling 以下なら eventCeiling まで回復
//
// [消費（delta < 0）の場合] 下限のみ:
//   sp.min まで消費可（上限チェックなし）
//
// eventCeiling の渡し方:
//   base / passive 回復         → sp.max
//   OD 回復 (source='od')       → 99
//   通常スキル回復 (source='active') → sp.max
//   上限拡張スキル回復          → skill.spRecoveryCeiling（例: 30）
//   cost (source='cost')        → Infinity（下限のみ適用のため実質無視）
function applySpChange(
  current: number,       // 変動前の SP 値
  delta: number,         // 変動量（正=回復, 負=消費）
  min: number,           // sp.min
  eventCeiling: number   // イベント固有の上限
): number {
  if (delta > 0) {
    const effectiveCeiling = Math.max(current, eventCeiling);
    return Math.max(min, Math.min(current + delta, effectiveCeiling));
  }
  return Math.max(min, current + delta);
}

// 使用例:
//   base回復:              applySpChange(cur, +2, sp.min, sp.max)
//   OD回復:                applySpChange(cur, +5, sp.min, 99)
//   通常スキル回復:        applySpChange(cur, +3, sp.min, sp.max)
//   上限拡張スキル回復:    applySpChange(cur, +5, sp.min, skill.spRecoveryCeiling ?? sp.max)
//   cost消費:              applySpChange(cur, -cost, sp.min, Infinity)
// ※ OD終了時に特別なSPクランプ処理は不要。
//   次回 base 回復時に凍結ルールが自然に継続する。
```

### 2.5 CharacterSnapshot（監査用・不変）

```typescript
interface CharacterSnapshot extends CharacterState {
  capturedAt: 'turnStart' | 'turnEnd';
  turnIndex: number;
  sequenceId: number;
}
```

**生成タイミング**:
- `turnStart`: `previewTurn` 呼び出し直前（startSP 記録用）
- `turnEnd`: `commitTurn` 完了後（endSP 記録用）

---

## 3. テーマ2: ターン管理システム

### 3.1 TurnState（v1 必須フィールド）

```typescript
interface TurnState {
  // --- 基本情報 ---
  turnIndex: number;           // 0起点内部連番（敵ターン移行時のみ+1）
  sequenceId: number;          // 全commitTurnで+1（ログ一意性保証）
  turnLabel: string;           // "T1" / "OD1" / "追加1" など表示用
  turnType: 'normal' | 'od' | 'extra';

  // --- OD管理 ---
  odLevel: 0 | 1 | 2 | 3;     // 0=非OD
  odRemainingActions: number;  // OD残行動数（OD1=1, OD2=2, OD3=3）
  odAllowSPOverflow: boolean;  // OD中=true（OD回復イベントが sp.max を無視して99まで増加可能な状態）
  // ※ sp.max 自体は変動しない。base/cost/passive は通常ルールを使う
  odContext: 'preemptive' | 'interrupt' | null;
  //   preemptive: 行動開始前にOD発動→ODターン消化→自ターン開始前に戻る
  //   interrupt:  行動後にOD発動→ODターン消化→敵ターンへ移行
  //   null: OD非活性
  odSuspended: boolean;        // extra割り込み中にODが一時停止中
  odPending: boolean;          // 割り込みODトリガー成立済みだがextraフェーズ中で保留中

  // --- Extra管理 ---
  extraTurnState: {
    active: boolean;
    source: 'od' | 'skill' | null;
    remainingActions: number;
    allowedCharacterIds: string[];  // extra権利を持つキャラのID
    grantTurnIndex: number;         // 付与されたturnIndex
  } | null;
}
```

### 3.2 OD残行動数

| ODレベル | 残行動数 |
|----------|---------|
| OD1      | 1回     |
| OD2      | 2回     |
| OD3      | 3回     |

### 3.3 turnLabel 生成規則

```
normal:         "T{turnIndex + 1}"     → "T1", "T2", ...
od (lv1-3):     "OD{odLevel}"          → "OD1", "OD2", "OD3"
extra:          "追加{grantTurnIndex + 1}" → "追加1", "追加2", ...
```

### 3.4 遷移優先則（R7確定・R9補足）

```
extra割り込み優先: OD中にextra付与 → extra即開始（OD suspended）
                  extra完了後 → OD再開（OD resumed）

odPending保留:   extra行動中に割り込みODトリガー → odPending=true で保留
                 extraフェーズ全完了後の次ターン移行タイミングで発動
                 連続extraチェーン中もodPending=trueを維持し続ける
```

### 3.5 previewTurn vs commitTurn

| 操作 | previewTurn | commitTurn |
|------|-------------|-----------|
| SP計算 | savedSPState使用（currentSP変更なし） | SP確定・currentSP更新 |
| turnIndex | 変更なし | 敵ターン移行時のみ+1 |
| sequenceId | 変更なし | 常に+1 |
| odRemainingActions | 変更なし | -1 |
| recordStatus | 'preview' | 'committed' |
| CharacterSnapshot | turnStart スナップ作成 | turnEnd スナップ作成 |

---

## 4. テーマ3: 行動記録管理システム

### 4.1 TurnRecord

```typescript
interface TurnRecord {
  turnId: number;              // = sequenceId（全コミットで一意）
  turnLabel: string;           // "T1" / "OD1" / "追加1"
  turnType: 'normal' | 'od' | 'extra';
  recordStatus: 'preview' | 'committed';
  enemyAction: string | null;  // nullable（v1必須にしない、CSV=空文字）
  characters: CharacterRecord[];  // 全6キャラ固定
  spChanges: SPChangeEntry[];
  swapEvents: SwapEvent[];
}
```

### 4.2 CharacterRecord

```typescript
interface CharacterRecord {
  characterId: string;
  name: string;
  position: 0 | 1 | 2 | 3 | 4 | 5;
  startSP: number;             // previewTurn開始時点のSP
  action: string;              // スキル名 または "—"（行動なし）
  endSP: number;               // commitTurn後のSP
}
```

### 4.3 SPChangeEntry

```typescript
interface SPChangeEntry {
  source: 'cost' | 'base' | 'od' | 'passive' | 'active' | 'clamp';
  targetCharacterId: string;
  amount: number;              // 正=回復, 負=消費
  preSP: number;
  postSP: number;              // マイナス値あり（SP負債許可）
  ruleId?: string;             // 適用ルールID（デバッグ用）
}
```

### 4.4 SwapEvent

```typescript
interface SwapEvent {
  fromPosition: number;
  toPosition: number;
  fromCharacterId: string;
  toCharacterId: string;
  atTurnIndex: number;
  swapSequence: number;        // 同一ターン内の交代順序（0起点）
}
```

**記録方針**: commitTurn時点の最終状態のみ記録。仮交代試行（preview中）は記録しない。

### 4.5 RecordStore API

```typescript
interface RecordStore {
  append(record: TurnRecord): void;
  replace(turnId: number, record: TurnRecord): void;
  // PREVIEW のみ置換可。COMMITTED 済みは拒否（警告ログ出力）

  commit(turnId: number): void;
  // 唯一の freeze 操作。recordStatus を 'committed' に変更

  getAll(): TurnRecord[];
  getByStatus(status: 'preview' | 'committed'): TurnRecord[];
}
```

### 4.6 RecordAssembler

```typescript
// BattleState 全体への依存なし
function fromSnapshot(
  snapBefore: CharacterSnapshot[],   // previewTurn開始前スナップ（全6キャラ）
  snapAfter: CharacterSnapshot[],    // commitTurn後スナップ（全6キャラ）
  actionMap: Map<string, string>,    // characterId → スキル名 or "—"
  swapEvents: SwapEvent[],
  turnState: TurnState
): TurnRecord;
```

---

## 5. ターンフロー完全仕様

### 5.1 通常ターンフロー

```
[プレイヤーターン開始]
  ↓
スキル選択・交代設定（previewTurn で SP プレビュー）
  ↓
commitTurn（SP確定、sequenceId+1、SwapEvent記録）
  ↓
[敵ターン]（turnIndex+1）
  ↓
[次のプレイヤーターン開始]
```

### 5.2 先制OD（preemptive）フロー

```
[プレイヤーターン開始]
  ↓
OD発動ボタン（行動開始前）→ odContext='preemptive'
  ↓
ODターン消化（odRemainingActions 回繰り返し）
  ↓
[OD終了] → odLevel=0（上限クランプなし。current > sp.max なら凍結ルールが継続）
  ↓
[同じプレイヤーターンに戻る]（turnIndex変化なし）
  ↓
通常行動 → commitTurn
  ↓
[敵ターン]（turnIndex+1）
```

### 5.3 割り込みOD（interrupt）フロー

```
[プレイヤーターン]
  ↓
行動実行（スキル使用・SP消費）
  ↓
OD発動ボタン（行動後）→ odContext='interrupt'
  ↓
ODターン消化（odRemainingActions 回繰り返し）
  ↓
[OD終了] → odLevel=0（上限クランプなし。current > sp.max なら凍結ルールが継続）
  ↓
[敵ターン]（turnIndex+1）
```

### 5.4 extraターン（ODによる付与）フロー

```
[ODターン中] extraトリガー条件成立
  ↓
extra即割り込み → odSuspended=true, extraTurnState.active=true
  ↓
extraターン消化（allowedCharacterIds のキャラのみ行動可）
  ↓
[extraターン終了]
  ↓
odPending=true? → ODを発動（suspend解除）→ OD再開
odPending=false? → OD再開（odSuspended=false）
```

### 5.5 extra中の割り込みOD保留フロー（R9確定）

```
[extraフェーズ中] 割り込みODトリガー条件成立
  ↓
odPending=true（保留。extraを中断しない）
  ↓
extraターン継続（連続extra含む、全て消化するまで繰り返し）
  ↓
[extraフェーズ完全終了] 次ターン移行タイミング
  ↓
odPending=true → OD発動（odContext='interrupt'）→ ODターン消化
  ↓
OD終了 → 敵ターンへ
```

### 5.6 extra同時付与（並列消費）フロー

```
複数のextra権利が同時付与された場合:
  → allowedCharacterIds をマージ（重複排除）
  → remainingActions = 1（加算しない）
  → 1ターンで全権利者が行動
```

---

## 6. SP計算仕様

### 6.1 SP範囲ルール（確定）

各 SP 変動イベントは **eventCeiling（イベント固有の上限）** を持つ。

| イベント (source) | eventCeiling | 備考 |
|------------------|-------------|------|
| cost | ∞（上限チェックなし） | 消費のみ、下限 sp.min |
| base | `sp.max` | 通常ターン回復 |
| od | `99` | OD回復のみ特例。sp.max は変動しない |
| passive | `sp.max` | v1=0固定 |
| active（通常スキル） | `sp.max` | spRecoveryCeiling 未指定 |
| active（上限拡張スキル） | `skill.spRecoveryCeiling`（例: 30） | SkillSlot に明記 |

**凍結ルール（全イベント共通）**:

```
effectiveCeiling = Math.max(current, eventCeiling)
new_sp = clamp(current + delta, sp.min, effectiveCeiling)
```

- `current > eventCeiling` の場合: effectiveCeiling = current → 回復が乗らない（凍結）
- `current ≤ eventCeiling` の場合: eventCeiling まで回復、それ以上は clamp

```
例1: current=25, sp.max=20, base回復+2          → 25（凍結: 25 > sp.max=20）
例2: current=21, sp.max=20, base回復+2          → 21（凍結: 21 > sp.max=20）
例3: current=19, sp.max=20, base回復+2          → 20（通常: min(21, max(19,20)) = 20）
例4: current=20, sp.max=20, OD回復+5            → 25（OD: min(25, max(20,99)) = 25）
例5: current=25, sp.max=20, OD回復+5            → 30（OD: min(30, max(25,99)) = 30）
例6: current=20, sp.max=20, 上限拡張スキル+5 ceiling=30 → 25（min(25, max(20,30)) = 25）
例7: current=28, sp.max=20, 上限拡張スキル+5 ceiling=30 → 30（min(33, max(28,30)) = 30）
例8: current=35, sp.max=20, 上限拡張スキル+5 ceiling=30 → 35（凍結: 35 > ceiling=30）
```

> **ODは sp.max を変動させない。**
> OD回復（source='od'）の eventCeiling が 99 なだけで、sp.max 自体は不変。
> base/passive は OD 中であっても eventCeiling = sp.max を使う。

> **OD終了時に上限クランプは発生しない。**
> OD回復で SP が 40 になり OD が終わっても SP は 40 のまま（凍結継続）。

**特性解除時の挙動**:
- `sp.max` が 25 → 20 に戻っても current を即時切り捨てない
- 以降の base 回復は凍結ルール（eventCeiling=sp.max=20 < current）により乗らなくなる

### 6.2 SP適用順（commitTurn内）

```
1. cost    : 前衛のみ、スキルコスト減算
             → applySpChange(cur, -cost, sp.min, Infinity)
               ※ 上限チェックなし、sp.min まで消費可

2. base    : 6人全員、normal時のみ適用
             → applySpChange(cur, +recovery, sp.min, sp.max)
               ※ eventCeiling=sp.max。current > sp.max なら凍結

3. od      : 6人全員、OD時のみ適用
             → applySpChange(cur, +odRecovery, sp.min, 99)
               ※ eventCeiling=99。sp.max を無視して最大99まで増加可能

4. passive : v1=0固定（将来拡張）
             → applySpChange(cur, 0, sp.min, sp.max)（実質変化なし）

5. active  : スキル効果によるSP回復（commitTurn以外のタイミングでも発生しうる）
             → applySpChange(cur, +amount, sp.min, skill.spRecoveryCeiling ?? sp.max)
               ※ spRecoveryCeiling 未指定スキル: eventCeiling=sp.max（通常型）
               ※ spRecoveryCeiling 指定スキル:   eventCeiling=その値（上限拡張型）

6. clamp   : 各ステップで既に applySpChange 内で処理済み。グローバルclamp不要
             OD終了時も特別なclampなし（凍結ルールが自然継続）
```

### 6.3 OD SP回復量

| ODレベル | 回復量（全6キャラ） |
|----------|------------------|
| OD1      | 5               |
| OD2      | 12              |
| OD3      | 20              |

### 6.4 SP下限突破（sp.min < 0）

- **ゲームメカニクス**: 特定キャラの固有特性、またはスキルによる状態付与で発生
- `sp.min` はキャラごとに異なる値を持ちうる（デフォルト: 0）
- `SPChangeEntry.postSP` はマイナス値を取りうる
- `applySpChange` の `min` 引数に `sp.min` を渡すことで処理を統一

### 6.5 sp.bonus

- `BASE_SP_RECOVERY + sp.bonus` がターン回復量（仮説）
- 加算方式、上限突破可能性あり、他キャラへの付与もv1対応

---

## 7. CSV出力仕様

### 7.1 ヘッダ構造

```
行1: キャラクター名行（名前×6）
行2: 列名行（turnLabel, action, startSP, endSP, ... × 6キャラ）
行3: 空行
行4以降: データ行
```

### 7.2 データ列

| 列 | 内容 |
|----|------|
| turnLabel | "T1" / "OD1" / "追加1" |
| enemyAction | 空文字（nullの場合） |
| キャラ×6: action | スキル名 or "—" |
| キャラ×6: startSP | previewTurn開始時SP |
| キャラ×6: endSP | commitTurn後SP |

**方針**: DOMテーブルと完全一致。turnIndex（内部連番）はCSV非出力（仮説運用）。

---

## 8. Should 級未確定事項（仮説運用）

以下は仮説値で実装を進める。確認次第更新。

| ID | テーマ | 仮説 | 影響範囲 |
|----|--------|------|---------|
| Q-B2 | CSV列設計 | turnLabelのみ出力（turnIndex列なし） | CSV列構成 |
| Q6-G1 | SP計算 | BASE_SP_RECOVERY + bonus | SP回復量計算 |
| Q6-C4 | OD終了clamp | 全回復後にmax=20でclamp | OD終了時SP値 |
| Q6-CL1 | snapBefore生成 | previewTurn呼び出し直前 | startSP記録タイミング |

---

## 付録: 設計確定履歴

| ラウンド | 主要確定事項 |
|---------|-------------|
| R1-R4 | 初期提案・外部CLI認証失敗 |
| R5 | 5テーマ横断レビュー完了（内部シミュレーション） |
| R6 | GEMINI/CODEX外部呼び出し成功。sequenceId提案（CODEX）、isAlive/isBreak追加（GEMINI） |
| R7 | ユーザー回答13件確定。extra即割り込み、SP負債許可、OD残行動数 |
| R8 | OD種別（preemptive/interrupt）区別。odContext追加 |
| R9 | Q-NEW2解決。odPending追加。Must級未確定事項=0達成 |

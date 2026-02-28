[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:12:00Z

# 意思決定ログ

**RUN**: RUN_20260228_001
**参照**: spec_review_state.json (R1-R10 agreed_v1) + Phase1設計 + Phase2レビュー

---

## DEC-001: BattleState 共有型の配置

- **問題**: CharacterDomain, TurnController, ActionRecordSystemの3者が`BattleState`を参照するが、誰が所有するか未定義
- **Claudeレビュー指摘**: [CRITICAL] BattleStateの共有型定義が欠如
- **決定**: `shared-types.ts`（独立モジュール）に配置し、全システムが参照する
- **根拠**: 循環依存を避けるため、集約型は依存の最下層に配置するのが原則

## DEC-002: turnId と sequenceId の統一

- **問題**: Codex設計で`CharacterStateChangedEvent`に`turnId`と`sequenceId`が両方存在し冗長
- **agreed_v1 R7確定**: `TurnRecord.turnId = sequenceId`
- **決定**: `turnId`フィールドを削除し、`sequenceId`のみを使用
- **根拠**: R7で「TurnRecord.turnId = sequenceIdに変更」が確定済み

## DEC-003: CSV列固定方針

- **問題**: ポジション順でCSV列を決めると交代後に同列に異なるキャラが混在
- **Geminiレビュー指摘**: [MAJOR] CSVエクスポートにおけるキャラクターの固定
- **決定**: `initialParty`の`partyIndex`（初期パーティーインデックス）で列を固定
- **根拠**: スプレッドシートでの縦方向分析（特定キャラのSP推移等）が可能になる

## DEC-004: ExtraTurnState の構造化

- **問題**: Gemini設計では`allowedCharacterIds`をTurnStateのフラットフィールドとして持つが、連続extraの管理が実装依存になる
- **Codexレビュー指摘**: [MINOR] extraTurnState構造体を持たないため連続extra管理が実装依存
- **決定**: `ExtraTurnState`インターフェースを新設し、`TurnState.extraTurnState`にネストする
- **根拠**: 連続extraチェーンの状態（grantTurnIndex, allowedIds, remainingActions）を一箇所で管理できる

## DEC-005: odLevel フィールドの追加

- **問題**: Gemini設計のTurnStateにOD1/2/3の区別が`remainingOdActions`の初期値からしか判断できない
- **Codexレビュー指摘**: [MAJOR] odLevelがなくOD1/2/3の区別が不安定
- **決定**: `odLevel: 0|1|2|3`をTurnStateに追加（0=非OD）
- **根拠**: ラベル生成（"OD1-1"等）と回復量計算の両方でodLevelが必要

## DEC-006: swapEvents のプレビュー段階での保持

- **問題**: 元設計ではswapEventsはcommittedでのみ設定
- **Geminiレビュー指摘**: [MAJOR] UI上のプレビュー状態でもSwap履歴を表示する必要がある
- **決定**: `swapEvents`をpreviewとcommitted両方で保持。commitTurn時に最終状態で上書き
- **根拠**: UIが現在の前衛配置を表示するためにpreviewレコードのswapEventsが必要

## DEC-007: ActionEntry.isExtraAction フラグ追加

- **問題**: extraターン内の行動と通常ターン内の行動を区別する方法がなかった
- **Geminiレビュー提案**: [SUGGESTION] ActionEntry.isExtraActionフラグ
- **決定**: 採用。`isExtraAction: boolean`をActionEntryに追加
- **根拠**: 将来のダメージ計算補正、統計分析に有用

## DEC-008: ダメージ計算は将来実装として拡張ポイント定義のみ

- **ルール9**: ダメージ計算は将来実装として扱い、今回は拡張ポイント定義まで
- **決定**: `DamageCalculationHook`インターフェース定義のみ、実装なし
- **ActionEntry.damageResult?: DamageResult`をoptional追加**
- **根拠**: v1スコープ外。インターフェース定義のみで将来の実装を妨げない

## DEC-009: SP凍結ルール（R10確定）の統一解釈

- **問題**: Gemini設計の7章と8章でOD中の凍結ルールが矛盾
- **Codexレビュー指摘**: [CRITICAL] R10違反と[CRITICAL] 自己矛盾
- **決定（R10確定再確認）**:
  - 凍結ルール: `effectiveCeiling = Math.max(current, eventCeiling)`
  - OD中（source='od'）: `eventCeiling = 99` → current > sp.max でも回復可
  - 通常（source='base/passive'）: `eventCeiling = sp.max` → current > sp.max なら回復無効
  - **OD中でもbase/passiveはsp.max準拠**（ODはsource='od'の回復のみ上限99）
- **根拠**: R10確定「ODはsp.maxを変動させない。base/cost/passiveはOD中も通常ルールを使う」

## DEC-010: odPending発火時のodContext

- **問題**: Codexレビュー指摘「odPending発火時のodContextを何に固定するか（R9では実質interrupt）」
- **決定**: `odPending`が発火する際は常に`odContext = 'interrupt'`
- **根拠**: `odPending`はextra行動中にODトリガーが成立した場合のみ発生し、extraは行動後の現象なので、発動後は「行動後→ODターン→敵ターン」のinterruptシーケンスに準じる

## DEC-011: CharacterSnapshot 型の独立定義

- **問題**: Codex設計にCharacterSnapshotが未定義でRecordAssembler.fromSnapshot()が型不完全
- **Claudeレビュー指摘**: [SUGGESTION] CharacterSnapshot型欠如
- **決定**: CharacterStateとは別にCharacterSnapshot（Readonly型）を独立定義
- **根拠**: スナップショットは不変である必要があり、CharacterStateのmutableフィールドと混在させるべきでない

## DEC-012: EffectSlot.source の仮確定値

- **問題**: Codex設計で「暫定」とされていたEffectSlot.sourceの列挙値
- **Q-EF1: 未確定**
- **暫定決定**: `'skill' | 'passive' | 'item' | 'system'`
- **根拠**: 現行skillDatabase.jsonの構造（スキル/パッシブ）と将来拡張（アイテム/システム）をカバー
- **要ユーザー確認**

---

## 廃棄された設計案

| 案 | 廃棄理由 |
|----|----------|
| Gemini設計の`previewTurn(state, previewRecord)` でcostを再適用 | Codexレビュー指摘: 二重消費リスク。commitTurnはpreviewRecordを検証して採用する方式に変更 |
| CSV列をポジション順（0-5）で固定 | Geminiレビュー指摘: 交代後に同列に異なるキャラが混在 |
| TurnStateに`allowedCharacterIds`をフラット保持 | Codexレビュー指摘: 連続extra管理が実装依存になる |

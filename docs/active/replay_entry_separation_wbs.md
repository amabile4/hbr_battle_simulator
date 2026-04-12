# Replay Entry 分離 WBS

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-04-12 | 🔄 最終更新: 2026-04-12
>
> **親設計**: [lightweight_record_replay_design.md](lightweight_record_replay_design.md)
>
> **関連**:
> - [t34_followup_tasklist.md](t34_followup_tasklist.md)
> - [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)
> - [../archive/20260323_completed_active_docs/ui_next_manual_break_session_tasklist.md](../archive/20260323_completed_active_docs/ui_next_manual_break_session_tasklist.md)

---

## 目的

- `ReplayTurn.operations` と `ReplayTurn.overrideEntries` に混在している責務を棚卸しする
- 特に `ActionOutcomeOverrides` / `FollowUpOverrides` を「参考情報」ではなく replay の入力として再定義する
- 将来的に `overrideEntries` を縮小または廃止しても、結果影響のある入力が欠落しない構造へ段階的に移行する

## 背景

- 現行設計では `operations` は「そのターンでユーザーが行った control 操作」、`overrideEntries` は manual state と turn-bound replay snapshot を保存する箱として整理されている
- ただし実装上は `ActionOutcomeOverrides` と `FollowUpOverrides` が `overrideEntries` に保存されつつ、commit / replay / recalculate では action dict へ materialize され、`Break` / `DownTurn` / break 起点 passive / pursued hit 数に影響している
- このため現状の `overrideEntries` は「参考情報の箱」ではなく、「action 入力」と「state snapshot」が混在した箱になっている
- `overrideEntries` を丸ごと外す検証では、enemy status desc の表示は第1弾 fallback で維持できた一方、`Break` と `追撃` のような結果影響入力まで失われることが確認された

## 現状整理

### `operations` の現行責務

- button-like な control 操作を replay に残す
- timing を持つ before-commit / after-commit reservation 操作を再現する
- 現在の known type:
  - `ActivateKishinka`
  - `ActivateMakaiKihei`
  - `ActivatePreemptiveOd`
  - `ReserveInterruptOd`
  - `SummonEnemy`

### `overrideEntries` の現行責務

- manual state 注入
- turn-bound replay snapshot の保存
- action 入力の補助保存

現状は 3 種類の責務が同居しており、これを分離対象とみなす。

## 棚卸し

### A. control 操作

これらは「何を押したか」が正本であり、現行どおり `operations` に置くのが自然。

| type | 現在の保存先 | 性質 | 将来方針 |
|------|--------------|------|----------|
| `ActivateKishinka` | `operations` | control 操作 | 維持 |
| `ActivateMakaiKihei` | `operations` | control 操作 | 維持 |
| `ActivatePreemptiveOd` | `operations` | control 操作 | 維持 |
| `ReserveInterruptOd` | `operations` | control 操作 | 維持 |
| `SummonEnemy` | `operations` | control 操作 | 維持 |

### B. action 入力

これらは UI 上でユーザーが明示的に決める入力であり、結果に影響する。`operations` よりも「slot action に付く注釈」として扱うほうが意味が明確。

| type | 現在の保存先 | 結果影響 | 主な影響先 | 将来方針 |
|------|--------------|----------|------------|----------|
| `ActionOutcomeOverrides` | `overrideEntries` | あり | `Break`, `DownTurn`, break 起点 passive, kill attribution | 第1優先で分離 |
| `FollowUpOverrides` | `overrideEntries` | あり | `pursuedHitCount`, pursued target, OD gain, follow-up UI | 第1優先で分離 |

補足:

- `ActionOutcomeOverrides` は `manualBreakEnemyIndexes` / `breakHitCount` / `manualKillEnemyIndexes` として action dict に注入される
- `FollowUpOverrides` は `pursuedHitCount` / `pursuedTargetEnemyIndex` として action dict に注入される
- いずれも replay の入力であり、単なる表示補助ではない

### C. turn-start topology / state snapshot

これらは前ターン結果や manual state を「この turn を計算するための開始状態」として保存している。結果には影響するが、button-like 操作でも action 注釈でもない。

| type | 現在の保存先 | 性質 | 将来方針 |
|------|--------------|------|----------|
| `EnemyCount` | `overrideEntries` | enemy slot topology snapshot | 後続フェーズで整理 |
| `EnemyNames` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyDamageRates` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyDestructionRates` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyDestructionRateCaps` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyOdRates` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyAbsorbElements` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyBreakStates` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyStatuses` | `overrideEntries` | enemy slot snapshot | 後続フェーズで整理 |
| `EnemyAction` | `overrideEntries` | enemy-side manual/state bridge | 後続フェーズで整理 |
| `EnemyAttackTargetCharacterIds` | `overrideEntries` | enemy targeting state | 後続フェーズで整理 |
| `DpStateByPartyIndex` | `overrideEntries` | ally manual state | 後続フェーズで整理 |
| `TokenStateByPartyIndex` | `overrideEntries` | ally manual state | 後続フェーズで整理 |
| `MoraleStateByPartyIndex` | `overrideEntries` | ally manual state | 後続フェーズで整理 |
| `MotivationStateByPartyIndex` | `overrideEntries` | ally manual state | 後続フェーズで整理 |
| `MarkStateByPartyIndex` | `overrideEntries` | ally manual state | 後続フェーズで整理 |
| `StatusEffectsByPartyIndex` | `overrideEntries` | ally manual state | 後続フェーズで整理 |
| `ZoneState` | `overrideEntries` | field/manual state | 後続フェーズで整理 |
| `TerritoryState` | `overrideEntries` | field/manual state | 後続フェーズで整理 |

## 分離方針

### 基本原則

- `operations` には「ユーザーが押した control 操作」だけを残す
- `ActionOutcomeOverrides` / `FollowUpOverrides` は `operations` へ移さない
  - 理由: これらは button-like operation ではなく、各 action に付く入力注釈だから
- action 入力は `overrideEntries` から切り離し、将来的には `ReplayTurn` の独立フィールドとして扱う
- snapshot/manual state は action 入力と別フェーズで整理する

### 目標とする責務分離

```text
ReplayTurn = {
  turn,
  slots[6],
  operations?,        // control 操作
  actionInputs?,      // manual break / kill / follow-up など action 入力
  overrideEntries?,   // manual state / turn-start snapshot（移行完了まで暫定維持）
  note?
}
```

`actionInputs` は仮称であり、最終名称は実装前に確定する。

### 段階方針

#### 第1段階

- `ActionOutcomeOverrides` / `FollowUpOverrides` を「replay の入力」として明文化する
- 棚卸しと移行方針を docs に固定する
- 既存 `overrideEntries` 依存を前提とした実装箇所を洗い出す

#### 第2段階

- `ActionOutcomeOverrides` / `FollowUpOverrides` を独立フィールドへ分離する
- load/save/normalize/turn edit/recalculate/commit の全経路を新フィールド優先へ寄せる
- 旧 `overrideEntries` 読み込みは migration / fallback としてのみ残す

#### 第3段階

- `EnemyCount` など topology/state snapshot 群を別方針で整理する
- `overrideEntries` を「snapshot/state 専用の箱」として残すか、さらに別フィールドへ分離するかを判断する

## 詳細 WBS

### WBS-1: 契約の可視化

- [ ] `operations` / action 入力 / snapshot の3分類を docs で確定する
- [ ] `ActionOutcomeOverrides` / `FollowUpOverrides` が result-affecting input であることを docs に明記する
- [ ] `overrideEntries` の type 一覧と性質を表形式で固定する

完了条件:

- 実装者が「どの type がどの責務に属するか」を docs だけで判断できる

### WBS-2: action 入力分離の設計

- [ ] `ReplayTurn.actionInputs` の候補 shape を定義する
- [ ] `ActionOutcomeOverrides` と `FollowUpOverrides` の格納方式を決める
- [ ] `operations` に移さない理由を設計上明文化する
- [ ] 既存 session JSON との load 互換方針を定める

完了条件:

- 新フィールド shape と migration 方針が確定している

### WBS-3: 読み書き経路の洗い出し

- [ ] save: `#buildReplayTurn()` / `#buildReplayTurnFromDraft()` の保存経路を洗い出す
- [ ] load: `normalizeLightweightReplayTurn()` / `loadReplayScript()` の正規化経路を洗い出す
- [ ] edit: turn edit draft の入出力経路を洗い出す
- [ ] consume: `#buildActionsDict()` が action 入力を参照する箇所を一覧化する

完了条件:

- action 入力分離で変更が必要な関数一覧が揃っている

### WBS-4: action 入力分離の実装

- [ ] `ReplayTurn` に action 入力フィールドを追加する
- [ ] commit / replay / recalculate / edit を新フィールド優先へ切り替える
- [ ] save は新フィールドへ書き、旧 `overrideEntries` への二重書き要否を判断する
- [ ] load は旧 session の `overrideEntries` から新フィールドへ best-effort migration する

完了条件:

- `ActionOutcomeOverrides` / `FollowUpOverrides` が `overrideEntries` に依存せず replay 入力として機能する

### WBS-5: 検証

- [ ] manual break の session save/load 互換を固定する
- [ ] follow-up の session save/load 互換を固定する
- [ ] EX 単独 turn / summon 併用 / enemyCount 変動を含む回帰を追加する
- [ ] `overrideEntries` から action 入力を削った fixture でも同一挙動になることを固定する

完了条件:

- `Break` / `Kill` / `追撃` に関する replay 結果が新旧 session で一致する

### WBS-6: snapshot 群の後続整理

- [ ] `EnemyCount` ほか snapshot/state 群を `manual state` と `turn-start snapshot` に再分類する
- [ ] `overrideEntries` を今後も state 専用箱として残すか、`stateEntries` / `snapshotEntries` に分けるか判断する
- [ ] `EnemyStatuses` など UI 表示 fallback との境界を整理する

完了条件:

- `overrideEntries` の最終的な役割が action 入力と切り離されて定義される

## 受け入れ条件

- `ActionOutcomeOverrides` と `FollowUpOverrides` が「参考情報」ではなく「replay 入力」であることが docs に固定されている
- `operations` に入れるものと入れないものの基準が明文化されている
- `overrideEntries` の現行 type が責務別に棚卸しされている
- action 入力を `overrideEntries` から分離する段階実装の順序と完了条件が WBS で確認できる

## 非スコープ

- 本ドキュメント作成時点では実装変更を行わない
- `EnemyStatuses` や `EnemyCount` の最終配置をこの文書だけで確定しない
- 旧 `dom_adapter` 側の保存形式は対象外とする

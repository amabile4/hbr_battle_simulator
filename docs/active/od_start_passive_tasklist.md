# OD開始時パッシブ補強 タスクリスト

> **ステータス**: ✅ 完了 | 📅 作成: 2026-03-12 | 完了: 2026-03-12

## 背景・目的

`activateOverdrive()` は現在 `applyPassiveEpOnOverdriveStart()` でEP関連のみ処理している。
`OnOverdriveStart` タイミングの以下のパッシブが未処理のため補完する。

| passive | 件数 | 内容 | 未処理の理由 |
|---------|------|------|------------|
| `HealSp`（旭日昇天 Self, エクスタシー AllyAll） | 2件 | OD開始時 SP+5 | `applyPassiveEpOnOverdriveStart` は HealEp のみ対応 |
| `AttackUp`（専心 ×3） | 3件 | OD中 自身 攻撃力+20% | preview modifier へ未接続 |

`ReduceSp`（飛躍・獅子に鰭）は前回の実装で `resolveEffectiveSkillForAction` で対応済み。

## 実装方針

### HealSp (OnOverdriveStart)
- `applyPassiveEpOnOverdriveStart` は EP専用 + per-member設計 → AllyAll には対応不可
- 新関数 `applyPassiveSpOnOverdriveStart(state)` を追加し、party全体を走査
- `activateOverdrive` の末尾で呼び出し、passiveEvents / spEvents をマージ

### AttackUp (OnOverdriveStart)
- `previewActionEntries` 内の `resolvePassiveAttackUpForMember` の timings に
  `OnOverdriveStart` を追加（OD中のみ）
- ReduceSp と同じパターン（`isOverDriveActive(state.turnState)` で条件分岐）
- 状態変化なし、preview modifier に反映するだけ

## タスク

### 実装

- [x] **T1**: `applyPassiveSpOnOverdriveStart(state)` 関数を追加
  - `src/turn/turn-controller.js` の `applyPassiveEpOnOverdriveStart` の直後に追加
  - `HealSp` のみ対象、AllyAll 含む target_type を正しく解決
  - `{ spEvents, passiveEvents }` を返す

- [x] **T2**: `activateOverdrive` で `applyPassiveSpOnOverdriveStart` を呼ぶ
  - 既存の EP ループ完了後に呼び出し
  - `passiveEvents` にマージ

- [x] **T3**: `previewActionEntries` の `resolvePassiveAttackUpForMember` に `OnOverdriveStart` 追加
  - `isOverDriveActive(state.turnState)` が true の場合のみ追加
  - ReduceSp の実装（`reduceSpTimings`）と同パターン

### テスト

- [x] **T4**: `HealSp (OnOverdriveStart / Self): OD開始後に自身のSPが増加する`
  - 旭日昇天相当（Self, +5SP）
  - activateOverdrive 後の member.sp.current を確認

- [x] **T5**: `HealSp (OnOverdriveStart / AllyAll): OD開始後に全員のSPが増加する`
  - エクスタシー相当（AllyAll, +5SP）
  - activateOverdrive 後の全 party member の sp.current を確認

- [x] **T6**: `AttackUp (OnOverdriveStart / 専心): OD中の preview に attackUpRate が反映される`
  - OD状態で previewTurn → actions[].specialPassiveModifiers.attackUpRate === 0.2
  - 通常ターンでは反映されないことも確認

- [x] **T7**: `HealSp (OnOverdriveStart): 条件なし (condition: "") でも正しく適用される`
  - 補助: passiveEvents に HealSp の記録が含まれることを確認

### 完了処理

- [x] **T8**: 全テスト実行（482 → 482+N テスト PASS）
- [x] **T9**: ドキュメント更新（implementation_priority_tasklist.md / README.md）
- [x] **T10**: コミット

## 完了条件

- `activateOverdrive()` 後に旭日昇天・エクスタシー相当のSP変化がテストで確認できる
- OD中の preview で 専心相当の attackUpRate が specialPassiveModifiers に出る
- 通常ターンでは 専心の attackUpRate が出ない（非OD時の非発動）
- 全486テスト PASS（482 → 486、4件追加）

## 参照

- `src/turn/turn-controller.js`: `activateOverdrive` (line ~6823), `applyPassiveEpOnOverdriveStart` (line ~4947), `previewActionEntries` (line ~4735), `resolvePassiveAttackUpForMember` (line ~3475)
- 前回の ReduceSp 実装（`resolveEffectiveSkillForAction` の `reduceSpTimings` パターン）

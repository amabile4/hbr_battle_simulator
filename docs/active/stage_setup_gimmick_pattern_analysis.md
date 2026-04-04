# Stage Setup 初期ギミック パターン分類（第1版）

**対象ブランチ**: `feature/stage-setup`  
**作成日**: 2026-04-04  
**ステータス**: 🟢 進行中

---

## 目的

バトル開始時にステージギミックで発生する状態変化を、UI Next の Stage Setup 機能として表現するため、
提示されたパターンを以下の3区分で分類する。

- A: **既存ロジックで実現可能（初期状態注入のみ）**
- B: **既存効果はあるが StageSetup からの注入基盤が必要**
- C: **新規ロジック検討が必要**

---

## 分類結果（提示23項目）

| # | パターン | 区分 | 根拠 / メモ |
|---|---|---|---|
| 1 | 戦闘開始時ODゲージ-300% | A | `createInitializedBattleSnapshot` の `initialOdGauge` で表現可能。下限は `OD_GAUGE_MIN_PERCENT` で clamp。 |
| 2 | 3ターン味方全体の防御力+30% | A | `statusEffectsByPartyIndex` で `DefenseUp` を初期付与可能。 |
| 3 | ODゲージ上昇量+20% | C | 「OD獲得量倍率」の常時バフ状態を保持・計算する経路が未実装。 |
| 4 | ターン開始時SP0未満の前衛の味方のSP+2 | B | 条件式 `Sp()<0` / `IsFront()` と `HealSp` は既存。StageSetup から継続効果を注入する仕組みが必要。 |
| 5 | ターン開始時SP0未満の後衛の味方のSP+2 | B | #4 と同様。 |
| 6 | ターン開始時スタン状態の味方のスタン解除 | C | `RemoveSpecialStatus` は timing 処理で silent-skip。解除実体ロジックが必要。 |
| 7 | ターン開始時ダウンターン中の敵がいるとSP+2 | B | `BreakDownTurn()` 条件評価は既存。StageSetup 継続効果注入が必要。 |
| 8 | デバフ無効1回付与 | A | `DebuffGuard` 初期付与で表現可能。 |
| 9 | 回復スキルの効果量+50% | C | `GiveHealUp` は記録されるが回復計算への反映統合が不足。 |
| 10 | 戦闘開始時ODゲージ+100% | A | #1 と同様。 |
| 11 | 戦闘開始時ODゲージ+200% | A | #1 と同様。 |
| 12 | 戦闘開始時SP+5 | A | 初期SP上書き（`startSpEquipByPartyIndex` / 初期SPマップ）で実現可能。 |
| 13 | 敵を倒したとき敵1体につき味方全体のSP+1 | B | `AdditionalHitOnKillCount` + `HealSp` の既存挙動あり。StageSetup 注入が必要。 |
| 14 | 毎ターンDP+10％ | B | `HealDpRate` + `OnEveryTurn` は既存。注入経路が必要。 |
| 15 | 毎ターンSP+1 | B | `HealSp` + `OnEveryTurn` は既存。注入経路が必要。 |
| 16 | 毎ターン前衛のSP+1 | B | `HealSp` + 前衛ターゲット条件で既存表現可能。注入経路が必要。 |
| 17 | 毎ターン後衛のSP+1 | B | `HealSp` + 後衛ターゲット条件で既存表現可能。注入経路が必要。 |
| 18 | 破壊率上昇量+100% | C | 破壊率上昇量の常時倍率を管理する状態・適用経路が不足。 |
| 19 | 行動開始時ダウンターン中の敵がいるとクリティカルダメージ+30% | C | 「行動開始時」専用 timing と永続ギミック注入経路が不足。 |
| 20 | 行動開始時ダウンターン中の敵がいるとスキル攻撃力+50% | C | #19 と同様。 |
| 21 | 行動開始時ダウンターン中の敵がいると破壊率上昇量+30% | C | #19 と同様 + 破壊率上昇量バフの適用経路不足。 |
| 22 | 行動開始時ダウンターン中の敵がいると破壊率上昇量+50% | C | #21 と同様。 |
| 23 | 防御力50%アップ | A | 初期 `DefenseUp`（Eternal）で表現可能。 |

---

## 実装優先順位

### Priority 1（先に実装）

- StageSetup の最小機能として **A区分** を先に実装する。
- 対象:
  - 初期ODゲージ（-300 / +100 / +200 含む任意値）
  - 初期SP加算（+5 など）
  - 初期ステータス付与（DefenseUp, DebuffGuard）

理由:
- 既存エンジン変更を最小化できる
- 仕様リスクが低く、テストを書きやすい
- StageSetup 入力UIの受け皿（snapshot schema）を先に確立できる

### Priority 2（次段）

- B区分を実装するため、StageSetup 由来の「継続ギミック（疑似パッシブ）」注入基盤を追加する。

### Priority 3（要設計）

- C区分（OD獲得量倍率、スタン解除、回復量倍率、破壊率上昇量倍率、行動開始時条件）を仕様設計して実装する。

---

## 参照コード

- `src/ui/adapter-core.js`（初期状態注入: `initialOdGauge`, `statusEffectsByPartyIndex`, `enemyStatuses`）
- `src/turn/turn-controller.js`（パッシブ timing, 条件評価, OD/SP/DP 処理）
- `ui-next/engine/battle-state-manager.js`（UI snapshot → BattleState 変換）
- `ui-next/utils/session-snapshot.js`（session schema 正規化）

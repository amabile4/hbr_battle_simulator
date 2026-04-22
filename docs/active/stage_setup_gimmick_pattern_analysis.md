# Stage Setup 初期ギミック パターン分類（第1版）

**対象ブランチ**: `feature/stage-setup`  
**作成日**: 2026-04-04  
**ステータス**: 🟢 進行中
**最終更新**: 2026-04-22

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

---

## WBS（実装順）

**最終更新**: 2026-04-04

### Phase 1 — A区分：初期状態注入（Priority 1）

UI 入力 → snapshot → engine 初期化の経路で完結。既存エンジン変更なし。

- [x] #1 戦闘開始時ODゲージ-300%（`initialOdGauge` 任意値入力）
- [x] #10 戦闘開始時ODゲージ+100%（同上）
- [x] #11 戦闘開始時ODゲージ+200%（同上）
- [x] #12 戦闘開始時SP+5（`initialSpBonusAll` 任意値入力）
- [x] #23 防御力50%アップ（`DefenseUp` チェックボックス, power=0.5, Eternal）
- [x] #8 デバフ無効1回付与（`DebuffGuard` チェックボックス, Count=1）
- [ ] #2 3ターン味方全体の防御力+30%（エンジン対応済み。UIは50%/Eternal固定のため、power・ターン数のパラメータ化が必要）

### Phase 2 — B区分：毎ターン SP/DP 注入（Priority 2a）

`applyRecoveryPipeline` に毎ターン処理を追加する経路。

- [x] #15 毎ターンSP+1（`turnlySpAll` 入力 + エンジン適用）
- [x] #16 毎ターン前衛のSP+1（`turnlySpFront` 入力 + 前衛判定）
- [x] #17 毎ターン後衛のSP+1（`turnlySpBack` 入力 + 後衛判定）
- [ ] #14 毎ターンDP+10%（`HealDpRate` + `OnEveryTurn` は既存。UI入力 + エンジン経路追加が必要）

### Phase 3 — B区分：条件付き継続効果（Priority 2b）

ターン開始時条件評価 + StageSetup 由来の疑似パッシブ注入基盤。

- [x] #4 ターン開始時SP0未満の前衛の味方のSP+2（`stageSetup.enchantEffects` + turn-start 判定で実装）
- [x] #5 ターン開始時SP0未満の後衛の味方のSP+2（#4 と同様、後衛条件）
- [x] #7 ターン開始時ダウンターン中の敵がいるとSP+2（`DownTurn` 判定 + turn-start SP付与で実装）

### Phase 4 — B区分：イベント駆動効果（Priority 2c）

特定イベント（敵撃破）をトリガーとする効果の注入。

- [x] #13 敵を倒したとき敵1体につき味方全体のSP+1（撃破直後に同ターン内後続 action へ反映）

### Phase 5 — C区分：新規ロジック（Priority 3 — 要設計）

エンジン側に新しい状態管理・計算経路の追加が必要。

- [x] #3 ODゲージ上昇量+20%（`ODピアス` と同じ補正枠へ加算する形で実装）
- [ ] #9 回復スキルの効果量+50%（回復計算への倍率統合）
- [ ] #6 ターン開始時スタン状態の味方のスタン解除（`RemoveSpecialStatus` 実体ロジック）
- [ ] #18 破壊率上昇量+100%（破壊率上昇量の常時倍率管理）
- [ ] #19 行動開始時ダウンターン中の敵がいるとクリティカルダメージ+30%（行動開始時timing + 永続ギミック注入）
- [ ] #20 行動開始時ダウンターン中の敵がいるとスキル攻撃力+50%（#19 と同様）
- [ ] #21 行動開始時ダウンターン中の敵がいると破壊率上昇量+30%（#19 + 破壊率倍率）
- [ ] #22 行動開始時ダウンターン中の敵がいると破壊率上昇量+50%（#21 と同様）

### 進捗サマリ

| Phase | 完了 | 残り | 進捗 |
|-------|------|------|------|
| Phase 1（A区分） | 6 | 1 | 86% |
| Phase 2（毎ターンSP/DP） | 3 | 1 | 75% |
| Phase 3（条件付き継続） | 3 | 0 | 100% |
| Phase 4（イベント駆動） | 1 | 0 | 100% |
| Phase 5（C区分新規） | 1 | 7 | 13% |
| **合計** | **14** | **9** | **61%** |

## 2026-04-20 更新メモ

- Stage Setup schema に `enchantEffects` を追加し、恒星戦プリセットから OD/SP 系 5 効果を正規化保存するようにした
- `ui-next/components/stage-setup.js` に read-only の「有効なプリセット効果」要約を追加し、session save/load でも保持するようにした
- runtime では以下を実装した
  - `ODゲージ上昇量+20%`: `ODピアス` と同じ補正枠へ加算
  - `ターン開始時ダウンターン中の敵がいるとSP+2`
  - `ターン開始時SP0未満の前衛/後衛の味方のSP+2`
  - `敵を倒したとき敵1体につき味方全体のSP+1`

## 2026-04-22 更新メモ

- `Stage Setup` の直入力項目として `毎ターンOD（%）` (`turnlyOdGauge`) を追加した
- `turnlyOdGauge` は `turnlySp*` と同じ snapshot / session 経路で保持し、`enchantEffects` には載せない
- runtime では `applyStageSetupTurnStartEffects()` を shared helper として切り出し、`turnlyOdGauge` / `turnlySp*` / turn-start 条件付き SP を T1 初期表示時点から 1 回適用し、以後の turn-start でも同じ helper を再利用する
- `initialOdGauge` と `initialSpBonusAll` は battle-start only のままとし、T2 以降の turn-start では再適用しない
- passive log には `Stage Setup` 行を追加し、`戦闘開始時OD/SP`、`毎ターンOD/SP`、turn-start 条件付き SP を battle-start / turn-start の各セクションへ表示するようにした
- この追加は提示 23 項目の WBS 進捗には含めないため、進捗率は 14/23 のまま据え置く

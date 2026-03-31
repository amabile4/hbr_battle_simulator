# 敵状態異常残件クローズ タスクリスト（PRI-016）

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-14 | 📅 完了: 2026-03-14

## 目的

- `PRI-015` 後に残った `enemy_status_unimplemented 10 keys / 40 occurrences` を action / passive runtime へ接続する
- 確率系・補助系 enemy status を `enemyState.statuses` へ保存し、report の残件を 0 件化する
- `PlayerTurnEnd` 型 enemy status の寿命を追加し、passive enemy debuff を次ターンへ持ち越さない

## 事前調査メモ

- 残件は `StunRandom` / `ConfusionRandom` / `ImprisonRandom` / `Misfortune` / `HealDown` / `Hacking` / `Cover` / enemy-target `AttackUp` / `DefenseUp` / passive `DefenseDown`
- 確率系 status は現状条件参照がなく、simulator では deterministic に「付与成功」として保持しても既存 battle core と衝突しない
- `Misfortune` / `Cover` は `effect.exitVal` ではなく `power[0]` 側に継続ターンが入っている
- `Hacking` は `SkillSwitch` の variant 配下、enemy-target `DefenseUp` は `SkillRandom` の variant 配下にある
- passive `DefenseDown`（`怪物球威`）は `effect.exitCond = PlayerTurnEnd` のため、既存 `EnemyTurnEnd` 減衰だけでは寿命が 1 ターン長くなる
- [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T14` は player-side 手動拘束 hook であり、enemy status 残件とは別系統

## 今回のスコープ

### 今回やること

- residual enemy status 10 key を action / passive runtime supported set に追加する
- `SkillSwitch` / `SkillRandom` variant 配下の enemy status 抽出ルールを deterministic に固定する
- `PlayerTurnEnd` enemy status の減衰を追加する
- report helper / regenerated CSV / summary / priority docs / README を同期する

### 今回やらないこと

- enemy status のダメージ計算反映
- enemy AI / 行動不能 / ターゲット変更の battle resolution
- player-side `Imprison` 手動入力 UI
- `SkillRandom` / `SkillSwitch` 全般の包括 runtime 解決

## 対象ファイル

- `src/turn/turn-controller.js`
- `tests/turn-state-transitions.test.js`
- `tests/condition-report-sync.test.js`
- `docs/20260306_tasklist/generate_skill_unimplemented_report.mjs`
- `docs/20260306_tasklist/skills_unimplemented_summary.md`
- `docs/20260306_tasklist/skills_unimplemented_catalog.csv`
- `docs/20260306_tasklist/skills_unimplemented_occurrences.csv`
- `docs/20260306_tasklist/unsupported_matrix.csv`
- `docs/active/implementation_priority_tasklist.md`
- `docs/active/special_status_implementation_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: runtime

- [x] **T01**: residual enemy status skill_type を generic enemy status pipeline へ追加する
- [x] **T02**: `Misfortune` / `Cover` の `power[0]` ターン数解釈を追加する
- [x] **T03**: passive enemy status 付与と `PlayerTurnEnd` 減衰を追加する
- [x] **T04**: `SkillSwitch` / `SkillRandom` variant 配下の enemy status 抽出ルールを固定する

### フェーズ2: テスト

- [x] **T05**: report helper test を PRI-016 境界へ更新する
- [x] **T06**: `StunRandom` / `Misfortune` / `Hacking` / `Cover` / `HealDown` / `AttackUp` / `DefenseUp` の回帰を追加する
- [x] **T07**: passive `DefenseDown` と `PlayerTurnEnd` 寿命の回帰を追加する

### フェーズ3: report / docs

- [x] **T08**: 未対応レポートを再生成し `enemy_status_unimplemented` を 0 件化する
- [x] **T09**: `implementation_priority_tasklist.md` / `special_status_implementation_tasklist.md` / `docs/README.md` を同期する

## 完了条件

- residual 10 key が runtime supported set に入り、`enemyState.statuses` 保存まで到達する
- `PlayerTurnEnd` enemy status が次ターン preview に持ち越されない
- regenerated report の `enemy_status_unimplemented` が 0 になる
- 本ファイル、[`implementation_priority_tasklist.md`](implementation_priority_tasklist.md)、[`../README.md`](../README.md) が同じコミットで更新される

## 実装結果

- `turn-controller` の generic enemy status set に `StunRandom` / `ConfusionRandom` / `ImprisonRandom` / `Misfortune` / `HealDown` / `Hacking` / `Cover` / `AttackUp` / `DefenseUp` を追加した
- `Misfortune` / `Cover` は `power[0]` を継続ターンとして解釈し、`StunRandom` 系は deterministic に「付与成功」で保存する方針へ固定した
- passive enemy status 付与と `PlayerTurnEnd` 減衰を追加し、`怪物球威` のような turn-start enemy debuff を次ターンへ持ち越さないようにした
- enemy status 抽出は `SkillSwitch` で先頭 variant、`SkillRandom` で `power[0] >= 0.5` なら先頭 variant / それ未満なら失敗側 variant を使う deterministic rule に固定した
- 再生成後の unsupported report は `state_condition_unimplemented: 0`, `enemy_status_unimplemented: 0`, `overwrite_cond_unresolved: 0`, `effect_unresolved: 0` になった
- `T14` は enemy status 残件には吸収せず、player-side 手動拘束 hook として `PRI-017` に分離した

## 検証

- `node --test tests/condition-report-sync.test.js`
  - 3 PASS
- `node --test tests/turn-state-transitions.test.js`
  - 294 PASS
- `npm run test:quick`
  - 365 PASS

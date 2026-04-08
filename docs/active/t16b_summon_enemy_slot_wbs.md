# T16-B Summon / 敵スロット管理 実装プラン/WBS

> ステータス: 🟢 進行中
> 作成日: 2026-04-06
> 最終更新: 2026-04-08
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 進捗チェック

- [x] T16-B 専用プラン/WBS 文書を作成
- [x] 親タスクと `docs/README.md` に参照導線を追加
- [x] 着手前監査結果（OD / kill / enemyCount / 条件判定）を WBS へ反映
- [x] WBS-1: 正本データモデルの固定
- [x] WBS-2: kill / dead / alive の敵スロット管理修正
- [x] WBS-3: OD 計算の per-enemy 化
- [x] WBS-4: 条件判定と全体対象処理の alive enemy 統一
- [x] WBS-5: UI / replay / session の Summon 反映
- [x] WBS-6: テスト拡充と受け入れ確認

## 2026-04-08 実装反映メモ

Summon 後の `enemyCount` が stale な caller 値で `1` に戻され、turn start snapshot には E2 metadata があるのに committed popup では `E2 未使用` になる回帰を修正した。

- `applyBeforeCommitOperations(...)` は `SummonEnemy` 実行後に caller の `enemyCount` で occupied slot 数を縮退させないよう修正した
- `TurnRowController` の draft enemy popup は pending operations を再適用せず、すでに materialize 済みの `stateBefore` をそのまま表示するようにした
- `TurnEngineManager` の summon commit/reload 契約を `enemyCount: 1` の stale caller 値でも `EnemyCount = 2` を保存する形へ戻した
- `tests/turn-operations.test.js` / `tests/ui-next-turn-engine-manager.test.js` / `tests/ui-next-turn-ui.test.js` / `tests/e2e/turn-row-summon-enemy.spec.js` に stale `enemyCount` と phantom E3 を防ぐ回帰 coverage を追加した

## 2026-04-07 実装反映メモ

今回の実装で、手動 Summon を `ui-next/` の turn row / enemy detail popup へ追加した。

- row 上は `敵情報確認` trigger のみとし、`召喚 / ブレイク / 討伐` は `enemy-detail-popup-container` の action row へ集約した
- popup 内の敵 tab は `E1 / E2 / E3` の 3 tab を常設し、wide では 3 列、narrow では選択中 1 列へ切り替える
- wide 時は 3 列すべてに `名称` fold / `プレビュー（コミット見込み） / 状態異常 / バフ` を並べ、`召喚 / ブレイク / 討伐` action row は選択中 slot の列先頭にだけ表示する
- popup header は `敵詳細` ラベルを持たず、`E1 / E2 / E3` tab と close `×` を同じ高さに並べる
- `Summon.webp` / `Break.webp` / `defeat.webp` を popup action icon として追加し、`ブレイク / 討伐` は `ActionOutcomeOverrides` ベースの actor attribution として扱うよう戻した
- `召喚` action から listbox popover を開き、敵 preset から召喚対象を選択できるようにした
- `SummonEnemy` before-commit operation を追加し、commit / replay / recalculate / edit で同じ enemy slot snapshot を再現する
- Summon した敵の `名前 / OD率 / 最大破壊率 / 属性耐性 / 吸収属性` を slot metadata と popup 表示へ反映した
- `ui-next/utils/enemy-list.js` に手動 summon 用の pinned preset を追加し、サンプル敵 3 体を常に選択候補へ出せるようにした
- popup から `ブレイク / 討伐` を押したときは、単体攻撃で attribution 先が一意なら即時反映し、曖昧または全体攻撃なら popup 内 sub-panel editor を開いて actor と enemy の対応を選べるようにした
- break / kill の正本は `ReplayTurn.overrideEntries.ActionOutcomeOverrides` に戻し、chip 表示も `ワッキー→E1 ブレイク` / `ワッキー→E1 討伐` のような actor attribution 表示へ戻した
- `tests/e2e/turn-row-summon-enemy.spec.js` / `turn-edit-manual-break.spec.js` / `turn-row-kill-enemy.spec.js` で popup action 導線と wide/narrow layout を Playwright で固定した

手動 summon 用のサンプル敵:

- `13450251` `Dimension_03_C_DeathSlugWhite` `終焉を告げる邂逅`
- `13450256` `Dimension_03_C1_DeathSlugWhiteBit` `エネルギーピットε`
- `13450259` `Dimension_03_C1_EnergyPit_Pink_e` `エネルギーピットδ`

残タスク:

- 敵行動データの `Summon` を自動で turn operation へ落とす経路
- summon 後の `break / follow-up / target` 選択をまとめた回帰 coverage
- `BattleStateManager` へ戦闘中 summon slot を常設反映するかどうかの整理

## 2026-04-06 実装反映メモ

今回の実装で、Summon 本体の入力/生成ロジックより先に必要だった「敵 slot 正本化」の基盤を反映した。

- `enemyCount` を alive 数ではなく occupied slot 数として固定
- kill は `enemyCount--` ではなく `Dead` 付与へ変更
- `countAliveEnemies(...) === 0` を勝利判定の基準へ統一
- 単体/全体攻撃の OD を target slot / alive enemy ごとの `od_rate` で計算
- `CountBC(IsPlayer()==0...)` / `EnemyAll` / `TargetBreakDownTurn()` / `SpecialStatusCountByType(...)` の dead enemy 除外を統一
- UI Next の enemy selector は dead slot を disabled にし、enemy detail popup は occupied dead slot を `Dead` badge 付きで表示
- replay override に `EnemyOdRates` / `EnemyAbsorbElements` を追加し、turn start enemy slot snapshot を turn override に保持

この時点では未着手だった手動 summon 入力/UI/commit 経路、slot metadata 生成、E2E 固定は 2026-04-07 に反映済み。

## 目的

戦闘中の敵行動 `Summon` に対応する前提として、現在の `enemyCount` 中心の実装を見直し、敵を「固定スロット単位」で一貫管理できる状態にする。

このタスクでは特に次を解消する。

- 敵ごとの `od_rate` / `max_d_rate` / 属性耐性が、target enemy に応じて正しく参照される
- 3 スロット中の特定敵を討伐したとき、そのスロットだけが `Dead` になり、他スロットは崩れない
- `BreakDownTurn()>0` / `IsDead()==0` / `IsBroken()==1` / `SpecialStatusCountByType(...)` が討伐済み敵を誤って数えない
- `Summon` により敵スロットが増えた後も、UI / replay / recalculate が同じ意味で動作する

## 着手前監査サマリ

今回の監査で、Summon 実装前に先に直すべき論点は以下の通り。

1. `BattleStateManager` は `odRateByEnemy` をスロット別に保持しているが、OD 計算は `enemy[0]` しか見ていない
2. UI Next の討伐は `Dead` status を立てず、`enemyCount` を減らすだけである
3. 全体攻撃の OD 計算は `enemyCount` ベースで、alive enemy ベースになっていない
4. 条件 evaluator 自体は enemy index 単位の判定ができるが、kill 後 state がその前提を満たしていない

## スコープ

実装対象:

- 敵スロットの正本モデル整理
- kill / dead / alive の state 更新経路整理
- OD 計算の per-enemy 化
- `CountBC(IsPlayer()==0...)` / `TargetBreakDownTurn()` / `EnemyAll` 系の整合
- UI Next の enemy selector / popup / turn row / session / replay の追従
- Summon 追加の前提となる unit / integration / e2e テスト整備

スコープ外:

- 旧 `dom_adapter` 側の parity 対応
- 召喚 enemy の実データ定義そのものの追加
- 未定義の新規ゲーム仕様の推測実装

## 設計方針（固定）

### 方針 A: `enemyCount` を正本にしない

- `enemyCount` は「現在存在する敵スロット数」を表す補助値としては残してよい
- ただし kill / summon / status / UI 表示の正本は「enemy slot identity」で持つ
- 討伐時に index を詰める前提は採用しない

### 方針 B: 討伐は `Dead` を立てる

- kill は対象 enemy slot に `Dead` を付与する
- `enemyCount--` による存在表現はやめる
- `allEnemiesDefeated` は `countAliveEnemies(...) === 0` から導出する

### 方針 C: per-enemy 計算を優先する

- 単体攻撃の `od_rate` は target enemy の slot 値を使う
- 全体攻撃の OD は alive enemy ごとに 1hit 単位で算出して合算する
- `EnemyAll` / `BreakDownTurn` / `SpecialStatusCountByType` は alive enemy 基準で統一する

## 実行順（この順番で進める）

1. WBS-1: enemy slot 正本モデルと kill/summon セマンティクス固定
2. WBS-2: `Dead` 付与ベースの kill 処理へ移行
3. WBS-3: OD 計算を per-enemy 化
4. WBS-4: 条件判定 / 全体対象 / alive enemy 集計を統一
5. WBS-5: UI / replay / session / turn state を Summon 前提に同期
6. WBS-6: テスト追加と受け入れ確認

## 詳細 WBS

### WBS-1 設計: enemy slot 正本モデルの固定

目的:

- Summon 前提で壊れない enemy slot モデルを固定する

作業:

- [x] `enemyState` の正本フィールドを定義する
- [x] kill 時に保持すべき項目を定義する
  - [x] `enemyNamesByEnemy`
  - [x] `damageRatesByEnemy`
  - [x] `destructionRateCapByEnemy`
  - [x] `odRateByEnemy`
  - [x] `statuses`
  - [x] `breakStateByEnemy`
- [x] `enemyCount` の意味を「存在スロット数」か「alive 数」かで曖昧にしないよう固定する
- [x] Summon 追加時の slot 採番規則を定義する
  - [x] 空きスロット再利用の有無
  - [x] 最大 3 スロット固定の扱い
  - [x] replay / session 上の保存形式
- [x] 討伐済み slot の UI 表示方針を定義する

完了条件:

- kill / summon / UI / replay が同じ enemy slot identity を参照する
- 実装ファイルごとの責務が決まっている

### WBS-2 実装: kill / dead / alive の敵スロット管理修正

目的:

- 討伐時に対象スロットだけが `Dead` になり、他スロットが崩れないようにする

作業:

- [x] `TurnEngineManager` の kill override 適用を `enemyCount--` から `Dead` 付与へ変更する
- [x] kill 後 state で `enemyNamesByEnemy` / `odRateByEnemy` / `statuses` の index が崩れないようにする
- [x] `allEnemiesDefeated` を `alive enemy count` から導出する
- [x] 討伐済み enemy が break/down/special status 条件に含まれないことを保証する
- [x] committed turn の再計算でも同じ kill 結果を再現できるようにする

対象ファイル:

- `ui-next/engine/turn-engine-manager.js`
- `src/turn/turn-controller.js`
- `ui-next/utils/action-outcome-overrides.js`

完了条件:

- E2 を討伐しても E1/E3 は同じ slot のまま残る
- 討伐済み enemy は `IsDead()==0` 条件に含まれない

### WBS-3 実装: OD 計算の per-enemy 化

目的:

- enemy ごとの `od_rate` を正しく使い分ける

作業:

- [x] `resolveEnemyOdRateMultiplier()` の enemy[0] 前提を廃止する
- [x] 単体攻撃は `targetEnemyIndex` の `od_rate` を使う
- [x] 全体攻撃は alive enemy ごとに `od_rate` を解決して合算する
- [x] 追撃 OD と `OverDrivePointUp` の扱いを per-enemy 化後も仕様どおり維持する
- [x] 仕様書 `docs/specs/od_gauge_calculation_spec.md` の補足を更新する

対象ファイル:

- `src/turn/turn-controller.js`
- `docs/specs/od_gauge_calculation_spec.md`

完了条件:

- `50% / 100% / 200%` の 3 敵で target 別 OD が分かれる
- 全体攻撃で dead enemy を OD 対象に数えない

### WBS-4 実装: 条件判定 / 全体対象 / alive enemy 集計の統一

目的:

- `BreakDownTurn` / `IsBroken` / `SpecialStatusCountByType` が alive enemy 前提で整合する

作業:

- [x] `CountBC(IsPlayer()==0...)` の評価が dead enemy を除外することを確認し、必要なら修正する
- [x] `TargetBreakDownTurn()` が kill 後でも target slot を正しく見ることを確認する
- [x] `EnemyAll` / `All` 系が alive enemy のみに適用されることを確認する
- [x] break/down/superDown/dead の相互作用を整理する
- [x] victory 判定が `enemyCount` 減算依存でなくても成立するようにする

対象ファイル:

- `src/turn/turn-controller.js`
- `tests/turn-state-transitions.test.js`

完了条件:

- 討伐済み enemy の `DownTurn` が残っていても `CountBC(...IsDead()==0&&BreakDownTurn()>0)` を満たさない
- `TargetBreakDownTurn()` は target slot のみを見る

### WBS-5 実装: UI / replay / session の Summon 追従

目的:

- enemy slot の増減が UI Next 全体で一貫して見えるようにする

作業:

- [x] turn row の enemy selector が kill/summon 後 slot に追従する
- [x] enemy detail popup が dead/summoned enemy を正しく表示する
- [x] manual break / kill UI が slot identity を壊さない
- [x] replay / session JSON に kill/summon 後の enemy slot 情報を保持する
- [ ] `BattleStateManager` に Summon で追加された slot 情報を反映する経路を追加する

対象ファイル:

- `ui-next/components/turn-row.js`
- `ui-next/components/enemy-detail-popup.js`
- `ui-next/engine/turn-engine-manager.js`
- `ui-next/engine/battle-state-manager.js`
- `src/ui/lightweight-replay-script.js`

完了条件:

- commit / reload / recalculate 後も同じ enemy slot 配置になる
- UI 上でどの slot が dead / alive / summoned か追える

### WBS-6 テスト: 回帰固定と受け入れ確認

目的:

- Summon 実装前提の enemy slot 管理をテストで固定する

作業:

- [x] unit: per-enemy `od_rate` 参照テストを追加する
- [x] unit: kill 後も slot index が崩れないテストを追加する
- [x] unit: dead enemy が `BreakDownTurn` / `SpecialStatusCountByType` 条件に入らないテストを追加する
- [x] unit: all-target OD が dead enemy を数えないテストを追加する
- [x] integration: kill -> recalculate -> replay 同値性テストを追加する
- [ ] integration: summon 後に target/break/follow-up が新規 slot を扱えるテストを追加する
- [x] 必要に応じて e2e: UI Next で summon 後 slot が増えるシナリオを固定する
- [x] docs 完了更新（本書 / 親タスク / `docs/README.md`）を行う

完了条件:

- 監査で見つかった 4 論点をテストで再現・固定できる
- Summon 実装に着手しても enemy slot 管理の回帰が検出できる

## 推奨テスト実行コマンド

```bash
node --test tests/ui-next-battle-state-manager.test.js
node --test tests/ui-next-turn-engine-manager.test.js
node --test tests/turn-state-transitions.test.js
```

## 参考ファイル

- `ui-next/engine/battle-state-manager.js`
- `ui-next/engine/turn-engine-manager.js`
- `ui-next/components/turn-row.js`
- `src/turn/turn-controller.js`
- `docs/specs/od_gauge_calculation_spec.md`

# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-14
>
> **前回完了分**: [`../archive/20260313_priority_history_pri007_009.md`](../archive/20260313_priority_history_pri007_009.md) に `PRI-007`〜`PRI-009` を退避済み
>
> **判断メモ**: [`../20260306_tasklist/`](../20260306_tasklist/) は 2026-03-06 時点のスナップショットなので、件数は参考値として使う。2026-03-14 時点で `PRI-010`（skill-level `overwrite_cond`）、`PRI-011`（一般敵デバフ status 基盤 + enemy-side CountBC）、`PRI-012` は effect 監査の初回波まで進行済みで、`effect_unresolved` は `16 keys / 203 occurrences` から `9 keys / 129 occurrences` へ圧縮済み

## 目的

- 次の実装波を `3` 本に絞り、再開時の判断コストを下げる
- 既存の `passive / timing / record / scenario` 基盤を活かして前進できる課題を優先する
- フル battle core（実ダメージ計算・敵AI・勝敗フロー）は別テーマとして切り離す

## 優先度決定基準

1. 既存基盤の再利用が大きく、短い実装サイクルで閉じられるか
2. 1 本で複数の未対応スキル群を同時に前進させられるか
3. `UI / record / scenario / tests` まで一気通貫で検証しやすいか
4. フルダメージ計算や敵AIを前提にしなくても価値が出るか

## 再開時の読書順

1. [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md)
2. [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md)
3. [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md)
4. [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md)
5. [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md)
6. [`../20260306_tasklist/unsupported_matrix.csv`](../20260306_tasklist/unsupported_matrix.csv)
7. [`overwrite_cond_implementation_tasklist.md`](overwrite_cond_implementation_tasklist.md)
8. [`../archive/20260313_priority_history.md`](../20260313_priority_history.md) / [`../archive/20260313_priority_history_pri007_009.md`](../archive/20260313_priority_history_pri007_009.md)

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 先にやる理由 | 完了条件 |
|------|----|------|--------|----------|--------------|----------|
| P0 | `PRI-010` | `done` | `overwrite_cond` 実行接続と有効スキル解決の整理 | [`overwrite_cond_implementation_tasklist.md`](overwrite_cond_implementation_tasklist.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md), [`../20260306_tasklist/unsupported_matrix.csv`](../20260306_tasklist/unsupported_matrix.csv) | `overwrite_cond_unresolved` はスナップショット時点で 53 件あり、しかも `MoraleLevel` / `MotivationLevel` / `Token()` / `Mark` / `Zone` / `Sp()` / `DpRate()` など、すでに実装済みの条件群を活かせる。`resolveEffectiveSkillForAction()` も既に存在するため、レバレッジが最も高い | 完了。skill-level `overwrite_cond` が `overwrite` / `IsCharging()` / `IsTeam()` / strict mode 整合まで接続され、`npm run test:quick` 328 PASS を確認 |
| P1 | `PRI-011` | `done` | 敵状態異常基盤の拡張（既存 `enemyState.statuses` の活用） | [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md) | `enemy_status_unimplemented` はスナップショット時点で 219 件と最大規模。`DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` 系が通れば、active skill 本体・`overwrite_cond`・`CountBC` がまとめて前進する。`turnState.enemyState.statuses`、`upsertEnemyStatus()`、`tickEnemyStatuses()` は既にある | 完了。一般敵デバフの付与・上書き・期限減少・記録が通り、enemy-side `CountBC(IsPlayer()==0...)` と `SpecialStatusCountByType(12/57)` を接続した。`npm run test:quick` 335 PASS を確認 |
| P2 | `PRI-012` | `in_progress` | top-level `effect` の実挙動監査と必要分のみ接続 | [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md), [`../20260306_tasklist/unsupported_matrix.csv`](../20260306_tasklist/unsupported_matrix.csv), [`../20260306_tasklist/skills_unimplemented_summary.md`](../20260306_tasklist/skills_unimplemented_summary.md) | `effect_unresolved` はスナップショット時点で 203 件あったが、実際には metadata-only label が相当数混ざっている。まず false positive を落とし、そのあと active buff 系の実欠落へ寄せる方が安全 | 7 label を metadata-only として除外し、残件が `NormalBuff_Up` / `HealDp_Buff` / `ProtectBuff` / 属性 buff 系へ絞られる。残った label だけを既存 action/post-process パイプラインへ正規化接続し、二重適用しない回帰テストを持つ |

## PRI-010 タスクリスト

詳細は [`overwrite_cond_implementation_tasklist.md`](overwrite_cond_implementation_tasklist.md) を参照。

- [x] `json/skills.json` の `overwrite` / `overwrite_cond` を代表例で分類する
- [x] `SPコスト上書き` と `SkillCondition` 連動分岐を別パターンとして整理する
- [x] `resolveEffectiveSkillForAction()` で `overwrite_cond` を参照する実行経路を追加する
- [x] `unknown` 条件は現状どおり安全側 fallback にする
- [x] `IsCharging()` と `IsTeam()` をこの wave に含める
- [x] 代表実データで回帰テストを追加する
  - `ヘイルストーム`（回避中 SP半減）
  - `スペクタクルアート`（非火 Zone 中 SP0）
  - `燃やせ青春！マリンボール！`（やる気段階で分岐）
  - `リミット・インパクト+`（31A 人数条件）

## PRI-011 タスクリスト

詳細は [`enemy_status_implementation_tasklist.md`](enemy_status_implementation_tasklist.md) を参照。

- [x] 既存 `turnState.enemyState.statuses` のスキーマで扱う statusType 一覧を定義する
- [x] `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` / `ResistDownOverwrite` を優先実装する
- [ ] 確率系 (`StunRandom` / `ConfusionRandom` / `ImprisonRandom`) は「まず simulator ルールをどう置くか」を決めてから接続する
- [x] `upsertEnemyStatus()` / `removeEnemyStatuses()` / `tickEnemyStatuses()` を一般敵デバフでも使う
- [x] `evaluateCountBCPredicate()` に敵状態 CountBC を接続する
- [x] [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T15` をここで一緒に完了させる
- [x] `record` / scenario / enemy status UI で最小限の見える化と復元を確認する
- [x] 代表実データで回帰テストを追加する
  - `迅雷風烈` / `フレイムテンペスト`（防御/攻撃デバフ）
  - `まだまだ行くで！` / `今宵、快楽ナイトメア`（Fragile / ResistDown）
  - `スパークル・トライエッジ+`（挑発/注目依存の `overwrite_cond`）

## PRI-012 タスクリスト

詳細は [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md) を参照。

- [x] `effect_unresolved` 上位ラベルを「metadata-only」と「実欠落」に分類する
- [x] `parts` で既に十分な effect label は docs / generator 上で明示し、実装対象から外す
- [ ] 実欠落だけを virtual part か共有 post-process へ正規化接続する
- [x] `NormalBuff_Up` / `HealDp_Buff` / `DefaultDebuff` / `ProtectBuff` を優先監査する
- [x] 代表実スキル回帰で top-level `effect` 非依存を確認する
- [x] `unsupported_matrix.csv` と `skills_unimplemented_catalog.csv` の生成結果を同期させる

## 今回のスコープ外

- 実ダメージ計算、敵AI、勝敗判定、戦闘終了フロー
- `Random()` / `ConquestBikeLevel()` の UI override
- [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T14`（拘束状態の手動入力フック）
- Mark / Territory の追加見える化改善だけを目的にした単独タスク

## メモ

- `2026-03-06` スナップショットの件数は優先度判断の参考値であり、現行コードの真値ではない
- 現在の着手対象は `PRI-012`
- 各 PRI 完了時は、この文書と [`../README.md`](../README.md) を同じコミットで更新する

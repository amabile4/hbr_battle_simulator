# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-13
>
> **前回完了分**: [`../archive/20260313_priority_history_pri007_009.md`](../archive/20260313_priority_history_pri007_009.md) に `PRI-007`〜`PRI-009` を退避済み
>
> **判断メモ**: [`../20260306_tasklist/`](../20260306_tasklist/) は 2026-03-06 時点のスナップショットなので、件数は参考値として使い、2026-03-13 までに完了した `Zone / Territory` 見える化、`ZoneUpEternal`、`SpecialStatusCountByType`、SP厳密モード等は次優先候補から除外する

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
2. [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md)
3. [`../20260306_tasklist/unsupported_matrix.csv`](../20260306_tasklist/unsupported_matrix.csv)
4. [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md)
5. [`../archive/20260313_priority_history.md`](../archive/20260313_priority_history.md) / [`../archive/20260313_priority_history_pri007_009.md`](../archive/20260313_priority_history_pri007_009.md)

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 先にやる理由 | 完了条件 |
|------|----|------|--------|----------|--------------|----------|
| P0 | `PRI-010` | `ready` | `overwrite_cond` 実行接続と有効スキル解決の整理 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md), [`../20260306_tasklist/unsupported_matrix.csv`](../20260306_tasklist/unsupported_matrix.csv) | `overwrite_cond_unresolved` はスナップショット時点で 53 件あり、しかも `MoraleLevel` / `MotivationLevel` / `Token()` / `Mark` / `Zone` / `Sp()` / `DpRate()` など、すでに実装済みの条件群を活かせる。`resolveEffectiveSkillForAction()` も既に存在するため、レバレッジが最も高い | `overwrite` + `overwrite_cond` のデータパターンが整理され、SPコスト上書きと条件分岐スキルが代表ケースで動く。未対応条件は安全に fallback し、実データ回帰テストが追加される |
| P1 | `PRI-011` | `ready` | 敵状態異常基盤の拡張（既存 `enemyState.statuses` の活用） | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md), [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md), [`../20260306_tasklist/implementation_status.md`](../20260306_tasklist/implementation_status.md) | `enemy_status_unimplemented` はスナップショット時点で 219 件と最大規模。`DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` 系が通れば、active skill 本体・`overwrite_cond`・`CountBC` がまとめて前進する。`turnState.enemyState.statuses`、`upsertEnemyStatus()`、`tickEnemyStatuses()` は既にある | 敵状態異常の付与・上書き・期限減少・記録が通り、`CountBC(IsPlayer()==0...)` 系に接続される。`T15`（挑発/注目）も同時に閉じる |
| P2 | `PRI-012` | `ready` | top-level `effect` の実挙動監査と必要分のみ接続 | [`../20260306_tasklist/unsupported_matrix.csv`](../20260306_tasklist/unsupported_matrix.csv), [`../20260306_tasklist/skills_unimplemented_summary.md`](../20260306_tasklist/skills_unimplemented_summary.md) | `effect_unresolved` はスナップショット時点で 203 件あるが、`parts` だけで既に十分なものも混ざる可能性が高い。ここは即実装ではなく「実ギャップ監査 → 必要分だけ共有ハンドラへ接続」の順で進める方が安全 | `effect_unresolved` が「metadata-only」と「実際に挙動欠落」に分類され、欠落している effect label だけが既存 action/post-process パイプラインへ正規化接続される。二重適用しない実スキル回帰テストを持つ |

## PRI-010 タスクリスト

- [ ] `json/skills.json` の `overwrite` / `overwrite_cond` を代表例で分類する
- [ ] `SPコスト上書き` と `SkillCondition` 連動分岐を別パターンとして整理する
- [ ] `resolveEffectiveSkillForAction()` で `overwrite_cond` を参照する実行経路を追加する
- [ ] `unknown` 条件は現状どおり安全側 fallback にする
- [ ] `IsCharging()` のような即詰めできる不足条件をこの wave に含める
- [ ] 代表実データで回帰テストを追加する
  - `ヘイルストーム`（回避中 SP半減）
  - `スペクタクルアート`（非火 Zone 中 SP0）
  - `燃やせ青春！マリンボール！`（やる気段階で分岐）
  - `リミット・インパクト+`（31A 人数条件）

## PRI-011 タスクリスト

- [ ] 既存 `turnState.enemyState.statuses` のスキーマで扱う statusType 一覧を定義する
- [ ] `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` / `ResistDownOverwrite` を優先実装する
- [ ] 確率系 (`StunRandom` / `ConfusionRandom` / `ImprisonRandom`) は「まず simulator ルールをどう置くか」を決めてから接続する
- [ ] `upsertEnemyStatus()` / `removeEnemyStatuses()` / `tickEnemyStatuses()` を一般敵デバフでも使う
- [ ] `evaluateCountBCPredicate()` に敵状態 CountBC を接続する
- [ ] [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T15` をここで一緒に完了させる
- [ ] `record` / scenario / enemy status UI で最小限の見える化と復元を確認する
- [ ] 代表実データで回帰テストを追加する
  - `ハードブレード` / `フレイムテンペスト`（防御/攻撃デバフ）
  - `リミット・インパクト+`（Fragile + Stun）
  - 挑発/注目依存の `overwrite_cond` / `SkillCondition`

## PRI-012 タスクリスト

- [ ] `effect_unresolved` 上位ラベルを「metadata-only」と「実欠落」に分類する
- [ ] `parts` で既に十分な effect label は docs 上で明示し、実装対象から外す
- [ ] 実欠落だけを virtual part か共有 post-process へ正規化接続する
- [ ] `NormalBuff_Up` / `HealDp_Buff` / `DefaultDebuff` / `ProtectBuff` を優先監査する
- [ ] `PRI-011` で追加した敵状態異常処理へ `DefaultDebuff` 系を繋ぐ
- [ ] 二重適用を防ぐ回帰テストを追加する

## 今回のスコープ外

- 実ダメージ計算、敵AI、勝敗判定、戦闘終了フロー
- `Random()` / `ConquestBikeLevel()` の UI override
- [`special_status_implementation_tasklist.md`](special_status_implementation_tasklist.md) の `T14`（拘束状態の手動入力フック）
- Mark / Territory の追加見える化改善だけを目的にした単独タスク

## メモ

- `2026-03-06` スナップショットの件数は優先度判断の参考値であり、現行コードの真値ではない
- 次の実装着手は `PRI-010` から始める
- 各 PRI 完了時は、この文書と [`../README.md`](../README.md) を同じコミットで更新する

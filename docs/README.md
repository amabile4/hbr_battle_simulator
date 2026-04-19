# docs/ ドキュメント管理インデックス

**このファイルが `docs/` の唯一のナビゲーション起点です。**
AIエージェント・開発者ともに、`docs/` を参照・更新する際はここから始めてください。

---

## ドキュメント管理ルール

### ステータス定義

| 記号 | ラベル | 意味 | 更新タイミング |
|------|--------|------|----------------|
| 🟢 | 進行中 | アクティブに更新するタスク・計画 | 実装進捗に合わせて随時 |
| 📚 | 参照 | 変わらない確定仕様（読む専用） | 仕様変更時のみ |
| 📦 | スナップショット | 特定時点の調査記録（変更しない） | 変更しない |
| ✅ | 完了 | タスク完了・実装済み | 完了確認時 |
| 🗄️ | アーカイブ | 廃止・後継ドキュメントあり | アーカイブ移動時 |

### 配置ルール

```
docs/
├── README.md                    # マスターインデックス（常に最新）
├── active/                      # 🟢 進行中の実装計画・仕様
├── specs/                       # 📚 確定設計仕様（参照専用）
├── YYYYMMDD_xxx/                # 📦 日付プレフィックス = スナップショット（変更しない）
└── archive/                     # 🗄️ 廃止・後継あり（削除しない）
```

### AIエージェントの必須作業

実装タスクを完了した際は、**以下をセットで実施すること**（必須）：

1. **対象ドキュメントのステータスを更新する**
   - 完了 → ステータス行を `✅ 完了` に変更し最終更新日を記載
   - 部分完了 → 完了した項目に `[x]` チェックを入れる
2. **このファイル（docs/README.md）の該当行のステータス列を更新する**

---

## active/（運用中ドキュメント）

| ドキュメント | ステータス | 概要 | 最終更新 |
|-------------|-----------|------|----------|
| [active/stage_setup_gimmick_pattern_analysis.md](active/stage_setup_gimmick_pattern_analysis.md) | 🟢 進行中 | Stage Setup 初期ギミック23項目の分類（A:初期状態注入, B:注入基盤追加, C:新規ロジック）と実装優先順位（Priority 1-3）。WBS追加: 9/23完了(39%) | 2026-04-04 |
| [active/implementation_priority_tasklist.md](active/implementation_priority_tasklist.md) | 🟢 進行中 | PRI-018（スキル使用回数制約）を次優先とした実装バックログ。enemy-side `SpecialStatusCountByType(3/12/22/57/172)` と `Cover` 意味差分の調査メモに加え、replay snapshot で `enemyBreakStates[*].superDown` のみ残るケースでも `172` を解決する補正を追記 | 2026-04-18 |
| [active/e_shield_preparation_plan.md](active/e_shield_preparation_plan.md) | 🟢 進行中 | Eシールド engine-first 実装の正本。inactive raw 定義の ingest 正規化、`turn-controller` の減算 / same-action auto BREAK / `IgnoreEShieldElement`、`eShieldStateByEnemy` 保持、turn row 左パネル / enemy detail popup の shared badge 表示、Enemy Setup の `カテゴリ -> 敵` selector 汎用化に加え、通常攻撃の `OD=2.5% 固定 / Eシールド=raw hit 数` 分離、および `Dimension_09_X_KaleidoOuroboros` の `テンプレート` 常時表示まで反映。後続は手動編集、`HealEShield` / `ReviveEShield`、save/load/summon 回帰を管理 | 2026-04-19 |
| [active/ui_next_design.md](active/ui_next_design.md) | 🟢 進行中 | UI Next 設計メモ（Party Setup・スキル設定パネル・PT解散導線・Party Setup header の `並替 OFF/ON` toggle / reorder help / `全体初期化` confirm・toolbar preset strip 20枠・strict preset schema・browser D&D handle 方針・Passive Log 下段 pane と desktop resize handle・toolbar icon/mobile rules・startup defaults・PNG capture contract・SessionSnapshot の人間向け補助フィールド方針・turn row バフアイコンを状態変化定義順で拡張（全体上限10・デバフ除外・Count/Only競合は採用側のみ表示）・turn row OD負債badgeの `3/2/1/0` 表示・Fieldタブの属性/倍率/継続表示とturn rowのactive field chip表示・Talisman表示条件の明確化・Warning/Error の名前併記 helper 方針・ReduceSpは消費SP計算専用でcurrent SP非変更・legacy UI 廃止前提・top-level `ui/` 削除済み・`src/ui` shared module 維持・Enemy先制Turn0フィールド先行適用・初期 Break/Down 非採用・手動 Summon sample enemy 3体固定・enemy detail popup の `E1/E2/E3` 3 tab、wide 3列 / narrow 1列 layout、`3表示 / 1表示` toggle、occupied slot 数ベース default、popup content 幅ベースの早め narrow fallback、`名称` fold header、`敵情報確認 / 敵情報 / 敵` label の実 DOM 切替、Enemy Setup の `カテゴリ -> 敵` selector と `恒星掃戦線` category definition、Eシールド代表敵の `テンプレート` 常時表示、preset long-press の text selection 抑止と fixed menu、manual target popover の viewport 基準再配置、mobile target trigger の icon 非重畳、session replay E2E の battle-end あり/なし fixture 固定、popup 内 break/kill attribution sub-editor と `ActionOutcomeOverrides` 正本、summon popover は popup を閉じず前面表示し viewport 再配置後も前面 z-index を維持、popup 配色に寄せた slate テーマ、同一敵への manual Break first-wins と後続 SuperBreak 系許可、`[演習機]ヘフティーガーディアン` SuperBreak E2E 固定、`SuperBreak` の `Before/After` hit timing 対応、`SuperBreakDown` の same-action manual Break 昇格対応、popup の `BREAK` バッジ / `DownTurn` 一覧 / pending 時の `ブレイク予定` `討伐予定` / 操作 action 分離、`StrongBreak` / `SuperDown` の UI 露出廃止と canonical `SuperBreak` / `SuperBreakDown` 表示、operation chip の nowrap 固定、turn row `フォームチェンジ` chip / `CHANGE` button / 専用スキル選択時の自動同期、char detail popup の form chip / ability dimming / draft passive 切替） | 2026-04-19 |
| [active/ui_next_gui_design_spec.md](active/ui_next_gui_design_spec.md) | 📚 参照 | UI Next GUI モック参照資料（Initial Setup / Party Setup / Enemy Setup 拡張点）。配色・余白の参考のみ、正本は ui_next_design.md | 2026-03-31 |
| [active/ui_next_implementation_tasklist.md](active/ui_next_implementation_tasklist.md) | 📚 参照 | UI Next 実装の完了履歴リファレンス。未実装タスク管理は `ui_next_unimplemented_tasklist.md` へ分離 | 2026-04-05 |
| [active/ui_next_unimplemented_tasklist.md](active/ui_next_unimplemented_tasklist.md) | 🟢 進行中 | UI Next 単一 backlog。`setup_panel_layout_and_perf` / `implementation_priority` / `skill_limit` / `stage_setup_gimmick` の未実装も統合管理。T33/T33-FU1 は完了済みとして閉じ、現優先を `PRI-018 / Skill Usage Limits`、次点を `T16-B auto summon` と `T34 follow-up` に更新し、enemy popup の `3表示 / 1表示` toggle と早め narrow fallback 反映を追記 | 2026-04-12 |
| [active/t33_skill_passive_audit_wbs.md](active/t33_skill_passive_audit_wbs.md) | ✅ 完了 | T33 実データ基準監査の完了記録。`HbrDataStore` ベースの audit harness・baseline test・doc sync に加え、`T33-FU1` の `AdditionalHitOnExtraSkill + Talisman` 実装完了により `logicGapCount=0` まで収束 | 2026-04-10 |
| [active/talisman_completion_wbs.md](active/talisman_completion_wbs.md) | ✅ 完了 | 霊符状態完成 WBS。`恐怖の叫び` の `AdditionalHitOnExtraSkill + Talisman`、record / `damageContext` 露出、enemy popup の compact block / action-flow 表示に加え、popup の参照先を正本 `assets/skill_type/Talisman.webp` に統一済み | 2026-04-10 |
| [active/disaster_status_wbs.md](active/disaster_status_wbs.md) | ✅ 完了 | `Disaster / 禍` 実装完了記録。`enemyState.disasterState`、`damageContext` 集約、enemy popup / field chip / char detail 表示、popup の参照先を正本 `assets/skill_type/Disaster.webp` に統一、compact block 化、audit baseline 更新、browser E2E まで反映。current live style では `もつれトラップ` + `巻き添え` で初回 `Lv4 / 全能力-28` | 2026-04-10 |
| [active/dark_transcendence_override_fix.md](active/dark_transcendence_override_fix.md) | ✅ 完了 | `1005107 / アオゾラ全力応援歌` の `闇の律動` に対応する `Dark` 超越 override を追加し、実データの初期化・行動加算の回帰テストを追加 | 2026-04-11 |
| [active/non_damage_part_range_resolution_fix.md](active/non_damage_part_range_resolution_fix.md) | ✅ 完了 | non-damage part の `power` レンジを runtime で正規化し、`今宵、快楽ナイトメア` の `Funnel 5回` と追加ターン重複後の `ハネ殺し` OD獲得量を実機側へ補正。関連する実データ回帰も max-side 解決へ更新 | 2026-04-11 |
| [active/t16b_summon_enemy_slot_wbs.md](active/t16b_summon_enemy_slot_wbs.md) | 🟢 進行中 | T16-B Summon / 敵スロット管理の実装プラン。enemy slot 正本化の基盤に続き、手動 Summon、replay/slot snapshot 反映、popup の耐性/吸収表示、sample enemy 3体固定、enemy detail popup の `E1/E2/E3` 3 tab、wide 3列 / narrow 1列 layout、`名称` fold header、`敵情報確認 / 敵情報 / 敵` label、popup 内 break/kill attribution sub-editor と `ActionOutcomeOverrides` 復帰、summon popover の前面維持と slate テーマ化、stale `enemyCount` で E2 が `未使用` に戻る回帰、draft popup の phantom E3 回帰、dead-slot summon 固定、単体敵 auto-target 正規化、summon 後 selector/break/follow-up/recommit 回帰を修正・固定済み。残りは敵行動データからの自動 summon 化と `BattleStateManager` 責務整理 | 2026-04-11 |
| [active/review_enemy_slot_feature_branch.md](active/review_enemy_slot_feature_branch.md) | ✅ 完了 | `feature/engine-summon-enemy-slot` レビュー記録。敵スロット設計はマージ可能、follow-up として summon 上限 warning 可視化と status filter 可読性整理まで反映済み | 2026-04-10 |
| [active/t34_enemy_status_management_plan_wbs.md](active/t34_enemy_status_management_plan_wbs.md) | ✅ 完了 | T34（敵状態変化管理・表示）実装プラン/WBS。WBS-1〜5 全完了（設計・実装・UI・テスト・受け入れ検証）。全877テスト PASS。残タスクは followup へ分離 | 2026-04-06 |
| [active/t34_followup_tasklist.md](active/t34_followup_tasklist.md) | 🟢 進行中 | T34 フォローアップ。WBS-3e / E2E 残件 / T34-FU1 に加え、T34-FU4（statusType ソート順統一 — 暫定 v1 実装済み、SORT-TODO-1〜3 を v2 scope へ）を管理し、enemy status `sourceSkillDesc` の clone/snapshot 欠落回帰、第1弾の `overrideEntries` 非依存 UI fallback、enemy popup preview での desc 表示、`Dead` status での desc suppression、および同一 statusType 内の `Eternal → Turn系 → Count` 順 fix まで反映済み | 2026-04-12 |
| [active/lightweight_record_replay_design.md](active/lightweight_record_replay_design.md) | 🟢 進行中 | 軽量 replay/edit 設計案。ReplayScript 正本化後の運用メモとして、`ActivateMakaiKihei` の専用 OD 解決規則（live enemy / `od_rate` 反映、drive pierce 非適用、EX 中も before-commit 適用）を追記 | 2026-04-11 |
| [active/replay_entry_separation_wbs.md](active/replay_entry_separation_wbs.md) | 🟢 進行中 | `ReplayTurn.operations` と `overrideEntries` の棚卸しと分離方針。`ActionOutcomeOverrides` / `FollowUpOverrides` を result-affecting input として再定義し、control 操作・action 入力・snapshot/state の3分類で段階移行する WBS | 2026-04-12 |
| [active/skill_limit_implementation_tasklist.md](active/skill_limit_implementation_tasklist.md) | 🟢 進行中 | PRI-018: スキル使用回数制約と回復機能（HealSkillUsedCount 等）の実装計画 | 2026-03-14 |
| [active/passive_implementation_tasklist.md](active/passive_implementation_tasklist.md) | 🟢 進行中 | パッシブ条件・タイミング実装計画。`AdditionalHitOnExtraSkill` の `DebuffGuard` / `BuffCharge` / `Talisman` を含む trigger 経路を実装済みとし、残課題を `ConquestBikeLevel` UI override・印/UI 観測強化・OD終了側追跡へ整理 | 2026-04-10 |
| [active/stateful_passive_wbs.md](active/stateful_passive_wbs.md) | ✅ 完了 | 状態付与型パッシブ（AdditionalHit* 38件）の完了記録。`恐怖の叫び` の `AdditionalHitOnExtraSkill + Talisman` 実装により 38/38 が runtime・test ともに接続済み | 2026-04-10 |
| [active/passive_test_coverage_audit.md](active/passive_test_coverage_audit.md) | 🟢 進行中 | パッシブ発火トリガー × exitCond テストカバレッジ監査。T33/T33-FU1 完了後の再照合として、runtime gap 0件・observability gap 2件・stale doc false positive 0件・out-of-scope 3件へ更新 | 2026-04-10 |
| [active/count_only_status_audit.md](active/count_only_status_audit.md) | ✅ 完了 | `Count` / `Only` 併存 status family 監査。family 列挙、runtime/test 経路、実機確認マトリクスまで整理済み。`DefenseUp` は実データ0件だが、将来流入に備えた runtime/UI/test 基盤を回帰で固定済み | 2026-04-10 |
| [active/setup_panel_layout_and_perf_tasklist.md](active/setup_panel_layout_and_perf_tasklist.md) | 🟢 進行中 | Setup パネルのタブレイアウト改善（L01〜L04 ✅）とロード高速化（P01〜P03 ❌）タスクリスト | 2026-03-29 |
| [active/passive_timing_reference.md](active/passive_timing_reference.md) | 📚 参照 | パッシブタイミング11種の評価入口リファレンス。`OnOverdriveStart` の旧 runtime-gap 注記を削除し、現行入口と `OnEveryTurnIncludeSpecial` の観測ギャップを整理 | 2026-04-10 |
| [active/turn_timing.md](active/turn_timing.md) | 📚 参照 | バトルフロー図と各タイミングの説明（Enemy先制行動〜バトル終了） | 2026-03-31 |
| [active/ui_parallel_interface_spec.md](active/ui_parallel_interface_spec.md) | 📚 参照 | UI/Adapter層の並列開発インターフェース仕様（top-level `ui/` 削除済みの current state と `src/ui` shared module 境界へ更新） | 2026-03-31 |
| [active/gui_technology_candidates.md](active/gui_technology_candidates.md) | 📚 参照 | GUI実装技術候補の比較調査 | 2026-03-08 |
| [active/buff_consumption_current_flow.md](active/buff_consumption_current_flow.md) | 📚 参照 | Phase 1: バフ消費ロジック現状分析 - Funnel/MindEye/Count型/ターン型各消費パターンの完全フロー図とコード参照 | 2026-03-30 |
| [active/buff_consumption_schema.md](active/buff_consumption_schema.md) | 📚 参照 | Phase 1/3: 統一バフスキーマ設計 - StatusEffect メタデータ統一仕様（exitCond/limitType/consumeTrigger）と ActionContext 型定義。Phase 3 runtime 接続注記を反映済み | 2026-03-31 |
| [active/action_context_matrix.md](active/action_context_matrix.md) | 📚 参照 | Phase 1/3: アクション分類マトリクス - 行動種別 × exitCond 判定基準の完全参照表。P3-05 後の差分なし確認を追記済み | 2026-03-31 |

---

## 📚 確定設計仕様（specs/）

| ドキュメント | 概要 | 作成日 |
|-------------|------|--------|
| [specs/runs/RUN_20260228_001/README.md](specs/runs/RUN_20260228_001/README.md) | 中核3システム設計の総合レポート（確定済み） | 2026-02-28 |
| [specs/runs/RUN_20260228_001/integrated_architecture_spec.md](specs/runs/RUN_20260228_001/integrated_architecture_spec.md) | 統合アーキテクチャ仕様 | 2026-02-28 |
| [specs/runs/RUN_20260228_001/interfaces.ts](specs/runs/RUN_20260228_001/interfaces.ts) | TypeScript全体インターフェース定義 | 2026-02-28 |
| [specs/runs/RUN_20260228_001/decision_log.md](specs/runs/RUN_20260228_001/decision_log.md) | 設計意思決定ログ（DEC-001〜012） | 2026-02-28 |
| [specs/runs/RUN_20260228_001/open_questions.md](specs/runs/RUN_20260228_001/open_questions.md) | ユーザー確認が必要な未決事項（Q-S001等） | 2026-02-28 |
| [specs/repo_workflow.md](specs/repo_workflow.md) | project 固有の branch 命名、merge 方針、shared 変更の流し方、git 実行安全ルール、実装者自身によるテスト責務 | 2026-03-15 |
| [specs/od_gauge_calculation_spec.md](specs/od_gauge_calculation_spec.md) | ODゲージ計算仕様（通常攻撃 `2.5%` 固定、od_rate の1hit単位切り捨て・共鳴OD重複防止を反映） | 2026-04-19 |
| [specs/sp_condition_skill_spec.md](specs/sp_condition_skill_spec.md) | SP条件スキル仕様（Sp()<0 / Sp()>0 / Sp()>19, sp_cost=-1 全SP消費） | 2026-03-12 |
| [specs/dev_principles.md](specs/dev_principles.md) | 開発原則：バグ切り分け・UI/エンジン責務境界・安易な実装禁止事項・新UI設計指針（原則1〜5） | 2026-03-16 |
| [specs/ui_next_game_rules_index.md](specs/ui_next_game_rules_index.md) | UI Next 旧実装参照インデックス：旧UIファイル構造・spec要素対応表・エンジン層ゲームルール辞書（A〜E カテゴリ） | 2026-03-16 |

---

## 📦 スナップショット（日付別・変更しない）

### 20260321_ui_next_analysis/ — UI Next アーキテクチャ・仕様分析（2026-03-21実施）

| ドキュメント | 概要 |
|-------------|------|
| [20260321_ui_next_analysis/README.md](20260321_ui_next_analysis/README.md) | UI Next アーキテクチャ・仕様分析の概要・分析範囲・主要な発見 |
| [20260321_ui_next_analysis/ui_next_architecture_overview.md](20260321_ui_next_analysis/ui_next_architecture_overview.md) | UI Next 全体アーキテクチャ概要：エンジン層とUI層の責務分離・データフロー・主要コンポーネント |
| [20260321_ui_next_analysis/ui_next_party_setup_spec.md](20260321_ui_next_analysis/ui_next_party_setup_spec.md) | UI Next Party Setup 仕様：6スロット編成・メイン/サポート選択・設定項目・プリセット機能 |
| [20260321_ui_next_analysis/ui_next_turn_row_spec.md](20260321_ui_next_analysis/ui_next_turn_row_spec.md) | UI Next Turn Row 仕様：1ターン分のUI・未コミット/コミット済み行・スキル選択・OD管理・ブレイク編集 |
| [20260321_ui_next_analysis/ui_next_turn_engine_manager_spec.md](20260321_ui_next_analysis/ui_next_turn_engine_manager_spec.md) | UI Next TurnEngineManager 仕様：リプレイスクリプト管理・preview/commit・再計算・特殊操作管理 |
| [20260321_ui_next_analysis/ui_next_data_flow.md](20260321_ui_next_analysis/ui_next_data_flow.md) | UI Next データフロー：ユーザー操作からエンジン実行までのデータフロー詳細 |
| [20260321_ui_next_analysis/ui_next_component_interaction.md](20260321_ui_next_analysis/ui_next_component_interaction.md) | UI Next コンポーネント間相互作用：コンポーネント階層・コールバック連携・データの流れ |

### 20260314_record_replay_edit_investigation/ — 記録・再生・編集機能の現状調査（2026-03-14実施）

| ドキュメント | 概要 |
|-------------|------|
| [20260314_record_replay_edit_investigation/README.md](20260314_record_replay_edit_investigation/README.md) | `recordStore.records` / `turnPlans` / `turnPlanBaseSetup` の責務分離、再計算経路、シンプル記録モデルとの乖離を整理した調査メモ |

### 20260308_code-review/ — コードレビュー（2026-03-08実施）

> ベースラインコミット: `9d7c23f`（branch: `feature/record-edit-recalculation`）

| ドキュメント | 概要 |
|-------------|------|
| [20260308_code-review/REVIEW_BASELINE.md](20260308_code-review/REVIEW_BASELINE.md) | ベースライン情報・再レビュー手順 |
| [20260308_code-review/00_summary.md](20260308_code-review/00_summary.md) | エグゼクティブサマリー（問題点一覧・スコア） |
| [20260308_code-review/01_domain_layer.md](20260308_code-review/01_domain_layer.md) | domain/data/records層レビュー |
| [20260308_code-review/02_ui_layer.md](20260308_code-review/02_ui_layer.md) | UI層レビュー |
| [20260308_code-review/03_turn_layer.md](20260308_code-review/03_turn_layer.md) | turn/config層レビュー |
| [20260308_code-review/04_recommendations.md](20260308_code-review/04_recommendations.md) | 改善提案（優先度・工数目安） |
| [20260308_code-review/05_test_coverage_review.md](20260308_code-review/05_test_coverage_review.md) | テストカバレッジレビュー |
| [20260308_code-review/06_test_grouping_proposal.md](20260308_code-review/06_test_grouping_proposal.md) | テストグループ化提案（高速化） |
| [20260308_code-review/07_test_data_shrink_study.md](20260308_code-review/07_test_data_shrink_study.md) | テストデータシュリンク調査 |
| [20260308_code-review/08_test_coverage_from_real_data.md](20260308_code-review/08_test_coverage_from_real_data.md) | 実データからのテストケース分析 |

### 20260306_tasklist/ — スキル未対応調査（2026-03-06実施）

| ドキュメント | 概要 |
|-------------|------|
| [20260306_tasklist/README.md](20260306_tasklist/README.md) | 調査概要・定義・再生成方法 |
| [20260306_tasklist/implementation_status.md](20260306_tasklist/implementation_status.md) | 実装済み/未実装機能の全体整理 |
| [20260306_tasklist/skills_unimplemented_catalog.csv](20260306_tasklist/skills_unimplemented_catalog.csv) | 未対応条件の集約一覧（49KB） |
| [20260306_tasklist/skills_unimplemented_occurrences.csv](20260306_tasklist/skills_unimplemented_occurrences.csv) | 未対応条件の全出現行（212KB） |

### 20260226_json-data-research/ — SeraphDB JSONデータ構造調査（2026-02-26実施）

> データは57スタイル時点のスナップショット（現在は59スタイル）

| ドキュメント | 概要 |
|-------------|------|
| [20260226_json-data-research/summary.md](20260226_json-data-research/summary.md) | 採用優先フィールドTop20・捨て候補Top20 |
| [20260226_json-data-research/field_tree.md](20260226_json-data-research/field_tree.md) | 全データセットのフィールドツリー |
| [20260226_json-data-research/relation_map.md](20260226_json-data-research/relation_map.md) | データセット間のJoin候補・Jaccard係数 |
| [20260226_json-data-research/adoption_candidates.csv](20260226_json-data-research/adoption_candidates.csv) | 採用候補フィールド一覧（CSV） |

### 20260225_help-research/ — ゲーム仕様調査（2026-02-25実施）

| ドキュメント | 概要 |
|-------------|------|
| [20260225_help-research/10_conditional_skill_support_matrix.md](20260225_help-research/10_conditional_skill_support_matrix.md) | スキル条件対応マトリックス（31KB） |
| [20260225_help-research/02_help_facts_catalog.md](20260225_help-research/02_help_facts_catalog.md) | ゲーム仕様事実カタログ（39KB） |
| [20260225_help-research/01_site_inventory.md](20260225_help-research/01_site_inventory.md) | HBR公式サイト情報インベントリ（50KB） |

### 20260301_implementation_runs/ — 実装実績記録（2026-03-01）

| ドキュメント | 概要 |
|-------------|------|
| [20260301_implementation_runs/RUN_20260301_001/](20260301_implementation_runs/RUN_20260301_001/) | キャラクター選択UI M1実装（Codex/Gemini結果・スクショ） |

---

## 🗄️ アーカイブ（廃止済み）

### 20260405_completed_active_docs/（2026-04-05 アーカイブ）

完了済みの Follow-Up レビュー文書と割込OD不具合記録を active から移動。

| ドキュメント | 概要 |
|----------------|------|
| [archive/20260405_completed_active_docs/follow_up_code_review.md](archive/20260405_completed_active_docs/follow_up_code_review.md) | 追撃（Follow-Up）第1回コードレビュー（全修正完了記録） |
| [archive/20260405_completed_active_docs/follow_up_code_review_round2.md](archive/20260405_completed_active_docs/follow_up_code_review_round2.md) | 追撃（Follow-Up）第2回コードレビュー（全修正完了記録） |
| [archive/20260405_completed_active_docs/follow_up_code_review_round3.md](archive/20260405_completed_active_docs/follow_up_code_review_round3.md) | 追撃（Follow-Up）第3回コードレビュー（追撃経路整理の完了記録） |
| [archive/20260405_completed_active_docs/follow_up_merge_review.md](archive/20260405_completed_active_docs/follow_up_merge_review.md) | feature/ui-next-follow-up → main のマージレビュー完了記録 |
| [archive/20260405_completed_active_docs/interrupt_od_enemy_turn_start_double_fire.md](archive/20260405_completed_active_docs/interrupt_od_enemy_turn_start_double_fire.md) | 割込OD時 OnEnemyTurnStart 先行発火の修正完了記録 |

### 20260323_completed_active_docs/（2026-03-23 アーカイブ）

完了済みタスクリスト・バグ修正記録 30件をアーカイブ。

| 主なドキュメント | 概要 |
|----------------|------|
| `support_skills_implementation_tasklist.md` | サポート枠・共鳴アビリティ実装（446 PASS） |
| `resonance_full_coverage_tasklist.md` | 共鳴アビリティ全21グループ カバレッジ（468 PASS） |
| `ui_support_slot_improvement_tasklist.md` | サポート枠UI改善（476 PASS） |
| `token_per_passive_tasklist.md` | AttackUpPerToken / DefenseUpPerToken（492 PASS） |
| `ui_next_manual_break_session_tasklist.md` | manual break・save-load・validationPolicy（720 PASS） |
| `ui_next_target_selection_repair_tasklist.md` | enemyCount永続化・target再接続（720 PASS） |
| `lightweight_record_replay_implementation_tasklist.md` | ReplayScript 正本化・best-effort replay（720 PASS） |
| `passive_debug_log_wbs.md` | パッシブログ2ターン目以降表示問題（711 PASS） |
| `passive_log_display_bug_issue.md` | サポートパッシブログ表示（711 PASS） |
| `responsive_popover_positioning_fix.md` | iPhoneポップオーバーはみ出し修正 |
| `support_tier_check_bug_issue.md` | SSR以外へのサポート共鳴誤適用修正 |
| `phase0_investigation_report.md` / `phase1_plan.md` | passive timing 監査フェーズ0-1記録 |
| PRI-010〜017 タスクリスト群 | overwrite_cond / active buff / enemy status 等 |

---

### 20260331_completed_active_docs/（2026-03-31 アーカイブ）

バフ消費 Phase 2-3 の完了文書、UI Next D&D レビュー一式、完了済み不具合調査・評価メモをアーカイブ。restoration WBS（フェーズ0〜4完了）・PNG capture レビュー依頼（T23 完了）を追加。

| ドキュメント | 概要 |
|----------------|------|
| [archive/20260331_completed_active_docs/buff_consumption_p3_05_code_review.md](archive/20260331_completed_active_docs/buff_consumption_p3_05_code_review.md) | P3-05 TurnEnd `shouldConsume()` 移行の再レビュー完了記録 |
| [archive/20260331_completed_active_docs/buff_consumption_phase2_review.md](archive/20260331_completed_active_docs/buff_consumption_phase2_review.md) | バフ消費オーケストレータ Phase 1-2 実装レビュー完了記録 |
| [archive/20260331_completed_active_docs/buff_consumption_phase3_review.md](archive/20260331_completed_active_docs/buff_consumption_phase3_review.md) | バフ消費オーケストレータ Phase 3 実装レビュー完了記録 |
| [archive/20260331_completed_active_docs/buff_consumption_phase3_wbs.md](archive/20260331_completed_active_docs/buff_consumption_phase3_wbs.md) | バフ消費オーケストレータ Phase 3 WBS 完了版 |
| [archive/20260331_completed_active_docs/kokushipmusoujou_additional_turn_bug.md](archive/20260331_completed_active_docs/kokushipmusoujou_additional_turn_bug.md) | 国士無双の追加ターン不具合修正と調査記録 |
| [archive/20260331_completed_active_docs/mindeye_investigation_results.md](archive/20260331_completed_active_docs/mindeye_investigation_results.md) | MindEye 消費・Condition・Modifier の調査最終報告 |
| [archive/20260331_completed_active_docs/mindeye_only_count_integration_assessment.md](archive/20260331_completed_active_docs/mindeye_only_count_integration_assessment.md) | MindEye/Funnel の Only/Count 分離統合可能性評価 |
| [archive/20260331_completed_active_docs/review_ui_next_drag_and_drop.prompt.md](archive/20260331_completed_active_docs/review_ui_next_drag_and_drop.prompt.md) | UI Next D&D レビュー依頼 prompt |
| [archive/20260331_completed_active_docs/review_ui_next_drag_and_drop_findings.md](archive/20260331_completed_active_docs/review_ui_next_drag_and_drop_findings.md) | UI Next D&D コードレビュー findings と修正記録 |
| [archive/20260331_completed_active_docs/ui_next_drag_and_drop_review_request.md](archive/20260331_completed_active_docs/ui_next_drag_and_drop_review_request.md) | UI Next D&D 不具合のレビュー依頼メモ |
| [archive/20260331_completed_active_docs/restoration_wbs.md](archive/20260331_completed_active_docs/restoration_wbs.md) | ハイブースト以降の段階的復元WBS（フェーズ0〜4完了）。緊急修復の役割終了 |
| [archive/20260331_completed_active_docs/ui_next_png_capture_review_request.md](archive/20260331_completed_active_docs/ui_next_png_capture_review_request.md) | PNG capture 幅崩れのレビュー依頼。T23 PNG Capture Rework ✅ 完了済み |

---

| ドキュメント | 概要 | 後継 |
|-------------|------|------|
| [archive/rebuild-spec/](archive/rebuild-spec/) | 初期設計レビュー（R1-R10の前段階） | → rebuild-spec-v2/ |
| [archive/rebuild-spec-v2/](archive/rebuild-spec-v2/) | 統合設計v1 | → specs/runs/RUN_20260228_001/ |
| [archive/20260309_completed_active_docs/dp_implementation_plan.md](archive/20260309_completed_active_docs/dp_implementation_plan.md) | DP（回復・ブレイク）実装プランの完了記録 | → active/implementation_priority_tasklist.md |
| [archive/20260309_completed_active_docs/code_review_followup_tasklist.md](archive/20260309_completed_active_docs/code_review_followup_tasklist.md) | コードレビュー follow-up 対応記録の完了版 | → active/implementation_priority_tasklist.md |
| [archive/20260309_completed_active_docs/multi_enemy_implementation_tasklist.md](archive/20260309_completed_active_docs/multi_enemy_implementation_tasklist.md) | 複数敵対応タスクリストの完了記録 | → active/implementation_priority_tasklist.md |
| [archive/spec_review_round_log.md](archive/spec_review_round_log.md) | 3LLM合議仕様レビュー Round 1〜9 ログ（2026-02-26〜27） | → specs/runs/RUN_20260228_001/ |
| [archive/spec_review_state.json](archive/spec_review_state.json) | 仕様レビューチェックポイント（R9完了・agreed_v1確定済み） | → specs/runs/RUN_20260228_001/ |
| [archive/20260328_png_capture_code_review_findings.md](archive/20260328_png_capture_code_review_findings.md) | PNG capture 横幅崩れレビュー結果のアーカイブ（採用点 / 非採用点を追記） | → active/ui_next_design.md, active/ui_next_implementation_tasklist.md |
| [archive/20260308_doc_management_proposal.md](archive/20260308_doc_management_proposal.md) | ドキュメント管理ルール提案書（策定根拠） | → このREADMEに反映済み |
| [archive/DEVELOPMENT_NOTES.md](archive/DEVELOPMENT_NOTES.md) | 旧世代実装メモ（2025-06-14〜2026-03-01）・旧js/構造記述含む | → OD計算仕様は specs/od_gauge_calculation_spec.md に移転 |
| [archive/20260313_priority_history.md](archive/20260313_priority_history.md) | 実装優先順位履歴（PRI-001〜006 完了記録・2026-03-09〜03-13） | → active/implementation_priority_tasklist.md（最新版） |
| [archive/20260313_priority_history_pri007_009.md](archive/20260313_priority_history_pri007_009.md) | 実装優先順位履歴（PRI-007〜009 完了記録・2026-03-13） | → active/implementation_priority_tasklist.md（PRI-010〜） |
| [archive/20260314_priority_history_pri010_012.md](archive/20260314_priority_history_pri010_012.md) | 実装優先順位履歴（PRI-010〜012 完了記録・2026-03-14） | → active/implementation_priority_tasklist.md（PRI-013〜） |

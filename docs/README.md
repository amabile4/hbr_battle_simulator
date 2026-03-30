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
| [active/implementation_priority_tasklist.md](active/implementation_priority_tasklist.md) | 🟢 進行中 | PRI-018（スキル使用回数制約）を次優先とした実装バックログ | 2026-03-29 |
| [active/ui_next_design.md](active/ui_next_design.md) | 🟢 進行中 | UI Next 設計メモ（Party Setup・スキル設定パネル・PT解散導線・toolbar preset strip 20枠・strict preset schema・browser D&D handle 方針・Passive Log 下段 pane と desktop resize handle・toolbar icon/mobile rules・startup defaults・PNG capture contract・SessionSnapshot の人間向け補助フィールド方針・turn row バフアイコンを状態変化定義順で拡張（全体上限10・デバフ除外・Count/Only競合は採用側のみ表示）・Fieldタブの属性/倍率/継続表示とturn rowのactive field chip表示・Talisman表示条件の明確化・Warning/Error の名前併記 helper 方針・ReduceSpは消費SP計算専用でcurrent SP非変更・legacy UI 廃止前提・Enemy先制Turn0フィールド先行適用 等） | 2026-03-30 |
| [active/ui_next_gui_design_spec.md](active/ui_next_gui_design_spec.md) | 🟢 進行中 | UI Next GUI モック参照資料（Initial Setup / Party Setup / Enemy Setup 拡張点） | 2026-03-15 |
| [active/ui_next_implementation_tasklist.md](active/ui_next_implementation_tasklist.md) | 🟢 進行中 | UI Next 実装タスクリスト（既コミットターン再編集・layout rework・toolbar/mobile follow-up・preset toolbar 20枠化・browser D&D hardening・legacy UI hard cutover・Passive Log pane resize・root redirect smoke・Enemy先制フィールドTurn0適用・Enemy Setup の敵スロット選択/実効倍率％耐性/吸収/max_d_rate/od_rate 初期反映まで反映） | 2026-03-30 |
| [active/ui_next_drag_and_drop_review_request.md](active/ui_next_drag_and_drop_review_request.md) | 🟢 進行中 | UI Next D&D 不具合のレビュー依頼メモ（TurnEdit / PartySetup の現象整理・期待挙動・レビュー観点） | 2026-03-28 |
| [active/review_ui_next_drag_and_drop.prompt.md](active/review_ui_next_drag_and_drop.prompt.md) | 🟢 進行中 | Claude Opus 向け UI Next D&D レビュー依頼 prompt | 2026-03-28 |
| [active/review_ui_next_drag_and_drop_findings.md](active/review_ui_next_drag_and_drop_findings.md) | ✅ 完了 | UI Next D&D コードレビュー結果＋修正記録（BUG-1〜3 修正、E2E 11件追加、全テスト通過） | 2026-03-29 |
| [active/ui_next_png_capture_review_request.md](active/ui_next_png_capture_review_request.md) | 🟢 進行中 | UI Next PNG capture 不具合のレビュー依頼メモ（再現条件・期待挙動・実際の失敗・レビュー観点） | 2026-03-28 |
| [active/lightweight_record_replay_design.md](active/lightweight_record_replay_design.md) | 🟢 進行中 | 軽量 replay/edit 設計案（TurnAction 正本化・warning/diagnostics 実装メモ追記） | 2026-03-28 |
| [active/skill_limit_implementation_tasklist.md](active/skill_limit_implementation_tasklist.md) | 🟢 進行中 | PRI-018: スキル使用回数制約と回復機能（HealSkillUsedCount 等）の実装計画 | 2026-03-14 |
| [active/passive_implementation_tasklist.md](active/passive_implementation_tasklist.md) | 🟢 進行中 | パッシブ条件・タイミング実装計画（DoubleActionExtraSkill shared engine 実装、水瀬すもも/朝倉可憐の実データ確認まで反映） | 2026-03-29 |
| [active/stateful_passive_wbs.md](active/stateful_passive_wbs.md) | 🟢 進行中 | 状態付与型パッシブ（AdditionalHit* 38件）の実装ステータス一覧・未実装トリガー／effectType整理（`二股の尻尾` 完全実装反映） | 2026-03-29 |
| [active/passive_test_coverage_audit.md](active/passive_test_coverage_audit.md) | 🟢 進行中 | パッシブ発火トリガー × exitCond テストカバレッジ監査（`DoubleActionExtraSkill` の engine/UI/browser coverage、受け手SP回復の二連EX実データ回帰まで反映） | 2026-03-29 |
| [active/count_only_status_audit.md](active/count_only_status_audit.md) | 🟢 進行中 | `Count` / `Only` 併存 status family 監査（`AttackUp` 系は `elements subgroup`、`Funnel` / `MindEye` は `target_condition` 制約として整理し、runtime/test 経路・実機確認マトリクスを併記。session再計算Warning理由のPassiveLog暫定表示を追記） | 2026-03-29 |
| [active/restoration_wbs.md](active/restoration_wbs.md) | 🟢 進行中 | ハイブースト以降の段階的復元WBS（フェーズ0〜4完了・フェーズ5継続） | 2026-03-23 |
| [active/setup_panel_layout_and_perf_tasklist.md](active/setup_panel_layout_and_perf_tasklist.md) | 🟢 進行中 | Setup パネルのタブレイアウト改善（L01〜L04 ✅）とロード高速化（P01〜P03 ❌）タスクリスト | 2026-03-29 |
| [active/passive_timing_reference.md](active/passive_timing_reference.md) | 📚 参照 | パッシブタイミング11種の評価入口リファレンス | 2026-03-22 |
| [active/ui_parallel_interface_spec.md](active/ui_parallel_interface_spec.md) | 📚 参照 | UI/Adapter層の並列開発インターフェース仕様（legacy DOM controller 廃止後の shared module 境界へ更新） | 2026-03-29 |
| [active/gui_technology_candidates.md](active/gui_technology_candidates.md) | 📚 参照 | GUI実装技術候補の比較調査 | 2026-03-08 |

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
| [specs/od_gauge_calculation_spec.md](specs/od_gauge_calculation_spec.md) | ODゲージ計算仕様（ドライブピアス補正式・実機照合済み） | 2026-03-01 |
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

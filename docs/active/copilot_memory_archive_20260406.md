# Copilot Agent メモリー・作業コンテキストアーカイブ（2026-04-06）

このファイルは、T34敵状態管理タスク（feature/engine-enemy-status ブランチ）におけるCopilotエージェントの作業メモリー・記憶・進捗コンテキストを、他AIエージェントや後続作業者が引き継げるようにまとめたものです。

---

## 1. 直近の進捗・作業履歴
- **P0: 厳密再計算・等価性テスト** 完了（tests/t34-enemy-status-integration.test.js）
- **P1: マージ競合系フィクスチャテスト** 完了（同上、WBS-4b-a1~a4）
- **ドキュメント・WBS** 最新化済み（docs/active/t34_enemy_status_management_plan_wbs.md, docs/README.md）
- **全テストパス**（node --test）
- **Iceラベルバグ修正済み**（ui-next/utils/field-state-display.js, tests/ui-next-field-state-display.test.js）

---

## 2. 保持メモリー（repo memory）

### SP順序・スキルタイプ判定
- action_order_sp_clamp_note.md
- action_order_sp_clamp_note_20260402_correction.md

### 追撃・ヒット数・検証
- followup_fix_verification_complete_20260404.md
- followup_triggered_skill_hitcount_20260404.md

### テストユーティリティ・終了挙動
- getStore_exit_behavior_20260404.md

### OD/敵ターン・境界挙動
- interrupt_od_enemy_turn_start_boundary_20260405.md
- od_rate_per_hit_rounding_20260403.md

### パッシブ・バフ消費・設計
- passive_docs_head_audit_20260404.md
- passive_docs_head_audit_20260404_correction.md
- turn_controller_active_buff_notes.md

### UI Next/敵Setup/吸収・OD
- ui_next_enemy_setup_absorb_notes.md
- ui_next_session_enemy_od_action_order_20260402.md

### 使用スキルオーバーレイ
- ui_next_used_skills_overlay_20260404.md
- ui_next_used_skills_overlay_refine_20260404.md
- ui_next_used_skills_variant_icon_fix_20260404.md

### サーヴァント系パッシブ
- yamawaki_servant_passive_skip_20260404.md

---

## 3. 重要な設計・運用方針
- **属性prefix/アイコン**: docs/active/elements_skill.md で定義、tests/enemy-status-display.test.js で網羅的検証。
- **Funnel/連撃**: ui-next/utils/char-detail-popup.js でラベル修正、プレビュー対応。tests/ui-next-turn-ui.test.js で回帰テスト。
- **敵詳細ポップアップ**: 左クリック対応、ツールチップ・ヘルプ文言も更新。
- **T34敵状態管理**: docs/active/t34_enemy_status_management_plan_wbs.md でWBS・テスト進捗管理。P0:厳密再計算、P1:マージ競合、P2:リプレイ往復/旧記録フォールバック、P3:診断強化。
- **定数集約**: 既存定数に統合、マジックナンバー禁止。
- **json/配下**: minified JSONのみ。grep不可、jq/nodeで調査。
- **E2E/Playwright**: UI Next起点、必要に応じて自ら修正・カバレッジ追加。

---

## 4. 直近の作業計画・残タスク
- **P2**: replayScriptロード/リプレイ往復厳密検証、旧記録フォールバック系フィクスチャ追加
- **P3**: 診断強化、古いテストのstrict化
- **T34-FU2**: レビュー指摘対応（定数重複/プレビュー経路整理など）

---

## 5. 参考: Copilot repo memory（抜粋）

### action_order_sp_clamp_note.md
- #4 SP mismatch root cause: `validateActionDict` sorted by `skill.type` phase (`non_damage` first) before position.
- ...（詳細は /memories/repo/action_order_sp_clamp_note.md 参照）

### followup_fix_verification_complete_20260404.md
- 追撃fix検証完了レポート（2026-04-04）
- ...（詳細は /memories/repo/followup_fix_verification_complete_20260404.md 参照）

### turn_controller_active_buff_notes.md
- Up系Count/Only判定で preview 側だけに情報を持っても commit 側で消費できない。`specialPassiveModifiers` に `consumedCountEffectIds` を明示的に載せて `applyCommittedActionSideEffects()` へ渡す必要がある。
- ...（詳細は /memories/repo/turn_controller_active_buff_notes.md 参照）

---

## 6. 引き継ぎ時の注意
- 本ファイルは2026-04-06時点のCopilotエージェント作業メモリー・進捗を反映。
- 詳細な技術メモ・バグ調査・設計方針は /memories/repo/ 配下の各mdファイルを参照。
- 継続作業時は docs/active/t34_enemy_status_management_plan_wbs.md のWBS・進捗表を必ず最新化すること。

---

（自動生成: Copilot Agent, 2026-04-06）

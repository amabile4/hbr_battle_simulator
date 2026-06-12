# 次セッション開始プロンプト: ハイブリッドブレイク残タスク実装

- ステータス: ✅ 完了（2026-06-12 消化。タスクA〜E実装済み、コミット ab2816b〜cf29c51 + docs）
- 作成日: 2026-06-12
- 正本計画: [hybrid_auto_manual_break_implementation_plan.md](hybrid_auto_manual_break_implementation_plan.md)

## 消化結果（2026-06-12）

- タスクA（HP累積・討伐予測）✅ ab2816b / タスクB（事前予測バッジ）✅ b3b1cf7 / タスクC（比較ビュー）✅ 9193f45 / タスクD（一時プレビュー入力）✅ cf29c51 / タスクE（docs収束）✅
- 体制差異: サブエージェントが環境の権限制約（Edit拒否）で実装不能だったため、Fable 5 が全タスクをインライン実装（調査委任のみ活用）
- 残: T8（差分警告）と最終GOAL受け入れE2E（代表シナリオの明示テスト）→ 正本計画の「残タスク」参照

---

## 使い方

新しいセッションで以下を指示する:

> docs/active/hybrid_break_next_session_prompt.md を読み、記載のオーケストレーション体制で残タスクを実装してください。

---

## 体制（必須）

- **Fable 5（メインセッション）**: オーケストレーター。受入レビュー（diff精読・テスト自実行）と、下記タスクAの設計判断のみ自分で実装する。
- **サブエージェント（Agentツールで起動）**: それ以外はすべて委任する。
  - `model: "sonnet"` — UI実装・テスト作成・E2E・中規模の接続作業
  - `model: "haiku"` — docs整備・機械的リファクタ・表更新（安全ゲート付き指示にする）
  - `model: "opus"` — sonnetで品質不安が残る中〜高難度のみ（乱用しない）
- 各エージェントには「git commitしない / `npm test`・`npm run lint` を実行して結果報告」を義務付け、コミットはレビュー後にメインが行う。
- 区切りごとに確認不要で commit & push（既存の作業習慣）。docs/README.md と正本計画の進捗記録更新を実装とセットで行う。

## 前提知識（読み込み必須）

1. CLAUDE.md / docs/specs/dev_principles.md（json/ はminified、grep禁止。エンジン/UI責務分離）
2. 正本計画の「進捗記録」セクション（T1〜T4(DP)・T5前半・T9完了済み、コミット 3d7f3bb〜2110064）
3. 実装済みの核心構造:
   - エンジン: `applyDestructionRateFromActions`（src/turn/turn-controller.js:4664付近）がDP累積消費・DP0自動ブレイク（手動優先）。**変更禁止が原則**
   - 供給: `TurnEngineManager.#enrichPreviewRecordWithDpDamage`（probe commitでdamageContext取得→`resolvePerHitDpDamageByEnemy`(src/domain/action-dp-damage.js)→actions enrich）
   - 注入: ui-next/app.js 起動時に `setDamageCalculationData` + `recalculateFrom(0)` + `turnArea.refreshRows()`
   - UI: turn row の `dp-auto-break-chip`（ui-next/utils/manual-break-presentation.js `buildDpAutoBreakChipModels`）
   - ガード: tests/replay-json-purity.test.js（禁止キー /suppress|guide|preview|cumulative/i）、tests/ui-next-dp-damage-guide.test.js、tests/e2e/dp-damage-guide.spec.js（fixture: tests/e2e/fixtures/ui_next_session_dp_damage_fixture.json, dp:1敵）

## 制約（全タスク共通・違反したら差し戻し）

1. リプレイJSON/sessionスナップショットには操作イベントと初期セットアップ値のみ保存。計算結果・派生値・ビュー状態は非保存（純度テストが落ちたら設計が間違い）
2. 再計算で操作意図（召喚タイミング・手動オーバーライド）を崩さない
3. データ未注入時は従来挙動を完全維持
4. browser実挙動が論点の変更はPlaywright coverageを追加（起点: http://localhost:4173/ui-next/index.html、dev server: `npm run dev`）
5. 既知: tests/e2e/damage-breakdown-popup.spec.js に既存失敗1件（無関係・触らない）

---

## タスク（優先順）

### タスクA: 討伐予測 — HP累積トラッキング【Fable 5自身が設計・実装。最難度】

目的: DPと同様に敵HPダメージを累積し、HP0到達ターンを「討伐予測」として導出する。

- 現状: extra HP gauge（多段ゲージ）敵のみHP管理あり。**通常敵の maxHP/currentHP 追跡が存在しない**（第1稿 §2.2-6 の指摘）。enemyのmaxHPは json/enemies.json から再導出する方針（保存しない）
- 進め方の指針:
  1. まず調査: enemies.json の HP フィールド、`extraHpGaugeStateByEnemy` の構造、`applyManualKillEffectsFromActions`、popup の hpResult（char-detail-popup.js の `calculateDamage(hpInput, data)`）
  2. DP実装と同型のアーキテクチャを踏襲: per-hit HPダメージを enrichment で actions に付与（`perHitHpDamageByEnemy` 相当の新規経路。エンジン側に消費ロジックがないため**ここはエンジン追加が必要** — applyDestructionRateFromActions のDPパターンを参考に新関数を追加し、commitパイプラインの同位置に挿入）
  3. HP0到達 = 自動討伐（`source:'auto'` の Dead イベント）。手動kill優先は既存どおり
  4. 破壊率がHPダメージに乗る点に注意（destructionRate倍率。DPは破壊率乗算除外済みという既存の確定仕様がある）
  5. 赤テスト先行: DP版テスト（tests/ui-next-dp-damage-guide.test.js）を雛形に
- 受け入れ: HP累積・自動討伐・recalculate決定性・JSON純度・データ未注入時の従来挙動、の5点がテストで固定される

### タスクB: ブレイク/討伐の事前予測バッジ（T5残り）【sonnet】

- 未コミット行（preview）の時点で「この行動でDP0/HP0に到達する見込み」を示すバッジを表示
- preview経路は enrichment 済みなので、preview の record イベント（source:'auto' の DownTurn/Dead）から導出可能のはず。調査から開始
- 表示は `dp-auto-break-chip` の意匠に合わせ「予測」であることを区別（例: 破線ボーダー）
- unit + 既存E2E fixture流用のPlaywright 1ケース

### タスクC: 一時比較ビュー（T7）【sonnet、Bと並行可】

- 手動ブレイク/討伐指定を一括で「一時的に無効化」し、自動計算のみの推移を確認できるビュートグル
- 実装方針: ビュー状態（非保存）として manager に「比較モード」recalculate を**別バッファで**実行（`#computedStates` を汚さない設計を検討させる。例: actionOutcomeOverrides を除外した一時的な再計算結果を保持する read-only API）
- トグルOFFで即復帰、保存JSON不変（純度テストで検証）
- 設計案を先に報告させ、Fable 5が承認してから実装着手（ここだけ二段階）

### タスクD: 一時プレビュー入力（T6）【sonnet、C完了後】

- 現DP/現HP/現破壊率のターン内一時入力（ビュー専用・commit/JSON非対象）
- 既存の popup destruction-rate-input（char-detail-popup.js）が部分実装。寿命管理（ターン移動/再計算/リロードで消える）を明確化し unit で固定

### タスクE: docs収束（T10）【haiku、最後】

- 正本計画の進捗記録更新、README索引更新、チェック表の接続状態列を最新化
- 第1稿/第2稿の suppression 不採用判断が正本計画に記録済みであることを確認

---

## 直近の着手順

1. タスクA調査（Fable 5）と並行して タスクB（sonnet）を起動
2. A実装 → 受入 → commit
3. C（設計承認制）→ D → E

## 完了条件（このセッション群のゴール）

正本計画の最終GOAL受け入れ条件:
- 代表シナリオ（ガイドが#3提案 → #4手動指定）でJSON往復後も#4のみ確定
- replay JSONに派生値ゼロ
- 連戦召喚の再計算で召喚ターン不変

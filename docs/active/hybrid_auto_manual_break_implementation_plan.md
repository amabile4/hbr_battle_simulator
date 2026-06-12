# hybrid_auto_manual_break 実装計画（採用版）

- ステータス: ✅ 完了
- 作成日: 2026-06-11
- 最終更新: 2026-06-12
- 入力: [第1稿](hybrid_auto_manual_break_wbs.md) / [第2稿](hybrid_auto_manual_break_wbs_v2.md)
- 判定: **第2稿ベース（理念整合優先）**。第1稿は補助観点（後方互換・正規化・赤テスト先行）のみ採用。

---

## 1. 採用方針サマリー

1. **操作イベント正本**: リプレイJSONには「操作したこと」のみ保存する。計算結果（累積DP/HP/破壊率、自動ブレイク/討伐確定）・suppression・プレビュー入力は保存しない。
2. **自動計算はガイド**: 累積計算（DP/HP/破壊率）はエンジンが再計算のたびに導出する「派生値」とし、UI には提案（ガイド）として表示する。確定は手動操作（`actionOutcomeOverrides`）のみ。
3. **手動最優先**: 手動ブレイク/討伐指定があればそれが確定。自動ガイドと矛盾する場合は手動を優先表示し、差分はバッジ/警告で可視化する。
4. **一時状態は非永続**: 手動計算プレビュー入力と「手動指定の一括一時無効化（比較ビュー）」はビュー状態であり、commit にも JSON にも含めない。
5. **連戦召喚は操作起点**: 召喚・戦況遷移は操作イベントどおりに再生し、ガイドが「もっと早く撃破できる」と示しても遷移を前倒ししない。
6. **第1稿から引き継ぐ補助観点**: (a) 旧データ読込の normalize 互換、(b) 赤テスト先行（代表シナリオ）、(c) save/load 往復テストを必須ゲート化。suppression 永続化は**不採用**（判断記録は WBS-F）。

### モデル/コスト運用方針

| 複雑度 | 対象タスク | モデル目安 |
|---|---|---|
| 低 | docs 整備・比較表・回帰テスト追加・表形式整理 | 最安価モデル |
| 中 | UI 表示（ガイドバッジ・トグル）・非永続プレビュー実装・E2E | 中位モデル |
| 高 | 累積ガイド導出のエンジン設計・手動/自動マージ規則・連戦召喚整合 | 高価モデルを該当論点のみ |

分解手順・モデル選択の詳細は実行側に一任。原則「先に安価モデルでテスト雛形と仕様文書を固め、エンジン設計判断だけ高価モデルに渡す」。

---

## 2. 優先順位付きTODO（完了条件つき）

| # | 優先 | タスク | 完了条件 |
|---|---|---|---|
| T1 | P0 | 仕様明文化: 操作正本原則・ガイド非確定・プレビュー非永続を本書＋第1稿比較表として確定（WBS-A/F-1） | 第1稿との差分表を含む仕様が docs に収束し、第1稿のステータスを整理 |
| T2 | P0 | 赤テスト作成: ①連戦召喚シナリオ（再計算で召喚前倒しが起きない）②save→load→recalculate で操作履歴のみ維持 | 期待仕様を表現する failing/passing テストが main 系で安定実行できる |
| T3 | P0 | 保存純度の回帰固定: serialize 結果に累積計算結果・suppression・プレビュー値が含まれないことをテストで固定（WBS-B-3） | replay JSON snapshot テストが PASS し、混入時に fail する |
| T4 | P1 | 累積ガイド導出レイヤ: 再計算パス内で per-turn の累積DP/HP/破壊率と「DP0到達/討伐予測」を派生値として導出（非保存）。破壊率 D-3/D-4（turnState⇔damageContext 接合）をここに統合 | recalculateAll/From 後に各ターンの guide 値が取得でき、JSON に混入しない |
| T5 | P1 | ガイド表示 UI: turn row / enemy detail popup に「ブレイク予測/討伐予測」バッジと現DP/HP/破壊率の累積表示。手動確定と並置し手動を優先表示 | 手動指定なし時はガイドのみ、手動指定あり時は手動が確定表示・ガイドは参考表示 |
| T6 | P2 | 一時プレビュー入力（手動計算モード）: 現DP/HP/破壊率/パラメータのターン内一時入力。寿命＝ビュー内のみ、commit/JSON 非対象（WBS-C-3） | 入力で表示が変わり、reload/再計算/保存で消える（unitで寿命固定） |
| T7 | P2 | 一時比較ビュー: 手動ブレイク/討伐指定を一括「一時無効化」して自動ガイドのみの推移を確認できるトグル（非保存） | トグルON で自動推移表示、OFF で復帰、JSON 不変 |
| T8 | P2 | 連戦召喚整合の差分警告: ガイドと操作履歴の乖離（例: ガイドは3T撃破、操作は5T撃破）を警告表示（WBS-D-3） | ✅ 完了。乖離シナリオで警告が表示され、操作履歴は不変 |
| T9 | P3 | E2E 整備: 代表シナリオ（#3手動取消→#4手動指定→再計算→JSON往復）、比較ビュー切替、ガイド表示 | Playwright が ui-next 起点で安定 PASS |
| T10 | P3 | docs 収束: 第1稿/第2稿/本書のステータス整理、suppression 不採用の意思決定記録（WBS-F） | active 文書が本書1本に収束し README 更新済み |

---

## 3. 機能有無と接続状態チェック表

| 機能名 | 実装有無 | 実装場所 | 呼び出し元 | トリガー | 接続状態 | 欠落点 | 接続TODO | 回帰テスト |
|---|---|---|---|---|---|---|---|---|
| ダメージ計算機 | ✅実装済み | `src/domain/damage-calculator.js` / `damage-breakdown.js` / `damage-calculator-input-builder.js` | `ui-next/utils/char-detail-popup.js`（威力詳細タブ） | ポップアップ表示・入力変更 | UI接続済み（表示専用） | 結果が累積計算・敵状態ガイドに未供給 | T4 でガイド導出の入力に接続 | `tests/damage-breakdown.test.js` ほか |
| 破壊率計算機 | ✅エンジン実装済み | `src/domain/destruction-calculator.js`（`calculateDestruction`） | `char-detail-popup.js` `updateDestructionRateDisplay` / `src/turn/turn-controller.js` `applyDestructionRateFromActions` | popup 手動入力時 / commit 時（部分） | △部分接続 | D-3/D-4 残（turnState⇔damageContext 接合）。popup 入力は一時値で他表示と非連動。`damage-calculator.js:430` に同名関数の重複あり | T4 で累積破壊率をガイドレイヤへ統合、重複定義を解消 | `tests/destruction-calculator.test.js` |
| シミュレーター再計算 | ✅実装済み | `ui-next/engine/turn-engine-manager.js` `recalculateAll` / `recalculateFrom` | session load・setup 変更・turn 編集 | 設定変更・読込 | ✅接続済み | ガイド導出が再計算パスに存在しない | T4 で再計算内に guide 導出を統合 | `tests/ui-next-turn-engine-manager.test.js`・session replay E2E |
| 自動ブレイク・討伐 | ✅実装済み | `turn-controller.js` `applyDestructionRateFromActions`（DP累積・DP0自動ブレイク）+ `applyEnemyHpFromActions`（HP累積・HP0自動討伐） | commitTurnRecord 経由（manager enrichment が perHit{Dp,Hp}DamageByEnemy を供給） | commit/recalculate | ✅接続済み（データ注入時のみ有効・派生値非保存） | 多段HPゲージ敵のHP追跡は対象外（既存HpBreak管理に委譲）。T8差分警告が未実装 | T8 | `tests/ui-next-dp-damage-guide.test.js`・`tests/ui-next-hp-damage-guide.test.js`・`tests/e2e/dp-damage-guide.spec.js` |
| 手動ブレイク・討伐 | ✅実装済み | `turn-controller.js` `applyManual{Break,HpBreak,Kill}EffectsFromActions` + `actionOutcomeOverrides` 正本 | enemy-detail-popup の break/kill sub-editor → `updateActionOutcomeOverrides` | popup 操作 → commit/recalc | ✅接続・JSON永続化済み | （解消済み）一括一時無効化は比較ビューで対応 | - | manual break session 回帰・superbreak E2E・`tests/ui-next-comparison-view.test.js` |
| 一時比較ビュー | ✅実装済み | `turn-engine-manager.js` `buildComparisonComputedStates` + `turn-area.js` `setComparisonMode` | toolbar `#toggle-comparison-view` | トグル操作 | ✅接続済み（ビュー状態のみ・JSON不変） | - | - | `tests/ui-next-comparison-view.test.js`・`tests/e2e/comparison-view.spec.js` |
| 一時プレビュー | ✅実装済み | `ui-next/utils/preview-input-store.js` + `char-detail-popup.js`（現DP/現HP/破壊率入力 + スキル後残量表示） | popup 操作 | 入力変更 | ✅接続済み（ターン内寿命・非保存） | 寿命 = 行再描画で消去（turn-area `#renderRows` が単一管理点） | - | `tests/ui-next-preview-input-store.test.js`・`tests/e2e/preview-input.spec.js` |

---

## 4. 非接続ポイント一覧

### 4.1 実装済みだが未呼び出し
- `calculateDestruction` が `src/domain/destruction-calculator.js:14` と `src/domain/damage-calculator.js:430` に重複定義。正本を片方に統一する。
- `applyDestructionRateFromActions`（turn-controller）は存在するが、破壊率累積の turnState 接続（D-3/D-4）が未完で end-to-end に効いていない。

### 4.2 計算結果がUI未反映
- DP/HP ダメージの累積値・「このターンでDP0/討伐」予測が turn row / enemy popup に表示されない（ガイドレイヤ自体が未実装）。
- `calculateDestruction` の after 値は popup 内のみで、ターン行・敵詳細の累積表示と突合できない。

### 4.3 UI入力が計算未接続
- popup の destruction-rate-input はその場の表示計算のみで、ガイド累積値との比較・初期値供給がない（※永続化しないのは理念どおりで正しい。突合表示のみ必要）。
- enemy-setup の `manual.destructionRate` は初期値供給のみで、ターン経過後の累積に反映されない。

### 4.4 save/load で消失
- 一時プレビュー入力・比較ビュー状態: **消失が正** — ただし「誤って永続化していない」ことを回帰テストで固定する（T3）。
- 敵 current DP/HP: 保存対象外（第2稿方針）。再計算時の再導出経路（T4）が確立されるまでは、load 後にガイド値が欠落する状態が続く。第1稿が指摘した maxHP（HPゲージ非搭載敵）の canonical 供給は、保存ではなく初期 enemy snapshot からの再導出で吸収する。

---

## 5. GOAL定義

### 最終GOAL
**操作イベント正本を維持したまま、自動累積計算（DP/HP/破壊率）をガイドとして提供し、手動ブレイク/討伐確定・一時プレビュー・比較ビューが save/load/recalculate 後も一貫して再現される。**

受け入れ条件:
- 代表シナリオ（自動ガイドが #3 ブレイクを提案 → ユーザーが #4 に手動指定）で、再計算・JSON 往復後も #4 のみ確定、#3 はガイド表示のまま。
- replay JSON に計算結果・suppression・プレビュー値が一切含まれない。
- 連戦召喚で再計算により撃破ガイドが前倒しされても、召喚イベントのターンは不変。

### 中間GOAL

| GOAL | 内容 | 受け入れ条件 |
|---|---|---|
| G1: 保存純度と赤テスト基盤 | T2+T3 完了。期待仕様がテストで表現され、JSON 純度が固定される | 連戦召喚・save/load 純度テストが安定実行（実装前は red 許容）、serialize snapshot に派生値ゼロ |
| G2: 累積ガイド導出（エンジン） | T4 完了。再計算パスで per-turn 累積DP/HP/破壊率＋ブレイク/討伐予測が派生値として得られる | recalculateAll/From 後に全ターンの guide 値が API で取得可、JSON 不変、unit/integration PASS |
| G3: ガイド表示と手動優先（UI） | T5 完了。turn row / popup でガイドと手動確定が並置され手動優先 | 手動指定あり時に手動が確定表示・自動は参考、競合バッジ表示、E2E PASS |
| G4: 一時状態（プレビュー＋比較ビュー） | T6+T7 完了。非永続の手動計算プレビューと手動指定一括無効化 | 切替で表示が変わり、commit/保存/再計算で消える。JSON 差分ゼロを自動検証 |

---

## 6. テスト計画

### unit
- 累積ガイド導出関数: DP/HP/破壊率の per-turn 導出、DP0/討伐予測判定（境界: 多段ヒット・Eシールド・破壊率cap）。
- 一時プレビュー状態の寿命管理: 設定→取得→ターン移動/再計算/破棄で消えること。
- serialize 純度: replay JSON に guide/preview/suppression キーが存在しないこと。

### integration
- commit→recalculate 一貫性: 手動 break/hpBreak/kill が再計算後も同一結果。
- **save→load→recalculate 一貫性（必須）**: 操作履歴のみ維持され、ガイドは load 後の再計算で同値に再導出される。
- **連戦召喚シナリオ（必須）**: 1体目撃破→2体目召喚の操作列に対し、パラメータ変更で撃破ガイドが前倒しになっても召喚ターン・行動入力との整合が崩れない。

### e2e（Playwright, `http://localhost:4173/ui-next/index.html` 起点）
- 代表シナリオ: 自動ガイド表示 → #3 を確定せず #4 に手動指定 → 再計算 → JSON 保存/読込 → #4 のみ確定維持。
- 比較ビュー: 手動指定一括無効化トグルで自動推移表示、OFF 復帰、保存 JSON 不変。
- ガイド表示: DP0 予測バッジ・討伐予測バッジの表示と手動優先表示。

---

## 7. 直近着手3タスク

1. **T1: 仕様明文化と第1稿比較表の確定**（本書で着手済み → 第1稿/第2稿のステータス整理まで）
2. **T2: 赤テスト作成** — 連戦召喚シナリオ integration test と save/load/recalculate 純度テスト
3. **T4 スパイク: 累積ガイド導出レイヤの最小実装** — recalculate パス内で per-turn DP 累積のみ先行導出し、JSON 非混入を T3 のテストで検証

---

## 次の一手

1. 第1稿・第2稿のステータスを本書へ収束させる README/ステータス更新（T1 完了化）
2. 連戦召喚＋保存純度の赤テストを `tests/` に追加（T2/T3）
3. 累積DPガイド導出の最小スパイクを `turn-engine-manager` 再計算パスに実装（T4 先行部分）

---

## 進捗記録（2026-06-11）

| タスク | 状態 | コミット | 備考 |
|---|---|---|---|
| T1 仕様明文化 | ✅ 完了 | 3d7f3bb | 第1稿/第2稿を参照ステータスへ収束 |
| T2 連戦召喚整合テスト | ✅ 完了 | a74df46 | `tests/ui-next-summon-recalculate-consistency.test.js`（4件）。現状実装で全PASS（構造ガード）。パラメータ変更バリアントはT5以降で拡張 |
| T3 保存純度回帰 | ✅ 完了 | a74df46 | `tests/replay-json-purity.test.js`（6件）。canonicalキー集合＋禁止キーガード。`calculateDestruction` 重複定義も解消 |
| T4 累積ガイド導出（DP） | ✅ 完了（DP分） | d6db838, ae97cb5 | `resolvePerHitDpDamageByEnemy` + manager enrichment + app起動時データ注入。エンジン既存の `applyDestructionRateFromActions` がDP累積消費・DP0自動ブレイク（手動優先は既存実装どおり）。`tests/ui-next-dp-damage-guide.test.js`（6件） |

### T4 の主要設計判断
- エンジン（turn-controller）は無変更。`perHitDpDamageByEnemy` の休眠経路（実装済みだが未供給）に manager 層から供給する方式を採用。
- damageContext は commit 計算内でのみ構築されるため、クローン状態への probe commit で取得（`#enrichPreviewRecordWithDpDamage`）。
- データ未注入時は完全に従来挙動。派生値は replay JSON 非混入（T3テストで恒久ガード）。

### 既知のフォローアップ（未完了）
1. 討伐予測（HP累積）: extra HP gauge 非搭載敵の maxHP/currentHP 追跡が未実装のため未着手（T4残・最難度）
2. T5 残り: 「ブレイク予測（次ターンでDP0見込み）」の事前予測バッジ（現状は確定時の出所表示まで）
3. T6 一時プレビュー / T7 比較ビュー / T8 差分警告: 未着手
4. probe commit により commit/preview の計算コストが約2倍（DPゲージ敵存在時のみ）。体感劣化があれば最適化検討

### 進捗追記（2026-06-12, 810f54d）
- T5前半 ✅: DP自動ブレイクの出所可視化（turn row に `dp-auto-break-chip`、source:'auto' を manual と区別。record イベント由来で保存JSONには非追加）
- FU#4 ✅: データ注入後の `recalculateFrom(0)` 直後に `turnArea.refreshRows()` で再描画
- T9 ✅: `dp:1` 敵の E2E fixture + `tests/e2e/dp-damage-guide.spec.js`（DP表示・減少・自動ブレイクチップ・保存JSON純度の4件）
- 副修正: enemy-setup-snapshot の normalize で `dp` フィールドが落ちていた既存欠落を修正
- unit 1340 PASS / lint クリーン / 対象E2E PASS

### 進捗追記（2026-06-12 後半, ab2816b〜cf29c51 + docs）

| タスク | 状態 | コミット | 備考 |
|---|---|---|---|
| T4残: 討伐予測（HP累積） | ✅ 完了 | ab2816b | `resolvePerHitHpDamageByEnemy`（src/domain/action-hp-damage.js, isHpTarget:true=破壊率乗算込み）+ エンジン新関数 `applyEnemyHpFromActions`（remainingHpByEnemy 引き継ぎ・HP0で source:'auto' の Dead・手動kill最優先・多段HPゲージ敵は対象外）。enemyHpByEnemy は enemies.json (base_param.hp) / slot.hp から再導出（非保存）。probe commit 1回で DP/HP 両 enrich。`tests/ui-next-hp-damage-guide.test.js` 9件 |
| T5残: 事前予測バッジ | ✅ 完了 | b3b1cf7 | 未コミット行の dp-auto-break-chip に `data-preview` + 破線 + 「予測:」プレフィックス。確定行は従来の実線。unit 2件 + E2E(3d) strict 検証 |
| T7: 一時比較ビュー | ✅ 完了 | 9193f45 | `buildComparisonComputedStates()` read-only API（replayScript クローンから actionOutcomeOverrides を空に → recalculateFrom(0) 流用 → instance 配列/pending を finally 復元）。toolbar `#toggle-comparison-view`、比較中は閲覧専用（input行・編集抑止）。unit 5件 + E2E 1件（保存JSON不変） |
| T6: 一時プレビュー入力 | ✅ 完了 | cf29c51 | `ui-next/utils/preview-input-store.js`（寿命: popup内再描画は維持 / 行再描画・リロードで消去）。威力詳細タブに現DP/現HP入力 + 「このスキル後」残量表示（ブレイク!/討伐!）。破壊率入力も store 接続。unit 4件 + E2E 1件 |
| T10: docs収束 | ✅ 完了 | （本コミット） | 本進捗記録・チェック表・README・next_session_prompt を更新。suppression 不採用判断は §1-6 に記録済みを確認 |

#### 主要設計判断（今回分）
- HP累積はDP実装と完全同型（enrichment供給 + エンジン消費）。`getEnemyState` / `cloneTurnState` / `tickEnemyStatusDurations` のホワイトリストに `enemyHpByEnemy` / `remainingHpByEnemy` を追加（明示列挙3箇所がフィールド落ちの原因だった）
- maxHP は方針どおり非保存。enemy-setup snapshot には fixture/手動用の `hp` passthrough のみ追加（UI選択時の自動書き込みはしない）
- 比較ビューは「クローン差し替え+復元」方式で #computedStates 非汚染を構造的に保証（別ループ実装の重複を回避）
- サブエージェント委任は環境の権限制約（Edit拒否）により断念し、Fable 5 が全タスクをインライン実装（体制差異の記録）

### 完了追記（2026-06-12, T8 + 最終GOAL）

| タスク | 状態 | コミット | 備考 |
|---|---|---|---|
| T8: 連戦召喚整合の差分警告 | ✅ 完了 | （本コミット） | `replayDiagnostics` で自動 `DownTurn/Dead source:auto` と後続の手動 `Break/Kill`・召喚操作を突合し、turn row に警告メッセージを表示。派生警告は JSON 非保存。unit 4件 + 既存 JSON 純度で固定 |
| 最終GOAL受け入れE2E | ✅ 完了 | （本コミット） | `tests/e2e/hybrid-auto-manual-acceptance.spec.js` を追加。#3 自動ガイド観測 → #4 手動 Break 指定 → JSON 往復で #4 の手動指定のみ維持、派生値ゼロを確認 |
| `buildEnemyStateOverrides` 添字ずれ調査 | ✅ 修正完了 | （本コミット） | eShield / extraHpGauge の map が `.filter()` 後 index を key にしていたため、slot1 のみ gauge を持つケースで key `0` へずれることを unit で再現。元 slot index を保持する実装へ修正 |
| session load 後のガイド再導出 | ✅ 完了 | （本コミット） | app の JSON 読込後にも `loadDamageCalculationData()` → `setDamageCalculationData()` → `recalculateFrom(0)` → `refreshRows()` を実行し、読み込み済みセッションの DP/HP ガイドを再導出 |
| DP/HP往復修正 | ✅ 完了 | 597f9d6 | session save/load で敵 DP/HP の直接値を落とさず、手動・fixture 由来の max DP/HP を再導出できるよう修正 |

### 回帰修正追記（2026-06-12, スカルフェザー実セッション）

| 対象 | 状態 | コミット | 備考 |
|---|---|---|---|
| DB敵 DP/HP 解決 | ✅ 修正完了 | （本コミット） | `HbrDataStore` に `enemies/enemiesById` を保持し、`BattleStateManager` が遅延ロード済み `enemies.json` raw catalog を参照できるようにした。slot に `dp/hp` 直書きがない DB敵でも `base_param.dp/hp` から `enemyDpByEnemy/enemyHpByEnemy` を再導出する |
| 比較ビュー stateBefore | ✅ 修正完了 | （本コミット） | `buildComparisonComputedStates()` が比較用 `stateBefores` を返し、各ターンの `replayTurn.slots` による position 復元を通常表示と同じ経路で適用する。#3 の二階堂ソフニングが比較ビューでユキ行動に見える表示ズレを回帰固定 |
| 比較計算失敗時の表示 | ✅ 修正完了 | （本コミット） | 比較バッファの record が欠落した行は、保存済み操作履歴へフォールバックしつつ turn row に警告を出す。スキル消失・別人化を黙って表示しない方針を明示 |
| 回帰テスト | ✅ 追加完了 | （本コミット） | unit: DB敵 `enemiesById` DP/HP 解決、スカルフェザー fixture の比較ビュー `stateBefores`/割込ODスキル/二階堂ソフニング。E2E: `comparison-view.spec.js` に DP max `4550000` と比較ビュー #2/#3 表示検証を追加 |

#### 残タスク
1. 既知: probe commit のコスト（DP/HPゲージ敵存在時に commit/preview 約2倍）。体感劣化があれば最適化

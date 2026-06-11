# hybrid_auto_manual_break 実装計画（採用版）

- ステータス: 🟢 進行中
- 作成日: 2026-06-11
- 最終更新: 2026-06-11
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
| T8 | P2 | 連戦召喚整合の差分警告: ガイドと操作履歴の乖離（例: ガイドは3T撃破、操作は5T撃破）を警告表示（WBS-D-3） | 乖離シナリオで警告が表示され、操作履歴は不変 |
| T9 | P3 | E2E 整備: 代表シナリオ（#3手動取消→#4手動指定→再計算→JSON往復）、比較ビュー切替、ガイド表示 | Playwright が ui-next 起点で安定 PASS |
| T10 | P3 | docs 収束: 第1稿/第2稿/本書のステータス整理、suppression 不採用の意思決定記録（WBS-F） | active 文書が本書1本に収束し README 更新済み |

---

## 3. 機能有無と接続状態チェック表

| 機能名 | 実装有無 | 実装場所 | 呼び出し元 | トリガー | 接続状態 | 欠落点 | 接続TODO | 回帰テスト |
|---|---|---|---|---|---|---|---|---|
| ダメージ計算機 | ✅実装済み | `src/domain/damage-calculator.js` / `damage-breakdown.js` / `damage-calculator-input-builder.js` | `ui-next/utils/char-detail-popup.js`（威力詳細タブ） | ポップアップ表示・入力変更 | UI接続済み（表示専用） | 結果が累積計算・敵状態ガイドに未供給 | T4 でガイド導出の入力に接続 | `tests/damage-breakdown.test.js` ほか |
| 破壊率計算機 | ✅エンジン実装済み | `src/domain/destruction-calculator.js`（`calculateDestruction`） | `char-detail-popup.js` `updateDestructionRateDisplay` / `src/turn/turn-controller.js` `applyDestructionRateFromActions` | popup 手動入力時 / commit 時（部分） | △部分接続 | D-3/D-4 残（turnState⇔damageContext 接合）。popup 入力は一時値で他表示と非連動。`damage-calculator.js:430` に同名関数の重複あり | T4 で累積破壊率をガイドレイヤへ統合、重複定義を解消 | `tests/destruction-calculator.test.js` |
| シミュレーター再計算 | ✅実装済み | `ui-next/engine/turn-engine-manager.js` `recalculateAll` / `recalculateFrom` | session load・setup 変更・turn 編集 | 設定変更・読込 | ✅接続済み | ガイド導出が再計算パスに存在しない | T4 で再計算内に guide 導出を統合 | `tests/ui-next-turn-engine-manager.test.js`・session replay E2E |
| 自動ブレイク・討伐 | △部分 | `turn-controller.js`（Eシールド same-action auto BREAK・スキル効果由来 `applyEnemyBreakEffectsFromActions`） | commitTurnRecord 経由 | commit/recalculate | △既存分のみ接続 | DP累積→ブレイク予測 / HP0→討伐予測の**ガイド**が未実装（v2方針: 自動確定はしない） | T4（導出）+ T5（表示） | `tests/e2e/superbreak-hefty-guardian.spec.js` ほか |
| 手動ブレイク・討伐 | ✅実装済み | `turn-controller.js` `applyManual{Break,HpBreak,Kill}EffectsFromActions` + `actionOutcomeOverrides` 正本 | enemy-detail-popup の break/kill sub-editor → `updateActionOutcomeOverrides` | popup 操作 → commit/recalc | ✅接続・JSON永続化済み | 一括一時無効化（比較ビュー）がない | T7 で比較ビュートグル追加 | manual break session 回帰・superbreak E2E |
| 一時プレビュー | △部分 | `char-detail-popup.js` destruction-rate-input（popup 内一時入力） | popup 操作 | 入力変更 | △popup 内のみ | ターンスコープの現DP/HP/破壊率一時入力なし。寿命管理の明示なし | T6 で turn 内一時状態として実装（非保存） | `tests/ui-next-char-detail-popup-order.test.js`（限定的） |

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
1. 討伐予測（HP累積）: extra HP gauge 非搭載敵の maxHP/currentHP 追跡が未実装のため未着手（T4残）
2. T5 ガイドバッジUI: turn row / popup の「ブレイク予測/討伐予測」バッジ表示
3. T6 一時プレビュー / T7 比較ビュー / T8 差分警告: 未着手
4. app.js のデータ注入後 `recalculateFrom(0)` 実行時にUI再描画を明示的に促していない（セッションロード直後のDP表示が次の操作まで古い可能性）
5. E2E: 既存 fixture に `enemyDpByEnemy` 設定がなく、DPガイドのブラウザE2Eは fixture 整備とセットで追加する（T9）
6. probe commit により commit/preview の計算コストが約2倍（DPゲージ敵存在時のみ）。体感劣化があれば最適化検討

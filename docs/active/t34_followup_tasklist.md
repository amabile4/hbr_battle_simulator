# T34 フォローアップタスクリスト

> ステータス: 🟢 進行中
> 作成日: 2026-04-06
> 最終更新: 2026-04-12
> 元タスク: [t34_enemy_status_management_plan_wbs.md](t34_enemy_status_management_plan_wbs.md)（✅ 完了）
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 概要

T34（敵状態変化管理・表示）本体の WBS-1〜5 は完了しクローズ済み。
ここでは T34 から分離した残タスク・フォローアップを管理する。

## 2026-04-10 監査メモ

2026-04-10 時点で follow-up 文書の open item をコードとテストで再確認した。

- `tests/enemy-status-display.test.js`: 28 PASS
- `tests/t34-enemy-status-integration.test.js`: 14 PASS
- 表示フォーマット unit と integration の lifecycle / replay / legacy fallback は、2026-04-06 時点の文書より前進しており、残タスクから外せる
- browser E2E は `turn-row-preview-status-popup.spec.js` / `superbreak-hefty-guardian.spec.js` などの点的 coverage はあるが、fixture 読込・残ターン更新・legacy session fallback を一連で固定する coverage は未整備
- `ui-next/components/turn-row.js` では `enemy-detail-trigger` / `manual-break-editor` / `follow-up-editor` が依然として別導線で存在し、WBS-3e の「共通 enemy selector component へ集約」は未着手
- `Disaster / 禍` は `docs/active/disaster_status_wbs.md` で完了済み
  - active skill `もつれトラップ` + style passive `巻き添え` により current live style では初回 `Lv4 / 全能力-28`
- 2026-04-11: 単独 EX ターンで、`FollowUpOverrides` が front/back 列固定マッピングに吸われて非EX後衛の追撃を取りこぼすケースを確認
  - `ui-next/engine/turn-engine-manager.js` で「単独 EX action には保存済み follow-up override をその action に attach する」補正を追加し、`tests/ui-next-follow-up-integration.test.js` で回帰を固定
- 2026-04-12: enemy status の `sourceSkillDesc` を `turn-controller` で付与しても、`normalizeEnemyStatusForClone` / `normalizeEnemyStatusForSnapshot` が途中で破棄していた
  - `src/contracts/interfaces.js` / `src/ui/adapter-core.js` で clone/snapshot 契約を揃え、`tests/t34-enemy-status-integration.test.js` / `tests/turn-state-transitions.test.js` で replay と runtime 側の欠落回帰を固定
- 2026-04-12: 第1弾として、`overrideEntries` 非依存で `sourceSkillDesc` を表示できる UI fallback を追加した
  - `src/data/hbr-data-store.js` に `resolveSkillDescription()` を追加し、`ui-next/utils/enemy-status-display.js` / `ui-next/utils/char-detail-popup.js` / `ui-next/components/enemy-detail-popup.js` / `ui-next/components/turn-row.js` で `sourceSkillId -> desc` の表示時解決を接続
  - `tests/data-store-operations.test.js` / `tests/enemy-status-display.test.js` / `tests/ui-next-turn-ui.test.js` / `tests/e2e/session-load-enemy-status-desc.spec.js` で committed row `#19` session load を含む回帰を固定
- 2026-04-12: enemy detail popup の `プレビュー（コミット見込み）` でも `sourceSkillDesc` を表示するようにした
  - preview 用 `enemyStatusChanges` の整形で `sourceSkillId` / `sourceSkillDesc` を落とさないようにし、通常の enemy status block と同じ desc 表示経路へ揃えた
  - `tests/ui-next-turn-ui.test.js` / `tests/e2e/turn-row-preview-status-popup.spec.js` で preview 内 desc の unit / browser 回帰を追加した
- 2026-04-12: enemy detail popup では `Dead` status に source skill `Desc` を出さないようにした
  - `Dead` 自体の status block / skill name は維持しつつ、`sourceSkillDesc` だけを suppress して preview / committed の両方で同じ表示に揃えた
  - `tests/ui-next-turn-ui.test.js` / `tests/e2e/turn-row-preview-status-popup.spec.js` で `Dead` 向け desc suppression の回帰を追加した
- 2026-04-12: unified `statusType` sort v1 の不足分として、同一 statusType 内の期間順を `Eternal → Turn系 → Count` に修正した
  - `status-sort-order.js` に期間グループ副ソートを追加し、`char-detail-popup` / `enemy-status-display` の両方で共通適用した
  - `tests/ui-next-char-detail-popup-order.test.js` / `tests/enemy-status-display.test.js` に回帰を追加した

## 残タスク一覧（2026-04-10 時点）

### 1. WBS-3e: enemy 関連メニュー統合（T34-UI-Stage2）

目的: break / follow-up / enemy status の対象選択 UI を共通化し、重複導線を削減する

作業:

- [ ] `enemy-detail-trigger` / `manual-break-editor` / `follow-up-editor` の共通 enemy selector component を設計する
- [ ] break / follow-up / enemy status の対象選択 UI を共通 component へ集約する
- [ ] 既存操作（break/follow-up）の回帰なしを test で固定する

完了条件:

- 共通 enemy selector で break/follow-up/enemy status が統一操作で使える
- 既存 break/follow-up テストに回帰がない

### 2. WBS-4 テスト残件

#### 2a. unit / integration（監査結果）

- [x] 表示フォーマット unit テスト
  - `tests/enemy-status-display.test.js` で `isActiveEnemyStatus` / sort / cap / label / HTML 生成 / 属性付き icon-label を固定済み
- [x] lifecycle / replay / legacy fallback の integration テスト
  - `tests/t34-enemy-status-integration.test.js` で付与 / 残ターン減少 / 消滅 / Cover / replay round-trip / `enemyStatusSnapshot` なし fallback を固定済み
- [ ] 純ロジックを integration ではなく pure unit に切り出すかは未判断
  - 現状の correctness は integration で担保されているため blocker ではない

#### 2b. browser E2E（残件）

- [ ] fixture 読込後に turn row / popup / enemy panel の表示が一致する browser シナリオを追加する
- [ ] commit 後の残ターン更新が browser 上で一致することを固定する
- [ ] 付与 → 残ターン更新 → 消滅を 1 シナリオで追跡できる E2E を追加する
- [ ] 旧 record（`enemyStatusSnapshot` なし）との互換表示を browser で検証する

#### 2c. UI フォーマット統一（監査結果）

- [x] `enemy-status-display.js` を表示正本とし、属性付きラベル/アイコン定数は `element-status-constants.js` へ共有化済み
- [x] 追加の follow-up 項目としては残さない

### 3. T34-FU1: per-source instance 管理（設計ゲートで分離済み）

目的: C-2 選択肢B（`effectId` 単位の per-source instance 管理）を設計・実装する

- [ ] identity model 変更の影響範囲（engine/UI/tests）を文書化する
- [ ] 既存 merged 前提テストとの差分移行計画を提示する

### 4. T34-FU3: `Disaster / 禍` 対応

目的: 新規 enemy debuff `Disaster` を engine / record / UI / test まで一貫接続する

- [x] `enemyState` 上の `Disaster` 管理モデルを確定した
- [x] `もつれトラップ` の active skill と `巻き添え` passive から `Disaster` を付与・レベル加算できるようにした
- [x] `damageContext` の全能力低下集計へ `Disaster` を統合した
- [x] enemy popup / field chip / char detail で `禍` の level と低下量を表示する
- [x] audit / runtime / UI / browser E2E を追加し、`structuralEnemyStatusGaps` から除外した

関連:

- [disaster_status_wbs.md](disaster_status_wbs.md)
- [../../help/HEAVEN_BURNS_RED/バトル/禍.md](../../help/HEAVEN_BURNS_RED/バトル/禍.md)

### 5. T34-FU4: statusType ソート順の統一（暫定 v1 → 確定）

目的: char-popup-panel / enemy-detail-popup で分散していた statusType ソート ID を `status-sort-order.js` へ統合した（暫定ソート順 v1）。以下の未解決事項を確定ソート順 v2 として解決する。

暫定 v1 実装（2026-04-12 完了）:

- [x] `ui-next/utils/status-sort-order.js` に統合 ID マップ (`UNIFIED_STATUS_TYPE_ID_MAP`) を作成
- [x] `char-detail-popup.js` / `enemy-status-display.js` から共有モジュールを参照するよう移行
- [x] 既存テスト全件 PASS を確認

未解決事項（v2 scope）:

- [ ] **SORT-TODO-1**: ID=264 に `BreakDownTurnUp` (char) と `DownTurn` (enemy) が重複割当されている。同一 `skill_type` ID を共有している可能性が高い。パネル間で出現コンテキストが異なるため実害はないが、統一設計上は明示的に分離するか、alias として文書化すべき
- [ ] **SORT-TODO-2**: 味方/敵で statusType 名が異なる組が存在する — `ConfusionRandom`(107) / `Confusion`(106)、`ImprisonRandom`(110) / `Imprison`(109)、`RecoilRandom`(129) / `Recoil`(128)。ID は連番で隣接しており `normalizeEnemyStatusType` で一部正規化しているが、ソート ID の統合後も名前の二重性が残っている
- [ ] **SORT-TODO-3**: ID 未定義 statusType のフォールバック順の思想差 — char 側は `STATUS_LABELS` のキー宣言順（概ねカテゴリ別）、enemy 側は `ENEMY_STATUS_TYPE_DISPLAY_ORDER`（debuff 優先）。統一するか、パネル別に維持するかを判断する

関連:

- [../../help/popup_json_keys.csv](../../help/popup_json_keys.csv)
- [../../help/popup_sort_order.csv](../../help/popup_sort_order.csv)

## 対象ファイル

- `ui-next/components/turn-row.js` — enemy selector 統合
- `ui-next/components/enemy-detail-popup.js` — popup 連携
- `ui-next/utils/enemy-status-display.js` — 表示フォーマット
- `ui-next/utils/element-status-constants.js` — 属性付き status 表示定数
- `src/turn/turn-controller.js` — `Disaster` runtime/state
- `src/domain/damage-calculation-context.js` — 全能力低下集計
- `ui-next/utils/field-state-display.js` — field chip / detail summary
- `ui-next/utils/char-detail-popup.js` — status label / icon / sort
- `ui-next/utils/status-sort-order.js` — 統合ソート ID 定義（暫定 v1）
- `tests/e2e/*.spec.js` — browser E2E テスト
- `tests/enemy-status-display.test.js` — 表示 unit テスト
- `tests/t34-enemy-status-integration.test.js` — lifecycle / replay / legacy fallback integration
- `tests/turn-state-transitions.test.js` — `Disaster` real-data runtime
- `tests/damage-calculation-context.test.js` — 能力低下集計

## テスト実行コマンド

```bash
# 統合テスト（T34 本体で確立済み）
node --test tests/t34-enemy-status-integration.test.js

# 表示 unit テスト
node --test tests/enemy-status-display.test.js

# 全テスト
node --test
```

## 参考: T34 本体の完了サマリ

- WBS-1 設計: ✅ 敵 status モデル整理・Cover セマンティクス確定
- WBS-2 実装: ✅ replay/再計算接続・enemyStatusSnapshot
- WBS-3 UI: ✅ enemy-status-display / turn-row / enemy-detail-popup / 敵状態確認ボタン
- WBS-4 テスト: ✅ integration（4a/4b/4c）・unit（a1-a11）・受け入れ検証（WBS-5-①〜⑤）
- WBS-5 受け入れ検証: ✅ 付与/更新/消滅/Cover/UI整合（全877テスト PASS）
- T34-FU2: ✅ レビュー Minor 指摘フォローアップ（定数集約・action-flow 共通化・onClose 修正）

# T34 敵状態変化管理・表示 実装プラン/WBS

> ステータス: 🟢 進行中
> 作成日: 2026-04-05
> 最終更新: 2026-04-05
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 進捗チェック

- [x] T34 を単一 backlog の最優先へ昇格
- [x] T34 の実行順（設計→実装→表示→テスト）を確定
- [x] T34 専用プラン/WBS文書を作成
- [x] 親タスクと docs/README に参照導線を追加
- [x] 着手前レビュー結果（Critical/Major/Minor/Open Questions）を反映
- [ ] WBS-1 設計: 敵 status モデル整理
- [ ] WBS-2 実装: replay/再計算接続
- [ ] WBS-3 実装: UI表示（turn row/popup/enemy UI）
- [ ] WBS-4 テスト: unit/integration/e2e
- [ ] WBS-5 受け入れ検証

## 目的

T34 の最優先タスクとして、敵側の状態変化（バフ/デバフ）を以下の観点で一貫管理する。

- engine で付与/更新/消滅が再現可能
- replay/再計算で同一結果を再生可能
- UI で残ターンを含めて可視化可能
- unit/integration/e2e で回帰を固定可能

## スコープ

実装対象:

- 敵側 status effect データモデルの正規化
- turn/replay 経路での付与/更新/消滅
- UI Next での敵状態表示
- テスト整備（unit/integration/e2e）

スコープ外:

- 新しいゲーム仕様（未定義の新規 effectType）追加
- 旧 UI (`dom_adapter`) の parity 対応
- 既存仕様を変える挙動変更

## 前提と依存

- 主実装対象は `ui-next/`
- 既存の generic enemy status 基盤は活用し、UI 層で補正しない
- `PRI-018` の Cover 意味差分（enemy status / player-side status）は本タスク内で設計判断を明文化する

関連ドキュメント:

- [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)
- [implementation_priority_tasklist.md](implementation_priority_tasklist.md)
- [stage_setup_gimmick_pattern_analysis.md](stage_setup_gimmick_pattern_analysis.md)
- [passive_implementation_tasklist.md](passive_implementation_tasklist.md)

## 実行順（確定）

1. WBS-1: Cover セマンティクス決定 + Q-1〜Q-5 回答の明文化
2. WBS-2a: `turn-controller.js` に `enemyStatusSnapshot` 追加（C-1対応）
3. WBS-4a: recalculate 同値性テスト追加（M-1対応, テスト先行）
4. WBS-4b: multi-source identity collision テスト追加（C-2検証, テスト先行）
5. WBS-4c: commit -> record -> replay 同値性テスト追加（pre-UI gate, テスト先行）
6. WBS-3a: `enemy-status-display.js` 新設（M-3対応）
7. WBS-3b: `turn-row.js` へ enemy status 表示接続
8. WBS-3c: enemy detail popup 実装（必須）
9. WBS-4d: E2E テスト追加
10. WBS-5: 受け入れ検証（付与/更新/消滅）

## C-2 方針決定ゲート（Day 1 必須）

- 目的: identity collision の対応方針を WBS-1 で確定し、実装中のスコープ逸脱を防ぐ
- 選択肢 A（T34 既定）: `statusType|elements` の max-merge を許容し、source attribution 不正確性を既知制約として明記
  - 利点: engine 変更を最小化し、T34 を最短で close できる
  - 注意: per-source 厳密性は後続タスクで扱う
- 選択肢 B（拡張）: `effectId` 単位の per-source instance 管理へ移行
  - 利点: source/duration/exitCond の厳密性が高い
  - 注意: engine/UI/test の blast radius が大きく、T34 単体では過大化しやすい
- Day 1 の完了基準:
  - [x] A/B の採否を文書化
  - [x] WBS-2/WBS-4 の作業項目を採択方針に同期
  - [x] 不採用側は別タスク化（必要時）

### Day 1 決定ログ（2026-04-05）

- 正式決定: **選択肢Aを採用**（T34 スコープでは `statusType|elements` の max-merge を維持）
- 採用理由:
  - T34 の主目的（replay/recalculate/UI 可視化）を最短で閉じる
  - engine の blast radius を最小化し、既存テスト前提を保つ
- 未採用案の扱い:
  - 選択肢B（`effectId` 単位の per-source instance 管理）は別タスク化して後続で実施
  - 追跡先: `ui_next_unimplemented_tasklist.md` の `T34-FU1`

## レビュー反映済み設計判断（確定）

- Q-1: 表示は `per-enemy` グループを採用
- Q-2: 撃破敵 status は通常UIには残さない（必要時は履歴/デバッグ側で参照）
- Q-3: `PlayerTurnEnd` 同一ターン内消滅は通常UIで表示しない
- Q-4: power-duration 型は「残ターン」を主表示、power は tooltip 表示
- Q-5: Session snapshot に enemy status は含めない（recalculate で再構築）

## 詳細WBS

### WBS-1 設計: 敵 status モデル整理

目的:

- 敵 status の最小必要フィールドを確定し、保存場所を一意化する

作業:

- [ ] `enemyState` 配下の status 保存形式を確認
- [ ] status の必須フィールドを定義
  - [ ] `statusType`
  - [ ] `remaining` or `duration`
  - [ ] `source` (`skill`/`passive`/`stage`)
  - [ ] `effectId`（選択肢B採用時のみ必須）
  - [ ] `metadata`（必要最小限）
- [ ] identity 方針を一本化
  - [x] Day 1 で A/B を確定し、採択方針を本文に固定
  - [x] 選択肢A: max-merge 規則と既知制約（source attribution）を明文化
  - [x] 選択肢B: per-source instance 規則と表示集約責務は別タスク `T34-FU1` へ分離
- [ ] Cover の扱いを仕様上で明示
  - [ ] 保存先決定を設計ゲートとして確定（enemy-side / player-side）
  - [ ] T34 スコープ内に残すか、別タスクへ分離するかを確定
  - [ ] enemy status として扱うケース
  - [ ] player-side self status/buff として扱うケース
- [x] Open Questions（Q-1〜Q-5）の回答を設計文書へ確定値として反映

完了条件:

- モデル仕様が文書化され、実装参照元が一意に決まっている
- Cover セマンティクス（enemy status / player-side status）の判定規則が明文化されている
- C-2 の採択方針（A/B）と、それに対応する完了条件/テスト条件が明文化されている

### WBS-2 実装: replay/再計算接続

目的:

- commit/replay/recalculate で敵 status の結果が一致する

作業:

- [ ] `turn-controller` の付与/更新/消滅経路を一本化
- [ ] `record`/`snapshot` に必要な enemy status 断面を保存
  - [ ] `committed.stateSnapshot` に `enemyStatusSnapshot` を追加（後方互換）
- [ ] `enemyStatusSnapshot` の reader contract を固定
  - [ ] runtime/UI の正本は `turnState.enemyState.statuses`
  - [ ] `enemyStatusSnapshot` は committed row 診断用 optional cache
  - [ ] 読み出し時は `enemyStatusSnapshot ?? turnState.enemyState.statuses ?? []`
  - [ ] 旧 record（`enemyStatusSnapshot` なし）での fallback 経路を明記
- [ ] `recalculateFrom` 実行で敵 status が再構築されるように接続
- [ ] 既存の `PlayerTurnEnd`/敵行動境界での tick を再確認
- [ ] identity collision の扱いを設計どおりに固定
  - [ ] 選択肢A: `statusType|elements` の max-merge を固定し、既知制約を文書化
  - [ ] 選択肢B: `effectId` 単位 instance 管理と表示集約規則は `T34-FU1` で実施

完了条件:

- 同一 ReplayScript で再計算前後の enemy status が一致する
- `enemyStatusSnapshot` の有無に依存せず表示/再生が一致する
- C-2 の採択方針に応じた collision ケースが再計算/再生で一致する

### WBS-3 実装: UI 表示（turn row/popup/enemy UI）

目的:

- UI 上で敵バフ/デバフと残ターンが確認できる

作業:

- [ ] `ui-next/utils/enemy-status-display.js` を新設
- [x] 表示面の優先順位を固定
  - [x] turn row: 要約表示
  - [x] 詳細 popup: 全件表示
  - [x] enemy setup/詳細 panel: 現在値表示
- [ ] アイコン/ラベル/残ターン表示のフォーマット統一
- [x] 表示上限と省略ルールを定義（過密防止）
  - [x] per-enemy cap 5 icons + overflow
- [ ] enemy detail popup を必須 deliverable として実装

完了条件:

- turn row / enemy detail popup / enemy panel の3画面で同一状態を確認できる
- WBS-4d の対応 fixture で UI 表示一致が検証されている

### WBS-4 テスト: unit/integration/e2e

目的:

- 変更を回帰可能な形で固定する

作業:

- [ ] integration（先行）
  - [ ] WBS-4a: commit -> record -> recalculate の enemy status 同値性
  - [ ] WBS-4b: multi-source identity collision（C-2 採択方針の検証）
    - [ ] `wbs4b_a1_merge_same_key_uses_max_remaining`
    - [ ] `wbs4b_a2_merge_prefers_max_power_for_same_key`
    - [ ] `wbs4b_a3_replay_and_recalculate_keep_merged_outcome`
    - [ ] `wbs4b_a4_source_attribution_is_known_constraint_last_wins`
  - [ ] WBS-4c: commit -> record -> replay の enemy status 同値性（pre-UI gate）
- [ ] unit
  - [ ] status 付与/更新/消滅の純ロジック
  - [ ] 表示フォーマット
- [ ] e2e
  - [ ] fixture 読込後に turn row / popup / enemy panel の表示が一致
  - [ ] commit 後の残ターン更新が一致
  - [ ] 付与 -> 残ターン更新 -> 消滅を1シナリオで追跡可能
  - [ ] 旧 record（`enemyStatusSnapshot` なし）との互換表示を検証

完了条件:

- 該当テストが green
- 既存関連テストを壊さない
- WBS-4a/4b/4c が UI 実装前に追加されている

### WBS-5 受け入れ検証

目的:

- 「付与/更新/消滅」が実運用で成立することを確定

作業:

- [ ] 代表ケースを 3 区分で実施
  - [ ] 付与されること
  - [ ] ターン進行で更新されること
  - [ ] 条件で消滅すること
- [ ] Cover を含むケースで仕様逸脱がないことを確認
- [ ] Cover の設計ゲート結果どおりに表示/挙動が分岐することを確認

完了条件:

- T34 の 6 項目を [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md) で完了化可能
- 完了判定に使うテスト/fixture が文書上で特定できる

## 対象ファイル候補

engine/replay:

- `src/turn/turn-controller.js`
- `src/records/*`
- `ui-next/engine/turn-engine-manager.js`

ui:

- `ui-next/components/turn-row.js`
- `ui-next/components/*enemy*`
- `ui-next/utils/*status*`

tests:

- `tests/turn-state-transitions.test.js`
- `tests/ui-next-*.test.js`
- `tests/e2e/*.spec.js`
- `tests/e2e/fixtures/*.json`

## リスクと対策

- リスク: Cover の意味差分で仕様がぶれる
  - 対策: WBS-1 で先に設計判断を固定し、テスト名に明示
- リスク: 表示実装が engine 差分を隠す
  - 対策: engine 断面の integration テストを先に追加
- リスク: e2e fixture と runtime の乖離
  - 対策: fixture 生成元を 1 つに統一し、テストで断面比較

## AIレビュー用チェックリスト

### レビュー観点A（設計）

- enemy status の保存先は一意か
- status identity（effectId等）は衝突しないか
- Cover の仕様分岐は明文化されているか

### レビュー観点B（実装）

- commit/replay/recalculate で同じ結果になるか
- UI 層で推測補正していないか
- 既存の tick/expiry と矛盾していないか

### レビュー観点C（テスト）

- 付与/更新/消滅をそれぞれ検証しているか
- e2e が表示だけでなく状態遷移を検証しているか
- 既存関連テストに回帰がないか

## AIレビュー依頼テンプレート

以下を他 AI に渡してレビュー依頼できる。

1. 対象: T34 実装差分（engine/replay/UI/tests）
2. 観点: 設計整合、replay整合、UI表示整合、テスト十分性
3. 必須確認:
   - enemy status の単一ソース化
   - Cover 仕様の整合
  - commit / record / replay / recalculate の同値性
4. 出力形式:
   - Critical/Major/Minor で指摘
   - 再現手順
   - 最小修正案

## 着手前レビュー結果 (2026-04-05)

> 以下は反映ログ。現在の実行順/WBSには取り込み済み。

### Critical

- **C-1**: `committed.stateSnapshot` が `enemyState.statuses` を保存していない。`enemyStatusSummary` テキストのみで power/elements/exitCond が欠落。→ **WBS-2a で `enemyStatusSnapshot` を stateSnapshot に追加する（1行、後方互換）**
- **C-2**: Identity key (`statusType|elements`) のみで、異なるスキルから同一 statusType を同一敵に付与すると sourceSkillId が last-wins で不正確。→ **WBS-1 で A/B を設計ゲートとして確定（T34 既定は A: max-merge + 既知制約明記）**

### Major

- **M-1**: `recalculateFrom` の enemy status 同値性テストが存在しない。→ **WBS-4a でテスト先行追加**
- **M-2**: Cover のセマンティクス（enemy debuff vs player self-buff）が未決定。→ **WBS-1 で保存先を設計ゲートとして確定し、必要なら T34 から分離（旧前提は削除）**
- **M-3**: UI layer に enemy status 表示パスがない。`buff-display.js` はフィールド名が異なり直接転用不可。→ **WBS-3a で `enemy-status-display.js` を新設**

### Minor

- **m-1**: `formatEnemyStatusSummary` が power/elements を落とす（CSV 用途では現状維持、UI は statuses 配列を直接参照）
- **m-2**: enemy status 表示上限が未定義（per-enemy cap 5 icons + overflow 推奨）
- **m-3**: `STATUS_TYPE_DISPLAY_ORDER` が player-centric（enemy 用に別 order 定義推奨）

### Open Questions

- **Q-1**: per-enemy グループ表示 vs flat list → **per-enemy 推奨**
- **Q-2**: 撃破敵の status を履歴表示で残すか → **通常UIでは非表示、必要時は履歴/デバッグ側参照で確定**
- **Q-3**: `PlayerTurnEnd` exitCond（同一ターン内消滅）を UI 表示するか → 非表示推奨
- **Q-4**: power-duration 型で残ターン vs 元 power → 残ターン表示、power は tooltip
- **Q-5**: Session snapshot に enemy status を含めるか → recalculate が全再構築するため不要

### WBS 修正事項

- **実行順修正**: engine テスト（WBS-4a, 4b, 4c）を WBS-3（UI 表示）の前に移動
- **依存追加**: C-1 (`enemyStatusSnapshot`) を WBS-2 の作業項目に追加
- **完了条件追加**: Cover セマンティクス決定を WBS-1 の完了条件に明示
- **契約明示**: `enemyStatusSnapshot` の reader/fallback 契約を WBS-2 に追加
- **暗黙ステップ明示**: `enemy-status-display.js` 新設と popup 必須化を WBS-3 内のサブステップとして追加

### 修正後の推奨実装順

1. WBS-1: Cover セマンティクス決定 + Q-1〜Q-5 回答を設計 doc 明文化
2. WBS-2a: `turn-controller.js` に `enemyStatusSnapshot` 追加 (C-1 fix)
3. WBS-4a: recalculate 同値性テスト追加 (M-1 fix) — **テスト先行**
4. WBS-4b: multi-source identity collision テスト追加 (C-2 検証) — **テスト先行**
5. WBS-4c: commit -> record -> replay 同値性テスト追加 — **テスト先行**
6. WBS-3a: `enemy-status-display.js` 新設 (M-3 fix)
7. WBS-3b: `turn-row.js` に enemy status 表示を接続
8. WBS-3c: enemy detail popup（必須）
9. WBS-4d: E2E テスト追加
10. WBS-5: 受け入れ検証

## 進め方（短期）

- Day 1: WBS-1 設計確定（Cover 決定 + Q-1〜Q-5） + WBS-2a (enemyStatusSnapshot)
- Day 2: WBS-4a/4b/4c テスト先行（pre-UI gate を先に green 化）
- Day 3: WBS-3a/3b/3c UI 接続（WBS-4a/4b/4c green 後に着手）
- Day 4: WBS-4d E2E + WBS-5 受け入れ検証

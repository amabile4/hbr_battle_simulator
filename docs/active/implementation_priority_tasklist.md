# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-09

## 目的

- `docs/active/` の再開起点を 1 本に絞る
- 完了済みプランは archive へ退避し、次の実装順だけをここで管理する
- 今後はこの文書を開けば、次に読むべきドキュメントと着手順が分かる状態を維持する

## 再開時の読書順

1. [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md)
2. [`token_implementation_plan.md`](token_implementation_plan.md)
3. [`passive_timing_reference.md`](passive_timing_reference.md)
4. [`ui_parallel_interface_spec.md`](ui_parallel_interface_spec.md)
5. 必要に応じて archive
   - [`../archive/20260309_completed_active_docs/dp_implementation_plan.md`](../archive/20260309_completed_active_docs/dp_implementation_plan.md)
   - [`../archive/20260309_completed_active_docs/multi_enemy_implementation_tasklist.md`](../archive/20260309_completed_active_docs/multi_enemy_implementation_tasklist.md)
   - [`../archive/20260309_completed_active_docs/code_review_followup_tasklist.md`](../archive/20260309_completed_active_docs/code_review_followup_tasklist.md)

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 先にやる理由 | 完了条件 |
|------|----|------|--------|----------|--------------|----------|
| P0 | `PRI-001` | `done` | `turnPlan` / `timing context` 契約整理 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | 今後の passive 実装を全部またぐ共通基盤であり、未整理のまま個別 mechanic を増やすと手戻りが大きい | `setupDelta` と `turn state` の責務、`timing context` の項目、record と turnPlan の保存方針が文章で確定し、参照先 docs に反映されている |
| P1 | `PRI-002` | `done` | 被弾イベント入力モデルの設計と接続 | [`token_implementation_plan.md`](token_implementation_plan.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | `TokenSetByAttacked` と `やる気減少` が同じ「誰が被弾したか」入力に依存しており、1回の設計で 2 系統を進められる | UI 入力経路、engine hook 呼び出し位置、record への残し方、最小テスト方針が定義されている |
| P2 | `PRI-003` | `done` | 被弾トークン / やる気減少の実装 | [`token_implementation_plan.md`](token_implementation_plan.md), [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | P1 が固まれば最短で効果が出る未実装 mechanic 群 | `TokenSetByAttacked` の UI 接続と、被ダメージ起点の `Motivation -1` がテスト込みで動作する |
| P3 | `PRI-004` | `done` | Field / Territory の解除・上書き | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | フィールド系の残り仕様をまとめて閉じられる | Zone / Territory の解除・上書きの状態遷移が turnPlan / scenario / record と整合した形で実装される |
| P4 | `PRI-005` | `done` | 状態系 UI / Records / Passive Log の見える化 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md), [`ui_parallel_interface_spec.md`](ui_parallel_interface_spec.md) | デバッグ効率は高いが、P0-P3 ほどのアンブロッカーではない | Mark / Zone / Territory の見える化方針と表示箇所が docs と UI の両方で揃う |
| P5 | `PRI-006` | `done` | Phase 6 拡張（master / normal / slot / equip 起点 passive） | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | 面積が広く、前段の契約整理が済んでからでないと危険 | 対象範囲の分割順、最初に着手する source 系統、テスト方針が決まっている |

## 次に着手する具体的な 1 本

### 今回までで確定したこと

- `setupDelta` に保存する入力状態
  - `dpStateByPartyIndex`
  - `tokenStateByPartyIndex`
  - `moraleStateByPartyIndex`
  - `motivationStateByPartyIndex`
  - `markStateByPartyIndex`
  - `zoneState`
  - `territoryState`
- `turn` 単位の一時入力として top-level に保存するもの
  - `enemyAttackTargetCharacterIds`
- `turnPlan` に保存しないもの
  - passive の発火結果そのもの
  - warning / log のような派生結果
- record 側に保存するもの
  - `passiveEvents`
  - `enemyAttackEvents`
  - `enemyAttackTargetCharacterIds`
- `timing context` の最低限の前提
  - `turnType`
  - `isFirstBattleTurn`
  - `isAdditionalTurn`
  - `triggerSource`
  - `enemyState`
  - `actor`

### 次に着手する具体的な 1 本

- `PRI-003` は完了
  - `TokenSetByAttacked` と被ダメージ起点 `Motivation -1` はどちらも `enemyAttackTargetCharacterIds` を共通入力として commit 境界で反映する
  - `被ダメージで -1` は実データ固有の `skill_type` ではなく、[`../../help/HEAVEN_BURNS_RED/バトル/やる気.md`](../../help/HEAVEN_BURNS_RED/バトル/やる気.md) のヘルプ仕様に基づく `Motivation` 状態の共通ルールとして実装した
- `PRI-005` は完了
  - `committedRecord.stateSnapshot` に `markStateByPartyIndex` / `zoneState` / `territoryState` / `tokenStateByPartyIndex` を追加（`commitTurn` 時に次状態スナップショットを付加）
  - Token 値は `hasTokenPassiveSupport` 条件で party-state 表示領域に既に出力済みであることを確認・DOM テスト追加
  - Mark の passive 変化（`MARK_SKILL_TYPE_TO_ELEMENT` 系）は既存設計上「イントリンシック mark は passive から直接変更しない」ため PRI-006 対象として保留
- `PRI-006` は完了（調査フェーズ）
  - 4 種類の passive source を調査し、実装ギャップを確定（詳細は `passive_implementation_tasklist.md` Phase 6 参照）
  - 通常スキル由来: データ読み込み済み、不足エフェクト型の追加が次の実装 → **Phase 6-A**
  - マスタースキル由来: 57xxxxxx スキル ID のデータソース確立が必要 → **Phase 6-B**
  - スキルスロット: generalize フラグ仕様未確定 → **Phase 6-C（調査後）**
  - 装備起点: バトル passive なし → **対象外**
- 次の着手候補は **Phase 6-A**
  - `src/turn/turn-controller.js` の `applyPassiveTimingInternal` に通常スキル由来の不足エフェクト型を追加

## メモ

- archive に移した完了 docs は履歴参照用であり、今後の更新対象ではない
- 実装が 1 つ完了したら、この文書の優先順位と `docs/README.md` を同じコミットで更新する

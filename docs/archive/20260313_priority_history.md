# Implementation Priority Task List（アーカイブ）

> **ステータス**: 🗄️ アーカイブ | 📅 アーカイブ日: 2026-03-13
>
> **後継ドキュメント**: [`../active/implementation_priority_tasklist.md`](../active/implementation_priority_tasklist.md)（最新版）

---

## 目的

- `docs/active/` の再開起点を 1 本に絞る
- 完了済みプランは archive へ退避し、次の実装順だけをここで管理する
- 今後はこの文書を開けば、次に読むべきドキュメントと着手順が分かる状態を維持する

## 再開時の読書順

1. [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md)
2. [`token_implementation_plan.md`](../active/token_implementation_plan.md)
3. [`passive_timing_reference.md`](../active/passive_timing_reference.md)
4. [`ui_parallel_interface_spec.md`](../active/ui_parallel_interface_spec.md)
5. 必要に応じて archive
   - [`20260309_completed_active_docs/dp_implementation_plan.md`](20260309_completed_active_docs/dp_implementation_plan.md)
   - [`20260309_completed_active_docs/multi_enemy_implementation_tasklist.md`](20260309_completed_active_docs/multi_enemy_implementation_tasklist.md)
   - [`20260309_completed_active_docs/code_review_followup_tasklist.md`](20260309_completed_active_docs/code_review_followup_tasklist.md)

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 先にやる理由 | 完了条件 |
|------|----|------|--------|----------|--------------|----------|
| P0 | `PRI-001` | `done` | `turnPlan` / `timing context` 契約整理 | [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md) | 今後の passive 実装を全部またぐ共通基盤であり、未整理のまま個別 mechanic を増やすと手戻りが大きい | `setupDelta` と `turn state` の責務、`timing context` の項目、record と turnPlan の保存方針が文章で確定し、参照先 docs に反映されている |
| P1 | `PRI-002` | `done` | 被弾イベント入力モデルの設計と接続 | [`token_implementation_plan.md`](../active/token_implementation_plan.md), [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md) | `TokenSetByAttacked` と `やる気減少` が同じ「誰が被弾したか」入力に依存しており、1回の設計で 2 系統を進められる | UI 入力経路、engine hook 呼び出し位置、record への残し方、最小テスト方針が定義されている |
| P2 | `PRI-003` | `done` | 被弾トークン / やる気減少の実装 | [`token_implementation_plan.md`](../active/token_implementation_plan.md), [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md) | P1 が固まれば最短で効果が出る未実装 mechanic 群 | `TokenSetByAttacked` の UI 接続と、被ダメージ起点の `Motivation -1` がテスト込みで動作する |
| P3 | `PRI-004` | `done` | Field / Territory の解除・上書き | [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md) | フィールド系の残り仕様をまとめて閉じられる | Zone / Territory の解除・上書きの状態遷移が turnPlan / scenario / record と整合した形で実装される |
| P4 | `PRI-005` | `done` | 状態系 UI / Records / Passive Log の見える化 | [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md), [`ui_parallel_interface_spec.md`](../active/ui_parallel_interface_spec.md) | デバッグ効率は高いが、P0-P3 ほどのアンブロッカーではない | Mark / Zone / Territory の見える化方針と表示箇所が docs と UI の両方で揃う |
| P5 | `PRI-006` | `done` | Phase 6 拡張（master / normal / slot / equip 起点 passive） | [`passive_implementation_tasklist.md`](../active/passive_implementation_tasklist.md) | 面積が広く、前段の契約整理が済んでからでないと危険 | 対象範囲の分割順、最初に着手する source 系統、テスト方針が決まっている |

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
  - マスタースキル由来: 57xxxxxx パッシブは `styles.json` の `passives[]` に埋め込み済みで読み込み完了。不足エフェクト型（`DamageUpByOverDrive` 等）の追加が残り → **Phase 6-B**
  - スキルスロット: `generalize` は編成 UI フラグ（バトル passive 非対象）→ **対象外に確定**（[ジェネライズ.md](../../help/HEAVEN_BURNS_RED/キャラクター/ジェネライズ.md) 参照）
  - 装備起点: バトル passive なし → **対象外**
- Phase 6-A は完了（Morale / DamageRateUp / DefenseDown / DefenseUp / CriticalRateUp / CriticalDamageUp / GiveDefenseDebuffUp 実装）
- Phase 6-A 追加完了（`TokenSet` passive: `OnEveryTurn`/`OnBattleStart`/`OnAdditionalTurnStart` timing でのトークン +N delta）
  - `TokenSet` の `skill_type` は「トークンをN上昇」（delta +N）であり、絶対値セットではないことを確認済み
  - 既存の token skill テスト（MiOhshima/MuOhshima/IrOhshima）の期待値を ボルテージ passive 発火分に合わせて更新済み
- Phase 6-B は完了（DamageUpByOverDrive / GiveAttackBuffUp / GiveHealUp 実装）
- **Support Skills Phase 2 は完了（2026-03-11）**: Task A（initializeBattle後パッシブログテスト）、Task B（全timing×skill_typeテスト）、Task C（GiveAttackBuffUp/GiveDefenseDebuffUpはスコープ外と確認）。計446テストPASS。
- **SpLimitOverwrite / ReduceSp 全timing対応は完了（2026-03-12）**: 計482テストPASS
  - `SpLimitOverwrite`（歴戦）: `applyInitialPassiveState` で sp.max = 30 を正しく設定（テスト追加）
  - `ReduceSp` の `applyPassiveTimingInternal` 誤SP減算を廃止（`ReduceSp` は常にスキルコスト表示時に反映）
  - `resolveEffectiveSkillForAction` に `OnFirstBattleStart`（蒼天・氷天・火天・雷天等の永続）、`OnAdditionalTurnStart`（追加ターン中）、`OnOverdriveStart`（OD中）タイミング対応を追加
- **OnOverdriveStart 非EPパッシブ補強は完了（2026-03-12）**: 計486テストPASS
  - `HealSp`（旭日昇天 Self / エクスタシー AllyAll）: `applyPassiveSpOnOverdriveStart` を新設し `activateOverdrive` で呼ぶ
  - `AttackUp`（専心 ×3）: `previewActionEntries` の `resolvePassiveAttackUpForMember` に `OnOverdriveStart`（OD中のみ）を追加
- **AttackUpPerToken / DefenseUpPerToken 実装は完了（2026-03-12）**: 計492テストPASS
  - `resolvePassiveAttackUpPerTokenForMember` / `resolvePassiveDefenseUpPerTokenForMember` を追加
  - `previewActionEntries` で `OnPlayerTurnStart`（高揚・激励）/ `OnEnemyTurnStart`（鉄壁）を解決
  - `specialPassiveModifiers.attackUpPerTokenRate` / `defenseUpPerTokenRate` フィールドを追加
  - record assembler に両フィールドを追加、6テスト追加（T6〜T11）
- 次の着手候補: `implementation_priority_tasklist.md` で判断

## メモ

- archive に移した完了 docs は履歴参照用であり、今後の更新対象ではない
- 実装が 1 つ完了したら、この文書の優先順位と `docs/README.md` を同じコミットで更新する

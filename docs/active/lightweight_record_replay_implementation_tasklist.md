# 軽量 Record / Replay / Edit 実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-14
>
> **前提設計**:
> [`lightweight_record_replay_design.md`](lightweight_record_replay_design.md)
>
> **前提調査**:
> [`../20260314_record_replay_edit_investigation/README.md`](../20260314_record_replay_edit_investigation/README.md)

## 目的

- 編集正本を `ReplayScript` に切り替える
- `record` を完全に derived output へ戻す
- `slots[6]` を基本単位にして、style と skill のズレを防ぐ
- `setup` / `operations` / `overrideEntries` を typed envelope として実装し、将来の増減に耐える
- replay は best-effort で最後まで走り、OD/SP 等の不正値は許容する

## 実装原則

1. `slots[6]` が turn の正本である
2. `recordStore.records` は replay 結果から毎回再生成する
3. replay は gameplay 上の矛盾では停止しない
4. `setupEntries[]` / `operations[]` / `overrideEntries[]` は typed envelope とする
5. 未知の `type` は round-trip で保持し、executor では no-op + warning でよい
6. `note` は保存対象だが、シミュレーションには影響させない

## 実装対象

### 正本 schema

- `ReplayScript`
- `ReplaySetup`
- `ReplayTurn`
- `TurnSlot`
- `SetupEntry`
- `TurnOperation`
- `OverrideEntry`

### 実装レイヤ

- `src/ui/adapter-core.js`
- `src/ui/battle-adapter-facade.js`
- `src/ui/dom-adapter.js`
- 必要なら `src/contracts/interfaces.js`
- 必要なら `src/records/` の export 周辺

## タスク

### T01: schema 固定

- [x] `ReplayScript` / `ReplayTurn` / `TurnSlot` の JSON shape を確定する
- [x] `setupEntries[]` / `operations[]` / `overrideEntries[]` の envelope shape を確定する
- [x] `note` の round-trip 仕様を確定する
- [x] stable core と extension lane の境界を明文化する

完了条件:

- docs 上で `slots[6]` / typed envelope / `note` の schema が矛盾なく定義されている

### T02: typed envelope 基盤

- [x] `setupEntries[]` handler registry を core 層に用意する
- [x] `operations[]` handler registry を core 層に用意する
- [x] `overrideEntries[]` handler registry を core 層に用意する
- [x] 未知 type を preserve する serialization/deserialization を用意する

完了条件:

- schema に新しい `type` を追加しても、既存 load/save/replay が壊れない

### T03: current state から lightweight script を capture

- [x] commit 時に current turn を `slots[6]` として capture する
- [x] `鬼神化` / `通常OD` / `割込OD予約` を `operations[]` に capture する
- [x] turn ごとの自由入力メモを `note` として capture する
- [x] 現行 `turnPlans` capture と並行稼働させる場合の bridge を決める

完了条件:

- 1 turn commit 後に、style/skill/target が同じ slot に入った lightweight script が得られる

### T04: best-effort replay executor

- [x] `ReplayScript` から battle を再初期化する executor を作る
- [x] `slots[6]` を current turn state に反映して commit する処理を作る
- [x] `operations[]` を現行 runtime timing に従って適用する
- [x] OD/SP 等がマイナスになっても停止しない挙動にする
- [x] 未知 operation / override は no-op + warning にする

完了条件:

- gameplay 上の不自然値が出ても replay が最後まで完走する

### T05: record 再生成への切替

- [x] replay 実行結果から `recordStore.records` を再生成する
- [x] table / preview / export が derived record を使うよう整理する
- [x] `record` を編集正本として扱うコード経路を外す

完了条件:

- 編集正本が `ReplayScript` のみになり、record は出力専用になる

### T06: UI 編集導線の切替

- [x] turn 編集 UI を `slots[6]` 中心に切り替える
- [x] `operations[]` 編集 UI を追加する
- [x] `note` 入力 UI を追加する
- [x] 旧 swap 行編集 UI を縮退または非推奨化する

完了条件:

- ユーザーが「turn / 6 slot / operation / note」を直接編集できる

### T07: setup の extensible 化

- [x] 初期編成など stable core と、可変 setup 状態を分離する
- [x] 事前状態は `setupEntries[]` に寄せる
- [x] future setup type を追加しやすい registry / dispatcher 構成にする

完了条件:

- setup への新規状態追加で schema の全面更新が不要になる

### T08: legacy bridge / migration

- [x] 現行 `turnPlans` から `ReplayScript` への変換 helper を作る
- [x] 必要なら dual-write 期間を設ける
- [x] 既存 scenario / record / export との互換境界を明文化する

完了条件:

- 既存データ/既存UIから段階移行できる

### T09: warning / diagnostics

- [ ] no-op 扱いした unknown type を UI へ表示できるようにする
- [ ] replay 中に発生した best-effort 補正や不自然値を補助表示できるようにする
- [ ] 停止ではなく「最後まで走った上で warning を返す」形に揃える

完了条件:

- 実行継続と診断表示が両立する

### T10: テスト整備

- [x] slot 一体型保存で style/skill mismatch が起きない回帰を追加する
- [x] `operations[]` round-trip テストを追加する
- [x] `note` round-trip テストを追加する
- [x] negative OD/SP 許容の best-effort replay テストを追加する
- [x] unknown `type` preserve/no-op テストを追加する

完了条件:

- 主要ケースが unit/integration test で固定されている

## 受け入れ条件

- [x] 1 turn の保存単位が `slots[6]` であり、style と skill が分離しない
- [x] `鬼神化` / `通常OD` / `割込OD予約` / `note` を同じ turn に保存できる
- [x] replay は最後まで走り、OD/SP のマイナス値で停止しない
- [x] `setupEntries[]` / `operations[]` / `overrideEntries[]` に未知 type が来ても保持できる
- [x] `record` が derived output として再生成される

## 実装メモ

- 2026-03-14: T01-T03 を実装。`src/ui/lightweight-replay-script.js` に `ReplayScript` schema / typed envelope registry / unknown type preserve 正規化を追加し、`BattleAdapterFacade` と `BattleDomAdapter` で `turnPlans` と並行する dual-write capture を開始
- 2026-03-14: `turnNoteDraft` を capture 対象として追加。UI 入力は未着手だが、commit 経路では `note` round-trip が成立
- 2026-03-14: `turnPlanBaseSetup` に support setup を追加し、`ReplayScript.setup` の stable core と同期
- 2026-03-14: T04 を実装。`recalculateReplayScript()` / slot position alignment / operation materialization / best-effort force replay / unknown entry warning を追加し、`turnPlans` を介さず `ReplayScript` から battle を再演できるようにした
- 2026-03-14: T05 を実装。record table / edit staging / recalc button / export が `ReplayScript` 優先で動くように切り替え、`recordStore.records` を derived output として再生成する経路へ統一。legacy `turnPlans` は mirror/bridge としてのみ残置
- 2026-03-14: T06 を実装。record edit toolbar に slot editor / operation editor / note textarea を追加し、ReplayScript 編集時は swap UI を非推奨化。save 時は draft から `operations[]` / `note` / preserved unknown entries を正本へ戻す
- 2026-03-14: T07 を実装。`ReplaySetup` の known pre-state を `setupEntries[]` へ migrate し、`reinitializeFromReplayScriptBase()` で registry / dispatcher 経由の適用へ切り替えた。legacy fixed field は互換入力として吸収し、`preserveTurnPlans` 時は既存 `setupEntries[]` を base 再初期化で失わないよう merge 優先順位を調整
- 2026-03-15: T08 を実装。legacy `turnPlans` を `base styleIds + swaps + actions.positionIndex` から静的に `ReplayScript.turns` へ変換する migration helper を追加し、`overrideEntries[]` registry で `enemyAction` / party state map / field state / enemy config を bridge した。`turnPlans` mirror は dual-write のまま残しつつ、ReplayScript が空で turnPlans のみ存在する場合は lazy migration で編集正本を ReplayScript 側へ寄せる

## 今回のスコープ外

- ダメージ計算の厳密化
- gameplay 上あり得ない値を防ぐための guard 強化
- 未知 type の自動 UI 生成
- 旧 rich turnPlan の完全削除

## メモ

- このタスクは「数値を常に正しくする」より、「軽く保存し、最後まで再演し、人間が直せる」ことを優先する
- extensible schema は必須であり、固定 key を増やし続ける設計は避ける
- `setup` / `operations` / `overrideEntries` の増減は将来の前提として扱う

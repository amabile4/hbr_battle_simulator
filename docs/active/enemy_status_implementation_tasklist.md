# 敵状態異常基盤 実装タスクリスト（PRI-011）

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-14 | 📅 完了: 2026-03-14

## 目的

- `turnState.enemyState.statuses` を一般敵デバフでも使える共通基盤に拡張する
- active skill の敵デバフ付与を `commitTurn()` で記録・持続できるようにする
- `CountBC(IsPlayer()==0...)` を hardcode ではなく敵単位評価へ寄せる
- `overwrite_cond` / `SkillCondition` から参照される敵状態条件を次 wave へ繋ぐ

## 今回のスコープ

### 今回やること

- `enemyState.statuses` の汎用 status スキーマ整理
- active skill 由来の敵状態異常付与
  - `DefenseDown`
  - `Fragile`
  - `AttackDown`
  - `ResistDown`
  - `ResistDownOverwrite`
  - `Provoke`
  - `Attention`
- enemy-side `CountBC` の汎用評価
  - `IsDead()`
  - `IsBroken()`
  - `BreakDownTurn()`
  - `DamageRate()`
  - `IsWeakElement(...)`
  - `SpecialStatusCountByType(12/57)`
- record / contract / UI で enemy statuses の追加フィールドを落とさないこと

### 今回やらないこと

- 確率系の simulator ルール確定
  - `StunRandom`
  - `ConfusionRandom`
  - `ImprisonRandom`
- 実ダメージ計算への `DefenseDown` / `Fragile` / `ResistDown` 反映
- 敵AI / 勝敗判定 / 戦闘終了フロー
- UI での敵状態異常手動入力の全面改修

## 事前確認メモ

- 既存の `enemyState.statuses` は `Break` / `DownTurn` / `StrongBreak` / `SuperDown` / `Dead` を保持済み
- `upsertEnemyStatus()` / `removeEnemyStatuses()` / `tickEnemyStatuses()` は既にあり、一般敵デバフへ流用できる
- 現状の clone / contract / UI 正規化は `statusType / targetIndex / remainingTurns` のみ保持しており、`power` や `elements` を落としている
- `CountBC(IsPlayer()==0...)` は現在 `Break` / `DownTurn` / `DamageRate` / `IsWeakElement` を個別 hardcode で判定している
- `挑発(12)` / `注目(57)` は `SpecialStatusCountByType` の敵側条件として後続スキルで参照される

## 対象ファイル

- `src/turn/turn-controller.js`
- `src/contracts/interfaces.js`
- `src/ui/adapter-core.js`
- `src/ui/dom-adapter.js`
- `src/records/record-assembler.js`
- `tests/turn-state-transitions.test.js`
- `docs/active/implementation_priority_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: status スキーマの共通化

- [x] **T01**: enemy status の正規化ヘルパーを定義する
  - `statusType`
  - `targetIndex`
  - `remainingTurns`
  - `power`
  - `elements`
  - `sourceSkillId` / `sourceSkillName` / `sourceSkillLabel`
  - `metadata`
- [x] **T02**: `getEnemyState()` / `cloneTurnState()` / `buildEnemyStateForUi()` / contract で追加フィールドを保持する
- [x] **T03**: `upsertEnemyStatus()` を「target + status identity」で更新できるようにする
  - 同系統 status は duration / power を安全側で更新

### フェーズ2: active skill からの敵状態異常付与

- [x] **T04**: `applyEnemyStatusEffectsFromActions()` を追加する
- [x] **T05**: `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` / `ResistDownOverwrite` を `enemyState.statuses` へ付与する
- [x] **T06**: `commitTurn()` の `enemyStatusChanges` に一般敵デバフイベントも含める
- [x] **T07**: 敵ターン消費時の `tickEnemyStatuses()` で一般敵デバフも期限減少することを確認する

### フェーズ3: enemy-side CountBC の汎用化

- [x] **T08**: 敵1体ぶんの clause を評価するヘルパーを実装する
- [x] **T09**: `evaluateCountBCPredicate()` の敵側 hardcode を汎用 enemy evaluation へ寄せる
- [x] **T10**: `SpecialStatusCountByType(12/57)` を `Provoke` / `Attention` として扱えるようにする
  - `special_status_implementation_tasklist.md` の `T15` の受け皿

### フェーズ4: テスト

- [x] **T11**: manual test で `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` の付与と tick を確認する
- [x] **T12**: enemy-side `CountBC(IsPlayer()==0...)` の汎用評価回帰を追加する
- [x] **T13**: `SpecialStatusCountByType(12/57)` の enemy-side 条件テストを追加する
- [x] **T14**: real-data 回帰を追加する
  - `迅雷風烈` の `DefenseDown`
  - `まだまだ行くで！` の `Fragile`
  - `フレイムテンペスト` の `AttackDown`
  - `今宵、快楽ナイトメア` の `ResistDown` / `ResistDownOverwrite`
  - `スパークル・トライエッジ+` の `Provoke` / `Attention` 条件

## 完了条件

- 一般敵デバフが `enemyState.statuses` へ保存され、敵ターン消費で減衰する
- `record` / contract / UI が追加フィールドを破壊しない
- `CountBC(IsPlayer()==0...)` が hardcode 依存を減らした形で評価できる
- `SpecialStatusCountByType(12/57)` が enemy-side 条件として評価できる
- 本ファイル、[`implementation_priority_tasklist.md`](implementation_priority_tasklist.md)、[`../README.md`](../README.md) が同期される

## 実装メモ

- `enemyState.statuses` は `power` / `elements` / `limitType` / `exitCond` / source 情報 / `metadata` を保持する共通スキーマへ拡張した
- `upsertEnemyStatus()` は `targetIndex + statusType + elements` 単位で merge するため、同一敵に通常 `ResistDown` と属性限定 `ResistDown` を併存できる
- `record` / contract / UI / scenario でも追加フィールドを落とさず、`exitCond === Eternal` を active 扱いに揃えた
- enemy-side `CountBC` は敵ごとの clause 評価へ寄せ、`SpecialStatusCountByType(12/57)` を `Provoke` / `Attention` へ接続した

## 検証

- `node --test tests/turn-state-transitions.test.js tests/record-system.test.js tests/dom-adapter-ui-selection.test.js`
  - 335 PASS
- `npm run test:quick`
  - 335 PASS

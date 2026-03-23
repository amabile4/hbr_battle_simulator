# プレイヤー側拘束状態 手動フック タスクリスト（PRI-017）

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-14 | 📅 完了: 2026-03-14

## 目的

- `SpecialStatusCountByType(79)` を enemy AI 非実装でも manual state から評価できるようにする
- scenario setup / turn override / turn plan replay で player-side `ImprisonRandom` を保持できるようにする
- record / snapshot から manual player status を再現可能な形で残す

## 事前調査メモ

- runtime 側の `SpecialStatusCountByType(79)` 自体は `statusEffects[].metadata.specialStatusTypeId = 79` を持てば評価できる
- 現状の gap は「その状態を setup / scenario / replay へ注入する入口」がない点にある
- `turnPlanBaseSetup` と scenario turn は `tokenStateByPartyIndex` / `markStateByPartyIndex` などの map で state を受け渡している
- committed record の `snapBefore` / `snapAfter` には `statusEffects` が入るが、`stateSnapshot` には player status map がない
- UI の party state は既存 `statusEffects` 表示を持つため、新たな専用表示 UI は必須ではない

## 今回のスコープ

### 今回やること

- `statusEffectsByPartyIndex` の manual state schema を定義する
- battle initialize / scenario setup / scenario turn override / replay base に同 schema を通す
- `SpecialStatusCountByType(79)` の preview / passive 初期評価 / CountBC 回帰を追加する
- committed record の `stateSnapshot` に player-side status map を追加する

### 今回やらないこと

- 専用 GUI フォームの新設
- enemy AI からの拘束付与実装
- `ImprisonRandom` の行動不能解決そのもの

## 対象ファイル

- `src/domain/character-style.js`
- `src/ui/adapter-core.js`
- `src/ui/dom-adapter.js`
- `src/turn/turn-controller.js`
- `tests/adapter-core.test.js`
- `tests/dom-adapter-battle-scenario.test.js`
- `tests/dom-adapter-records-style.test.js`
- `tests/turn-state-transitions.test.js`
- `docs/active/implementation_priority_tasklist.md`
- `docs/active/special_status_implementation_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: schema / runtime

- [x] **T01**: `statusEffectsByPartyIndex` schema を定義し、`specialStatusTypeId: 79` shorthand を受けられるようにする
- [x] **T02**: initialize / setup / replay base で `statusEffectsByPartyIndex` を party state へ適用する
- [x] **T03**: scenario turn override と turn plan serialization に `statusEffectsByPartyIndex` を通す
- [x] **T04**: committed record の `stateSnapshot` に player-side status map を追加する

### フェーズ2: テスト

- [x] **T05**: manual `ImprisonRandom` が `CountBC(IsPlayer()==1&&SpecialStatusCountByType(79)>0)` に反映される回帰を追加する
- [x] **T06**: adapter-core 初期化で manual status が passive 初期評価より先に見える回帰を追加する
- [x] **T07**: scenario setup / turn override / replay base / turn plan round-trip 回帰を追加する

### フェーズ3: docs

- [x] **T08**: `implementation_priority_tasklist.md` / `special_status_implementation_tasklist.md` / `docs/README.md` を完了状態へ同期する

## 完了条件

- `statusEffectsByPartyIndex` を setup / scenario / replay へ与えると party `statusEffects` に反映される
- `SpecialStatusCountByType(79)` を使う preview / passive / CountBC が manual state で真になる
- committed record が player-side status map を持つ
- 本ファイルと [`implementation_priority_tasklist.md`](implementation_priority_tasklist.md)、[`../README.md`](../README.md) が同じコミットで更新される

## 実装結果

- `adapter-core` に `statusEffectsByPartyIndex` 正規化と party 反映 helper を追加し、`specialStatusTypeId: 79` shorthand から `ImprisonRandom` を復元できるようにした
- `initializeBattle` / scenario setup / scenario turn override / turn plan normalize / scenario export / replay base に同 schema を接続した
- committed record の `stateSnapshot` に `statusEffectsByPartyIndex` を追加し、manual player status を record JSON から再現できるようにした
- `CountBC(IsPlayer()==1&&SpecialStatusCountByType(79)>0)` の preview 回帰、battle 初期化時 passive 初期評価、scenario / replay 回帰を追加した
- `turnPlan` は current state の `statusEffects` を setupDelta として保持するため、scenario bridge と再計算が同じ状態表現で揃った

## 検証

- `node --test tests/adapter-core.test.js`
  - 4 PASS
- `node --test tests/dom-adapter-battle-scenario.test.js`
  - 31 PASS
- `node --test tests/dom-adapter-records-style.test.js`
  - 47 PASS
- `node --test tests/turn-state-transitions.test.js`
  - 295 PASS
- `npm run test:quick`
  - 367 PASS

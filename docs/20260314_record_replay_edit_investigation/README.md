# 記録・再生・編集機能 現状調査

> **ステータス**: 📦 スナップショット | **調査日**: 2026-03-14
>
> **対象コード**:
> [`../../src/ui/dom-adapter.js`](../../src/ui/dom-adapter.js),
> [`../../src/ui/battle-adapter-facade.js`](../../src/ui/battle-adapter-facade.js),
> [`../../src/ui/adapter-core.js`](../../src/ui/adapter-core.js),
> [`../../src/records/`](../../src/records/),
> [`../../src/turn/turn-controller.js`](../../src/turn/turn-controller.js)

## 背景

- ユーザー想定は「どのターンに、誰が、どのポジションで、どのスキルを使ったか」を並べたシンプルな記録である
- 現状実装では、記録・再生・編集・再計算がかなり複雑に見え、編集後の再計算結果も期待から外れることがある
- 本調査では、現状の保存内容と再計算経路を追い、「なぜシンプルな記録モデルになっていないか」を整理する

## 結論サマリ

1. 現在の「編集して再計算」は、`recordStore.records` を編集しているのではなく、`turnPlans` を編集して再演算している
2. `record` は観測ログ、`turnPlan` は replay 用入力、`turnPlanBaseSetup` は replay の初期条件であり、役割の違う 3 系統が共存している
3. `turnPlan` は action だけでなく、各ターン開始前に必要な局面差分を広く保持しているため、単純な「行の並べ替え」では済まない
4. `positionIndex` と `characterId` が action に二重に存在し、再計算時に位置側の解決が優先されるため、ユーザーの期待とズレやすい
5. 現行方式には再現性・監査性の利点がある一方、UI と mental model 上は「記録」と「再演算入力」が混ざって見えることが主な複雑化要因である

## 主要データモデル

| 名称 | 実体 | 主用途 | 保持内容 |
|------|------|--------|----------|
| `recordStore.records` | 確定ターンログ | 監査、CSV/JSON 出力、結果確認 | `snapBefore` / `snapAfter`、action ごとの各種 resource change、敵状態変化、passive event、state snapshot など |
| `turnPlans` | 再計算用ターンプラン | 編集、再生、再計算 | action、swap、OD 予約、敵ターゲット予約、各種 `setupDelta` |
| `turnPlanBaseSetup` | 再計算の初期条件 | battle 再初期化 | style、初期 SP/DP、初期状態異常、敵設定、zone/territory など |

## データフロー

### 1. 初期化

- battle 初期化時に `turnPlanBaseSetup` が作られる
- ここには編成、初期 SP、DP、token、morale、motivation、mark、status effect、敵設定、zone/territory が入る
- これは「あとで turn plan を最初から replay するための土台」である

### 2. 通常の Preview / Commit

- `previewCurrentTurn()` は現在 state から preview record を組み立てる
- `commitCurrentTurn()` は preview record を確定 record にしつつ、同時に `captureCurrentTurnPlanFromDom()` でそのターンの turn plan も保存する
- つまり commit 時点で、観測ログと replay 入力が並行して保存される

### 3. 編集 / 再計算

- 再計算は `turnPlanBaseSetup` から battle を再初期化する
- その後、各 `turnPlan` を `scenario turn` 相当の入力に変換して順に流す
- 再計算結果として `recordStore.records` を再生成し、`turnPlanComputedRecords` にも反映する

### 4. Scenario との関係

- `turnPlan` 再計算パスは `applyScenarioTurn()` を流用している
- そのため turn plan 編集は、実態としては scenario replay editor に近い

## シンプル記録モデルとの乖離

### ユーザー想定

```text
TurnAction = {
  turn,
  actor,
  position,
  skill,
  target?
}
```

### 現行実装

```text
ReplayBase = 初期編成 + 初期リソース + 初期状態異常 + 敵設定 + field
TurnPlan   = そのターン開始前に必要な局面差分 + actions + swaps + OD予約
Record     = 実行結果の観測ログ
```

### 乖離が起きる理由

- `turnPlan` に `setupDelta` があるため、各行が「action だけ」ではなく「そのターン開始前の局面」まで持つ
- `turnPlan` の action は `positionIndex` と `characterId` を両方持つが、再生時は `positionIndex` 側が強く効く
- swap や初期 position 調整も replay 中に実行されるため、行移動の影響が局所的ではない
- strict / force の再計算モード差分まで turn plan replay パスに入っている

## 複雑化の主因

### 1. 「記録」と「編集対象」が別物

- UI 上は同じ表に見えるが、実際には `record` と `turnPlan` は別管理である
- 表示テーブルも `turnPlans` と `recordStore.records` を横並びで扱っている

### 2. 各ターンが状態差分を保存している

- `setupDelta` には以下が入り得る
- `enemyCount`
- `enemyNames`
- `enemyDamageRates`
- `enemyDestructionRates`
- `enemyDestructionRateCaps`
- `enemyBreakStates`
- `enemyStatuses`
- `dpStateByPartyIndex`
- `tokenStateByPartyIndex`
- `moraleStateByPartyIndex`
- `motivationStateByPartyIndex`
- `markStateByPartyIndex`
- `statusEffectsByPartyIndex`
- `zoneState`
- `territoryState`

### 3. Scenario engine の流用

- 再計算は専用の軽量 replay ではなく、scenario と同じ経路で局面注入して commit している
- その結果、柔軟ではあるが、入力モデルも scenario 並みに rich になっている

### 4. action identity が単純でない

- `positionIndex` がある場合、その位置に現在いる member が優先される
- `characterId` を編集しても、replay 後は別キャラの action として解決されるケースがある
- これは「誰が行動したか」を actor 固定で見たい感覚と噛み合わない

### 5. export される JSON と replay 入力が一致しない

- `exportRecordsJson()` が出すのは `recordStore` のダンプである
- 再計算の正本である `turnPlans` / `turnPlanBaseSetup` は records JSON の export 対象ではない
- つまり「保存されているもの」と「編集再計算に使うもの」が I/O レベルでも分かれている

## 現行方式のメリット

- manual state、enemy status、zone/territory、OD、swap を含めた再現性が高い
- `record` が rich なので、CSV 出力、デバッグ、差分観測に向いている
- scenario と replay/edit の経路を寄せることで、戦闘状態注入の実装を再利用できている

## 現行方式のコスト

- ユーザーの「簡易ターンログを編集して再計算する」期待と実装が一致しない
- action 入力と局面差分入力が同じ turn plan に混ざる
- UI 上は 1 行に見えるが、実体は `plan` と `record` の 2 層であり理解コストが高い
- turn の並び替えや挿入が、単なる順番変更ではなく状態再注入の順番変更になる

## 今後の設計論点

### 維持したい点

- 現行 `record` は破棄しない
- rich な観測ログとしての価値は高く、監査・出力・調査に有用である

### 分離を検討したい点

1. `record` と `replay input` を UI/命名レベルで明確に分ける
2. 将来的に「シンプル編集用の最小 replay script」を別モデルとして持つ
3. action の actor identity を `position` と `characterId` の二重正本にしない
4. `setupDelta` は毎ターン自動保存ではなく、必要な override のみ明示化する方向を検討する

## 調査対象コード

- 初期化と replay base:
  [`../../src/ui/adapter-core.js`](../../src/ui/adapter-core.js)
- state / record / turn plan の保管:
  [`../../src/ui/battle-adapter-facade.js`](../../src/ui/battle-adapter-facade.js)
- turn plan capture / edit / replay:
  [`../../src/ui/dom-adapter.js`](../../src/ui/dom-adapter.js)
- record 組み立て:
  [`../../src/records/record-assembler.js`](../../src/records/record-assembler.js)
- record 編集:
  [`../../src/records/record-editor.js`](../../src/records/record-editor.js)
- record JSON export:
  [`../../src/records/json-exporter.js`](../../src/records/json-exporter.js)
- preview / commit 実体:
  [`../../src/turn/turn-controller.js`](../../src/turn/turn-controller.js)

## 補足

- 本ドキュメントは 2026-03-14 時点のコードスナップショットに基づく
- 今回は調査のみであり、実装変更は行っていない
- 後続の設計案は [`../active/lightweight_record_replay_design.md`](../active/lightweight_record_replay_design.md) を参照

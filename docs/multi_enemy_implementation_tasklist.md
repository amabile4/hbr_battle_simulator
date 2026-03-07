# 複数敵実装タスクリスト

複数敵対応に伴う修正範囲と、未修正箇所の対処順を整理する。

## 現状整理

### 実装済み

- [x] `enemyState` が複数敵前提の状態を保持できる
  - `enemyCount`
  - `statuses[]`
  - `damageRatesByEnemy`
  - `enemyNamesByEnemy`
- [x] 全体攻撃の OD 上昇判定が各敵ごとの耐性を参照する
- [x] `IsWeakElement` が敵ごとのダメージ係数を参照できる
- [x] `Break` / `DownTurn` が敵 index ごとに保持される
- [x] 通常攻撃属性ベルトが OD 判定に反映される
- [x] 作業ツリー上では単体攻撃の `targetEnemyIndex` が UI / turn plan / scenario / OD 判定まで通っている

### 注意

- `targetEnemyIndex` 対応は現時点では未コミット作業を含む
- つまり「複数敵モデルの基盤」はあるが、「記録・表示・検証のしやすさ」はまだ不足している

## Phase 1: 基盤を固める

- [x] 単体攻撃の `targetEnemyIndex` 対応を作業ツリー上で完成させる
- [x] `enemyNamesByEnemy` 保持対応を作業ツリー上で完成させる
- [x] 複数敵対応の現行テストをまとめて再実行する
  - `turn-controller`
  - `dom-adapter`
  - record 系

### Phase 1 実施メモ

- `targetEnemyIndex` は UI / turn plan / scenario / preview / OD 判定まで通過済み
- `enemyNamesByEnemy` は turn state / clone / scenario setup / scenario turn まで保持済み
- 実行済みテスト
  - `node --test tests/turn-state-transitions.test.js`
  - `node --test tests/record-system.test.js`
  - `node --test --test-name-pattern "enemy count in turn controls is reflected in preview record|single-target attack can select enemy target from controls|scenario runner loads setup and executes turns deterministically|enemy down-turn status can be applied and cleared from controls|enemy break status can be applied and cleared from controls" tests/dom-adapter.test.js`
- 残タスクは Phase 2 以降の「記録と可観測性の強化」

## Phase 2: record / export を敵別対応にする

- [x] TurnRecord に `targetEnemyIndex` を明示的に残す
- [x] TurnRecord に敵名参照用の情報を残す
- [x] records table 上で単体攻撃の対象敵を表示する
- [x] CSV export で対象敵を表示する
- [x] action 表示文字列に `Enemy 1/2/3` または敵名を含める

### Phase 2 メモ

- 現状の `enemyCount` だけでは「どの敵を殴ったか」を追えない
- 複数敵検証では record と CSV の可観測性が優先度高
- 現在は `-> Enemy N (Name)` 形式で action 表示に反映
- `enemyNamesByEnemy` は TurnRecord に保持され、records table / CSV から参照される

## Phase 3: ダメージ文脈を敵別モデルへ寄せる

- [x] `damage-calculation-context` に `targetEnemyIndex` を追加する
- [x] `damage-calculation-context` に敵別耐性計算結果を追加する
- [x] 全体攻撃時に `eligibleEnemyIndexes` のような情報を持てるようにする
- [x] 将来のダメージログやパッシブログが敵別文脈を参照できる形にする

### Phase 3 メモ

- 現状は `enemyCount` と hit 集計が中心
- 将来、敵別ダメージ、敵別発火条件、敵名つきログを出すにはここが不足する
- `damageContext` は commit 後の `record.actions[].damageContext` にも保持される
- 保持項目
  - `targetEnemyIndex`
  - `eligibleEnemyIndexes`
  - `effectiveDamageRatesByEnemy`

## Phase 4: UI 入力経路を整える

- [x] 敵名を UI から編集できるようにする
- [x] 敵ごとのダメージ係数を UI 上で確認・編集しやすくする
- [x] 単体攻撃の敵ターゲット選択 UI をさらに検証し、誤操作しづらくする

### Phase 4 メモ

- 敵名は内部状態と scenario JSON からはすでに保持できる
- 通常操作で敵名・敵ダメージ係数を編集できるようにした
- `scenario.setup.enemyDamageRates` / `turn.enemyDamageRates` でも注入可能
- `dom_adapter` はエンジン検証用 UI とし、最終 UX 調整は将来の本番 UI 実装時に行う
- 現状でも敵 1 体時は単体攻撃の敵ターゲット選択を出さないため、不要な操作増加は起きない

## Phase 5: 複数敵前提の仕様レビュー

- [x] パッシブの敵条件評価がすべて敵 index ごとに見られているか再確認する
- [ ] 将来実装のデバフ/バフ/フィールド系が敵ごとに持つべき状態か棚卸しする
- [ ] record 再計算時に複数敵情報が欠落しないか確認する
- [ ] scenario save/load で複数敵情報が往復できるか確認する

### Phase 5 レビュー結果

- 実装済みの敵条件評価
  - `BreakDownTurn`
  - `IsBroken`
  - `IsWeakElement`
  - これらは `enemyState` の `targetIndex` / `damageRatesByEnemy` を参照しており、敵 index ごとに評価される
- 未修正の主な箇所
  - `turnPlan` には `enemyCount` と action の `targetEnemyIndex` は入るが、`enemyNamesByEnemy` と `damageRatesByEnemy` は入っていない
  - そのため `recalculateTurnPlans()` は複数敵の名前・耐性設定を再現しない
  - `toScenarioTurnFromTurnPlan()` にも `enemyNames` / `enemyDamageRates` が出ないため、turn plan 由来の scenario 化では複数敵設定が欠落する
- つまり現状の認識
  - 通常の battle state / preview / commit / record / CSV / loaded scenario では複数敵情報を扱える
  - ただし turn plan の保存・再計算・再構成経路は、まだ複数敵設定を完全には往復できない

### turnPlan 再設計タスク

- [x] `turnPlan` に複数敵状態の入力を保持できるようにする
  - `enemyCount`
  - `enemyNames`
  - `enemyDamageRates`
  - `enemyStatuses`
- [x] `captureCurrentTurnPlanFromDom()` が複数敵設定を取り込めるようにする
- [x] `normalizeTurnPlan()` が複数敵設定を正規化できるようにする
- [x] `toScenarioTurnFromTurnPlan()` が複数敵設定を落とさず scenario turn 化できるようにする
- [x] `recalculateTurnPlans()` が複数敵設定込みで再現できるようにする
- [ ] `turnPlanBaseSetup` に複数敵の初期入力状態を保持できるようにする
- [ ] 将来の passive `timing` 汎用基盤を見据えて、`turnPlan` を `setupDelta` と `actionIntent` に分ける

### turnPlan 再設計メモ

- 複数敵対応だけを見ると `enemyNamesByEnemy` / `damageRatesByEnemy` / `statuses` を turnPlan が持てば足りる
- ただし passive 実装まで含めると、それだけでは足りない
- `OnBattleStart` / `OnFirstBattleStart` / `OnEnemyTurnStart` / `OnAdditionalTurnStart` を再計算可能にするには、「ターン開始前環境」を `turnPlan` が持つ必要がある
- そのため turnPlan の責務は「そのターンのプレイヤー行動」だけでなく「そのターン開始時に成立していた環境差分」まで拡張する前提で考える
- 現在は最小段階として、複数敵環境を `setupDelta` として各 turnPlan に保持し、recalc 時に再適用するところまで実装済み

## 優先順

1. Phase 1: `targetEnemyIndex` / `enemyNamesByEnemy` の基盤コミット
2. Phase 2: record / export の可観測性改善
3. Phase 3: ダメージ文脈の敵別化
4. Phase 4: UI 入力の整備
5. Phase 5: 将来機能を見据えた棚卸し

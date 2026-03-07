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

- [ ] 敵名を UI から編集できるようにする
- [ ] 敵ごとのダメージ係数を UI 上で確認・編集しやすくする
- [ ] 単体攻撃の敵ターゲット選択 UI をさらに検証し、誤操作しづらくする

### Phase 4 メモ

- 敵名は内部状態と scenario JSON からはすでに保持できる
- 通常操作で編集できないため、デバッグ・検証用途としては未完成

## Phase 5: 複数敵前提の仕様レビュー

- [ ] パッシブの敵条件評価がすべて敵 index ごとに見られているか再確認する
- [ ] 将来実装のデバフ/バフ/フィールド系が敵ごとに持つべき状態か棚卸しする
- [ ] record 再計算時に複数敵情報が欠落しないか確認する
- [ ] scenario save/load で複数敵情報が往復できるか確認する

## 優先順

1. Phase 1: `targetEnemyIndex` / `enemyNamesByEnemy` の基盤コミット
2. Phase 2: record / export の可観測性改善
3. Phase 3: ダメージ文脈の敵別化
4. Phase 4: UI 入力の整備
5. Phase 5: 将来機能を見据えた棚卸し

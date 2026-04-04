# 割込OD時 OnEnemyTurnStart 二重発火の潜在問題

**ステータス**: ✅ 完了
**発見日**: 2026-04-03
**対応日**: 2026-04-05
**発見経緯**: SP回復二重適用バグ修正 (83335d3) のレビュー中に確認

---

## 問題の概要

`commitTurn` 内で割込OD（interruptOdLevel）を発動する場合、`OnEnemyTurnStart` パッシブが同一ベースターン進行に対して2回発火する可能性がある。

## 原因

`commitTurn` の処理順序に起因する:

1. `computeNextTurnState(T1normal)` → T2normal（turnIndex=2）を返す
2. **L10160**: `nextTurnState.turnIndex(2) > state.turnState.turnIndex(1)` → `OnEnemyTurnStart` 発火
3. **L10201**: 割込OD turnIndex 補正で `nextTurnState.turnIndex = 1` に戻す
4. `activateOverdrive` → OD状態へ

OD完了後の commitTurn（OD→T2normal）で:

5. `computeNextTurnState(OD, interrupt)` → T2normal（turnIndex=2）
6. **L10160**: `turnIndex(2) > turnIndex(1)` → `OnEnemyTurnStart` **再度発火**

ステップ2の発火は、turnIndex 補正（ステップ3）よりも前に実行されるため、OD差し込み中にもかかわらず発火してしまう。

## 影響範囲

- `OnEnemyTurnStart` タイミングで発火するパッシブ（HealDpRate 等）が割込OD発動コミット時に余分に1回発火する
- 同様に L10148 の `passiveTurnFiredKeys` リセットも早期に走るが、OD→normal 遷移時に再リセットされるため実害は小さい

## 修正前の影響度

- **低**: 現時点で `OnEnemyTurnStart` パッシブを持つキャラクターが割込OD と組み合わさるシナリオは限定的
- SP回復の二重適用は 83335d3 で修正済み（turnIndex ベースの判定に変更）であり、回復に関する実害はない

## 採用した修正方針

`computeNextTurnState` 自体は変更せず、`commitTurn` 内で「次のベースターンが実際に開始するか」を `nextBaseTurnAdvances` として明示し、以下の境界処理を割込OD中は実行しないように修正した。

- `passiveTurnFiredKeys` リセット
- `OnEnemyTurnStart` 発火

これにより、「割込OD差し込みコミットではまだベースターンは進んでいない」というモデルに処理を一致させ、OD完了後の normal 復帰時にのみ `OnEnemyTurnStart` が 1 回だけ発火するようになった。

```js
const nextBaseTurnAdvances =
  !shouldActivateInterruptOd && Number(nextTurnState.turnIndex ?? 0) > Number(state.turnState.turnIndex ?? 0);

if (nextBaseTurnAdvances) {
  nextTurnState.passiveTurnFiredKeys = [];
  // OnEnemyTurnStart ...
}
```

## 実装内容

- [src/turn/turn-controller.js](../src/turn/turn-controller.js)
  - `nextBaseTurnAdvances` を導入
  - 割込OD発動コミットでは `passiveTurnFiredKeys` リセットを行わないよう修正
  - 割込OD発動コミットでは `OnEnemyTurnStart` を発火させないよう修正
- [tests/turn-state-transitions.test.js](../tests/turn-state-transitions.test.js)
  - `interrupt OD does not fire OnEnemyTurnStart until OD completes` を追加
  - 1回目の commitTurn では `OnEnemyTurnStart` が 0 件、OD→normal の 2回目で 1 件だけ発火し、`HealDpRate` が 1 回分だけ適用されることを固定

## 検証

- `node --test --test-name-pattern="interrupt OD|OnEnemyTurnStart HealDpRate" tests/turn-state-transitions.test.js`
  - 7 tests passed
- `node --test tests/turn-state-transitions.test.js`
  - 全件 pass

## 関連コード

- [src/turn/turn-controller.js](../src/turn/turn-controller.js) — `commitTurn` の next turn boundary 判定
- [tests/turn-state-transitions.test.js](../tests/turn-state-transitions.test.js) — 割込OD時の `OnEnemyTurnStart` 単発発火回帰テスト

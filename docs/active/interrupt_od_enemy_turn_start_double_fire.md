# 割込OD時 OnEnemyTurnStart 二重発火の潜在問題

**ステータス**: 🟢 未着手（優先度低）
**発見日**: 2026-04-03
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

## 現在の影響度

- **低**: 現時点で `OnEnemyTurnStart` パッシブを持つキャラクターが割込OD と組み合わさるシナリオは限定的
- SP回復の二重適用は 83335d3 で修正済み（turnIndex ベースの判定に変更）であり、回復に関する実害はない

## 修正方針（案）

L10160 の `OnEnemyTurnStart` 発火判定を、割込OD turnIndex 補正（L10201）の**後**に移動する。
または、L10160 の条件に `!shouldActivateInterruptOd` ガードを追加する。

```js
// 案1: shouldActivateInterruptOd ガード追加
if (!shouldActivateInterruptOd && Number(nextTurnState.turnIndex ?? 0) > Number(state.turnState.turnIndex ?? 0)) {
  // OnEnemyTurnStart ...
}

// 案2: ブロックごと L10201 の後に移動（他の処理順への影響を要検証）
```

## 関連コード

- [src/turn/turn-controller.js:10160](../src/turn/turn-controller.js) — OnEnemyTurnStart 発火箇所
- [src/turn/turn-controller.js:10197-10205](../src/turn/turn-controller.js) — 割込OD turnIndex 補正
- [src/turn/turn-controller.js:10148](../src/turn/turn-controller.js) — passiveTurnFiredKeys リセット（同様の順序問題）

# P3-05 コードレビュー: TurnEnd shouldConsume 経路移行

**対象実装**: P3-05（TurnEnd 消費経路を `shouldConsume()` 経由へ移行）
**初回レビュー**: 2026-03-31（FIND-1〜3 指摘）
**再レビュー**: 2026-03-31（FIND-1〜3 全対応確認）
**ステータス**: ✅ コミット・プッシュ可

---

## 再レビュー結果（2026-03-31）

**判定: 全 FIND 対応済み。新規問題なし。コミット・プッシュ可。**

| FIND | 内容 | 対応状況 |
|------|------|---------|
| FIND-1 | exitCond 冗長プレフィルタ | ✅ 削除済み |
| FIND-2 | remaining=0 時の legacy fallback 意図が不明確 | ✅ コメント追記済み |
| FIND-3 | unit test が buildActionContext を非経由 | ✅ 新テスト追加済み |

### FIND-1 確認

`applyTurnBasedStatusExpiry`（L7171〜7194）・`applyEnemyTurnEndDpEffects`（L3064〜3113）の両方でプレフィルタ削除を確認：

```javascript
// applyTurnBasedStatusExpiry — 現在の predicate
(effect) => shouldConsume(effect, actionContext).shouldConsume

// applyEnemyTurnEndDpEffects — 現在の predicate
(effect) => shouldConsume(effect, actionContext).shouldConsume
```

安全性確認: `shouldConsume` は `turnPhase: 'PlayerTurnEnd'` / `'EnemyTurnEnd'` コンテキストで以下を正しく false にする。
- `exitCond: 'Count'` → `shouldConsumeCountType` で `actionType: 'TurnEnd'` は damage-action list に非該当 → false
- 反対 phase の exitCond（例: EnemyTurnEnd context で PlayerTurnEnd exitCond）→ phase 不一致 → false
- `exitCond: 'Eternal'` → false
- 未知 exitCond → `'Unknown exitCond'` → false

**挙動は等価。**

補足: `applyEnemyTurnEndDpEffects` 内の `resolveEffectiveStatusEffects('RegenerationDp').filter(exitCond === 'EnemyTurnEnd')` は残存しているが、これは DP 回復イベントの lookup map 構築用で tick predicate とは別の処理。削除対象ではない。

### FIND-2 確認

`shouldTickEnemyStatusOnTiming`（L4413〜4444）の legacy fallback 前にコメント追加を確認：

```javascript
// Unknown/legacy exitCond は既存挙動を維持する（PlayerTurnEnd 以外は enemy timing で減算）。
// ここでは remaining<=0 の known exitCond でも fallback が true になる可能性があるが、
// 実際の削除可否は tickEnemyStatusDurations 側の remainingTurns 判定で従来どおり決定される。
```

意図が明確に記述されている。

### FIND-3 確認

`buff-consumption-orchestrator.test.js` に `buildActionContext` 経由のテストを確認（L106〜116）：

```javascript
test('buildActionContext(TurnEnd)で生成したcontextでもEnemyTurnEnd型を消費判定できる', () => {
  const context = buildActionContext('TurnEnd', null, { turnPhase: 'EnemyTurnEnd' });
  const result = shouldConsume(effect, context);
  assert.equal(result.shouldConsume, true);
});
```

既存のインライン直書きテスト（L70〜104）は残存しており、phase 不一致シナリオのカバレッジを維持している。追加・置換の両立として問題なし。

---

## 初回レビュー内容（参考）

### 初回レビュー時の指摘①: applyTurnBasedStatusExpiry/applyEnemyTurnEndDpEffects の冗長なプレフィルタ【低】

当時の predicate:

```javascript
String(effect?.exitCond ?? '') === 'PlayerTurnEnd' &&   // 冗長だった
shouldConsume(effect, actionContext).shouldConsume
```

→ **対応済み（FIND-1）**

---

### 初回レビュー時の指摘②: shouldTickEnemyStatusOnTiming — remaining=0 時のフォールバック挙動【中】

`remainingTurns=0` で `shouldConsume` が false を返した後、legacy fallback が true を返す経路があった。旧コードの挙動保存として意図的だが、意図が不明瞭だった。

→ **対応済み（FIND-2）**: コメント追記で解消

---

### 初回レビュー時の指摘③: ユニットテストが buildActionContext を経由していない【低】

TurnEnd 系テストが `shouldConsume` にインラインオブジェクトを直接渡しており、`buildActionContext` との契約整合が未担保だった。

→ **対応済み（FIND-3）**: 新テスト追加で解消

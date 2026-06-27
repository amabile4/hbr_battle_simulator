# 条件式評価器 入出力契約

> 作成日: 2026-06-27
> 対象モジュール: `golden/src/cond-evaluator.js`
> 文法定義: [cond_grammar_spec.md](cond_grammar_spec.md)

## 1. 概要

`evaluateCondition(expression, context)` は条件式文字列をパース + 評価し、
boolean 結果を返す統合エントリポイント。既存 `src/turn/turn-controller.js` の
`evaluateConditionExpression(expr, state, member, skill, actionEntry)` と同じ粒度だが、
構造化された `ConditionContext` を受け取る点が異なる。

「未知の述語」「コンテキスト不足」は**安全側（value: true）で fallback する**既存挙動を維持。
これは「分からない条件は発動を止めない」ことでゲーム体験を壊さないため。

## 2. 入力: ConditionContext

```js
{
  state:  {                  // ターン全体の状態
    turnIndex,               // Turn() 述語の値
    odGauge,                 // OverDriveGauge() 述語の値
    zone,                    // IsZone(X) 述語の値（Fire/Ice/Thunder/Dark/Light/Nonelement）
    territory,               // IsTerritory(X) 述語の値
    talismanActive,          // (将来) 霊符状態
    isOverDrive,             // IsOverDrive() の真偽
  },
  member: {                  // 評価対象キャラクター（CountBC 内では各キャラに差し替え）
    sp:    { current },      // Sp() 述語
    ep:    { current },      // Ep() 述語
    dpRate,                  // DpRate() 述語
    token: { current },      // Token() 述語
    morale: { current },     // MoraleLevel() 述語
    motivation: { current }, // MotivationLevel() 述語
    markStates: { Fire: {current}, Ice:{current}, ... }, // FireMarkLevel 等
    position,                // IsFront() 判定（<=2 で前衛）
    isAlive,                 // IsDead() 判定
    isBreak,                 // IsBroken() 判定
    isShredding,             // IsShredding() 判定
    isReinforcedMode,        // IsReinforcedMode() 判定
    isPlayer,                // IsPlayer() 判定（CountBC 内で player/enemy 区別）
    specialStatuses,         // SpecialStatusCountByType(ID) のマップ（Map または連想配列）
    characterId,             // IsCharacter(X) 述語
    team,                    // IsTeam(X) 述語
    elements,                // IsNatureElement(X) 述語（配列）
    weaponElement,           // IsWeaponElement(X) 述語
    role,                    // IsRole(X)/IsAttacker() 等
    isAttackNormal,          // IsAttackNormal() 判定
    isApplyLearning,         // IsApplyLearning() 判定
    debuffIconCount,         // DebuffIconCount() 述語
    hasSkill(label),         // HasSkill(X) 述語（関数）
    getSkillUseCountByLabel(label), // PlayedSkillCount(X) 述語（関数）
  },
  skill:  {                  // 使用スキル
    label,                   // PlayedSkillCount() のデフォルト参照先
    tier,                    // Random() 述語の tier 別既定値
    spCost,                  // ConsumeSp() 述語
    element,                 // IsHitWeak() 判定用
    isNormalAttack,          // IsAttackNormal() 判定
  },
  action: {                  // 現在アクションの文脈
    breakHitCount,           // BreakHitCount() 述語
    removeDebuffCount,       // RemoveDebuffCount() 述語
    targetEnemyIndex,        // TargetBreakDownTurn() 等の参照先
  },
  target: {                  // ターゲット（敵）の状態
    isWeakToElement(el),     // IsWeakElement(X)/IsHitWeak() 関数
    isTargetWeakNatureElement(el), // IsTargetWeakNatureElement(X) 関数
    damageRate,              // DamageRate() 述語
    breakDownTurn,           // BreakDownTurn()/TargetBreakDownTurn() 述語
    isBroken,                // （将来）
    isDead,                  // （将来）
    isCharging,              // IsEnemyCharge() 述語
    debuffIconCount,         // ターゲット側の DebuffIconCount
  },
  party:   [member, ...],    // CountBC player 側反復用
  enemies: [enemy, ...],     // CountBC enemy 側反復用
}
```

`createEmptyContext(overrides)` で安全なデフォルト付きコンテキストを生成可能。

## 3. 出力: EvaluationResult

```js
{
  result: boolean,           // || / && / 比較 の最終結果
  knownCount: number,        // 評価できた clause 数
  unknownCount: number,      // 未対応述語で安全側 fallback した数
  ok: boolean,               // パース成功可否
  parseError?: string,       // ok=false 時の構文エラーメッセージ
  trace?: TraceEntry[],      // collectTrace=true 時のデバッグ用トレース
}
```

`isFullyResolved(evaluation)` で `unknownCount === 0`（全述語解決済み）か判定可能。

## 4. 安全側 fallback の挙動

| 状況 | 挙動 |
|---|---|
| 空式 `''` | `{result: true}` |
| 構文エラー | `{result: true, ok: false, parseError}` |
| 未知の述語 | clause を `true` 扱い、`unknownCount += 1` |
| HasSkill/IsWeakElement で関数未定義 | `{known: false}` で fallback |
| CountBC 内側式が未解決 | 内側評価自体は続行、`unknownCount` 累積 |

本プロジェクトの golden データ318式は**全て完全解決**（unknownCount=0）を確認済み。
未知の述語が実データに存在しないことを意味する。

## 5. 既存 turn-controller との対応

| 既存（turn-controller） | 本モジュール |
|---|---|
| `evaluateConditionExpression(expr, state, member, skill, actionEntry)` | `evaluateCondition(expr, context)` |
| `evaluateSingleConditionClause(clause, ...)` | `resolvePredicate` + AST 評価 |
| `resolveZeroArgConditionValue(name, ...)` | `resolvePredicate(name, [], ctx)` |
| `compareNumbers(left, op, right)` | 内部 `compareNumbers`（同等） |
| `evaluateCountBCPredicate(inner, ...)` | `resolveCountBc(node, ctx)` |

本体統合時は `ConditionContext` への変換アダプタを挟むことで移行可能。

## 6. 依存関係と移植ガイド

### 評価コアはデータソース非依存

以下のモジュールは **master_json / view_json どちらにも依存しない純粋関数**で、
任意の `cond`/`overwrite_cond` 文字列と `ConditionContext` だけで動作する:

| モジュール | 依存 | 本体移植 |
|---|---|---|
| `cond-parser.js` | なし（文字列→AST） | ✅ そのまま |
| `cond-evaluator.js` | `cond-parser.js` のみ | ✅ そのまま |
| `special-status-types.js`（評価関数） | なし（`DEFAULT_SPECIAL_STATUS_TYPES` 定数内包） | ✅ そのまま |

### データソースの使い分け

| ソース | 用途 | 本体移植に必要か |
|---|---|---|
| `view_json/` / `json/` | **本体が実際に読む運用データ**。フィールド名 `cond`/`overwrite_cond` そのまま | ✅ **必須** |
| `master_json/` | 正本（全スキル/パッシブ/能力の完全カバレッジ）。分析・回帰テスト用 | ❌ 不要（オプション） |

### 移植手順（master_json を使わず view/json のみで完結）

1. `cond-parser.js`, `cond-evaluator.js`, `special-status-types.js` を `src/` へコピー
2. 既存 `src/turn/turn-controller.js` の `evaluateConditionExpression(expr, state, member, skill, actionEntry)` を、
   `state`/`member`/`skill`/`actionEntry` → `ConditionContext` へ変換するアダプタ経由で
   `evaluateCondition(expr, context)` に置換
3. 条件式は `json/`（view_json と同内容）の `cond`/`overwrite_cond` フィールドをそのまま渡す
4. `master_json` 配下のファイルは読み込まない（`cond-extract.js` の master 用 API は移植不要）

### 検証済み: view_json 単体で完結

`conditions-fixture-view.test.js` が、**master_json を一切読まずに** view_json 由来の全条件式を
パース+評価できることを証明している（`extractConditionsFromViewJson()` 使用）。

## 7. 関連

- `golden/src/cond-evaluator.js` — 実装
- `golden/src/cond-parser.js` — パーサー（AST 生成）
- `golden/src/cond-extract.js` — 抽出（view/master 両対応）
- `golden/tests/cond-evaluator.test.js` — 単体テスト（29件）
- `golden/tests/conditions-fixture.test.js` — master 由来全318式の golden 評価テスト
- `golden/tests/conditions-fixture-view.test.js` — **view_json 由来の移植可能性証明テスト（master 非依存）**

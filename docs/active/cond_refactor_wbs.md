# cond/overwrite_cond リファクタ WBS

> ブランチ: `feature/cond-refactor-ast`  
> 作成日: 2026-06-27  
> 方針策定: Claude Code  
> 実装担当: Codex / Gemini / GLM（各タスクに明記）  
> レビュー/統合判断: Claude Code

---

## 概要

`src/turn/turn-controller.js` の `cond`/`overwrite_cond` 評価を、正規表現アドホック処理から
`golden/src/cond-parser.js` + `golden/src/cond-evaluator.js` の AST評価器に移行するプロジェクト。

### 解消するハードコード

| ハードコード | 位置 | 問題 |
|---|---|---|
| `parseConditionFlags` の3正規表現 | `src/data/hbr-data-store.js:167-177` | `||`/否定との組み合わせで誤判定リスク |
| `hasSpGreaterOrEqualZeroCondition` 正規表現 | `src/turn/turn-controller.js:10922` | `0<=Sp()` 形式を検出できない |
| `evaluateCountBCPredicate` の文字列ハードコード | `src/turn/turn-controller.js:6357-6451` | 特定パターンのみ対応、拡張困難 |
| `IMPLEMENTED_SPECIAL_STATUS_TYPES` ハードセット | `src/turn/turn-controller.js:9099` | 新規 typeId 追加のたびに手動更新が必要 |

### ゴール

- `evaluateConditionExpression` の全30箇所をアダプタ経由で AST 評価器に置き換え
- ハードコード4箇所をすべて排除
- 全既存テスト（npm test）が PASS を維持
- 述語カバレッジを現在の約40種から **51種** に拡大

---

## ギャップ分析（詳細）

### A. golden 評価器が追加でカバーする述語（既存 = unknown fallback）

| 述語 | golden の扱い | 移植時の注意 |
|---|---|---|
| `DebuffIconCount()` | `member.debuffIconCount` | 既存memberに追加が必要 |
| `IsEnemyCharge()` | `target.isCharging` | ターゲット（敵）のcharge状態 |
| `IsApplyLearning()` | `member.isApplyLearning` | 既存memberに追加が必要 |
| `IsAttacker()`/`IsBlaster()`等7種 | `member.role === 'Attacker'` 等 | 既存memberの`role`フィールドを使用 |
| `IsRole(X)` | `member.role === X` | 同上 |
| `IsWeaponElement(X)` | `member.weaponElement` | 既存memberに追加が必要 |
| `IsTargetWeakNatureElement(X)` | `target.isTargetWeakNatureElement(el)` | ターゲット関数が必要 |
| `BreakDownTurn()` | `target.breakDownTurn` | 既存では `TargetBreakDownTurn()` のみ対応 |
| `SpecialStatusIconCountByType(X)` | `member.specialStatuses` Map | 既存では未対応 |
| `IsPlayer()` | `member.isPlayer` | CountBC内で既存対応。単体は unknown |

### B. 既存に存在して golden に**ない**（追加が必要）

| 述語 | 既存の扱い | golden への追加方法 |
|---|---|---|
| `IsTalisman()` | `getTalismanState(state.turnState).active` | `context.state.talismanActive` として渡し、`resolvePredicate` に case追加 |

### C. データ構造の差異（アダプタで吸収が必要）

| 差異 | 既存 | golden が期待する形 |
|---|---|---|
| specialStatus の持ち方 | `member.statusEffects: [{metadata.specialStatusTypeId, exitCond, remaining}]` | `member.specialStatuses: Map<typeId, count>` または `{[typeId]: count}` |
| 敵データの CountBC 反復 | `state.turnState.enemyState` をインデックスで参照 | `context.enemies: [{isPlayer:false, ...}, ...]` の配列 |
| ゾーン非アクティブ | `getZoneState(state.turnState)` が非アクティブオブジェクト | `context.state.zone = 'None'` とする（文字列 'None'） |

### D. CountBC の大きな変化

| 観点 | 既存 `evaluateCountBCPredicate` | golden `resolveCountBc` |
|---|---|---|
| player側 | `state.party` を反復 | `context.party` を反復 |
| enemy側 | `evaluateEnemyCountBcClause` で別経路 | `context.enemies` を反復、同一評価器で処理 |
| IsPlayer()判定 | `inner.includes('IsPlayer()==0')` で分岐 | `member.isPlayer`で各memberが判断 |
| 特殊ケース | 6件のハードコード文字列マッチ | 完全汎用 |

---

## フェーズ定義

```
Phase 0 ✅  準備・初期コミット（完了）
Phase 1     コアモジュール配備 + IsTalisman補完
Phase 2     ConditionContext アダプタ層実装
Phase 3     parseConditionFlags → AST走査置き換え
Phase 4     hasSpGreaterOrEqualZeroCondition 廃止
Phase 5     evaluateCountBCPredicate → golden CountBC 統合
Phase 6     IMPLEMENTED_SPECIAL_STATUS_TYPES 廃止
Phase 7     不要コード削除・最終回帰テスト
```

---

## Phase 0: 準備（完了）✅

| タスク | 担当 | 状態 |
|---|---|---|
| P0-1: ブランチ `feature/cond-refactor-ast` 作成 | Claude Code | ✅ |
| P0-2: golden/src + tests + docs を初期コミット | Claude Code | ✅ |
| P0-3: ギャップ分析ドキュメント作成 | Claude Code | ✅ |
| P0-4: 本 WBS 作成 | Claude Code | ✅ |

---

## Phase 1: コアモジュール配備 + IsTalisman補完

**目標**: `src/engine/` に評価コアを配置し、テスト可能な状態にする。

**担当: Codex**

| タスク | 詳細 |
|---|---|
| P1-1: ファイルコピー | `golden/src/cond-parser.js` → `src/engine/cond-parser.js` / `golden/src/cond-evaluator.js` → `src/engine/cond-evaluator.js` |
| P1-2: IsTalisman() 追加 | `src/engine/cond-evaluator.js` の `resolvePredicate` に `case 'IsTalisman': return { known: true, value: context.state?.talismanActive ? 1 : 0 };` を追加 |
| P1-3: package.json に export 追加 | `src/engine/index.js`（新規）から `cond-parser.js` / `cond-evaluator.js` を export |
| P1-4: 単体テストをコピー | `golden/tests/cond-parser.test.js` / `cond-evaluator.test.js` を `tests/engine/` へコピーし、import パスを修正 |
| P1-5: `npm test` 全通過確認 | コピー後の tests/ で 29+26=55テスト PASS を確認 |

**受け入れ基準**:
- `node --test tests/engine/cond-parser.test.js tests/engine/cond-evaluator.test.js` が全 PASS
- `IsTalisman()==1` の評価が `context.state.talismanActive=true` で `result:true` を返す
- 既存 `npm test` が PASS を維持

---

## Phase 2: ConditionContext アダプタ層実装

**目標**: 既存の `(state, member, skill, actionEntry)` 引数を `ConditionContext` に変換するアダプタを1箇所に実装する。これが本移植の最難関。

**担当: Codex**（アダプタ本体） / **Gemini**（enemy member オブジェクト生成）

### P2-1: specialStatuses Map 変換（Codex担当）

```js
// src/engine/condition-context-adapter.js（新規）に実装

function buildSpecialStatusesMap(member) {
  // 既存 member.statusEffects 配列 → Map<typeId, 0|1> に変換
  const map = new Map();
  for (const effect of member?.statusEffects ?? []) {
    const typeId = Number(effect?.metadata?.specialStatusTypeId ?? 0);
    if (!typeId) continue;
    const isActive =
      String(effect?.exitCond ?? '') === 'Eternal'
        ? true
        : Number(effect?.remaining ?? 0) > 0;
    if (isActive) {
      map.set(typeId, (map.get(typeId) ?? 0) + 1);
    }
  }
  return map;
}
```

### P2-2: enemy member オブジェクト生成（Gemini担当）

`context.enemies` に渡す敵オブジェクト配列を生成する。
敵は `state.turnState.enemyState.enemies[idx]` から読み取る。

```js
function buildEnemyMember(state, targetIndex) {
  // 各enemyをgoldenのmember形式に変換
  // CountBC内で IsPlayer()==0 を処理するため isPlayer: false が必須
  return {
    isPlayer: false,
    position: 99,          // 敵は後衛扱い
    isAlive: !isEnemyDead(state.turnState, targetIndex),
    isBreak: isEnemyInBreakDown(state.turnState, targetIndex),
    specialStatuses: buildEnemySpecialStatusesMap(state, targetIndex),
    characterId: '',       // 敵はcharacterIdなし
    elements: getEnemyElements(state.turnState, targetIndex),
    // ... 必要に応じて追加
  };
}
```

### P2-3: buildConditionContext 本体（Codex担当）

```js
export function buildConditionContext(state, member, skill, actionEntry) {
  const targetEnemyIndex = getConditionTargetEnemyIndex(state, skill, actionEntry);
  const zoneState = getZoneState(state?.turnState);
  const territoryState = getTerritoryState(state?.turnState);

  return {
    state: {
      turnIndex: Number(state?.turnState?.turnIndex ?? 1),
      odGauge: Number(state?.turnState?.odGauge ?? 0),
      zone: isFieldStateActive(zoneState) ? String(zoneState?.type ?? '') : 'None',
      territory: isFieldStateActive(territoryState) ? String(territoryState?.type ?? '') : 'None',
      isOverDrive: isOverDriveActive(state?.turnState),
      talismanActive: getTalismanState(state?.turnState).active,
    },
    member: buildPlayerMember(member),
    skill: buildSkillContext(skill),
    action: {
      breakHitCount: Number(actionEntry?.breakHitCount ?? 0),
      removeDebuffCount: Number(actionEntry?.removeDebuffCount ?? 0),
      targetEnemyIndex,
    },
    target: buildTargetContext(state, targetEnemyIndex),
    party: (state?.party ?? []).map(buildPlayerMember),
    enemies: buildEnemiesArray(state),
  };
}
```

### P2-4: evaluateConditionExpression ラッパー（Codex担当）

```js
// 既存の呼び出し側は変更不要（同名で上書き）
export function evaluateConditionExpression(expression, state, member, skill, actionEntry = null) {
  const ctx = buildConditionContext(state, member, skill, actionEntry);
  const result = evaluateCondition(expression, ctx);
  return { result: result.result, knownCount: result.knownCount, unknownCount: result.unknownCount };
}
```

**受け入れ基準**:
- `evaluateConditionExpression('Sp()>=0', state, member, skill, null)` が既存実装と同一結果を返す
- CountBC を含む式（`CountBC(IsPlayer()==1&&SpecialStatusCountByType(25)>0)>0`）が正しく評価される
- `npm test` 全通過

---

## Phase 3: parseConditionFlags → AST走査置き換え

**目標**: `src/data/hbr-data-store.js` の `parseConditionFlags` を正規表現から AST走査に変更する。

**担当: GLM**

### P3-1: AST走査版 parseConditionFlags（GLM担当）

```js
// src/data/hbr-data-store.js の parseConditionFlags を以下に置き換える

import { parseCondition } from '../engine/cond-parser.js';

function parseConditionFlags(expression) {
  const text = String(expression ?? '');
  if (!text) return { excludesExtraTurn: false, requiresOverDrive: false, requiresReinforcedMode: false };

  const parsed = parseCondition(text);
  if (!parsed.ok) return { excludesExtraTurn: false, requiresOverDrive: false, requiresReinforcedMode: false };

  return {
    excludesExtraTurn: hasExcludesExtraTurnPattern(parsed.ast),
    requiresOverDrive: hasPredicateInAst(parsed.ast, 'IsOverDrive'),
    requiresReinforcedMode: hasPredicateInAst(parsed.ast, 'IsReinforcedMode'),
  };
}

// SpecialStatusCountByType(20)==0 を意味的に検出する
function hasExcludesExtraTurnPattern(ast) {
  return walkAndCheck(ast, (node) => {
    return (
      node.type === 'compare' &&
      node.op === '==' &&
      node.left?.type === 'call' &&
      node.left?.name === 'SpecialStatusCountByType' &&
      node.left?.args?.[0]?.value === 20 &&
      node.right?.type === 'number' &&
      node.right?.value === 0
    );
  });
}
```

**注意**: 実装前に Claude Code に設計確認を仰ぐこと。
`hasExcludesExtraTurnPattern` の意味論が現行の正規表現と一致するかを確認する必要がある。

**受け入れ基準**:
- `parseConditionFlags('IsOverDrive()')` → `{ requiresOverDrive: true, ... }`
- `parseConditionFlags('IsOverDrive() || IsReinforcedMode()')` → 両方 true（既存の正規表現より正確）
- `npm test` 全通過

---

## Phase 4: hasSpGreaterOrEqualZeroCondition 廃止

**目標**: `turn-controller.js:10922` の正規表現判定を廃止または AST評価に変更。

**担当: GLM**

### 現状の役割確認（CLaudeCode確認済み）

`hasSpGreaterOrEqualZeroCondition` はプレビューレコードに格納され、SP不足警告の表示制御に使われている。
廃止時は「代替: `evaluateConditionExpression('Sp()>=0', ...)` で代替可能か」を確認する。

### P4-1: 廃止方針の選択（GLM担当、Claude Code に確認）

**Option A（推奨）**: `hasSpGreaterOrEqualZeroCondition` フィールドを削除し、呼び出し元の警告ロジックを
`evaluateConditionExpression('Sp()>=0', ...)` の結果で代替する。

**Option B**: AST走査で `Sp() >= 0` を意味的に検出する関数に置き換える。

実装前に Claude Code に方針を確認すること。

---

## Phase 5: evaluateCountBCPredicate → golden CountBC 統合

**目標**: `evaluateCountBCPredicate` の文字列ハードコード6件を排除し、golden の汎用 CountBC 評価に統合する。
これは Phase 2 の完成後に実施する（アダプタ層が必要）。

**担当: Gemini**

### P5-1: enemy member 配列の検証（Gemini担当）

Phase 2 で実装した `buildEnemiesArray` が CountBC の敵反復で正しく機能するか、
以下のテストケースで確認する:

```js
// テストケース
'CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(12)>0)>0'
'CountBC(IsPlayer()==0&&IsDead()==0&&IsWeakElement(Fire)==1)>0'
```

### P5-2: 既存ハードコード削除（Gemini担当）

以下の特殊ケースを削除し、汎用評価で代替できることを確認:

```js
// 削除対象（turn-controller.js:6364-6392）
if (inner === 'IsPlayer()') { ... }
if (inner === 'IsFront()==0&&IsPlayer()') { ... }
if (inner === EXTRA_ACTIVE_COUNT_BC_GT_ZERO) { ... }
if (inner === EXTRA_ACTIVE_COUNT_BC_GE_ONE) { ... }
if (inner === EXTRA_ACTIVE_COUNT_BC_EQ_ZERO) { ... }
if (inner === 'PlayedSkillCount(FMikotoSkill04)>0') { ... }
```

**注意**: `SpecialStatusCountByType(20)` (=isExtraActive) のマッピングが
`buildSpecialStatusesMap` に含まれているか確認すること。
既存では `member.isExtraActive` で判定しているが、golden では `specialStatuses.get(20)` で読む。

**受け入れ基準**:
- `npm test` の CountBC テスト（`tests/turn-state-transitions.test.js` のoverwrite_condテスト群）が全通過
- `tests/turn-state-transitions.test.js:2651行目` 付近の `overwrite_cond` CountBC テストが通過

---

## Phase 6: IMPLEMENTED_SPECIAL_STATUS_TYPES 廃止

**目標**: `src/turn/turn-controller.js:9099` の手動管理ホワイトリストを廃止する。

**担当: Codex**

### P6-1: メンバー specialStatuses Map への移行（Codex担当）

Phase 2 の `buildSpecialStatusesMap` が完成していれば、`SpecialStatusCountByType(X)` は
Map.get(X) でいつでも正確な値が得られる。
`IMPLEMENTED_SPECIAL_STATUS_TYPES.has(typeId)` のガードを削除し、全typeIdをMap参照に変更。

**受け入れ基準**:
- `SpecialStatusCountByType(999)` のような未実装IDで `known:false` ではなく `known:true, value:0` を返す
- 既存テストの `unknownCount > 0` に依存しているケースがないか確認

---

## Phase 7: 不要コード削除・最終回帰テスト

**目標**: 旧正規表現・旧評価関数を完全削除し、技術的負債ゼロを確認。

**担当: Claude Code（確認） + Codex（実行）**

| タスク | 内容 |
|---|---|
| P7-1: 旧正規表現定数の削除 | `FUNCTION_COMPARISON_CONDITION_RE` 等6本の正規表現定数を削除 |
| P7-2: `evaluateSingleConditionClause` 削除 | アダプタ経由で不要になった旧評価関数を削除 |
| P7-3: `evaluateCountBCPredicate` 削除 | Phase 5 完了後に削除 |
| P7-4: `EXTRA_ACTIVE_COUNT_BC_*` 定数削除 | ハードコード文字列定数を削除 |
| P7-5: 最終 `npm test` 全通過確認 | 全テストスイート通過を確認 |
| P7-6: E2E テスト確認 | `npm run test:e2e` 通過を確認 |
| P7-7: git push & PR作成 | `feature/cond-refactor-ast` → main へ PR |

---

## 役割定義

### Claude Code（方針策定・レビュー）

- **担当**: Phase 0（完了）、各フェーズの仕様書作成、コードレビュー、統合判断
- **権限**: アーキテクチャ決定、方針変更の承認
- **コミュニケーション**: 各フェーズ開始前に実装AIへ指示書を発行。完了後にレビューを実施
- **ノールック作業不可箇所**: Phase 4（廃止方針）、Phase 5（CountBC統合）の設計決定

### Codex（主要実装）

- **担当**: Phase 1（コアコピー＋IsTalisman）、Phase 2（アダプタ本体）、Phase 6（SpecialStatus廃止）、Phase 7（削除）
- **得意**: 仕様に従った正確な実装、ユニットテスト作成
- **制約**: 設計判断は Claude Code に確認してから実装すること

### Gemini（CountBC・敵オブジェクト担当）

- **担当**: Phase 2 の P2-2（enemy member 生成）、Phase 5（CountBC統合）
- **得意**: 複雑な変換ロジック、副作用のある処理
- **制約**: `evaluateEnemyCountBcClause` の正確な挙動を理解してから移行すること

### GLM（正規表現置き換え担当）

- **担当**: Phase 3（parseConditionFlags AST版）、Phase 4（hasSpGreaterOrEqualZeroCondition廃止）
- **得意**: パターン変換、AST走査ロジック
- **制約**: Phase 3/4 はいずれも実装前に Claude Code への確認フローを経ること

---

## 実装順序・依存関係

```
Phase 0 ✅
  └── Phase 1 (Codex) ─────── 単独実行可能
        └── Phase 2 (Codex+Gemini) ── Phase 1 完了後
              ├── Phase 3 (GLM) ────── Phase 2 完了後（独立実行不可）
              ├── Phase 4 (GLM) ────── Phase 2 完了後（Claude Code確認必須）
              └── Phase 5 (Gemini) ─── Phase 2 完了後（最難関）
                    └── Phase 6 (Codex) ── Phase 5 完了後
                          └── Phase 7 (Codex+Claude Code) ── 全完了後
```

Phase 1 と Phase 3/4 の一部は並列実行可能だが、
**Phase 2 は全フェーズのブロッカー**であり最優先で完成させること。

---

## 進捗管理

各フェーズ完了時に本ドキュメントのチェックを更新すること。

| フェーズ | 担当 | 状態 | 完了確認 |
|---|---|---|---|
| Phase 0 | Claude Code | ✅ 完了 | 2026-06-27 |
| Phase 1 | Codex | ⬜ 未着手 | - |
| Phase 2 | Codex + Gemini | ⬜ 未着手 | - |
| Phase 3 | GLM | ⬜ 未着手 | - |
| Phase 4 | GLM | ⬜ 未着手 | - |
| Phase 5 | Gemini | ⬜ 未着手 | - |
| Phase 6 | Codex | ⬜ 未着手 | - |
| Phase 7 | Codex + Claude Code | ⬜ 未着手 | - |

---

## 関連ドキュメント

- [golden_cond_evaluator_migration_assessment.md](golden_cond_evaluator_migration_assessment.md) — 移植可能性評価（スナップショット）
- [golden/docs/cond_evaluator_contract.md](../../golden/docs/cond_evaluator_contract.md) — 評価器入出力契約
- [golden/docs/cond_grammar_spec.md](../../golden/docs/cond_grammar_spec.md) — 文法BNF・述語51種
- `src/turn/turn-controller.js:6357` — 既存 `evaluateCountBCPredicate`
- `src/data/hbr-data-store.js:167` — 既存 `parseConditionFlags`

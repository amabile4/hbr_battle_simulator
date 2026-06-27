# golden/ cond/overwrite_cond 評価器 — 本体移植可能性・可読性評価

> 作成日: 2026-06-27  
> 対象: `golden/src/cond-parser.js`, `golden/src/cond-evaluator.js`  
> 評価者: Claude Sonnet 4.6（コードベース全体調査 + 両実装の対照比較）

---

## 1. 結論（先出し）

| 評価軸 | 判定 | 根拠 |
|---|---|---|
| **移植可能性** | ✅ 高い | 2ファイルとも外部依存なし。アダプタ関数1つで既存呼び出し箇所を段階的に置き換え可能 |
| **可読性向上** | ✅ 高い | 正規表現のアドホック羅列 → AST評価に移行。ハードコード3箇所を解消できる |
| **移植リスク** | ⚠️ 中 | 呼び出し箇所が30箇所超。ContextAPI差異の吸収に注意が必要 |

---

## 2. golden/ 実装の概要

### ファイル構成（評価対象）

```
golden/src/
  cond-parser.js      # 字句解析 + 再帰下降パーサー → AST生成
  cond-evaluator.js   # AST評価器（ConditionContext → boolean）
  special-status-types.js  # SpecialStatusCountByType の ID↔名前マップ
```

### 検証実績（2026-06-27時点）

- master_json 由来 **318式すべて** パース成功（0件失敗）
- 318式すべて評価成功（0件クラッシュ）
- 318式すべて **unknownCount=0**（全述語解決済み、fallback不要）
- view_json 単体でも完結することを `conditions-fixture-view.test.js` で証明済み

---

## 3. 既存実装（turn-controller.js）との対照

### 3-A. アーキテクチャ比較

| 観点 | 既存（turn-controller.js） | golden（cond-evaluator.js） |
|---|---|---|
| パース方法 | 正規表現6本でアドホックマッチ | BNF定義に基づく再帰下降パーサー → AST |
| 呼び出しI/F | `evaluateConditionExpression(expr, state, member, skill, actionEntry)` 5引数 | `evaluateCondition(expr, context)` 2引数（`ConditionContext` 一元化） |
| 述語ディスパッチ | `resolveZeroArgConditionValue` + `resolveSingleArgConditionValue` の2関数 | `resolvePredicate(name, args, context)` の1関数 |
| `CountBC` 処理 | `evaluateCountBCPredicate` で手動反復 | AST `countBc` ノードとして `resolveCountBc` に集約 |
| サポート述語数 | 約40種（一部 unknown fallback 依存） | **51種**（全カバー、unknownCount=0確認済み） |
| フラグ抽出 | 正規表現ハードコード3本（後述） | AST走査 `extractFunctionNames(ast)` で代替可 |

### 3-B. 既存のハードコード箇所（移植で解消できるもの）

#### ① `parseConditionFlags` — [hbr-data-store.js:167-177](../../src/data/hbr-data-store.js#L167)

```js
const EXTRA_TURN_BLOCK_PATTERN = /SpecialStatusCountByType\(20\)\s*==\s*0/;
const OVERDRIVE_PATTERN        = /IsOverDrive\(\)/;
const REINFORCED_PATTERN       = /IsReinforcedMode\(\)/;
```

`cond` テキストを正規表現で検索し `excludesExtraTurn` / `requiresOverDrive` / `requiresReinforcedMode` フラグを生成している。
`||` や否定形（`!=0` 等）との組み合わせで**誤検知するリスク**がある。

**移植後の代替**: `extractFunctionNames(parseConditionOrThrow(cond))` でAST内述語名の Set を取得し、`has('IsOverDrive')` 等で判定。

#### ② `hasSpGreaterOrEqualZeroCondition` — [turn-controller.js:10922](../../src/turn/turn-controller.js#L10922)

```js
/(^|&&)\s*Sp\(\)\s*>=\s*0(\s*|&&|$)/.test(String(effectiveSkill?.cond ?? ''))
```

`skill.cond` に `Sp()>=0` が含まれるかを正規表現で判定。`0<=Sp()` 形式や `||` との組み合わせは検出できない。

**移植後の代替**: ASTの `compare` ノードを走査して `Sp() >= 0` と意味的に等価なノードを検索する関数に置き換え可能。

#### ③ `inferPassiveVariantThreshold` の日本語テキストパターン — [turn-controller.js:6582-6592](../../src/turn/turn-controller.js#L6582)

```js
const PASSIVE_VARIANT_THRESHOLD_RE = /(?:[:：]\s*)?(?:下僕|しもべ)?\s*(\d+)人/;
```

スキルの `desc/info/name` から閾値を日本語テキストでパターンマッチして読み出している。データ変更で壊れる可能性がある。
この箇所は `cond` の評価ではなくバリアント選択ロジックであり、本移植の直接対象外だが、言語依存の脆弱なハードコードとして別途リファクタリングの候補。

### 3-C. 既存との述語差異（追加・変更点）

golden 実装が**追加で対応している述語**（既存では `unknown fallback`）:

| 述語 | golden での扱い | 既存での扱い |
|---|---|---|
| `IsTalisman()` | コンテキストに `talismanActive` あり、**述語実装なし** | `getTalismanState(state.turnState).active` で実装済み |
| `DebuffIconCount()` | `member.debuffIconCount` で実装済み | **未実装**（unknownになる） |
| `IsEnemyCharge()` | `target.isCharging` で実装済み | **未実装** |
| `IsApplyLearning()` | `member.isApplyLearning` で実装済み | **未実装** |
| `IsRole(X)` / `IsAttacker()` 等 | `member.role` で実装済み | **未実装** |
| `IsWeaponElement(X)` | `member.weaponElement` で実装済み | **未実装** |
| `IsTargetWeakNatureElement(X)` | `target.isTargetWeakNatureElement(el)` で実装済み | **未実装** |
| `BreakDownTurn()` | `target.breakDownTurn` で実装済み | **未実装**（`TargetBreakDownTurn()` のみ実装） |
| `IsPlayer()` | `member.isPlayer === false ? 0 : 1` | CountBC内でのみ対応 |

**注意**: `IsTalisman()` は既存では実装済みだが golden には述語未実装（contextフィールドのみ定義）。移植時に追加が必要。

### 3-D. IsCharging の内部マッピング確認

| 実装 | 判定方法 |
|---|---|
| 既存 | `hasSpecialStatus(member, SPECIAL_STATUS_TYPE_BUFF_CHARGE)` — 定数経由 |
| golden | `getSpecialStatusCount(member, 25) > 0` — 固定値25 |

`SPECIAL_STATUS_TYPE_BUFF_CHARGE = 25` であることを確認済み。実質同一。

### 3-E. IsZone('None') の扱い

| 実装 | 判定方法 |
|---|---|
| 既存 | `arg === 'None'` 分岐 → フィールドが活性でないことを確認 |
| golden | `state?.zone === arg0` で単純比較 |

既存実装は `zone` が非アクティブ時に `IsZone('None')` を true にするが、golden は `state.zone === 'None'` の文字列マッチのみ。
移植時はアダプタで「ゾーン非アクティブ時は `state.zone = 'None'` を設定する」規約を徹底すること。

---

## 4. 移植可能性の詳細

### 4-A. 依存関係

```
cond-parser.js     ← 外部依存なし（純粋関数）
cond-evaluator.js  ← cond-parser.js のみ
```

**`src/` にそのままコピー可能。**

### 4-B. 移植手順（推奨）

**Phase 1: ファイルコピー**
```
golden/src/cond-parser.js    → src/engine/cond-parser.js
golden/src/cond-evaluator.js → src/engine/cond-evaluator.js
```
既存コードには手を触れない。

**Phase 2: アダプタ関数を1箇所に実装**

```js
// src/turn/condition-context-adapter.js（新規）
import { evaluateCondition } from '../engine/cond-evaluator.js';

export function buildConditionContext(state, member, skill, actionEntry) {
  return {
    state: {
      turnIndex:   state?.turnState?.turnIndex ?? 1,
      odGauge:     state?.turnState?.odGauge ?? 0,
      zone:        getZoneTypeName(state) ?? 'None',   // 非アクティブ時は 'None'
      territory:   getTerritoryTypeName(state) ?? 'None',
      isOverDrive: isOverDriveActive(state?.turnState),
      talismanActive: getTalismanState(state?.turnState).active,
    },
    member: /* 既存memberオブジェクトから変換 */,
    skill:  /* 既存skillオブジェクトから変換 */,
    action: /* actionEntryから変換 */,
    target: /* ターゲット情報 */,
    party:   state?.party ?? [],
    enemies: state?.turnState?.enemyState?.enemies ?? [],
  };
}

// 既存の evaluateConditionExpression と互換性のある wrapper
export function evaluateConditionExpression(expression, state, member, skill, actionEntry) {
  const ctx = buildConditionContext(state, member, skill, actionEntry);
  const result = evaluateCondition(expression, ctx);
  return { result: result.result, knownCount: result.knownCount, unknownCount: result.unknownCount };
}
```

**Phase 3: `parseConditionFlags` の AST版への置き換え**

```js
import { parseCondition, extractFunctionNames } from '../engine/cond-parser.js';

function parseConditionFlags(expression) {
  const parsed = parseCondition(String(expression ?? ''));
  if (!parsed.ok) {
    return { excludesExtraTurn: false, requiresOverDrive: false, requiresReinforcedMode: false };
  }
  const fns = extractFunctionNames(parsed.ast);
  // SpecialStatusCountByType(20)==0 の検出はAST走査で型安全に行う（詳細後述）
  return {
    excludesExtraTurn:     hasSpecialStatusExcludesPattern(parsed.ast),
    requiresOverDrive:     fns.has('IsOverDrive'),
    requiresReinforcedMode: fns.has('IsReinforcedMode'),
  };
}
```

**Phase 4: `hasSpGreaterOrEqualZeroCondition` の廃止（または意味的AST検索への変更）**

**Phase 5: `IsTalisman()` を golden 評価器に追加**（turn-controller で `talismanActive` をcontextに渡すだけ）

---

## 5. 可読性向上効果の評価

### Before（既存）

```js
// 6本の正規表現でマッチ、fallthrough で評価
const m1 = text.match(PLAYED_SKILL_COUNT_CONDITION_RE);
if (m1) { ... }
const m2 = text.match(SPECIAL_STATUS_COUNT_BY_TYPE_CONDITION_RE);
if (m2) { ... }
const m3 = text.match(COUNT_BC_CONDITION_RE);
if (m3) { const evaluated = evaluateCountBCPredicate(m3[1], state, member); ... }
const m4 = text.match(FUNCTION_COMPARISON_CONDITION_RE);
if (m4) { ... }
const m5 = text.match(REVERSE_FUNCTION_COMPARISON_CONDITION_RE);
if (m5) { ... }
const m6 = text.match(BARE_FUNCTION_CALL_CONDITION_RE);
if (m6) { ... }
return { known: false, value: true }; // 未対応は安全側
```

### After（golden）

```js
// ASTを評価するだけ
const result = evaluateCondition(expression, context);
// { result, knownCount, unknownCount, ok }
```

**具体的な可読性改善点**:

| 改善箇所 | Before | After |
|---|---|---|
| 単一条件評価 | 6本の正規表現フォールスルー | `evaluateCondition(expr, ctx)` 1呼び出し |
| `parseConditionFlags` | 3本の正規表現ハードコード | AST走査 `extractFunctionNames` |
| `hasSpGreaterOrEqualZeroCondition` | 専用正規表現 | AST意味検索（またはcontext評価で代替） |
| 述語追加時 | 正規表現パターンと switch case を両方追加 | `resolvePredicate` の switch に1ケース追加するだけ |
| `CountBC` の内側評価 | `evaluateCountBCPredicate` で手動ループ | ASTノード `countBc` として自動処理 |
| 構文エラー検出 | なし（正規表現はサイレントに失敗） | `parseCondition` が `ok:false, error` を返す |

---

## 6. 移植リスクと対策

| リスク | 内容 | 対策 |
|---|---|---|
| **呼び出し箇所の多さ** | `evaluateConditionExpression` が30箇所以上に散在 | Phase 2でwrapperを同名で実装し、内部だけ差し替え。呼び出し箇所はそのまま |
| **IsZone('None') の意味差** | goldenは`state.zone === 'None'`のみ | アダプタで「ゾーン非アクティブ = zone:'None'」を規約化 |
| **IsTalisman() 未実装** | golden述語リストにない | `resolvePredicate` に1ケース追加（コンテキストに `talismanActive` は既に定義済み） |
| **ConditionContext構築コスト** | 毎回オブジェクト生成が発生 | キャッシュ/プール化は後回し。まず動作確認を優先 |
| **resolvePassiveVariantForSkillConditionPart の日本語テキスト依存** | 本移植の範囲外だが残存 | 別タスクとして分離 |
| **spec差異の潜在的バグ** | 述語追加により今まで unknown だったものが known になる | E2E/unit テストの通過を移植完了の基準とする |

---

## 7. 移植後に得られる追加能力

移植によって以下が新たに可能になる:

1. **構文エラーのログ可視化**: `ok:false` + `parseError` メッセージでデータ起因の不正式を検出可能
2. **全解決確認 `isFullyResolved`**: `unknownCount=0` の確認でデバッグが容易
3. **デバッグトレース `collectTrace=true`**: どの述語がどの値を返したか一覧取得可能
4. **AST再利用**: 同一式を複数回評価する場合に一度ASTをパースしてキャッシュ可能
5. **未実装述語の検出**: `extractFunctionNames(ast)` で全述語名を抽出し、`resolvePredicate` の対応状況を静的に確認可能
6. **`parseConditionFlags` の精度向上**: 正規表現では見逃す `||` / 否定の組み合わせをAST意味解析で正確に処理

---

## 8. 推奨判断

**移植を推奨する。**

理由:
- `cond-parser.js` / `cond-evaluator.js` の2ファイルが外部依存なしの純粋関数として完成しており、移植コストが低い
- 既存の正規表現アドホック評価はハードコードのリスクが顕在化しており（B-1, B-2）、今後の述語追加・仕様変化で崩れやすい
- アダプタ経由の段階的移植が可能で、一括置き換えのリスクを避けられる
- golden 実装は318式の実データで完全解決確認済みという十分な信頼性がある

**移植しない理由が強い場合**（参考）:
- turn-controller.js の改修凍結期間中
- 他の大規模タスクと干渉する期間

---

## 9. 関連ドキュメント

- [golden/docs/cond_evaluator_contract.md](../../golden/docs/cond_evaluator_contract.md) — 評価器入出力契約・移植手順詳細
- [golden/docs/cond_grammar_spec.md](../../golden/docs/cond_grammar_spec.md) — 文法BNF・述語51種一覧
- [golden/docs/special_status_type_map.md](../../golden/docs/special_status_type_map.md) — SpecialStatus ID対応表
- `src/turn/turn-controller.js:6453` — 既存 `evaluateSingleConditionClause`
- `src/data/hbr-data-store.js:167` — 既存 `parseConditionFlags`（ハードコード正規表現）

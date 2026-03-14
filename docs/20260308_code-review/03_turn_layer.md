# Turn / Config 層 コードレビュー

**対象ファイル**:
- `src/turn/turn-controller.js` （5563行）
- `src/config/battle-defaults.js` （85行）

---

## src/turn/turn-controller.js （5563行）🔴 Critical

**概要**: バトルのターン制御・パッシブタイミング・スキル効果計算を担う中核ファイル。5563行の巨大ファイルで、ほぼ全てのゲームロジックが集中している。

### 問題1: ファイルサイズとモノリシック設計（Critical）

5563行に以下の責任が混在している：

| 機能ブロック | 概算行数 | 提案分割先 |
|------------|---------|----------|
| ターン基本制御（nextTurn, OD遷移） | ~300行 | `turn-state-machine.js` |
| パッシブ解析・timing評価 | ~800行 | `passive-evaluator.js` |
| スキル条件評価（Regex解析） | ~600行 | `condition-evaluator.js` |
| スキル効果適用 | ~1500行 | `skill-effect-applier.js` |
| 敵状態管理 | ~400行 | `enemy-state.js` |
| SP/DP回復処理 | ~300行 | `recovery-processor.js` |

### 問題2: ハードコードされたキャラクターID（High）

```javascript
// turn-controller.js 行 30
const TEZUKA_CHARACTER_ID = 'STezuka';
```

特定キャラクターのIDがソースコードにハードコードされている。ゲームデータのキャラクターIDが変更された場合、コードの修正が必要となる。キャラクター固有のロジックはキャラクターデータベースに属性として持つべき。

```javascript
// 問題のある実装例（概念）
if (character.id === TEZUKA_CHARACTER_ID) {
  // 手塚専用処理
}

// 改善案
if (character.hasSpecialFlag('kishinka')) {
  // フラグベースの処理
}
```

### 問題3: Regex解析の脆弱性と複雑性（High）

パッシブ条件文字列をRegexで解析する箇所が多数存在し、いずれも脆弱性を持つ：

#### 3-A: マジックナンバー埋め込み
```javascript
// hbr-data-store.js 行 37（turn-controller.jsと連携）
/SpecialStatusCountByType\(20\)\s*==\s*0/
```
`20` がエクストラ発動状態を表すtype番号だと推測されるが、ソース中にコメントがなく、変更時のメンテナンスが困難。

#### 3-B: Regex比較演算子の重複定義
```javascript
// 行 2625-2670: PlayedSkillCount の比較演算子
/^PlayedSkillCount\(([^)]*)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/

// 行 2734: CountBC の比較演算子（ほぼ同一）
/^CountBC\((.+)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/
```
比較演算子のパターン `(==|!=|>=|<=|>|<)` が複数箇所で重複定義されている。

**改善案**:
```javascript
const COMPARISON_OPS = String.raw`(==|!=|>=|<=|>|<)`;
const NUMERIC_ARG = String.raw`(-?\d+)`;

const PLAYED_SKILL_COUNT_RE = new RegExp(
  String.raw`^PlayedSkillCount\(([^)]*)\)\s*${COMPARISON_OPS}\s*${NUMERIC_ARG}$`
);
const COUNT_BC_RE = new RegExp(
  String.raw`^CountBC\((.+)\)\s*${COMPARISON_OPS}\s*${NUMERIC_ARG}$`
);
```

#### 3-C: 未エスケープの特殊文字リスク
```javascript
// 行 2750
/[:：]\s*(\d+)人/
```
全角コロン `：` と半角コロン `:` の両対応は意図的だが、なぜ両対応が必要かのコメントがない。条件文字列の出処（ゲームデータ）によっては、さらに別の表記揺れが存在する可能性がある。

#### 3-D: キャプチャグループの検証なし
```javascript
// 行 2604
/^IsWeakElement\(([^)]+)\)/

// マッチ失敗時のnull安全性確認なし（推測）
const match = cond.match(re);
const element = match[1]; // matchがnullの場合クラッシュ
```

#### 3-E: ハードコードされた比較値
```javascript
// 行 3897
/^IsCharacter\(([^)]+)\)==1$/
// 行 3903
/^IsCharacter\(([^)]+)\)==0$/
```
`==1` と `==0` がRegex内にハードコード。将来的に `!=1` や数値以外の比較が必要になった場合、Regexの変更が必要。

### 問題4: 型変換の安全性（Medium）

```javascript
// 行 19-24（概算）
Number(member.position) <= 2  // 文字列positionを直接数値比較

// 行 654
Number(member?.position ?? 99) <= 2  // デフォルト値99がマジックナンバー
```

`99` がフロントライン外を示すデフォルト値として使われているが、この慣例がドキュメント化されていない。`interfaces.js` の `FRONTLINE_MAX_POSITION = 2` のような定数で管理すべき。

### 問題5: 日本語文字列のハードコード（Medium）

```javascript
// 行 386
name === '通常攻撃'

// 行 397（hbr-data-store.js）
name === '追撃'

// 行 434（hbr-data-store.js）
name === '指揮行動' && role === 'Admiral'
```

ゲームデータのスキル名が日本語でソースに直書きされている。スキルデータベース側でフラグ（例: `isNormalAttack: true`）を持つべきで、名前文字列による比較は壊れやすい。

### 問題6: 重複するisPlainObjectチェック（Medium）

```javascript
// 行 799, 835, 949, 1031, 1121, 1178 など（多数）
typeof value === 'object' && value !== null
```

同一パターンが10+箇所で繰り返される。ユーティリティ関数として抽出すべき：

```javascript
// 改善案
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

### 問題7: Regexのインライン定義によるパフォーマンスリスク（Medium）

```javascript
// 行 2485（概算）
someString.replace(/\s+/, ...)  // 毎回呼び出しのたびにRegexをコンパイル
```

頻繁に呼び出される関数内のRegexはモジュールスコープの定数として定義することで、コンパイルコストを1回に抑えられる。

### 問題8: 文字列列挙値のハードコード（Medium）

```javascript
// 行 895（概算）
exitCond === 'Eternal' || exitCond === 'None'

// 行 1002（概算）
timing !== 'OnBattleStart' && timing !== 'OnFirstBattleStart'
// ※ BATTLE_START_PASSIVE_TIMINGS 定数が定義済みだが、ここでは未使用

// 行 1079（概算）
value !== 'None'
```

一部の定数は既に定義されているが（`BATTLE_START_PASSIVE_TIMINGS`）、一貫して使用されていない。

### 問題9: 複雑な数値計算のマジックナンバー（Low）

```javascript
// 行 46
const SPECIAL_BREAK_CAP_BONUS_PERCENT = 300  // 300%の意味は？

// 行 3239-3259（OD計算コメント）
// 「最低3hit(=7.5%)保証」 — 7.5%の計算根拠がコードに見当たらない

// 行 781
Math.max(0, depth - 1)  // depthが0未満になる経路がある？
```

### 問題10: エラーハンドリングの不一致（Medium）

```javascript
// パターンA: Error throwで失敗通知
// 行 13-15
function buildPositionMap(members) {
  if (!members) throw new Error('...');
  // 正常系エラー
}

// パターンB: nullを返して失敗を表現
// 行 2734-2760（条件解析）
if (!match) return null;  // 呼び出し側でnullチェック必須

// パターンC: 条件を無視してデフォルト値を返す
// 行 818（概算）
value: 1  // Random時のデフォルト値、なぜ1か不明
```

### 問題11: OD残行動管理の複雑性（Low）

OD（オーバードライブ）の残行動数とレベル管理が複数の変数にまたがって管理されており、状態遷移の全体像がコードから読み取りにくい。OD状態をステートマシンとして明示的に実装することが望ましい。

---

## src/config/battle-defaults.js （85行）✅ 良好

**概要**: ゲーム設定定数の一元管理ファイル。全体的に適切な設計。

### 問題点

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 56-62 | **OD配列の暗黙的インデックス対応**: `OD_LEVELS`, `OD_RECOVERY_BY_LEVEL`, `OD_COST_BY_LEVEL` が別々の配列で、インデックスによる対応が暗黙的。1つのオブジェクト配列にまとめると意図が明確になる |
| 🟡 Medium | 59-61 | `OD_GAUGE_MIN_PERCENT = 0`, `OD_GAUGE_MAX_PERCENT = 100` の値は自明だが、ゲーム仕様変更時（ODゲージのスケール変更など）に定数名だけ残って値が間違いになるリスク |
| 🟢 Low | 13-54 | `INTRINSIC_MARK_EFFECTS_BY_ELEMENT` で5属性に部分的に同一値が設定されている。共通デフォルトを定義してオーバーライドする形が望ましい |
| 🟢 Low | 74-84 | `getOdGaugeRequirement()` と `clampEnemyCount()` がユーティリティ関数として設定ファイルに含まれている。定数ファイルには定数のみ置き、関数はユーティリティモジュールに分離が望ましい |

**OD配列の改善案**:
```javascript
// 現状
const OD_LEVELS = [1, 2, 3];
const OD_RECOVERY_BY_LEVEL = [8, 6, 4];
const OD_COST_BY_LEVEL = [30, 60, 90];

// 改善案: 関連データをひとまとめ
const OD_LEVEL_CONFIG = [
  { level: 1, recovery: 8, cost: 30, remainingActions: 1 },
  { level: 2, recovery: 6, cost: 60, remainingActions: 2 },
  { level: 3, recovery: 4, cost: 90, remainingActions: 3 },
];
```

---

## 総括

`turn-controller.js` はプロジェクト全体で最も複雑なファイルであり、**ゲームロジック全体の単一障害点**となっている。機能ブロックごとの分割が最優先であり、合わせて以下を実施することで保守性が大幅に向上する：

1. **Regex定数の集約**: 比較演算子パターンなど繰り返されるRegexを定数化
2. **isPlainObject等の共通ユーティリティ抽出**: 10+箇所の重複排除
3. **日本語文字列比較の撤廃**: スキルデータにフラグを追加してデータ駆動化
4. **キャラクターIDハードコードの撤廃**: ゲームデータ駆動での特殊処理

`battle-defaults.js` は定数管理として機能しており、OD設定の関連データ統合と関数の分離により更に改善できる。

---

## 差分レビュー #1 — Phase 6 ブレイク状態実装（2026-03-08 / `af6e73b`）

### `src/config/battle-defaults.js`

**変更量**: +1行

| 変更 | 評価 |
|------|------|
| `DEFAULT_DESTRUCTION_RATE_CAP_PERCENT = 300` 定数追加 | ✅ 改善。初回レビューで指摘していたマジックナンバー問題の一件を解消 |

**残存問題**: `dom-adapter.js` が同じ値（300）を `SPECIAL_BREAK_CAP_BONUS_PERCENT` から import せず `+ 300` としてハードコードしている（後述 NEW-H1）。

---

### `src/turn/turn-controller.js`

**変更量**: +633行（net 約+8行 / 旧来の未コミット分を含む大規模追加）

#### 改善点

**1. `createConditionSkillContext()` によるpart単位コンテキスト修正**

```javascript
function createConditionSkillContext(skill, part = null) {
  if (!skill || !part) return skill;
  return { ...skill, __conditionPart: part, __conditionElements: [...part.elements] };
}
```

以前はパッシブ・スキル条件評価でスキル全体を渡していたため、`IsHitWeak` のような「どの部品の属性か」が必要な条件が正しく評価できなかった。この修正で `applyMoralePassiveTriggerEffects`・`applyMoraleEffectsFromActions`・`applyMotivationEffectsFromActions`・`applyFunnelEffectsFromActions`・`applySkillSelfEpGains` 等、全て統一対応した。

**2. `addGuardStatusEffect()` の抽出による重複排除**

`DebuffGuard` のロジックがパッシブタイミング処理内にインライン実装されていたが、`addGuardStatusEffect()` として抽出し、アクション適用 (`applyGuardEffectsFromActions`) とパッシブ (`applyPassiveTimingInternal`) の両方から再利用するよう統一した。

**3. break state 管理関数群の設計品質**

新規追加されたbreak state 管理関数は、責任が明確に分割されている：

| 関数 | 責任 |
|------|------|
| `getEnemyBreakStateByTarget()` | 読み取り（正規化込み） |
| `setEnemyBreakStateByTarget()` | 書き込み（バリデーション込み） |
| `computeEnemySpecialBreakCapPercent()` | cap計算（純粋関数） |
| `clearEnemySpecialBreakState()` | SuperDown/StrongBreak解除時の巻き戻し |
| `removeEnemySuperDownState()` | DownTurn期限切れ時のSuperDown解除 |
| `applyEnemyStrongBreakState()` / `applyEnemySuperDownState()` | 状態適用 |

新規コードは小さな単一責任関数の集合になっており、既存の巨大関数群と対照的に保守性が高い。

**4. `IsHitWeak` 条件評価の実装**

```javascript
// CONDITION_SUPPORT_MATRIX
IsHitWeak: { tier: 'implemented', note: 'selected target + current skill element can be checked now' }
```

スキルpartの属性と対象敵の弱点属性を照合する条件が実装された。`getConditionSkillElements()` で `__conditionElements` → `__conditionPart.elements` → `skill.parts` の優先順で属性を取得するフォールバックチェーンが適切に実装されている。

**5. `tickEnemyStatuses()` での自動DownTurn解除**

DownTurnが期限切れになった敵に対して `removeEnemySuperDownState()` を自動呼び出すようにした。SuperDownはDownTurnが有効な間のみ有効であるというゲーム仕様を正しく実装している。

#### 残存問題（変化なし）

初回レビューで指摘した以下の問題は未対処のまま：
- C2: モノリシック（5571行、さらに増加）
- マジックナンバー多数（`isPlainObject` チェック10+箇所等）
- 日本語文字列ハードコード（`'通常攻撃'`, `'追撃'`）
- Regex脆弱性（条件文字列解析）


# 改善提案 優先度・工数目安

**レビュー対象**: `src/` および `ui/` 以下の全実装ファイル
**作成日**: 2026-03-08

---

## 改善提案一覧（優先度順）

### Phase 1: Critical（即時対応推奨）

#### R-C1: `dom-adapter.js` のファイル分割

**問題**: 5996行・57メソッドが単一ファイルに集中（単一責任原則違反）
**影響**: テスト困難、変更時の影響範囲が広大、レビューが実質不可能

**分割提案**:
```
src/ui/
├── dom-adapter.js          （コア・初期化のみ、~400行）
├── dom-adapter-selection.js （パーティー選択UI、~1100行）
├── dom-adapter-turn.js      （ターン処理、~300行）
├── dom-adapter-enemy.js     （敵設定UI、~450行）
├── dom-adapter-turn-plan.js （ターンプラン、~500行）
└── dom-adapter-scenario.js  （シナリオ実行、~700行）
```

**実装方針**:
- 継承関係は維持（`BattleAdapterFacade` を継承）
- Mixin パターンまたは委譲パターンで各モジュールを `dom-adapter.js` に組み込む
- 既存テストファイルのimportパスを更新する

**推定工数**: 大（3-5日）/ リスク: 中（既存テストが壊れる可能性あり）

---

#### R-C2: `turn-controller.js` のファイル分割

**問題**: 5563行のゲームロジック全集中
**影響**: 1つの変更が全ゲームロジックに影響する可能性

**分割提案**:
```
src/turn/
├── turn-controller.js      （ターン状態管理のエントリポイント、~300行）
├── passive-evaluator.js    （パッシブタイミング評価、~800行）
├── condition-evaluator.js  （Regex条件解析、~600行）
├── skill-effect-applier.js （スキル効果適用、~1500行）
└── recovery-processor.js   （SP/DP回復処理、~300行）
```

**推定工数**: 大（5-7日）/ リスク: 高（ゲームロジックの中核、慎重な分割が必要）

---

### Phase 2: High（1-2スプリント内に対応推奨）

#### R-H1: `party.js` の `swap()` 原子性確保

**問題**: `memberA.setPosition(posB)` が成功後に `memberB.setPosition(posA)` が失敗した場合、状態が不整合になる

**修正コード**:
```javascript
// src/domain/party.js
swap(posA, posB, options = {}) {
  const memberA = this.getByPosition(posA);
  const memberB = this.getByPosition(posB);
  if (!memberA) throw new Error(`Swap failed: no member at position ${posA}`);
  if (!memberB) throw new Error(`Swap failed: no member at position ${posB}`);

  // EX制約チェック (既存ロジック維持)
  if (options.hasAnyExtra && (posA <= 2 || posB <= 2)) {
    throw new Error('Cannot swap frontline during extra turn.');
  }

  // アトミックな交換（どちらも失敗しないよう、直接プロパティ操作）
  // CharacterStyleの_positionを直接操作するか、
  // Partyが内部配列を管理して参照のみ更新する
  memberA._setPositionDirect(posB);
  memberB._setPositionDirect(posA);
}
```

**推定工数**: 小（0.5日）

---

#### R-H2: エラーハンドリング戦略の統一

**問題**: `runSafely()` / `throw` / `try-catch` の3パターン混在

**推奨方針**:

| レイヤー | 戦略 | 理由 |
|---------|------|------|
| DOMイベントハンドラー | `runSafely()` で全て包む | UIの安定性を優先 |
| ドメイン関数 | `throw new Error()` で失敗通知 | 呼び出し側に判断を委譲 |
| 外部API呼び出し（fetch等） | `try-catch` + ユーザー通知 | 外部障害を適切に処理 |

**実装例**:
```javascript
// dom-adapter.js: 全UIイベントをrunSafelyで包む（一貫性確保）
registerEvent(selector, event, handler) {
  this.root.querySelector(selector)?.addEventListener(event, () => {
    this.runSafely(handler.bind(this));
  });
}
```

**推定工数**: 中（1-2日）

---

#### R-H3: パッシブ条件Regexの定数化・安全化

**問題**: Regexが複数箇所で重複定義、マジックナンバー埋め込み

**修正提案**:
```javascript
// src/turn/condition-evaluator.js (新ファイル)
const COMPARISON_OPS = String.raw`(==|!=|>=|<=|>|<)`;
const NUMERIC_ARG = String.raw`(-?\d+(?:\.\d+)?)`;

// 定数として事前コンパイル
const CONDITIONS = {
  PLAYED_SKILL_COUNT: new RegExp(
    String.raw`^PlayedSkillCount\(([^)]*)\)\s*${COMPARISON_OPS}\s*${NUMERIC_ARG}$`
  ),
  COUNT_BC: new RegExp(
    String.raw`^CountBC\((.+)\)\s*${COMPARISON_OPS}\s*${NUMERIC_ARG}$`
  ),
  IS_CHARACTER: new RegExp(
    String.raw`^IsCharacter\(([^)]+)\)\s*${COMPARISON_OPS}\s*[01]$`
  ),
  // ... 他の条件
};

// マジックナンバー20の説明を定数化
const EXTRA_ACTIVATION_STATUS_TYPE = 20;  // ExtraActivation状態のタイプID
const EXTRA_NOT_ACTIVATED_CONDITION = new RegExp(
  String.raw`SpecialStatusCountByType\(${EXTRA_ACTIVATION_STATUS_TYPE}\)\s*==\s*0`
);
```

**推定工数**: 中（1日）

---

#### R-H4: 日本語文字列ハードコードの排除

**問題**: `'通常攻撃'`, `'追撃'`, `'指揮行動'` がソースに直書き

**修正方針**: スキルデータベースにフラグを追加してデータ駆動化

```javascript
// skillDatabase.json (スキルデータに追加)
{
  "id": "normal_attack_xxx",
  "name": "通常攻撃",
  "flags": {
    "isNormalAttack": true,
    "isCommandAction": false,
    "isCover": false
  }
}

// turn-controller.js (修正後)
// Before: name === '通常攻撃'
// After:
if (skill.flags?.isNormalAttack) { ... }
```

**推定工数**: 中（1-2日、データ更新含む）

---

### Phase 3: Medium（計画的に対応）

#### R-M1: `character-style.js` のdelta系メソッド統合

**問題**: `applyTokenDelta()`, `applyMoraleDelta()`, `applyMotivationDelta()` が重複

```javascript
// 改善案
_applyResourceDelta(resource, delta, ceiling) {
  const result = applySpChange(resource.current, delta, resource.min ?? 0, ceiling);
  resource.current = result.next;
  this._revision++;
  return result.delta;
}

applyTokenDelta(delta) {
  return this._applyResourceDelta(this.token, delta, this.token.max);
}
applyMoraleDelta(delta) {
  return this._applyResourceDelta(this.morale, delta, this.morale.max);
}
applyMotivationDelta(delta) {
  return this._applyResourceDelta(this.motivation, delta, this.motivation.max);
}
```

**推定工数**: 小（0.5日）

---

#### R-M2: DOMセレクター定数の一元管理

**問題**: 50+箇所でセレクター文字列がハードコード

```javascript
// src/ui/dom-adapter-selectors.js (新ファイル)
export const SELECTORS = Object.freeze({
  // 戦闘制御
  INIT_BTN:       '[data-action="initialize"]',
  PREVIEW_BTN:    '[data-action="preview"]',
  COMMIT_BTN:     '[data-action="commit"]',

  // 状態表示
  STATUS:         '[data-role="status"]',
  PREVIEW_OUTPUT: '[data-role="preview-output"]',
  CSV_OUTPUT:     '[data-role="csv-output"]',

  // パーティー選択
  SWAP_FROM:      '[data-role="swap-from"]',
  SWAP_TO:        '[data-role="swap-to"]',
  // ...
});
```

**推定工数**: 中（1日）

---

#### R-M3: `hbr-data-store.js` のmergeロジック統合

**問題**: `mergeSkillVariant()`, `mergeSkillPart()`, `mergeSkillWithOverride()` が3層で重複

```javascript
// 改善案: 汎用deepMerge
function deepMergeSkill(base, override, options = {}) {
  const { omitNullOverrides = false, arrayMode = 'replace' } = options;
  // 共通mergeロジック
}
```

**推定工数**: 中（1日）

---

#### R-M4: `interfaces.js` のマジックナンバー定数化

```javascript
// 現状
partyMembers.length !== 6
new Array(6).fill(-1)
character.position <= 2

// 改善案: src/contracts/constants.js または battle-defaults.js に追加
export const MAX_PARTY_SIZE = 6;
export const FRONTLINE_MAX_POSITION = 2;  // 0-basedで0,1,2がフロント
```

**推定工数**: 小（0.5日）

---

#### R-M5: `ui/app.js` のPromise.all化と環境依存の削減

```javascript
// 現状: 直列fetch
const rawCharacters = await fetchJson('./data/characters.json');
const rawStyles     = await fetchJson('./data/styles.json');

// 改善案: 並列fetch
const [rawCharacters, rawStyles, rawSkills] = await Promise.all([
  fetchJson('./data/characters.json'),
  fetchJson('./data/styles.json'),
  fetchJson('./data/skills.json'),
]);
```

**推定工数**: 小（0.25日）

---

#### R-M6: `battle-adapter-facade.js` の状態変数グルーピング

**問題**: 24+の散在するインスタンス変数

```javascript
// 改善案: 関連する変数をグループ化して管理
class BattleAdapterFacade {
  constructor(...) {
    // グループ1: 基本戦闘状態
    this._battle = {
      party: null,
      state: null,
      recordStore: null,
      previewRecord: null,
      pendingSwapEvents: [],
    };

    // グループ2: OD関連状態
    this._od = {
      pendingInterruptLevel: null,
      interruptProjection: null,
      preemptiveCheckpoint: null,
      kishinkaActivatedThisTurn: false,
    };

    // グループ3: ターンプラン状態
    this._turnPlan = {
      plans: null,
      computedRecords: null,
      replayError: null,
      replayWarnings: [],
      editSession: null,
      baseSetup: null,
      isReplaying: false,
      recalcMode: false,
    };

    // グループ4: シナリオ状態
    this._scenario = {
      data: null,
      cursor: 0,
      stagedTurnIndex: null,
      setupApplied: false,
    };
  }
}
```

**推定工数**: 中（1日、リファクタリングとテスト更新）

---

#### R-M7: シナリオ実行の非同期化

**問題**: 大規模シナリオでUIフリーズ

```javascript
// 改善案: setTimeoutによるUIスレッド解放
async runAllScenarioTurns() {
  while (this.scenarioCursor < this.scenario.turns.length) {
    this.runNextScenarioTurn();
    // 毎ターン後にUIスレッドを解放（進捗表示も可能に）
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

**推定工数**: 小（0.5日）

---

### Phase 4: Low（余裕があれば対応）

#### R-L1: 命名規則の統一ガイドライン策定と適用

**推奨パターン**:
- DOM読み取り: `readXFromDom()` / `collectXFromDom()`
- DOM書き込み: `writeXToDom()` / `renderX()`
- 内部状態同期: `syncX()`
- 状態取得: `getX()`
- 状態設定: `setX()`

**推定工数**: 大（2-3日、全体への適用）

---

#### R-L2: JSDoc型定義の追加

主要関数にJSDoc型定義を追加し、IDEのコード補完とエラー検出を強化する。

```javascript
/**
 * @param {number} current - 現在のSP値
 * @param {number} delta - SP変化量（正:回復、負:消費）
 * @param {number} min - SP下限値
 * @param {number} eventCeiling - イベントによるSP上限
 * @returns {{ next: number, delta: number }} 適用後のSPと実際の変化量
 */
export function applySpChange(current, delta, min, eventCeiling) { ... }
```

**推定工数**: 大（3-4日、全体への適用）

---

#### R-L3: `record-editor.js` の再インデックスコスト改善

**問題**: O(n)再インデックスがinsert/deleteのたびに実行

**改善案**: ターンラベルをlazy計算（表示時のみ計算）または差分更新に変更

**推定工数**: 中（1日）

---

#### R-L4: json-exporter.js の型情報保持

```javascript
// 現状: Infinity → "Infinity" 文字列（復元不可）
if (value === Infinity) return "Infinity";

// 改善案A: nullに変換（より安全）
if (!Number.isFinite(value) && typeof value === 'number') return null;

// 改善案B: 型タグ付きオブジェクト（復元可能）
if (value === Infinity) return { __type: 'Infinity' };
```

**推定工数**: 小（0.5日）

---

## 実施ロードマップ

```
Month 1                Month 2                Month 3
│                      │                      │
├─ R-H3 (Regex定数)     ├─ R-C1 (dom分割)       ├─ R-L1 (命名規則)
├─ R-H4 (日本語除去)    ├─ R-C2 (turn分割)      ├─ R-L2 (JSDoc)
├─ R-H1 (swap原子性)    ├─ R-M6 (状態グループ)  └─ R-L3 (再インデックス)
├─ R-M1 (delta統合)     ├─ R-M3 (merge統合)
├─ R-M4 (定数化)        └─ R-H2 (エラー統一)
├─ R-M5 (Promise.all)
└─ R-M7 (非同期化)
```

---

## 優先度別工数サマリー

| Phase | 改善項目数 | 推定工数合計 | リスク |
|-------|-----------|------------|--------|
| Critical (Phase 1) | 2 | 8-12日 | 高 |
| High (Phase 2) | 4 | 3.5-5日 | 中 |
| Medium (Phase 3) | 7 | 5-7日 | 低-中 |
| Low (Phase 4) | 4 | 5-8日 | 低 |
| **合計** | **17** | **21.5-32日** | |

---

## 実施時の注意事項

1. **Critical改善（ファイル分割）は必ずブランチで作業し、E2Eテストが全件PASS後にマージする**
2. **ドメイン層の改善（delta統合、swap原子性）は単体テストで確認後に実施**
3. **日本語文字列除去はスキルデータベースのスキーマ変更を伴うため、データ移行スクリプトを事前に準備する**
4. **Regex定数化はターン制御の中核変更のため、全シナリオテストを実行して動作確認する**

---

## 参考: 優良パターン（変更不要）

以下のコードは品質が高く、そのまま維持・参考にすべきパターン：

- `src/domain/sp.js`: 副作用なしの純粋関数
- `src/domain/dp-state.js`: 正規化関数の一元管理
- `src/ui/dom-view.js`: 責任最小化のDOM操作クラス
- `src/records/record-store.js`: シンプルなファサードパターン
- `runSafely()` パターン: UIエラーの安全な吸収
- `Object.freeze()` の活用: スナップショットの不変性確保
- `CharacterStyle._revision`: stale更新防止のリビジョン管理

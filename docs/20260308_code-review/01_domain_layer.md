# Domain / Data / Records 層 コードレビュー

**対象ディレクトリ**:
- `src/domain/` (sp.js, party.js, character-style.js, dp-state.js, damage-calculation-context.js, turn-preview.js)
- `src/data/` (hbr-data-store.js, schema-validator.js)
- `src/records/` (record-assembler.js, record-editor.js, record-store.js, csv-exporter.js, json-exporter.js)
- `src/contracts/` (interfaces.js)
- `src/config/` (battle-defaults.js)

---

## src/domain/

### sp.js （46行）✅ 優良

**概要**: SP（スキルポイント）の計算を担う純粋関数群。依存なし。

**良好な点**:
- `applySpChange()`: delta方向ごとのceilingルールが正確に実装されている
- `getEventCeiling()`: sourcetypeごとのceilingを一元管理

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 30-45 | `getEventCeiling` の switch-case で、`'passive'`, `'base'`, `'clamp'` などが `default` 側に落ちる。意図的な動作なら明示的なコメントが必要。未知の source に対して同じ値を返すのは危険 |
| 🟢 Low | 31 | 未知の `source` 入力に対するエラーメッセージが不足。`SP_CHANGE_SOURCES` 外の値が入ってもサイレントに処理される |

**修正提案** (`getEventCeiling` の default 句):
```javascript
// 現状
default:
  return Number.POSITIVE_INFINITY;

// 改善案
default:
  // 'passive', 'base', 'clamp' など、ceiling制限なし
  // 未知のsourceはここに到達するが、callerが正しいsourceを渡すことを前提とする
  return Number.POSITIVE_INFINITY;
```

---

### dp-state.js （82行）✅ 優良

**概要**: DP（破壊ポイント）状態の正規化・計算。

**良好な点**:
- `isBlankDpValue()` → `toFiniteNumber()` → `normalizeXxx()` の一貫したパイプライン
- `getDpRate()` でゼロ除算を正しく処理（Infinity返却）

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟢 Low | 7-13 | `toFiniteNumber` で `isBlankDpValue` チェック後に `Number(String(value))` と二重変換。string化が不要 |
| 🟢 Low | 15-44 | normalize関数が5つあり、いずれも同じ `Math.max(0, toFiniteNumber(x))` パターン。汎用化可能 |
| 🟡 Medium | 75-81 | `getDpRate()` が `POSITIVE_INFINITY` を返す場合、呼び出し側で `isFinite()` チェックが必須だが、コメント・ドキュメントがない |

---

### party.js （86行）⚠️ 注意

**概要**: 6人パーティーを管理するクラス。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟠 High | 48-73 | **`swap()` メソッドが非原子**: `memberA.setPosition(posB)` が成功後に `memberB.setPosition(posA)` が失敗した場合、パーティー状態が不整合になる。ロールバック処理がない |
| 🟢 Low | 16-34 | `_validateUniquePositions()` と `_validateUniquePartyIndices()` が同一パターン（find → throw）。汎用 `_validateUnique(key, label)` で統合可能 |
| 🟢 Low | 44-46 | `getByPosition()` の `?? null` は `Array.find()` が既に `undefined` を返すため冗長 |
| 🟢 Low | 75-77 | `snapshot()` が毎回 `getSortedByPosition()` を呼び出してソート実行。パーティーが既にソート済みの場合に無駄 |

**修正提案** (`swap()` の原子性確保):
```javascript
swap(posA, posB) {
  const memberA = this.getByPosition(posA);
  const memberB = this.getByPosition(posB);
  if (!memberA || !memberB) throw new Error(`Swap failed: position not found`);
  // 一時値でアトミックに交換
  memberA._position = posB;
  memberB._position = posA;
}
```

---

### character-style.js （942行）⚠️ 要改善

**概要**: キャラクタースタイルの全状態（SP/DP/マーク/バフ等）を管理する大型クラス。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟠 High | 542, 468, 636 | **ネストオブジェクトの直接ミューテーション**: `this.dpState.baseMaxDp = ...`, `this.sp.current = ...`, `markState.current = ...` — 外部に参照が渡っている場合、予期しない副作用が発生する |
| 🟡 Medium | 557-595付近 | **delta系メソッドの重複**: `applyTokenDelta()`, `applyMoraleDelta()`, `applyMotivationDelta()` がほぼ同一実装（`applySpChange()` → 状態更新 → revision++）。`applyResourceDelta(property, delta, ceiling)` として汎用化すべき |
| 🟡 Medium | 407 | `applySpChange()` に `Number.POSITIVE_INFINITY` を上限として渡しているが、`itemCeiling > spMax` のケースで意図外の上限超えが起きる可能性 |
| 🟡 Medium | 469-479 | `commitSkillPreview()` でNumber.isFiniteチェックしているが、失敗時の処理が「スキップ」のみで警告がない |
| 🟢 Low | 291付近 | `input.epRule && typeof input.epRule === 'object' ? ... : null` パターンが多数。`input.epRule?.someProperty ?? null` で簡潔化可能 |
| 🟢 Low | 635 | `setMarkLevel()` で `applySpChange(0, targetLevel, ...)` — 第1引数が `0` 固定で「現在値から加算」の意味が不明瞭 |
| 🟢 Low | 739-745 | `addStatusEffect()` が `_nextStatusEffectId` を更新する副作用を持つが、命名が「add」なので問題ないが、`structuredClone` の返却はコスト高 |

**重複コード例**:
```javascript
// 現状: 3メソッドが同じパターン
applyTokenDelta(delta) {
  const result = applySpChange(this.token.current, delta, ...);
  this.token.current = result.next;
  this._revision++;
  return result.delta;
}
applyMoraleDelta(delta) {
  const result = applySpChange(this.morale.current, delta, ...);
  this.morale.current = result.next;
  this._revision++;
  return result.delta;
}

// 改善案: 共通関数化
_applyResourceDelta(resource, delta, ceiling) {
  const result = applySpChange(resource.current, delta, resource.min, ceiling);
  resource.current = result.next;
  this._revision++;
  return result.delta;
}
applyTokenDelta(delta) { return this._applyResourceDelta(this.token, delta, this.token.max); }
applyMoraleDelta(delta) { return this._applyResourceDelta(this.morale, delta, this.morale.max); }
```

---

### turn-preview.js （53行）✅ 良好

**概要**: ターンプレビュー/コミットの純粋関数。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟢 Low | 14-17 | エラーメッセージに `characterId` や `styleId` がない（`position` のみ）。デバッグ困難 |
| 🟢 Low | 30-52 | `commitTurn()` のリビジョン不一致エラーも詳細不足 |

---

### damage-calculation-context.js （56行）🟡 注意

**概要**: ダメージ計算に必要なコンテキスト情報を構築するオブジェクト。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 3-54 | 型変換コードが50行以上。`Number()` / `String()` / フィルタリングが繰り返す。ビルダーパターンまたはzodスキーマで統一化が望ましい |
| 🟡 Medium | 13-15 | `targetEnemyIndex` の三項演算が深くネストしており読みにくい |
| 🟡 Medium | 20-24 | `eligibleEnemyIndexes` のフィルタリングが3ステップあり、1行化を強制しているため可読性が低い |

---

## src/data/

### hbr-data-store.js （1205行）⚠️ 要改善

**概要**: ゲームデータ（キャラクター・スタイル・スキル・パッシブ）の読み込みと正規化を担うシングルトン。最も複雑なファイルの一つ。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟠 High | 37 | **マジックナンバー `20`**: `/SpecialStatusCountByType\(20\)\s*==\s*0/` の `20` が何を意味するか不明。定数化が必要（エクストラ発動フラグ？） |
| 🟠 High | 37-39 | **Regex解析の脆弱性**: パッシブ条件文字列を固定パターンで照合。条件文字列の形式が変わると検出漏れが発生する |
| 🟡 Medium | 65-119 | **mergeロジックの重複**: `mergeSkillVariant()`, `mergeSkillPart()`, `mergeSkillWithOverride()` が3層にわたって類似パターンを繰り返す。汎用 `deepMerge(base, override, options)` で統一すべき |
| 🟡 Medium | 12-23 | **`normalizeCharacterName()` が `dom-adapter.js` の `normalizeName()` と重複**。一元化すべき |
| 🟡 Medium | 386, 397, 434, 478 | **日本語文字列のハードコード**: `'通常攻撃'`, `'追撃'`, `'指揮行動'` が比較に直接使用されている。データベース値と乖離するリスク |
| 🟡 Medium | 26 | `Number.isFinite(t) ? t : Number.POSITIVE_INFINITY` — 無効な日付（limitBreakAvailableAt）をInfinityに変換。意図がコメントなしに不明 |
| 🟡 Medium | 30-35 | `LIMIT_BREAK_MAX_BY_TIER` でA:20, S:10, SS:4, SSR:4をハードコード。ゲームデータから取得すべき |
| 🟡 Medium | 254 | `fromRawData()` でペイロードの存在確認のみで、個別フィールドのバリデーションなし |
| 🟢 Low | 22 | `.replace(/\s+/g, '')` が呼び出しのたびにRegexコンパイル。定数化を推奨 |

**Regex使用箇所一覧**:
```javascript
// hbr-data-store.js
行 37: /SpecialStatusCountByType\(20\)\s*==\s*0/   ← マジックナンバー
行 38: /IsOverDrive\(\)/
行 39: /IsReinforcedMode\(\)/
行 22: /\s+/g  ← 毎回コンパイル
```

---

### schema-validator.js （143行）✅ 良好

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟢 Low | 46 | `new RegExp(schema.pattern)` — スキーマパターンを実行時コンパイル。キャッシュがないためオブジェクト検証のたびに再コンパイル |
| 🟢 Low | 26-27 | エラーメッセージが文字列連結で階層化なし。パスとコンテキスト情報が不足 |

---

## src/records/

### record-assembler.js （110行）⚠️ 注意

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 1-25 | `fromSnapshot()` の `context` 引数に型定義がない。どのプロパティが必須かが不明 |
| 🟡 Medium | 27-44 | `formatEnemyStatusSummary()` で `filter` → `map` を別々に実行（配列を2回走査）。`reduce` または `flatMap` で統合可能 |
| 🟡 Medium | 36-37 | `targetIndex >= 0` チェック後に `targetIndex + 1` 計算。0基準と1基準が混在しており混乱しやすい |
| 🟡 Medium | 46-60 | `commitRecord()` で `_baseRevision` と `_effectiveSkillSnapshot` を除去しているが、除去対象のルールが暗黙的。コメントで明示すべき |
| 🟡 Medium | 62-83 | `deriveOdTurnLabel()` の分岐が `isSuspendedOdExtra`, `level`, `remaining` で複雑。テストケースが多数必要 |

---

### record-editor.js （108行）⚠️ 注意

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟠 High | 49-58 | **O(n)再インデックス**: `upsertRecord()` や `deleteRecord()` のたびに `normalizeTurnIds()` → `reindexTurnLabels()` が全レコードを再走査。100ターン以上の戦闘で性能劣化 |
| 🟡 Medium | 42 | `deleteRecord()` の `cascade` オプションの範囲が不明確（コメント不足）。どのレコードが連鎖削除されるかが呼び出し側から分からない |
| 🟢 Low | 38 | `Math.max(...ids)` のスプレッドが大規模配列でコールスタックオーバーフロー可能性（実用範囲内では問題なし） |
| 🟢 Low | 73-107 | `reindexTurnLabels()` 内で `normalTurn`, `odStep` などの複数状態変数を管理。ステートマシンパターンへの置き換えが望ましい |

---

### csv-exporter.js （155行）⚠️ 注意

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 139 | **CSVヘッダーがハードコード**: `['seq', 'turn', 'od_turn', ...]` が固定配列。スキーマ定義から自動生成すべき |
| 🟡 Medium | 19-25 | `'od'`, `'extra'`, `'od_extra'` が文字列リテラル。定数またはenumを使用すべき |
| 🟡 Medium | 62 | `'Enemy ' + (targetEnemyIndex + 1)` — ラベル形式がハードコード。多言語対応・書式変更に対して脆弱 |
| 🟡 Medium | 81-82 | `'SP ALL'` と `'SP ' + spDelta` — ラベル形式が非一貫 |
| 🟢 Low | 74 | `String(action.consumeType ?? 'Sp').toLowerCase()` — デフォルト値 `'Sp'` がソース中に埋め込まれている |

---

### json-exporter.js （43行）✅ 良好

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 3-10 | **型情報の喪失**: `Infinity` → `"Infinity"` (文字列) に変換するが、復元時に文字列として残る。`null` に変換するか、専用フィールドで型を保持すべき |
| 🟢 Low | 1 | `RECORD_EXPORT_SCHEMA_VERSION = 1` がハードコード。将来のスキーマ変更時に互換性管理が必要 |

---

## src/contracts/interfaces.js （289行）⚠️ 注意

**概要**: 型定義・データ構造・バリデーション関数。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 13, 17 | **マジックナンバー `6`**: `partyMembers.length !== 6` と `new Array(6).fill(-1)` — `MAX_PARTY_SIZE` 定数を定義して使うべき |
| 🟡 Medium | 35 | `character.position <= 2` — フロントライン判定のしきい値が定数化されていない（`FRONTLINE_POSITION_MAX` 相当） |
| 🟡 Medium | 85-100 | `turnIndex: 1, sequenceId: 1` — 0始まりか1始まりか明示されていない。コメントで意図を示すべき |
| 🟢 Low | 130-133 | `destructionRateByEnemy` merge で `Number(value)` の暗黙的型変換。無効値に対する処理が不明 |

---

## src/config/battle-defaults.js （85行）✅ 良好

**概要**: ゲーム設定定数の一元管理。

**問題点**:

| 重要度 | 行 | 内容 |
|--------|-----|------|
| 🟡 Medium | 59-61 | `OD_GAUGE_MIN_PERCENT`, `OD_GAUGE_MAX_PERCENT` の値（0と100）は意味が自明だが、ゲーム仕様変更時の修正漏れリスクがある |
| 🟢 Low | 13-54 | `INTRINSIC_MARK_EFFECTS_BY_ELEMENT` で5属性に同一の値が設定されている部分がある（定数が実質重複）。デフォルト値のみ定義して各属性で上書きするパターンが良い |
| 🟢 Low | 56-62 | `OD_LEVELS`, `OD_RECOVERY_BY_LEVEL`, `OD_COST_BY_LEVEL` が別々の配列で、インデックスによる対応が暗黙的。`Map` またはオブジェクト配列への変更を検討 |
| 🟢 Low | 74-84 | `getOdGaugeRequirement()` と `clampEnemyCount()` が設定ファイルに含まれているが、純粋関数としてユーティリティモジュールに移動が望ましい |

---

## 総括

domain層の設計は良好で、`sp.js` や `dp-state.js` は高品質な純粋関数として機能している。最大の問題は `character-style.js` と `hbr-data-store.js` の複雑さで、前者はデルタ系メソッドの重複削減と直接ミューテーション排除、後者はmergeロジックの統合と日本語文字列のデータ駆動化が優先課題となる。

---

## 差分レビュー #1 — Phase 6 ブレイク状態実装（2026-03-08 / `af6e73b`）

### `src/contracts/interfaces.js`（+53行）

**変更内容**: `createInitialTurnState()` に `destructionRateCapByEnemy`・`breakStateByEnemy` フィールド追加。`cloneTurnState()` に対応するcloneロジック追加。

**評価**:

| 項目 | 評価 |
|------|------|
| `createInitialTurnState()` の追加 | ✅ 適切。空オブジェクト `{}` で初期化する一貫したパターン |
| `cloneTurnState()` の `breakStateByEnemy` clone | 🟡 注意。ネストした `superDown` オブジェクトのcloneロジックが複雑な三項演算の連鎖になっている（19行程度） |
| `breakStateByEnemy` の型定義 | 🟡 `{baseCap, strongBreakActive, superDown: {preRate, preCap}}` という構造が `cloneTurnState` のコードからのみ読み取れる。JSDoc等のドキュメントがない |

`cloneTurnState` がさらに肥大化したことにより、「インターフェース定義ファイル」が実装ロジックを多く持つという初回レビューの問題が悪化している。`destructionRateCapByEnemy` の正規化ロジック（`Number.isFinite(Number(value)) ? Number(value) : DEFAULT_DESTRUCTION_RATE_CAP_PERCENT`）は `turn-controller.js` の `getEnemyDestructionRateCapPercent()` と重複している。

**スコア**: 3.5/5 維持（変化なし）

---

### `src/data/hbr-data-store.js`（+4行）

**変更内容**: `buildCharacterStyleFromOptions()` に `initialBreak = false` パラメータ追加。`buildPartyFromOptions()` に `initialBreakByPartyIndex = {}` 追加。

**評価**:

| 項目 | 評価 |
|------|------|
| パターンの一貫性 | ✅ `initialDpStateByPartyIndex` と同じパターン |
| `Boolean(initialBreak)` の明示的変換 | ✅ 入力値の型を強制する一貫したアプローチ |
| `Boolean(initialBreakByPartyIndex[index])` | ✅ undefinedに対してfalseを返すフォールバックが適切 |

**スコア**: 3/5 維持（変化なし）


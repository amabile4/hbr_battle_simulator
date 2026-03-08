# コードレビュー ベースライン情報

このファイルは、コードレビュー実施時点のgit状態を記録します。
次回レビュー時にはこのベースラインとの差分のみを再レビューすることで省力化できます。

---

## レビュー実施日時

**2026-03-08**

---

## git状態（レビュー実施時点）

### HEADコミット

```
9d7c23f Refine phase 6 break-state plan
```

### 未コミットの変更（ワーキングツリー）

レビュー実施時点で以下のファイルに**未コミットの変更**が存在していた。
これらはコミット済みではないが、レビュー対象に含まれている。

```
 M src/config/battle-defaults.js      |   1 +
 M src/contracts/interfaces.js        |  53 +++-
 M src/data/hbr-data-store.js         |   4 +
 M src/turn/turn-controller.js        | 625 ++++++++ (実装途中)
 M src/ui/adapter-core.js             |  17 ++
 M src/ui/battle-adapter-facade.js    |   3 +
 M src/ui/dom-adapter.js              | 445 +++++++++++++++++++---------

 合計: 986 insertions, 162 deletions
```

> **注意**: `src/turn/turn-controller.js` に +625行の大規模変更がある。
> 機能追加の途中段階であり、レビュー結果の一部はこの未完成状態を前提としている。

### ブランチ

```
feature/record-edit-recalculation
```

---

## 次回差分レビューの手順

次回レビュー時には、このベースラインとの差分のみを対象とすることで再レビューを省力化する。

### ステップ1: 差分の確認

```bash
# コミット済み差分（HEADから現在まで）
git log --oneline 9d7c23ff..HEAD

# ファイル単位の変更サマリー
git diff --stat 9d7c23ff..HEAD

# 未コミット変更も含めて確認する場合
git diff 9d7c23ff
```

### ステップ2: 変更ファイルの絞り込み

```bash
# 変更されたファイル一覧
git diff --name-only 9d7c23ff..HEAD
```

### ステップ3: 差分ファイルのみを再レビュー

差分ファイルに対して、`docs/code-review/` の既存レビュー結果と照合し：
- **新たに生じた問題** → 該当ドキュメントに追記
- **改善済みの問題** → 該当ドキュメントで「解決済み」とマーク
- **変更なしのファイル** → 再レビュー不要（前回結果を維持）

### ステップ4: このファイルの更新

再レビュー後に `REVIEW_BASELINE.md` を更新し、新しいHEADコミットハッシュに書き換える。

---

## テストベースライン（レビュー実施時点）

| 項目 | 値 |
|------|-----|
| テスト総数 | 274 |
| PASS | 274 |
| FAIL | 0 |
| 実行時間 | 約35秒 |
| テストファイル数 | 9ファイル（e2e除く） |
| 総テストコード行数 | 10,463行 |

次回再レビュー時にテストが増減・変化している場合は `05_test_coverage_review.md` も差分対象とする。

---

## レビュー対象ファイルと前回スコア

| ファイル | 初回スコア | ベースライン時の状態 |
|---------|-----------|-------------------|
| `src/config/battle-defaults.js` | 4/5 | コミット済み + 未コミット変更あり (+1行) |
| `src/contracts/interfaces.js` | 3.5/5 | コミット済み + 未コミット変更あり (+53行) |
| `src/data/hbr-data-store.js` | 3/5 | コミット済み + 未コミット変更あり (+4行) |
| `src/data/schema-validator.js` | 4/5 | コミット済み（変更なし） |
| `src/domain/sp.js` | 4.5/5 | コミット済み（変更なし） |
| `src/domain/party.js` | 3.5/5 | コミット済み（変更なし） |
| `src/domain/character-style.js` | 3.5/5 | コミット済み（変更なし） |
| `src/domain/dp-state.js` | 4/5 | コミット済み（変更なし） |
| `src/domain/damage-calculation-context.js` | 3.5/5 | コミット済み（変更なし） |
| `src/domain/turn-preview.js` | 4/5 | コミット済み（変更なし） |
| `src/records/record-assembler.js` | 3/5 | コミット済み（変更なし） |
| `src/records/record-editor.js` | 3/5 | コミット済み（変更なし） |
| `src/records/record-store.js` | 4.5/5 | コミット済み（変更なし） |
| `src/records/csv-exporter.js` | 3/5 | コミット済み（変更なし） |
| `src/records/json-exporter.js` | 3.5/5 | コミット済み（変更なし） |
| `src/turn/turn-controller.js` | 2/5 | コミット済み + **実装途中の未コミット変更 (+625行)** |
| `src/ui/dom-adapter.js` | 1.5/5 | コミット済み + 未コミット変更あり (+445行) |
| `src/ui/adapter-core.js` | 3/5 | コミット済み + 未コミット変更あり (+17行) |
| `src/ui/battle-adapter-facade.js` | 2.5/5 | コミット済み + 未コミット変更あり (+3行) |
| `src/ui/dom-view.js` | 4/5 | コミット済み（変更なし） |
| `ui/app.js` | 3.5/5 | コミット済み（変更なし） |

---

## 差分レビュー #1 — Phase 6 ブレイク状態実装

**再レビュー日**: 2026-03-08
**対象コミット**: `af6e73b` (`Implement phase 6 break state support`)
**差分コマンド**: `git diff 9d7c23f..af6e73b -- src/ ui/`

### 変更ファイル（src/ ui/ のみ）

```
 src/config/battle-defaults.js   |   1 +
 src/contracts/interfaces.js     |  53 +++-
 src/data/hbr-data-store.js      |   4 +
 src/turn/turn-controller.js     | 633 +++++++++++++++++++++++++--
 src/ui/adapter-core.js          |  17 ++
 src/ui/battle-adapter-facade.js |   3 +
 src/ui/dom-adapter.js           | 529 ++++++++++++++++++++++++---------
 7 files changed, 1078 insertions(+), 162 deletions(-)
```

### 再レビュー後スコア

| ファイル | 初回 | 再レビュー後 | 変化 | 要因 |
|---------|------|------------|------|------|
| `src/config/battle-defaults.js` | 4/5 | 4/5 | → | `DEFAULT_DESTRUCTION_RATE_CAP_PERCENT` 追加でマジックナンバー1件解消 |
| `src/contracts/interfaces.js` | 3.5/5 | 3.5/5 | → | `cloneTurnState` がさらに肥大化（一貫パターンで許容） |
| `src/data/hbr-data-store.js` | 3/5 | 3/5 | → | `initialBreak` 追加、一貫したパターン |
| `src/turn/turn-controller.js` | 2/5 | 2/5 | → | 新規break管理コードの質は高いがファイルサイズ悪化 |
| `src/ui/adapter-core.js` | 3/5 | 3/5 | → | 一貫したパターン追加 |
| `src/ui/battle-adapter-facade.js` | 2.5/5 | 2.5/5 | → | パススルー追加のみ |
| `src/ui/dom-adapter.js` | 1.5/5 | 1.5/5 | → | `buildEnemyStateForUi` 改善あり、新マジックナンバー問題で相殺 |

### 新規発見問題

| # | 重要度 | 問題 | 対象ファイル |
|---|--------|------|------------|
| NEW-H1 | 🟠 High | `SPECIAL_BREAK_CAP_BONUS_PERCENT`（300）が`dom-adapter.js`でハードコード | `src/ui/dom-adapter.js:232,272` |

### 改善確認

| # | 改善内容 | 対象ファイル |
|---|---------|------------|
| ✅ | `DEFAULT_DESTRUCTION_RATE_CAP_PERCENT = 300` 定数化 | `src/config/battle-defaults.js` |
| ✅ | `createConditionSkillContext` で条件評価のpart単位コンテキスト修正 | `src/turn/turn-controller.js` |
| ✅ | `addGuardStatusEffect` を抽出してDebuffGuard/BreakGuardを統一処理 | `src/turn/turn-controller.js` |
| ✅ | `buildEnemyStateForUi` でnormalizer呼び出しを統一 | `src/ui/dom-adapter.js` |
| ✅ | `IsHitWeak` 条件評価を実装（CONDITION_SUPPORT_MATRIX更新） | `src/turn/turn-controller.js` |

### テストベースライン更新

| 項目 | 初回 | 再レビュー後 |
|------|------|------------|
| テスト総数 | 274 | **279** |
| PASS | 274 | **279** |
| FAIL | 0 | 0 |
| 実行時間 | 約35秒 | 約37秒 |

### 次回差分レビューの起点

```
af6e73b Implement phase 6 break state support
```

```bash
git log --oneline af6e73b..HEAD
git diff --stat af6e73b..HEAD -- src/ ui/
```

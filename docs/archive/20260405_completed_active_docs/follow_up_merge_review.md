# feature/ui-next-follow-up マージレビュー

**対象ブランチ**: `feature/ui-next-follow-up` → `main`  
**レビュー日**: 2026-04-04  
**ステータス**: ✅ マージ可

---

## ブランチ概要

追撃（Follow-Up）機能の実装と、OD/EXターン遷移時のSP回復・パッシブ発火のバグ修正を含む。

### コミット一覧（8件）

| コミット | 内容 |
|---------|------|
| `456bee5` | feat: 追撃（Follow-Up）機能の実装 |
| `ebd9b3a` | fix: ブレイクメニューがプレビュー更新時に閉じるリグレッションを修正 |
| `e29138d` | fix: プリセットロード完了後にホバープレビューが残る問題を修正 |
| `83335d3` | fix: skip base SP recovery when turnIndex does not advance (OD/EX transitions) |
| `124aa52` | test: strengthen OD/EX SP recovery regression tests and document OnEnemyTurnStart double-fire issue |
| `b01d55b` | fix: OnAdditionalTurnStart パッシブを isExtraActive メンバーのみに制限 |
| `cdc94ae` | test: E2Eテスト期待値をOnAdditionalTurnStart修正に追従 |
| `c518975` | 追撃ヒット数解決を追撃.md準拠で単一化し、管理を独立化（第3次レビュー完了） |

### 変更統計

- 新規ファイル: 10件（テスト3、ユーティリティ2、ドキュメント3、スクリプト2）
- 変更ファイル: 13件
- 差分: +3,885 / -940 行

---

## レビュー観点1: 追撃処理の独立性

**判定: 良好**

追撃処理は本体処理から明確に分離されている。

### エンジン層（turn-controller.js）

- 追撃OD計算は `computeOdGaugeGainPercentBySkill()` の**外側**で独立計算（L5820-5826）
- 前衛スキルのドライブピアス補正・Funnelボーナス・通常攻撃3hit保証・全体攻撃の敵数倍が一切混入しない構造
- `pursuedHitCount` は `actionEntry` 経由で渡され、エンジンは追撃の「対象敵」や「後衛の情報」を知らない
- `odRateMultiplier`（敵固有属性）のみ共通適用 — 「追撃はバフ/デバフの効果を受けない」の対象外（敵属性であり味方バフではない）

### UI層（turn-engine-manager.js）

- `resolvePursuitHitCountForMember()` が後衛メンバーのスキル/武器種から追撃ヒット数を動的解決
  - 解決順: 変化追撃スキル → 追撃専用スキル → キャラ例外 → 武器種フォールバック
- `pursuedHitCountByFrontPosition` Map で前衛→後衛のマッピングを管理
- `followUpOverrides` 構造はエンジン層に漏れない（`pursuedHitCount` 数値のみ渡す）

### データ層（新規ユーティリティ）

| ファイル | 責務 |
|---------|------|
| `ui-next/utils/follow-up-overrides.js` | position/enemyIndex のバリデーション・正規化・重複排除（純粋関数） |
| `ui-next/utils/follow-up-presentation.js` | UI表示チップモデル生成（純粋関数） |

### リプレイ永続化

- `REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES` として `overrideEntries` に格納
- 既存の `ACTION_OUTCOME_OVERRIDES` と同一パターンで追加・正規化・再計算を実装

---

## レビュー観点2: デグレチェック

**判定: 問題なし**

### テスト実行結果

| テストファイル | テスト数 | 結果 |
|---|---|---|
| `tests/ui-next-follow-up-overrides.test.js` | 12 | **全PASS** |
| `tests/ui-next-follow-up-integration.test.js` | 15 | **全PASS** |
| `tests/turn-state-transitions.test.js` | 398 | **全PASS** |
| `tests/ui-next-party-preset-toolbar.test.js` | 7 | **全PASS** |
| `tests/skill-classifiers.test.js` | 3 | **全PASS** |

### 既存コードへの変更箇所と影響分析

| 変更箇所 | 内容 | リスク評価 |
|---|---|---|
| `computeOdGaugeGainPercentBySkill()` | `odRateMultiplier` を1hit単位で適用する方式に変更 | **仕様改善**。od_gauge_calculation_spec.md と整合。丸め精度向上 |
| `applyOdGaugeFromActions()` | 追撃OD加算の追加 + `odRateMultiplier` 適用ロジック統合 | 追撃なし時は `pursuitOdGain=0` で加算が無効化されるため影響なし |
| `applyPassiveTimingInternal()` | `OnAdditionalTurnStart` を `isExtraActive` メンバーに限定 | **バグ修正**。398テスト全PASS |
| `commitTurn()` の `skipTurnStartRecovery` | `turnIndex` 比較ベースに変更 | **リファクタリング**。従来の条件列挙を一般化。398テスト全PASS |
| `resolveActionBreakTriggerCount()` | `breakHitCount` と `manualBreakEnemyIndexes` の統合 | ブレイク判定の正規化。既存テスト全PASS |
| `computeExpectedSupportBreakOdBonus()` | 新規関数。ブレイク時サポート共鳴OD二重加算防止 | 既存パスに副作用なし（shortfall > 0 の場合のみ差分補正） |

### od_rate 丸め位置の変更について

`od_rate` の適用が「最終値一括乗算」から「1hitごとに乗算・trunc2」に変更された。これは [specs/od_gauge_calculation_spec.md](../specs/od_gauge_calculation_spec.md) の仕様更新と一致しており、実機挙動への近似精度が向上する改善。

---

## レビュー観点3: エンジン/UIの責務分離

**判定: 適切**

| 層 | 責務 | ファイル |
|---|---|---|
| **エンジン** | `pursuedHitCount` からODゲージ計算、パッシブ発火判定 | `src/turn/turn-controller.js` |
| **ブリッジ** | 後衛メンバーからヒット数解決、followUpOverrides→actionEntry変換 | `ui-next/engine/turn-engine-manager.js` |
| **UI** | 追撃エディタ表示、チップ表示、トグル操作 | `ui-next/components/turn-row.js` |
| **ユーティリティ** | バリデーション、正規化（純粋関数） | `ui-next/utils/follow-up-overrides.js`, `ui-next/utils/follow-up-presentation.js` |

エンジンは `pursuedHitCount`（数値）のみを受け取り、「どの後衛が追撃したか」「どの敵を対象にしたか」というUI固有の概念を知らない。UI層の `followUpOverrides` 構造がエンジン層に漏れていない。

---

## 軽微な指摘事項（P4・マージブロッカーではない）

| # | 内容 | 重要度 | 対処 |
|---|---|---|---|
| 1 | `PURSUIT_HIT_COUNT_BY_WEAPON_TYPE` / `PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID` が turn-engine-manager.js にハードコード | P4 | 現時点では問題なし。データ駆動化は将来課題 |
| 2 | `PURSUIT_TRANSFORMED_SKILL_NAME = 'ネコジェット・シャテキ'` — マジック文字列 | P4 | 1件のみなので許容範囲 |
| 3 | `OverDrivePointDown` と追撃ODの合算（レビューR3 問題I） | P4 | 該当スキル未存在のため放置妥当 |

---

## レビュー履歴

| 回 | ドキュメント | 主要指摘 | 状態 |
|----|------------|---------|------|
| R1 | [follow_up_code_review.md](follow_up_code_review.md) | P0: followUp→pursuedHitCount変換欠落、P1: テストAPI不一致、P3: 名前マッチ | ✅ 全修正 |
| R2 | [follow_up_code_review_round2.md](follow_up_code_review_round2.md) | P0: OD独立計算・ヒット数解決、P1: ブレイクトグル・ビューポート | ✅ 全修正 |
| R3 | [follow_up_code_review_round3.md](follow_up_code_review_round3.md) | P2: od_rate追撃適用、P3: テストカバレッジ拡充 | ✅ 全修正 |

---

## 総合判断

**マージ可**。

- 追撃処理はエンジン/UI/ユーティリティに明確に分離されており、本体処理との結合度は低い
- 既存テスト398件 + 追撃専用27件が全PASS、デグレなし
- `od_rate` の1hit単位適用は仕様改善であり、spec更新も伴っている
- 3回のコードレビューを経て P0-P3 の問題が全て解消済み
- 残存指摘は全て P4（実害なし）

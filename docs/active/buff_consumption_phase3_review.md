# バフ消費オーケストレータ Phase 3 実装レビュー

**対象コミット**: `6078aa5` 以降（Phase 3 M1: Funnel/MindEye orchestrator接続・競合判定統合）
**レビュー実施**: 2026-03-31
**ステータス**: 🟢 進行中（M1/M2 完了確認済み / 残課題は P3-08 とドキュメント同期）

---

## 総合評価

| 観点 | 評価 |
|------|------|
| P3-01〜P3-04（Funnel/MindEye orchestrator 接続） | ✅ 完了・正常動作確認 |
| P3-07（旧関数 adapter 化） | ✅ フォールバック構造として機能 |
| P3-T01（Only vs Count 勝者選定テスト） | ✅ 2テスト確認 |
| P3-T02（Funnel/MindEye 回帰テスト） | ✅ 4テスト確認 |
| P3-T03（AdditionalTurn 統合テスト） | ✅ 追加済み（EXターン中の消費/非消費を確認） |
| P3-T04（EnemyTurnEnd 回帰テスト） | ✅ 追加済み（専用の残数減算テストを追加） |
| P3-05（TurnEnd 移行） | ✅ 実装・回帰確認済み |
| P3-08（整理） | 🟡 未着手 |
| P3-06（metadata 接続） | ✅ 実装・テスト反映済み |

---

## 1. 正しく実装されている点（M1 完了範囲）

### buildActionContext() の実装

**ファイル**: `src/turn/turn-controller.js` L10503〜10535

`OD_DAMAGE_PART_TYPES` を直接参照して `hasDamage` を判定しており、Phase 2 レビューで指摘した regex 問題は解消済み。`isTurnEndAction` / `isSystemAction` も正しく分類されている。

### evaluateCompetitiveConsumption() の実装

**ファイル**: `src/turn/turn-controller.js` L6030〜6046

1. `resolveCountOnlyCompetitionForEffects()` で初期競合解決
2. 各 effect に `shouldConsume(effect, actionContext)` を適用してフィルタリング
3. `selectedCountEffectIds` として返却

Only vs Count の既存勝者判定を維持したまま orchestrator 判定を挟む設計は正しい。

### Funnel/MindEye 消費が完全に orchestrator 経由

**ファイル**: `src/turn/turn-controller.js` L5742〜5821

```javascript
// actionContext を組み立て
const actionContext = buildActionContext(actionType, skill, { hasDamage, ... });

// orchestrator 経由で競合解決
const funnelResolution = hasDamage
  ? resolveFunnelCompetitionForAction(member, actionContext)
  : { selectedEffects: [], selectedCountEffectIds: [] };

// orchestrator 経由で消費
consumedFunnels = consumeSelectedCountStatusEffectsWithOrchestrator(
  member, 'Funnel', funnelResolution.selectedCountEffectIds, actionContext
);
```

旧コードの痕跡なし。完全に統一されている。

---

## 2. 問題点・残課題

### 対応済み①: P3-T03 — AdditionalTurn の統合テスト追加【完了】

**WBS**: 🟢（着手可能）

`turn-state-transitions.test.js` に以下を追加し、EXターン実遷移での消費判定を固定した。

- 追加テスト: `Funnel/MindEye: AdditionalTurn中も与ダメージで消費し、非ダメージでは消費しない`

**確認結果**:
- EXターン中の非ダメージ行動では Funnel/MindEye が残る
- EXターン中の与ダメージ行動で Funnel/MindEye が消費される

---

### 対応済み②: P3-T04 — EnemyTurnEnd 専用回帰テスト追加【完了】

**WBS**: 🟡（依存待ち）

`turn-state-transitions.test.js` に以下を追加し、EnemyTurnEnd 減算を専用に検証した。

- 追加テスト: `EnemyTurnEnd status expiry ticks for all active members on base turn advance`

**確認結果**:
- base turn 進行時に EnemyTurnEnd バフの `remaining` が行動/非行動メンバーともに減算される

---

### 対応済み③: validateBuffMetadata runtime 接続【完了】

**ファイル**: `src/turn/turn-controller.js` L12

```javascript
import { SHREDDING_SP_MIN, shouldConsume, validateBuffMetadata } from '../domain/character-style.js';
```

`validateBuffMetadata` の runtime 接続を実装し、warning/strict の切替を導入済み。

**反映内容**:
- `resolveBuffMetadataValidationOptions()` を追加し、`validateBuffMetadata` オプションを正規化
- `evaluateCompetitiveConsumption()` で候補評価時に metadata 検証を適用
- strict 時は不正 metadata の Count 候補を除外、warning 時は警告のみ
- commit 経路の Count 消費でも strict ブロックを適用

**テスト**:
- `tests/buff-consumption-orchestrator.test.js`
  - `evaluateCompetitiveConsumptionはwarningモードで不正metadataを警告しつつ消費候補を維持する`
  - `evaluateCompetitiveConsumptionはstrictモードで不正metadataの消費候補を除外する`
- `tests/turn-state-transitions.test.js`
  - `Funnel: strict metadata validation有効時は不正metadataのCount候補を消費しない`

---

### 対応済み④: 誤解を招くコメント "NOT YET ACTIVE"【完了】

`src/turn/turn-controller.js` の `consumeSelectedCountStatusEffectsWithOrchestrator()` ヘッダコメントを更新済み。

**更新内容**:
- `NOT YET ACTIVE` 表記を削除
- Funnel/MindEye の本番経路で利用中であること
- `actionContext` 未指定時に legacy fallback すること

---

### 対応済み⑤: TurnEnd shouldConsume 経路移行（P3-05）【完了】

`src/turn/turn-controller.js` の TurnEnd 系デクリメントを `buildActionContext('TurnEnd', ...)` + `shouldConsume()` 経由へ移行。

**反映内容**:
- `applyTurnBasedStatusExpiry()`
  - `tickStatusEffectsByExitCond('PlayerTurnEnd')` から predicate 版へ置換
  - `actionType='TurnEnd'`, `turnPhase='PlayerTurnEnd'` で判定
- `applyEnemyTurnEndDpEffects()`
  - `tickStatusEffectsByExitCond('EnemyTurnEnd')` から predicate 版へ置換
  - `actionType='TurnEnd'`, `turnPhase='EnemyTurnEnd'` で判定
- `tickEnemyStatusDurations()`
  - `shouldTickEnemyStatusOnTiming()` 内で `shouldConsume()` 判定を導入
  - unknown/legacy `exitCond` は従来フォールバックを維持

**テスト**:
- `tests/buff-consumption-orchestrator.test.js`
  - `EnemyTurnEnd型はTurnEnd/EnemyTurnEndでのみ消費する`
  - `PlayerTurnEnd型はTurnEndでもphase不一致なら消費しない`
- `tests/turn-state-transitions.test.js`
  - `PlayerTurnEnd status expiry is applied only to members who acted this turn`
  - `EnemyTurnEnd status expiry ticks for all active members on base turn advance`
  - 既存回帰一式を `node --test tests/buff-consumption-orchestrator.test.js tests/turn-state-transitions.test.js` で通過確認

---

## 3. 残タスク整理（推奨実行順）

| 優先度 | WBS ID | タスク | 担当ファイル | 状態 |
|--------|--------|--------|-------------|------|
| **完了** | P3-T03 | EX ターン中の Funnel/MindEye 消費統合テスト追加 | `tests/turn-state-transitions.test.js` | ✅ 完了 |
| **完了** | P3-T04 | EnemyTurnEnd 回帰テスト追加 | `tests/turn-state-transitions.test.js` | ✅ 完了 |
| **完了** | P3-05 | TurnEnd デクリメントの `shouldConsume(TurnEnd)` 経由移行 | `src/turn/turn-controller.js`, `src/domain/character-style.js` | ✅ 実装・回帰確認済み |
| **完了** | P3-06 | `validateBuffMetadata()` の dev/strict モード有効化 | `src/turn/turn-controller.js` | ✅ 実装・回帰確認済み |
| **低** | P3-08 | dead code 整理・コメント修正・import 整理 | `src/turn/turn-controller.js` | 🟡 次タスク |
| **ドキュメント** | P3-D01 | Phase 3 実装方針更新 | `docs/active/buff_consumption_schema.md` | 🟢 |
| **ドキュメント** | P3-D02 | `action_context_matrix.md` 差分確認 | `docs/active/action_context_matrix.md` | 🟡 |

---

## 4. テストカバレッジ現状

| カテゴリ | テスト | ファイル | 状態 |
|----------|--------|---------|------|
| Only vs Count 勝者選定 | `evaluateCompetitiveConsumption` 2件 | `buff-consumption-orchestrator.test.js` | ✅ |
| Funnel/MindEye ダメージ時消費 | 競合判定 + 消費回帰 4件 | `turn-state-transitions.test.js` | ✅ |
| PlayerTurnEnd 型バフ減算 | 行動/非行動メンバー差分 | `turn-state-transitions.test.js` L8769 | ✅ |
| AdditionalTurn shouldConsume 単体 | shouldConsume(actionType='AdditionalTurn') | `buff-consumption-orchestrator.test.js` | ✅ 単体のみ |
| AdditionalTurn バトル遷移統合 | EX ターン中の Funnel/MindEye 消費 | `turn-state-transitions.test.js` | ✅ |
| EnemyTurnEnd 回帰 | count 変化前後の検証 | `turn-state-transitions.test.js` | ✅ |
| TurnEnd 判定（unit） | Player/Enemy phase の一致/不一致を検証 | `buff-consumption-orchestrator.test.js` | ✅ |
| validateBuffMetadata strict | warning/strict の分岐と候補除外を検証 | `buff-consumption-orchestrator.test.js` | ✅ |
| validateBuffMetadata strict（統合） | Funnel Count 候補が strict で非消費になることを検証 | `turn-state-transitions.test.js` | ✅ |

---

## 5. P3-05 コードレビュー

→ [buff_consumption_p3_05_code_review.md](buff_consumption_p3_05_code_review.md)

ブロッカーなし。P3-08 向け指摘 3 件（FIND-1〜3）を記載。

2026-03-31 追記: FIND-1〜3 は以下で対応済み。
- FIND-1: TurnEnd 2経路の冗長プレフィルタを削除し `shouldConsume` 判定に一本化
- FIND-2: `shouldTickEnemyStatusOnTiming` に remaining<=0 時の legacy fallback 意図をコメント明記
- FIND-3: `buildActionContext('TurnEnd', ...)` を経由する unit test を追加

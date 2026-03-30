# バフ消費オーケストレータ Phase 3 実装レビュー

**対象コミット**: `6078aa5` 以降（Phase 3 M1: Funnel/MindEye orchestrator接続・競合判定統合）
**レビュー実施**: 2026-03-31
**ステータス**: 🟢 進行中（M1 完了確認済み / M2・M3 は残課題）

---

## 総合評価

| 観点 | 評価 |
|------|------|
| P3-01〜P3-04（Funnel/MindEye orchestrator 接続） | ✅ 完了・正常動作確認 |
| P3-07（旧関数 adapter 化） | ✅ フォールバック構造として機能 |
| P3-T01（Only vs Count 勝者選定テスト） | ✅ 2テスト確認 |
| P3-T02（Funnel/MindEye 回帰テスト） | ✅ 4テスト確認 |
| P3-T03（AdditionalTurn 統合テスト） | ⚠️ 単体のみ・統合テスト未実装 |
| P3-T04（EnemyTurnEnd 回帰テスト） | ⚠️ PlayerTurnEnd のみ・EnemyTurnEnd 専用未実装 |
| P3-05 / P3-06 / P3-08（TurnEnd 移行・metadata 接続・整理） | 🟡 未着手（WBS どおり） |

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

### 問題①: P3-T03 — AdditionalTurn の統合テストが未実装【高】

**WBS**: 🟢（着手可能）

`buff-consumption-orchestrator.test.js` に `shouldConsume()` の単体テスト（`actionType='AdditionalTurn', hasDamage=true`）は存在する。
しかし、`turn-state-transitions.test.js` に **EX ターン中の実際のバトル遷移を通じた統合テストが存在しない**。

**リスク**:
`shouldConsume()` 単体が正しくても、EX ターンの行動フローで `buildActionContext('AdditionalTurn', skill, {...})` が正しく組み立てられ → `evaluateCompetitiveConsumption()` → `consumeSelectedCountStatusEffectsWithOrchestrator()` まで通るパスが未担保。このチェーンのどこかに問題があっても現行テストでは検知できない。

**対処**: `turn-state-transitions.test.js` に以下を追加する。
- EX ターン中にダメージスキルを使用した場合、Funnel/MindEye が消費されること
- EX ターン中に非ダメージスキルを使用した場合、消費されないこと

---

### 問題②: P3-T04 — EnemyTurnEnd 専用回帰テストが未実装【中】

**WBS**: 🟡（依存待ち）

PlayerTurnEnd の回帰テストは `turn-state-transitions.test.js` L8769 に存在する。
EnemyTurnEnd は使用例多数あるが **count 変化前後を確認する専用テストが存在しない**。

**リスク**:
PlayerTurnEnd/EnemyTurnEnd が対称的な挙動をする前提が未検証。P3-05（TurnEnd 移行）の実装後にも必要。

---

### 問題③: validateBuffMetadata が未使用 import【低〜中】

**ファイル**: `src/turn/turn-controller.js` L12

```javascript
import { SHREDDING_SP_MIN, shouldConsume, validateBuffMetadata } from '../domain/character-style.js';
```

`validateBuffMetadata` は import されているが **呼び出し箇所ゼロ**。

**副次的問題**:
P3-08（dead code 整理）の依存先に P3-06 が含まれる。P3-06 の方針（dev フラグ経由 or always-on）を先に確定しないと、P3-08 で import を削除してしまった後に P3-06 を着手できなくなる。

**推奨**: P3-06 の接続方針を確定してから P3-08 に着手すること。

---

### 問題④: 誤解を招くコメント "NOT YET ACTIVE"【低】

**ファイル**: `src/turn/turn-controller.js` L6099 付近

```javascript
/**
 * [PHASE 3.1 INTEGRATION POINT - NOT YET ACTIVE]
 * This function demonstrates how the new shouldConsume() orchestrator would be integrated
 * into the existing consumption flow. Currently non-functional pending Phase 3 approval.
 */
function consumeSelectedCountStatusEffectsWithOrchestrator(...)
```

**実態**: この関数は L5810-5821 で本番フローから呼ばれており **実際にアクティブ**。

**リスク**: コードを読む人が「まだ無効化されている」と誤認して触れない、または誤操作するリスクがある。

**推奨**: P3-08 時にコメントを削除または内容を更新すること。

---

## 3. 残タスク整理（推奨実行順）

| 優先度 | WBS ID | タスク | 担当ファイル | 状態 |
|--------|--------|--------|-------------|------|
| **高** | P3-T03 | EX ターン中の Funnel/MindEye 消費統合テスト追加 | `tests/turn-state-transitions.test.js` | 🟢 着手可能 |
| **中** | P3-T04 | EnemyTurnEnd 回帰テスト追加 | `tests/turn-state-transitions.test.js` | 🟡 P3-05 前に追加可能 |
| **中** | P3-05 | TurnEnd デクリメントの `shouldConsume(TurnEnd)` 経由移行 | `src/turn/turn-controller.js`, `src/domain/character-style.js` | 🟡 |
| **中** | P3-06 | `validateBuffMetadata()` の dev/strict モード有効化 | `src/turn/turn-controller.js` | 🟡 方針確定が先 |
| **低** | P3-08 | dead code 整理・コメント修正・import 整理 | `src/turn/turn-controller.js` | 🟡 P3-06 完了後 |
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
| **AdditionalTurn バトル遷移統合** | **EX ターン中の Funnel/MindEye 消費** | `turn-state-transitions.test.js` | **❌ 未実装** |
| **EnemyTurnEnd 回帰** | **count 変化前後の検証** | `turn-state-transitions.test.js` | **❌ 未実装** |
| validateBuffMetadata strict | Eternal + remaining=0 | `buff-consumption-orchestrator.test.js` | ✅ |

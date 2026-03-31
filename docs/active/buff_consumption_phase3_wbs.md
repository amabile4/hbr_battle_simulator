# バフ消費オーケストレータ Phase 3 残課題整理・WBS

> 最終更新: 2026-04-01  
> 対象: Funnel / MindEye / SpecialStatus / TurnEnd 系の消費判定統合（Phase 3）
> 前提: Phase 2 は完了（`shouldConsume()` 実装済み、呼び出し側未接続）
> 進捗メモ: M1 完了。Funnel / MindEye の orchestrator 接続、競合判定統合、単体/統合回帰を実装済み。

---

## 1. 目的と完了条件

## 1.1 Phase 3 の目的

Phase 2 で追加済みの下記関数を、実際の実行フローに接続する。

- `shouldConsume(effect, actionContext, options)`
- `buildActionContext(actionType, skill, options)`
- `validateBuffMetadata(effect)`

「いつ消費するか」の判定を呼び出し側ごとの個別 if から、`shouldConsume()` 経由へ段階移行する。

## 1.2 完了条件（Definition of Done）

1. Funnel / MindEye の消費判定が `shouldConsume()` 経由で実行される。  
2. 競合判定（Only vs Count）は既存仕様どおり維持される。  
3. TurnEnd 系の消費処理で `ActionContext(TurnEnd)` を使用する。  
4. 既存テスト + Phase 3 追加テストが pass する。  
5. `docs/active/action_context_matrix.md` と挙動差分がない。

---

## 2. 現状（2026-03-30）

## 2.1 実装済み（Phase 2 + Phase 3 M1）

- `src/domain/character-style.js`
  - `shouldConsume()` 実装済み
  - `shouldConsumeCountType()` は `AdditionalTurn` 対応済み
  - `validateBuffMetadata()` の Eternal 判定修正済み
- `src/turn/turn-controller.js`
  - `buildActionContext()` 実装済み
  - `evaluateCompetitiveConsumption()` を追加し、Only vs Count の既存勝者判定を維持したまま `shouldConsume()` 判定を接続済み
  - `consumeSelectedCountStatusEffectsWithOrchestrator()` を実処理化し、Funnel / MindEye の消費を orchestrator 経由へ切替済み
- `tests/buff-consumption-orchestrator.test.js`
  - competitive consumption の単体テスト追加済み
- `tests/turn-state-transitions.test.js`
  - Funnel / MindEye の通常攻撃非消費・非ダメージ非消費・与ダメージ消費回帰を追加済み

## 2.2 未完了（Phase 3 残課題）

- Count 系手動消費（SpecialStatus 含む）は一部で個別 predicate が残っている
- TurnEnd 系デクリメントは `tickStatusEffectsByExitCond()` 直接呼び出し
- metadata 検証（`validateBuffMetadata()`）が runtime で未接続
- `docs/active/action_context_matrix.md` との差分確認と完了レビュー作成が未着手

---

## 3. スコープ

## 3.1 In Scope

- Funnel / MindEye のアクション時消費
- Count 系手動消費（SpecialStatus 含む）の統一入口化
- TurnEnd（Player / Enemy）の統一判定導入
- 実装に必要な unit test / integration test 更新

## 3.2 Out of Scope（Phase 4 以降）

- 旧関数の完全削除（互換層を残す）
- 全 predicate 消費 API の統合置換
- 仕様変更（消費ルールそのものの変更）

---

## 4. WBS（作業分解）

## 4.1 ステータス定義

| 記号 | 意味 |
|------|------|
| ✅ | 完了 |
| 🟢 | 着手可能 |
| 🟡 | 依存待ち |
| 🔴 | ブロッカー |

## 4.2 実装WBS

| ID | タスク | 主要変更箇所 | 依存 | ステータス |
|----|--------|-------------|------|-----------|
| P3-01 | ActionContext ファクトリの呼び出し点を特定し統一入口を決定 | `src/turn/turn-controller.js` | - | ✅ |
| P3-02 | Funnel/MindEye 用 `evaluateCompetitiveConsumption()` を実装 | `src/turn/turn-controller.js` | P3-01 | ✅ |
| P3-03 | `consumeSelectedCountStatusEffectsWithOrchestrator()` を実処理化 | `src/turn/turn-controller.js` | P3-02 | ✅ |
| P3-04 | Funnel/MindEye 呼び出し側を orchestrator 経由へ差し替え | `src/turn/turn-controller.js` | P3-03 | ✅ |
| P3-05 | TurnEnd デクリメントの一部を `shouldConsume(TurnEnd)` 経由へ移行 | `src/turn/turn-controller.js`, `src/domain/character-style.js` | P3-01 | 🟡 |
| P3-06 | runtime で `validateBuffMetadata()` を dev/strict モードで有効化 | `src/turn/turn-controller.js` | P3-01 | ✅ |
| P3-07 | 後方互換のため旧関数を adapter 化（削除しない） | `src/turn/turn-controller.js` | P3-04 | ✅ |
| P3-08 | dead code/未使用 import の最終整理 | `src/turn/turn-controller.js`, `src/domain/character-style.js` | P3-04,P3-05 | 🟡 |

## 4.3 テストWBS

| ID | タスク | テスト種別 | 対象 | ステータス |
|----|--------|----------|------|-----------|
| P3-T01 | `evaluateCompetitiveConsumption()` 単体テスト | unit | Only vs Count 勝者選定 | ✅ |
| P3-T02 | Funnel/MindEye の通常攻撃非消費・Skill消費回帰 | integration | `tests/turn-state-transitions.test.js` | ✅ |
| P3-T03 | AdditionalTurn で Count 消費する回帰 | integration | `tests/turn-state-transitions.test.js` | ✅ |
| P3-T04 | TurnEnd 統合後の PlayerTurnEnd / EnemyTurnEnd 回帰 | integration | `tests/turn-state-transitions.test.js` | ✅※ |
| P3-T05 | metadata 不正時の検知（strict モード） | unit | `validateBuffMetadata` 接続点 | ✅ |

※ 現時点では EnemyTurnEnd 専用回帰テストを追加済み。`shouldConsume(TurnEnd)` への経路移行（P3-05）後に再確認を行う。

## 4.4 ドキュメントWBS

| ID | タスク | 対象ドキュメント | ステータス |
|----|--------|------------------|-----------|
| P3-D01 | Phase 3 実装方針の更新 | `docs/active/buff_consumption_schema.md` | 🟢 |
| P3-D02 | マトリクス差分がないことを追記 | `docs/active/action_context_matrix.md` | 🟡 |
| P3-D03 | Phase 3 完了レビュー作成 | `docs/active/buff_consumption_phase3_review.md`（新規） | ✅ |

---

## 5. 実行順（推奨）

1. P3-01: 統一入口の確定（呼び出し位置の固定）  
2. P3-02, P3-03: 競合判定付き orchestrator 実装  
3. P3-04: Funnel/MindEye の切替  
4. P3-T01, P3-T02, P3-T03: 先に回帰固定  
5. P3-05: TurnEnd 側の段階移行  
6. P3-06: metadata 検証の接続  
7. P3-08: dead code/未使用 import の最終整理  
8. P3-D01〜D03: ドキュメント同期

---

## 6. リスクと対策

| リスク | 内容 | 対策 |
|--------|------|------|
| 競合判定の挙動変化 | Only vs Count の勝者が変わる | P3-T01 で power 比較ケースを固定化 |
| 行動種別の誤分類 | hasDamage/actionType の取り違え | `buildActionContext()` を唯一の入口に統一 |
| TurnEnd 回帰 | 既存のターン減衰が変わる | P3-T04 を追加し段階適用 |
| metadata 既存不整合 | strict 有効化で警告多発 | strict フラグ配下で段階導入 |

---

## 7. マイルストーン

| マイルストーン | 内容 | 目安 |
|----------------|------|------|
| M1 | Funnel/MindEye の orchestrator 接続完了（P3-04まで） | Phase 3 前半 |
| M2 | TurnEnd 統合 + 回帰テスト完了（P3-05, P3-T04） | Phase 3 中盤 |
| M3 | metadata 検証接続 + ドキュメント完了（P3-06, P3-D03） | Phase 3 完了 |

---

## 8. 参照

- [docs/active/buff_consumption_phase2_review.md](docs/active/buff_consumption_phase2_review.md)
- [docs/active/buff_consumption_schema.md](docs/active/buff_consumption_schema.md)
- [docs/active/action_context_matrix.md](docs/active/action_context_matrix.md)
- [docs/active/mindeye_only_count_integration_assessment.md](docs/active/mindeye_only_count_integration_assessment.md)

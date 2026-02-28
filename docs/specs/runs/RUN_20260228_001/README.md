# RUN_20260228_001 - HBR Battle Simulator 中核3システム設計

**実施日**: 2026-02-28
**リーダー**: Claude (claude-sonnet-4-6)
**参加者**: Codex (GPT-5-Codex), Gemini (gemini-2.0-flash), Claude (claude-sonnet-4-6)
**総合判定**: **条件付き可能**

---

## 設計対象

| システム | 担当 | ファイル |
|---------|------|--------|
| キャラクター（スタイル）Class | Codex | codex_character_class_design.md |
| ターン制御システム | Gemini | gemini_turn_control_design.md |
| 行動記録システム | Claude | claude_action_record_design.md |

---

## 成果物一覧

### Phase 1: 設計提案
| ファイル | 内容 | 担当 |
|---------|------|------|
| `codex_character_class_design.md` | キャラクター(スタイル)Class TypeScript設計 | Codex |
| `gemini_turn_control_design.md` | ターン制御システム TypeScript設計 | Gemini |
| `claude_action_record_design.md` | 行動記録システム TypeScript設計 | Claude |

### Phase 2: 相互レビュー（ローテーション）
| ファイル | 内容 | レビュアー | 対象 |
|---------|------|------------|------|
| `codex_review_of_gemini.md` | Geminiターン制御設計レビュー | Codex | Gemini設計 |
| `gemini_review_of_claude.md` | Claude行動記録設計レビュー | Gemini | Claude設計 |
| `claude_review_of_codex.md` | Codexキャラクタークラス設計レビュー | Claude | Codex設計 |

### Phase 3: 統合仕様
| ファイル | 内容 |
|---------|------|
| `integrated_architecture_spec.md` | システム境界・依存方向・統合TypeScript定義 |
| `interfaces.ts` | TypeScriptインターフェース定義（完全版） |
| `decision_log.md` | 意思決定ログ（DEC-001〜012） |

### Phase 4: 実現可能性評価
| ファイル | 内容 | 担当 |
|---------|------|------|
| `codex_feasibility.md` | キャラクタードメイン視点評価 | Codex |
| `gemini_feasibility.md` | ターン制御視点評価 | Gemini |
| `claude_feasibility.md` | 行動記録視点評価 | Claude |

### Phase 5: 最終成果物
| ファイル | 内容 |
|---------|------|
| `final_judgment.md` | 最終判定書・可能化修正セット |
| `open_questions.md` | ユーザー確認事項一括一覧（10件） |
| `README.md` | 本ファイル（run索引） |
| `manifest.json` | 成果物メタデータ |

---

## 主要設計決定（DEC-001〜012）

| ID | 決定内容 |
|----|---------|
| DEC-001 | BattleState共有型をshared-types.tsに配置 |
| DEC-002 | turnId=sequenceIdに統一（R7確定準拠） |
| DEC-003 | CSV列はinitialParty.partyIndex順で固定 |
| DEC-004 | ExtraTurnState構造体を新設（連続extra管理） |
| DEC-005 | odLevel: 0\|1\|2\|3 をTurnStateに追加 |
| DEC-006 | swapEventsをpreview段階でも保持 |
| DEC-007 | ActionEntry.isExtraAction フラグ追加 |
| DEC-008 | ダメージ計算は拡張ポイント定義のみ（v1未実装） |
| DEC-009 | SP凍結ルールはR10確定の統一式で解釈 |
| DEC-010 | odPending発火時のodContext='interrupt' |
| DEC-011 | CharacterSnapshot型をCharacterStateとは独立定義 |
| DEC-012 | EffectSlot.source仮確定値（要ユーザー確認） |

---

## 総合判定

```
条件付き可能

主要条件:
1. Q-S001: preview/commit二重適用防止の設計方針確定（Must）
2. BattleState移行Adapter層の先行実装
3. 純粋関数群（applySpChange等）から段階的実装開始

実装推奨順:
STEP1 → 純粋関数ユニット実装・テスト
STEP2 → BattleState + Adapter
STEP3 → TurnController移行
STEP4 → RecordEditor + CSV移行
```

---

## 参照根拠

- `json/new_skill_database.schema.json` - スキルデータスキーマ
- `js/globals.js` - 現行グローバル変数・CONFIG定義
- `js/control-manager.js` - 現行ターン制御実装
- `js/party-manager.js` - 現行パーティー管理実装
- `js/results-manager.js` - 現行結果表示実装
- `spec_review_state.json` - R1-R10 agreed_v1確定事項

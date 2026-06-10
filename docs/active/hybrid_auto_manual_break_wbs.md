# hybrid_auto_manual_break_wbs

- ステータス: 🟢 進行中
- 作成日: 2026-06-10
- 最終更新: 2026-06-10
- 対象: 自動計算（DPブレイク/HP破壊/討伐）と手動オーバーライドのハイブリッド運用

## 1. 背景

ユーザー要件:

- 自動でDPブレイク/HP討伐してよい
- ただし手動で取り消し・再指定した結果が、再計算後も維持されること
- JSON保存/読込後も同じ結果になること

代表シナリオ:

- 自動で #3 がブレイク
- ユーザーが #3 を取り消し、#4 に手動ブレイク指定
- 再計算/JSON再読込後に #3 が復活せず、#4 が保持されること

## 2. 現状と問題点

## 2.1 現状の強み

- `actionOutcomeOverrides` は replay turn に正規化して保存される
- session 保存/読込時に replay script は normalize される
- 手動重複の除去や不正値の正規化は実装済み

## 2.2 問題点（矛盾リスク）

1. 自動判定の抑止情報がない
- 「この敵の自動ブレイクを無効化」状態を保存できない

2. 再計算で自動判定が再導出される
- 手動取消後でも、条件が揃えば同じ自動結果が復活し得る

3. 手動結果と自動結果の優先順位が不足
- 手動指定を最優先にする包括ポリシーがない

4. 仕様の明文化不足
- Auto / Manual / Hybrid の意味と優先順位がコード全体で統一されていない

## 3. 目標仕様（提案）

## 3.1 判定モード

- `Auto`: 現行どおり自動判定のみ
- `Manual`: 自動判定を使わず、手動指定のみ適用
- `Hybrid`: 自動判定 + 手動指定

## 3.2 Hybrid の優先順位

1. 手動抑止（manual cancel）
2. 手動強制（manual break/hpBreak/kill）
3. 自動判定

## 3.3 永続化要件

- turn ごとに以下を保存
  - mode
  - manual outcome overrides
  - auto outcome suppression（抑止対象）

## 4. データモデル拡張案

## 4.1 ReplayTurn 追加フィールド

- `actionOutcomePolicy`（例）
  - `mode`: `auto|manual|hybrid`
  - `suppressAutoBreakEnemyIndexesByPosition` などの抑止情報

## 4.2 後方互換

- 旧データ読込時は `mode=hybrid` とし、抑止なしで現行互換
- normalize 時に欠損フィールドを補完

## 5. WBS

## WBS-A: 仕様確定

1. A-1 用語定義（break/hpBreak/kill, auto/manual/hybrid）
2. A-2 優先順位仕様確定
3. A-3 JSON互換方針確定

完了条件:
- 仕様ドキュメントと受け入れシナリオが承認される

## WBS-B: データモデル

1. B-1 `lightweight-replay-script` 型拡張
2. B-2 `normalizeLightweightReplayTurn` で新フィールド正規化
3. B-3 session snapshot 経路に新フィールドを通す

完了条件:
- save/load 往復で新フィールドがロスしない

## WBS-C: エンジン適用

1. C-1 自動判定前に suppression を参照するフックを追加
2. C-2 `Manual` モード時は自動判定を無効化
3. C-3 `Hybrid` モード時は優先順位順に統合
4. C-4 warning 出力を replay diagnostics に記録

完了条件:
- 代表シナリオで再計算しても結果が不変

## WBS-D: UI

1. D-1 ターン行のモード切替UI（auto/manual/hybrid）
2. D-2 手動取消を suppression として編集可能にする
3. D-3 競合時の可視化（例: auto suppressed バッジ）

完了条件:
- ユーザー操作のみで意図どおり設定できる

## WBS-E: テスト

1. E-1 unit: normalize/merge/priority
2. E-2 integration: commit→recalculate 一貫性
3. E-3 persistence: save→load→recalculate 一貫性
4. E-4 e2e: #3取消→#4手動指定シナリオ

完了条件:
- シナリオ再現テストが安定通過

## WBS-F: 移行・ドキュメント

1. F-1 旧セッション移行仕様を docs に追記
2. F-2 UI 操作ガイド更新
3. F-3 開発者向け設計メモ更新

完了条件:
- 仕様と実装の差分が docs で追跡可能

## 6. 実装優先度

1. B（モデル）
2. C（エンジン）
3. E（テスト）
4. D（UI）
5. F（文書）

理由:
- 先にモデル/エンジンを固定しないと UI だけ先行しても挙動が不安定になるため

## 7. 既知の注意点

1. 自動判定はヒット数・DP残量・属性条件に依存し再計算で変化しやすい
2. suppression の粒度を粗くすると意図しない抑止が起こる
3. 旧 `overrideEntries` との二重表現が残ると再現性が落ちる

## 8. 次のAI向け実装提案

1. まず `actionOutcomePolicy` を ReplayTurn canonical field として追加
2. `normalizeActionOutcomeOverridesForState` 前後で suppression 適用点を1箇所に統一
3. 代表シナリオ（#3取消→#4手動）を赤テスト化してから実装
4. save/load 往復テストを必須ゲートにする

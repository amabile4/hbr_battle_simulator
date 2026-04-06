# T34 フォローアップタスクリスト

> ステータス: 🟢 進行中
> 作成日: 2026-04-06
> 最終更新: 2026-04-06
> 元タスク: [t34_enemy_status_management_plan_wbs.md](t34_enemy_status_management_plan_wbs.md)（✅ 完了）
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 概要

T34（敵状態変化管理・表示）本体の WBS-1〜5 は完了しクローズ済み。
ここでは T34 から分離した残タスク・フォローアップを管理する。

## 残タスク一覧

### 1. WBS-3e: enemy 関連メニュー統合（T34-UI-Stage2）

目的: break / follow-up / enemy status の対象選択 UI を共通化し、重複導線を削減する

作業:

- [ ] 共通の enemy selector component を設計する
- [ ] break / follow-up / enemy status の対象選択 UI を共通 component へ集約する
- [ ] 既存操作（break/follow-up）の回帰なしを test で固定する

完了条件:

- 共通 enemy selector で break/follow-up/enemy status が統一操作で使える
- 既存 break/follow-up テストに回帰がない

### 2. WBS-4 テスト残件

#### 2a. unit テスト（未充足分）

- [ ] status 付与/更新/消滅の純ロジック unit テスト
- [ ] 表示フォーマット unit テスト

#### 2b. E2E テスト（WBS-4d-a9+）

- [ ] fixture 読込後に turn row / popup / enemy panel の表示が一致
- [ ] commit 後の残ターン更新が一致
- [ ] 付与 → 残ターン更新 → 消滅を1シナリオで追跡可能
- [ ] 旧 record（`enemyStatusSnapshot` なし）との互換表示を検証

#### 2c. UI フォーマット統一

- [ ] アイコン/ラベル/残ターン表示のフォーマット統一（WBS-3 未完了分）

### 3. T34-FU1: per-source instance 管理（設計ゲートで分離済み）

目的: C-2 選択肢B（`effectId` 単位の per-source instance 管理）を設計・実装する

- [ ] identity model 変更の影響範囲（engine/UI/tests）を文書化する
- [ ] 既存 merged 前提テストとの差分移行計画を提示する

## 対象ファイル

- `ui-next/components/turn-row.js` — enemy selector 統合
- `ui-next/components/enemy-detail-popup.js` — popup 連携
- `ui-next/utils/enemy-status-display.js` — 表示フォーマット
- `tests/e2e/*.spec.js` — E2E テスト
- `tests/enemy-status-display.test.js` — unit テスト拡充

## テスト実行コマンド

```bash
# 統合テスト（T34 本体で確立済み）
node --test tests/t34-enemy-status-integration.test.js

# 表示 unit テスト
node --test tests/enemy-status-display.test.js

# 全テスト
node --test
```

## 参考: T34 本体の完了サマリ

- WBS-1 設計: ✅ 敵 status モデル整理・Cover セマンティクス確定
- WBS-2 実装: ✅ replay/再計算接続・enemyStatusSnapshot
- WBS-3 UI: ✅ enemy-status-display / turn-row / enemy-detail-popup / 敵状態確認ボタン
- WBS-4 テスト: ✅ integration（4a/4b/4c）・unit（a1-a11）・受け入れ検証（WBS-5-①〜⑤）
- WBS-5 受け入れ検証: ✅ 付与/更新/消滅/Cover/UI整合（全877テスト PASS）
- T34-FU2: ✅ レビュー Minor 指摘フォローアップ（定数集約・action-flow 共通化・onClose 修正）

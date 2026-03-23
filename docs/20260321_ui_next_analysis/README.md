# UI Next アーキテクチャ・仕様分析

> **実施日**: 2026-03-21
> **目的**: `src/` エンジン部分と `ui-next/` UI画面部分を分析し、現在の仕様をドキュメント化
> **ステータス**: 📦 スナップショット（変更しない）

---

## 概要

このフォルダには、`wip/passive-timing-audit-20260321` ブランチで開発中の `ui-next/` 機能について、`src/` エンジン部分と `ui-next/` UI画面部分を分析したドキュメントが含まれています。

分析の目的は、現在の仕様を体系的に把握し、他の生成AIがコードベースの構造と仕様を迅速に理解できるようにすることです。

## ドキュメント一覧

| ドキュメント | 概要 |
|-------------|------|
| [ui_next_architecture_overview.md](ui_next_architecture_overview.md) | UI Next 全体アーキテクチャ概要：エンジン層とUI層の責務分離・データフロー・主要コンポーネント |
| [ui_next_party_setup_spec.md](ui_next_party_setup_spec.md) | UI Next Party Setup 仕様：6スロット編成・メイン/サポート選択・設定項目・プリセット機能 |
| [ui_next_turn_row_spec.md](ui_next_turn_row_spec.md) | UI Next Turn Row 仕様：1ターン分のUI・未コミット/コミット済み行・スキル選択・OD管理・ブレイク編集 |
| [ui_next_turn_engine_manager_spec.md](ui_next_turn_engine_manager_spec.md) | UI Next TurnEngineManager 仕様：リプレイスクリプト管理・preview/commit・再計算・特殊操作管理 |
| [ui_next_data_flow.md](ui_next_data_flow.md) | UI Next データフロー：ユーザー操作からエンジン実行までのデータフロー詳細 |
| [ui_next_component_interaction.md](ui_next_component_interaction.md) | UI Next コンポーネント間相互作用：コンポーネント階層・コールバック連携・データの流れ |

## 分析の範囲

### エンジン層（`src/`）

- **adapter-core.js**: エンジン層へのブリッジ、previewTurnRecord/commitTurnRecord
- **turn-controller.js**: ターン制御ロジックの核心
- **data-store**: HbrDataStoreによるデータ管理
- **contracts**: LightweightReplayScript, TurnAction, BattleStateなどのデータ構造

### UI層（`ui-next/`）

- **app.js**: アプリケーションルート
- **components/**: PartySetupController, TurnAreaController, TurnRowControllerなど
- **engine/**: TurnEngineManagerによるリプレイスクリプト管理

## 主要な発見

1. **明確な責務分離**: エンジン層とUI層が明確に分離されており、データフローが整理されている
2. **リプレイスクリプト正本化**: LightweightReplayScriptが正本となり、recordは派生物として扱われている
3. **再計算可能な設計**: 過去ターンの編集に対応した柔軟な再計算機構
4. **ステート不変性**: エンジン実行中のstate不変性が維持されている

## 関連ドキュメント

- [docs/active/ui_next_implementation_tasklist.md](../active/ui_next_implementation_tasklist.md) - UI Next 実装タスクリスト
- [docs/active/ui_next_design.md](../active/ui_next_design.md) - UI Next 設計メモ
- [docs/specs/ui_next_game_rules_index.md](../specs/ui_next_game_rules_index.md) - 旧実装参照インデックス

## 注記

この分析は `wip/passive-timing-audit-20260321` ブランチ（2026-03-21時点）の実装に基づいています。今後の実装進捗に応じて、内容が更新される可能性がありますが、このスナップショット自体は変更されません。
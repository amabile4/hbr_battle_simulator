# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際にClaude Code (claude.ai/code) にガイダンスを提供します。

## プロジェクト概要

これは「ヘブンバーンズレッド」のバトルシミュレータです。プレイヤーが戦闘行動を計画・記録するためのWebベースの戦術シミュレータで、特にSP（スキルポイント）管理とパーティー編成に焦点を当てています。

## アーキテクチャ

プロジェクトはモジュラーなHTML/CSS/JavaScript構成を使用：

- **HTML**: `hbr_gui_simulator_modular.html` - メインアプリケーション
- **CSS**: `/css/`フォルダで各UIセクション別に整理
- **JavaScript**: `/js/`フォルダで責任別にモジュール分割
- **データ**: `skillDatabase.json` - キャラクターとスキルデータ

### 主要JavaScriptモジュール

- `globals.js` - グローバル変数と設定
- `data-manager.js` - データ読み込み・管理
- `party-manager.js` - パーティー編成・設定
- `display-manager.js` - UI表示・更新
- `event-handlers.js` - ユーザー操作・スキル管理
- `control-manager.js` - 戦闘制御・ターン管理
- `results-manager.js` - 結果表示・テーブル管理

## 核となる概念

### 戦闘システム

- **パーティー**: 6人編成（ポジション1-6）
- **配置**: 前衛（1-3）が行動可能、後衛（4-6）は待機
- **SP管理**: 各キャラクターのスキルポイント（0-20+）、毎ターン回復
- **ターンシステム**: 通常ターン、オーバードライブ（OD1-3）、追加ターンを含む

### 主要機能

- パーティー編成と配置入れ替え
- スキル選択とSPコスト管理  
- ターン別戦闘記録
- Google Spreadsheet互換のCSV出力

## 開発方法

クライアントサイドWebアプリケーションでビルド不要：

1. **ローカル実行**: `hbr_gui_simulator_modular.html`をブラウザで開く
2. **テスト**: ブラウザ開発者ツールでデバッグ
3. **データ編集**: `skillDatabase.json`でキャラクター・スキル変更

## ファイル構造

```
/css/              - UIセクション別スタイルシート
/js/               - 責任別JavaScriptモジュール
skillDatabase.json - キャラクター・スキルデータ
*.html             - アプリケーションエントリポイント
*.md               - ドキュメントファイル
```

## 重要な注意点

- 日本のゲームシミュレータでUIテキストは日本語
- SP回復、ターン種別、パーティー配置を含む複雑な戦闘状態を管理
- Google Spreadsheet互換の特定CSV形式でデータ出力
- モジュラー設計により保守性と機能追加が容易

## Branch And Merge Conventions

- `main` は安定した共通土台であり、共有アセット、共有 resolver、共有 contract、既存 engine の確定 bugfix を入れる正本ブランチとして扱う。
- 既存 engine 改修は `feature/engine-<topic>`、新 UI は `feature/ui-next-<topic>` の命名を基本とする。
- `feature/ui-next-*` は新 UI 専用ブランチとして扱い、既存ページの直接改造ではなく、新規ページや新規 UI ルートでの実装を優先する。
- engine bugfix や shared 変更を `feature/ui-next-*` 側だけで正本化しない。再利用する変更は、原則 `main` に先に入れるか、`feature/engine-*` から `main` へ入れてから `ui-next` 側へ取り込む。
- `feature/ui-next-*` と `feature/engine-*` の間で直接 merge する運用は原則避け、共有変更は `main` を経由して伝播させる。
- `feature/ui-next-*` は `main` を定期的に取り込み、engine 側の bugfix や shared 変更を追従してよい。履歴の分かりやすさを優先し、必要なら `merge main` を選んでよい。
- 片方のブランチだけで使う試験実装を shared 層へ先に混ぜない。shared 化するのは、複数ブランチで使うことが明確になってからにする。

## Documentation Conventions

- `docs/` 内のファイルを参照・更新する際は、必ず `docs/README.md` を確認し、記載のドキュメント管理ルールに従うこと。
- 実装タスクの完了時は、対応ドキュメントのステータス更新を実装とセットで行うこと（必須）。

## E2Eテストに関するAIアシスタントへの指示（テスターとしてのロールとルール）

- AIアシスタントはE2E担当のテスターとして振る舞うこと。
- `http://localhost:4173/ui/index.html` を開いてE2EテストをPlaywrightで実施する。
- 触って良い（編集・作成して良い）のは、`tests/e2e` ディレクトリの中だけとする。アプリケーションの本体コードは変更しないこと。

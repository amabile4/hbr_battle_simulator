# シミュレーターデータ更新運用

**ステータス**: 📚 参照  
**最終更新**: 2026-07-02

## 起動方法

シミュレーターの `json/` と `assets/` を更新するときは、ローカルスキル `$refresh-simulator-data`（Codex / Claude Code 共通、`~/ai-skills/refresh-simulator-data` を正本に各ツールへリンク）を使用する。

次の自然文を起動フレーズとして扱う。

- 「シミュレータデータ更新をしましょう」
- 「シミュレーターデータを更新して」
- 「新しい JSON/assets データを取り込みたい」

明示的に指定する場合は「`$refresh-simulator-data` を使って更新して」と依頼する。

## 情報境界

- リポジトリ内では、更新手順をスキル名 `$refresh-simulator-data` で表現する。
- 取得元の固有名、URL、commit ID、clone 手順を、docs、コード、コメント、テスト、commit message、PR、issue に記載しない。
- ローカルスキルの手順本文をリポジトリへ複製しない。

## 完了条件

スキルに従って受領データを検証・反映し、JSON のパース、対象差分、必要なテスト、情報境界を確認してから更新完了とする。

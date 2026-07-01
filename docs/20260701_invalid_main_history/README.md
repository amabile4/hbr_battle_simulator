# 無効化された旧 `main` 履歴

- ステータス: 📦 スナップショット
- 記録日: 2026-07-01
- 対象リポジトリ: `amabile4/hbr_battle_simulator`

## 結論

2026-06-30 時点の旧 `main` 先端 `6c47ac5fad552605c8a148df2c1ea43a11fee048` は、誤った統合履歴を含むため正本として扱わない。
PR #22 による再統合後の `main`、`dd58e9ed644aaa5a413c1c156828cf5d1d509e4b` 以降を正本とする。

旧履歴は監査可能性のため削除せず保持するが、以下のコミットを merge、rebase、cherry-pick、差分比較の基準に使用してはならない。

## 無効コミット

| コミット | 件名 | 判定 |
|---|---|---|
| `8c7015a5585fe63c1e0ad8364a9c35753d6220d7` | `Merge branch 'main' into feature/integrate-hbr-calc` | 無効。旧 `main` の誤統合を計算機精緻化系統へ取り込んだ履歴 |
| `d0a1dd27656e127844d3b78ef814f86d84c289f9` | `fix: マージ後のテスト失敗を修正` | 無効。上記の誤統合を前提とした修正 |
| `6c47ac5fad552605c8a148df2c1ea43a11fee048` | `Merge branch 'feature/integrate-hbr-calc'` | 無効。置換前の旧 `main` 先端 |

無効履歴の識別用 annotated tag:

- `invalid/claude-automerge-main-20260701` → `6c47ac5fad552605c8a148df2c1ea43a11fee048`

## 有効な参照先

| 用途 | 参照先 | コミット |
|---|---|---|
| 現在の統合済み正本 | `main` | `dd58e9ed644aaa5a413c1c156828cf5d1d509e4b` 以降 |
| 計算機精緻化の基準点 | `checkpoint/calc-core-refinement-20260630` | `7dcbccf6f37689df49c6dec945d9b30ee9a51455` |
| 称号・転生・限界突破・ASTリファクタの基準点 | `checkpoint/ast-refactor-template1-validation-20260630` | `0f606d82196b48d51608ccca062a52ff75c6efed` |

再統合のレビュー経緯は [PR #22](https://github.com/amabile4/hbr_battle_simulator/pull/22) を参照する。

## 運用ルール

1. 新しい作業は最新の `origin/main` から開始する。
2. 機能保持の比較には上記2つの `checkpoint/*` タグを使用する。
3. `invalid/claude-automerge-main-20260701` と無効コミット3件は、事故調査以外では参照しない。
4. GitHub 上でも無効コミットに警告コメントを付け、本台帳への導線を維持する。

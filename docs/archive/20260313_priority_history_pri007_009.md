# Implementation Priority Task List（アーカイブ: PRI-007〜009）

> **ステータス**: 🗄️ アーカイブ | 📅 アーカイブ日: 2026-03-13
>
> **後継ドキュメント**: [`../active/implementation_priority_tasklist.md`](../active/implementation_priority_tasklist.md)（`PRI-010`〜`PRI-012` を含む新版）

## アーカイブ対象

- `PRI-007`: Zone / Territory 効果見える化
- `PRI-008`: `ZoneUpEternal` 二効果分離実装
- `PRI-009`: ドキュメント整合性修正

## 完了サマリ

| ID | 状態 | テーマ | 完了メモ |
|----|------|--------|----------|
| `PRI-007` | `done` | Zone / Territory 効果見える化 | turn status / record table に種類・source・継続・効果表示を追加 |
| `PRI-008` | `done` | `ZoneUpEternal` 二効果分離実装 | `part.power[0]` ベースの性能加算と、有限 Zone 限定の永続化へ整理 |
| `PRI-009` | `done` | ドキュメント整合性修正 | token / shredding / README / SP条件 spec を実装状態へ同期 |

## この wave で確定したこと

- `Zone` / `Territory` の見える化は UI / record / scenario まで一通り接続済み
- `ZoneUpEternal` は「性能加算」と「有限 Zone の永続化」を別処理で解決する方針で固定
- 完了済み active docs は archive へ移し、`active/implementation_priority_tasklist.md` は次の着手順だけを持つ運用に切り替えた

## 参照

- 旧履歴: [`20260313_priority_history.md`](20260313_priority_history.md)（`PRI-001`〜`PRI-006`）
- 後継: [`../active/implementation_priority_tasklist.md`](../active/implementation_priority_tasklist.md)

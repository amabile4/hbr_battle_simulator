# Implementation Priority Task List（アーカイブ: PRI-010〜012）

> **ステータス**: 🗄️ アーカイブ | 📅 アーカイブ日: 2026-03-14
>
> **後継ドキュメント**: [`../active/implementation_priority_tasklist.md`](../active/implementation_priority_tasklist.md)（`PRI-013`〜`PRI-015` を含む新版）

## アーカイブ対象

- `PRI-010`: skill-level `overwrite_cond` 実行接続
- `PRI-011`: 一般敵デバフ status 基盤 + enemy-side `CountBC`
- `PRI-012`: top-level `effect` 監査と false positive 整理

## 完了サマリ

| ID | 状態 | テーマ | 完了メモ |
|----|------|--------|----------|
| `PRI-010` | `done` | `overwrite_cond` 実行接続と有効スキル解決 | `overwrite` / `IsCharging()` / `IsTeam()` / strict mode 実効コスト整合まで接続 |
| `PRI-011` | `done` | 一般敵デバフ status 基盤 | `DefenseDown` / `Fragile` / `AttackDown` / `ResistDown` / `ResistDownOverwrite` / `Provoke` / `Attention` を action / record / UI まで接続 |
| `PRI-012` | `done` | top-level `effect` 監査 | metadata-only label を切り分け、残件を active buff status 基盤の不足へ集約 |

## この wave で確定したこと

- `overwrite_cond` は「実行時の有効スキル解決」に載せれば、既存条件 evaluator を広く再利用できる
- 敵状態異常は `turnState.enemyState.statuses` の共通スキーマでかなりの範囲を吸収できる
- top-level `effect` の残件は label 個別実装ではなく、active skill 由来の `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp` 持続状態として扱う方が筋が良い

## 参照

- 旧履歴: [`20260313_priority_history_pri007_009.md`](20260313_priority_history_pri007_009.md)
- 後継: [`../active/implementation_priority_tasklist.md`](../active/implementation_priority_tasklist.md)

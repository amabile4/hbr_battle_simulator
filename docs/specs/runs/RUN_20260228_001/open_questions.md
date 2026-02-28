[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:22:00Z

# ユーザー確認事項 一括一覧（回答反映版）

**RUN**: RUN_20260228_001
**更新日**: 2026-02-28
**対象**: ユーザー回答の確定事項と、実装前に追加で確認したい点

---

## 回答確定事項

### Q-S001: preview/commit の二重適用防止
**ユーザー回答**: A) previewRecordを正とし、`commitTurn` では採用 + 状態遷移のみ実行。  
**決定**: `commitTurn` でSPを再計算しない。

### Q-B2: CSV列にturnIndexを追加するか
**ユーザー回答**: B) `turnIndex` + `turnLabel` の2列を出力。  
**決定**: 分析利便性を優先し、2列で確定。

### Q-G1: sp.bonusの用途確定
**ユーザー回答**: A) `BASE_SP_RECOVERY` への加算。  
**決定**: `turnRecovery = BASE_SP_RECOVERY + bonus`。

### Q-C4: OD終了時のSP clampタイミング
**ユーザー回答**: B) OD終了時にclampは発生しない。  
**決定**: 凍結ルール継続のみ。

### Q-CL1: snapBeforeの取得タイミング
**ユーザー回答**: A) ターン開始時のSP回復処理後・スキル選択前。  
**決定**: `snapBefore` は回復後スナップショット。

### Q-EF1: EffectSlot.source の確定値
**ユーザー回答**: v1では `item` は含めない（将来追加）。  
**決定**: v1の `EffectSlot.source` は `'skill' | 'passive' | 'system'`。  
**将来拡張メモ**: `item` は設計書に追記し、後方互換性を維持して追加する。

### Q-OD1: OD中のSP回復タイミング
**ユーザー回答**: B) OD開始時に一括適用。  
**決定**: OD1/2/3の開始時にまとめて処理する。

### Q-CL2: cascade削除の連鎖範囲
**ユーザー回答**: B) 個別削除のみ。  
**決定**: `deleteRecord` は指定行のみ削除（連鎖削除なし）。

### Q-BS1: BattleState共有型の所有モジュール
**ユーザー回答**: 提案どおり `shared-types.ts`。  
**決定**: 共有型モジュール配置で確定。

---

## 追加確認項目（今回解消）

### Q-EF1-Detail: v1の型に `item` を含めるか
**ユーザー回答**: B) v1では除外し、将来追加する。  
**決定**: v1の `EffectSlot.source` は `'skill' | 'passive' | 'system'`。  
**将来拡張メモ**: 設計書に `item` 追加予定を明記し、後方互換性を維持した形で拡張する。

### Q-CSV1: CSV上のSwap（入れ替え）表現
**ユーザー回答**: A) 1ターン1行のワイド形式（`pos1_* ... pos6_*`）。  
**決定**: 「ポジション1〜6固定」の横長CSVで確定。  
**補足**: 表示列の取捨選択はSpreadsheet側で行う前提。

---

## サマリー

| ID | 優先度 | ユーザー回答 | 状態 |
|----|--------|--------------|------|
| Q-S001 | Must | A | 確定 |
| Q-B2 | Should | B | 確定 |
| Q-G1 | Should | A | 確定 |
| Q-C4 | Should | B | 確定 |
| Q-CL1 | Should | A | 確定 |
| Q-EF1 | Should | v1はitem除外（将来追加） | 確定 |
| Q-OD1 | Should | B | 確定 |
| Q-CL2 | Could | B | 確定 |
| Q-CSV1 | Could | A（1ターン1行ワイド形式） | 確定 |
| Q-BS1 | Could | shared-types.ts | 確定 |

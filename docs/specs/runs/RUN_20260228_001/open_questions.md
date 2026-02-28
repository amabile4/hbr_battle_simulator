[HANDSHAKE] provider=claude model=claude-sonnet-4-6 session=n/a ts=2026-02-28T00:22:00Z

# ユーザー確認事項 一括一覧

**RUN**: RUN_20260228_001
**対象**: 実装着手前にユーザーの判断が必要な未確定事項

---

## 優先度: Must（実装前に確定必須）

### Q-S001: preview/commit の二重適用防止
**質問**: `commitTurn(state, previewRecord, swapEvents)` において、`previewRecord` に含まれるSP計算結果を「そのまま採用」するか、「BattleStateから再計算」するか、どちらが正しいですか？

**選択肢**:
- A) previewRecordの計算結果をそのまま採用（SP変動は一度だけ実行）
- B) commitTurnで再計算（previewRecordはUI表示用、確定計算は別途実行）

**推奨**: A（previewRecordを正とし、commitTurnでは採用+状態遷移のみ実行）
**影響**: SP二重消費バグの防止。全実装の前提となる設計判断。

---

## 優先度: Should（早期確定を推奨）

### Q-B2: CSV列にturnIndexを追加するか
**質問**: CSVエクスポート時、表示用の`turnLabel`（"T1", "OD1-1"）に加えて、内部連番の`turnIndex`（整数）を別列として出力しますか？

**選択肢**:
- A) turnLabelのみ（現行維持、シンプル）
- B) turnIndex + turnLabelの2列（分析ツールとしての利便性向上）

**推奨**: A（turnLabelのみ、Q-B2仮採用）
**影響**: CSV列数と既存Spreadsheetテンプレートとの互換性

---

### Q-G1: sp.bonusの用途確定
**質問**: `sp.bonus`はターン回復量 `BASE_SP_RECOVERY(=2) + bonus` への加算として使いますか？

**選択肢**:
- A) BASE_SP_RECOVERYへの加算（仮採用）
- B) その他（具体的にお教えください）

**現行実装**: `party-manager.js` の `spBonus` フィールドがこれに相当

---

### Q-C4: OD終了時のSP clampタイミング
**質問**: OD最終ターンの行動後、SP回復・passive等を全て適用した後にclampを実施しますか？

**選択肢**:
- A) OD最終行動の全回復適用後にclamp（仮採用）
- B) OD終了時にclampは発生しない（凍結ルール継続のみ）

**注意**: R10確定「OD終了時に上限クランプは発生しない。凍結ルールが継続するのみ」と整合するか確認が必要。

---

### Q-CL1: snapBeforeの取得タイミング
**質問**: `TurnRecord.snapBefore`（ターン前スナップショット）はいつの時点のキャラクター状態ですか？

**選択肢**:
- A) ターン開始時のSP回復処理後・スキル選択前（仮採用）
- B) ターン開始直前（SP回復処理前）

**影響**: CSV の「始SP」列の値に直結する

---

### Q-EF1: EffectSlot.source の確定値
**質問**: エフェクト（バフ/デバフ）の発生源 `EffectSlot.source` の取りうる値は以下で正しいですか？

**現在の仮定**: `'skill' | 'passive' | 'item' | 'system'`

**確認点**:
- 「item（アイテム）」はv1スコープに含まれますか？
- 他に追加すべき発生源はありますか？

**影響**: v1では計算に使わない（記録のみ）が、将来の拡張に影響

---

### Q-OD1: OD中のSP回復タイミング
**質問**: OD中（OD1/2/3ターン）のSP回復（source='od'）はいつ適用されますか？

**選択肢**:
- A) 各ODターンの行動終了後に適用（仮採用）
- B) OD開始時に一括適用
- C) ODターン開始前に適用

**影響**: ODターン中のSP計算とCSV表示に影響

---

## 優先度: Could（実装開始後でも確定可能）

### Q-CL2: cascade削除の連鎖範囲
**質問**: `deleteRecord`でOD中のターン（例: OD1-2）を削除した場合、同一OD一連の他のターン（OD1-1, OD1-3）も一緒に削除しますか？

**選択肢**:
- A) cascade=true時: 同一OD一連を全て削除（仮採用）
- B) 個別削除のみ（ユーザーが手動で全ターン削除する）

**推奨**: A（OD一連はatomicに管理するのがデータ整合性上好ましい）

---

### Q-CSV1: CSV上のSwap（入れ替え）表現
**質問**: キャラクター交代（前衛⇔後衛入れ替え）をCSVにどう記録しますか？

**選択肢**:
- A) skillName列に `[交代]→<入替キャラ名>` を記入（仮採用）
- B) CSV末尾に「交代」専用列を追加
- C) 現行通り（交代は記録しない）

**影響**: 既存Spreadsheetテンプレートとの互換性

---

### Q-BS1: BattleState共有型の所有モジュール
**質問**: `BattleState`型定義を配置するモジュールは以下で合意しますか？

**提案**: `shared-types.ts`（全モジュールが参照する共有型ファイル）

**影響**: モジュール分割の方針

---

## サマリー

| ID | 優先度 | 実装前必須 | 推奨デフォルト |
|----|--------|-----------|---------------|
| Q-S001 | **Must** | はい | A（previewRecord採用） |
| Q-B2 | Should | 推奨 | A（turnLabelのみ） |
| Q-G1 | Should | 推奨 | A（BASE_SP_RECOVERY+bonus加算） |
| Q-C4 | Should | 推奨 | B（clampなし、凍結継続） |
| Q-CL1 | Should | 推奨 | A（回復後・スキル選択前） |
| Q-EF1 | Should | 推奨 | 仮確定値で開始、拡張可 |
| Q-OD1 | Should | 推奨 | A（各行動終了後） |
| Q-CL2 | Could | いいえ | A（cascade削除） |
| Q-CSV1 | Could | いいえ | A（skillName列に記入） |
| Q-BS1 | Could | いいえ | shared-types.ts配置 |

**必須確認: Q-S001のみ**（preview/commit設計方針は全実装の前提）
その他はデフォルト値で実装を開始し、後から調整可能。

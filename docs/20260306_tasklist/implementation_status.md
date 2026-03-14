# 実装状況整理 (2026-03-06)

## 対象

- コードベース: `src/`, `ui/`, `tests/`
- データ: `json/skills.json`（未対応一覧は CSV 参照）

## 実装済み機能

### 戦闘ターン制御

- 通常ターン / ODターン / EXターン遷移
- 先制OD / 割込OD
- 追加ターン付与と行動可能メンバー制御
- 前衛/後衛スワップ（EX制約込み）

### リソース管理

- SP消費（`sp_cost=-1` 全消費含む）
- ターン開始SP回復（基本+2、OD回復）
- スキルによるSP回復（`HealSp` の対象別配布）
- EP消費/回復（`HealEp`、EP上限上書きの一部）
- ODゲージ加算/減算（通常攻撃・攻撃スキル・`OverDrivePointUp/Down`）
- 超越ゲージ（初期化、行動加算、上限到達ODボーナス）

### 条件分岐の一部

- `IsOverDrive()`, `IsReinforcedMode()`
- `PlayedSkillCount(...)`, `BreakHitCount()`
- `SpecialStatusCountByType(20)`（追加ターン系）
- `OverDriveGauge()`, `Sp()`
- `CountBC(...)` の限定パターン

### 状態/効果の一部

- Funnel 付与・消費（Hit加算）
- MindEye 消費
- 鬼神化（手塚）関連状態遷移
- 敵 `DownTurn` 状態の保持/減衰（UI操作ベース）

### UI・記録

- レコード一覧表示
- レコード編集（編集/挿入/削除/移動）と全ターン再計算
- CSV出力
- Records JSON保存
- シナリオ読み込み（JSON/CSV）と順次実行
- キャラ選択スロット保存/読込

## 未実装機能（skills.json 依存）

詳細は以下を参照:

- `docs/20260306_tasklist/skills_unimplemented_catalog.csv`
- `docs/20260306_tasklist/skills_unimplemented_occurrences.csv`
- `docs/20260306_tasklist/skills_unimplemented_summary.md`

主な未対応カテゴリ:

- 条件分岐（未対応条件句）
- 敵への状態異常付与（スキル起因）
- `overwrite_cond`（参照未実装）
- top-level `effect`（参照未実装）

## 未実装機能（skills.json 非依存）

### バトルコア

- 実ダメージ計算（HP/DP減衰、撃破判定、ブレイク判定）
- 敵AI行動ロジック（敵スキル選択、敵行動結果の反映）
- 勝敗判定・戦闘終了フロー

### ステータス/バフデバフ

- Funnel/MindEye/DownTurn 以外の大半の状態異常・バフデバフ適用
- 属性フィールド、チャージ、トークン、刻印系などの状態管理
- 付与/解除/上書きルール（`overwrite_cond` 依存）

### スキル運用

- スキル使用回数上限の厳密適用
- `HealSkillUsedCount` 等の使用回数回復系の反映
- 多数の `skill_type` 固有処理（現在はSP/EP/OD/追加ターン/Funnel中心）

### 検証/品質

- 未対応条件式を含むスキルの挙動一致検証（実機比較）
- 敵状態異常付与スキルの統合テスト


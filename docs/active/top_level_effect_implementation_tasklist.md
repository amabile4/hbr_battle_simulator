# Top-level Effect 実装タスクリスト（PRI-012）

> **ステータス**: ✅ 完了 | 📅 開始: 2026-03-14 | 📅 最終更新: 2026-03-14

## 目的

- `skill.effect` / `passive.effect` の top-level ラベルが実挙動に必要か、単なる分類ラベルかを切り分ける
- `docs/20260306_tasklist/` の `effect_unresolved` を false positive なしで再生成できるようにする
- 実際に必要な effect 接続だけを残し、`parts` で既に成立しているものは metadata-only として扱う

## 現状メモ

- `2026-03-06` スナップショットでは `effect_unresolved = 16 keys / 203 occurrences`
- 今回の監査後、`effect_unresolved = 9 keys / 129 occurrences` まで圧縮
- metadata-only と確定した label は 7 種
  - `ChargeBuff`
  - `DefaultDebuff`
  - `FunnelUp`
  - `HealSp`
  - `MindEyeBuff`
  - `OverDriveUp`
  - `TokenUp`
- 現時点で unresolved に残していた label は active buff 系中心だった
  - `NormalBuff_Up`
  - `HealDp_Buff`
  - `ProtectBuff`
  - `CriticalBuff_Up`
  - `DarkBuff_Up`
  - `FireBuff_Up`
  - `IceBuff_Up`
  - `LightBuff_Up`
  - `ThunderBuff_Up`

## 今回のスコープ

### 今回やること

- top-level `effect` ラベルの棚卸し
- metadata-only effect ラベル集合の定義
- `generate_skill_unimplemented_report.mjs` で metadata-only ラベルを `effect_unresolved` から除外
- `unsupported_matrix.csv` も generator から同期出力する
- 代表実スキル回帰を追加する
  - `DefaultDebuff`
  - `MindEyeBuff`
  - `ChargeBuff`
  - `FunnelUp`
  - `HealSp`

### 今回やらないこと

- `part.skill_type` 自体の未対応実装をこの PRI で広げること
- `AttackUpIncludeNormal` など個別 part の新規 runtime 実装
- battle core 側のダメージ/敵AI/勝敗判定

## 対象ファイル

- `docs/20260306_tasklist/generate_skill_unimplemented_report.mjs`
- `docs/20260306_tasklist/skills_unimplemented_summary.md`
- `docs/20260306_tasklist/skills_unimplemented_catalog.csv`
- `docs/20260306_tasklist/skills_unimplemented_occurrences.csv`
- `docs/20260306_tasklist/unsupported_matrix.csv`
- `docs/20260306_tasklist/README.md`
- `tests/turn-state-transitions.test.js`
- `docs/active/implementation_priority_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: effect 監査

- [x] **T01**: `effect_unresolved` 16 ラベルを part 構成つきで棚卸しする
- [x] **T02**: metadata-only effect ラベル集合を明文化する
- [x] **T03**: 「実欠落 label があるか」を判定し、ある場合だけ次 wave の runtime 接続候補として残す
  - 現時点の残件は `NormalBuff_Up` / `HealDp_Buff` / `ProtectBuff` / 属性 buff 系

### フェーズ2: レポート生成器

- [x] **T04**: `generate_skill_unimplemented_report.mjs` に metadata-only effect 判定を追加する
- [x] **T05**: `unsupported_matrix.csv` も generator から同期出力する
- [x] **T06**: `skills_unimplemented_summary.md` の補足文を新ルールへ合わせる

### フェーズ3: 回帰テスト

- [x] **T07**: `DefaultDebuff` / `MindEyeBuff` の代表スキル実データ回帰を追加する
- [x] **T08**: `ChargeBuff` / `FunnelUp` / `HealSp` の代表スキル実データ回帰を追加する
- [x] **T09**: unresolved に残した effect label の runtime gap を次 wave の実装対象として整理する
  - `HealDp_Buff` は `HealDp` part だけで成立する metadata-only label と判断
  - `ProtectBuff` は active `DefenseUp` + 既存 `Provoke` / `TokenSet`
  - `NormalBuff_Up` / `CriticalBuff_Up` / 属性 buff 系は active buff status 基盤へ切り出し
  - 後継は [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md)

### フェーズ4: docs 同期

- [x] **T10**: 本ファイルの進捗チェックを更新する
- [x] **T11**: `implementation_priority_tasklist.md` と `docs/README.md` を同期する

## 完了条件

- `effect_unresolved` が metadata-only label を含まない
- `unsupported_matrix.csv` / `skills_unimplemented_catalog.csv` / `skills_unimplemented_summary.md` が同じ生成ルールで揃う
- 代表スキル回帰で top-level `effect` なしでも `parts` 由来の挙動が成立していることを確認できる
- 本ファイル、`implementation_priority_tasklist.md`、`docs/README.md` が同期される

## この wave の結果

- metadata-only 7 label を generator から除外し、`effect_unresolved` を `16 keys / 203 occurrences` から `9 keys / 129 occurrences` へ圧縮
- `DefaultDebuff` / `MindEyeBuff` / `ChargeBuff` / `FunnelUp` / `HealSp` は代表実スキル回帰を追加
- 追加調査で `HealDp_Buff` も metadata-only と判断でき、runtime の残件は active buff status 基盤の不足へ収束した
- 以後の実装は [`active_buff_status_implementation_tasklist.md`](active_buff_status_implementation_tasklist.md) に引き継ぐ

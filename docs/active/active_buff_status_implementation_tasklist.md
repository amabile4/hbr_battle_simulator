# Active Buff Status 実装タスクリスト（PRI-013）

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-14 | 📅 最終更新: 2026-03-14

## 目的

- active skill 由来の `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp` を、passive modifier ではなく持続 `statusEffects` として扱えるようにする
- `PRI-012` で残った `NormalBuff_Up` / `ProtectBuff` / `CriticalBuff_Up` / 属性 buff 系 label を runtime 的に解消する
- `preview / commit / record / scenario` で「今どの buff が有効か」を追える状態にする

## 調査メモ（2026-03-14 現行コード ad-hoc survey）

- top-level `effect` の残件は、ほぼ active buff status 基盤の不足へ収束している
- representative effect label の現況
  - `NormalBuff_Up`: 53
  - `ProtectBuff`: 6
  - `CriticalBuff_Up`: 4
  - `DarkBuff_Up` / `ThunderBuff_Up`: 各 6
  - `IceBuff_Up`: 5
  - `LightBuff_Up`: 4
  - `FireBuff_Up`: 1
- `HealDp_Buff` は代表実データ上 `HealDp` part のみで成立しており、runtime gap ではなく metadata-only とみなせる
- active timed buff part の上位シグネチャ
  - `AttackUp | None | Count | Default`: 50
  - `DefenseUp | None | EnemyTurnEnd | Default`: 21
  - `AttackUp | None | PlayerTurnEnd | Only`: 20
  - `CriticalRateUp | None | Count | Default`: 18
  - `CriticalDamageUp | None | Count | Default`: 13

## 今回のスコープ

### 今回やること

- active skill の buff part を `CharacterStyle.statusEffects` へ保存する共通経路を作る
- `Count` / `PlayerTurnEnd` / `EnemyTurnEnd` の減衰を既存 `tickStatusEffectsByExitCond()` に載せる
- `elements` 付き buff を status metadata か専用フィールドで保持する
- preview / record / state snapshot から、現在有効な buff を参照できるようにする
- `PRI-012` 残件の代表スキル回帰を追加する

### 今回やらないこと

- 実ダメージ計算に buff 量を厳密反映すること
- battle core 側の被ダメージ / 撃破 / 勝敗判定
- 敵側の rare status 実装（`PRI-015`）
- generator の未対応集計同期（`PRI-014`）

## 対象ファイル

- `src/domain/character-style.js`
- `src/turn/turn-controller.js`
- `src/contracts/interfaces.js`
- `src/ui/dom-adapter.js`
- `src/records/record-assembler.js`
- `tests/turn-state-transitions.test.js`
- `docs/active/top_level_effect_implementation_tasklist.md`
- `docs/active/implementation_priority_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: status schema

- [ ] **T01**: active buff 用 `statusEffects` の保存スキーマを定義する
  - `statusType`
  - `power`
  - `limitType`
  - `exitCond`
  - `remaining`
  - `sourceType = skill`
  - 属性情報（`elements`）の保持方法
- [ ] **T02**: `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp` で共通化できる helper を切り出す
- [ ] **T03**: `Default` / `Only` の共存ルールが既存 `resolveEffectiveStatusEffects()` と矛盾しないことを確認する

### フェーズ2: action → statusEffects 接続

- [ ] **T04**: active skill 実行時に buff part を `statusEffects` へ付与する
- [ ] **T05**: `Count` / `PlayerTurnEnd` / `EnemyTurnEnd` の期限管理を commit 順序込みで確認する
- [ ] **T06**: `ProtectBuff` 系（`DefenseUp` + `Provoke`）が既存 `Provoke` 実装と二重適用しないことを確認する

### フェーズ3: preview / record 可視化

- [ ] **T07**: 有効 buff を preview action modifier か action meta へ反映する入口を作る
- [ ] **T08**: `record` / state snapshot / scenario 再計算で buff 状態が落ちないことを確認する
- [ ] **T09**: DOM / record table で最低限の見える化を行う

### フェーズ4: 実データ回帰

- [ ] **T10**: `指揮行動` で `NormalBuff_Up` が active `AttackUp` status として残ることを確認する
- [ ] **T11**: `ご注文を伺います` で `DefenseUp` + `Provoke` + `TokenSet` が同時成立することを確認する
- [ ] **T12**: `一途なスマイル` で `CriticalRateUp` + `CriticalDamageUp` が `Count` 型で残ることを確認する
- [ ] **T13**: `涙雨` / `ホーリーエンハンス` / `ねこじゃらし` で属性付き `AttackUp` が付与されることを確認する
- [ ] **T14**: `極彩色` で `SkillCondition` nested skill の属性別 critical buff が保存されることを確認する
- [ ] **T15**: `リカバー` を `HealDp_Buff` metadata-only の回帰として固定し、runtime gap から除外できる材料を残す

### フェーズ5: docs 同期

- [ ] **T16**: [`top_level_effect_implementation_tasklist.md`](top_level_effect_implementation_tasklist.md) を完了化する
- [ ] **T17**: [`implementation_priority_tasklist.md`](implementation_priority_tasklist.md) と [`../README.md`](../README.md) を同期する

## 完了条件

- active skill 由来の `AttackUp` / `DefenseUp` / `CriticalRateUp` / `CriticalDamageUp` が `statusEffects` として残る
- `Count` / `PlayerTurnEnd` / `EnemyTurnEnd` の減衰が commit 後状態で確認できる
- 代表スキル回帰で `NormalBuff_Up` / `ProtectBuff` / `CriticalBuff_Up` / 属性 buff 系が成立する
- `top_level_effect_implementation_tasklist.md` を「残件は active buff status 基盤へ吸収済み」として閉じられる

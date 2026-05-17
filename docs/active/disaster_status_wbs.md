# 禍（Disaster）実装 WBS

> **ステータス**: ✅ 完了 | 📅 作成: 2026-04-10 | 🔄 最終更新: 2026-05-17
>
> **親管理**: `docs/active/ui_next_unimplemented_tasklist.md`
>
> **関連**:
> - `docs/active/t34_followup_tasklist.md`
> - `help/HEAVEN_BURNS_RED/バトル/禍.md`
> - `scripts/generate-t33-skill-passive-audit.mjs`

---

## 進捗チェック

- [x] 追加 JSON 再照合で `Disaster` を新規未実装 enemy debuff として切り出した
- [x] `help/HEAVEN_BURNS_RED/バトル/禍.md` に画像仕様と実データを反映した
- [x] `ui_next_unimplemented_tasklist.md` / `t34_followup_tasklist.md` / `docs/README.md` に導線を追加した
- [x] engine の `Disaster` state モデルを確定した
- [x] `もつれトラップ` の runtime / replay / recalculation を実装した
- [x] `damageContext` の全能力低下集計へ `Disaster` を統合した
- [x] enemy popup / field chip / char detail の UI を実装した
- [x] audit / runtime / UI テストを追加し baseline を更新した

## 現状認識

### 2026-05-17 再照合結果

- `node scripts/generate-t33-skill-passive-audit.mjs`
  - `styles=352`
  - `scannedEntries=1830`
  - `logicGapCount=0`
  - `observabilityGapCount=1`
  - `structuralEnemyStatusGaps=0`
  - `silentSkipEnemyStatusCandidates=4`
- live data 上の `Disaster` 出現は引き続き 1 style / 1 active skill
  - style: `1005506` `[前進ネバーギブアップ！]`
  - skill: `46005514` `もつれトラップ`
  - skill part: `skill_type="Disaster"`, `target_type="All"`, `power[0]=2`, `exitCond="Eternal"`
  - style passive: `100550603` `巻き添え` が `AdditionalHitOnSpecifiedSkill + Disaster` で追加 `+2`
- `assets/skill_type/Disaster.webp` を enemy popup / field chip / char detail の正本 icon asset として使用する

### 画像から確定できる仕様

- 禍レベル 1 につき全能力が 7 減少
- 永続
- 最大レベル 10
- 最大で全能力 70 減少
- 全能力低下系を重ねた場合は、効果値の高いほうで算出する
- `もつれトラップ` はスキル part として「禍状態(解除不可)にする」かつ「禍レベルを 2 上昇させる」
- current live style では `巻き添え` も同時発火するため、初回使用結果は `Lv4 / 全能力-28`

### 現行シミュレーターの不足

- `enemyState.disasterState` と `fieldStateApplied.kind === 'disaster'` を追加し、record / replay / recalculation まで接続済み
- `damageContext.enemyDisasterLevelByEnemy` と `enemyAllAbilityDownByEnemy` の max 集約を実装済み
- audit baseline test / UI unit / runtime real-data test / browser E2E を更新済み

## 設計方針

- 第1段階は `Disaster` を専用 leveled debuff state として実装する
  - 推奨保存先: `enemyState.disasterState`
  - 推奨 shape: `active`, `level`, `maxLevel`, `penaltyPerLevel`
- `Talisman` と同じ「敵共通の level 付き状態」として UI 表示を合わせる
  - enemy popup を正本にする
  - turn row field chip / char detail field tab は snapshot 表示を維持する
- `Disaster` は霊符と違い、現時点では自動レベル増加や敵ターン終了リセットを入れない
- 全能力低下の計算は `damageContext.enemyAllAbilityDownByEnemy` に集約し、`Talisman` / `Disaster` のうち高い値を採用する
- 数値ダメージエンジンは今回も新設しない
  - engine / record / UI / damageContext に効果量が露出されていれば完了扱いとする

## スコープ

### In Scope

- active skill `Disaster` の runtime 解釈
- `enemyState` / `record` / `replay` / `recalculate` への接続
- `damageContext.enemyAllAbilityDownByEnemy` への統合
- enemy popup / field chip / char detail の UI 表示
- audit / runtime / UI テスト追加

### Out Of Scope

- `Disaster` を起点にした新しい条件式（例: `IsDisaster`, `DisasterLevel`）の追加
- 旧 UI (`dom_adapter`) への parity 対応
- 将来の他レベル制 enemy debuff まで含めた抽象化

## 詳細WBS

### WBS-1: 仕様固定と監査同期

- [x] 画像仕様を help 文書へ反映する
- [x] 追加 JSON 流入で `Disaster` が structural gap 1 件になったことを WBS に固定する
- [x] `tests/t33-skill-passive-audit.test.js` の baseline を更新した
  - `structuralEnemyStatusGaps=0`
  - `silentSkipEnemyStatusCandidates=4`

### WBS-2: engine state / runtime

- [x] `src/turn/turn-controller.js` に `Disaster` helper を追加した
- [x] `enemyState.disasterState` を battle state に追加した
- [x] active skill から `Disaster` 付与と `+2` level-up を処理した
- [x] level clamp を `10` に固定した
- [x] `Eternal` 状態として保持し、ターン経過で自動消滅させない
- [x] commit / replay / recalculate で同一結果になるように接続した

### WBS-3: `damageContext` / record 集約

- [x] `damageContext.enemyAllAbilityDownByEnemy` が `Talisman` と `Disaster` の高いほうを採るようにした
- [x] `enemyDisasterLevelByEnemy` を追加した
- [x] action record に `fieldStateApplied.kind === 'disaster'` を追加した
- [x] passive / active の両経路を action-flow で追えるようにした

### WBS-4: UI 表示

- [x] enemy popup に `Disaster.webp` icon 付き `禍` compact block（`LvX/10 / 全能力-X`）を追加した
- [x] enemy popup が `assets/skill_type/Disaster.webp` を直接参照するように揃えた
- [x] compact block の desc に `LvX/10`, `全能力-X` を表示した
- [x] preview / committed action-flow に `付与`, `Lv before→after`, `+N` を表示した
- [x] field chip / char detail に `禍状態` の snapshot 表示を追加した
- [x] `char-detail-popup.js` / field summary の label を更新した

### WBS-5: テスト

- [x] `tests/turn-state-transitions.test.js` に `もつれトラップ` の real-data runtime test を追加した
- [x] `tests/damage-calculation-context.test.js` に `enemyDisasterLevelByEnemy` を追加した
- [x] `tests/ui-next-field-state-display.test.js` と `tests/ui-next-turn-ui.test.js` に `禍` 表示を追加した
- [x] `tests/t33-skill-passive-audit.test.js` を新 baseline へ更新した
- [x] `node scripts/generate-t33-skill-passive-audit.mjs` で `structuralEnemyStatusGaps=0` を確認した
- [x] browser E2E を追加し preview / committed popup を固定した

## 受け入れ条件

- `もつれトラップ` の skill part で `禍 Lv2` が付与される
- current live style では `巻き添え` まで含めて同一 action 後に `Lv4/10` になる
- `Disaster` による能力低下量が `全能力-14`（skill part 単体）/ `全能力-28`（live style 合算）として UI / record / `damageContext` に露出される
- `Talisman` と `Disaster` が併存しても `enemyAllAbilityDownByEnemy` は高いほうだけを採用する
- enemy popup / field chip / char detail で `Disaster.webp` と level 表示を確認できる
- audit summary から `Disaster` が structural gap として消える

## テスト実行候補

```bash
node scripts/generate-t33-skill-passive-audit.mjs
node --test tests/turn-state-transitions.test.js --test-name-pattern "もつれトラップ|Disaster|禍"
node --test tests/damage-calculation-context.test.js
node --test tests/ui-next-field-state-display.test.js
node --test tests/ui-next-turn-ui.test.js --test-name-pattern "enemy detail popup|Disaster|禍"
```

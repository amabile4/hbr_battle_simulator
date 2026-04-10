# 禍（Disaster）実装 WBS

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-04-10 | 🔄 最終更新: 2026-04-10
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
- [ ] engine の `Disaster` state モデルを確定する
- [ ] `もつれトラップ` の runtime / replay / recalculation を実装する
- [ ] `damageContext` の全能力低下集計へ `Disaster` を統合する
- [ ] enemy popup / field chip / char detail の UI を実装する
- [ ] audit / runtime / UI テストを追加し baseline を更新する

## 現状認識

### 2026-04-10 再照合結果

- `node scripts/generate-t33-skill-passive-audit.mjs`
  - `styles=347`
  - `scannedEntries=1801`
  - `logicGapCount=0`
  - `observabilityGapCount=2`
  - `structuralEnemyStatusGaps=1`
  - `silentSkipEnemyStatusCandidates=4`
- 新規の structural gap は 1 件のみ
  - style: `1005506` `[前進ネバーギブアップ！]`
  - skill: `46005514` `もつれトラップ`
  - part: `skill_type="Disaster"`, `target_type="All"`, `power[0]=2`, `exitCond="Eternal"`
- 現時点で live data 上の `Disaster` 出現はこの 1 件だけ
- `assets/skill_type/Disaster.webp` は既に存在する

### 画像から確定できる仕様

- 禍レベル 1 につき全能力が 7 減少
- 永続
- 最大レベル 10
- 最大で全能力 70 減少
- 全能力低下系を重ねた場合は、効果値の高いほうで算出する
- `もつれトラップ` は「禍状態(解除不可)にする」かつ「禍レベルを 2 上昇させる」

### 現行シミュレーターの不足

- `Disaster` は `ENEMY_STATUS_SKILL_TYPES` / UI label / popup summary / record contract のいずれにも未接続
- `enemyState.talismanState` に相当する `Disaster` 専用 state がない
- `damageContext.enemyAllAbilityDownByEnemy` は霊符起因しか入れていない
- audit baseline test は旧前提のままで、追加 JSON 流入後の structural gap 1 件をまだ織り込んでいない

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
- [ ] `tests/t33-skill-passive-audit.test.js` の baseline 更新方針を確定する
  - 実装前は fail 原因として記録のみ
  - 実装後は `structuralEnemyStatusGaps=0` を再固定する

### WBS-2: engine state / runtime

- [ ] `src/turn/turn-controller.js` に `Disaster` 専用 helper を追加する
- [ ] `enemyState.disasterState` を battle state に追加する
- [ ] active skill から `Disaster` 付与と `+2` level-up を処理する
- [ ] level clamp を `10` に固定する
- [ ] `Eternal` 状態として保持し、ターン経過で自動消滅させない
- [ ] commit / replay / recalculate で同一結果になるように接続する

### WBS-3: `damageContext` / record 集約

- [ ] `damageContext.enemyAllAbilityDownByEnemy` が `Talisman` と `Disaster` の高いほうを採るようにする
- [ ] 必要なら `enemyDisasterLevelByEnemy` を追加し、UI/record の観測点を明確にする
- [ ] action record に `fieldStateApplied.kind === 'disaster'` を追加する
- [ ] passive / active のどちらから来ても action-flow で level 変化が追えるようにする

### WBS-4: UI 表示

- [ ] enemy popup に `Disaster.webp` icon 付き `禍` セクションを追加する
- [ ] summary に `有効/無効`, `LvX/10`, `全能力-X` を表示する
- [ ] preview / committed action-flow に `付与`, `Lv before→after`, `+N` を表示する
- [ ] field chip / char detail に `禍状態` の snapshot 表示を追加する
- [ ] `char-detail-popup.js` / `enemy-status-display.js` の label / icon / 表示順を更新する

### WBS-5: テスト

- [ ] `tests/turn-state-transitions.test.js` に `もつれトラップ` の real-data runtime test を追加する
- [ ] `tests/damage-calculation-context.test.js` に `Talisman` と `Disaster` の高いほう採用を追加する
- [ ] `tests/ui-next-field-state-display.test.js` と `tests/ui-next-turn-ui.test.js` に `禍` 表示を追加する
- [ ] `tests/t33-skill-passive-audit.test.js` を新 baseline へ更新する
- [ ] 実装後に `node scripts/generate-t33-skill-passive-audit.mjs` で `structuralEnemyStatusGaps=0` を確認する

## 受け入れ条件

- `もつれトラップ` 使用時に敵へ `禍` が付与され、同一 action で `Lv2/10` になる
- `Disaster` による能力低下量が `全能力-14` として UI / record / `damageContext` に露出される
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

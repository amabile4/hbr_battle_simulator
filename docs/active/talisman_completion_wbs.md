# 霊符状態 完成 WBS（T33-FU1 拡張）

> **ステータス**: ✅ 完了 | 📅 作成: 2026-04-10 | 🔄 最終更新: 2026-04-10
>
> **関連**:
> - `docs/active/t33_skill_passive_audit_wbs.md`
> - `docs/active/ui_next_unimplemented_tasklist.md`
> - `help/HEAVEN_BURNS_RED/バトル/霊符.md`

---

## 現状実装

- `enemyState.talismanState`（`active`, `level`, `maxLevel`）を enemy 共通 state として保持する
- `Talisman` effect は battle-start 初期付与、timing level-up、`AdditionalHitOnExtraSkill`、被弾時 +1、敵ターン終了時 reset を同一 helper 経路で処理する
- `IsTalisman` 条件は `talismanState.active` を参照して評価する
- action record には `fieldStateApplied.kind === 'talisman'` と `passive_trigger.talismanChange` を残す
- `damageContext` には `enemyTalismanLevelByEnemy` と `enemyAllAbilityDownByEnemy` を露出する
- UI は turn row field chip / char detail field tab / enemy popup の 3 面で霊符を表示する
- enemy popup は summary と preview / committed action-flow の両方で霊符状態変化を観測できる

## 不足機能

- [x] `AdditionalHitOnExtraSkill + Talisman` を `恐怖の叫び` に接続する
- [x] action-flow で talisman change を preview / committed popup まで届ける
- [x] enemy popup に専用 icon と summary (`有効/無効`, `LvX/10`, `全能力-X0`) を追加する
- [x] `damageContext` に enemy ごとの霊符 level / 能力低下量を露出する
- [x] T33 audit baseline を post-completion 版へ更新する

## 設計決定

- enemy popup を霊符 UI の正本にする
  - turn row field chip と char detail field tab は `stateBefore` snapshot を維持する
  - 同ターン中の霊符変化は popup の preview / committed action-flow で観測する
- `fieldStateApplied` は zone / territory と同じ action-scoped event として扱い、`kind: 'talisman'` を追加する
- `enemyAllAbilityDownByEnemy` は generic 名を採るが、この wave で値を入れるのは talisman のみとする
- 数値ダメージエンジンは新設しない
  - 現行 simulator では `damageContext`、record、UI への露出をもって「全能力-10×Lv」の実装完了とみなす

## 詳細WBS

### WBS-1: ドキュメント再編

- [x] 本 WBS を追加した
- [x] `docs/active/t33_skill_passive_audit_wbs.md` を `T33-FU1` 完了状態へ更新した
- [x] `docs/active/ui_next_unimplemented_tasklist.md` から `T33-FU1` を未実装優先順から外した
- [x] `help/HEAVEN_BURNS_RED/バトル/霊符.md` を現行実装状態へ更新した

### WBS-2: engine の talisman state 変更一本化

- [x] `src/turn/turn-controller.js` に talisman 専用 helper を追加した
- [x] passive timing / `AdditionalHitOnExtraSkill` / 被弾時 auto increment の 3 経路を同じ state 更新へ寄せた
- [x] `恐怖の叫び` の EX 使用後に `+2` が入り、その後の被弾 +1 と clamp / reset が同じ state で処理される

### WBS-3: record / damageContext 露出

- [x] `passive_trigger` event に `talismanChange` metadata を追加した
- [x] `fieldStateApplied.kind === 'talisman'` を committed / preview action-flow に通した
- [x] `damageContext.enemyTalismanLevelByEnemy` と `damageContext.enemyAllAbilityDownByEnemy` を追加した

### WBS-4: enemy popup 中心の UI 完成

- [x] enemy popup に `Talisman.webp` icon 付きの霊符 compact block（`LvX/10 / 全能力-X0`）を追加した
- [x] enemy popup が `assets/skill_type/Talisman.webp` を直接参照するように揃えた
- [x] preview / committed action-flow で `付与` / `Lv before→after` / `+N` を表示できるようにした
- [x] turn row field chip / char detail field tab の霊符 meta を `LvX/10` + `全能力-X0` へ揃えた

### WBS-5: テスト昇格

- [x] `tests/turn-state-transitions.test.js` に `恐怖の叫び` 専用 runtime test を追加した
- [x] inactive 時不発 / clamp / `damageContext` 反映を dedicated test で固定した
- [x] `tests/t33-skill-passive-audit.test.js` の `test.todo` を通常テストへ昇格した
- [x] `tests/ui-next-turn-ui.test.js` で enemy popup の summary / icon / preview change を固定した

## 受け入れ条件

- [x] `恐怖の叫び` が EX 使用後に `Talisman +2`、攻撃由来で `+1`、合計 `Lv3` を記録できる
- [x] inactive talisman では `AdditionalHitOnExtraSkill + Talisman` が不発になる
- [x] talisman level は `Lv10` を超えない
- [x] enemy popup で summary / icon / preview change が確認できる
- [x] T33 audit summary が `logicGapCount=0` / `staleDocFalsePositiveCount=0` に更新される

## 検証

- `node --test tests/turn-state-transitions.test.js --test-name-pattern "Talisman|恐怖の叫び"`
- `node --test tests/t33-skill-passive-audit.test.js`
- `node --test tests/ui-next-field-state-display.test.js`
- `node --test tests/ui-next-turn-ui.test.js --test-name-pattern "enemy detail popup|talisman|霊符"`
- `node scripts/generate-t33-skill-passive-audit.mjs`

# 総攻撃・魔界騎兵 専用ダメージ計算

- ステータス: ✅ 完了
- 最終更新: 2026-06-28

## 対象

ターンを進行させない専用 operation `ActivateAllOutAttack` / `ActivateMakaiKihei` の敵別ダメージ、OD、破壊率を計算し、選択敵のDP/HP状態へ反映する。

## データ根拠

### 魔界騎兵

- `json/passives.json`: `Passive.Machina_Demon` の `SpecialCommandCountUp` が `BIYamawakiSkill55b` を参照。
- `json/skills.json` / `MasterSkillPart.json`: 威力 `20625–41250`、閾値 `195`、STR/DEX各1、6hit、斬、全体、`PenetrationCriticalAttack`、弱点倍率下限300%、破壊率係数6。
- `MasterSkillDescription.json`: 部隊の力・器用さ平均、味方付与バフ無効、貫通確定クリティカル。
- イベント版 `BIYamawakiSkill55bEvent` は威力 `830.625–1661.25`、閾値119、破壊率係数0.9。埋め込みスキルを正本にするため同じ経路で処理する。
- 特殊コマンドの破壊率計算はSP30相当を用い、通常版は `6 × 30 = 180%`、イベント版は `0.9 × 30 = 27%`。

### 総攻撃

- `json/styles.json`: `EmaB03` / `EmaC03` / `EmaD03` の `roleabi` が総攻撃。
- `json/skills.json`: `EmaASkill51`、威力 `21997.5–43995`、閾値198、STR/DEX各1、7hit、斬、全体、貫通確定クリティカル。
- `MasterSkillDescription.json`: 部隊の力・器用さ平均、味方付与バフ無効。
- `DamageRateValueUp` により破壊率を固定100%加算する。

## 実装

- Party Setupの最終statsから6人のSTR/DEX平均を作り、専用攻撃の攻撃値に使用する。
- 味方側status effects、zone、装備補正は入力しない。敵側のDefenseDown / Fragile、param border、発動前破壊率は敵ごとに使用する。
- 貫通攻撃の相性倍率は `max(300%, 敵の元の斬倍率)` とする。
- Enemy Setupの選択敵からID、最大/現在DP、最大/現在HPをbattle stateへ保持する。
- DPが残っていればDPへ、Break済みならHPへ与ダメージを反映する。敵別累積値は `damageTakenByEnemy`、計算根拠は `specialOperationDamageEvents` に保持する。
- ODは既存hit数経路、破壊率は発動後に敵別上限を適用する。

## 制約

- 専用表示は未実装。
- 一般スキルの自動HP/DP減算には拡張していない。
- DPを攻撃途中で破壊した場合の同一攻撃内HP繰越は行わず、その攻撃ではDP残量までを適用する。

## 検証

- `npm test`: 1346 pass
- `npm run lint`: pass
- `npx playwright test tests/e2e/enemy-setup-selector.spec.js tests/e2e/session-save.spec.js`: 8 pass

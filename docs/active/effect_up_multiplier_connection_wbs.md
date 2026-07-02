# 効果アップ系パッシブ・スキル 計算機接続 WBS

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-07-02 | 最終更新: 2026-07-02

## 経緯

`new_style_audit_workflow.md` のスタイル監査で、シャルロッタ・スコポフスカヤ「異国のプリンツェッサ」の
限界突破パッシブ「侵食」（`GiveDefenseDebuffUp`、自身が付与する防御力ダウン効果量 +15%/+25%）が
passive event として記録されるだけで、敵デバフ効果量の解決（resolver）に反映されない実装ギャップが見つかった。

一方、`resonance_ability_connection_tasklist.md` には共鳴アビリティ（`support_skills.json` 限定）の
`GiveAttackBuffUp` / `GiveDefenseDebuffUp` が同種の未接続残タスクとしてすでに記録されていた
（2026-06-13時点）。ただしその調査範囲はサポート枠の共鳴アビリティのみで、通常スタイルのパッシブ・
限界突破パッシブ・アクティブスキルは対象外だった。

侵食のケースが個別の見落としではなく構造的な問題である可能性を検討するため、agmsg 経由で
ag（Gemini）へ「効果アップ／効果倍率アップ系 skill_type が calc へ未接続なケースの包括調査」を依頼した
（2026-07-02）。本書はその調査結果と実装 WBS を記録する。

## 調査結果（ag/Gemini 調査、2026-07-02）

| skill_type | 意味 | 出現件数（申告） | 未接続箇所 | 未接続先 resolver |
|---|---|---|---|---|
| `GiveDefenseDebuffUp` | 防御デバフ効果量アップ | 22件（限界突破パッシブ「侵食」等16・通常パッシブ5・アクティブスキル1） | `turn-controller.js` の `resolveEnemyDebuffSkillEffectMultiplier` | `scaleHighBoostEnemyDebuffPower` |
| `GiveAttackBuffUp` | 攻撃バフ効果量アップ | 20件（パッシブ14・通常パッシブ4・アクティブスキル2） | `turn-controller.js` の `resolveAttackBuffSkillEffectMultiplier` | `scaleHighBoostAttackBuffPower` |
| `GiveHealUp` | 回復効果量アップ | 12件（パッシブ9・スタイルパッシブ3） | `turn-controller.js` の `resolveDpHealOutputModifiersForMember` | `scaleHighBoostDpHealAmount` |
| `DamageRateUp` | 破壊率上昇量アップ | 16件（通常パッシブ9・アクティブスキル7） | `turn-controller.js` の `resolvePassiveResonanceDestructionRateBonusForMember`（`support` 限定） | `bonusSum` |
| `GiveDebuffUp` | デバフ効果量アップ（全般） | 2件（アクティブスキル） | 完全未接続（コード中に参照なし） | — |

### 検証状況（claude確認、2026-07-02）

関数の実在は確認済み（すべて `src/turn/turn-controller.js`）:

- `resolveEnemyDebuffSkillEffectMultiplier`: L1267 / `scaleHighBoostEnemyDebuffPower`: L1291
- `resolveAttackBuffSkillEffectMultiplier`: L1254 / `scaleHighBoostAttackBuffPower`: L1280
- `resolveDpHealOutputModifiersForMember`: L955 / `scaleHighBoostDpHealAmount`: L1163
- `resolvePassiveResonanceDestructionRateBonusForMember`: L7932

出現件数（22/20/12/16/2）は ag 申告値であり未検証。簡易サンプル集計（`s.skills` / `s.passives` の
`parts[].skill_type` のみ、`limit_break` / `ability_tree` 経由の参照は未展開）では
`GiveDefenseDebuffUp=6` / `GiveAttackBuffUp=6` / `GiveHealUp=3` / `DamageRateUp=8` / `GiveDebuffUp=2`。
限界突破パッシブ（「侵食」等）は `ability_tree[].ability_list[].skill` が参照する
パッシブスキルマスター側に定義されており、`styles.json` の `passives` 直下には現れないため、
上記簡易集計では捕捉できていない。全件確定は Phase 0 で行う。

## WBS

### Phase 0: 件数確定・対象一覧の確定

- [ ] `ability_tree[].ability_list[].skill`（`type: "PassiveSkill"`）の参照先を解決し、
      5種の `skill_type` の出現箇所を `style_id` / 発生源（スキル・通常パッシブ・限界突破パッシブ）単位で
      全件リスト化する集計スクリプトを作成する
- [ ] ag 申告件数（22/20/12/16/2）と突き合わせて確定する

### Phase 1: 防御デバフ効果アップの接続（優先度: 高、与ダメージ直結）

- [ ] `resolvePassiveGiveDefenseDebuffUpForMember` を新設。同種重複時は「最大値採用」仕様
      （侵食 LB2/LB3 で確定済み。`new_style_audit_workflow.md` 参照）を適用する
- [ ] `resolveEnemyDebuffSkillEffectMultiplier` に接続し、`scaleHighBoostEnemyDebuffPower` へ反映する
- [ ] `GiveDebuffUp`（デバフ効果量アップ全般、2件）も本フェーズで接続可否を判定する
- [ ] `resonance_ability_connection_tasklist.md` の `GiveDefenseDebuffUp` 残タスク
      （共鳴アビリティ3グループ分）を本フェーズへ統合する
- [ ] regression test を追加する（シャルロッタ「侵食」LB2/LB3 のケースを含める）

### Phase 2: 攻撃バフ効果アップの接続（優先度: 高、与ダメージ直結）

- [ ] `resolvePassiveGiveAttackBuffUpForMember` を新設、重複時最大値仕様を適用する
- [ ] `resolveAttackBuffSkillEffectMultiplier` に接続し、`scaleHighBoostAttackBuffPower` へ反映する
- [ ] `resonance_ability_connection_tasklist.md` の `GiveAttackBuffUp` 残タスク
      （共鳴アビリティ4グループ分）を本フェーズへ統合する
- [ ] regression test を追加する

### Phase 3: 回復効果アップの接続（優先度: 中）

- [ ] `resolvePassiveGiveHealUpForMember` を新設、重複時最大値仕様を適用する
- [ ] `resolveDpHealOutputModifiersForMember` に接続し、`scaleHighBoostDpHealAmount` へ反映する
- [ ] regression test を追加する

### Phase 4: 破壊率上昇量アップの接続（優先度: 中）

- [ ] `resolvePassiveResonanceDestructionRateBonusForMember` の `support` 限定を撤廃し、
      通常パッシブ・アクティブスキル由来の `DamageRateUp` も汎用 resolver へ接続する
- [ ] `bonusSum` へのマージを確認し、`pierce_equipment_implementation.md`（既存の破壊率+接続実装）との整合を取る
- [ ] regression test を追加する

## 実装時の規約

- calc-core（`src/domain/*-calculator*.js`）は simulator リポジトリで直接編集してよい
  （2026-06-14 の hbr_calc 統合以降。旧「hbr_calc 管轄・編集禁止」運用は廃止）。
  変更時は `npm test` に加え `npm run test:calc` も実行する
- `json/` 配下は1行 minified JSON のため `grep` 不可。`jq` / `node` の JSON パーサーを使う
- 同種効果値が重複する場合は「最大値採用」（加算ではない）が仕様として確定済み
  （`new_style_audit_workflow.md` 参照）
- 不具合修正・実装時はエンジン層/UI層切り分け原則に従う（`dev_principles.md`）

## 参照

- [new_style_audit_workflow.md](new_style_audit_workflow.md) — 発端となった侵食LB未接続の発見記録
- [resonance_ability_connection_tasklist.md](resonance_ability_connection_tasklist.md) — 共鳴アビリティ限定の同種残タスク（本WBSへ統合予定）
- [pierce_equipment_implementation.md](pierce_equipment_implementation.md) — `DamageRateUp` 接続の既存実装例

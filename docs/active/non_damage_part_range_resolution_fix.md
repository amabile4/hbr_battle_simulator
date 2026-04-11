# Non-Damage Part Range Resolution Fix

- ステータス: ✅ 完了
- 最終更新: 2026-04-11

## 概要

non-damage part の runtime が `part.power[0]` を直読みしていたため、
`[min, max]` を持つ実データスキルが常に低い側で解決されていた。

この影響で `46001411 / 今宵、快楽ナイトメア` の `Funnel` が
`3回` 扱いになり、追加ターン重複後の `46005102 / ハネ殺し` の
OD獲得量も実機より低い `48%台` に落ちていた。

## 対応内容

- `src/turn/turn-controller.js` に non-damage part 用の runtime 正規化を追加
- `SkillCondition` / `SkillSwitch` / `SkillRandom` の nested part を含め、
  action/passive 両経路の effective part へ同じ正規化を適用
- `EnemyStatus` / `Funnel` / `Zone` / `ReduceSp` / `HealEp` など
  `power` レンジを読む主要 helper を正規化後の値参照へ統一

## 回帰テスト

- `tests/turn-state-transitions.test.js`
  - `今宵、快楽ナイトメア` の `Dark ResistDown = 0.6`
  - `今宵、快楽ナイトメア` の前衛 `Dark` 付与 `Funnel power = 5`
  - 追加ターンで重複後の `ハネ殺し` が `skillFunnelHitBonus = 10` /
    `odGaugeGain ≒ 69.68`
- 既存の実データテストも max-side 解決へ合わせて更新
  - `迅雷風烈`, `まだまだ行くで！`, `スタンブレード`, `エンジェルズ・ウィング`,
    `サマーグレイス`, `フェリチータ` など

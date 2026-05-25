# Dark Transcendence Override Fix

- ステータス: ✅ 完了
- 最終更新: 2026-05-25

## 概要

`1005107 / アオゾラ全力応援歌` の ROLE ABILITY `闇の律動` に対応する超越ルールが
`json/transcendence_rule_overrides.json` に未登録だったため、battle 開始時の超越ゲージ初期化が発火していなかった。

## 対応内容

- `json/transcendence_rule_overrides.json` に `styleId: 1005107` の `Dark` 超越ルールを追加
- 2026-05-25 追補: `闇の律動` は該当属性スタイルの 1 action/cast ごとに +4% として扱う。攻撃スキルや通常攻撃の属性参照だけでは加算しないため、クイーンの属性貫通通常攻撃は Dark Eシールドを減らしても闇超越ゲージを増やさない
- 追撃が発生した場合は、追撃元スタイルが該当属性なら追撃 1 action/cast として +4% する。対象 replay では追撃なし #2 は `99%` のまま、山脇の追撃あり #2 は `100%` に到達し、クイーン `アトミックフレア` DP BREAK `OverDrivePointUp +100%` と合算して割り込み OD3 が選択可能になる
- `tests/turn-state-transitions.test.js` に実データの `1005107` を使った回帰テストを追加
  - 初期ゲージが `Dark` メンバー数 x 15% で立ち上がること
  - multi-hit でも `Dark` action/cast ごとに +4% ずつ加算されること
  - 非 Dark スタイルが Dark 属性参照の通常攻撃/スキルを使っても超越ゲージを増やさないこと
  - Dark 追撃元の追撃で超越ゲージを +4% すること

## 補足

engine 側の超越処理は `Dark` でも汎用ロジックで動作することを確認済みで、
今回の不具合原因は実装分岐ではなく override データ欠落だった。

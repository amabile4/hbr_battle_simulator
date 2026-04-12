# Dark Transcendence Override Fix

- ステータス: ✅ 完了
- 最終更新: 2026-04-11

## 概要

`1005107 / アオゾラ全力応援歌` の ROLE ABILITY `闇の律動` に対応する超越ルールが
`json/transcendence_rule_overrides.json` に未登録だったため、battle 開始時の超越ゲージ初期化が発火していなかった。

## 対応内容

- `json/transcendence_rule_overrides.json` に `styleId: 1005107` の `Dark` 超越ルールを追加
- `tests/turn-state-transitions.test.js` に実データの `1005107` を使った回帰テストを追加
  - 初期ゲージが `Dark` メンバー数 x 15% で立ち上がること
  - `Dark` メンバー行動で +4% ずつ加算されること

## 補足

engine 側の超越処理は `Dark` でも汎用ロジックで動作することを確認済みで、
今回の不具合原因は実装分岐ではなく override データ欠落だった。

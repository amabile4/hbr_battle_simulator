# Passive Implementation Task List

最終更新: 2026-03-07

## 方針

- パッシブ単体ではなく、関連する状態変化スキルの実装を同じ作業単位に含める
- `condition` 実装と `timing` 実装は分けて管理する
- `Token`, `MoraleLevel`, `MotivationLevel`, `Mark`, `Zone`, `Territory`, `DpRate` は状態保持だけでなく増減スキル実装が必要
- マスタースキル由来パッシブ、通常スキル由来パッシブは別系統として後段で扱う

## Phase 1: 今の状態から取れる条件

- [x] `IsNatureElement`
- [x] `IsCharacter`
- [ ] `IsWeakElement` の仕様確認
- [ ] `IsWeakElement` 実装

## Phase 2: 手動入力状態で扱う条件

- [ ] `DamageRate`
- [ ] `Random`
- [ ] `ConquestBikeLevel`
- [ ] 自キャラ `IsBroken` 手動状態UI
- [ ] 敵 `IsBroken` 手動状態の運用仕上げ

## Phase 3: 状態保持が必要な条件

- [ ] `DpRate`
- [ ] `Token`
- [ ] `MoraleLevel`
- [ ] `MotivationLevel`
- [ ] `FireMarkLevel`
- [ ] `IceMarkLevel`
- [ ] `IsZone`
- [ ] `IsTerritory`

## Phase 4: timing の汎用実行基盤

- [ ] `OnPlayerTurnStart`
- [ ] `OnEveryTurn`
- [ ] `OnEveryTurnIncludeSpecial`
- [ ] `OnBattleStart`
- [ ] `OnFirstBattleStart`
- [ ] `OnEnemyTurnStart`
- [ ] `OnAdditionalTurnStart`
- [ ] `OnBattleWin`

## Phase 5: 状態変化スキル実装

- [ ] トークン付与スキル
- [ ] トークン消費スキル
- [ ] 士気上昇スキル
- [ ] 士気減少スキル
- [ ] やる気上昇スキル
- [ ] やる気減少スキル
- [ ] 火の印付与スキル
- [ ] 火の印消費スキル
- [ ] 氷の印付与スキル
- [ ] 氷の印消費スキル
- [ ] フィールド展開スキル
- [ ] フィールド解除/上書き処理
- [ ] 陣展開スキル
- [ ] 陣解除/上書き処理
- [ ] DP現在値保持
- [ ] DP増減処理

## Phase 6: 将来拡張

- [ ] マスタースキル由来パッシブ
- [ ] 通常スキル由来パッシブ
- [ ] スキルスロット起点パッシブ
- [ ] 装備起点パッシブ

## 優先着手順

1. `IsNatureElement`
2. `IsCharacter`
3. `OnPlayerTurnStart`
4. `OnEveryTurn`
5. `Token` と関連スキル
6. `MoraleLevel` と関連スキル
7. `MotivationLevel` と関連スキル
8. `IsZone` / `IsTerritory` と展開スキル
9. `DpRate` と DP 状態
10. `Mark` 系

## 備考

- `OnBattleStart` と `OnEveryTurn` は一部だけ先行対応済みだが、まだ timing 全体を汎用処理できる状態ではない
- `IsBroken` は自キャラ/敵ともに手動状態として扱う方針
- `Random` は将来、常時成功/個別指定/常時失敗を切り替えられるデバッグ設定と合わせて実装する
- `IsCharacter` は「編成内にそのキャラがいる」ではなく、基本的には「評価対象そのものがそのキャラ」で扱う
- `IsNatureElement` と `IsCharacter` は条件評価器としては実装済み。ただし、それらを使うパッシブ全体の発火は `timing` / `effect` 実装が別途必要
- `オーバーレイ` のように `target_type: AllyAll` と `target_condition: IsCharacter(IIshii)==1` を組み合わせるパッシブがあるため、今後の発火実装は「発火元イベント判定」と「効果対象抽出」を分離して設計する必要がある
- 具体的には「味方の誰かがフィールドを展開した」という味方イベントで発火しつつ、効果対象は後衛の石井本人だけ、というレアケースを許容する必要がある

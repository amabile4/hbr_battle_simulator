# Token Implementation Plan

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-09

## 概要

トークンはキャラクター個別に保持する戦闘状態であり、基本は `0..10` の範囲で増減する。
増加条件はキャラクターごとに異なるが、データ上の起点はある程度共通化できる。

まずは共通モジュールで

- `TokenSet`
- `TokenSetByAttacking`
- `TokenSetByAttacked`
- `TokenSetByHealedDp`
- `Token()` 条件
- `consume_type: Token`
- `TokenAttack`

を扱い、その上にキャラクター固有の発火条件を個別モジュールで載せる。

## トークン所持キャラクター

### 月城 最中 `MTsukishiro`

- スキル増加
  - `断`
  - `空`
  - `朧`
  - いずれも `TokenSet`
- パッシブ増加
  - `戦勲`
  - `TokenSetByAttacking`
- 消費
  - `一途`
  - `consume_type: Token`
- トークン依存攻撃
  - `羅刹`
  - `輝神`
  - `TokenAttack`
  - `TokenChangeTimeline`

### マリア・デ・アンジェリス `MdAngelis`

- スキル増加
  - `パニッシュメント`
  - `フェリチータ`
  - `サクリファイス`
  - いずれも `TokenSet`
- パッシブ増加
  - `戦士の祝福`
  - `TokenSetByHealedDp`
- トークン依存攻撃
  - `サクリファイス`
  - `コンヴィクション・ゼロ`
  - `救済のレクイエム`
  - `TokenAttack`
  - `TokenChangeTimeline`

### 蒼井 えりか `EAoi`

- スキル増加
  - `ご注文を伺います`
  - `TokenSet`
- パッシブ増加
  - `護りの真髄`
  - `TokenSetByAttacked`
- トークン依存攻撃
  - `青春色のシュプール`
  - `TokenAttack`
  - `TokenChangeTimeline`

### 水瀬 いちご `IMinase`

- スキル増加
  - `ナイトグリント`
  - `TokenSet`
- パッシブ増加
  - `戦勲`
  - `TokenSetByAttacking`
- トークン依存攻撃
  - `ルナティック・クリスタル`
  - `TokenAttack`
  - `TokenChangeTimeline`

### 白河 ユイナ `YShirakawa`

- スキル増加
  - `明星`
  - `TokenSet`
- パッシブ増加
  - `快進撃`
  - `OnAdditionalTurnStart` の `TokenSet`
- トークン依存パッシブ
  - `奮起`
  - `DamageRateUpPerToken`

### 菅原 千恵 `CSugahara`

- パッシブ増加
  - `戦勲`
  - `TokenSetByAttacking`
- 消費
  - `覚醒インスティンクト`
  - `consume_type: Token`

### 大島 五十鈴 `IrOhshima`

- スキル増加
  - `星降るシャンデリア・グラス`
  - `TokenSet`
- パッシブ増加
  - `戦勲`
  - `TokenSetByAttacking`
- 消費
  - `エメラルドシロップ`
  - `星降るシャンデリア・グラス`
  - `consume_type: Token`

### 大島 六宇亜 `MuOhshima`

- スキル増加
  - `サマーグレイス`
  - `TokenSet`
- パッシブ増加
  - `ドMの真髄`
  - `TokenSetByAttacked`
- 消費
  - `真夏のひんやりショック！`
  - `consume_type: Token`
- トークン依存効果
  - `OverDrivePointUpByToken`

## 増加トリガー分類

### 共通化しやすいもの

- `TokenSet`
  - スキル使用時に self へ直接加算
- `TokenSetByAttacking`
  - ダメージを与えた敵数ぶん加算
  - 追撃除外
- `TokenSetByAttacked`
  - 敵から攻撃を受けた時に加算
- `TokenSetByHealedDp`
  - DP回復効果をスキルで受けた時に加算
- `OnAdditionalTurnStart` での `TokenSet`
  - timing 汎用基盤に載せやすい

### 個別ルールが必要なもの

- `追撃を除く`
  - 最中/いちご/千恵/五十鈴 系の `戦勲`
- `DP回復を受けると`
  - マリア系
  - 自分が使った回復だけでなく、他人から受けた回復も対象になりうる
- `敵から攻撃を受けると`
  - 蒼井えりか / 大島六宇亜 系
  - `enemyAttackTargetCharacterIds` を turn 単位入力として持ち、commit 境界で `applyEnemyAttackTokenTriggers()` を呼ぶ方針で実装した
  - 記録先は `turnPlan` / scenario の turn-level 入力、および record の `enemyAttackEvents` / `enemyAttackTargetCharacterIds`

## 共通モジュール案

### 1. Token State

- 保持先
  - `CharacterStyle.tokenState`
- 形
  - `current`
  - `min`
  - `max`
- 初期値
  - `0 / 0 / 10`

### 2. Token Resolver

- `addToken(member, delta, reason)`
- `consumeToken(member, delta, reason)`
- `getToken(member)`
- `clampToken(member)`

### 3. Token Condition

- `Token()`
- `CountBC(... Token() >= N ...)`

### 4. Token Skill Hooks

- `applyTokenSetPart(...)`
- `applyTokenSetByAttacking(...)`
- `applyTokenSetByAttacked(...)`
- `applyTokenSetByHealedDp(...)`
- `applyTokenConsumeBySkill(...)`
- `buildTokenAttackContext(...)`

### 5. Token Log

- passive log とは別に、action / record に
  - `tokenBefore`
  - `tokenAfter`
  - `tokenDeltaEvents`
  を残せるようにする

### 非対応方針

- `TokenChangeTimeline`
  - 現時点では独立効果として扱わない
  - 実機上も「トークン数に応じて威力上昇」以外の独立効果は確認できていないため、専用実装は行わない

## 個別モジュール案

### 月城 最中 module

- `戦勲`
- `TokenSet`
- `consume_type: Token`
- `TokenAttack`

### マリア module

- `TokenSet`
- `TokenSetByHealedDp`
- `TokenAttack`

### 被弾トークン module

- 蒼井えりか
- 大島六宇亜
- 共通 hook: `TokenSetByAttacked`
- `applyEnemyAttackTokenTriggers(state, targetCharacterIds)` と commit 境界の record 化まで実装済み
- UI / scenario / turnPlan では `enemyAttackTargetCharacterIds` として被弾対象を入力できる

### 追加ターントークン module

- 白河ユイナ
- `OnAdditionalTurnStart` の `TokenSet`

### トークン依存補正 module

- `DamageRateUpPerToken`
  - `OnPlayerTurnStart` の preview modifier / record 向け参照値として実装済み
- `OverDrivePointUpByToken`
  - OD 上昇値へ反映し、`damageContext` に per-token / tokenCount / totalPercent を保持するところまで実装済み

## 推奨実装順

1. [x] `CharacterStyle.tokenState`
2. [x] `TokenSet`
3. [x] `consume_type: Token`
4. [x] `Token()`
5. [x] 月城最中の `戦勲`
6. [x] マリアの `TokenSetByHealedDp`
7. [x] `TokenAttack`
8. [x] `TokenSetByAttacked` の UI 接続
9. [x] `DamageRateUpPerToken`
10. [x] `OverDrivePointUpByToken`

## 最初のスコープ

最初の着手対象は次でよい。

- 月城 最中
  - [x] `TokenSet`
  - [x] `TokenSetByAttacking`
  - [x] `consume_type: Token`
  - [x] `Token()`
  - [x] `TokenAttack` の preview / record / `damageContext` 露出

## 現在の残課題

- `TokenSetByAttacked`
  - engine / UI / scenario / turnPlan / record の接続は完了
  - 残りは被ダメージ起点 `Motivation -1` と共有する入力 UX の磨き込み、必要なら passive log 表示の拡張
- `TokenAttack` はダメージ計算自体には未接続
  - 現シミュレータのスコープでは preview / record / `damageContext` 露出までで十分
- `TokenChangeTimeline` は独立効果としては扱わない
- 月城最中とマリアの主要トークン系
  - `TokenSet`
  - `TokenSetByAttacking`
  - `TokenSetByHealedDp`
  - `consume_type: Token`
  - `TokenAttack`
  までは実装済み

これで「攻撃由来トークン」と「回復由来トークン」の 2 大パターンを押さえられる。

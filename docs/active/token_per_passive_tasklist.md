# AttackUpPerToken / DefenseUpPerToken 実装タスクリスト

> **ステータス**: ✅ 完了 | 📅 作成: 2026-03-12 | 📅 完了: 2026-03-12

## 背景・目的

`AttackUpPerToken`（高揚・激励）と `DefenseUpPerToken`（鉄壁）は
`applyPassiveTimingInternal` にて「preview時に専用resolverで解決する」として whitelist 済みだが、
resolver が存在しない。`DamageRateUpPerToken` と同型で実装する。

## 対象パッシブ

| id | name | skill_type | timing | target | power | condition |
|----|------|-----------|--------|--------|-------|-----------|
| 100210403/100220503/100420303 | 高揚 | AttackUpPerToken | OnPlayerTurnStart | Self | +5%/token | IsFront() |
| 100410803 | 激励 | AttackUpPerToken | OnPlayerTurnStart | AllyAll | +3%/token (actor token) | なし |
| 100420105/100420203/100850105 | 鉄壁 | DefenseUpPerToken | OnEnemyTurnStart | Self | +7%/token | IsFront() |

## 実装方針

### AttackUpPerToken
- `resolvePassiveAttackUpPerTokenForMember(state, targetMember, timings)` を追加
  - `resolvePassiveDamageRateUpPerTokenForMember` と同型
  - actor.tokenState.current × power[0] を totalRate に加算
  - matchedPassives の rate key は `attackUpRate`（既存 AttackUp events と統一）
- `previewActionEntries` で呼び出し、`specialPassiveModifiers.attackUpRate` に合算
- record assembler に `attackUpPerTokenRate` フィールドを追加（breakdown用）

### DefenseUpPerToken
- `resolvePassiveDefenseUpPerTokenForMember(state, targetMember, timings)` を追加
  - 同型実装、matchedPassives の rate key は `defenseUpPerTokenRate`
- `previewActionEntries` で呼び出し、`specialPassiveModifiers.defenseUpPerTokenRate`（新フィールド）に設定
- record assembler に `defenseUpPerTokenRate` フィールドを追加

## タスク

### 実装

- [x] **T1**: `resolvePassiveAttackUpPerTokenForMember` 関数を追加
  - `resolvePassiveDamageRateUpPerTokenForMember` の直後（line ~3588）に追加
  - skill_type: `'AttackUpPerToken'`、matchedPassives key: `attackUpRate`

- [x] **T2**: `resolvePassiveDefenseUpPerTokenForMember` 関数を追加
  - T1 の直後に追加
  - skill_type: `'DefenseUpPerToken'`、matchedPassives key: `defenseUpPerTokenRate`

- [x] **T3**: `previewActionEntries` に AttackUpPerToken を組み込む
  - `resolvePassiveAttackUpPerTokenForMember(state, member, 'OnPlayerTurnStart')` を呼ぶ
  - `specialPassiveModifiers.attackUpRate` に `attackUpPerToken.totalRate` を加算
  - `specialPassiveEvents` に `attackUpPerToken.matchedPassives` をマージ

- [x] **T4**: `previewActionEntries` に DefenseUpPerToken を組み込む
  - `resolvePassiveDefenseUpPerTokenForMember(state, member, 'OnEnemyTurnStart')` を呼ぶ
  - `specialPassiveModifiers.defenseUpPerTokenRate` に設定（新フィールド）
  - `specialPassiveEvents` に `defenseUpPerToken.matchedPassives` をマージ

- [x] **T5**: record assembler に `attackUpPerTokenRate` / `defenseUpPerTokenRate` フィールドを追加
  - `damageRateUpPerTokenRate` の隣（line ~3910）に追加

### テスト

- [x] **T6**: `AttackUpPerToken (Self / 高揚相当): トークン数に応じて attackUpRate が増加する`
  - token=2, power=0.05 → attackUpRate = 0.10
  - token=0 の場合は 0
  - specialPassiveEvents に高揚が記録される

- [x] **T7**: `AttackUpPerToken (AllyAll / 激励相当): actor のトークンが味方全体の attackUpRate に反映される`
  - actor(pos=0) token=3, power=0.03 → 全前衛の attackUpRate = 0.09
  - actor 自身も対象

- [x] **T8**: `AttackUpPerToken + AttackUp の合算: specialPassiveModifiers.attackUpRate が両方の合計になる`
  - OnEveryTurnIncludeSpecial AttackUp + OnPlayerTurnStart AttackUpPerToken の合算確認

- [x] **T9**: `DefenseUpPerToken (Self / 鉄壁相当): トークン数に応じて defenseUpPerTokenRate が設定される`
  - token=2, power=0.07 → defenseUpPerTokenRate = 0.14
  - token=0 の場合は 0
  - specialPassiveEvents に鉄壁が記録される

- [x] **T10**: `AttackUpPerToken (IsFront condition): 後衛の場合は適用されない`
  - position=3 (後衛) のメンバーは IsFront() = false → attackUpRate = 0

### 完了処理

- [x] **T11**: 全テスト実行（486 → 492 テスト PASS）
- [x] **T12**: ドキュメント更新・コミット

## 完了条件

- token=N のとき attackUpRate が N×rate の分だけ増加する（高揚・激励）✅
- token=N のとき defenseUpPerTokenRate が N×rate になる（鉄壁）✅
- IsFront() 条件が正しく評価される（後衛は適用されない）✅
- 全テスト PASS ✅（492テスト全PASS）

## 参照

- `src/turn/turn-controller.js`: `resolvePassiveDamageRateUpPerTokenForMember` (line ~3530), `previewActionEntries` (line ~4735), record assembler (line ~3895)

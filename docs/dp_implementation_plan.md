# DP実装プラン

最終更新: 2026-03-07

## 方針

- DPはパッシブ条件 `DpRate()` だけの問題ではなく、通常スキル、回復、オーバー回復、自傷、Break関連状態まで含めて扱う
- 現状は戦闘ダメージ計算機がないため、初期段階ではユーザー手入力のDP状態を前提に実装する
- 将来の自動計算に備え、状態モデルは手入力とスキル変化の両方を受け止められる形にする

## 仕様認識

- `DpRate()` は `currentDp / baseMaxDp`
- オーバー回復を許容するため、`currentDp` は `baseMaxDp` で clamp しない
- `DpRate()` は `1.0` を超えうる
- `DpRate()>=1.01` や `DpRate()>1.495` のような条件が実データに存在する
- DP回復スキルには
  - 通常回復
  - 指定％までオーバー回復可能な回復
  が存在する
- DP自傷スキルが存在するため、DP現在値はスキル効果で増減する前提が必要

## 調査結果

### パッシブ条件

- `DpRate()` を使う代表条件
  - `DpRate()==0.0`
  - `DpRate()<=0.3`
  - `DpRate()<=0.5`
  - `DpRate()>=0.5`
  - `DpRate()>=0.8`
  - `DpRate()>=1.0`
  - `DpRate()>=1.01`
  - `DpRate()>1.495`

### 関連 skill_type

- `HealDp`
- `HealDpByDamage`
- `HealDpRate`
- `RegenerationDp`
- `ReviveDp`
- `AttackByOwnDpRate`
- `BreakGuard`
- `SuperBreak`
- `SuperBreakDown`
- `BreakDownTurnUp`
- `AdditionalHitOnBreaking`

### 追加仕様メモ

- オーバー回復上限はスキルごとに異なる
  - 例: `120%まで`, `150%まで`
- `HealDpRate` の実データには `value: [1.2, 0]` のような値があり、オーバー回復上限候補と見られる
- DP関連はパッシブだけでなく、スキル条件・スキル効果・将来のダメージ処理にまたがる

### 現時点の実データ調査メモ

- DP基礎値の参照元候補が 2 層ある
  - `styles.json` の `style.base_param.dp`
    - 例: `30 / 50 / 70`
  - `characters.json` の `character.base_param.dp`
    - 例: `[600, 2000]`
- 一方で `HealDp` 系の `power[0]` は `224 / 305 / 404 / 809` のように大きく、`style.base_param.dp` とはそのまま一致しない
- そのため、`HealDp` / `RegenerationDp` / `ReviveDp` / `HealDpByDamage` の `power[0]` を「そのまま DP 実数値」と読むのは危険
- 初期実装では
  - `DpRate()` 条件
  - 手入力 DP 状態
  - `HealDpRate` のように割合で意味が取れるもの
  - `SelfDamage` のように割合解釈しやすいもの
  を優先し、`HealDp` 系の厳密式は別途切り出す方が安全

### 代表的な実データ例

- `HealDpRate`
  - `46405401`
  - `power[0] = 0.1`, `value[0] = 1.2`
  - 「最大 DP の 10% 回復、120% まで上限突破可」と読むのが自然
- `SelfDamage`
  - `46001314 まだまだ行くで！`
    - `power[0] = 0.5`
  - `46005308 コンペンセーション`
    - 分岐先に `SelfDamage power[0] = 1.0`
  - 初期実装では「`baseMaxDp` に対する割合自傷」として扱うのが最も自然
- `RegenerationDp`
  - `46008506 フェリチータ`
  - `effect.exitCond = EnemyTurnEnd`, `exitVal[0] = 4`
  - 継続ターンは実データから取得できる

### 既存コードとの接点

- `turn-controller` にはすでに `TokenSetByHealedDp` のために
  - `HealDp`
  - `HealDpRate`
  - `RegenerationDp`
  - `ReviveDp`
  - `HealDpByDamage`
  の検出経路がある
- ただし現状は「DP回復を検知してトークンを付与する」だけで、DP現在値そのものは変化していない
- `DpRate` 実装時はこの検出経路を流用して、実際の DP 変化とトークン付与を同時に扱うのが自然

## 実装フェーズ

## Phase 1: 状態モデル

- [ ] `baseMaxDp` を持たせる
- [ ] `currentDp` を持たせる
- [ ] `effectiveDpCap` を持たせる
- [ ] `DpRate()` を `currentDp / baseMaxDp` で評価できるようにする
- [ ] snapshot / record / turnPlan / scenario にDP状態を保存できるようにする

## Phase 2: 手入力UI

- [ ] 味方ごとの DP 現在値入力欄
- [ ] オーバー回復値を入力できるUI
- [ ] DP状態の初期化と復元
- [ ] turnPlan / scenario 再生時のDP再現

## Phase 3: 条件評価

- [ ] `DpRate()==0.0`
- [ ] `DpRate()<=0.3`
- [ ] `DpRate()<=0.5`
- [ ] `DpRate()>=0.5`
- [ ] `DpRate()>=0.8`
- [ ] `DpRate()>=1.0`
- [ ] `DpRate()>=1.01`
- [ ] `DpRate()>1.495`
- [ ] `0.0 < DpRate()` のようなスキル条件

## Phase 4: DP回復スキル

- [ ] `HealDp`
- [ ] `HealDpRate`
- [ ] `RegenerationDp`
- [ ] `ReviveDp`
- [ ] `HealDpByDamage`
- [ ] 通常回復とオーバー回復付き回復を分離して扱う
- [ ] スキルごとのオーバー回復上限を解釈する

## Phase 5: DP自傷とDP依存スキル

- [ ] DP自傷スキルの洗い出し
- [ ] DP自傷の現在値反映
- [ ] `AttackByOwnDpRate`
- [ ] 行動前後で `DpRate` 条件が変わることの反映

## Phase 6: Break関連

- [ ] `BreakGuard`
- [ ] `SuperBreak`
- [ ] `SuperBreakDown`
- [ ] `BreakDownTurnUp`
- [ ] DP破損と `Break` の関係整理

## Phase 7: パッシブ接続

- [ ] `OnPlayerTurnStart` の DP 条件パッシブ
- [ ] `OnEnemyTurnStart` の DP 条件パッシブ
- [ ] `OnEveryTurn` の DP 条件パッシブ
- [ ] `OnBattleWin` の DP 回復系パッシブ

## 設計メモ

- 初期段階では、DP減少は手入力とスキル効果で扱う
- 将来ダメージ計算機が入っても、DP状態モデルはそのまま流用できる形にする
- DP破損と `Break` は現時点では同一視せず、別状態として扱う方が安全
- `OnBattleWin` の `HealDpRate` は DP状態モデル完成後に実装する
- パッシブ側の `DpRate` 実装状況は [`docs/passive_implementation_tasklist.md`](/Users/ram4/git/hbr_battle_simulator/docs/passive_implementation_tasklist.md) から参照する
- `style.base_param.dp` を `baseMaxDp` の初期基準として使う案は実装しやすいが、`HealDp power` との単位差があるため、将来の厳密化余地を残しておく

## 優先順

1. 状態モデル
2. 手入力UI
3. `DpRate()` 条件評価
4. `HealDp` / `HealDpRate`
5. DP自傷
6. `AttackByOwnDpRate`
7. Break関連

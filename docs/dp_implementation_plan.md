# DP実装プラン

最終更新: 2026-03-08

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

## 実装フェーズと進捗

### 現在の進捗

### 実装済み

- Phase 1: 状態モデル
- Phase 2: 手入力UI
- Phase 3: 条件評価

### 未実装

- Phase 4: DP回復スキル
- Phase 5: DP自傷とDP依存スキル
- Phase 6: Break関連
- Phase 7: パッシブ接続

### 補足

- `DpRate()` はパッシブ条件だけでなく、`SkillCondition` と `CountBC(...)` 内のプレイヤー条件でも評価できるようになった
- DP状態は `snapshot / record / turnPlan / scenario` まで保存されるようになり、再計算・再生で引き継げる
- 検証時点では関連テスト 235 件中 234 件が通過しており、`tests/dom-adapter-records-style.test.js` に DP デバッグUIの初期値前提ずれ 1 件が残っている

## Phase 1: 状態モデル

- [x] `baseMaxDp` を持たせる
- [x] `currentDp` を持たせる
- [x] `effectiveDpCap` を持たせる
- [x] `DpRate()` を `currentDp / baseMaxDp` で評価できるようにする
- [x] snapshot / record / turnPlan / scenario にDP状態を保存できるようにする

### Phase 1メモ

- `src/domain/dp-state.js` を新設し、DP状態の正規化と `DpRate()` 評価を一箇所に寄せた
- `baseMaxDp` の初期値は現状 `style.base_param.dp` を採用している
- `currentDp` は `effectiveDpCap` では clamp するが、`baseMaxDp` では clamp しない

## Phase 2: 手入力UI

- [x] 味方ごとの DP 現在値入力欄
- [x] オーバー回復値を入力できるUI
- [x] DP状態の初期化と復元
- [x] turnPlan / scenario 再生時のDP再現

### Phase 2メモ

- 初期編成UIに `BaseDP / 初期DP現在値 / DP上限` を追加した
- 戦闘中にも DP デバッグ入力を追加し、その場で `currentDp / effectiveDpCap` を手修正できる
- `currentDp` を単独で更新したとき、入力値が現在の cap を超える場合は cap を追従させる仕様にしている
- selection save/load、turnPlan 再計算、scenario setup / turn 再生でも DP 状態を保持する

## Phase 3: 条件評価

- [x] `DpRate()==0.0`
- [x] `DpRate()<=0.3`
- [x] `DpRate()<=0.5`
- [x] `DpRate()>=0.5`
- [x] `DpRate()>=0.8`
- [x] `DpRate()>=1.0`
- [x] `DpRate()>=1.01`
- [x] `DpRate()>1.495`
- [x] `0.0 < DpRate()` のようなスキル条件

### Phase 3メモ

- `CONDITION_SUPPORT_MATRIX` 上の `DpRate` は `stateful_future` から `implemented` へ移行した
- 条件評価器を汎化し、`DpRate()` のゼロ引数関数比較を通常条件・逆順比較の両方で解釈できるようにした
- `CountBC(IsPlayer()==1&&DpRate()>=1.0)` のようなプレイヤー側述語も共通条件評価へ寄せて通るようにした

## Phase 4: DP回復スキル

- [ ] `HealDp`
- [ ] `HealDpRate`
- [ ] `RegenerationDp`
- [ ] `ReviveDp`
- [ ] `HealDpByDamage`
- [ ] 通常回復とオーバー回復付き回復を分離して扱う
- [ ] スキルごとのオーバー回復上限を解釈する

### Phase 4メモ

- `turn-controller` には `TokenSetByHealedDp` 用の検知経路が既にあるが、DP現在値更新にはまだ接続していない
- `HealDp` 系は `power` の単位解釈が未確定で、`style.base_param.dp` と直接整合しないため厳密実装は保留
- `HealDpRate` は割合と cap の読み筋が比較的明確なので、Phase 4 着手時はここから入るのが安全

## Phase 5: DP自傷とDP依存スキル

- [ ] DP自傷スキルの洗い出し
- [ ] DP自傷の現在値反映
- [ ] `AttackByOwnDpRate`
- [ ] 行動前後で `DpRate` 条件が変わることの反映

### Phase 5メモ

- DP状態モデルは先に入ったので、`SelfDamage` や `AttackByOwnDpRate` をつなぐ下地はできている
- ただし「行動前の条件判定」と「行動後の DP 変化で次条件が変わる」境界は、スキル効果順序を整理してから入れる必要がある

## Phase 6: Break関連

- [ ] `BreakGuard`
- [ ] `SuperBreak`
- [ ] `SuperBreakDown`
- [ ] `BreakDownTurnUp`
- [ ] DP破損と `Break` の関係整理

### Phase 6メモ

- 現時点では DP 0 と `Break` を同一視していない
- Break 系を先に雑につなぐと、将来の DP破損処理と enemy status の責務が衝突しやすい

## Phase 7: パッシブ接続

- [ ] `OnPlayerTurnStart` の DP 条件パッシブ
- [ ] `OnEnemyTurnStart` の DP 条件パッシブ
- [ ] `OnEveryTurn` の DP 条件パッシブ
- [ ] `OnBattleWin` の DP 回復系パッシブ

### Phase 7メモ

- 条件評価そのものは Phase 3 で通るため、未実装なのは主に DP回復・DP変動を伴うパッシブ効果側
- `OnBattleWin` の `HealDpRate` は DP状態更新ロジックが入ってから接続する方が安全

## 設計メモ

- 初期段階では、DP減少は手入力とスキル効果で扱う
- 将来ダメージ計算機が入っても、DP状態モデルはそのまま流用できる形にする
- DP破損と `Break` は現時点では同一視せず、別状態として扱う方が安全
- `OnBattleWin` の `HealDpRate` は DP状態モデル完成後に実装する
- パッシブ側の `DpRate` 実装状況は [`docs/passive_implementation_tasklist.md`](/Users/ram4/git/hbr_battle_simulator/docs/passive_implementation_tasklist.md) から参照する
- `style.base_param.dp` を `baseMaxDp` の初期基準として使う案は実装しやすいが、`HealDp power` との単位差があるため、将来の厳密化余地を残しておく
- DP関連は UI 入力だけでなく record / replay 系へ保存しないと、turnPlan 再計算や scenario 再生で `DpRate()` 条件の再現性が崩れる
- DPデバッグUIは初期 `currentDp` の既定値前提をテストと揃える必要があり、現状 1 件だけ追従漏れが残っている

## 優先順

1. 状態モデル
2. 手入力UI
3. `DpRate()` 条件評価
4. `HealDp` / `HealDpRate`
5. DP自傷
6. `AttackByOwnDpRate`
7. Break関連

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
- Phase 4: DP回復スキル
- Phase 5: DP自傷とDP依存スキル

### 未実装

- Phase 6: Break関連
- Phase 7: パッシブ接続

### 補足

- `DpRate()` はパッシブ条件だけでなく、`SkillCondition` と `CountBC(...)` 内のプレイヤー条件でも評価できるようになった
- DP状態は `snapshot / record / turnPlan / scenario` まで保存されるようになり、再計算・再生で引き継げる
- `RegenerationDp` の statusEffect も snapshot / record 経由で引き継げるようになった
- 検証時点では非 E2E テスト 274 件が通過している

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

- [x] `HealDp`
- [x] `HealDpRate`
- [x] `RegenerationDp`
- [x] `ReviveDp`
- [x] `HealDpByDamage`
- [x] 通常回復とオーバー回復付き回復を分離して扱う
- [x] 継続回復状態付与と継続回復 tick を分離して扱う
- [x] `TokenSetByHealedDp` を direct heal のみで判定する
- [x] `record` / `snapshot` に DP回復イベント種別と再生状態を残す
- [ ] `HealDp` / `ReviveDp` / `HealDpByDamage` の厳密回復量式
- [ ] 全 skill_type のオーバー回復上限を厳密解釈する

### Phase 4メモ

- `turn-controller` に DP回復イベント正規化を追加し、`HealDp / HealDpRate / ReviveDp` は `DirectDpHeal`、`RegenerationDp` は `RegenerationDpGrant` / `RegenerationDpTick`、`HealDpByDamage` は別イベントとして記録するようにした
- action 起点の DP回復関連は `actions[].dpChanges` に、ターン境界 tick を含む全体履歴は `record.dpEvents` に残す
- `RegenerationDp` は `statusEffects` へ保存し、`EnemyTurnEnd` で tick する
- `TokenSetByHealedDp` は direct heal event のみ参照し、`RegenerationDp` 付与や `HealDpByDamage` では発火しない
- `snapshotPartyByPartyIndex()` に `statusEffects` を載せ、record restore 時に `_nextStatusEffectId` も再計算するようにした
- `HealDp` 系は `power` の単位解釈が未確定で、`style.base_param.dp` と直接整合しないため厳密実装は保留
- `HealDpRate` は `baseMaxDp` 比率回復 + `value[0]` による cap 拡張として扱う
- `ReviveDp` は暫定で `DP0 -> 最小復帰値 1` を採用し、厳密量は未解釈のままにする
- 2026-03-08 時点の Phase 4 完了条件は「DP回復量の厳密再現」ではなく、「DP回復が起きたという事実をシミュレータ内部で扱えること」に置き直す
- このソフトの主要要求は
  - `TokenSetByHealedDp`
  - DP回復をトリガーにするパッシブ
  - `DpRate()` 条件の再評価に必要な最低限の状態遷移
  を成立させることなので、`HealDp power` の厳密式は Phase 4 の完了条件から外す
- 検討はまず次の 2 系統に分ける
  - シンプルケース
    - 「回復スキルが対象の DP を回復した」結果として、`TokenSetByHealedDp` や DP回復起点パッシブが発火する
    - 主対象は `HealDp` / `HealDpRate` / `ReviveDp`
  - 複合ケース
    - 攻撃・分岐・追加効果の結果として DP回復が起こる
    - 主対象は `RegenerationDp`、`HealDpByDamage`、`SkillCondition` 分岐先、`effect` 直下の `HealDp_Buff` 系
- `RegenerationDp` は `HealDp` と同列の「直接回復」ではなく、まず「継続回復状態を付与した」という状態変化として扱う
  - 付与時点: `RegenerationDp` 付与トリガー
  - 後続 tick 時点: 継続回復による DP回復トリガー
  - この 2 つは別イベントとして保持する
- マリア系のトークン上昇では、直接回復と継続回復状態付与が別トリガーとして扱われていたため、パッシブ側でも区別できる前提を維持する
- Phase 4 では個別パッシブの最終挙動までは確定させず、少なくとも次を別物として管理できるようにする
  - 直接 DP回復
  - 継続回復状態付与
  - 継続回復 tick による DP回復
  - 攻撃起点の DP回復
- 実装順の案
  - 1. まずシンプルケースの `HealDp / HealDpRate / ReviveDp` を共通の「直接 DP回復イベント」に正規化する
    - 少なくとも `actor`, `target`, `skillType`, `skillId`, `skillName`, `amountResolved`, `capResolved` を持つ
  - 2. `TokenSetByHealedDp` は「直接 DP回復イベントが発生したか」でまず判定できるようにする
    - 回復量の厳密値を前提にしない
  - 3. `RegenerationDp` は別系統で扱う
    - 付与時には「継続回復状態付与イベント」を発行する
    - 実際の回復が起きる tick では「継続回復 tick イベント」と「継続回復による DP回復イベント」を発行する
    - 付与と回復を同じ trigger に潰さない
  - 4. `record` / `passive log` / debug表示にも「どの種別の DP回復関連イベントが起きたか」を残せるようにする
  - 5. 次に複合ケースを個別に扱う
    - `HealDpByDamage` は「攻撃スキルが敵へ与えたダメージを参照して、自身の DP を回復する」型なので、通常の回復スキルとは別扱いにする
    - target は実質 `Self` 固定だが、発火条件は「回復 part が存在する」ではなく「攻撃結果として与ダメージが確定した」である
    - 将来ダメージ計算機が入るまでは、`HealDpByDamage` の数値回復は未解釈でもよいが、「攻撃起点の DP回復 trigger」というイベント種別は分けて保持した方が安全
  - 6. 数値更新は解釈可能なものから入れる
    - `HealDpRate`: `baseMaxDp` 比率回復として扱い、`value[0]` があれば cap 候補として使う
    - `RegenerationDp`: 継続効果の付与と tick 管理を優先し、tick量が解釈できる場合だけ `currentDp` を増やす
    - `ReviveDp`: 厳密量が不明でも「DP 0 から復帰した」ことを表せる最小復帰値案を採る
    - `HealDp`: まずはイベント発火と trigger 接続を優先し、数値反映は未解釈でも完了扱いとする
    - `HealDpByDamage`: 数値反映は damage context 依存なので後回しにし、まず trigger 用イベントだけ扱う
- 既存 UI に DP 手入力があるため、量未解釈スキルは「トリガーは自動、数値は必要なら手補正」という運用が可能
- `effect` 直下の `HealDp_Buff` 系や `SkillCondition` 分岐先も取りこぼすと trigger が抜けるため、Phase 4 では `parts` だけでなく実際の発火経路全体を正規化対象に含める
- Phase 4 の完了判定案
  - シンプルケースの直接 DP回復系 skill_type が action 実行中に検知される
  - `RegenerationDp` は「状態付与」と「tick 回復」が別イベントとして管理される
  - `TokenSetByHealedDp` と DP回復起点パッシブがその検知結果を参照できる
  - `record` / scenario 再計算で「どの種別の DP回復関連イベントが起きたか」を保持できる
  - `HealDpByDamage` は別イベント種別として分類され、通常回復フローと混線しない
  - 回復量の厳密式が未実装でも、既知の制約としてメモされていれば完了扱いにする

## Phase 5: DP自傷とDP依存スキル

- [x] DP自傷スキルの洗い出し
- [x] DP自傷の現在値反映
- [x] `AttackByOwnDpRate`
- [x] 行動前後で `DpRate` 条件が変わることの反映

### Phase 5メモ

- `SelfDamage` は `baseMaxDp` 比率として解釈し、`SelfDpDamage` イベントとして `actions[].dpChanges` / `record.dpEvents` に残す
- `SelfDamage` は `Self` だけでなく、データ上の target 解決に従って味方対象 DP 減少にも使えるようにしてある
- `SelfDamage` と今後の DPスリップ系の自動減少は、Break明示仕様が無い限り `1` 未満へ落とさない
  - `power[0] = 1.0` でも自動計算上は `DP=1` で止める
  - 自らを Break させたいケースは、シミュレータではユーザー手入力で `currentDp=0` を入れる前提にする
- `AttackByOwnDpRate` は現時点では威力式そのものを damage engine へ直結していないが、少なくとも
  - 行動開始時の `DpRate`
  - 条件評価に使う参照 `DpRate`
  - low / high multiplier
  - 解決後 multiplier
  を preview / committed record の `damageContext` へ保持する
- `SkillCondition` 分岐を含むスキルでも preview と commit の解決結果をずらさないため、行動 entry に resolved skill snapshot を保持して OD / DP / Funnel 系の後段処理へ渡すようにした
- 行動後の DP 変化がいつ見えるかは passive timing に依存する
  - `OnAdditionalTurnStart` / `OnEnemyTurnStart` / `OnBattleWin` のような commit 境界で新規評価される passive は、行動後 DP を見て同じ commit 内で発火できる
  - `OnEveryTurn` / `OnPlayerTurnStart` は次ターン開始用の評価結果として `nextState.turnState.passiveEventsLastApplied` に保持し、前ターンの `committedRecord.passiveEvents` へは混ぜない
  - `コンペンセーション` の確認では、T1 の `SelfDamage` 後でも `究極のスリル` は T1 record に混ざらず、T2 commit 時に初めて見える形へ修正した
  - `SelfDamage 100% -> DP1` の後でも、`DpRate()<=0.05` 条件の `OnAdditionalTurnStart` は同じ commit 内の boundary timing として再評価できる

## Phase 6: Break関連

- [ ] `BreakGuard`
- [ ] `SuperBreak`
- [ ] `SuperBreakDown`
- [ ] `BreakDownTurnUp`
- [ ] DP破損と `Break` の関係整理

### Phase 6メモ

- 現時点では DP 0 と `Break` を同一視していない
- このシミュレータでは自動計算の `SelfDamage` / DP消費 / 将来の DPスリップで DP 0 を作らない
  - 自動で DP 0 になる経路は、将来の敵攻撃や特殊状態+フィールドダメージを実装する時に別途扱う
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
- 自傷や味方起点の DP消費では自動的に Break させず、DP 0 は手入力でのみ再現する
- `OnBattleWin` の `HealDpRate` は DP状態モデル完成後に実装する
- パッシブ側の `DpRate` 実装状況は [`docs/passive_implementation_tasklist.md`](/Users/ram4/git/hbr_battle_simulator/docs/passive_implementation_tasklist.md) から参照する
- `style.base_param.dp` を `baseMaxDp` の初期基準として使う案は実装しやすいが、`HealDp power` との単位差があるため、将来の厳密化余地を残しておく
- DP関連は UI 入力だけでなく record / replay 系へ保存しないと、turnPlan 再計算や scenario 再生で `DpRate()` 条件の再現性が崩れる
- `committedRecord.passiveEvents` は「その turn の開始時点で既に有効だった passive」と「その commit 境界で新規発火した passive」のみを持つ
  - 次ターン開始用の `OnEveryTurn` / `OnPlayerTurnStart` を前ターン record に逆流させない
- DPデバッグUIは初期 `currentDp` の既定値前提をテストと揃える必要があり、現状 1 件だけ追従漏れが残っている

## 優先順

1. 状態モデル
2. 手入力UI
3. `DpRate()` 条件評価
4. `HealDp` / `HealDpRate`
5. DP自傷
6. `AttackByOwnDpRate`
7. Break関連

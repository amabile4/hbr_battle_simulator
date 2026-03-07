# Passive Implementation Task List

最終更新: 2026-03-07

## 方針

- パッシブ単体ではなく、関連する状態変化スキルの実装を同じ作業単位に含める
- `condition` 実装と `timing` 実装は分けて管理する
- `Token`, `MoraleLevel`, `MotivationLevel`, `Mark`, `Zone`, `Territory` は状態保持だけでなく増減スキル実装が必要
- `Token` は独立プラン `docs/token_implementation_plan.md` を参照
- `DpRate` / DP関連はパッシブに閉じないため [`docs/dp_implementation_plan.md`](/Users/ram4/git/hbr_battle_simulator/docs/dp_implementation_plan.md) で別管理する
- マスタースキル由来パッシブ、通常スキル由来パッシブは別系統として後段で扱う

## Phase 1: 今の状態から取れる条件

- [x] `IsNatureElement`
- [x] `IsCharacter`
- [x] `IsWeakElement` の仕様確認
- [x] `IsWeakElement` 実装

## Phase 2: 手動入力状態で扱う条件

- [ ] `DamageRate`
- [ ] `Random`
- [ ] `ConquestBikeLevel`
- [ ] 自キャラ `IsBroken` 手動状態UI
- [ ] 敵 `IsBroken` / `IsDead` 手動状態の運用仕上げ

## Phase 3: 状態保持が必要な条件

- [ ] `DpRate`
  - 実装計画は [`docs/dp_implementation_plan.md`](/Users/ram4/git/hbr_battle_simulator/docs/dp_implementation_plan.md) を参照
- [x] `Token`
  - 共通基盤として `CharacterStyle.tokenState`、`Token()`、`TokenSet`、`consume_type: Token` は実装済み
  - 月城最中系の `TokenSetByAttacking`、マリア系の `TokenSetByHealedDp` は実装済み
  - `TokenSetByAttacked` はエンジン API `applyEnemyAttackTokenTriggers()` まで実装済み
  - `TokenAttack` は preview / record / `damageContext` に参照値を保持するところまで実装済み
  - `DamageRateUpPerToken` は `OnPlayerTurnStart` の preview modifier / record 向け参照値として実装済み
  - `OverDrivePointUpByToken` は OD 上昇値へ反映し、`damageContext` に参照値を保持するところまで実装済み
  - `TokenChangeTimeline` は独立効果としては扱わず、`TokenAttack` と同列の内部表現として無視する方針
  - 未実装は `TokenSetByAttacked` の UI 接続
- [x] `MoraleLevel`
  - 共通基盤として `CharacterStyle.moraleState` と `MoraleLevel()` 条件評価は実装済み
  - `CountBC(... MoraleLevel() >= N ...)` の player 条件評価も実装済み
  - `Morale` スキルによる士気上昇、`SkillCondition` / `iuc_cond` を含む士気依存スキル分岐は実装済み
  - `AdditionalHitOnSpecifiedSkill` / `AdditionalHitOnExtraSkill` を起点にした士気上昇パッシブも実装済み
  - `AdditionalHitOnKillCount` はエンジン側で実装済み。現状は `action.killCount` を与える形で検証する
  - `consume_type: Morale` と負数 `Morale` にも対応済み
- [x] `MotivationLevel`
  - 共通基盤として `CharacterStyle.motivationState` と `MotivationLevel()` 条件評価は実装済み
  - シミュレータの初期値ランダムは再現性優先で廃止し、初期値既定は `Lv.3 普通`
  - キャラクター選択 UI で各キャラごとに `1..5` を選択可能
  - 選択値は localStorage 保存、`turnPlanBaseSetup`、record snapshot / JSON export に保持
  - `Motivation` スキルによる明示レベル上書きは実装済み
  - `OnFirstBattleStart` のランダム付与系は、シミュレータでは手動初期値を優先して no-op として扱う
  - 未実装は `DP回復で +1` と `被ダメージで -1` のイベントフック
- [ ] `FireMarkLevel`
  - 共通基盤として `CharacterStyle.markStates`、各 `*MarkLevel()` 条件評価、`Fire/Ice/Thunder/Dark/LightMark` スキル適用は実装済み
  - 実データ回帰は `ThunderMarkLevel / DarkMarkLevel / LightMark` 経由で通している
  - 火の印の常在効果は実装済み
    - Lv1: スキル攻撃力+30% を preview / record modifier に反映
    - Lv2: 被ダメージ-10% を preview / record modifier に反映
    - Lv3: 破壊率上昇+10% を preview / record modifier に反映
    - Lv4: クリティカル率+30% を preview / record modifier に反映
    - Lv5: クリティカルダメージ+30% を preview / record modifier に反映
    - Lv6: ターン開始時 前衛SP+1 を実効
- [ ] `IceMarkLevel`
  - 共通基盤は `FireMarkLevel` と同じ実装を共有
  - 氷 / 雷 / 闇 / 光 の印レベル条件評価と印状態付与基盤は実装済み
  - 各属性印の常在効果は未実装
- [x] `IsZone`
- [x] `IsTerritory`

### `IsZone` / `IsTerritory` 仕様メモ

- `Zone` は属性フィールド状態として扱う
- `Territory` は陣状態として扱う
- `Zone` と `Territory` は別状態であり、同時に存在できる
- `Zone` は後から展開されたものが上書きする
- `Zone` は味方・敵のどちらも展開できる
- `Zone` には効果ターン無制限と効果ターン制限ありがある
- `Territory` は `Zone` と独立して継続する特殊状態で、展開中は対応する特殊効果を受け続ける
- `Territory` も将来のデータ差分に備えて継続ターンを持てる設計にする
- 現時点で確認できた `ReviveTerritory` は `exitCond: None` / `exitVal: [0,0]` で、少なくとも現データ上は無期限
- 現時点で確認できている条件出現は
  - `IsZone(Fire)` 1件
  - `IsTerritory(ReviveTerritory)` 2件
- 現時点で確認できている展開系の出現は
  - `Zone`
    - スキル展開は `exitCond: PlayerTurnEnd / exitVal: [8,0]` などのターン制限あり
    - パッシブ展開や `ZoneUpEternal` により `exitCond: Eternal` の永続あり
  - `Territory`
    - `ReviveTerritory` は `target_type: Field`
    - 現データ上は `exitCond: None / exitVal: [0,0]`
- 実装時は `turnState` に少なくとも次を持たせる前提で整理する
  - `zoneState`
  - `territoryState`
- `zoneState` の最低要件
  - `type`
  - `sourceSide`
  - `remainingTurns`
- `territoryState` の最低要件
  - `type`
  - `sourceSide`
  - `remainingTurns`
- `remainingTurns` は `null` または特定値で無制限を表せるようにする
- `turnPlan` 再計算のため、`setupDelta` / `turnPlanBaseSetup` にも保存可能である必要がある
- 現在の実装済み範囲
  - `turnState.zoneState`
  - `turnState.territoryState`
  - `IsZone(...)`
  - `IsTerritory(...)`
  - スキル `Zone`
  - スキル `ReviveTerritory`
  - `ZoneUpEternal` による自分の `Zone` 永続化
  - パッシブ `OnBattleStart` などによる `Zone`
  - 基本的な継続ターン減少
  - `turnPlan` / scenario / `turnPlanBaseSetup` への `zoneState` / `territoryState` 保存と復元
- まだ未実装の範囲
  - 敵側の `Zone` 展開
  - 陣の種類追加時の個別効果適用
  - `ZoneUpEternal` の効果量上昇側の反映

## Phase 4: timing の汎用実行基盤

- [x] `OnPlayerTurnStart`
- [x] `OnEveryTurn`
- [x] `OnEveryTurnIncludeSpecial`
- [x] `OnBattleStart`
- [x] `OnFirstBattleStart`
- [x] `OnEnemyTurnStart`
- [x] `OnAdditionalTurnStart`
- [x] `OnBattleWin`

### turnPlan 再設計タスク

- [x] `turnPlan` を「行動入力」だけでなく「発火に必要な環境入力」も持てる構造に再設計する
- [x] `turnPlan` に `setupDelta` 相当の層を導入する
- [x] `setupDelta` に複数敵状態を保持できるようにする
  - `enemyCount`
  - `enemyNames`
  - `enemyDamageRates`
  - `enemyStatuses`
- [ ] 将来の `timing` 発火条件で必要な状態を `setupDelta` / turn state のどちらで持つか整理する
  - `Zone`
  - `Territory`
  - `Token`
  - `MoraleLevel`
  - `MotivationLevel`
  - `Mark`
  - `DpRate`
- [ ] `turnPlan` にはパッシブ発火結果そのものではなく「発火に必要な入力状態」を保存する方針で統一する
- [ ] パッシブ発火結果は record 側に残し、`turnPlan` 再計算時に毎回再評価する
- [x] `turn-controller` に `timing` 単位の汎用実行入口を設ける
  - 例: `applyPassiveTiming(state, timing, context)`
- [ ] `timing` 実行時の `context` に何を持たせるか定義する
  - `turnType`
  - `isFirstBattleTurn`
  - `isAdditionalTurn`
  - `triggerSource`
  - `enemyState`
  - `actor`

### turnPlan 再設計メモ

- 今の `turnPlan` は `enemyCount` と `actions` 中の `targetEnemyIndex` までは持てるが、複数敵状態全体は保持していない
- 今後 `OnBattleStart` / `OnEnemyTurnStart` / `OnAdditionalTurnStart` を汎用化するには、「そのターン開始時点で何が展開されていたか」を再現できる必要がある
- そのため `turnPlan` は「入力意図」と「環境差分」を分けて持つ方がよい
- 想定構造
  - `setupDelta`
  - `actionIntent`
  - `expectedMeta`
- 現在は `applyPassiveTiming(state, timing, context)` の公開 API を追加し、`HealSp/HealEp` に関して
  - `OnAdditionalTurnStart`
  - `OnBattleStart`
  - `OnEnemyTurnStart`
  - `OnFirstBattleStart`
  - `OnEveryTurn`
  - `OnPlayerTurnStart`
  を同じ入口で通せる状態まで進んでいる
- `OnEnemyTurnStart` は base turn index が進み、敵ターンが消費される境界で評価する
  - 現時点では敵行動本体は未シミュレートのため、まず `passiveEvents` と対応済み effect のみ処理
- `OnAdditionalTurnStart` は extra turn へ遷移した瞬間に評価する
  - `grantExtraTurn()` の直接呼び出し
  - `commitTurn()` 後に次状態が `turnType === 'extra'` になった場合
- `OnBattleWin` は enemyCount を維持したまま、全敵が `Dead` 状態になったときに評価する
  - 敵は配列から削除せず、`Dead` を持つことで場から除外されたものとして扱う
  - `CountBC(IsPlayer()==0 && IsDead()==0 && ...)` は `Dead` でない敵のみを数える
- `OnEveryTurnIncludeSpecial` は「特殊状態つきの行動開始時」寄りの timing とみなす
  - 毎ターンの行動選択時に条件を再評価する
  - `ReduceSp` のように、そのターンの選択スキルの消費SPへ直接効く効果を優先実装する
  - 将来 `AttackUp` なども同じ preview/行動選択文脈へ載せる
- 現時点の汎用 effect 対応は `HealSp/HealEp` が中心で、`OnEnemyTurnStart` の敵デバフ/防御バフ系は一部ログ化のみ

## Phase 5: 状態変化スキル実装

- [x] トークン付与スキル
- [x] トークン消費スキル
- [x] 士気上昇スキル
- [x] 士気減少/消費スキル
  - 明示データは未確認だが、負数 `Morale` と `consume_type: Morale` を処理できる状態
- [x] やる気上昇スキル
  - `Motivation` による明示レベル設定は実装済み
- [ ] やる気減少スキル
  - `被ダメージで -1` のようなイベント起点は未実装
- [ ] 火の印付与スキル
- [ ] 火の印消費スキル
- [ ] 氷の印付与スキル
- [ ] 氷の印消費スキル
- [x] フィールド展開スキル
- [ ] フィールド解除/上書き処理
- [x] 陣展開スキル
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
  - 詳細は [`docs/dp_implementation_plan.md`](/Users/ram4/git/hbr_battle_simulator/docs/dp_implementation_plan.md)
10. `Mark` 系

## 備考

- `OnBattleStart` と `OnEveryTurn` は主要 timing の入口は揃っているが、effect 種別の汎用化はまだ継続中
- `IsBroken` は自キャラ/敵ともに手動状態として扱う方針
- `Random` は将来、常時成功/個別指定/常時失敗を切り替えられるデバッグ設定と合わせて実装する
- `IsCharacter` は「編成内にそのキャラがいる」ではなく、基本的には「評価対象そのものがそのキャラ」で扱う
- `IsNatureElement` / `IsCharacter` / `IsWeakElement` は条件評価器としては実装済み。ただし、それらを使うパッシブ全体の発火は `timing` / `effect` 実装が別途必要
- `IsWeakElement(Fire)` は敵の該当属性ダメージ係数が `100%` を超えると真になる。`100%` 以下は偽
- 敵の属性耐性/弱点は現時点では手動状態として保持する。未設定時は `100%` 扱い
- DP関連は `DpRate` 条件だけでなく、DP回復、DP自傷、オーバー回復上限、`AttackByOwnDpRate`、`BreakGuard` を含むため独立ドキュメントで管理する
- `オーバーレイ` のように `target_type: AllyAll` と `target_condition: IsCharacter(IIshii)==1` を組み合わせるパッシブがあるため、今後の発火実装は「発火元イベント判定」と「効果対象抽出」を分離して設計する必要がある
- 具体的には「味方の誰かがフィールドを展開した」という味方イベントで発火しつつ、効果対象は後衛の石井本人だけ、というレアケースを許容する必要がある
- `IsZone` / `IsTerritory` は条件評価だけでなく、展開スキル・上書き・継続ターン管理とセットで設計する
- 士気レベルは共有値ではなく各キャラクター個別状態として扱う
- 士気は計算で追える前提とし、デバッグ入力は持たない
- UI 表示は `moraleState.current > 0` のキャラだけに出す

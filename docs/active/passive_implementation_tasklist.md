# Passive Implementation Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-09

## 方針

- パッシブ単体ではなく、関連する状態変化スキルの実装を同じ作業単位に含める
- `condition` 実装と `timing` 実装は分けて管理する
- `Token`, `MoraleLevel`, `MotivationLevel`, `Zone`, `Territory` は状態保持だけでなく増減スキル実装が必要
- `Mark` は battle start 時にパーティーの `elements` 構成から決まる永続状態として扱う
- `Token` は独立プラン [`token_implementation_plan.md`](token_implementation_plan.md) を参照
- `DpRate` / DP関連はパッシブに閉じないため [`../archive/20260309_completed_active_docs/dp_implementation_plan.md`](../archive/20260309_completed_active_docs/dp_implementation_plan.md) で別管理する
- マスタースキル由来パッシブ、通常スキル由来パッシブは別系統として後段で扱う
- [`../archive/20260309_completed_active_docs/multi_enemy_implementation_tasklist.md`](../archive/20260309_completed_active_docs/multi_enemy_implementation_tasklist.md) は別管理であり、このタスクリストには複数敵固有の詳細は持ち込まない

## Phase 1: 今の状態から取れる条件

- [x] `IsNatureElement`
- [x] `IsCharacter`
- [x] `IsWeakElement` の仕様確認
- [x] `IsWeakElement` 実装

## Phase 2: 手動入力状態で扱う条件

- [x] `DamageRate`
  - 敵ごとの手動破壊率状態として実装
  - 既存の敵 `damageRatesByEnemy` は属性/物理の耐性係数であり、`DamageRate()` とは別状態
  - パッシブ条件評価専用で、ダメージ計算には使わない
- [x] `Random`
- [x] `ConquestBikeLevel`
  - 現在は固定値 `160` を返す実装
  - 将来課題として UI からの上書き入力を追加する
- [x] 自キャラ `IsBroken` 手動状態UI
  - 初期編成 UI と scenario / turnPlan / snapshot 保存まで実装済み
- [x] 敵 `IsBroken` / `IsDead` 手動状態の運用仕上げ
  - enemy status controls、record、scenario、turnPlan 再生まで通っている

## Phase 3: 状態保持が必要な条件

- [x] `DpRate`
  - 実装計画は [`../archive/20260309_completed_active_docs/dp_implementation_plan.md`](../archive/20260309_completed_active_docs/dp_implementation_plan.md) を参照
  - 条件評価、DP状態保存、DP増減、DP条件パッシブ接続まで実装済み
- [x] `Token`
  - 共通基盤として `CharacterStyle.tokenState`、`Token()`、`TokenSet`、`consume_type: Token` は実装済み
  - 月城最中系の `TokenSetByAttacking`、マリア系の `TokenSetByHealedDp` は実装済み
  - `TokenSetByAttacked` は engine API `applyEnemyAttackTokenTriggers()` と UI / scenario / turnPlan / record 接続まで実装済み
  - `TokenAttack` は preview / record / `damageContext` に参照値を保持するところまで実装済み
  - `DamageRateUpPerToken` は `OnPlayerTurnStart` の preview modifier / record 向け参照値として実装済み
  - `OverDrivePointUpByToken` は OD 上昇値へ反映し、`damageContext` に参照値を保持するところまで実装済み
  - `TokenChangeTimeline` は独立効果としては扱わず、`TokenAttack` と同列の内部表現として無視する方針
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
  - `被ダメージで -1` は `enemyAttackTargetCharacterIds` を使う共通 hook として engine / record / passive log まで実装済み
  - `敵からダメージを受けると1段階減少` はヘルプ仕様に基づく `Motivation` 状態の共通ルールとして扱い、専用 `skill_type` は要求しない
  - 未実装は `DP回復で +1` のイベントフック
- [x] `FireMarkLevel`
  - 共通基盤として `CharacterStyle.markStates` と各 `*MarkLevel()` 条件評価は実装済み
  - battle start 時に、パーティー内の同属性 `elements` 人数ぶんだけ対象属性キャラへ永続で付与する
  - 実行時の `Fire / Ice / Thunder / Dark / LightMark` skill_type では印状態を増減させない
  - 実データ回帰は `ThunderMarkLevel / DarkMarkLevel / LightMark` 経由で通している
  - 全属性印の常在効果は同型として実装済み
    - Lv1: スキル攻撃力+30% を preview / record modifier に反映
    - Lv2: 被ダメージ-10% を preview / record modifier に反映
    - Lv3: 破壊率上昇+10% を preview / record modifier に反映
    - Lv4: クリティカル率+30% を preview / record modifier に反映
    - Lv5: クリティカルダメージ+30% を preview / record modifier に反映
    - Lv6: ターン開始時 前衛SP+1 を実効
- [x] `IceMarkLevel`
  - 共通基盤は `FireMarkLevel` と同じ実装を共有
  - 氷 / 雷 / 闇 / 光 の印レベル条件評価、battle start 初期化、常在効果を `FireMarkLevel` と同じ実装で共有
  - 残課題は UI 表示拡張、Records / Passive Log での見える化、各属性の実データ回帰追加
- [x] `IsZone`
- [x] `IsTerritory`

### `IsZone` / `IsTerritory` 仕様メモ

- `Zone` は属性フィールド状態として扱う
- ヘルプ記載どおり、フィールド効果は敵/味方で共通の 1 つだけ存在でき、新しいものが常に上書きする
- `Territory` は陣状態として扱う
- ヘルプ記載どおり、陣も敵/味方で共通の 1 つだけ存在でき、新しいものが常に上書きする
- `Zone` と `Territory` は別状態であり、同時に存在できる
- `Zone` は後から展開されたものが上書きする
- `Zone` は味方・敵のどちらも展開できる
- `Zone` には効果ターン無制限と効果ターン制限ありがある
- `Territory` は `Zone` と独立して継続する特殊状態で、展開中は対応する特殊効果を受け続ける
- `Territory` も将来のデータ差分に備えて継続ターンを持てる設計にする
- 現時点で確認できた `ReviveTerritory` は `exitCond: None` / `exitVal: [0,0]` で、少なくとも現データ上は無期限
- `ReviveTerritory` は turn start 時、DP破損中の味方がいれば味方全体の DP を 50% 回復して消失する
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
  - 敵設定 UI からの手動 `Zone` 展開
- まだ未実装の範囲
  - 陣の種類追加時の個別効果適用
  - `ZoneUpEternal` の効果量上昇側の反映
  - `Zone` / `Territory` の効果内容そのものの見える化

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
- [x] 将来の `timing` 発火条件で必要な状態を `setupDelta` / turn state のどちらで持つか整理する
  - `Zone`
  - `Territory`
  - `Token`
  - `MoraleLevel`
  - `MotivationLevel`
  - `Mark`
  - `DpRate`
- [x] `turnPlan` にはパッシブ発火結果そのものではなく「発火に必要な入力状態」を保存する方針で統一する
- [x] パッシブ発火結果は record 側に残し、`turnPlan` 再計算時に毎回再評価する
- [x] `turn-controller` に `timing` 単位の汎用実行入口を設ける
  - 例: `applyPassiveTiming(state, timing, context)`
- [x] `timing` 実行時の `context` に何を持たせるか定義する
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
- 現在の保存方針
  - `setupDelta` には `dpStateByPartyIndex` / `tokenStateByPartyIndex` / `moraleStateByPartyIndex` / `motivationStateByPartyIndex` / `markStateByPartyIndex` / `zoneState` / `territoryState` を保持する
  - 被弾入力は battle state ではなく turn 単位の一時入力として `enemyAttackTargetCharacterIds` を top-level に保持する
  - `passiveEvents` や warning は `turnPlan` に保存せず、record 側で保持する
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
  - やる気付与元スタイルが編成内にいる時だけ初期値選択 UI を有効化し、既定値は `普通(3)` にする
  - やる気付与元がいない時は初期値 `0` / 非表示とする
- [x] やる気減少スキル
  - `被ダメージで -1` は `enemyAttackTargetCharacterIds` を使う共通 hook として実装済み
  - `Motivation` の最低段階は `1` として扱い、被弾では `0` まで落とさない
- [x] 属性印の battle start 初期化
  - `Fire / Ice / Thunder / Dark / Light` の `*MarkLevel()` 条件評価は実装済み
  - 実機仕様に合わせて「属性人数ベースの印レベル」を battle start で固定付与する
  - 実行時の `*Mark` skill_type は状態変化として扱わない
- [x] 属性印の常在効果
  - 全属性を同型として実装済み
  - 残りは UI / Records / Passive Log での見える化
- [x] 属性印は消費しない
  - ヘルプ確認に基づき、battle start 取得後は永続で減少/消費しない前提へ修正
- [x] フィールド展開スキル
- [x] フィールド解除/上書き処理
  - `Zone` は duration tick と新規展開上書きを持ち、state / scenario / record に保持する
- [x] 陣展開スキル
- [x] 陣解除/上書き処理
  - `Territory` は新規展開で上書きされ、`ReviveTerritory` は turn start 発動後に消失する
- [x] DP現在値保持
- [x] DP増減処理
  - Phase 4 の direct heal / regeneration grant / regeneration tick / HealDpByDamage trigger は実装済み
  - Phase 5 の `SelfDamage` / `AttackByOwnDpRate` / 行動後 `DpRate` 再評価は実装済み
  - Phase 7 の `HealDpRate` / `ReviveDpRate` passive effect と `OnPlayerTurnStart` / `OnEveryTurn` / `OnEnemyTurnStart` / `OnBattleWin` 接続も実装済み
  - `HealDp` / `ReviveDp` / `HealDpByDamage` の厳密量は仕様留保のまま、trigger と状態遷移を優先して完了扱いにする

### DP回復タスクメモ

- DP関連の詳細実装計画は [`../archive/20260309_completed_active_docs/dp_implementation_plan.md`](../archive/20260309_completed_active_docs/dp_implementation_plan.md) の Phase 4 を参照
- Phase 4 の完了条件は「回復量の厳密再現」ではなく、「DP回復イベントを trigger と状態遷移の入力として扱えること」に置く
- 現在は
  - `DirectDpHeal`
  - `RegenerationDpGrant`
  - `RegenerationDpTick`
  - `HealDpByDamage`
  を別イベントとして管理し、`record.dpEvents` と `actions[].dpChanges` に残す
- まずは
  - 通常の回復スキルで対象の DP を回復した
  - その結果として `TokenSetByHealedDp` や DP回復起点パッシブが発火した
  というシンプルケースを先に通す
- `RegenerationDp` は直接回復ではなく「継続回復状態付与」と「その後の継続回復 tick」を分けて扱う
  - マリア系のトークン上昇ではこの差が効くため、パッシブ側でも区別できる前提を保つ
  - Phase 4 では挙動詳細の確定まではせず、別 trigger として管理できることを優先する
- `TokenSetByHealedDp` は direct heal のみ参照し、`RegenerationDp` 付与や `HealDpByDamage` では発火しない
- `HealDpByDamage` は「攻撃成功時に、与ダメージ割合で self の DP を回復する」複合ケースなので別扱いにする
- そのため `HealDp` / `HealDpByDamage` の `power` 厳密解釈が未実装でも、次が通れば完了扱いにできる
  - `TokenSetByHealedDp`
  - DP回復起点のパッシブ
  - `record` / replay 上での DP回復イベント保持
- `HealDpRate` のように割合で解釈できるものだけ数値反映を先行し、その他は既存 DP 手入力 UI で補正可能とする
- 実装上、`RegenerationDpTick` の発生タイミングは「毎 commit」ではなく「base turn index が進み、敵ターンが消費された境界」に置くのが安全だった
  - OD/EX 中の commit では tick させない
- DP回復イベントは 2 層に分けると扱いやすい
  - `actions[].dpChanges`: どの行動が何を起こしたかを追う action 単位の履歴
  - `record.dpEvents`: 再生や将来の trigger 判定で参照する turn 全体の履歴
- DPプラン側の Phase 5 は実装済み
  - `SelfDamage` は `baseMaxDp` 比率で現在値へ反映し、`SelfDpDamage` として記録する
  - Break明示仕様が無い DP消費は `1` 未満へ落とさず、シミュレータ上で自動 Break を起こさない
  - DP 0 / Break を再現したいケースは、現状はユーザー手入力で `currentDp=0` を入れる前提
  - `AttackByOwnDpRate` は preview / record の `damageContext` に「行動開始時 DP 比率」と解決 multiplier を残す
  - `SkillCondition` 分岐後の実スキルを行動 entry に snapshot して、OD増加・DP変化・Funnel などの後段処理でも同じ分岐結果を使う
  - 行動後 DP を同じ commit 内で見られるのは boundary timing に限られる
    - `OnAdditionalTurnStart` / `OnEnemyTurnStart` / `OnBattleWin` は行動後状態を見て評価できる
    - `OnEveryTurn` / `OnPlayerTurnStart` は次ターン開始用として `nextState.turnState.passiveEventsLastApplied` に保持し、前ターンの `committedRecord.passiveEvents` には混ぜない
  - `コンペンセーション` の検証では、T1 の `SelfDamage` 後でも `究極のスリル` は T1 record へは載らず、T2 commit 時に初回発火として見える
- そのため Passive 側の残件は「DP状態が見えるか」ではなく、「各 passive effect が direct heal / regen grant / regen tick / self damage / damage-based heal / break 起点をどう解釈するか」の詰めに寄ってきた
- `RegenerationDp` を replay で安定させるには、DP値だけでなく `statusEffects` 自体を snapshot / restore へ通す必要があった
  - 復元時は `_nextStatusEffectId` の再計算も必要
- `HealDpRate` は `baseMaxDp` 基準の割合回復として扱えるが、他の DP回復 skill_type は現状「回復した事実」と「種別」を保持するところまでで十分だった
- Phase 7 で個別パッシブを詰める時は、「direct heal」「regen grant」「regen tick」「damage-based heal」の 4 種別を別 trigger として使う前提でテストを書く
- Phase 7 で `HealDpRate` / `ReviveDpRate` の passive effect が `OnPlayerTurnStart` / `OnEveryTurn` / `OnEnemyTurnStart` / `OnBattleWin` に接続された
  - passive 起点の DP変化は `dp_passive` として `record.dpEvents` に残る
  - unsupported passive log は条件不成立や target 不在では残さないようにした

### timing 記録メモ

- `committedRecord.passiveEvents` は次の 2 種だけを載せる
  - その turn の開始時点で既に `state.turnState.passiveEventsLastApplied` に入っていたもの
  - `commitTurn()` 中の boundary で新規発火したもの
- これにより、次ターン開始用の `OnEveryTurn` / `OnPlayerTurnStart` が前ターン record に逆流しない
- 現在の timing 全体像は [`passive_timing_reference.md`](passive_timing_reference.md) を参照

## Phase 6: 将来拡張

> 📅 PRI-006 調査完了: 2026-03-09

### 調査結果サマリー

| source | データ読み込み | 処理パイプライン | エフェクト適用 | 状態 |
|--------|--------------|----------------|--------------|------|
| 通常スキル由来（skills.json `passive` フィールド） | ✅ 実装済み | ✅ 実装済み | ✅ Phase 6-A 完了 | **残り複雑型は後段** |
| マスタースキル由来（ability_tree PassiveSkill ノード） | ❌ 未実装 | ❌ 未着手 | ❌ 未着手 | **データソース確立から** |
| スキルスロット起点（generalize フラグ） | データは存在 | ❌ 未着手 | ❌ 未着手 | **仕様未確定** |
| 装備起点（accessories / chips） | バトル passive なし | — | — | **対象外** |

### 通常スキル由来パッシブ（skills.json の `passive` フィールド）

- `skills.json` に `passive` フィールドを持つスキルが 26 件（`is_restricted: 1`、コマンド選択不可）
- `listTriggeredSkillsByStyleId` → `toPassiveLikeEntryFromTriggeredSkill` → `getPassiveEntriesForMember` → `applyPassiveTimingInternal` のパイプラインは**実装済み**
- **ギャップ**: `DefenseDown` 等のエフェクト種別が `unsupported` としてログされている
- **実装内容**: `src/turn/turn-controller.js` の `applyPassiveTimingInternal` に不足エフェクト型を追加
- [x] 通常スキル由来パッシブの不足エフェクト実装（Phase 6-A）
  - 実装済み: `Morale`, `DamageRateUp`, `DefenseDown`, `DefenseUp`, `CriticalRateUp`, `CriticalDamageUp`, `GiveDefenseDebuffUp`
  - 後段対応: `AdditionalHit*`, `HealSkillUsedCount`, `OverwriteSp`, `SpLimitOverwrite`, `ReplaceNormalSkill`, `ReplacePursuit`, `Talisman`, `HighBoost`

### マスタースキル由来パッシブ（ability_tree の PassiveSkill ノード）

- `styles.json` の `ability_tree` に `PassiveSkill` ノードが存在
- 参照スキル ID は `57xxxxxx` 系（167 ユニーク）→ **`skills.json` に存在しない**
- `listPassivesByStyleId`（`src/data/hbr-data-store.js:887`）は `style.passives` と `passives.json` のみ読み、`ability_tree` は非対応
- **実装内容**: 57xxxxxx スキル ID の実データソース確認 → `listPassivesByStyleId` 拡張 → `getPassiveEntriesForMember` へ統合
- [ ] 57xxxxxx スキル ID のデータソース確認（abilities.json 等）
- [ ] マスタースキル由来パッシブのデータ読み込み実装（Phase 6-B）

### スキルスロット起点パッシブ（generalize フラグ）

- `styles.json` の一部スタイルに `generalize: true/false` フィールドが存在（55 スタイルに値あり）
- フラグの意味が未確定（他スロットへのパッシブ適用可能化か否か）
- **次アクション**: `help/` ディレクトリまたはゲーム仕様ドキュメントで `generalize` の意味を調査
- [ ] generalize フラグ仕様の調査と確認（Phase 6-C、仕様確定後に判断）

### 装備起点パッシブ（accessories / chips）

- `accessories.json`（500 件）・`chips.json`（36 件）ともに、`effects` はステータスブーストのみでバトル passive なし
- **現時点では実装対象外**

### 優先実装順

```
Phase 6-A（最初）: 通常スキル由来パッシブの不足エフェクト実装
  → データ読み込みは済み、applyPassiveTimingInternal へのエフェクト型追加のみで完結
Phase 6-B（次）: マスタースキル由来パッシブのデータソース確立
  → 57xxxxxx ID の実データ確認から着手
Phase 6-C（調査後）: スキルスロット起点パッシブ
  → generalize 仕様確定後に判断
Phase 6-D（対象外）: 装備起点パッシブ
  → 現在のデータにバトル passive なし → 保留
```

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
  - 詳細は [`../archive/20260309_completed_active_docs/dp_implementation_plan.md`](../archive/20260309_completed_active_docs/dp_implementation_plan.md)
10. `Mark` 系

## 備考

- `OnBattleStart` と `OnEveryTurn` は主要 timing の入口は揃っているが、effect 種別の汎用化はまだ継続中
- `IsBroken` は自キャラ/敵ともに手動状態として扱う方針
- `Random` は現状 `A/S/SS/SSR` すべて既定成功固定。将来、常時成功/個別指定/常時失敗を切り替えられるUI設定を追加する
- `IsCharacter` は「編成内にそのキャラがいる」ではなく、基本的には「評価対象そのものがそのキャラ」で扱う
- `IsNatureElement` / `IsCharacter` / `IsWeakElement` は条件評価器としては実装済み。ただし、それらを使うパッシブ全体の発火は `timing` / `effect` 実装が別途必要
- `IsWeakElement(Fire)` は敵の該当属性ダメージ係数が `100%` を超えると真になる。`100%` 以下は偽
- 敵の属性耐性/弱点は現時点では手動状態として保持する。未設定時は `100%` 扱い
- Phase 6 で `BreakGuard` は active/passive ともに `statusEffects` へ保存されるようになった
- Phase 6 で enemy special break 状態は `StrongBreak` / `SuperDown` と `destructionRateCapByEnemy` / `breakStateByEnemy` に分離して保持する
- `IsHitWeak()` は `SuperBreak` 適用時には target ごとに評価するため、`All` 対象でも弱点 enemy だけへ反映される
- `turnPlan / scenario` には `enemyDestructionRates / enemyDestructionRateCaps / enemyBreakStates` を保存する
- `BreakDownTurnUp` は Phase 6 では manual-first のまま据え置きで、DownTurn の UI 入力値を人間が解釈して与える運用を継続する
- DP関連は `DpRate` 条件だけでなく、DP回復、DP自傷、オーバー回復上限、`AttackByOwnDpRate`、`BreakGuard` を含むため独立ドキュメントで管理する
- `オーバーレイ` のように `target_type: AllyAll` と `target_condition: IsCharacter(IIshii)==1` を組み合わせるパッシブがあるため、今後の発火実装は「発火元イベント判定」と「効果対象抽出」を分離して設計する必要がある
- 具体的には「味方の誰かがフィールドを展開した」という味方イベントで発火しつつ、効果対象は後衛の石井本人だけ、というレアケースを許容する必要がある
- `IsZone` / `IsTerritory` は条件評価だけでなく、展開スキル・上書き・継続ターン管理とセットで設計する
- 士気レベルは共有値ではなく各キャラクター個別状態として扱う
- 士気は計算で追える前提とし、デバッグ入力は持たない
- UI 表示は `moraleState.current > 0` のキャラだけに出す
- やる気レベルも各キャラクター個別状態として扱う
- やる気初期値は「やる気付与元スタイルがPT内にいる時だけ」選択可能
- 印システムは `Fire / Ice / Thunder / Dark / Light` すべて同型として実装済み
- 印の残課題は「表示」「ログ」「実データ回帰の厚み」であり、条件評価や常在効果の基盤自体はほぼ完了
- `DamageRate()` は手動破壊率状態としてのみ使い、ダメージ計算には接続しない
- `ConquestBikeLevel()` は現状固定 `160`。UI 上書きだけ将来課題

# Eシールド実装準備

> ステータス: ✅ 完了
> 作成日: 2026-04-18
> 最終更新: 2026-05-22
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 概要

`Eシールド` は `json/enemies.json.extra_gauge.eshield` / `extra_gauge.esp` を正本データ源とし、
2026-04-19 時点で `engine-first` 範囲と `Enemy Setup` 手動編集、`HealEShield` /
`ReviveEShield` まで実装済みである。

この文書では、実装時に固定した仕様判断と、完了した接続範囲を整理する。
`ui-next` / snapshot / summon / popup / `Enemy Setup` manual edit に加え、
`turn-controller` 側の Eシールド減算・same-action BREAK・`IgnoreEShieldElement` /
`HealEShield` / `ReviveEShield` をこの文書の正本とする。

2026-04-19 の follow-up として、`Party Setup` の属性ブレスレット selector を
`setup.normalAttackElementsByPartyIndex` 経由で runtime へ接続し、通常攻撃の属性参照と
Eシールド減算が同じ `normalAttackElements` を使う状態まで反映した。さらに同日、
`replayScript.setup` 側でも `setupEntries[type=NormalAttackElementsByPartyIndex]` に同情報を
canonical で保持し、save/load/recalculate 時に top-level `setup` と齟齬が残らないようにした。
2026-05-22 には、闇撃のブレスなどの属性ブレスレット付き通常攻撃が Eシールド減少と
弱点攻撃トリガーの両方で属性攻撃として扱われることを回帰テストで固定した。

## 調査結果

### 外部仕様

- `2026-02-02` 更新の Game8 記事では、Eシールドは `5章中編 Part2` から登場した敵ギミックとされる
- 対応した弱点属性攻撃の `1 hit = 1 count` で減少する
- `0` になると通常の BREAK 相当となり、ダウンターンと破壊率上昇が有効になる
- Eシールド展開中でも攻撃は HP に通るが、破壊率は上がらない
- 弱点付与は弱点そのものは付与できるが、Eシールドの属性追加や再生成は起こさない
- `対HP+%` は通る一方、`対DP+%` は有効度が落ちる

### ローカルデータ

- `json/skill_types.json` に `ReviveEShield (id:268)` / `IgnoreEShieldElement (id:301)` / `HealEShield (id:320)` が存在する
- `json/passives.json` では `100150900 / 無差別な殺人鬼【カレン 専用】` が `IgnoreEShieldElement` を持つ
- `json/enemies.json` には `extra_gauge.eshield` を持つ enemy が `113` 件ある
- `extra_gauge.eshield` を持つ enemy のうち、`base_param.dp > 0` 併存は `0` 件
- `esp=0` または `ele_list=[]` の raw 定義が `33` 件あり、初回実装では inactive 扱いに寄せる
- `HealEShield` / `ReviveEShield` は live usage が `0` 件
- `Dimension_09_X_KaleidoOuroboros (id:13450815 / 変貌を重ねる不滅の円環)` は `extra_gauge.hp` に `3` 本の HP ゲージを持ち、`esp:30` / `ele_list:["Fire","Ice"]` の Eシールドを持つため、Eシールド確認用の代表ケースとして扱いやすい
- 同敵は `Enemy Setup` の `テンプレート` category にも常時表示し、カテゴリ切替なしで Eシールド確認へ入りやすくする
- 同系列の summon 用 enemy として `Dimension_09_X_CatHornMeteor_Summon ([強化変種]ミーティアホーン)` / `Dimension_09_X_OctopusTailMeteor_Summon ([強化変種]ミーティアテイル)` が存在する
- `ui-next/utils/enemy-list.js` は `ALWAYS_VISIBLE_ENEMY_PRESET_IDS` の `テンプレート`、通常 enemy 用のカテゴリ定義、`直近3ヶ月の boss` を 1 本の flat list に正規化し、Enemy Setup 側では `categoryKey/categoryLabel` を使って `カテゴリ -> 敵` の2段導線を描画する
- 代表的な raw schema:

```json
{
  "extra_gauge": {
    "esp": 10,
    "eshield": {
      "def_up_rate": 5000,
      "dmg_limit": 0,
      "ele_list": ["Light", "Dark"]
    }
  }
}
```

- `base_param.dp = 0` と Eシールドが併存するデータが主で、初期導入では「DP の代替レイヤー」として扱う設計が妥当

## 今回固定する仕様判断

### 1. 初回マイルストーン

- 初回は `engine-first` とし、`ui-next` の enemy preset / snapshot / summon / popup に加え、
  `turn-controller` の戦闘解決まで接続する
- `engine-first` マイルストーンに続き、`Enemy Setup` の manual Eシールド編集、
  session save/load 回帰、`HealEShield` / `ReviveEShield` までこの文書の scope で完了した

### 2. 内部表現

- preset / session snapshot では `e_shield` を使用する
- runtime の `turnState.enemyState` では `eShieldStateByEnemy` を使用する
- raw `extra_gauge` の ingest 時点で `max <= 0` または `elements.length === 0` の
  Eシールドは `null` として落とす
- runtime では `current=0` でも `max>0` かつ `elementsあり` の depleted state は保持し、
  active 判定のみ `current > 0` に限定する

```js
eShieldStateByEnemy[targetEnemyIndex] = {
  current: 10,
  max: 10,
  elements: ['Light', 'Dark'],
  defUpRate: 5000,
  damageLimit: 0,
}
```

### 3. Action-time 解決方針

- damage part を持つ action のみを対象にする
- target は既存の `getActionTargetEnemyIndexes()` を使う
- hit 数は action preview の実 hit 数を使う。通常攻撃だけは `OD=2.5% 固定`
  の経路と分離し、`raw hit_count + Funnel bonus` を Eシールド減算に使う
- 通常攻撃の属性は `Party Setup` の属性ブレスレット selector を正本とし、
  `normalAttackElementsByPartyIndex -> CharacterStyle.normalAttackElements` を経由して解決する
- 属性一致は action 単位で判定し、「effective damage part のいずれかが active
  Eシールド要素に一致すれば、その action の hit 全数を減算」に固定する
- `IgnoreEShieldElement` は style ID の特判を置かず、既存 passive resolver と同様に
  action-time に `specialPassiveModifiers` へ展開する

### 4. BREAK 接続方針

- `current = max(0, current - resolvedEShieldHitCount)` とする
- `current === 0` 到達時は同一 action 内で BREAK を成立させる
- `manualBreakEnemyIndexes` と `autoBreakEnemyIndexes` の union を same-action break source
  として扱い、既存の `SuperBreak` / `SuperBreakDown` / `BreakDownTurnUp` /
  `AdditionalHitOnBreaking` 判定へ接続する
- `tickEnemyStatusDurations()` など `turnState.enemyState` 再構築箇所でも
  `eShieldStateByEnemy` を保持する

### 5. `def_up_rate` / `dmg_limit` の解釈（文書化のみ）

- `def_up_rate` は、Eシールドを破壊していない状態で敵本体へ直接 HP ダメージを与える際の補正値として扱う
- この状態のダメージ式は「通常の DP を割っていない敵への HP ダメージ計算式」を使う
- `def_up_rate` の単位は `0.01%` とし、実効倍率は `1 - (def_up_rate / 10000)` で解釈する
- `def_up_rate = 0` は補正なし、すなわち `100%` (`1.0x`) を意味する
- `def_up_rate = 5000` は `50%` 補正、すなわち最終ダメージ `0.5x`
- `def_up_rate = 9900` は `99%` 補正、すなわち最終ダメージ `0.01x`
- `def_up_rate = 10000` は `100%` 補正、すなわち最終ダメージ `0`
- `dmg_limit` は、同じく Eシールド未破壊状態で敵本体へ直接 HP ダメージを与える際の上限値として扱う
- DP 未破壊時 HP ダメージ式で値が出ても、`dmg_limit` を超える場合はその値で clamp する
- 本シミュレーターはダメージ計算機ではないため、`def_up_rate` / `dmg_limit` はこの文書に仕様メモとして保持し、既定では runtime 実装や UI 表示の対象にしない
- 後日あらためて再調査する前提は置かず、本書の記述を以後の判断基準とする

## `dp > 0` と Eシールド併存時の動作

- ゲーム仕様上 `base_param.dp > 0` と `extra_gauge.eshield` は併存しないことを確認済み（`json/enemies.json` で併存は 0 件）
- 異常データが混入した場合の runtime 動作を次で固定する：
  - E-shield が active（`current > 0` かつ `elements` 非空）なら E-shield を優先する
  - 現行の `src/turn/turn-controller.js` の action-time ブロックは `isEnemyEShieldActive` を先に判定してから減算に入るため、DP 減算ルートへ落ちずに E-shield 減算が実行される
  - E-shield が 0 に到達した時点で通常の BREAK 経路へ接続し、それ以降の action から DP 相当の処理を再開する
- 上記の優先動作は [../../tests/turn-state-transitions.test.js](../../tests/turn-state-transitions.test.js) の `dp > 0 併存時でも Eシールド減算が優先されブレイク経路へ接続する` ケースで固定する

## 実装フェーズ

### Phase 0: 準備導線

- [x] `help/HEAVEN_BURNS_RED/バトル/Eシールド.md` を追加する
- [x] `help/scripts/populate_templates.py` の `SKIP_LIST` に `Eシールド` を追加する
- [x] `ui-next` の enemy preset / session snapshot / turnState / popup に Eシールド metadata を通す

### Phase 1: 戦闘基盤

- [x] `src/turn/turn-controller.js` に Eシールド current 減少処理を追加する
- [x] Eシールド active 中は BREAK 未成立のまま既存 break-state 依存ロジックへ流し、
  same-action auto BREAK まで破壊率上昇を抑止する
- [x] `current === 0` で通常の BREAK / DownTurn 経路へ接続する
- [x] `tickEnemyStatusDurations()` などの enemyState 再構築で `eShieldStateByEnemy`
  を保持する

### Phase 2: スキル型対応

- [x] `IgnoreEShieldElement`
- [x] `HealEShield`
- [x] `ReviveEShield`

### Phase 3: UI/QA

- [x] turn row 左パネルと enemy detail popup に shared badge renderer で Eシールド現在値を表示する
- [x] Enemy preset selector を、通常 enemy をカテゴリ定義から追加できる `カテゴリ -> 敵` の2段構えへ変更する
- [x] `恒星掃戦線` カテゴリも他カテゴリと同じ流儀で追加し、同名 enemy が難易度違いで複数ある場合はもっとも高いランクの1件のみ表示する
- [x] Eシールド回帰や動作確認では `Dimension_09_X_KaleidoOuroboros` を代表ケースとして扱い、専用 hardcode ではなく通常 selector 経由に加え `テンプレート` からも素早く到達できる状態にする
- [x] Enemy Setup で Eシールドを手動編集できるようにする
- [x] session save/load と summon operation に対する回帰を固定する
- [x] browser E2E を追加する
- [x] `Party Setup` の属性ブレスレット selector を `normalAttackElementsByPartyIndex` に接続し、通常攻撃の属性参照と Eシールド減算を同じ runtime state へ流す
- [x] `replayScript.setup` にも `NormalAttackElementsByPartyIndex` setup entry を保持し、session save/load と replay recalculate で belt 情報を同期する

## 今回追加したテスト固定

- [x] `tests/ui-next-enemy-list.test.js`: `esp=0` / 属性なし raw 定義を inactive 扱いに固定
- [x] `tests/ui-next-battle-state-manager.test.js`: active Eシールドのみ `eShieldStateByEnemy`
  に入ることを固定
- [x] `tests/turn-operations.test.js`: summon 時に inactive raw 定義を持ち込まないことを固定
- [x] `tests/turn-state-transitions.test.js`: 単体弱点 hit / 全体攻撃 / 属性不一致 /
  `IgnoreEShieldElement` / `HealEShield` / `ReviveEShield` / same-action BREAK /
  `SuperBreak` / `SuperBreakDown` / `BreakDownTurnUp` / `AdditionalHitOnBreaking` /
  turn end を跨ぐ state 保持を固定
- [x] `tests/ui-next-turn-ui.test.js`: row strip の有無、multi-color/depleted badge、popup の shared badge と resolved current/max を固定
- [x] `tests/e2e/turn-row-preview-status-popup.spec.js`: turn row 左パネル内での strip 位置と popup の badge/value 一致を固定
- [x] `tests/ui-next-initial-setup.test.js`: Enemy Setup の `カテゴリ -> 敵` selector、slot 切替、manual Eシールド編集の snapshot 反映を固定
- [x] `tests/ui-next-session-snapshot.test.js`: manual Eシールド編集が session save/load 正規化を通って保持されることを固定
- [x] `tests/e2e/enemy-setup-selector.spec.js`: `テンプレート` category に `Dimension_09_X_KaleidoOuroboros` が常時表示され、manual Eシールド editor に preset 値が prefill されることを固定
- [x] `tests/ui-next-party-setup.test.js`: belt selector と `normalAttackElementsByPartyIndex` の export/import、無効値 fallback を固定
- [x] `tests/ui-next-session-snapshot.test.js`: `setup.normalAttackElementsByPartyIndex` の normalize / serialize / round-trip を固定
- [x] `tests/lightweight-replay-script.test.js`: `replayScript.setup` の legacy fixed field を canonical `setupEntries[type=NormalAttackElementsByPartyIndex]` へ畳み込むことを固定
- [x] `tests/ui-next-replay-setup.test.js`: party snapshot の belt 選択が compact replay index の setup entry に変換されることを固定
- [x] `tests/ui-next-battle-state-manager.test.js`: party snapshot の `normalAttackElementsByPartyIndex` が `CharacterStyle.normalAttackElements` へ渡ることを固定
- [x] `tests/ui-next-turn-engine-manager.test.js`: old replayScript に setup entry が無くても load/recalculate で base setup 由来の belt 情報が replay setup に同期されることを固定
- [x] `tests/turn-state-transitions.test.js`: 通常攻撃 + 属性ブレスレットで Eシールドが減ること、非一致属性では減らないことを固定
- [x] `tests/turn-state-transitions.test.js`: 闇撃のブレス通常攻撃で Dark Eシールドを raw hit 分減らし、Dark 弱点への `AdditionalHitOnWeak + AdditionalTurn` が発火することを固定
- [x] `tests/e2e/normal-attack-belt-e-shield.spec.js`: belt 選択後の通常攻撃で Eシールド値が減ることと、session save/load 後も belt と挙動が維持されることを固定
- [x] `tests/e2e/session-save.spec.js`: belt 情報が top-level `setup` と `replayScript.setup.setupEntries` の両方に保存され、既存 record を持つ状態の再保存でも current setup に同期されることを固定

## 関連ファイル

- [../../help/HEAVEN_BURNS_RED/バトル/Eシールド.md](../../help/HEAVEN_BURNS_RED/バトル/Eシールド.md)
- [../../ui-next/utils/enemy-list.js](../../ui-next/utils/enemy-list.js)
- [../../ui-next/components/enemy-setup.js](../../ui-next/components/enemy-setup.js)
- [../../tests/ui-next-initial-setup.test.js](../../tests/ui-next-initial-setup.test.js)
- [../../tests/e2e/enemy-setup-selector.spec.js](../../tests/e2e/enemy-setup-selector.spec.js)
- [../../ui-next/engine/battle-state-manager.js](../../ui-next/engine/battle-state-manager.js)
- [../../ui-next/utils/session-snapshot.js](../../ui-next/utils/session-snapshot.js)
- [../../ui-next/components/party-setup.js](../../ui-next/components/party-setup.js)
- [../../src/contracts/interfaces.js](../../src/contracts/interfaces.js)
- [../../src/turn/turn-controller.js](../../src/turn/turn-controller.js)
- [../../help/HEAVEN_BURNS_RED/バトル/属性ブレスレット.md](../../help/HEAVEN_BURNS_RED/バトル/属性ブレスレット.md)

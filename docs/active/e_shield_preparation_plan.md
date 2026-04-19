# Eシールド実装準備

> ステータス: 🟢 進行中
> 作成日: 2026-04-18
> 最終更新: 2026-04-19
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 概要

`Eシールド` は、現行 runtime では戦闘解決に未接続だが、ローカルデータには既に
`json/enemies.json.extra_gauge.eshield` / `extra_gauge.esp` として格納されている。

この文書では、ヘルプ整備と実装準備フェーズで固定する仕様判断、および
`ui-next` 側の最小導入順を整理する。あわせて、Enemy Setup で使うサンプル敵と
`def_up_rate` / `dmg_limit` の文書化方針もここで確定させる。

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
- `Dimension_09_X_KaleidoOuroboros (id:13450815 / 変貌を重ねる不滅の円環)` は `extra_gauge.hp` に `3` 本の HP ゲージを持ち、`esp:30` / `ele_list:["Fire","Ice"]` の Eシールドを持つ
- 同系列の summon 用 enemy として `Dimension_09_X_CatHornMeteor_Summon ([強化変種]ミーティアホーン)` / `Dimension_09_X_OctopusTailMeteor_Summon ([強化変種]ミーティアテイル)` が存在する
- `ui-next/utils/enemy-list.js` の現行実装は `ALWAYS_VISIBLE_ENEMY_PRESET_IDS` と `直近3ヶ月の boss` から flat list を組んでいる。Enemy Setup 改修時は本書の方針を優先し、`直近2ヶ月` + `カテゴリ -> 敵` の2段導線へ更新する
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

### 1. 導入対象

- まずは `ui-next` の敵プリセット・snapshot・turnState・enemy popup へ Eシールド metadata を通す
- 戦闘挙動そのものの実装は次フェーズに分離する

### 2. 内部表現

- preset / session snapshot では `e_shield` を使用する
- runtime の `turnState.enemyState` では `eShieldStateByEnemy` を使用する

```js
eShieldStateByEnemy[targetEnemyIndex] = {
  current: 10,
  max: 10,
  elements: ['Light', 'Dark'],
  defUpRate: 5000,
  damageLimit: 0,
}
```

### 3. Enemy Setup のサンプル導線方針

- 敵プリセットのサンプル候補に `Dimension_09_X_KaleidoOuroboros` を追加する
- 追加理由は「Eシールド」「複数 HP ゲージ」「summon を行うボス」を1体で確認できるため
- summon 相手の確認用として `Dimension_09_X_CatHornMeteor_Summon` / `Dimension_09_X_OctopusTailMeteor_Summon` も選択可能候補に含める
- 敵プリセット選択 UI は flat list のまま増やさず、`カテゴリ -> 具体的な敵` の2段構えへ移行する
- 少なくとも `期間（直近2ヶ月）` と `恒星掃戦線` の2カテゴリを持たせる
- `恒星掃戦線` カテゴリでは、同名 enemy が難易度違いで複数ある場合は重複を除去し、もっとも高いランクの1件のみを表示対象とする
- 現行コードは `直近3ヶ月` の flat list なので、実装時はこの文書に合わせて抽出条件と UI 構造を更新する

### 4. `def_up_rate` / `dmg_limit` の解釈（文書化のみ）

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

### 5. 次フェーズで実装する戦闘仕様

- 弱点属性 hit ごとに `current -= 1`
- `IgnoreEShieldElement` 所持時は属性不一致でも `current -= 1`
- `current > 0` の間は HP ダメージは通すが破壊率上昇を抑止する
- `current === 0` 到達時に通常の enemy break/down-turn 経路へ接続する
- `HealEShield` / `ReviveEShield` は `max` を上限とした回復・再展開として扱う

## 未確定事項

- `dp > 0` と Eシールドが同時に存在する敵が将来現れた場合の優先順位
  - 現フェーズでは未確定として保留する

## 実装フェーズ

### Phase 0: 準備導線

- [x] `help/HEAVEN_BURNS_RED/バトル/Eシールド.md` を追加する
- [x] `help/scripts/populate_templates.py` の `SKIP_LIST` に `Eシールド` を追加する
- [x] `ui-next` の enemy preset / session snapshot / turnState / popup に Eシールド metadata を通す

### Phase 1: 戦闘基盤

- [ ] `src/turn/turn-controller.js` に Eシールド current 減少処理を追加する
- [ ] 破壊率上昇の抑止条件を Eシールド active 中へ拡張する
- [ ] `current === 0` で通常の BREAK / DownTurn 経路へ接続する

### Phase 2: スキル型対応

- [ ] `IgnoreEShieldElement`
- [ ] `HealEShield`
- [ ] `ReviveEShield`

### Phase 3: UI/QA

- [ ] Enemy preset selector を `カテゴリ -> 敵` の2段構えへ変更する
- [ ] `Dimension_09_X_KaleidoOuroboros` と関連 summon enemy 2体を Enemy Setup の選択候補へ追加する
- [ ] `恒星掃戦線` カテゴリでは同名重複を除去し、もっとも高いランクの1件のみ表示する
- [ ] Enemy Setup で Eシールドを手動編集できるようにする
- [ ] session save/load と summon operation に対する回帰を固定する
- [ ] browser E2E を追加する

## 関連ファイル

- [../../help/HEAVEN_BURNS_RED/バトル/Eシールド.md](../../help/HEAVEN_BURNS_RED/バトル/Eシールド.md)
- [../../ui-next/utils/enemy-list.js](../../ui-next/utils/enemy-list.js)
- [../../ui-next/components/enemy-setup.js](../../ui-next/components/enemy-setup.js)
- [../../ui-next/engine/battle-state-manager.js](../../ui-next/engine/battle-state-manager.js)
- [../../src/contracts/interfaces.js](../../src/contracts/interfaces.js)
- [../../src/turn/turn-controller.js](../../src/turn/turn-controller.js)

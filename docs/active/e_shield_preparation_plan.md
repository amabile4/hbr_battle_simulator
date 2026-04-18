# Eシールド実装準備

> ステータス: 🟢 進行中
> 作成日: 2026-04-18
> 最終更新: 2026-04-18
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 概要

`Eシールド` は、現行 runtime では戦闘解決に未接続だが、ローカルデータには既に
`json/enemies.json.extra_gauge.eshield` / `extra_gauge.esp` として格納されている。

この文書では、ヘルプ整備と実装準備フェーズで固定する仕様判断、および
`ui-next` 側の最小導入順を整理する。

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

### 3. 次フェーズで実装する戦闘仕様

- 弱点属性 hit ごとに `current -= 1`
- `IgnoreEShieldElement` 所持時は属性不一致でも `current -= 1`
- `current > 0` の間は HP ダメージは通すが破壊率上昇を抑止する
- `current === 0` 到達時に通常の enemy break/down-turn 経路へ接続する
- `HealEShield` / `ReviveEShield` は `max` を上限とした回復・再展開として扱う

## 未確定事項

- `def_up_rate` の実機意味
  - データ上は `5000` / `9900` などが存在する
  - 被ダメ軽減率か別種係数かは未検証
- `dmg_limit` の実機意味
  - 現データ確認範囲では `0` が中心
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

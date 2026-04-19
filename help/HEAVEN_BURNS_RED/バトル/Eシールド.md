# ヘルプ：HEAVEN BURNS RED > バトル > Eシールド

## 基本情報

- **URL**: https://game8.jp/heavenburnsred/670122
- **カテゴリ**: HEAVEN BURNS RED > バトル

## ヘルプ記載内容

Eシールドは、敵が DP の代わりに持つ特殊ゲージです。

- `5章中編 Part2` から登場した敵ギミック
- 対応した弱点属性攻撃の hit 数に応じてカウントが減る
- `1 hit = 1 count` で減少し、`0` になると通常の BREAK 相当になる
- 通常攻撃は OD 計算では `2.5%` 固定だが、Eシールド減算では各通常攻撃の raw hit 数を使う
- 属性ブレスレットで通常攻撃が火/氷/雷/光/闇属性になっている場合、その属性一致でも減算される
- Eシールドが残っている間も HP にはダメージが通る
- ただし Eシールド展開中は破壊率が上がらない
- `対HP+%` は有効だが、`対DP+%` の有効度は落ちる
- 弱点付与は弱点そのものは付与できるが、Eシールド属性の追加や再生成は行わない

## シミュレーター実装情報

- **外部仕様ソース**: Game8 記事（2026-02-02 更新確認）
- **関連データ**:
  - enemy raw data: `json/enemies.json.extra_gauge.eshield`
  - shield count: `json/enemies.json.extra_gauge.esp`
  - related skill types: `ReviveEShield`, `HealEShield`, `IgnoreEShieldElement`
- **現状の実装ステータス**:
  - `IgnoreEShieldElement` / Eシールド current 減算 / same-action BREAK / `HealEShield` / `ReviveEShield` は実装済み
  - 通常攻撃は OD 計算と Eシールド減算で hit 数の扱いを分離し、OD は `2.5%` 固定、Eシールドは raw hit 数を使う
  - `Party Setup` の属性ブレスレット selector は `CharacterStyle.normalAttackElements` へ接続されており、通常攻撃の属性参照と Eシールド判定の両方に使われる
  - `Enemy Setup` の手動編集では `count/max/elements/def_up_rate/dmg_limit` を変更でき、session save/load にも保存される

### シミュレーターでの解決 (Resolution) と評価

本シミュレーターでは、Eシールドをまず `enemyState` 上の独立レイヤーとして持つ。

```js
turnState.enemyState.eShieldStateByEnemy[targetEnemyIndex] = {
  current: 10,
  max: 10,
  elements: ['Light', 'Dark'],
  defUpRate: 5000,
  damageLimit: 0,
}
```

導入方針:

1. Enemy preset / session snapshot / turnState / enemy popup で Eシールド metadata を保持する
2. hit 解決時に、対応元素属性 hit か `IgnoreEShieldElement` を持つ攻撃だけ `current` を減らす
   - 通常攻撃だけは `OD=2.5% 固定` と分離し、`raw hit_count + Funnel bonus` を Eシールド減算に使う
3. `current > 0` の間は HP ダメージは通すが、破壊率上昇は止める
4. `current === 0` で通常の BREAK / DownTurn 経路へ接続する
5. `HealEShield` / `ReviveEShield` は `max` を上限とした回復・再展開として解決する

未確定事項:

- `def_up_rate` の実機意味
- `dmg_limit` の実機意味
- `dp > 0` と Eシールドが同時に存在する敵の優先順位

### 所持スタイルリスト

#### パッシブ (passives.json)

- **朝倉 可憐** [CODE:Virtual Killer]
  - 無差別な殺人鬼【カレン 専用】
  - 自身が敵にダメージを与えたとき 元素属性に関係なく「Eシールド」のカウントを減らすことができる

#### 関連 skill_types.json

- `ReviveEShield` (id: 268)
- `IgnoreEShieldElement` (id: 301)
- `HealEShield` (id: 320)

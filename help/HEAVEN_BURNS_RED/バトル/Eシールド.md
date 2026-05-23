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
  - `Enemy Setup` の `count` 入力は `max` を超える値を許可し、その場合 `max` を `count` に自動引き上げる（HP ゲージ複数の擬似表現用）
  - 戦闘中の `Turn Row -> 敵情報確認 popup -> Eシールド` からも、slot 単位で `current/max/elements/def_up_rate/dmg_limit` を手動編集できる
  - popup editor の `最大値で回復` は `current=max` を即時入力し、`current > max` で適用した場合も `max` は `current` に追従する
  - popup editor で `elements=[]` または `max<=0` にした場合は、その enemy slot の Eシールドを手動解除として保存する
  - popup からの手動 Eシールド編集は same-slot で 1 operation に upsert され、turn row strip / popup summary / operation chip へ即時反映される
  - popup からの手動 Eシールド編集は replay の `EnemyEShields` snapshot に正本化されるため、commit / recommit / session save-load / recalculate 後も保持される
  - 自動ブレイク（current=0 到達）した actionEntry には `autoBreakEnemyIndexes` と「ブレイカー識別情報 (`actorCharacterId / skillId / source='auto'`)」が記録され、Turn Row には violet 色の `(自動)` chip が手動 chip と同じ行に並ぶ
  - 自動ブレイクで起動した「ブレイク時パッシブ」は通常パッシブと同じ形式で Passive Log ペインへ流入する (`source='passive_trigger'` / `effectTypes=['BreakDownTurnUp']`)
  - DownTurn ステータスが消滅した瞬間（`tickEnemyStatusDurations` の `PlayerTurnEnd` / `EnemyTurnEnd` 両 timing）に対象 enemy の Eシールド `current` が `max` まで自動復帰する
  - `慧眼の女教皇` クイーンの `アトミックフレア` など、スキル本体に `IgnoreEShieldElement` を持つアクティブ攻撃は、active な Eシールド敵に対して Eシールドを減らし、同時に弱点命中扱いとして `1MORE` などの `AdditionalHitOnWeak` を発火できる

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
- HP ゲージ複数（例: 変貌を重ねる不滅の円環は 30→35→40→45 の段階的拡張）の正式な仕様。現状は `Enemy Setup` または battle 中の `Turn Row popup` から `count/max` を手動編集し、max overflow 追従で擬似表現する

### 所持スタイルリスト

#### パッシブ (passives.json)

- **朝倉 可憐** [CODE:Virtual Killer]
  - 無差別な殺人鬼【カレン 専用】
  - 自身が敵にダメージを与えたとき 元素属性に関係なく「Eシールド」のカウントを減らすことができる

#### 関連 skill_types.json

- `ReviveEShield` (id: 268)
- `IgnoreEShieldElement` (id: 301)
- `HealEShield` (id: 320)

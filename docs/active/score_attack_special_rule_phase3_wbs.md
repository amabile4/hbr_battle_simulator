# スコアアタック用特別ルール対応 Phase 3 WBS

**ステータス**: 🟢 進行中(未着手)
**最終更新**: 2026-07-02

## 背景

`enemy setup` のスコアアタック敵対応は3段階で計画され、Phase 1・2 は実装済み。

- Phase 1(完了、commit `194cd26`): スコアアタック敵選択時、`enemies.json` 側の
  プレースホルダ `base_param` ではなく `json/score_attack.json` の難易度40(最高、アビス)の
  実データ(`rbl`/`dl`/`hl`)からDP/HP/破壊ボーダーを解決するよう修正
  (`ui-next/utils/score-attack-enemy-stats.js` 新設)
- Phase 2(完了、commit `3c2fd2b`): enemy setup に難易度(1〜40)選択UIを追加し、
  任意の難易度でパラメータを再解決できるようにした

Phase 3 は未着手。**このドキュメントは Phase 3 の ToDo/WBS のみを記録するもので、実装は行わない。**
Phase 3 は次の理由で Phase 1・2 と切り離している:

- 新規に読み込み・分析が必要なファイルがある(`score_attack.json` の `rules[]` 構造、
  `dimension_battle.json` の `satellites[].enchant` との比較、`src/domain/stage-setup-enchants.js`、
  `src/turn/turn-controller.js` の enchant 適用経路)
- 既存の恒星戦(dimension battle)の仕組みをそのまま転用できず、新規開発になる可能性が高い

## 用語整理

- **難易度**(`battles[].d`、1〜40): Phase 1・2 で対応済み。敵のDP/HP/破壊ボーダーを決める軸
- **ルールA〜F**: 難易度とは別の軸。効果は2通りに分かれる
  - **パラメータ表現型**(例: 防御力が高い): 難易度ごとの `b`/`bn` が指す敵プリセット自体の
    数値に反映されている → Phase 1・2 の難易度解決で既に吸収済み
  - **戦闘パターン表現型**(例: 開幕にSP上限を制限するデバフ付与): `score_attack.json` の
    イベントレベル `rules[]`(`type`: `CommandPattern` / `SkillPart` / `LimitHealSpByOverDrive` /
    `MaxDamageRate` 等、`grade` 閾値付き)で表現される → **Phase 3 の対象**

## データ形式の変遷と Phase 3 の対象範囲(実装スコープの根拠)

`score_attack.json` の全98イベントを機械調査した結果、スコアアタックの仕様は下記の3段階の変化を経て
現行ルールに至ったことが判明した(いずれもエージェントによる `node`/`jq` 走査で確認・裏取り済み)。

| 変化点 | イベント | in_date | 内容 |
|--------|----------|---------|------|
| ① 敵ラベルA〜F化(6種類) | `#62 Overrun by Siege`(id `145000062`) | 2024-10-25 | 敵プリセットラベル末尾のアルファベットバリエーションが6種類(A〜F)以上に到達 |
| ② 難易度1〜135(最大150)→1〜40へ集約 | `#78 Black Impact`(id `145000078`) | 2025-07-18(①から266日後) | `battles[].d` の上限が150から40に圧縮され、バトル数も11→40に増加 |
| ③ グレード廃止・ルールA〜F選択への完全移行 | `#88 Awakening Feather`(id `145000088`) | 2025-12-26(②から133日後) | 同一イベント内の `rules[].grade` が段階的な組み合わせ値(例: `[15,20]`)から**全要素が35で統一**される形へ変化。「複数ルールを積み上げてグレードを1〜35まで上げる」という旧仕組みが実質的に廃止され、`grade` フィールドは意味を持たない固定値になった |

**③(2025-12-26、id `145000088`)以降のイベントが、現行ルール(難易度1〜40 + ルールA〜F選択)と同一の形式である。**
それより前のイベントは、難易度レンジ・グレード方式ともに現行と異なるレガシースキーマのため、
**Phase 3(および将来的な score_attack.json 全般の読み込み処理)は `id >= 145000088`
(`in_date >= 2025-12-26`)のイベントのみを対象とし、それより前のイベントは対象外とする。**

この決定により、T3-1 の「`rules[].grade` 閾値の意味」調査は、現行スコープ内データでは
`grade` が常に35固定(=意味を持たない)であるため、大幅に単純化される見込み。

## 前提の整理(実装前に必須)

- 恒星戦の enchant 処理(`src/domain/stage-setup-enchants.js` の `STAGE_SETUP_ENCHANT_EFFECT_TYPES`:
  `OD_GAUGE_GAIN_BONUS_PERCENT` / `TURN_START_SP_IF_ENEMY_DOWN` / `TURN_START_SP_IF_NEGATIVE_SP` /
  `SP_ON_ENEMY_KILL`)は自軍SP/OD系4種のみサポート。score_attack.json の `rules[]` は
  「敵デバフ効果量アップ」「敵の行動パターン変更」「破壊率耐性アップ」等カテゴリが大きく異なるため、
  **既存経路の単純流用は不可**。新しい効果種別・適用経路の新規開発が必要になる可能性が高い
- `ui-next/components/stage-setup.js` の enchant 表示(`#enchantSummary` 相当)は `enchant.desc` の
  日本語文字列を正規表現でパースする簡易実装。score_attack.json の `rules[].desc` は数値を含まない
  抽象的な文言(例:「敵のデバフ効果量アップ」)もあり、この方式は流用できない可能性が高く、
  構造化フィールド(`type`/`arg`/`power`/`parts`)を直接パースする設計に転換すべき

### 実データサンプル(`json/score_attack.json`、jq で取得済み)

```json
{
  "id": 139009801,
  "type": "CommandPattern",
  "target": "Enemy",
  "name": "敵のデバフ効果量アップ",
  "desc": "敵のデバフ効果量がアップ",
  "grade": 35,
  "in_date": "2026-06-19 02:00:00+00:00",
  "out_date": "2026-06-26 01:59:59+00:00"
}
```

- 同一イベント内で `in_date`/`out_date` が週替わりのルールセットを複数持つ(確認済み)
- `type` は `CommandPattern` / `LimitHealSpByOverDrive` / `SkillPart` / `MaxDamageRate` 等、
  恒星戦の4種より広いカテゴリを含む

## ToDo / WBS

実装は行わない。着手時は以下の順で進める。

- [ ] **T3-0. 未確定事項の解消**(下記「確認が必要な事項」を参照。ユーザー確認必須)
- [x] **T3-1a. カットオフ適用(Phase 1/2 追補として実装済み)**
  - [x] `ui-next/utils/score-attack-enemy-stats.js` の `normalizeScoreAttackEvents(raw)` に
        `id >= SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID`(`= 145000088`)フィルタを追加。
        `EnemySetupController.setScoreAttackEvents()` を経由する全解決処理(難易度パラメータ解決・
        スコアアタックイベント選択セクション双方)に自動的に波及する単一の正規化ポイントとした
  - [x] enemy setup に「スコアアタック」独立セクションを新設。`#88`〜`#98`
        (`id >= 145000088`)のイベントのみをコンボボックスに新しい順(降順)で列挙し、
        選択すると代表種族がアクティブスロットへ自動反映される
        (`buildScoreAttackEventEnemyPresets`、負ID方式の仮想プリセットを `buildOrbBossLevel4Enemies`
        と同様のパターンで合成)
- [ ] **T3-1b. `rules[]` の構造調査(対象は `id >= 145000088` のイベントのみ)**
  - [ ] 対象範囲内(`id >= 145000088`)では `rules[].grade` が常に35固定であることを確認済みのため、
        「閾値としての意味」ではなく「常時有効な6種類のルールセット」として扱ってよいか確定する
  - [ ] `rules[]` の各エントリが「ルールA〜F」のどれに対応するか(難易度 `d` との紐付け方)を
        実データで確認する
  - [ ] `enable: false` フィールドの意味(恒星戦側 `satellites[].enchant.enable` も同じく `false`)を
        確認する
- [ ] **T3-2. パース層の新規実装**
  - [ ] 新規 `src/domain/score-attack-rules.js` を作成し、`rules[].type` ごとに構造化パースする
        関数群を実装する(恒星戦の `stage-setup-enchants.js` とは独立ファイルとし、共通化は最小限に
        留める)
  - [ ] `rules[].grade`/`in_date`/`out_date` から「選択中の難易度・現在時刻(またはユーザー選択週)で
        有効なルール一覧」を絞り込む関数を実装する
- [ ] **T3-3. UI表示**
  - [ ] `ui-next/components/enemy-setup.js` または `stage-setup.js`(配置場所は要検討)に、
        Phase 2 の難易度選択と連動して該当する `rules[]` を一覧表示するセクションを追加する
        (恒星戦の `#enchantSummary` 相当。ただし表示のみか適用も行うかは T3-0 で確定させる)
- [ ] **T3-4. エンジン適用(範囲は T3-0 の確認結果次第)**
  - [ ] `src/turn/turn-controller.js` に新規 `sourceType`(例: `score_attack_rule`)の適用経路を
        追加するか、既存の敵スキルパート処理に相乗りできるか調査する
  - [ ] 敵行動パターン変更(`CommandPattern`型)をエンジンが表現できるか確認する。対応不可なら
        「表示のみ・エンジン適用は対象外」とスコープを縮小する
- [ ] **T3-5. テスト**
  - [ ] `rules[]` パース関数の単体テスト(type別、grade閾値境界、in_date/out_date境界)
  - [ ] 新規 `tests/ui-next-enemy-setup-score-attack-rules.test.js`
  - [ ] エンジン適用する場合、既存の `stage_setup_enchant` 適用テスト(turn-controller系)に
        相当する新規テスト
  - [ ] Playwright: 難易度選択 → 該当ルール一覧表示 →(エンジン適用する場合)ターン進行で
        効果反映を確認

## 確認が必要な事項(ユーザー確認、実装着手前に解消必須)

1. ~~`rules[].grade` の閾値意味~~ → 対象範囲を `id >= 145000088` に限定した結果、
   対象内では `grade` は常に35固定と判明したため解消。ただし「常時有効な6種類のルールセット」
   という理解でよいか、以前のルールセットとの入替わり方(週替わり)との整合は要確認
2. `in_date`/`out_date` の扱い: 同一イベント内でルールが週替わりする。「現在時刻基準」か
   「ユーザーが週を選択」にするか
3. `enable: false` フィールドの意味 — 未使用フラグなのか、プレイヤーがオンにする前提なのか
4. 敵行動パターン変更(`CommandPattern`型)をエンジンが表現できるか。対応不可なら
   「表示のみ・エンジン適用は対象外」とスコープ縮小してよいか
5. 恒星戦側の正規表現パース方式は据え置き、スコアアタックのみ構造化パースにする
   (独立実装)方針でよいか

## 関連ファイル

- `json/score_attack.json`(データ源。1行minified、`jq`/`node` で調査すること)
- `json/dimension_battle.json`(恒星戦。比較対象)
- `src/domain/stage-setup-enchants.js`(恒星戦 enchant 効果種別定義。参考実装)
- `src/turn/turn-controller.js`(恒星戦 enchant 適用経路。`sourceType: 'stage_setup_enchant'` 周辺)
- `ui-next/components/stage-setup.js`(恒星戦プリセットUI。参考実装)
- `ui-next/components/enemy-setup.js`(Phase 1・2 実装済み。Phase 3 の追加先候補)
- `ui-next/utils/score-attack-enemy-stats.js`(Phase 1・2 で新設。難易度パラメータ解決)

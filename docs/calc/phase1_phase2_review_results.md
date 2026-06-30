# フェーズ1・2 ダメージ計算エンジン共同レビュー結果

本ドキュメントは、`damage_calc_engine.py`、`test_phase2.py`、`run_regression_tests.py`、および `docs/phase2_design_specification.md` の共同レビュー結果をまとめたものです。

レビュー目的は、Python 版ダメージ計算エンジンを `hbr_battle_simulator` へ TypeScript 移植する前に、実装バグ、仕様書の不整合、テストカバレッジ不足、移植時の入力スキーマリスクを洗い出すことです。

## 結論

フェーズ1・2の Python 実装は、現在の Excel スナップショットに対して基礎ダメージ計算を高精度に再現しています。一方で、TypeScript 移植の入力仕様として見ると、未処理の `statusType`、スキーマ不整合、サイレントドロップ、仕様書間の表現不一致が残っています。

フェーズ3へ進む前に、少なくとも以下の 7 件は修正または明示的な未対応扱いにする必要があります。

1. `ElementResistDown` のルーティング漏れを修正する。
2. `tokenCount` と `tokenRatio` のスキーマを統一する。
3. `Charge` / `MindEye` / `Funnel` など未処理の `statusType` を実装するか、明示的にエラー化する。
4. 脆弱、属性防御、パッシブ防御ダウン、心眼/クリティカル系の回帰テストを追加する。
5. `_find_skill()` の `skill_type` 判定を部分一致から許可リスト方式へ変更する。
6. `critMindeyeMultiplier` の命名と `MindEye` 実装状態を一致させる。
7. `classify_debuff()` のスキル名推定を正規化カテゴリ方式へ寄せる。

## 検証済み事項

### 既存テスト結果

レビュー中に以下を実行し、どちらも成功しました。

```bash
uv run python test_phase2.py
uv run python run_regression_tests.py
```

`run_regression_tests.py` の結果は `Passed=115 | Mismatches=0 | Skipped=0` でした。

ただし、この成功は Excel の現在のアクティブ状態に強く依存しています。現在のテストは、固定された仕様 fixture に対する回帰ではなく、現ブック状態との突合です。

### Excel 直接確認

レビュー中に Excel ブックの数式を直接確認し、以下を確認しました。

- `AJ82` は防御デバフ系の合算であり、脆弱は含まない。
- 脆弱は `AJ90:AJ93` に別枠で計算され、集約式は通常脆弱と永続脆弱を分けている。
- 脆弱の通常枠適用条件は `AJ88 > 100%` であり、Excel もゾーン込みの耐性倍率を弱点判定に使っている。
- 通常攻撃のクリティカル下限側補間では `E/2` が使われており、`damage_calc_engine.py` の `e_crit = e59 / 2.0 if is_normal_attack else e59` は Excel 由来の挙動である。
- `AJ81` は `AM15 + SUM(AM18:AM24)` で、`AM` 列は `防ダウン` 系パッシブを集計する列である。

## 即修正候補

### 1. `ElementResistDown` が計算に入らない

`classify_debuff()` は `statusType == "ElementResistDown"` を `ElementDefense` として分類できます。しかし `calculate_damage()` 側では defender effect を `DefenseDown` と `Fragile` だけに振り分けているため、`ElementResistDown` は集約に到達しません。

再現確認では、同じ `power=20` でも `DefenseDown` は `debuffMultiplier=1.2` になり、`ElementResistDown` は `1.0` のままでした。

対応方針:

- `ElementResistDown` を `debuffs_resolved` に入れる。
- 既存の `classify_debuff()` に任せる。
- `test_phase2.py` に `ElementResistDown` の集約テストを追加する。

### 2. `tokenCount` と `tokenRatio` が不一致

`DamageInputContext` の仕様では `attacker.tokenCount` が定義されています。一方、実装は `attacker.tokenRatio` だけを読みます。

このまま TypeScript 側が仕様通りに `tokenCount` を渡すと、トークン倍率は常に `1.0` になります。

対応方針:

- `tokenCount` から倍率への変換責務を仕様化する。
- 変換済み倍率を渡すなら、入力名を `tokenRatio` または `tokenAttackRate` に統一する。
- 個数を渡すなら、トークン種別ごとの倍率換算ロジックを engine 側へ実装する。

### 3. 未処理 `statusType` がサイレントドロップされる

仕様上は `Charge`、`MindEye`、`Funnel` が attacker status effect に定義されています。しかし実装は `AttackUp` と `CritDamageUp` / `CritBuff` しか処理しません。

さらに、`integration_research.md` には `ElementAttackUp` も登場しますが、フェーズ2仕様と engine には十分に反映されていません。

対応方針:

- 未対応 `statusType` を `0` 扱いで黙って落とさない。
- 実装するか、明示的に例外または warning を返す。
- `breakdown` に `ignoredEffects` のような警告情報を持たせる案も検討する。

### 4. 回帰テストが重要な効果経路を通していない

既存の `run_regression_tests.py` は Excel の現在値 `AJ67` と `AJ82` を単一の `AttackUp` / `DefenseDown` として渡します。このため、脆弱、属性防御、パッシブ防御ダウン、心眼/クリティカル系の効果経路が Excel 突合されません。

対応方針:

- Excel 由来の期待値を JSON fixture 化する。
- `ElementResistDown`、`Fragile`、`PassiveDefenseDown`、`MindEye`、`ElementAttackUp` の代表ケースを追加する。
- Excel の現在アクティブ状態に依存しない固定入力の回帰テストへ移行する。

### 5. `_find_skill()` の `skill_type` 部分一致が危険

`_find_skill()` は `Attack` または `Penetration` を含む `skill_type` を攻撃 part として優先します。

`skills.json` には以下のような `skill_type` が存在します。

- `AttackSkill`
- `AttackNormal`
- `AttackUp`
- `AttackUpIncludeNormal`
- `AttackDown`
- `GiveAttackBuffUp`
- `TokenAttack`
- `PenetrationCriticalAttack`

`AttackUp` は `parameters` に `wis=1` を持つため、バフスキル名を `calculate_damage()` に渡すと攻撃 part として誤採用され得ます。

対応方針:

- 攻撃 part 判定を部分一致から許可リストへ変える。
- 例: `AttackNormal`、`AttackSkill`、`DamageRateChangeAttackSkill`、`PenetrationCriticalAttack` など。
- `_find_skill()` と `_find_effect_part()` の責務を明確に分ける。

### 6. `critMindeyeMultiplier` が実装内容と一致しない

`breakdown.critMindeyeMultiplier` は名前上、クリティカル威力と心眼を合算した倍率に見えます。しかし現実装は `CritDamageUp` / `CritBuff` の合算だけで、`MindEye` は処理していません。

対応方針:

- 短期: フィールド名を `critDamageMultiplier` に変えるか、心眼未実装を明記する。
- 理想: `critDamageMultiplier` と `mindEyeMultiplier` を別内訳にし、合算後の値を必要に応じて返す。

### 7. `classify_debuff()` がスキル名の文字列順序に依存する

`classify_debuff()` はスキル名に含まれる文字列でカテゴリを推定します。このため、同じ意味でも `永続属性...` と `属性永続...` のようにトークン順序が変わると分類が変わる可能性があります。

Excel 側では防御、永続防御、属性防御、永続属性防御、DP防御が行やシートで分かれています。TypeScript 移植では、スキル名推定ではなく正規化済みカテゴリを入力に持たせる方が安全です。

対応方針:

- `category: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense'` のような分類を入力側で明示する。
- 短期修正では、`永続` かつ `属性` / `属防` / `ElementResistDown` の複合条件を優先して判定する。
- `classify_debuff()` の順序依存を検出する単体テストを追加する。

## テストカバレッジ不足

### 1. Excel スナップショット依存

`run_regression_tests.py` は Excel の現在のアクティブ状態に依存しています。

具体的には、以下の条件が固定または暗黙依存になっています。

- 攻撃者は Excel の現在選択状態。
- `style_id = 1010103` がハードコードされている。
- バフは `AJ67` の現在値を単一 `AttackUp` として渡す。
- デバフは `AJ82` の現在値を単一 `DefenseDown` として渡す。
- 脆弱、属性防御、パッシブ防御ダウン、心眼などは実入力として検証されない。

対応方針:

- Excel 由来の期待値を JSON fixture 化する。
- キャラ、敵、スキル、バフ、デバフ、脆弱、パッシブ、ゾーンの代表ケースを固定入力として持つ。
- Excel の現在状態が変わっても期待値が暗黙に変わらないテストへ移行する。

### 2. 脆弱経路が Excel 突合されていない

`test_phase2.py` は `aggregate_fragiles()` 単体をテストしています。しかし `run_regression_tests.py` は `Fragile` 入力を渡していません。

Excel では脆弱は `AJ90:AJ93` にあり、防御デバフ `AJ82` とは別枠です。このため、engine の `debuff_mult * fragile_mult` という構造は Excel と整合しますが、実際の突合テストでは `fragile_mult` 経路が通っていません。

対応方針:

- `Fragile` を含む固定 fixture を追加する。
- 弱点時、非弱点時、永続脆弱のみ、通常脆弱上位2枠、永続脆弱上位2枠を検証する。
- ゾーン込み弱点判定を含むケースも別途持つ。

### 3. `AJ81` パッシブ防御ダウン枠が未検証

Excel の `AJ81` は `AM15 + SUM(AM18:AM24)` で、編成やパッシブ由来の防御ダウン枠です。現 engine にはこの入力経路がありません。

対応方針:

- パッシブ由来の防御ダウンを `statusEffects` に正規化して渡すか、別フィールドを設ける。
- 少なくとも fixture で `AJ81` 相当が非ゼロのケースを持つ。

## 仕様書整備が必要な項目

### 1. `DamageResult` は全ヒット合計相当かを明記する

`hit_count` は読み込まれますが、最終ダメージ計算では使われていません。Excel の `W59` / `Y59` と一致しているため、現 engine が返す値は Excel 表示上のスキル期待値と同じ粒度です。

ただし TypeScript 側が `hit_count` を追加乗算すると過大計算になります。

対応方針:

- `DamageResult` に「ヒット数を追加乗算しない」旨を明記する。
- ヒット別ダメージが必要な場合は別 API として設計する。

### 2. 通常攻撃クリティカル時の `E/2` を明記する

Excel の通常攻撃行では、クリティカル下限側補間に `E/2` が使われています。実装もこれに従っていますが、仕様書に記載がありません。

対応方針:

- `damage_calculation_model.md` に通常攻撃のみ `e_crit = e / 2` を使うことを追記する。

### 3. `destructionRate` は倍率形式であることを明記する

仕様上、破壊率 250% は `2.5` として渡します。Excel でも `AJ10` は倍率値として読めます。

対応方針:

- TypeScript 型コメントに `2.50, not 250` を明記する。

### 4. `activeZone` は enum 化する

現実装は `any(el in active_zone for el in skill_elements)` で部分文字列マッチしています。この方式は `FireZone` には便利ですが、自由文字列では偽陽性が起こり得ます。

対応方針:

- `activeZone` を自由文字列ではなく union / enum にする。
- 可能なら `zoneElement: 'None' | 'Fire' | 'Ice' | ...` のような正規化済み属性で完全一致させる。

### 5. `Y59` / `AB59` 式に脆弱独立因子を反映する

`phase2_design_specification.md` と engine は脆弱を防御デバフとは別乗算枠として扱います。一方、`damage_calculation_model.md` の式には脆弱の独立因子がありません。

対応方針:

- `damage_calculation_model.md` の通常/クリティカル期待値式に `Vulnerability` または `Fragile` 因子を追加する。
- `AJ82` は防御デバフ、`vulnerabilityMultiplier` は脆弱枠として明確に分離する。

### 6. `as48` が `DamageInputContext` に定義されていない

`damage_calc_engine.py` はクリティカル境界値の計算で `attacker.as48` を参照します。しかし `phase2_design_specification.md` の `DamageInputContext` には `as48` が定義されていません。

TypeScript 移植時にこの値の意味と供給元が不明なままだと、クリティカル基礎ダメージの境界補正が暗黙に `0.0` へ固定されます。

対応方針:

- `as48` の意味を仕様書に記載する。
- 入力として必要なら `DamageInputContext.attacker` に追加する。
- 内部で算出できる値なら、入力ではなく engine 側の明示的な計算経路へ移す。

## フォールバック実装のリスク

### 1. `get_interpolated_stats()` は精密ステータス計算ではない

`get_interpolated_stats()` はロールテンプレート値に `limit_break_count * 20` を全ステータスへ一律加算します。

一方、`styles.json` には `base_param`、`limit_break.stat_up_per_level`、`bonus_per_level`、`ability_tree` など、より詳細なデータがあります。現実装はこれらを使っていません。

対応方針:

- フェーズ3では、シミュレータ側から実ステータスを渡すことを基本にする。
- `get_interpolated_stats()` はフォールバック専用と明記する。
- 精密補完が必要なら `styles.json` を使う正式な `calculate_max_base_stats()` を実装する。

### 2. `get_enemy_border()` の fallback `770` は根拠が弱い

`enemies.json` を集計した結果は以下です。

- 敵データ総数: 4064
- `param_border > 0`: 4061
- `param_border == 0`: 3
- 平均: 約 285.9
- 中央値: 290
- 最小: 5
- 最大: 950
- 760-780 の範囲: 13 件

このため、`770` を「平均値」とするコメントは不正確です。

ただし `770` の実際の根拠は「スコアアタック 難易度40・グレード35 の敵ステータスが 770」であることが確認されました。このゲームでダメージ計算を最も活用するコンテンツがスコアアタックのため、**未指定時のデフォルトとして 770 は妥当な実用値**です。コードコメントを「平均値」から「スコアアタック難易度40グレード35相当の代表値」に修正すれば根拠として十分です。

また、`param_border == 0` の敵は `スモールホッパー`、`クレストホッパー`、`ヒールホッパー` の 3 件あり、`param_border is None` への修正により未指定との混同は解消済みです。

対応方針:

- ~~敵未指定時の fallback と `param_border == 0` の扱いを分ける。~~ → 対応済み（`is None` 判定）
- コードコメントを「スコアアタック難易度40グレード35相当の代表値」に修正する。

## フェーズ3 移植前の推奨アクション

1. `DamageInputContext` を正規化済みカテゴリ中心に再設計する。
2. 未対応の `statusType` / `category` はサイレントドロップせず、例外または警告として扱う。
3. `ElementResistDown`、`Fragile`、`PassiveDefenseDown`、`MindEye`、`ElementAttackUp` の fixture を追加する。
4. `activeZone` を enum / union 型へ変更する。
5. `tokenCount` / `tokenRatio` のどちらを採用するか決める。
6. `critMindeyeMultiplier` の命名と実装を一致させる。
7. `get_interpolated_stats()` と `get_enemy_border()` の fallback 仕様を明記する。
8. ゾーン込み弱点判定とクリティカルバフ上限は、ゲーム実測または信頼できる仕様ソースで確認する。

## 優先度一覧

| 優先度 | 項目 | 種別 | 推奨対応 |
| --- | --- | --- | --- |
| High | `ElementResistDown` が落ちる | 実装バグ | ルーティング修正とテスト追加 |
| High | 未処理 `statusType` のサイレントドロップ | 実装/仕様 | 実装または明示エラー |
| High | `tokenCount` / `tokenRatio` 不一致 | スキーマ | 入力仕様統一 |
| High | 脆弱・パッシブ枠の回帰不足 | テスト | Excel fixture 追加 |
| High | Excel スナップショット依存 | テスト | 固定 fixture 化 |
| High | `_find_skill()` 部分一致 | 実装リスク | 許可リスト化 |
| High | `critMindeyeMultiplier` 命名不整合 | 出力仕様 | リネームまたは心眼実装 |
| Medium | `classify_debuff()` の名前順序依存 | 実装リスク | 正規化カテゴリ化 |
| Medium | `as48` が入力仕様にない | スキーマ | 仕様追加または内部算出 |
| Medium | `get_enemy_border()` fallback `770` | フォールバック | 根拠修正と `0` 処理 |
| Medium | `get_interpolated_stats()` 近似 | フォールバック | 実ステータス必須化または正式実装 |
| Medium | `activeZone` 自由文字列 | スキーマ | enum / union 化 |
| Low | `power_range` 未使用 | 可読性 | 削除またはコメント整理 |

## レビュー時点の判断

現状の Python 実装は、Excel の主要な基礎ダメージ計算を再現するプロトタイプとしては有効です。しかし、TypeScript へそのまま移植すると、入力仕様の曖昧さや未処理効果のサイレントドロップによって、戦闘シミュレータ側で静かな過少計算・過大計算が起こる可能性があります。

フェーズ3では、現 Python 実装を単純な移植元として扱うのではなく、今回のレビュー結果を反映した入出力スキーマ再設計と fixture ベースの回帰テスト整備を先に行うべきです。

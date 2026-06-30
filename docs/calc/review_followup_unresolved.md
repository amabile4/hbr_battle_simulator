# レビュー指摘修正フォローアップ: 未解決項目

本ドキュメントは、`docs/phase1_phase2_review_results.md` と `docs/review_wbs.md` を照合し、WBS 上は完了扱いになっているものの、実装・仕様書・テストへの反映が不十分だった項目をまとめたものです。

照合時点では、以下のテストはすべて成功しています。

```bash
uv run python test_phase2.py
uv run python run_fixed_fixtures_tests.py
uv run python run_regression_tests.py
```

ただし、テスト通過だけではレビュー指摘の根本修正を保証できません。以下の項目は再修正が必要です。

## 未解決項目

### 1. `calculate_damage()` 内の攻撃 part 選択がまだ部分一致

**優先度: High**

WBS T5 では `_find_skill()` の `skill_type` 判定を許可リスト方式へ変更済みとされています。実際に `_find_skill()` は許可リスト化されています。

しかし、`calculate_damage()` 内で最終的に使用する `part` を選び直す処理が残っており、ここではまだ部分一致を使っています。

```python
if sum(weights.values()) > 0 and any(k in p_type for k in ["Attack", "Penetration"]):
    part = p
    break
```

このため、`AttackUp`、`AttackUpIncludeNormal`、`TokenAttack` などの非攻撃 part が攻撃 part として採用され得ます。

再現確認では、以下の非攻撃スキル名に対しても `calculate_damage()` が非ゼロの基礎ダメージを返しました。

- `クールダウン`
- `フィルエンハンス`
- `青春色のシュプール`

**再修正依頼**

- `calculate_damage()` 側の part 選択も `_find_skill()` と同じ攻撃 `skill_type` 許可リストへ統一する。
- 許可リスト外のスキルを攻撃スキルとして計算しないテストを追加する。
- バフスキル名だけを `skill.name` に渡した場合の期待挙動を仕様化する。

### 2. 固定 fixture が最終ダメージ経路を十分に検証していない

**優先度: High**

WBS T4 では固定 fixture テストが追加済みとされています。`run_fixed_fixtures_tests.py` と `test_cases_fixed.json` は存在し、テストも成功します。

しかし、現在の fixture はすべて以下のような値になっています。

- `baseDamageNormal = 0.0`
- `baseDamageCrit = 0.0`
- `normal.expected = 0.0`
- `critical.expected = 0.0`

このため、脆弱、属性防御、心眼、連撃、トークンなどの倍率が最終ダメージへ実際に反映されるかは検証できていません。breakdown の倍率だけを確認している状態です。

**再修正依頼**

- 少なくとも一部の fixture で `baseDamageNormal` / `baseDamageCrit` が非ゼロになる入力を使う。
- `ElementResistDown`、`Fragile`、`MindEye`、`Funnel`、`tokenCount` が `normal.expected` / `critical.expected` に反映されることを検証する。
- Excel 由来の固定期待値、または手計算で根拠を示せる期待値を fixture に入れる。

### 3. `activeZone` がまだ自由文字列の部分一致で判定される

**優先度: Medium**

WBS T11 では `activeZone` の enum / union 化と正規化が完了扱いになっています。仕様書上は union 型のように記載されています。

しかし、実装では依然として任意文字列を受け取り、以下の部分一致で判定しています。

```python
active_zone = str(input_data.get("activeZone", "None")).strip().lower()
if active_zone != "none" and any(el in active_zone for el in skill_elements):
    zone_mult = 1.5
```

再現確認では、火属性スキルに対して以下の値がすべて `resistMultiplier = 1.5` になりました。

- `FireZone`
- `Fireworks`
- `IceFire`

**再修正依頼**

- 実装側も許可された zone 名だけを受け付ける。
- zone 名から属性への明示マップを使う。
- 未知の zone 文字列は `None` 扱いにするか、`ignoredEffects` 相当の警告へ入れる。
- `Fireworks` や `IceFire` が誤って Fire zone と判定されないテストを追加する。

### 4. `damage_calculation_model.md` が新しい乗算モデルと不整合

**優先度: Medium**

`docs/phase2_design_specification.md` と engine は、脆弱を `vulnerabilityMultiplier` として防御デバフとは別乗算枠にしています。また、クリティカル・心眼枠では `MindEye` を `critMindeyeMultiplier` に加算します。

一方、`docs/damage_calculation_model.md` では以下が未反映です。

- `Y59` / `AB59` の式に `Vulnerability` / `Fragile` 独立因子がない。
- クリティカル式が `CritBuff` のみで、`MindEye` に触れていない。

**再修正依頼**

- `Damage_normal` と `Damage_crit` の数式に `Vulnerability` を追加する。
- `CritBuff` の説明に `MindEye` との関係を追記する。
- `AJ82` は防御デバフ、脆弱は別枠であることを明記する。
- `phase2_design_specification.md` と同じ用語で統一する。

### 5. 明示的な `paramBorder=0` が fallback 扱いになる

**優先度: Medium**

WBS T9 では `get_enemy_border()` の fallback 値と `0` の扱い見直しが完了扱いです。

しかし `calculate_damage()` では以下の判定が残っています。

```python
param_border = defender_data.get("paramBorder")
if not param_border:
    param_border = self.get_enemy_border(enemy_id)
```

このため、呼び出し側が明示的に `paramBorder=0` を渡しても、未指定と同じ扱いになり、`get_enemy_border()` の fallback `770` が使われます。

低ステータス入力で確認したところ、`paramBorder=0` は `paramBorder=100` と異なる結果になり、fallback 経路に入っていることが確認できました。

**再修正依頼**

- `if param_border is None:` のように、未指定と `0` を区別する。
- `paramBorder=0` が有効値なのか欠損値なのかを仕様化する。
- `paramBorder=0` の明示入力テストを追加する。

## 再修正後の確認基準

再修正後は、以下を確認してください。

1. `calculate_damage()` 内に攻撃 part 判定の部分一致が残っていない。
2. 固定 fixture の少なくとも一部が非ゼロの最終ダメージを検証している。
3. 未知の `activeZone` 文字列で zone 倍率が誤適用されない。
4. `damage_calculation_model.md` と `phase2_design_specification.md` の数式・用語が一致している。
5. `paramBorder=0` と `paramBorder` 未指定の挙動が仕様どおりに分離されている。
6. 以下のコマンドが成功する。

```bash
uv run python test_phase2.py
uv run python run_fixed_fixtures_tests.py
uv run python run_regression_tests.py
```

## 現時点の判断

`docs/review_wbs.md` は全項目完了になっていますが、上記の未解決項目が残っているため、現時点では「レビュー結果が十分に反映され修正済み」とは判断できません。

WBS は、上記 5 件の再修正が完了し、テストと仕様書照合が通った後に完了扱いへ戻すべきです。

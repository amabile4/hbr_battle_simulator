# Follow-up Review Verification

Date: 2026-06-02
Reviewer: codex-calc

## Summary

`docs/review_followup_unresolved.md` で指摘した 5 件について、再修正後の実装とテストを確認した。
結論として、5 件はいずれも修正済みと判断する。

追加で確認した範囲では、実装者へ戻すべき High 優先度の未修正項目はない。

## Verification Results

### 1. `calculate_damage()` の攻撃 part 選択

Status: Resolved

`damage_calc_engine.py` の `calculate_damage()` 側でも `_find_skill()` と同じ攻撃 `skill_type` 許可リストが使われている。
部分一致ではなく完全一致で判定しているため、`AttackUp` や `AttackUpIncludeNormal` が攻撃 part として誤採用される経路は解消されている。

代表確認:

- `クールダウン`: `baseDamageNormal=0.0`, `normal.expected=0.0`
- `フィルエンハンス`: `baseDamageNormal=0.0`, `normal.expected=0.0`

補足:

- `青春色のシュプール` は説明文どおり体力依存の `TokenAttack` であり、非攻撃スキルではない。
- Excel スナップショットの `ダメージ計算機` シート row 40 と Python 個別計算を突き合わせ、W/X/Y/AB 相当の値が一致することを確認した。
- この特殊計算経路の回帰防止として、`test_con_based_token_attack_matches_excel_snapshot` を追加した。

### 2. 固定 fixture の最終ダメージ経路

Status: Resolved

`test_cases_fixed.json` の 6 ケースは、すべて `baseDamageNormal` / `baseDamageCrit` / `normal.expected` / `critical.expected` が非ゼロの期待値になっている。
`run_fixed_fixtures_tests.py` も 6/6 PASS で、ゼロ期待値だけを検証する状態は解消されている。

### 3. `activeZone` の部分一致誤検出

Status: Resolved

`activeZone` は `ZONE_ELEMENT_MAP` による明示マッピングになっている。
`FireZone` は正しく `fire` に対応し、`Fireworks` / `IceFire` のような未知ゾーンは `resistMultiplier=1.0` のまま `ignoredEffects` に記録される。

`test_active_zone_mapping_and_warning` で以下を確認している。

- `FireZone` -> `resistMultiplier=1.5`
- `Fireworks` -> `resistMultiplier=1.0`, `ignoredEffects` に `activeZone`
- `IceFire` -> `resistMultiplier=1.0`, `ignoredEffects` に `activeZone`

### 4. 計算モデルドキュメント

Status: Resolved

`docs/damage_calculation_model.md` に以下の倍率が反映されている。

- `Vulnerability`
- `MindEye`
- `Funnel`

通常式とクリティカル式の両方で、実装済みの主要倍率が追跡可能になっている。

### 5. `paramBorder=0` と fallback 770 の扱い

Status: Resolved

`paramBorder` は `None` の場合だけ敵マスタの境界値へフォールバックするようになっている。
`0` は明示値として扱われるため、`paramBorder=0` と未指定が同じ結果になる問題は解消されている。

fallback 値 `770` は全体平均ではなく、スコアアタック難易度 40・グレード 35 の敵ステータスに基づく代表値である。
ダメージ計算の主要ユースケースに合わせた実用デフォルトとして妥当と判断する。

## Test Results

実行結果:

- `uv run python test_phase2.py`: 14 tests OK
- `uv run python run_fixed_fixtures_tests.py`: 6/6 PASS
- `uv run python run_regression_tests.py`: 115/115 PASS

追加手動確認:

- `クールダウン`: `baseN=0.0`, `expectedN=0.0`
- `フィルエンハンス`: `baseN=0.0`, `expectedN=0.0`
- `青春色のシュプール`: Excel row 40 と一致
  - `baseDamageNormal`: Python `2686.578125`, Excel `2686.578125`
  - `baseDamageCrit`: Python `8141.9765625`, Excel `8141.976563`
  - `normal.expected`: Python `4701.51171875`, Excel `4701.511719`
  - `critical.expected`: Python `14248.458984375`, Excel `14248.45898`

`青春色のシュプール` は `parameters.con=1` の体力依存 `TokenAttack` を持つ攻撃スキルとして扱われる。

## Residual Review Note

`test_non_attack_skills_clamp_to_zero` のテスト本文は現時点で `クールダウン` のみを入力している。
実装は `フィルエンハンス` も 0 にクランプできているが、テスト名・コメントの意図をより明確にするなら、`フィルエンハンス` も同テストに含めるとよい。

これは追加の明確化であり、現時点の機能不具合または再修正必須項目とは判断しない。

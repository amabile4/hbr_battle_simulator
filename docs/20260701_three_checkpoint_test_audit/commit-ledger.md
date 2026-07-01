# 107コミット監査台帳

## 読み方

- 「なし → coverage」は新規テスト追加であり、既存oracleの置換ではない。
- 「契約追随」は同一コミットまたは直前コミットの実装・入力契約変更に対応するassertion変更を示す。
- `P`: 実装差分と入力差分を追跡し、具体値または状態遷移が一致。
- `M`: マスターデータの説明・値から再導出。
- `D`: 仕様文書、実測資料、または独立計算で確認。
- `B`: mergeのincoming blob一致と手動競合解決を確認。
- `R-GEN`: 計算生成fixtureのseed・完全再生成一致がない。
- `R-TODO`: 未実装例をtodo化したが独立実測がない。
- `I-ABS`: repo外絶対パスとskipによりCI oracleを失う。
- `I-ORACLE`: 旧実測oracleを消して現行出力へ追随。
- `X-DEP`: 対象refに必要な依存ファイルがない。

コミット単位で複数テストを同じ契約変更としてまとめた。fixture内の個別pathと具体値は [fixture-ledger.md](fixture-ledger.md) に分離した。

## 系統A: 79件

| # | コミット | テスト範囲 | 旧 → 新 / 入力・実装差分 | 根拠 | 判定 |
|---:|---|---|---|---|---|
| A01 | `bf9e8617` | damage breakdown / input builder | token passive DP倍率未接続 → 接続結果を具体値固定 | P | 正当 |
| A02 | `6067712b` | character stats / Party Setup / input builder | JSON stats未接続 → party stats入力を固定 | P,M | 正当 |
| A03 | `f3bb8ebf` | turn transitions | なし → action後破壊率更新coverage | P | 正当 |
| A04 | `96054256` | damage context / UI / E2E | HP表示に破壊率未反映 → context接続結果 | P | 正当 |
| A05 | `1b0ba4ea` | input builder | なし → enemy all-ability-down入力coverage | P | 正当 |
| A06 | `2269fbb1` | destruction edge / UI | なし → stat delta・破壊率edge coverage | P | 正当 |
| A07 | `669c8ae3` | calculator / context / setup | enemy DP・scope旧契約 → 新配線の具体値 | P | 正当 |
| A08 | `b4d82bdb` | transcendence burst | なし → burst倍率・状態遷移coverage | P,M | 正当 |
| A09 | `92aa0072` | burst review cases | 旧burst edge → 修正後の具体状態 | P | 正当 |
| A10 | `ee49ae7d` | destruction cap / Hacking / UI | なし → cap・status効果coverage | P,M | 正当 |
| A11 | `d07398f5` | destruction calculator | action一括 → hit単位dynamic破壊率 | P,D | 正当 |
| A12 | `37e5bd96` | turn transitions | action内のみ → turn跨ぎDP累積・auto break | P | 正当 |
| A13 | `0ccb6952` | turn transitions | auto-break edge旧挙動 → review修正 | P | 正当 |
| A14 | `6eb57630` | calculator / destruction | 重複resolver → unified resolver同値 | P | 正当 |
| A15 | `6c3d233a` | calculator / destruction | PR #13 incoming assertionsを追加 | incoming blobと実装差分 | 正当 |
| A16 | `5877eba0` | turn UI | なし → enemy detail破壊率・DP表示 | P | 正当 |
| A17 | `a74df46f` | replay purity / summon | なし → JSON purity・recalculate同値 | P | 正当 |
| A18 | `d6db838e` | DP damage guide | なし → per-hit DP guide / auto-break | P | 正当 |
| A19 | `810f54db` | DP guide E2E / fixture | なし → 固定sessionとbreak source表示 | P、fixtureは入力 | 正当 |
| A20 | `ab2816bb` | HP guide | なし → HP累積・討伐予測coverage | P | 正当 |
| A21 | `b3b1cf72` | DP prediction E2E/unit | なし → uncommitted予測chip | P | 正当 |
| A22 | `9193f452` | comparison view | なし → manual override無効比較 | P | 正当 |
| A23 | `cf29c517` | preview input | なし → turn-scoped一時入力 | P | 正当 |
| A24 | `596ee9a8` | hybrid break warning | 部分coverage → auto/manual競合を固定 | P | 正当 |
| A25 | `597f9d64` | session roundtrip | manual DP/HP消失 → save/load保持 | P | 正当 |
| A26 | `7b5802d1` | comparison replay / fixture | replay stateずれ → Skullfeather固定sessionで整合 | P | 正当 |
| A27 | `ab6eca5e` | HP kill fixture / chips | なし → HP討伐chip具体値 | P | 正当 |
| A28 | `c32e7ebc` | enemy detail HP | なし → normal HP表示coverage | P | 正当 |
| A29 | `d2847476` | damage popup E2E | obsolete synthetic skill/DOM → 実skill/current UI | P,M | 正当 |
| A30 | `2b03e12c` | summon warning | 粗いT8警告 → slot revival精度 | P | 正当 |
| A31 | `784fc0db` | comparison view | manual enemy state混入 → 除外後の状態 | P | 正当 |
| A32 | `7c5d41ab` | DP/HP guide | 丸め途中値 → exact total | P | 正当 |
| A33 | `2e63d09c` | damage popup | なし → HP state表示 | P | 正当 |
| A34 | `badedb03` | DP/HP guide | noncritical guide → guaranteed critical total | P | 正当 |
| A35 | `0307bf90` | comparison E2E/unit | obsolete `0` 表示期待を削除 → unitでpositive reduced DPを固定 | P、oracleはunitに維持 | 正当 |
| A36 | `0b476b9e` | comparison view | derived break消失 → 保持 | P | 正当 |
| A37 | `5645ede6` | recalculate E2E / fixture | なし → 設定反映後DP保持 | P | 正当 |
| A38 | `3726d553` | destruction merge | summon slot reuseで誤merge → index別保持 | P | 正当 |
| A39 | `c2773ecf` | pierce equipment | なし → attack/break/blast hit補正 | P,D | 正当 |
| A40 | `ad67b7dd` | enemy destruction setup | なし → enemy multiplier roundtrip | P | 正当 |
| A41 | `abd2826c` | ancient chain | なし → equipment bonus・snapshot配線 | P,D | 正当 |
| A42 | `b391ec8d` | pierce integration | core未適用の期待 → defer契約を明示 | P | 正当 |
| A43 | `42bcdbe3` | auto-break hits | DP remainder喪失 → remainder保持 | P | 正当 |
| A44 | `81e8b21b` | calculator / destruction | main incoming testsを競合統合 | B | 正当 |
| A45 | `03bf9e08` | pierce destruction | deferred → flat bonus core消費 | P | 正当 |
| A46 | `8c103f4b` | resonance bonus | なし → support破壊率bonus | P,M | 正当 |
| A47 | `11774c65` | effect API | なし → application-time resolver API | P | 正当 |
| A48 | `22f737c7` | turn effect power | なし → resolverをturnへ接続 | P | 正当 |
| A49 | `48c3ec92` | unified destruction | 旧分岐式 → unified式の具体値 | P,D | 正当 |
| A50 | `a201a21c` | multiplier scale | 誤 `/100` → raw ratio契約 | P,D | 正当 |
| A51 | `f9ab4cd3` | effect API edge | なし → negative/non-finite guard | P | 正当 |
| A52 | `c0702912` | comments only | `bg30` → `baseDestRate`、assertion不変 | semantic test差分なし | 正当 |
| A53 | `adc1026b` | debuff recompute | なし → staleness再現test | 再現を先に固定 | 正当 |
| A54 | `46e1a7c8` | debuff recompute | stale expected → 再導出後power | P、A53再現 | 正当 |
| A55 | `d9d729d2` | session/E2E | なし → staleness roundtrip | P | 正当 |
| A56 | `190eaa49` | destruction multiplier | raw `d_rate` → `d_rate/5` ratio | P,D | 正当 |
| A57 | `922d2886` | normal attack | skill式共用 → raw `d_rate%` 固有式 | P,D | 正当 |
| A58 | `794aac84` | calc runner / 1007 fixtures | なし → Python由来fixture | seed・現存oracle再生成一致なし | 根拠不足 |
| A59 | `3cefb4d5` | destruction fixtures/unit | 通常攻撃旧式 → raw d_rate式 | 固定case仕様は妥当だが1000件再生成不能 | 根拠不足 |
| A60 | `e906f27d` | destruction fixtures/unit | Issue #19前 → 新式結果 | 1000件の独立再生成不能 | 根拠不足 |
| A61 | `cf1f1a65` | Funnel destruction | power fallback → metadata.damageBonus | P,D | 正当 |
| A62 | `6526fb67` | variable Funnel hit | fixed power[0] → stats hit count | P,M | 正当 |
| A63 | `844ee391` | weight fixtures/E2E | 均等hit → power_ratio/Funnel weight | 実機固定caseはD、生成fixtureはR-GEN | 根拠不足 |
| A64 | `ade59f6e` | d_rate fallback | 欠損時不統一 → raw 5 | P,D | 正当 |
| A65 | `7295a266` | FightingSpirit | なし → stat bonus配線 | P,M | 正当 |
| A66 | `0e43e434` | popup display | raw decimals → DP/HP丸め表示 | P、表示契約 | 正当 |
| A67 | `c6dd23b3` | gauge bars | なし → ratio fill/comma表示 | P | 正当 |
| A68 | `4e1ce34f` | extra DP E2Eほか | 追跡fixtureなし → Downloads絶対パス、欠損時skip | I-ABS | 不正 |
| A69 | `076939ab` | HP / penetration | 旧HP管理 → multi-gauge・critical契約 | P | 正当 |
| A70 | `01157ed2` | Misfortune | なし → 全param -20 | P,M | 正当 |
| A71 | `06d47cfe` | enemy presets | なし → orb/dimension master preset | P,M | 正当 |
| A72 | `d6352704` | stat notes | 全delta note → source別filter | P | 正当 |
| A73 | `17f54a0c` | actual damage UI | 誤表示 → actual damage値 | P | 正当 |
| A74 | `eb555cbf` | lockfile only | undici更新、test assertion不変 | test semantic差分なし | 正当 |
| A75 | `98d35189` | Mizuhara OD | なし → 3件 `test.todo` | R-TODO、新実測なし | 根拠不足 |
| A76 | `711c939e` | scoped OD | なし → scope別OD buff | P,M | 正当 |
| A77 | `36d0cbfa` | transcendence pursuit | pursuit未適用 → burst bonus適用 | P,M | 正当 |
| A78 | `ebd220dd` | lockfile merge | main lockfileを統合、assertion不変 | test semantic差分なし | 正当 |
| A79 | `7dcbccf6` | real skill transition | no NegativeMind: dr `3→18`; active: `18→3` | master説明「非negative時SP半減かつ破壊率特大」とvariant順を照合 | 正当 |

## 系統B: 20件

| # | コミット | テスト範囲 | 旧 → 新 / 入力・実装差分 | 根拠 | 判定 |
|---:|---|---|---|---|---|
| B01 | `9e03a17c` | real skill transition | A79と同じmaster更新・assertion訂正 | M | 正当 |
| B02 | `06a09517` | Sprightly | なし → 軽快status・消費・UI | P,M | 正当 |
| B03 | `bb760612` | AST parser/evaluator | なし → grammar・IsTalisman coverage | P、golden式 | 正当 |
| B04 | `41ef188a` | context adapter | なし → AST ConditionContext adapter | P | 正当 |
| B05 | `17e804e2` | CountBC/enemy | 部分adapter → enemy object / CountBC統合 | P、golden式 | 正当 |
| B06 | `961fe754` | cooldown/SP escalation | なし → interval_turn / use count | P,M | 正当 |
| B07 | `4daa7afd` | config | なし → define_values wiring | P | 正当 |
| B08 | `bca4bc9a` | adapter core | hardcoded/未接続 → TALISMAN ref param | P,M | 正当 |
| B09 | `31857a2b` | condition adapter | whitelist制限 → 全special status type | P、master全式 | 正当 |
| B10 | `cab440cc` | evaluator refactor | legacy regex → AST、既存fixture同値 | P、318式 | 正当 |
| B11 | `a526a057` | interval turn | 毎行減算 → active turn減算 | P,D | 正当 |
| B12 | `e594f987` | ResistDown | status未反映 → weakness/damage反映 | P,M | 正当 |
| B13 | `eb5a0f8d` | 1MORE | なし → turn跨ぎ実データsequence | P,M | 正当 |
| B14 | `d297205e` | penetration critical | conditional weakness → 常時weakness/1MORE | P,M | 正当 |
| B15 | `cf197149` | special operations | なし → All Out / Makai Kihei damage | P,D | 正当 |
| B16 | `baa94345` | character stats integration | 旧自動stats → LB/owned styles統合 | P、master/workbook | 正当 |
| B17 | `38070d88` | actual character fixture | なし → 58キャラ・212 style実測比較 | fixtureは原本一致、必要master欠落 | 実行不能 |
| B18 | `c6fe28f0` | actual fixture test | 構造refactor、期待値不変 | 同一fixture・同値 | 正当 |
| B19 | `55c6d6fd` | equipment builds | なし → 6 build / 7 tests | breakdown独立加算6/6一致 | 正当 |
| B20 | `0f606d82` | character settings UI | default/上限旧値 → 転生5・称号12等 | P,D | 正当 |

## 統合固有: 8件

| # | コミット | テスト範囲 | 旧 → 新 / 入力・実装差分 | 根拠 | 判定 |
|---:|---|---|---|---|---|
| I01 | `1f9609e5` | Step 1破壊率基本統合 | 系統B基盤へAのcalculator testsを統合 | incoming blobとmanual conflictを確認、oracle削除なし | 正当 |
| I02 | `5b123815` | Step 3 hybrid break | Aのtests/3 fixturesを統合 | fixturesはA blob一致、manual conflictで期待値緩和なし | 正当 |
| I03 | `0428df2b` | Party Setup snapshot | 自動stats具体値保存 → 未保存 `undefined` | 再計算・LB・reset・materializeの具体値testを維持 | 正当 |
| I04 | `36b62953` | Step 4 equipment/resonance | Aのequipment testsを統合 | incoming blob/manual conflict確認 | 正当 |
| I05 | `ef37140e` | Step 5 calc-core sync | Aのcalc runner/fixturesを統合 | blob一致だが元のR-GENを継承 | 根拠不足 |
| I06 | `825506f9` | Step 6 final integration | A/Bの最終test集合を統合 | incoming blob/manual conflict確認、数値oracle改変なし | 正当 |
| I07 | `402b3fc9` | final E2E/fixture calibration | fixed stats削除、`132.63→121.75`, hit `7→8`, `717.34→706.46` | I-ORACLE、新実測なし。ほかの999/1固定は正当だが最悪判定を採用 | 不正 |
| I08 | `dd58e9ed` | comparison unit/E2E | 同じ旧具体値 → I07の新出力 | 実装はdebug log削除のみ、I-ORACLE | 不正 |

## 件数検算

| 判定 | A | B | 統合 | 合計 |
|---|---:|---:|---:|---:|
| 正当 | 73 | 19 | 5 | 97 |
| 不正 | 1 | 0 | 2 | 3 |
| 根拠不足 | 5 | 0 | 1 | 6 |
| 実行不能 | 0 | 1 | 0 | 1 |
| **合計** | **79** | **20** | **8** | **107** |


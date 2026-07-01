# Fixture semantic path台帳

この台帳はJSONを構造比較した結果である。配列indexを `*`、party indexを `{0..5}`、能力名を `{str,dex,con,spr,wis,luk}` とまとめて表記する。同じpattern配下の全leafを1行に集約しており、整形・minify差分は含めない。

## 集計

| 系統 | fixture変更コミット | file change set |
|---|---:|---:|
| A | 8 | 14 |
| B | 2 | 2 |
| 統合固有 | 4 | 13 |
| **合計** | **14** | **29** |

## 系統A

| コミット | file / semantic path | 旧 → 新 | 根拠 | 判定 |
|---|---|---|---|---|
| `810f54db` | `ui_next_session_dp_damage_fixture.json`: `$` 全体追加 | なし → session input | DP guide E2Eの固定入力。追加fixtureで既存oracleを変更せず、assertionはDP累積・break sourceを具体値で固定 | 正当 |
| `7b5802d1` | `ui_next_session_skullfeather_repro.json`: `$` 全体追加 | なし → session input | Skullfeather replayの再現入力。後続統合でもblob同一 | 正当 |
| `ab6eca5e` | `ui_next_session_hp_kill_fixture.json`: `$` 全体追加 | なし → session input | HP kill chipの固定入力。既存oracle変更なし | 正当 |
| `5645ede6` | `ui_next_session_skullfether_dp_fixture.json`: `$` 全体追加 | なし → session input | 「設定を反映」後のDP保持用replay。後続統合でもblob同一 | 正当 |
| `794aac84` | `skill_sp_mapping.json`: `$` 全体追加 | なし → mapping | 移植元 `hbr_calc` とSHA-256一致 | 正当 |
| `794aac84` | `test_cases_destruction.json`: `$[*].{name,input,expected}` 全7件追加 | なし → 固定計算case | generator、入力version、完全一致ログが残っておらず、現存Python参照で再生成不一致 | 根拠不足 |
| `794aac84` | `test_cases_destruction_large.json`: `$[*].{name,input,expected}` 全1000件追加 | なし → 大規模計算case | generatorの乱数seed未固定。JS成功は自己整合であり生成oracle再現ではない | 根拠不足 |
| `3cefb4d5` | 固定case `$[1].name`, `$[1].expected.{destructionRate,breakdown.*}` | 通常攻撃 `0.08` 基準 → raw `d_rate=1` による `0.01` 基準 | 通常攻撃仕様は独立文書と一致。ただしfixture全体の再生成一致なし | 根拠不足 |
| `3cefb4d5` | 大規模case `$[*].expected.breakdown.{flatDestructionRateBonus,flatDestructionBonus,baseDestruction,finalBaseDestruction,destMult,ignoredEffects,transcendenceBurstDestructionRateGainBonusRate}`, `$[*].expected.destructionRate` | schema名変更と式結果更新 | 3481 semantic change。seedなしで同一case再生成不能 | 根拠不足 |
| `e906f27d` | 固定case `$[*].expected.{destructionRate,breakdown.*}` | 旧スキル式 → Issue #19式 | 実装・仕様文書との因果はあるが、生成oracleの独立再現なし | 根拠不足 |
| `e906f27d` | 大規模case `$[*].expected.{destructionRate,breakdown.*}` | 旧式結果 → 新式結果 | 1000件の一括追随。seed・完全一致ログなし | 根拠不足 |
| `844ee391` | `ui_next_session_destruction_preview_2026-06-14.json`: `$` 全体追加 | なし → 実機session input | 固定statsを含み、文書化された実測 `+32.6%` と対応 | 正当 |
| `844ee391` | 固定case `$[*].expected.{destructionRate,breakdown.*}` | hit均等按分 → `power_ratio` / Funnel weight按分 | 固定実測caseは文書値と一致。生成fixture全体の完全再生成は不能 | 根拠不足 |
| `844ee391` | 大規模case `$[*].expected.{destructionRate,breakdown.*}` | 旧weight結果 → 新weight結果 | 1000件一括更新、seedなし | 根拠不足 |

## 系統B

| コミット | file / semantic path | 旧 → 新 | 根拠 | 判定 |
|---|---|---|---|---|
| `38070d88` | `template1_actual_character_stats_20260629.json`: `$.characters[*].{reincarnation,title,dp,hp,str,dex,con,spr,wis,luk}`, `$.styles[*].lb` | なし → 58キャラ / 212スタイル | 原本workbookと58/58および212/212一致 | 正当（テスト実行は不能） |
| `55c6d6fd` | `equipment_template_builds.json`: `$.builds[*].{equipment,breakdown,expectedBonus}` | なし → 6 build | breakdownを独立加算し6/6で `expectedBonus` と一致 | 正当 |

`38070d88` のfixture内容は正当だが、checkpoint Bにはテストが必要とする `golden/master_json/MasterTitleBadgeRank.json` がないため、コミット単位の実行判定は「実行不能」とした。

## 統合固有

| コミット | file / semantic path | 旧 → 新 | 根拠 | 判定 |
|---|---|---|---|---|
| `5b123815` | DP / HP / Skullfeather 3 fixtureの `$` | 第一親にはなし → 系統A blob | 系統Aの追加時blobと完全一致。競合時のfixture改変なし | 正当 |
| `36b62953` | Skullfeather DP fixtureの `$` | 第一親にはなし → 系統A blob | 系統A blobと完全一致 | 正当 |
| `ef37140e` | destruction preview / skill mapping / fixed / large fixtureの `$` | 第一親にはなし → 系統A blob | 4ファイルとも系統A blobと完全一致。判定は移植元を継承 | 混在（commit最悪判定は根拠不足） |
| `402b3fc9` | destruction fixture `.setup.statsByPartyIndex.{0..5}.stats.{str,dex,con,spr,wis,luk}` | 明示36値 → path削除 | 実機条件を失いautomatic defaultsへ依存 | 不正 |
| `402b3fc9` | destruction fixture `.setup.statsByPartyIndex.{0..5}.supportStats.{str,dex,con,spr,wis,luk}` | 明示36値 → path削除 | 同上。main/support計72 leaf削除 | 不正 |
| `402b3fc9` | destruction fixture `$.savedAt` および周辺session metadata | 旧保存時刻 → 新保存時刻 | semantic oracleではない | 正当 |
| `402b3fc9` | DP fixture `.setup.statsByPartyIndex.{0..5}.stats.{str,dex,con,spr,wis,luk}` | 未指定 → 999（36値） | master更新に左右されない合成入力の固定。テスト意図が「大ダメージDP guide」で実測fixtureではない | 正当 |
| `402b3fc9` | HP fixtureの同path | 未指定 → 999（36値） | master非依存化。実測値の上書きではない | 正当 |
| `402b3fc9` | enemy-status-desc fixtureの同path | 未指定 → 1（36値） | status説明表示だけを検証する合成入力の固定 | 正当 |
| `402b3fc9` | 上記3 fixtureの各 `.setup.statsByPartyIndex.__keys` / member `.stats.__keys` と `$.savedAt` | key追加 / 保存時刻更新 | 上記36 leaf追加に伴う構造差分 | 各親項目と同判定 |
| `402b3fc9` | `ui_next_session_enemy_status_desc_fixture_for_desc.json`: `$` 全体追加 | なし → session input | status desc test専用の追加fixture。既存実測oracleを変更しない | 正当 |

## 期待値とfixture入力の交差確認

fixture外のassertion変更も含め、破壊率実測caseでは次の因果を確認した。

| 変更 | 入力差分 | 実装差分 | 独立根拠 | 判定 |
|---|---|---|---|---|
| `402b3fc9`: `132.63 → 121.75`, hit `7 → 8`, `717.34 → 706.46` | 固定stats 72値を削除 | merge内に計算式変更なし | 旧値を支持する実測文書のみ | 不正 |
| `dd58e9ed`: unit具体値を同じ新値へ変更 | unit入力変更なし | debug log削除のみ | 新実測なし | 不正 |
| `0428df2b`: snapshot具体値削除 | 永続化対象をautomatic値からnullへ変更 | automatic再計算契約を変更 | 別テストで具体値・LB・reset・materializeを固定 | 正当 |


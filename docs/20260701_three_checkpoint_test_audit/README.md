# 3基準点テスト・fixture全件監査

- ステータス: ✅ 完了
- 監査日: 2026-07-01
- 共通祖先: `bbe53b410f1eb471a27b77fdf798a5329ce64df3`
- 系統A: `checkpoint/calc-core-refinement-20260630` (`7dcbccf6f37689df49c6dec945d9b30ee9a51455`)
- 系統B: `checkpoint/ast-refactor-template1-validation-20260630` (`0f606d82196b48d51608ccca062a52ff75c6efed`)
- 統合後: `main` (`9b126ededafcde3ae3c4f14e6e3945850e734cfa`)

## 結論

107件のテスト関連コミットを重複なく確認した。コミット単位の最悪判定は次のとおりである。1コミット内に正当な変更と不正な変更が混在する場合は、より悪い判定を採用した。

| 系統 | 対象数 | 正当 | 不正 | 根拠不足 | 実行不能 |
|---|---:|---:|---:|---:|---:|
| A: `bbe53b41..7dcbccf6` | 79 | 73 | 1 | 5 | 0 |
| B: `bbe53b41..0f606d82` | 20 | 19 | 0 | 0 | 1 |
| 統合固有 | 8 | 5 | 2 | 1 | 0 |
| **合計** | **107** | **97** | **3** | **6** | **1** |

重大な問題は3件ある。

1. `402b3fc9` は、実機確認fixtureからユキを含む72個の明示ステータス値を削除し、実測oracle `100 → 132.63` を自動初期値による現行出力 `100 → 121.75` へ変更した。新しい実測証拠はないため不正である。
2. `dd58e9ed` は、計算挙動を変えずにunit testの `132.625...` / `717.337...` を `121.751...` / `706.463...` へ追随させた。コメントの「実測」は証拠への参照を伴わないため不正である。
3. `4e1ce34f` は、repo外のユーザー固有絶対パスをfixtureとして参照し、ファイル不在時にskipするE2Eを導入した。追跡可能なoracleではなく、CIでは常時skipし得るため不正である。

したがって、現在の `main` は旧mainを置き換える統合点としては利用できるが、テストoracleが全面的に健全であるとは判定しない。破壊率実測oracleの復元と、絶対パスfixtureのrepo内固定が必要である。本監査では指示どおりテスト・fixture・本体実装を変更していない。

全107件のコミット別判定は [commit-ledger.md](commit-ledger.md)、fixtureの全semantic pathをまとめた台帳は [fixture-ledger.md](fixture-ledger.md) を参照する。

## 判定基準

| 判定 | 適用条件 |
|---|---|
| 正当 | 仕様、追跡可能な実測、マスターデータ、独立計算のいずれかから期待値を再導出でき、旧oracleの削除・緩和がない |
| 不正 | 現在出力への追随、oracleの消去、CIで観測不能になるskip・外部絶対パス依存がある |
| 根拠不足 | 変更は合理的でも、再生成一致、実測原本、独立oracleのいずれかが欠ける |
| 実行不能 | 対象refだけでは依存ファイルまたは環境が成立せず、そのテストを再現できない |

コミットメッセージ、テストコメント、同じ実装を呼ぶテストの成功だけでは独立根拠として扱っていない。

## 主要finding

### F-01 [Critical] 実機破壊率oracleの消去

`tests/e2e/fixtures/ui_next_session_destruction_preview_2026-06-14.json` は、`844ee391` 時点では6人のmain/supportそれぞれに6能力を明示していた。`402b3fc9` は以下の72 pathを全削除した。

- `.setup.statsByPartyIndex.{0..5}.stats.{str,dex,con,spr,wis,luk}`
- `.setup.statsByPartyIndex.{0..5}.supportStats.{str,dex,con,spr,wis,luk}`

これにより、実機条件として固定されていたユキの `str=598` / `dex=818` 等が失われ、自動ステータス算出へ依存した。併せて期待値が次のように変更された。

| 項目 | 変更前 | 変更後 |
|---|---:|---:|
| ユキ破壊率 | 132.63 | 121.75 |
| Break hit | 7 | 8 |
| 美也破壊率 | 717.34 | 706.46 |

`docs/calc/destruction_rate_step0_raw_data.md` と破壊率仕様書には、固定ステータスと実測 `+32.6%`、`100 → 132.63` が記録されている。`402b3fc9` にはこれを覆す動画、画像、元JSON、観測日時がない。初期値変更をテストへ反映したのではなく、元fixtureが固定していた実測条件を消して現行出力へ合わせた変更である。

### F-02 [Critical] unit testの同値追随

`dd58e9ed` の本体差分はdebug log削除であり、破壊率計算の挙動変更を含まない。一方で `tests/ui-next-comparison-view.test.js` の具体値assertionをF-01と同じ新出力へ変更した。このため、独立した仕様変更に伴う期待値変更ではなく、失敗したテストを現在出力へ追随させたものと判定した。

### F-03 [High] repo外fixtureとskip

`4e1ce34f` は次の絶対パスをE2E入力に使用し、存在しない環境では `test.skip` する。

```text
/Users/ram4/Downloads/ui_next_session_2026-06-05T21-24-36.194+09-00.json
```

`402b3fc9` はこの未追跡入力に対する期待値も変更した。元JSONがGit管理されず、CIではoracleを実行できないため、期待値の出所を監査できない。

### F-04 [High] `npm ci` は3基準点すべてで失敗

Node `22.23.1` / npm `10.9.7` で、3refすべての `npm ci` が同じlockfile不整合により失敗した。

```text
Missing: @emnapi/core@1.11.1 from lock file
Missing: @emnapi/runtime@1.11.1 from lock file
```

問題は現在の `main` 固有ではなく両checkpointにも存在する。`7dcbccf6` / `9e03a17c` のlockfile更新でも解消されていない。正規CI条件の検証は成立しないため、以後のテスト結果は `npm install --package-lock=false` で依存を補った補助実行として区別した。

### F-05 [Medium] 大規模計算生成fixtureを完全再生成できない

`tests/fixtures/test_cases_destruction_large.json` の1000件は、参照Python generatorに乱数seedが固定されていない。さらに現存する静的Python参照を旧 `hbr_calc` データと組み合わせた再計算では、固定7ケースも現行期待値と一致しなかった。

JavaScript側の `npm run test:calc` 1007件成功は現行実装との自己整合を示すが、生成時oracleの再現ではない。したがって `794aac84`、`3cefb4d5`、`e906f27d`、`844ee391` と、それを統合した `ef37140e` の生成fixture部分は根拠不足とした。`skill_sp_mapping.json` は移植元とのSHA-256一致を確認しており、このファイル単体は正当である。

### F-06 [Medium] 系統Bの実機fixtureは正当だがcheckpoint単体で実行不能

`tests/fixtures/template1_actual_character_stats_20260629.json` の `source` が指す同名workbookを確認した。repo内workbookは実測欄が空だったが、原本workbook（SHA-256 `6321da26862001526d14bb564c9ab37d3886d7fce603227338d7838531d455a3`）には実測sheetが残っていた。

- 58/58キャラクター: 転生、称号、DP、HP、6能力がfixtureと一致
- 212/212スタイル: LBがfixtureと一致
- level: 元表の値ではなく算出値であり、テストロジック側の検証対象

fixture移記自体は正当である。ただし `0f606d82` にはテストが読む `golden/master_json/MasterTitleBadgeRank.json` が存在せず、`npm test` は `ENOENT` となる。このファイルは後続コミットで追加されているため、checkpoint B単体の当該テストは「実行不能」とした。

### F-07 [Low] `0428df2b` のassertion削除は正当

自動算出ステータスをsnapshotへ保存せず、再計算時にmaterializeする契約へ変更したため、snapshot内の具体値assertionを `undefined` へ変更している。自動算出値、LB変更、reset、バトル開始時materializeは別テストで具体値を固定している。oracleを消したのではなく永続化境界を変更したものであり正当である。ただし既存テスト名の一部は旧仕様を示したままで、名称更新は後続の保守項目とする。

## 実行検証

全refをdetached worktreeに分離し、Node `22.23.1` / npm `10.9.7` を使用した。`npm ci` 失敗後の補助実行ではlockfileを書き換えない `npm install --package-lock=false --no-audit --no-fund` を使った。

| ref | `npm ci` | `npm test`（補助） | `test:calc`（補助） | `lint`（補助） | `test:e2e`（補助） |
|---|---|---|---|---|---|
| A `7dcbccf6` | 失敗: lock不整合 | 1475/1475 pass | 1007/1007 pass | pass | 107 pass / 6 fail |
| B `0f606d82` | 失敗: lock不整合 | 1 file fail（欠落master）、その他pass | scriptなし | pass | 97 pass / 2 fail |
| main `9b126ede` | 失敗: lock不整合 | 1560/1560 pass | 1007/1007 pass | pass | 113 pass / 1 fail |

AのE2E失敗は、破壊率表示文言1件、multi-HP gauge 1件、存在しないHefty Guardian presetに起因する4件だった。対象6件を `--workers=1 --repeat-each=3` で再実行し、6件すべてが3/3失敗したため再現障害と判定した。

Bの初回E2E失敗はpopup遷移時のexecution context破棄1件とconsole 404の1件だった。同じ2 specを3回反復すると、damage popupは3/3成功してflake、turn-editの404は3/3失敗して再現障害だった。

main全114件は113 pass / 1 failだった。失敗した `turn-row-operation-chip-layout.spec.js` を3回反復すると2 pass / 1 failであり、committed rowの魔界騎兵chip取得タイミングに依存するflakeと判定した。mainには3回反復で常時失敗するE2Eはなかった。

## 抽出範囲と競合解決確認

- 107コミット、assertion相当の追加・削除行2406行、fixture変更集合29件を抽出した。
- merge commitは第一親との差分とcombined diffを確認した。
- JSONはNode/JQで構造比較し、minify・整形差分を除外した。
- integration mergeでincoming parentとblob一致しない手動解決ファイルも確認した。`402b3fc9` / `dd58e9ed` 以外に、旧具体値oracleの削除、skip化、許容誤差拡大による偽陽性は認めなかった。
- `98d35189` の3件の `test.todo` は既存テストをskipへ変えたものではなく未実装例の追加だが、実測根拠がないため根拠不足とした。

## 復元・修正方針（本監査では未実装）

1. `844ee391` 時点の破壊率fixtureの明示ステータス72値と、`132.63` / hit 7 / `717.34` oracleを復元する。
2. `dd58e9ed` のunit期待値も同じ実測oracleへ戻し、現行コードが失敗する場合はテストではなく計算入力・自動ステータス境界を修正する。
3. Downloads絶対パスのsession JSONを、出所・観測日時・採用値を記録した実機確認fixtureとしてrepo内へ追加する。原本が確認できない場合はテスト自体を監査可能なfixtureで書き直す。
4. package-lockをNode 22/npm 10.9.7で再生成し、`npm ci` 成功をCIで固定する。
5. 大規模計算fixture generatorへseed、生成コマンド、入力データversionを固定し、再生成完全一致を必須にする。
6. `MasterTitleBadgeRank.json` を含む必要master集合をcheckpoint相当の履歴へ揃えるか、fixtureテストが自己完結するよう依存を明示する。

## 完了条件の照合

- [x] 107テスト関連コミットを重複なく台帳化
- [x] assertion削除・期待値変更・fixtureのsemantic pathへ判定と根拠を付与
- [x] 系統別・fixture別・判定別に集計
- [x] 重大度順findingと復元対象oracleを提示
- [x] テスト、fixture、本体実装を変更していない
- [x] 3refで正規 `npm ci` を試行し、共通lockfile不整合を記録した上で補助実行と区別
- [x] E2E失敗specを3回再実行し、main全E2Eを含め再現障害とflakeを分離

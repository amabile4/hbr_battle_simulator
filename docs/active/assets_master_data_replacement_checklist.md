# assets/ui・assets/skill_type マスターデータ入れ替えチェックリスト

**ステータス**: 🟢 進行中
**最終更新**: 2026-07-03

## 目的

`assets/ui/` と `assets/skill_type/` に、正規のマスターデータと対応が取れないファイル
（手作業で用意された代替画像）が混在している。提供された対応表と現状のリポジトリを
突き合わせ、入れ替え対象・不足・過剰（削除候補）を確定する。

対応表の出典・取得手順は本ドキュメントに記載しない（`docs/specs/simulator_data_update_workflow.md`
の情報境界に従う）。以下「対応表」とだけ表記する。

## ユーザー確定事項

- `Motivation[1-5]_1.webp`（5件）は各段階でデザインが異なる別画像のため全て必要。
  不要なのは各段階内のバリエーション `Motivation[1-5]_[2-8].webp`（計35件）のみ。
- `*_ko.webp` / `*_zhTW.webp`（多言語版、計12件）は不要。
- `Morale.webp` は `assets/ui/` と `assets/skill_type/` の両方から参照されるファイルとして、
  最終的に `assets/skill_type/` 側に格納し共有する。
- `None.webp`（無属性アイコン）は現在未格納・コード未接続だが、将来 PartySetup の
  スタイル絞り込みや敵の無属性耐性表示で使う可能性があるため、入れ替え対象に含める
  （コード接続は本チェックリストのスコープ外、別タスク）。

## assets/ui/ 入れ替えリスト

対応表でカバーされるのは20件。[assets_ui_final_list.txt](assets_master_data_replacement_lists/assets_ui_final_list.txt) 参照。

| 分類 | 件数 | 内容 |
|---|---|---|
| 対応表に一致・現状も存在（入れ替え可） | 19 | `ArrowBuff`/`ArrowDebuff`（2）、`MarkerAttribute[Dark/Fire/Ice/Light/Thunder]`（5）、`Slash`/`Stab`/`Strike`（3）、`Fire`/`Ice`/`Thunder`/`Light`/`Dark`（5）、`IconRarityA`/`S`/`SS`/`SSR`（4） |
| 対応表にあるが現状は未格納（新規格納） | 1 | `None.webp` |

### 対応表の対象外（未対応、6件）

以下はユーザー確認により手作業で用意された画像と判明した。正規の対応表がまだなく、
今回は入れ替えない。

- `Break.webp`
- `dead.webp`
- `defeat.webp`
- `Reinforce.webp`
- `Summon.webp`
- `TokenSet.webp`（`resolveUiAssetUrl` からの参照箇所なし。コード上未使用の孤立ファイルの可能性が高い）

### 対象外（アイコンではない）

- `workspace-toolbar-bg.png` — ツールバー背景装飾。状態アイコンではないため対象外。

## assets/skill_type/ 入れ替えリスト

対応表（180件）から、ユーザー確定事項（`Motivation[1-5]_[2-8]` 35件、多言語版12件、
計47件）を除いた **133件** が最終リスト。
[assets_skill_type_final_list.txt](assets_master_data_replacement_lists/assets_skill_type_final_list.txt) 参照。

現状の `assets/skill_type/`（198件）と突き合わせたところ、133件全てが既に存在しており
**不足はゼロ**。一方、現状に存在するが最終リストにない**65件**があり、これらが
入れ替え・削除の候補になる。

### 過剰候補（65件）の内訳

| 分類 | 件数 | 内容 | 扱い |
|---|---|---|---|
| 属性別の完パケ画像 | 35 | `[Dark/Fire/Ice/Light/Thunder][AttackUp/CriticalDamageUp/CriticalRateUp/DefenseDown/ResistDown/ResistDownOverwrite/Zone].webp` | 対応表では「ベース画像＋矢印＋属性マークの動的合成」に分類される組み合わせ。個別の完パケ画像として対応表に記載がなく、代替画像の可能性が高い |
| `SuperBreak` の属性版完パケ | 2 | `IceSuperBreak.webp` / `LightSuperBreak.webp` | **自作画像と確認済み**。文字（英語テキスト）が画像に直接焼き込まれ、属性マークも合成済みの状態で1枚化されている。対応表の動的合成方式（ベース＋矢印＋マークをランタイムで重ねる）とは作り方が異なり、対応表にも記載がない |
| 基本バフ/デバフの完パケ画像 | 6 | `AttackUp` / `AttackDown` / `DefenseUp` / `DefenseDown` / `CriticalRateUp` / `CriticalDamageUp` | 対応表では動的合成対象。シミュレータ側は既にベース画像＋矢印の合成表示へ切り替え済みで、これらのファイルはコードから参照されなくなっている（`docs/active/skill_type_icon_rename_pr24_acceptance.md` 参照） |
| ステータス名は存在するが対応表に専用画像がないもの | 22 | 下記「21件+SuperBreakDownの診断結果」参照 | 対応表に対応する専用画像はない（診断済み）。解決策（流用/動的合成/自作保護）はファイルごとに異なる |

65件の内訳合計: 35 + 2 + 6 + 22 = 65（過不足なく分類完了）。

### 22件の診断結果（うち21件は個別診断済み、`SuperBreakDown` は前述の通り自作確定）

対応表による診断の結果、21件全てについて対応表に専用画像がないことが確定した。
解決策は3パターンに分かれる。

#### A. 動的合成で解決（1件、専用画像は不要）

| ファイル | 解決策 |
|---|---|
| `ToughnessUpValue.webp` | `Toughness.webp`（ベース） + `ArrowBuff.webp`（矢印）の動的合成で表現。対応表の動的合成レシピ（51種）には含まれていなかった追加ケース |

#### B. 既存の別ファイルへ流用マッピング（6件）

| ファイル | 流用先 | 状態 |
|---|---|---|
| `EpLimitOverwrite.webp` | `SpLimitOverwrite.webp` | 未実装（要コード対応） |
| `HealEp.webp` | `HealSp.webp` | **実装済み**（`docs/active/skill_type_icon_rename_pr24_acceptance.md` で対応済み。今回の診断結果と一致） |
| `HealSpRandom.webp` | `HealSp.webp` | 未実装（要コード対応。現行データでの使用実績は別途確認要） |
| `TokenSetByAttacked.webp` | `TokenSet.webp`（自作画像） | 未実装（要コード対応） |
| `TokenSetByAttacking.webp` | `TokenSet.webp`（自作画像） | 未実装（要コード対応） |
| `TokenSetByHealedDp.webp` | `TokenSet.webp`（自作画像） | 未実装（要コード対応） |

#### C. 自作画像のまま保護（2件、専用画像を維持）

| ファイル | 備考 |
|---|---|
| `TokenSet.webp` | 対応表に対応画像がないため、シミュレータ独自の画像として維持する方針 |
| `ZoneUpEternal.webp` | 同上 |

#### D. 方向性のみ・具体的な流用先が未確定（12件）

診断では「通常は非表示、または類似画像を流用」という方針のみ示され、具体的な流用先
ファイル名の指定がない。個別の流用先確定が別途必要。

| ファイル | 診断メモ |
|---|---|
| `FixedHpDamageRateAttack.webp` | 固定HP割合ダメージ攻撃。類似画像への流用または非表示を検討 |
| `GiveDebuffTurnUp.webp` | デバフターン増加。類似デバフ効果画像への流用を検討 |
| `GiveHealUp.webp` | 被回復量上昇。類似画像への流用または非表示を検討 |
| `HealDown.webp` | 回復量低下。類似画像への流用または非表示を検討 |
| `HealSkillUsedCount.webp` | 回復スキル使用回数。類似回復画像への流用を検討 |
| `IgnoreEShieldElement.webp` | 対DP属性攻撃無効化。類似画像への流用または非表示を検討 |
| `OverwriteSp.webp` | SP上限変更。類似SP関連画像への流用を検討 |
| `ReduceSp.webp` | SP減少。類似SPデバフ画像への流用を検討 |
| `RemoveBuff.webp` | バフ消去。`RemoveDebuff.webp`（デバフ消去）は存在するがバフ消去専用画像はない。流用または非表示を検討 |
| `RemoveSpecialStatus.webp` | 特殊効果消去。`RemoveDebuff.webp` 等への流用または非表示を検討 |
| `SkillSwitch.webp` | スキル切り替え。`SkillCondition.webp` 等への流用または非表示を検討 |
| `SpecialCommandCountUp.webp` | 特殊コマンド使用回数増加。類似画像への流用または非表示を検討 |

## 動的合成の対応表（参考、51種類）

`assets/ui/` の透過パーツ（矢印・属性マーク）を使い、ランタイムでベース画像に重ね合わせて
表示する組み合わせの対応表。内訳:

- 属性なし基本バフ・デバフ: 6種（`AttackUp`/`AttackDown`/`DefenseUp`/`DefenseDown`/
  `CriticalRateUp`/`CriticalDamageUp`）
- 特殊バフ・デバフ/流用系: 10種（`AttackUpIncludeNormal`/`AttackUpPerToken`/
  `DefenseUpPerToken`/`BorderRefPDownByAdmiral`/`GiveDefenseDebuffUp`/`HealDpByDamage`/
  `RegenerationDp`/`ReviveDpRate`/`ReviveTerritory`/`ResistDownOverwrite`）
- 属性別: 35種（`[Element]` × `AttackUp`/`DefenseDown`/`Zone`/`CriticalRateUp`/
  `CriticalDamageUp`/`ResistDown`/`ResistDownOverwrite`、`[Element]` は
  Fire/Ice/Thunder/Light/Dark）

このうち12種（属性なし6種の一部＋特殊系の一部）は
`docs/active/skill_type_icon_rename_pr24_acceptance.md` の実装で対応済み。
属性別35種と特殊系の残り（`ReviveTerritory`/`ResistDownOverwrite`）は未実装。

## 未確定・要フォローアップ

- `assets/ui/` の手作業画像6件（`Break`/`dead`/`defeat`/`Reinforce`/`Summon`/`TokenSet`）の
  正規対応表が届き次第、本チェックリストを更新する。
- `assets/skill_type/` の自作画像3件（`IceSuperBreak`/`LightSuperBreak`/`SuperBreakDown`）も
  同様に、`SuperBreak`（無属性・属性なし版は対応表に記載あり）や属性マークの動的合成で
  代替できるか、専用の対応表が必要かを別途判断する。
- 22件診断結果のうち、流用先・解決策が判明している7件（分類A・B）はコード未実装
  （`HealEp`→`HealSp` のみ実装済み）。実装するかどうかは別途判断する。
- 22件診断結果のうち、方向性のみで具体的な流用先が未確定な12件（分類D）は、
  個別の流用先確定が必要。
- `None.webp` のコード接続（PartySetup スタイル絞り込み、敵の無属性耐性表示）は別タスク。
- 過剰候補65件を実際に削除するかどうかは、画像入れ替え作業本体とあわせて別途判断する
  （本チェックリストは対象リストの確定までがスコープ）。

## 関連ドキュメント

- [active/skill_type_icon_rename_pr24_acceptance.md](skill_type_icon_rename_pr24_acceptance.md):
  PR #24 受け入れとレイヤー合成実装の記録。動的合成12種の実装済み範囲はこちらに詳細がある。

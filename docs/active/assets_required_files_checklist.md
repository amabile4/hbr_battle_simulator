# assets/ui・assets/skill_type 格納必要ファイルリスト

**ステータス**: 🟢 進行中
**最終更新**: 2026-07-03

## 目的

`assets/ui/` と `assets/skill_type/` に実際に格納すべきファイルの正式リスト。
調査・監査の経緯は [assets_master_data_replacement_checklist.md](assets_master_data_replacement_checklist.md)
を参照。本ドキュメントは「何を用意すればよいか」の実務用チェックリストとして、
対応表に基づく正規ファイルと、正規ファイルがなく自作のまま維持するファイルを分けて記載する。

## assets/ui/ （20件）

対応表に基づく正規ファイル一覧。
[assets_ui_final_list.txt](assets_master_data_replacement_lists/assets_ui_final_list.txt) 参照。

| カテゴリ | ファイル | 用途 |
|---|---|---|
| 合成用透過パーツ | `ArrowBuff.webp` | バフ上昇を表す矢印 |
| 合成用透過パーツ | `ArrowDebuff.webp` | デバフ下降を表す矢印 |
| 合成用透過パーツ | `MarkerAttributeDark.webp` | 闇属性マーク |
| 合成用透過パーツ | `MarkerAttributeFire.webp` | 火属性マーク |
| 合成用透過パーツ | `MarkerAttributeIce.webp` | 氷属性マーク |
| 合成用透過パーツ | `MarkerAttributeLight.webp` | 光属性マーク |
| 合成用透過パーツ | `MarkerAttributeThunder.webp` | 雷属性マーク |
| 武器種アイコン | `Slash.webp` | 斬 |
| 武器種アイコン | `Stab.webp` | 突 |
| 武器種アイコン | `Strike.webp` | 打 |
| 属性アイコン | `Dark.webp` | 闇 |
| 属性アイコン | `Fire.webp` | 火 |
| 属性アイコン | `Ice.webp` | 氷 |
| 属性アイコン | `Light.webp` | 光 |
| 属性アイコン | `Thunder.webp` | 雷 |
| 属性アイコン | `None.webp` | 無属性（**新規格納が必要**、現状未格納） |
| レア度アイコン | `IconRarityA.webp` | レアリティA |
| レア度アイコン | `IconRarityS.webp` | レアリティS |
| レア度アイコン | `IconRaritySS.webp` | レアリティSS |
| レア度アイコン | `IconRaritySSR.webp` | レアリティSSR |

このうち19件は現状も存在し入れ替え可能。`None.webp` のみ新規格納。

## assets/skill_type/ （133件）

対応表に基づく正規ファイル一覧（全件、`Morale.webp` を含む）。
[assets_skill_type_final_list.txt](assets_master_data_replacement_lists/assets_skill_type_final_list.txt) 参照。

現状 `assets/skill_type/` に133件全て存在するため、**新規格納は不要**（既存ファイルを
対応表由来のファイルへ入れ替えるのみ）。

## 対応表に正規ファイルがなく、自作のまま維持するファイル

対応表に対応する専用画像が存在しないため、シミュレータ独自の画像として維持する。
（下記「自作ファイルの隔離移動計画」で `*_custom/` フォルダへ移動する対象と同じ）

**2026-07-03 移動完了**: 以下11件は `assets/ui_custom/` / `assets/skill_type_custom/` へ
移動済み（[assets_custom_files_migration_plan.md](assets_custom_files_migration_plan.md) 参照）。
`src/ui/style-asset-url.js` の解決関数がファイル名で自動判定するため、呼び出し元のコードは
変更不要。

| 移動先フォルダ | ファイル | コードからの参照 |
|---|---|---|
| assets/ui_custom/ | `Break.webp` | `enemy-detail-popup.js` |
| assets/ui_custom/ | `dead.webp` | `char-detail-popup.js`（`DEAD_STATUS_ICON_FILE_NAME`） |
| assets/ui_custom/ | `defeat.webp` | `enemy-detail-popup.js` |
| assets/ui_custom/ | `Reinforce.webp` | `char-detail-popup.js`, `turn-row.js` |
| assets/ui_custom/ | `Summon.webp` | `enemy-detail-popup.js` |
| assets/ui_custom/ | `TokenSet.webp` | 参照なし（未使用・削除候補） |
| assets/skill_type_custom/ | `IceSuperBreak.webp` | `resolveSkillTypeIconUrl('IceSuperBreak')` 経由（属性合成ロジック） |
| assets/skill_type_custom/ | `LightSuperBreak.webp` | 同上（`'LightSuperBreak'`） |
| assets/skill_type_custom/ | `SuperBreakDown.webp` | 同上（`'SuperBreakDown'`） |
| assets/skill_type_custom/ | `TokenSet.webp` | `resolveSkillTypeIconUrl('TokenSet')` 経由。`turn-controller.js`/`damage-breakdown.js` の `skill_type`/`iconStatusType: 'TokenSet'` から実際に参照される |
| assets/skill_type_custom/ | `ZoneUpEternal.webp` | `resolveSkillTypeIconUrl('ZoneUpEternal')` 経由 |

## 未確定（対応表待ち・要診断）

以下は対応表の対象外、または個別の流用先が未確定のため、現時点では入れ替え・移動の
どちらの判断もできない。詳細は `assets_master_data_replacement_checklist.md` の
「D. 方向性のみ・具体的な流用先が未確定（12件）」を参照。

- `assets/skill_type/` の属性別完パケ35件、基本バフ完パケ6件（既にコード参照なし）
- `assets/skill_type/` の流用先未確定12件（`FixedHpDamageRateAttack` 等）

## 関連ドキュメント

- [active/assets_master_data_replacement_checklist.md](assets_master_data_replacement_checklist.md):
  対応表との突き合わせ・診断の経緯記録。
- [active/assets_custom_files_migration_plan.md](assets_custom_files_migration_plan.md):
  自作ファイルの隔離移動計画。

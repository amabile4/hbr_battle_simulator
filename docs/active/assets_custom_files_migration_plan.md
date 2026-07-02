# 自作ファイル隔離移動計画（assets/*_custom/）

**ステータス**: ✅ 完了
**最終更新**: 2026-07-03

## 目的

対応表に正規ファイルが存在せず、シミュレータ独自に用意された画像（11件、確定済み）を、
対応表由来の正規ファイルと同じフォルダに混在させず、専用フォルダへ隔離する。
今後、対応表が届いて正規ファイルに置き換わった際に、`assets/ui/` /
`assets/skill_type/` に残っているファイルは「全て対応表由来」と機械的に判断できる
状態にすることが狙い。

対象ファイルの確定経緯は
[assets_required_files_checklist.md](assets_required_files_checklist.md) を参照。

## 移動対象（確定済み、11件）

| 移動元 | 移動先 |
|---|---|
| `assets/ui/Break.webp` | `assets/ui_custom/Break.webp` |
| `assets/ui/dead.webp` | `assets/ui_custom/dead.webp` |
| `assets/ui/defeat.webp` | `assets/ui_custom/defeat.webp` |
| `assets/ui/Reinforce.webp` | `assets/ui_custom/Reinforce.webp` |
| `assets/ui/Summon.webp` | `assets/ui_custom/Summon.webp` |
| `assets/ui/TokenSet.webp` | `assets/ui_custom/TokenSet.webp` |
| `assets/skill_type/IceSuperBreak.webp` | `assets/skill_type_custom/IceSuperBreak.webp` |
| `assets/skill_type/LightSuperBreak.webp` | `assets/skill_type_custom/LightSuperBreak.webp` |
| `assets/skill_type/SuperBreakDown.webp` | `assets/skill_type_custom/SuperBreakDown.webp` |
| `assets/skill_type/TokenSet.webp` | `assets/skill_type_custom/TokenSet.webp` |
| `assets/skill_type/ZoneUpEternal.webp` | `assets/skill_type_custom/ZoneUpEternal.webp` |

`assets/ui/TokenSet.webp` はコードから未参照（削除候補）だが、実体として残す方針のため
他の5件と同様に移動する。

## 実装方針

呼び出し元のコードは11件とも共通のURL解決関数
（`src/ui/style-asset-url.js` の `resolveUiAssetUrl` / `resolveSkillTypeAssetUrl`）を
経由しており、ファイル名を固定文字列または `statusType` から動的に組み立てて渡している。
呼び出し元を個別に書き換える代わりに、**解決関数の中でファイル名が自作リストに
含まれるかを判定し、ベースパスを自動で切り替える**。これにより呼び出し元（
`char-detail-popup.js` / `enemy-detail-popup.js` / `turn-row.js` /
`turn-controller.js` / `damage-breakdown.js` 等）は一切変更不要になる。

```js
// src/ui/style-asset-url.js（実装済み）
const UI_ASSET_BASE_URL = '../../assets/ui/';
const UI_CUSTOM_ASSET_BASE_URL = '../../assets/ui_custom/';
const SKILL_TYPE_ASSET_BASE_URL = '../../assets/skill_type/';
const SKILL_TYPE_CUSTOM_ASSET_BASE_URL = '../../assets/skill_type_custom/';

const UI_CUSTOM_FILE_NAMES = new Set([
  'Break.webp', 'dead.webp', 'defeat.webp', 'Reinforce.webp', 'Summon.webp', 'TokenSet.webp',
]);
const SKILL_TYPE_CUSTOM_FILE_NAMES = new Set([
  'IceSuperBreak.webp', 'LightSuperBreak.webp', 'SuperBreakDown.webp', 'TokenSet.webp', 'ZoneUpEternal.webp',
]);

export function resolveUiAssetUrl(fileName) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) return '';
  const base = UI_CUSTOM_FILE_NAMES.has(normalizedFileName) ? UI_CUSTOM_ASSET_BASE_URL : UI_ASSET_BASE_URL;
  return new URL(`${base}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}

export function resolveSkillTypeAssetUrl(fileName) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName) return '';
  const base = SKILL_TYPE_CUSTOM_FILE_NAMES.has(normalizedFileName) ? SKILL_TYPE_CUSTOM_ASSET_BASE_URL : SKILL_TYPE_ASSET_BASE_URL;
  return new URL(`${base}${encodeURIComponent(normalizedFileName)}`, import.meta.url).href;
}
```

`assets/ui/TokenSet.webp` と `assets/skill_type/TokenSet.webp` は同名だが別ファイル
（別フォルダの解決関数でそれぞれ判定するため、名前が重複しても問題ない）。

将来、対応表が届いて `Break`/`dead`/`defeat`/`Reinforce`/`Summon` 等が正規ファイルに
置き換わった場合は、`UI_CUSTOM_FILE_NAMES` / `SKILL_TYPE_CUSTOM_FILE_NAMES` から
該当エントリを削除し、ファイルを `assets/ui/` / `assets/skill_type/` へ戻す。

## 実行結果

1. ✅ `assets/ui_custom/` `assets/skill_type_custom/` ディレクトリを作成した。
2. ✅ `git mv` で対象11件を移動した。
3. ✅ `src/ui/style-asset-url.js` に custom 判定ロジックを追加した。
4. ✅ `npm test` 実行。`tests/ui-next-char-detail-popup-order.test.js` の
   `dead.webp` パス期待値が `assets/ui/dead.webp` を直接参照していたため
   `assets/ui_custom/dead.webp` へ更新（1件のみ影響）。最終的に全1633件PASS。
5. ✅ 開発サーバー経由で `assets/ui_custom/Break.webp` / `dead.webp` /
   `assets/skill_type_custom/TokenSet.webp` の配信を確認（HTTP 200）。
   `tests/e2e/turn-row-preview-status-popup.spec.js`（enemy-detail-popup のボタン群を
   含む）と `tests/e2e/superbreak-hefty-guardian.spec.js`（`SuperBreak`/`SuperBreakDown`
   表示を含む）を実行し、既知の enemy preset catalog 不整合1件を除き全件PASS。
6. ✅ 本ドキュメントと `assets_required_files_checklist.md` を更新した。

## 関連ドキュメント

- [active/assets_required_files_checklist.md](assets_required_files_checklist.md):
  格納必要ファイルの正式リスト。
- [active/assets_master_data_replacement_checklist.md](assets_master_data_replacement_checklist.md):
  対応表との突き合わせ・診断の経緯記録。

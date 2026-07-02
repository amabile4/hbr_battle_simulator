import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveSkillTypeIconUrl } from '../ui-next/utils/char-detail-popup.js';

// このテストは「現状バグ」ではなく「画像アセットが未提供のため 404 になる既知の
// ギャップ」を可視化するためのものである。
//
// 各 statusType は resolveSkillTypeIconUrl() の解決先ファイルが assets/skill_type/
// に存在しないことを assert する。将来アセットが提供され解決先ファイルが実在する
// ようになった場合、このテストは（存在しないはずが存在する、という理由で）失敗する。
// その場合は該当エントリをこのリストから削除し、必要であれば
// tests/style-asset-url.test.js 側の実在確認テストへ移設すること。
//
// 詳細は docs/active/skill_type_icon_rename_pr24_acceptance.md を参照。

// 分類A: SKILL_TYPE_IMAGE_MAP のマッピング先ファイルが未提供
const UNRESOLVED_MAPPED_STATUS_TYPES = [
  'HealSp',
  'SpecifySp',
  'HealEp',
  'OverDrivePointUp',
  'OverDrivePointDown',
  'ResistDown',
];

// 分類B: 旧ファイルが削除されたが SKILL_TYPE_IMAGE_MAP に代替エントリがない
const UNMAPPED_REMOVED_STATUS_TYPES = [
  'BreakDownTurnUp',
  'GiveDefenseDebuffUp',
  'HealDpByDamage',
  'Provoke',
  'RegenerationDp',
  'ReviveDpRate',
];

const KNOWN_ICON_ASSET_GAPS = [
  ...UNRESOLVED_MAPPED_STATUS_TYPES,
  ...UNMAPPED_REMOVED_STATUS_TYPES,
];

for (const statusType of KNOWN_ICON_ASSET_GAPS) {
  test(`resolveSkillTypeIconUrl('${statusType}') is a known unresolved icon asset (image not yet provided)`, () => {
    const url = resolveSkillTypeIconUrl(statusType);
    const filePath = fileURLToPath(url);

    assert.equal(
      fs.existsSync(filePath),
      false,
      `${statusType} の解決先アイコン (${filePath}) は現時点で画像未提供のはずです。` +
        `もしこのアサーションが失敗した（＝ファイルが存在するようになった）場合、` +
        `tests/skill-type-icon-asset-gaps.test.js のこのエントリを削除し、` +
        `必要であれば tests/style-asset-url.test.js の実在確認テストへ移設してください。`
    );
  });
}

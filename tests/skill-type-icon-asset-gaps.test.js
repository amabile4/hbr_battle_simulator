import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveSkillTypeIconUrl } from '../ui-next/utils/char-detail-popup.js';

// このファイルは PR #24（skill_type アイコン命名統一）で判明したギャップの記録と、
// その後の SKILL_TYPE_IMAGE_MAP 修正で解決した箇所の回帰確認をまとめて管理する。
//
// 詳細は docs/active/skill_type_icon_rename_pr24_acceptance.md を参照。

// 解決済み: SKILL_TYPE_IMAGE_MAP の修正により、実在するファイルへ正しく解決される
// ようになった statusType。誤って存在しないファイル名へマッピングしていたもの
// （HealSp/SpecifySp/OverDrivePointUp/OverDrivePointDown/ResistDown）と、
// 実バトルUIでの流用先へのマッピングを追加したもの（HealEp/BreakDownTurnUp/Provoke）。
const RESOLVED_STATUS_TYPES = [
  'HealSp',
  'SpecifySp',
  'HealEp',
  'OverDrivePointUp',
  'OverDrivePointDown',
  'ResistDown',
  'BreakDownTurnUp',
  'Provoke',
];

for (const statusType of RESOLVED_STATUS_TYPES) {
  test(`resolveSkillTypeIconUrl('${statusType}') resolves to an existing icon asset`, () => {
    const filePath = fileURLToPath(resolveSkillTypeIconUrl(statusType));
    assert.equal(
      fs.existsSync(filePath),
      true,
      `${statusType} の解決先アイコン (${filePath}) が存在すること`
    );
  });
}

// 未解決: ベース画像＋矢印/属性マークのレイヤー合成が必要だが、合成の仕組み自体は
// 未実装のため、現時点では画像未提供のまま残る statusType。
//
// 各 statusType は resolveSkillTypeIconUrl() の解決先ファイルが assets/skill_type/
// に存在しないことを assert する。レイヤー合成が実装され解決先ファイルが実在する
// ようになった場合、このテストは（存在しないはずが存在する、という理由で）失敗する。
// その場合は該当エントリをこのリストから削除し、RESOLVED_STATUS_TYPES または
// tests/style-asset-url.test.js の実在確認テストへ移設すること。
const UNRESOLVED_STATUS_TYPES = [
  'GiveDefenseDebuffUp',
  'HealDpByDamage',
  'RegenerationDp',
  'ReviveDpRate',
];

for (const statusType of UNRESOLVED_STATUS_TYPES) {
  test(`resolveSkillTypeIconUrl('${statusType}') is a known unresolved icon asset (layer composition not yet implemented)`, () => {
    const url = resolveSkillTypeIconUrl(statusType);
    const filePath = fileURLToPath(url);

    assert.equal(
      fs.existsSync(filePath),
      false,
      `${statusType} の解決先アイコン (${filePath}) は現時点でレイヤー合成未実装のため存在しないはずです。` +
        `もしこのアサーションが失敗した場合、このエントリを RESOLVED_STATUS_TYPES へ移設してください。`
    );
  });
}

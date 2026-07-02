import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  resolveSkillTypeIconUrl,
  resolveSkillTypeIconCompositeHtml,
} from '../ui-next/utils/char-detail-popup.js';

// このファイルは PR #24（skill_type アイコン命名統一）で判明したギャップの記録と、
// その後の SKILL_TYPE_IMAGE_MAP 修正・レイヤー合成実装で解決した箇所の回帰確認を
// まとめて管理する。
//
// 詳細は docs/active/skill_type_icon_rename_pr24_acceptance.md を参照。

// 解決済み（単純マッピング）: SKILL_TYPE_IMAGE_MAP の修正により、実在するファイルへ
// 正しく解決されるようになった statusType。誤って存在しないファイル名へマッピング
// していたもの（HealSp/SpecifySp/OverDrivePointUp/OverDrivePointDown/ResistDown）、
// 実バトルUIでの流用先へのマッピングを追加したもの（HealEp/BreakDownTurnUp/Provoke）、
// 付与元スキルタイプ名との異名同義語で専用アセットが付与元側にのみ存在したもの
// （NegativeState → NegativeMind）。
const RESOLVED_STATUS_TYPES = [
  'HealSp',
  'SpecifySp',
  'HealEp',
  'OverDrivePointUp',
  'OverDrivePointDown',
  'ResistDown',
  'BreakDownTurnUp',
  'Provoke',
  'NegativeState',
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

// 解決済み（レイヤー合成）: ベース画像＋矢印(バフ/デバフ)の動的合成で表現される
// statusType。resolveSkillTypeIconUrl() 単体はベース画像（矢印なし）のURLを返すため
// 実在確認のみ行い、実際の見分けはコンポジット側のテスト（後述）で検証する。
const COMPOSITE_STATUS_TYPES = [
  'AttackUp',
  'AttackDown',
  'DefenseUp',
  'DefenseDown',
  'AttackUpIncludeNormal',
  'AttackUpPerToken',
  'DefenseUpPerToken',
  'BorderRefPDownByAdmiral',
  'GiveDefenseDebuffUp',
  'HealDpByDamage',
  'RegenerationDp',
  'ReviveDpRate',
];

for (const statusType of COMPOSITE_STATUS_TYPES) {
  test(`resolveSkillTypeIconUrl('${statusType}') base image exists`, () => {
    const filePath = fileURLToPath(resolveSkillTypeIconUrl(statusType));
    assert.equal(
      fs.existsSync(filePath),
      true,
      `${statusType} のベース画像 (${filePath}) が存在すること`
    );
  });

  test(`resolveSkillTypeIconCompositeHtml('${statusType}') includes a composite base and an arrow overlay`, () => {
    const html = resolveSkillTypeIconCompositeHtml(statusType, statusType);
    assert.match(html, /composite-base/, `${statusType} はベース画像を含む合成HTMLを返すこと`);
    assert.match(
      html,
      /composite-overlay arrow.*Arrow(Buff|Debuff)\.webp/,
      `${statusType} はバフ/デバフ矢印オーバーレイを含む合成HTMLを返すこと`
    );
  });
}

// 回帰防止: バフ/デバフの対になる statusType が、矢印込みの合成HTMLで見分けられる
// ことを確認する。resolveSkillTypeIconUrl() 単体の戻り値（ベース画像のみ）は
// AttackUp/AttackDown で意図的に同一ファイルになるため、実際に画面へ出力される
// resolveSkillTypeIconCompositeHtml() の結果で判別すること。
const BUFF_DEBUFF_PAIRS_MUST_DIFFER = [
  ['AttackUp', 'AttackDown'],
  ['DefenseUp', 'DefenseDown'],
];

for (const [buffType, debuffType] of BUFF_DEBUFF_PAIRS_MUST_DIFFER) {
  test(`resolveSkillTypeIconCompositeHtml('${buffType}') and ('${debuffType}') use different arrow overlays`, () => {
    const buffHtml = resolveSkillTypeIconCompositeHtml(buffType, buffType);
    const debuffHtml = resolveSkillTypeIconCompositeHtml(debuffType, debuffType);
    assert.match(buffHtml, /ArrowBuff\.webp/, `${buffType} は上向き（バフ）矢印を使うこと`);
    assert.match(debuffHtml, /ArrowDebuff\.webp/, `${debuffType} は下向き（デバフ）矢印を使うこと`);
    assert.notEqual(
      buffHtml,
      debuffHtml,
      `${buffType} と ${debuffType} が同一の合成結果になるとバフ/デバフが見分けられません`
    );
  });
}

// 未解決: 専用アセットが未提供のため、現時点では画像未提供のまま残る statusType。
//
// 各 statusType は resolveSkillTypeIconUrl() の解決先ファイルが assets/skill_type/
// に存在しないことを assert する。アセットが提供され解決先ファイルが実在する
// ようになった場合、このテストは（存在しないはずが存在する、という理由で）失敗する。
// その場合は該当エントリをこのリストから削除し、RESOLVED_STATUS_TYPES または
// tests/style-asset-url.test.js の実在確認テストへ移設すること。
const UNRESOLVED_STATUS_TYPES = [
  // 専用アセット未提供。現行データでは使用実績なし（休眠）だが、生成経路（エンジン側の
  // 状態付与ロジック）自体は完成しているため、対応する skill_type を持つスキル/パッシブが
  // データに追加された時点で表示され404になる
  'ResistUp',
  'OverDriveRateUp',
  'Attention',
  'Zone',
];

for (const statusType of UNRESOLVED_STATUS_TYPES) {
  test(`resolveSkillTypeIconUrl('${statusType}') is a known unresolved icon asset`, () => {
    const url = resolveSkillTypeIconUrl(statusType);
    const filePath = fileURLToPath(url);

    assert.equal(
      fs.existsSync(filePath),
      false,
      `${statusType} の解決先アイコン (${filePath}) は現時点でアセット未提供のため存在しないはずです。` +
        `もしこのアサーションが失敗した場合、このエントリを RESOLVED_STATUS_TYPES へ移設してください。`
    );
  });
}

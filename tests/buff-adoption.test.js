import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompetitionGroupKey,
  readEffectPower,
  compareByPowerDesc,
  resolveAdoptionStatus,
  selectAdoptedEffects,
} from '../ui-next/utils/buff-adoption.js';

// ============================================================
// buildCompetitionGroupKey
// ============================================================

test('buildCompetitionGroupKey separates by statusType', () => {
  const a = { statusType: 'AttackUp', exitCond: 'Turn' };
  const b = { statusType: 'DefenseDown', exitCond: 'Turn' };
  assert.notEqual(
    buildCompetitionGroupKey(a),
    buildCompetitionGroupKey(b),
  );
});

test('buildCompetitionGroupKey separates by elements', () => {
  const noElem = { statusType: 'DefenseDown', exitCond: 'Turn' };
  const dark = { statusType: 'DefenseDown', elements: ['Dark'], exitCond: 'Turn' };
  const fire = { statusType: 'DefenseDown', elements: ['Fire'], exitCond: 'Turn' };
  assert.notEqual(
    buildCompetitionGroupKey(noElem),
    buildCompetitionGroupKey(dark),
  );
  assert.notEqual(
    buildCompetitionGroupKey(dark),
    buildCompetitionGroupKey(fire),
  );
});

test('buildCompetitionGroupKey separates Eternal from finite', () => {
  const eternal = { statusType: 'AttackUp', exitCond: 'Eternal' };
  const turn = { statusType: 'AttackUp', exitCond: 'Turn' };
  const count = { statusType: 'AttackUp', exitCond: 'Count' };
  assert.notEqual(
    buildCompetitionGroupKey(eternal),
    buildCompetitionGroupKey(turn),
  );
  // Turn and Count are same duration group (finite)
  assert.equal(
    buildCompetitionGroupKey(turn),
    buildCompetitionGroupKey(count),
  );
});

test('buildCompetitionGroupKey groups Turn and Count in same finite group', () => {
  const turn = { statusType: 'Fragile', exitCond: 'Turn', remaining: 2 };
  const count = { statusType: 'Fragile', exitCond: 'Count', remaining: 3 };
  assert.equal(
    buildCompetitionGroupKey(turn),
    buildCompetitionGroupKey(count),
  );
});

test('buildCompetitionGroupKey with same statusType + elements + duration matches', () => {
  const a = { statusType: 'DefenseDown', elements: ['Dark'], exitCond: 'Turn' };
  const b = { statusType: 'DefenseDown', elements: ['Dark'], exitCond: 'Turn' };
  assert.equal(
    buildCompetitionGroupKey(a),
    buildCompetitionGroupKey(b),
  );
});

// ============================================================
// readEffectPower / compareByPowerDesc
// ============================================================

test('readEffectPower handles various inputs', () => {
  assert.equal(readEffectPower({ power: 0.5 }), 0.5);
  assert.equal(readEffectPower({ power: 0 }), 0);
  assert.equal(readEffectPower({}), 0);
  assert.equal(readEffectPower(null), 0);
  assert.equal(readEffectPower({ power: NaN }), 0);
});

test('compareByPowerDesc sorts by power desc then remaining desc then effectId asc', () => {
  const effects = [
    { power: 0.3, remaining: 2, effectId: 10 },
    { power: 0.5, remaining: 1, effectId: 20 },
    { power: 0.5, remaining: 3, effectId: 5 },
    { power: 0.3, remaining: 2, effectId: 1 },
  ];
  const sorted = effects.slice().sort(compareByPowerDesc);
  assert.deepEqual(sorted.map((e) => e.effectId), [5, 20, 1, 10]);
});

// ============================================================
// resolveAdoptionStatus — Default limitType (上限2)
// ============================================================

test('resolveAdoptionStatus adopts up to 2 Default effects per group', () => {
  const effects = [
    { statusType: 'Fragile', power: 0.4, remaining: 2, exitCond: 'Eternal', effectId: 1 },
    { statusType: 'Fragile', power: 0.4, remaining: 2, exitCond: 'Eternal', effectId: 2 },
  ];
  const result = resolveAdoptionStatus(effects);
  assert.equal(result.length, 2);
  // グループ上限2件、2件以下なら全て採用
  assert.ok(result.every((e) => e._adopted === true));
});

test('resolveAdoptionStatus caps Default effects at 2 per group (drops lowest power)', () => {
  const effects = [
    { statusType: 'ResistDown', elements: ['Dark'], power: 0.6, exitCond: 'Eternal', effectId: 1 },
    { statusType: 'ResistDown', elements: ['Dark'], power: 0.6, exitCond: 'Eternal', effectId: 2 },
    { statusType: 'ResistDown', elements: ['Dark'], power: 0.6, exitCond: 'Eternal', effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // 3件中 上限2件のみ採用（同power → effectId昇順）
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [1, 2]);
});

test('resolveAdoptionStatus matches Fragile 2+2 scenario (Eternal + finite = 4 adopted)', () => {
  const effects = [
    { statusType: 'Fragile', power: 0.4, exitCond: 'Eternal', effectId: 1 },
    { statusType: 'Fragile', power: 0.4, exitCond: 'Eternal', effectId: 2 },
    { statusType: 'Fragile', power: 0.35, remaining: 2, exitCond: 'Turn', effectId: 3 },
    { statusType: 'Fragile', power: 0.35, remaining: 2, exitCond: 'Turn', effectId: 4 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Eternal 2 + finite 2 = 4 件全て有効
  assert.equal(adopted.length, 4);
});

// ============================================================
// resolveAdoptionStatus — Only competition
// ============================================================

test('resolveAdoptionStatus adopts only top-1 for Only limitType', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Only', power: 0.3, remaining: 2, exitCond: 'Turn', effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.5, remaining: 2, exitCond: 'Turn', effectId: 2 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.4, remaining: 2, exitCond: 'Turn', effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  assert.equal(result.filter((e) => e._adopted).length, 1);
  assert.equal(result.find((e) => e._adopted).effectId, 2);
});

// ============================================================
// resolveAdoptionStatus — Count limitType (Default と同じ上限2)
// ============================================================

test('resolveAdoptionStatus adopts top-2 for Count limitType', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.2, remaining: 2, effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.3, remaining: 2, effectId: 2 },
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.1, remaining: 2, effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [1, 2]);
});

// ============================================================
// resolveAdoptionStatus — Only vs 非Only バケット比較
// ============================================================

test('resolveAdoptionStatus prefers Only side on tie (Turn is not consumed)', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.2, remaining: 2, effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.2, remaining: 2, effectId: 2 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.4, remaining: 2, exitCond: 'Turn', effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Count 合計 (0.2+0.2=0.4) == Only (0.4) → tie → Only 側を採用
  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].effectId, 3);
});

test('resolveAdoptionStatus adopts Count side when sum exceeds Only', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.5, remaining: 2, effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.4, remaining: 2, effectId: 2 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.5, remaining: 2, exitCond: 'Turn', effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Count 合計 (0.5+0.4=0.9) > Only (0.5) → Count 側 2 件を採用
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [1, 2]);
});

test('resolveAdoptionStatus adopts Only side when Only power exceeds Count sum', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.2, remaining: 2, effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.1, remaining: 2, effectId: 2 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.5, remaining: 2, exitCond: 'Turn', effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Only (0.5) > Count 合計 (0.2+0.1=0.3) → Only 側 1 件を採用
  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].effectId, 3);
});

test('resolveAdoptionStatus adopts single non-Only when Only is weaker', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Count', exitCond: 'Count', power: 0.5, remaining: 2, effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.3, remaining: 2, exitCond: 'Turn', effectId: 2 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // 非Only (0.5) > Only (0.3) → 非Only 側（Count 1 件のみ）
  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].effectId, 1);
});

// ============================================================
// resolveAdoptionStatus — elements で別グループ（修正の核心）
// ============================================================

test('resolveAdoptionStatus separates competition by elements', () => {
  const effects = [
    // 闇防御力ダウン (Only) — 闇グループ
    { statusType: 'DefenseDown', elements: ['Dark'], limitType: 'Only', power: 0.4, remaining: 2, exitCond: 'Eternal', effectId: 1 },
    { statusType: 'DefenseDown', elements: ['Dark'], limitType: 'Only', power: 0.3, remaining: 2, exitCond: 'Eternal', effectId: 2 },
    // 防御力ダウン (Only) — 無属性グループ
    { statusType: 'DefenseDown', limitType: 'Only', power: 0.5, remaining: 2, exitCond: 'Eternal', effectId: 3 },
    { statusType: 'DefenseDown', limitType: 'Only', power: 0.3, remaining: 2, exitCond: 'Eternal', effectId: 4 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // 闇グループ: Only → effectId=1 (power=0.4) のみ採用
  // 無属性グループ: Only → effectId=3 (power=0.5) のみ採用
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [1, 3]);
});

test('resolveAdoptionStatus separates competition by duration group', () => {
  const effects = [
    // Eternal グループ (Only) — 1件のみ採用
    { statusType: 'ResistDown', elements: ['Dark'], limitType: 'Only', power: 0.6, exitCond: 'Eternal', effectId: 1 },
    { statusType: 'ResistDown', elements: ['Dark'], limitType: 'Only', power: 0.6, exitCond: 'Eternal', effectId: 2 },
    { statusType: 'ResistDown', elements: ['Dark'], limitType: 'Only', power: 0.6, exitCond: 'Eternal', effectId: 3 },
    // Finite グループ (Only) — 1件のみ採用
    { statusType: 'ResistDown', elements: ['Dark'], limitType: 'Only', power: 0.45, remaining: 2, exitCond: 'Turn', effectId: 4 },
    { statusType: 'ResistDown', elements: ['Dark'], limitType: 'Only', power: 0.3, remaining: 1, exitCond: 'Turn', effectId: 5 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Eternal: effectId=1 (同power → effectId昇順で先頭)
  // Finite: effectId=4 (power=0.45 > 0.3)
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [1, 4]);
});

// ============================================================
// resolveAdoptionStatus — ドキュメント §4 想定例の再現
// ============================================================

test('resolveAdoptionStatus matches §4 example (闇ResistDown Default × 3 Eternal → 上位2件)', () => {
  const effects = [
    { statusType: 'ResistDown', elements: ['Dark'], power: 0.6, exitCond: 'Eternal', effectId: 10 },
    { statusType: 'ResistDown', elements: ['Dark'], power: 0.6, exitCond: 'Eternal', effectId: 11 },
    { statusType: 'ResistDown', elements: ['Dark'], power: 0.6, exitCond: 'Eternal', effectId: 12 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Default → 上限2件、同power同remaining → effectId昇順
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [10, 11]);
});

test('resolveAdoptionStatus matches §4 example (無属性DefenseDown Count×3 finite)', () => {
  const effects = [
    { statusType: 'DefenseDown', limitType: 'Count', exitCond: 'Count', power: 0.45, remaining: 1, effectId: 20 },
    { statusType: 'DefenseDown', limitType: 'Count', exitCond: 'Count', power: 0.45, remaining: 1, effectId: 21 },
    { statusType: 'DefenseDown', limitType: 'Count', exitCond: 'Count', power: 0.3, remaining: 2, effectId: 22 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Count → 上位2件: effectId=20,21 (power=0.45)
  assert.equal(adopted.length, 2);
  assert.deepEqual(adopted.map((e) => e.effectId).sort(), [20, 21]);
});

// ============================================================
// resolveAdoptionStatus — Default + Only 混在
// ============================================================

test('resolveAdoptionStatus adopts Only side when Only power exceeds single Default', () => {
  const effects = [
    { statusType: 'AttackUp', power: 0.3, remaining: 2, exitCond: 'Turn', effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.5, remaining: 2, exitCond: 'Turn', effectId: 2 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.4, remaining: 2, exitCond: 'Turn', effectId: 3 },
  ];
  const result = resolveAdoptionStatus(effects);
  const adopted = result.filter((e) => e._adopted);
  // Only 側: best=0.5 / 非Only 側: Default 0.3 (上限2だが1件のみ) = 0.3
  // Only(0.5) > 非Only(0.3) → Only 側 1 件を採用
  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].effectId, 2);
});

// ============================================================
// selectAdoptedEffects
// ============================================================

test('selectAdoptedEffects returns only adopted effects', () => {
  const effects = [
    { statusType: 'AttackUp', limitType: 'Only', power: 0.5, remaining: 2, exitCond: 'Turn', effectId: 1 },
    { statusType: 'AttackUp', limitType: 'Only', power: 0.3, remaining: 2, exitCond: 'Turn', effectId: 2 },
  ];
  const result = selectAdoptedEffects(effects);
  assert.equal(result.length, 1);
  assert.equal(result[0].effectId, 1);
  assert.equal(result[0]._adopted, true);
});

test('selectAdoptedEffects returns empty array for empty input', () => {
  assert.deepEqual(selectAdoptedEffects([]), []);
  assert.deepEqual(selectAdoptedEffects(null), []);
});

// ============================================================
// 複合シナリオ: elements + duration + limitType
// ============================================================

test('resolveAdoptionStatus handles complex multi-group scenario', () => {
  const effects = [
    // 闇DefenseDown Eternal (Default) → 全採用
    { statusType: 'DefenseDown', elements: ['Dark'], power: 0.4, exitCond: 'Eternal', effectId: 1 },
    // 闇DefenseDown Finite (Default) → 全採用
    { statusType: 'DefenseDown', elements: ['Dark'], power: 0.45, remaining: 2, exitCond: 'Turn', effectId: 2 },
    // 無属性DefenseDown Eternal (Default) → 全採用
    { statusType: 'DefenseDown', power: 0.3, exitCond: 'Eternal', effectId: 3 },
    // 無属性DefenseDown Finite: Count×3, 上位2件のみ採用
    { statusType: 'DefenseDown', limitType: 'Count', exitCond: 'Count', power: 0.45, remaining: 1, effectId: 4 },
    { statusType: 'DefenseDown', limitType: 'Count', exitCond: 'Count', power: 0.45, remaining: 1, effectId: 5 },
    { statusType: 'DefenseDown', limitType: 'Count', exitCond: 'Count', power: 0.3, remaining: 2, effectId: 6 },
    // Fragile は別 statusType → 全て独立
    { statusType: 'Fragile', power: 0.4, exitCond: 'Eternal', effectId: 7 },
    { statusType: 'Fragile', power: 0.6, remaining: 1, exitCond: 'Turn', effectId: 8 },
  ];
  const result = resolveAdoptionStatus(effects);

  const check = (effectId, expectedAdopted) => {
    const entry = result.find((e) => e.effectId === effectId);
    assert.ok(entry, `effectId=${effectId} should exist`);
    assert.equal(entry._adopted, expectedAdopted, `effectId=${effectId} _adopted`);
  };

  check(1, true);  // 闇DefenseDown Eternal Default → adopted
  check(2, true);  // 闘DefenseDown Finite Default → adopted
  check(3, true);  // 無属性DefenseDown Eternal Default → adopted
  check(4, true);  // 無属性DefenseDown Finite Count top-1 → adopted
  check(5, true);  // 無属性DefenseDown Finite Count top-2 → adopted
  check(6, false); // 無属性DefenseDown Finite Count 3rd → NOT adopted
  check(7, true);  // Fragile Eternal → adopted
  check(8, true);  // Fragile Finite → adopted
});

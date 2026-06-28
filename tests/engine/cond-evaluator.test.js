import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateAst,
  evaluateCondition,
  evaluateCountBcValue,
  createEmptyContext,
  isFullyResolved,
  resolvePredicate,
} from '../../src/engine/cond-evaluator.js';
import { parseConditionOrThrow } from '../../src/engine/cond-parser.js';

// テスト用ヘルパ: member を任意の上書きで作る
function makeMember(overrides = {}) {
  return { ...createEmptyContext().member, ...overrides };
}

test('createEmptyContext: 全フィールドに安全なデフォルトを与える', () => {
  const ctx = createEmptyContext();
  assert.equal(typeof ctx.state, 'object');
  assert.equal(typeof ctx.member, 'object');
  assert.equal(typeof ctx.skill, 'object');
  assert.equal(Array.isArray(ctx.party), true);
  assert.equal(Array.isArray(ctx.enemies), true);
});

test('createEmptyContext: 上書き可能', () => {
  const ctx = createEmptyContext({ state: { turnIndex: 5 } });
  assert.equal(ctx.state.turnIndex, 5);
});

test('evaluateCondition: 空式は常に true', () => {
  assert.equal(evaluateCondition('', createEmptyContext()).result, true);
  assert.equal(evaluateCondition('   ', createEmptyContext()).result, true);
});

test('evaluateCondition: Sp() 比較', () => {
  const ctx = createEmptyContext({ member: makeMember({ sp: { current: 25 } }) });
  assert.equal(evaluateCondition('Sp()>19', ctx).result, true);
  assert.equal(evaluateCondition('Sp()>30', ctx).result, false);
  assert.equal(evaluateCondition('Sp()==25', ctx).result, true);
});

test('evaluateCondition: IsFront() position 判定', () => {
  assert.equal(evaluateCondition('IsFront()', createEmptyContext({ member: makeMember({ position: 1 }) })).result, true);
  assert.equal(evaluateCondition('IsFront()', createEmptyContext({ member: makeMember({ position: 2 }) })).result, true);
  assert.equal(evaluateCondition('IsFront()', createEmptyContext({ member: makeMember({ position: 3 }) })).result, false);
});

test('evaluateCondition: IsTeam() 判定', () => {
  const ctx = createEmptyContext({ member: makeMember({ team: '31A' }) });
  assert.equal(evaluateCondition('IsTeam(31A)', ctx).result, true);
  assert.equal(evaluateCondition('IsTeam(31B)', ctx).result, false);
});

test('evaluateCondition: DpRate() 比較（小数）', () => {
  const ctx = createEmptyContext({ member: makeMember({ dpRate: 0.3 }) });
  assert.equal(evaluateCondition('DpRate()<=0.5', ctx).result, true);
  assert.equal(evaluateCondition('DpRate()>=0.8', ctx).result, false);
});

test('evaluateCondition: && 結合', () => {
  const ctx = createEmptyContext({
    member: makeMember({ position: 1, role: 'Attacker' }),
  });
  assert.equal(evaluateCondition('IsFront() && IsAttacker()', ctx).result, true);
  assert.equal(evaluateCondition('IsFront() && IsBreaker()', ctx).result, false);
});

test('evaluateCondition: || 結合', () => {
  const ctx = createEmptyContext({ state: { zone: 'Fire' } });
  assert.equal(evaluateCondition('IsZone(Ice)==1 || IsZone(Fire)==1', ctx).result, true);
  assert.equal(evaluateCondition('IsZone(Ice)==1 || IsZone(Thunder)==1', ctx).result, false);
});

test('evaluateCondition: SpecialStatusCountByType で BuffCharge(IsCharging) 判定', () => {
  const ctx = createEmptyContext({
    member: makeMember({ specialStatuses: new Map([[25, 1]]) }),
  });
  assert.equal(evaluateCondition('IsCharging()', ctx).result, true);
  assert.equal(evaluateCondition('SpecialStatusCountByType(25)>0', ctx).result, true);
});

test('evaluateCondition: ConsumeSp() でスキルコスト参照', () => {
  const ctx = createEmptyContext({ skill: { label: 'X', tier: 'SS', spCost: 10 } });
  assert.equal(evaluateCondition('ConsumeSp()<=8', ctx).result, false);
  assert.equal(evaluateCondition('ConsumeSp()<=10', ctx).result, true);
});
test('evaluateCondition: ConsumeSp() でスキルコスト参照', () => {
  const ctx = createEmptyContext({ skill: { label: 'X', tier: 'SS', spCost: 10 } });
  assert.equal(evaluateCondition('ConsumeSp()<=8', ctx).result, false);
  assert.equal(evaluateCondition('ConsumeSp()<=10', ctx).result, true);
});

test('evaluateCondition: CountBC は party/enemies 全体を反復して真の数を数える', () => {
  const ctx = createEmptyContext({
    party: [
      makeMember({ isPlayer: true, team: '31A' }),
      makeMember({ isPlayer: true, team: '31A' }),
      makeMember({ isPlayer: true, team: '31B' }),
    ],
  });
  assert.equal(evaluateCondition('CountBC(IsPlayer() &&IsTeam(31A)==1)>=2', ctx).result, true);
  assert.equal(evaluateCondition('CountBC(IsPlayer() &&IsTeam(31A)==1)>=3', ctx).result, false);
  assert.deepEqual(evaluateCountBcValue('CountBC(IsPlayer() &&IsTeam(31A)==1)>=3', ctx), {
    known: true,
    value: 2,
  });
});

test('evaluateCondition: CountBC 内側式に player/enemy 区別を含む複雑条件', () => {
  const ctx = createEmptyContext({
    party: [makeMember({ isPlayer: true, characterId: 'RKayamori', motivation: { current: 5 } })],
    enemies: [],
  });
  const expr = 'CountBC(IsPlayer() == 1 && IsCharacter(RKayamori) == 1 && MotivationLevel() == 5)>0';
  assert.equal(evaluateCondition(expr, ctx).result, true);
});

test('evaluateCondition: PlayedSkillCount は member.getSkillUseCountByLabel を参照', () => {
  const ctx = createEmptyContext({
    member: makeMember({ getSkillUseCountByLabel: (l) => (l === 'TestSkill' ? 3 : 0) }),
  });
  assert.equal(evaluateCondition('PlayedSkillCount(TestSkill)>=1', ctx).result, true);
  assert.equal(evaluateCondition('PlayedSkillCount(OtherSkill)==0', ctx).result, true);
});

test('evaluateCondition: 実データ式 "0.0<DpRate()" を評価', () => {
  assert.equal(evaluateCondition('0.0<DpRate()', createEmptyContext({ member: makeMember({ dpRate: 0.3 }) })).result, true);
  assert.equal(evaluateCondition('0.0<DpRate()', createEmptyContext({ member: makeMember({ dpRate: 0.0 }) })).result, false);
});

test('evaluateCondition: 実データ式 "-0" と DpRate()==0.0 の組合せ', () => {
  // -0 === 0 なので >-0 は >0 と同義。dpRate=0.0 の player が1人いれば count=1 > 0 = true
  const ctx = createEmptyContext({
    party: [makeMember({ isPlayer: true, dpRate: 0.0 })],
  });
  assert.equal(evaluateCondition('CountBC(IsPlayer()==1&&DpRate()==0.0)>-0', ctx).result, true);
  // player がいない場合は count=0 > 0 = false
  assert.equal(evaluateCondition('CountBC(IsPlayer()==1&&DpRate()==0.0)>-0', createEmptyContext()).result, false);
});

test('evaluateCondition: 構文エラー時は ok:false で安全側 true', () => {
  const r = evaluateCondition('@invalid', createEmptyContext());
  assert.equal(r.ok, false);
  assert.equal(r.result, true);
  assert.ok(r.parseError.length > 0);
});

test('evaluateAst: AST を直接評価できる', () => {
  const ast = parseConditionOrThrow('IsFront()');
  const ctx = createEmptyContext({ member: makeMember({ position: 1 }) });
  assert.equal(evaluateAst(ast, ctx).result, true);
});

test('evaluateAst: trace 収集オプション', () => {
  const ast = parseConditionOrThrow('IsFront() && IsAttacker()');
  const ctx = createEmptyContext({ member: makeMember({ position: 1, role: 'Attacker' }) });
  const result = evaluateAst(ast, ctx, true);
  assert.equal(result.result, true);
  assert.equal(result.unknownCount, 0);
});

test('isFullyResolved: 全述語解決時は true', () => {
  const r = evaluateCondition('IsFront()', createEmptyContext({ member: makeMember({ position: 1 }) }));
  assert.equal(isFullyResolved(r), true);
});

test('resolvePredicate: 各 zero-arg 数値述語を直接解決', () => {
  const ctx = createEmptyContext({
    member: makeMember({ sp: { current: 5 }, ep: { current: 3 }, token: { current: 7 } }),
    state: { odGauge: 80, turnIndex: 4 },
    action: { breakHitCount: 2, removeDebuffCount: 1 },
  });
  assert.equal(resolvePredicate('Sp', [], ctx).value, 5);
  assert.equal(resolvePredicate('Ep', [], ctx).value, 3);
  assert.equal(resolvePredicate('Token', [], ctx).value, 7);
  assert.equal(resolvePredicate('OverDriveGauge', [], ctx).value, 80);
  assert.equal(resolvePredicate('Turn', [], ctx).value, 4);
  assert.equal(resolvePredicate('BreakHitCount', [], ctx).value, 2);
  assert.equal(resolvePredicate('RemoveDebuffCount', [], ctx).value, 1);
});

test('resolvePredicate: 各 boolean zero-arg 述語を 0/1 で解決', () => {
  const ctx = createEmptyContext({
    member: makeMember({ position: 1, role: 'Attacker', isReinforcedMode: true, isAlive: true }),
    state: { isOverDrive: true, talismanActive: true },
  });
  assert.equal(resolvePredicate('IsFront', [], ctx).value, 1);
  assert.equal(resolvePredicate('IsAttacker', [], ctx).value, 1);
  assert.equal(resolvePredicate('IsOverDrive', [], ctx).value, 1);
  assert.equal(resolvePredicate('IsTalisman', [], ctx).value, 1);
  assert.equal(evaluateCondition('IsTalisman()', ctx).result, true);
  assert.equal(resolvePredicate('IsReinforcedMode', [], ctx).value, 1);
  assert.equal(resolvePredicate('IsDead', [], ctx).value, 0);
});

test('resolvePredicate: one-arg 述語', () => {
  const ctx = createEmptyContext({
    member: makeMember({ characterId: 'RKayamori', team: '31A', elements: ['Fire'] }),
    state: { zone: 'Fire' },
  });
  assert.equal(resolvePredicate('IsCharacter', [{ value: 'RKayamori' }], ctx).value, 1);
  assert.equal(resolvePredicate('IsCharacter', [{ value: 'Other' }], ctx).value, 0);
  assert.equal(resolvePredicate('IsTeam', [{ value: '31A' }], ctx).value, 1);
  assert.equal(resolvePredicate('IsZone', [{ value: 'Fire' }], ctx).value, 1);
  assert.equal(resolvePredicate('IsNatureElement', [{ value: 'Fire' }], ctx).value, 1);
  assert.equal(resolvePredicate('IsNatureElement', [{ value: 'Ice' }], ctx).value, 0);
});

test('resolvePredicate: MarkLevel 述語', () => {
  const ctx = createEmptyContext({
    member: makeMember({ markStates: { Fire: { current: 4 } } }),
  });
  assert.equal(resolvePredicate('FireMarkLevel', [], ctx).value, 4);
  assert.equal(resolvePredicate('IceMarkLevel', [], ctx).value, 0);
});

test('resolvePredicate: SpecialStatusCountByType', () => {
  const ctx = createEmptyContext({
    member: makeMember({ specialStatuses: new Map([[172, 1]]) }),
  });
  assert.equal(resolvePredicate('SpecialStatusCountByType', [{ value: '172' }], ctx).value, 1);
  assert.equal(resolvePredicate('SpecialStatusCountByType', [{ value: '3' }], ctx).value, 0);
});

test('resolvePredicate: HasSkill は member.hasSkill 関数で 0/1 解決', () => {
  const ctxWithFn = createEmptyContext({
    member: makeMember({ hasSkill: (l) => l === 'Owned' }),
  });
  assert.equal(resolvePredicate('HasSkill', [{ value: 'Owned' }], ctxWithFn).value, 1);
  assert.equal(resolvePredicate('HasSkill', [{ value: 'Missing' }], ctxWithFn).value, 0);
});

test('resolvePredicate: HasSkill は member.hasSkill 未定義時 safe-side fallback', () => {
  // hasSkill 関数を持たない member を明示的に作成
  const ctx = createEmptyContext({
    member: { ...makeMember(), hasSkill: undefined },
  });
  const r = resolvePredicate('HasSkill', [{ value: 'X' }], ctx);
  assert.equal(r.known, false);
});

test('resolvePredicate: unknown 述語は safe-side {known:false}', () => {
  const ctx = createEmptyContext();
  const r = resolvePredicate('TotallyUnknownPredicate', [], ctx);
  assert.equal(r.known, false);
  assert.equal(r.value, 1);
});

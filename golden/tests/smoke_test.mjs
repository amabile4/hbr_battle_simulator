import { parseCondition, stringifyAst, extractFunctionNames } from '../src/cond-parser.js';
import {
  evaluateCondition,
  evaluateAst,
  createEmptyContext,
  isFullyResolved,
} from '../src/cond-evaluator.js';
import {
  getSpecialStatusName,
  DEFAULT_SPECIAL_STATUS_TYPES,
} from '../src/special-status-types.js';

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`  FAIL: ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}

// === Parser tests ===
console.log('--- Parser ---');

check('empty -> literal true',
  parseCondition('').ast,
  { type: 'literal', value: true });

check('IsOverDrive() parses',
  parseCondition('IsOverDrive()').ast.type, 'call');

check('Sp()>19 parses',
  parseCondition('Sp()>19').ast.type, 'compare');

check('CountBC nested parses',
  parseCondition('CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0').ast.type,
  'countBc');

check('OR chain parses',
  parseCondition('IsZone(Fire)==1 || IsZone(Ice)==1').ast.type, 'or');

check('31A arg parses (digit-leading ident)',
  parseCondition('IsTeam(31A)==1').ast.left.args[0].value, '31A');

check('reverse comparison 0.0<DpRate()',
  parseCondition('0.0<DpRate()').ast.left.value, 0.0);

check('negative number >-0',
  parseCondition('CountBC(IsPlayer()==1&&DpRate()==0.0)>-0').ast.rhs.value, -0);

// === Evaluator tests ===
console.log('--- Evaluator ---');

const ctx = createEmptyContext({
  member: {
    ...createEmptyContext().member,
    sp: { current: 25 },
    dpRate: 0.3,
    position: 1,
    role: 'Attacker',
    team: '31A',
    characterId: 'RKayamori',
    elements: ['Fire'],
    isPlayer: true,
    specialStatuses: new Map([[25, 1], [155, 2]]),
    getSkillUseCountByLabel: (l) => l === 'TestSkill' ? 3 : 0,
  },
  skill: { label: 'TestSkill', tier: 'SS', spCost: 10, isNormalAttack: false },
  state: { turnIndex: 3, odGauge: 50, zone: 'Fire', isOverDrive: true },
});

check('Sp()>19 -> true (sp=25)',
  evaluateCondition('Sp()>19', ctx).result, true);

check('Sp()>30 -> false (sp=25)',
  evaluateCondition('Sp()>30', ctx).result, false);

check('IsFront() -> true (pos=1)',
  evaluateCondition('IsFront()', ctx).result, true);

check('IsOverDrive() -> true',
  evaluateCondition('IsOverDrive()', ctx).result, true);

check('IsTeam(31A) -> true',
  evaluateCondition('IsTeam(31A)', ctx).result, true);

check('IsTeam(31B) -> false',
  evaluateCondition('IsTeam(31B)', ctx).result, false);

check('DpRate()<=0.5 -> true (0.3)',
  evaluateCondition('DpRate()<=0.5', ctx).result, true);

check('IsAttacker() -> true',
  evaluateCondition('IsAttacker()', ctx).result, true);

check('IsCharging() -> true (status 25)',
  evaluateCondition('IsCharging()', ctx).result, true);

check('SpecialStatusCountByType(155)>=2 -> true',
  evaluateCondition('SpecialStatusCountByType(155)>=2', ctx).result, true);

check('PlayedSkillCount(TestSkill)>=1 -> true',
  evaluateCondition('PlayedSkillCount(TestSkill)>=1', ctx).result, true);

check('AND: IsFront() && IsAttacker() -> true',
  evaluateCondition('IsFront() && IsAttacker()', ctx).result, true);

check('OR: IsZone(Ice)==1 || IsZone(Fire)==1 -> true',
  evaluateCondition('IsZone(Ice)==1 || IsZone(Fire)==1', ctx).result, true);

check('ConsumeSp()<=8 -> false (spCost=10)',
  evaluateCondition('ConsumeSp()<=8', ctx).result, false);

check('fully resolved (no unknown)',
  isFullyResolved(evaluateCondition('IsFront() && IsAttacker()', ctx)), true);

// CountBC test
const ctx2 = createEmptyContext({
  party: [
    { ...createEmptyContext().member, isPlayer: true, position: 1, team: '31A' },
    { ...createEmptyContext().member, isPlayer: true, position: 2, team: '31A' },
    { ...createEmptyContext().member, isPlayer: true, position: 3, team: '31B' },
  ],
  enemies: [],
});
check('CountBC(IsPlayer()&&IsTeam(31A)==1)>=2 -> true (2 players in 31A)',
  evaluateCondition('CountBC(IsPlayer() &&IsTeam(31A)==1)>=2', ctx2).result, true);

check('CountBC(IsPlayer()&&IsTeam(31A)==1)>=3 -> false (only 2)',
  evaluateCondition('CountBC(IsPlayer() &&IsTeam(31A)==1)>=3', ctx2).result, false);

// === Special status types tests ===
console.log('--- Special Status Types ---');
check('172 = SuperBreakDown', getSpecialStatusName(172), 'SuperBreakDown');
check('3 = DefenseDown', getSpecialStatusName(3), 'DefenseDown');
check('22 = Fragile', getSpecialStatusName(22), 'Fragile');
check('20 = AdditionalTurn', getSpecialStatusName(20), 'AdditionalTurn');
check('79 = Restraint (corrected)', getSpecialStatusName(79), 'Restraint');
check('146 = NegativeMind (corrected)', getSpecialStatusName(146), 'NegativeMind');
check('9999 fallback', getSpecialStatusName(9999), 'UnknownSpecialStatus_9999');
check('total default types >= 20', Object.keys(DEFAULT_SPECIAL_STATUS_TYPES).length >= 20, true);

console.log(`\n=== ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);

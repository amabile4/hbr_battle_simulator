/**
 * HPダメージガイド導出（討伐予測・T4残）テスト
 *
 * 方針（DP版 tests/ui-next-dp-damage-guide.test.js と同型）:
 * - TurnEngineManager に damageCalculationData を注入すると、commit/recalculate 時に
 *   各アクションへ perHitHpDamageByEnemy（派生値）が付与され、エンジンの
 *   applyEnemyHpFromActions が HP を累積消費し、HP0 で自動討伐（source:'auto' の Dead）する。
 * - HPダメージは破壊率（destructionRate）が乗算される（DPは乗算除外）。
 * - extra HP gauge（多段ゲージ）搭載敵は現在セグメントHPを累積消費し、
 *   0到達で自動HP破壊（source:'auto' の HpBreak）する。
 * - 手動 kill（actionOutcomeOverrides）が最優先。
 * - データ未注入時は従来挙動（HP消費なし）を維持する。
 * - 派生値は replayScript（保存JSON）に混入しない。
 * - recalculateFrom(0) で同一結果が再導出される（決定性）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { resolveDefaultStats } from '../src/domain/damage-calculator-input-builder.js';
import { normalizeCharacterStats, resolveStatsWithSupport } from '../src/domain/character-stats.js';
import { resolvePerHitHpDamageByEnemy } from '../src/domain/action-hp-damage.js';
import { REPLAY_OPERATION_TYPES } from '../src/ui/lightweight-replay-script.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const ATTACK_SKILL_ID = 9901;
const PENETRATION_SKILL_ID = 9903;
const ATTACK_SKILL_POWER = 3001;
const ATTACK_SKILL_HIT_COUNT = 3;

function createAttackSkill() {
  return {
    id: ATTACK_SKILL_ID,
    name: 'SlashAttack',
    label: 'SlashAttack9901',
    sp_cost: 0,
    cond: '',
    target_type: 'Single',
    hitCount: ATTACK_SKILL_HIT_COUNT,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', power: [ATTACK_SKILL_POWER] }],
  };
}

function createProtectionSkill(id = 9902) {
  return {
    id,
    name: 'Protection',
    label: `Protection${id}`,
    sp_cost: 0,
    cond: '',
    target_type: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

function createPenetrationCriticalSkill() {
  return {
    id: PENETRATION_SKILL_ID,
    name: 'PenetrationCritical',
    label: 'PenetrationCritical9903',
    sp_cost: 0,
    cond: '',
    target_type: 'Single',
    hitCount: ATTACK_SKILL_HIT_COUNT,
    parts: [
      {
        skill_type: 'PenetrationCriticalAttack',
        target_type: 'Single',
        type: 'Slash',
        power: [ATTACK_SKILL_POWER],
        value: [3, 0],
      },
    ],
  };
}

// calculateDamage が参照する最小データセット
const DAMAGE_DATA = {
  styles: [{ id: 9100, role: 'Attacker' }],
  characters: [],
  enemies: [],
  skills: [createAttackSkill(), createPenetrationCriticalSkill()],
};

function createInitialState({
  enemyHp = 1_000_000_000,
  enemyDp = 0,
  destructionRatePercent = 100,
  extraHpGauge = null,
} = {}) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const skills = index === 0
      ? [createAttackSkill(), createPenetrationCriticalSkill(), createProtectionSkill()]
      : [createProtectionSkill(9200 + index)];
    return new CharacterStyle({
      characterId: `TM${index + 1}`,
      characterName: `TM${index + 1}`,
      styleId: 9100 + index,
      styleName: `TS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills,
      passives: [],
    });
  });
  const state = createBattleStateFromParty(new Party(members));
  const enemyState = state.turnState.enemyState;
  enemyState.enemyCount = 1;
  enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  enemyState.damageRatesByEnemy = {
    0: { Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100, Thunder: 100, Light: 100, Dark: 100, Nonelement: 100 },
  };
  enemyState.absorbElementsByEnemy = { 0: [] };
  enemyState.odRateByEnemy = { 0: 0 };
  enemyState.paramBorderByEnemy = { 0: 620 };
  enemyState.enemyDpByEnemy = { 0: enemyDp };
  enemyState.enemyHpByEnemy = { 0: enemyHp };
  enemyState.destructionRateByEnemy = { 0: destructionRatePercent };
  enemyState.destructionRateCapByEnemy = { 0: 300 };
  enemyState.breakStateByEnemy = {};
  enemyState.statuses = [];
  if (extraHpGauge) {
    enemyState.extraHpGaugeStateByEnemy = { 0: extraHpGauge };
  }
  return state;
}

function commitAttackTurn(manager, options = {}) {
  return manager.commitNextTurn(
    { 0: { skillId: ATTACK_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'attack', ...options }
  );
}

function commitPenetrationCriticalTurn(manager, options = {}) {
  return manager.commitNextTurn(
    { 0: { skillId: PENETRATION_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'penetration critical', ...options }
  );
}

function getRemainingHp(manager, turnIndex, enemyKey = '0') {
  return manager.computedStates[turnIndex]?.turnState?.enemyState?.remainingHpByEnemy?.[enemyKey];
}

function buildAttackerInputForMember(member) {
  const role = String(member?.role ?? 'Attacker');
  const limitBreakCount = Number(member?.limitBreakLevel ?? 0);
  const stats =
    normalizeCharacterStats(member?.stats) ??
    resolveStatsWithSupport(resolveDefaultStats(role, limitBreakCount), member?.supportStats);
  return { role, limitBreakCount, ...stats };
}

function enemyHasDeadStatus(manager, turnIndex, enemyIndex = 0) {
  const statuses = manager.computedStates[turnIndex]?.turnState?.enemyState?.statuses ?? [];
  return statuses.some(
    (status) =>
      Number(status?.targetIndex ?? status?.enemyIndex ?? -1) === enemyIndex &&
      /^dead$/i.test(String(status?.statusType ?? ''))
  );
}

function collectDeadEvents(record) {
  const events = [];
  for (const action of record?.actions ?? []) {
    for (const change of action?.enemyStatusChanges ?? []) {
      if (/^dead$/i.test(String(change?.statusType ?? '')) || String(change?.mode ?? '') === 'Dead') {
        events.push(change);
      }
    }
  }
  return events;
}

function collectHpBreakEvents(record) {
  const events = [];
  for (const action of record?.actions ?? []) {
    for (const change of action?.enemyStatusChanges ?? []) {
      if (/^hpbreak$/i.test(String(change?.statusType ?? '')) || String(change?.mode ?? '') === 'HpBreak') {
        events.push(change);
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// テスト 1: データ注入時に HP がアクションで消費される
// ---------------------------------------------------------------------------

test('hp damage guide: injected damageCalculationData consumes enemy HP on commit', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  const record = commitAttackTurn(manager);

  const remaining = getRemainingHp(manager, 0);
  assert.ok(Number.isFinite(remaining), 'remainingHpByEnemy[0] が数値であること');
  assert.ok(
    remaining < 1_000_000_000,
    `HPが消費されていること (remaining=${remaining})`
  );
  assert.ok(remaining > 0, '大HPの敵はこの1撃で討伐されないこと');
  assert.equal(enemyHasDeadStatus(manager, 0), false, 'Dead 状態が付与されないこと');
  const action = record.actions.find((entry) => entry.skillId === ATTACK_SKILL_ID);
  assert.equal(action?.perHitHpDamageByEnemy?.['0'], 1000, 'per-hit HP は floor(total / hitCount) であること');
  assert.equal(action?.totalHpDamageByEnemy?.['0'], 3001, 'exact total HP が派生値として保持されること');
  assert.equal(
    1_000_000_000 - remaining,
    3001,
    'HP消費は per-hit×hitCount ではなく exact total を使用すること'
  );
});

// ---------------------------------------------------------------------------
// テスト 2: データ未注入時は従来挙動（HP消費なし）
// ---------------------------------------------------------------------------

test('hp damage guide: without damageCalculationData HP is not consumed (backward compat)', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {});

  commitAttackTurn(manager);

  const remaining = getRemainingHp(manager, 0);
  assert.ok(
    remaining === undefined || remaining === 1_000_000_000,
    `データ未注入時は remainingHp が消費されないこと (remaining=${remaining})`
  );
  assert.equal(enemyHasDeadStatus(manager, 0), false, 'Dead 状態が付与されないこと');
});

// ---------------------------------------------------------------------------
// テスト 3: HP0 到達で自動討伐（source=auto の Dead イベント）
// ---------------------------------------------------------------------------

test('hp damage guide: HP depletion triggers auto kill with source auto', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  const record = commitAttackTurn(manager);

  assert.equal(getRemainingHp(manager, 0), 0, 'HP1の敵は1撃でHP0になること');
  assert.equal(enemyHasDeadStatus(manager, 0), true, 'HP0到達で Dead 状態が付与されること');
  const deadEvents = collectDeadEvents(record);
  assert.equal(deadEvents.length, 1, 'Dead イベントが1件記録されること');
  assert.equal(String(deadEvents[0]?.source ?? ''), 'auto', 'Dead イベントの source が auto であること');
});

// ---------------------------------------------------------------------------
// テスト 4: 手動 kill 指定が最優先（auto の重複 Dead は出ない）
// ---------------------------------------------------------------------------

test('hp damage guide: manual kill override takes precedence over auto kill', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  const record = commitAttackTurn(manager, {
    actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
  });

  assert.equal(enemyHasDeadStatus(manager, 0), true, '手動指定で Dead 状態が付与されること');
  const deadEvents = collectDeadEvents(record);
  assert.equal(deadEvents.length, 1, 'Dead イベントは手動の1件のみであること（auto重複なし）');
  assert.equal(String(deadEvents[0]?.source ?? ''), 'manual', 'Dead イベントの source が manual であること');
});

// ---------------------------------------------------------------------------
// テスト 5: 破壊率がHPダメージに乗算される（DPは乗算除外・HPは乗算）
// ---------------------------------------------------------------------------

test('hp damage guide: destruction rate multiplies HP damage', () => {
  const managerBase = new TurnEngineManager();
  managerBase.initialize(
    createInitialState({ destructionRatePercent: 100 }),
    {},
    { damageCalculationData: DAMAGE_DATA }
  );
  commitAttackTurn(managerBase);
  const consumedBase = 1_000_000_000 - getRemainingHp(managerBase, 0);

  const managerBoosted = new TurnEngineManager();
  managerBoosted.initialize(
    createInitialState({ destructionRatePercent: 200 }),
    {},
    { damageCalculationData: DAMAGE_DATA }
  );
  commitAttackTurn(managerBoosted);
  const consumedBoosted = 1_000_000_000 - getRemainingHp(managerBoosted, 0);

  assert.ok(consumedBase > 0, `破壊率100%でもHPが消費されること (consumed=${consumedBase})`);
  assert.ok(
    consumedBoosted > consumedBase,
    `破壊率200%のHP消費(${consumedBoosted})が100%時(${consumedBase})より大きいこと`
  );
});

test('hp damage guide: penetration critical value is included in affinity rate', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  const record = commitPenetrationCriticalTurn(manager);
  const action = record.actions[0];

  assert.equal(
    action.damageContext?.effectiveDamageRatesByEnemy?.['0'],
    300,
    '貫通クリティカル value[0]=3 を相性倍率へ含めること'
  );
  assert.equal(
    action.damageContext?.affinityContributionsByEnemy?.['0']?.some(
      (entry) => entry.reference === 'PenetrationCriticalAttack' && Number(entry.multiplier) === 3
    ),
    true,
    '威力詳細用の相性内訳にも貫通クリティカル倍率が含まれること'
  );
  assert.ok(
    Number(action.totalHpDamageByEnemy?.['0'] ?? 0) > 0,
    '貫通クリティカルスキルでもHPダメージガイドが導出されること'
  );
});

// ---------------------------------------------------------------------------
// テスト 6: extra HP gauge（多段ゲージ）搭載敵も現在段階HPを累積消費する
// ---------------------------------------------------------------------------

test('hp damage guide: enemies with extra HP gauge consume current segment and auto HP break', () => {
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState({
      extraHpGauge: { total: 2, remaining: 2, values: [4_000, 100] },
    }),
    {},
    { damageCalculationData: DAMAGE_DATA }
  );

  const firstRecord = commitAttackTurn(manager);

  assert.equal(
    getRemainingHp(manager, 0),
    999,
    '多段ゲージ敵の現在段階HPが消費されること'
  );
  assert.deepEqual(
    manager.computedStates[0].turnState.enemyState.extraHpGaugeStateByEnemy['0'],
    { total: 2, remaining: 2, values: [4_000, 100] },
    'HP0未到達ならゲージ段階は進まないこと'
  );
  assert.equal(collectHpBreakEvents(firstRecord).length, 0, 'HP0未到達なら HpBreak イベントは出ないこと');

  const secondRecord = commitAttackTurn(manager);

  assert.equal(getRemainingHp(manager, 1), 100, 'HP破壊後は次の段階HPを保持すること');
  assert.deepEqual(
    manager.computedStates[1].turnState.enemyState.extraHpGaugeStateByEnemy['0'],
    { total: 2, remaining: 1, values: [4_000, 100] },
    '現在段階HP0到達でゲージ段階が進むこと'
  );
  const hpBreakEvents = collectHpBreakEvents(secondRecord);
  assert.equal(hpBreakEvents.length, 1, 'HpBreak イベントが1件記録されること');
  assert.equal(String(hpBreakEvents[0]?.source ?? ''), 'auto', 'HpBreak イベントの source が auto であること');
  assert.equal(enemyHasDeadStatus(manager, 1), false, 'HP破壊では自動討伐されないこと');
});

test('hp damage guide: manual HP break syncs remaining HP to next segment', () => {
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState({
      extraHpGauge: { total: 2, remaining: 2, values: [4_000, 100] },
    }),
    {},
    { damageCalculationData: DAMAGE_DATA }
  );

  const record = commitAttackTurn(manager, {
    actionOutcomeOverrides: [{ position: 0, outcome: 'HpBreak', enemyIndexes: [0] }],
  });

  const hpBreakEvents = collectHpBreakEvents(record);
  assert.equal(hpBreakEvents.length, 1, '手動 HpBreak イベントが1件記録されること');
  assert.equal(String(hpBreakEvents[0]?.source ?? ''), 'manual', 'HpBreak イベントの source が manual であること');
  assert.equal(getRemainingHp(manager, 0), 100, '手動HP破壊後は次の段階HPを保持すること');
  assert.deepEqual(
    manager.computedStates[0].turnState.enemyState.extraHpGaugeStateByEnemy['0'],
    { total: 2, remaining: 1, values: [4_000, 100] },
    '手動HP破壊でゲージ段階が進むこと'
  );
});

// ---------------------------------------------------------------------------
// テスト 7: recalculateFrom(0) の決定性
// ---------------------------------------------------------------------------

test('hp damage guide: recalculateFrom(0) reproduces identical HP consumption', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  commitAttackTurn(manager);

  const remainingTurn0 = getRemainingHp(manager, 0);
  const remainingTurn1 = getRemainingHp(manager, 1);
  assert.ok(remainingTurn1 < remainingTurn0, 'HP消費がターンをまたいで累積すること');

  manager.recalculateFrom(0);

  assert.equal(getRemainingHp(manager, 0), remainingTurn0, 'ターン0のHP残量が再計算で一致すること');
  assert.equal(getRemainingHp(manager, 1), remainingTurn1, 'ターン1のHP残量が再計算で一致すること');
});

// ---------------------------------------------------------------------------
// テスト 8: 派生値が replayScript（保存JSON）に混入しない
// ---------------------------------------------------------------------------

test('hp damage guide: perHitHpDamageByEnemy never leaks into serialized replayScript', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  commitAttackTurn(manager);

  const serialized = JSON.stringify(manager.replayScript);
  assert.equal(
    /perHitHpDamage|totalHpDamage/i.test(serialized),
    false,
    'replayScript に perHitHpDamageByEnemy / totalHpDamageByEnemy が含まれないこと'
  );
  assert.equal(
    /remainingHp/i.test(serialized),
    false,
    'replayScript に remainingHpByEnemy（計算結果）が含まれないこと'
  );
});

// ---------------------------------------------------------------------------
// テスト 9: setDamageCalculationData 後の recalculate で有効化
// ---------------------------------------------------------------------------

test('hp damage guide: setDamageCalculationData then recalculateFrom enables consumption', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {});

  commitAttackTurn(manager);
  const before = getRemainingHp(manager, 0);
  assert.ok(
    before === undefined || before === 1_000_000_000,
    '注入前はHP未消費'
  );

  manager.setDamageCalculationData(DAMAGE_DATA);
  manager.recalculateFrom(0);

  const remaining = getRemainingHp(manager, 0);
  assert.ok(remaining < 1_000_000_000, `注入+再計算後はHPが消費されること (remaining=${remaining})`);
});

// ---------------------------------------------------------------------------
// テスト 10: 自動討伐ガイドと召喚操作のターン差分を警告する
// ---------------------------------------------------------------------------

test('hp damage guide: warns when summon is later than auto kill guide', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  commitAttackTurn(manager);
  assert.equal(
    manager.addPendingSpecialOperation({
      type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
      payload: { enemyId: 7001, enemyName: 'Beta', targetEnemyIndex: 0 },
    }),
    true,
    '召喚 operation を pending に追加できること'
  );
  manager.commitNextTurn(
    { 0: { skillId: 9902 } },
    { enemyCount: 1 }
  );

  const diagnostics = manager.replayDiagnostics;
  assert.equal(diagnostics.turnWarnings[0]?.length ?? 0, 0, '自動ガイド側のターンには警告を出さないこと');
  assert.ok(
    diagnostics.turnWarnings[2]?.some((warning) => warning.includes('召喚操作が自動討伐ガイド #1 より後')),
    '後続の召喚操作ターンへ差分警告を出すこと'
  );

  const serialized = JSON.stringify(manager.replayScript);
  assert.equal(/自動討伐ガイド|召喚操作|turnWarnings|warning/i.test(serialized), false, '警告は replayScript に混入しないこと');
});

// ---------------------------------------------------------------------------
// テスト 11: 自動討伐ガイド直後の召喚は警告しない
// ---------------------------------------------------------------------------

test('hp damage guide: does not warn when summon follows auto kill guide on the next turn', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  assert.equal(
    manager.addPendingSpecialOperation({
      type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
      payload: { enemyId: 7001, enemyName: 'Beta', targetEnemyIndex: 0 },
    }),
    true,
    '召喚 operation を pending に追加できること'
  );
  manager.commitNextTurn(
    { 0: { skillId: 9902 } },
    { enemyCount: 1 }
  );

  const diagnostics = manager.replayDiagnostics;
  assert.equal(
    (diagnostics.turnWarnings ?? []).flat().some((warning) => warning.includes('召喚操作')),
    false,
    '自動討伐の次ターン召喚は整合済みとして扱うこと'
  );
});

test('hp damage guide resolver: 100 percent critical rate uses critical expected damage for guide totals', () => {
  const state = createInitialState();
  const manager = new TurnEngineManager();
  manager.initialize(state, {}, { damageCalculationData: DAMAGE_DATA });
  const record = commitAttackTurn(manager);
  const action = record.actions.find((entry) => entry.skillId === ATTACK_SKILL_ID);
  const actor = state.party.find((member) => member.characterId === action?.characterId);
  assert.ok(action?.damageContext);
  assert.ok(actor);

  const normalResult = resolvePerHitHpDamageByEnemy({
    damageContext: {
      ...action.damageContext,
      criticalRateBreakdown: { criticalRatePercent: 0, isCriticalGuaranteed: false, contributions: [] },
    },
    attackerInput: buildAttackerInputForMember(actor),
    enemyHpByEnemy: { 0: 1_000_000_000 },
    hitCount: ATTACK_SKILL_HIT_COUNT,
    data: DAMAGE_DATA,
  });
  const criticalResult = resolvePerHitHpDamageByEnemy({
    damageContext: {
      ...action.damageContext,
      criticalRateBreakdown: { criticalRatePercent: 100, isCriticalGuaranteed: false, contributions: [] },
    },
    attackerInput: buildAttackerInputForMember(actor),
    enemyHpByEnemy: { 0: 1_000_000_000 },
    hitCount: ATTACK_SKILL_HIT_COUNT,
    data: DAMAGE_DATA,
  });

  assert.equal(normalResult?.totalHpDamageByEnemy?.['0'], 3001, '非確定時は normal.expected を使うこと');
  assert.ok(
    Number(criticalResult?.totalHpDamageByEnemy?.['0']) > Number(normalResult?.totalHpDamageByEnemy?.['0']),
    'critical rate 100% 時は normal より大きい critical.expected を使うこと'
  );
});

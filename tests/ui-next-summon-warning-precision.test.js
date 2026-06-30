/**
 * T8 召喚警告の精度テスト
 *
 * 仕様:
 * - 召喚警告は payload.targetEnemyIndex と同一スロットの自動討伐ガイドのみと比較する
 *   （別スロットの討伐ガイドでは警告しない。targetEnemyIndex 未指定の召喚は警告対象外）
 * - 敵ごとの auto-kill ターンは「最初の1件」ではなく全リストと比較する
 *   （連戦で kill→summon→kill→summon が並んでも、各召喚が直前の討伐と整合していれば警告しない）
 * - 召喚が手動kill の直後ターンと整合する場合は召喚警告を出さない
 *   （ガイドとの乖離は手動kill警告側が担い、二重警告にしない）
 * - 手動Break/Kill 警告の比較先は「指定ターンより前で最も近い auto ターン」を表示する
 * - 召喚で敵が生き返った場合、remainingHpByEnemy は最大HPへ回復する（DP の回復ルールと対称）
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { REPLAY_OPERATION_TYPES } from '../src/ui/lightweight-replay-script.js';

const ATTACK_SKILL_ID = 9901;

function createAttackSkill() {
  return {
    id: ATTACK_SKILL_ID,
    name: 'SlashAttack',
    label: 'SlashAttack9901',
    sp_cost: 0,
    cond: '',
    target_type: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', power: [3000] }],
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

const DAMAGE_DATA = {
  styles: [{ id: 9100, role: 'Attacker' }],
  characters: [],
  enemies: [],
  skills: [createAttackSkill()],
};

const ELEMENT_RATES = {
  Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100,
  Thunder: 100, Light: 100, Dark: 100, Nonelement: 100,
};

function createInitialState({ enemyCount = 1, enemyHps = [1] } = {}) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const skills = index === 0
      ? [createAttackSkill(), createProtectionSkill()]
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
  enemyState.enemyCount = enemyCount;
  enemyState.enemyNamesByEnemy = {};
  enemyState.damageRatesByEnemy = {};
  enemyState.absorbElementsByEnemy = {};
  enemyState.odRateByEnemy = {};
  enemyState.paramBorderByEnemy = {};
  enemyState.enemyDpByEnemy = {};
  enemyState.enemyHpByEnemy = {};
  enemyState.destructionRateByEnemy = {};
  enemyState.destructionRateCapByEnemy = {};
  for (let i = 0; i < enemyCount; i += 1) {
    const key = String(i);
    enemyState.enemyNamesByEnemy[key] = `Enemy${i}`;
    enemyState.damageRatesByEnemy[key] = { ...ELEMENT_RATES };
    enemyState.absorbElementsByEnemy[key] = [];
    enemyState.odRateByEnemy[key] = 0;
    enemyState.paramBorderByEnemy[key] = 620;
    enemyState.enemyDpByEnemy[key] = 0;
    enemyState.enemyHpByEnemy[key] = Number(enemyHps[i] ?? 0);
    enemyState.destructionRateByEnemy[key] = 100;
    enemyState.destructionRateCapByEnemy[key] = 300;
  }
  enemyState.breakStateByEnemy = {};
  enemyState.statuses = [];
  return state;
}

function commitAttackTurn(manager, { enemyIndex = 0, enemyCount = 1, ...options } = {}) {
  return manager.commitNextTurn(
    { 0: { skillId: ATTACK_SKILL_ID, target: { type: 'enemy', enemyIndex } } },
    { enemyCount, note: 'attack', ...options }
  );
}

function commitProtectionTurn(manager, { enemyCount = 1, ...options } = {}) {
  return manager.commitNextTurn(
    { 0: { skillId: 9902 } },
    { enemyCount, note: 'protection', ...options }
  );
}

function addSummon(manager, targetEnemyIndex = null) {
  const added = manager.addPendingSpecialOperation({
    type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
    payload: {
      enemyId: 7001,
      enemyName: 'Summoned',
      od_rate: 0,
      max_d_rate: 300,
      ...(Number.isInteger(targetEnemyIndex) ? { targetEnemyIndex } : {}),
    },
  });
  assert.equal(added, true, '召喚 operation を pending に追加できること');
}

function summonWarnings(manager) {
  return (manager.replayDiagnostics.turnWarnings ?? [])
    .flat()
    .filter((warning) => warning.includes('召喚操作'));
}

// ---------------------------------------------------------------------------
// テスト 1: 別スロットへの召喚は討伐ガイドと比較しない
// ---------------------------------------------------------------------------

test('summon warning: summon targeting another slot does not warn about unrelated kill guide', () => {
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState({ enemyCount: 2, enemyHps: [1, 1_000_000_000] }),
    {},
    { damageCalculationData: DAMAGE_DATA }
  );

  // turn0: 敵0 が auto-kill される
  commitAttackTurn(manager, { enemyIndex: 0, enemyCount: 2 });
  commitProtectionTurn(manager, { enemyCount: 2 });
  // turn2: 敵1 スロットへの召喚（敵0 の討伐ガイドとは無関係）
  addSummon(manager, 1);
  commitProtectionTurn(manager, { enemyCount: 2 });

  assert.deepEqual(
    summonWarnings(manager),
    [],
    '別スロット(E2)への召喚は敵0の討伐ガイドと比較されないこと'
  );
});

// ---------------------------------------------------------------------------
// テスト 2: 連戦（kill→summon→kill→summon）は各召喚が整合していれば警告なし
// ---------------------------------------------------------------------------

test('summon warning: consecutive kill/summon chains stay consistent without warnings', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHps: [1] }), {}, { damageCalculationData: DAMAGE_DATA });

  // turn0: 敵0 auto-kill
  commitAttackTurn(manager);
  // turn1: 召喚（ガイド #1 の直後 = 整合）
  addSummon(manager, 0);
  commitProtectionTurn(manager);
  // turn2: 召喚された敵を再び auto-kill
  commitAttackTurn(manager);
  // turn3: 再召喚（ガイド #3 の直後 = 整合）
  addSummon(manager, 0);
  commitProtectionTurn(manager);

  assert.deepEqual(
    summonWarnings(manager),
    [],
    '各討伐の直後ターンの召喚は連戦でも警告されないこと'
  );
});

// ---------------------------------------------------------------------------
// テスト 3: 召喚で生き返った敵の remainingHp は最大HPへ回復する（DP対称）
// ---------------------------------------------------------------------------

test('summon warning: revived enemy restores remainingHp to max (DP-symmetric refill)', () => {
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState({ enemyHps: [1_000_000_000] }),
    {},
    { damageCalculationData: DAMAGE_DATA }
  );

  // turn0: 攻撃でHPを少し削る
  commitAttackTurn(manager);
  const consumed = manager.computedStates[0]?.turnState?.enemyState?.remainingHpByEnemy?.['0'];
  assert.ok(consumed < 1_000_000_000, '事前条件: HPが消費されていること');

  // turn1: 手動killで討伐 → turn2: 召喚 → turn3: 攻撃
  commitProtectionTurn(manager, {
    actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
  });
  addSummon(manager, 0);
  commitProtectionTurn(manager);
  commitAttackTurn(manager);

  const consumedAmount = 1_000_000_000 - consumed;
  const afterRevive = manager.computedStates[3]?.turnState?.enemyState?.remainingHpByEnemy?.['0'];
  assert.equal(
    afterRevive,
    1_000_000_000 - consumedAmount,
    `召喚後の敵は前の敵の消費を引き継がず、最大HPから消費が始まること (remaining=${afterRevive})`
  );
  // 召喚で Dead が解除され、攻撃が新しい敵に通っていること
  const statusesAfterSummon = manager.computedStates[2]?.turnState?.enemyState?.statuses ?? [];
  assert.equal(
    statusesAfterSummon.some((status) => /^dead$/i.test(String(status?.statusType ?? ''))),
    false,
    '召喚ターン後に Dead が解除されていること'
  );
});

// ---------------------------------------------------------------------------
// テスト 4: 手動killの直後ターンの召喚は警告しない（二重警告抑止）
// ---------------------------------------------------------------------------

test('summon warning: summon right after manual kill is not warned (manual-kill warning covers it)', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHps: [1] }), {}, { damageCalculationData: DAMAGE_DATA });

  // turn0: 敵0 auto-kill ガイド成立（HP1）だが手動killは turn1 に指定
  commitProtectionTurn(manager);
  commitAttackTurn(manager, {
    actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
  });
  // turn2: 手動kill の直後の召喚（操作履歴として整合）
  addSummon(manager, 0);
  commitProtectionTurn(manager);

  assert.deepEqual(
    summonWarnings(manager),
    [],
    '手動kill直後の召喚は警告されないこと'
  );
});

// ---------------------------------------------------------------------------
// テスト 5: targetEnemyIndex 未指定の召喚は警告対象外
// ---------------------------------------------------------------------------

test('summon warning: summon without targetEnemyIndex is not warned', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHps: [1] }), {}, { damageCalculationData: DAMAGE_DATA });

  commitAttackTurn(manager);
  commitProtectionTurn(manager);
  // turn2: スロット未指定の召喚（自動解決）— 関連付け不能のため警告しない
  addSummon(manager, null);
  commitProtectionTurn(manager);

  assert.deepEqual(
    summonWarnings(manager),
    [],
    'targetEnemyIndex 未指定の召喚は警告対象外であること'
  );
});

// ---------------------------------------------------------------------------
// テスト 6: 乖離した召喚は対象スロットを明記して警告する
// ---------------------------------------------------------------------------

test('summon warning: diverged summon warns once with the related slot', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHps: [1] }), {}, { damageCalculationData: DAMAGE_DATA });

  // turn0: auto-kill → turn1: 空走 → turn2: 召喚（ガイド #1 より後）
  commitAttackTurn(manager);
  commitProtectionTurn(manager);
  addSummon(manager, 0);
  commitProtectionTurn(manager);

  const warnings = summonWarnings(manager);
  assert.equal(warnings.length, 1, '乖離した召喚への警告は1件のみであること');
  assert.ok(
    warnings[0].includes('自動討伐ガイド #1 より後') && warnings[0].includes('E1'),
    `対象スロットとガイドターンが明記されること (${warnings[0]})`
  );
});

// ---------------------------------------------------------------------------
// テスト 7: 手動kill警告の比較先は直近の auto ターン
// ---------------------------------------------------------------------------

test('summon warning: manual kill warning references the nearest earlier auto kill turn', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyHps: [1] }), {}, { damageCalculationData: DAMAGE_DATA });

  // turn0: auto-kill(#1) → turn1: 召喚 → turn2: auto-kill(#3) → turn3: 召喚 → turn4: 手動kill
  commitAttackTurn(manager);
  addSummon(manager, 0);
  commitProtectionTurn(manager);
  commitAttackTurn(manager);
  addSummon(manager, 0);
  commitProtectionTurn(manager);
  commitProtectionTurn(manager, {
    actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
  });

  const killWarnings = (manager.replayDiagnostics.turnWarnings ?? [])
    .flat()
    .filter((warning) => warning.includes('手動討伐指定'));
  assert.equal(killWarnings.length, 1, '手動kill警告が1件出ること');
  assert.ok(
    killWarnings[0].includes('自動討伐ガイドは #3'),
    `直近の auto ターン(#3)が比較先になること（最初の#1ではなく） (${killWarnings[0]})`
  );
});

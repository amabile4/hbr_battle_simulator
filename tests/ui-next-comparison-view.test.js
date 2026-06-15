/**
 * 一時比較ビュー（T7）テスト
 *
 * 方針:
 * - buildComparisonComputedStates() は手動ブレイク/討伐指定（actionOutcomeOverrides）を
 *   一括無効化した「自動計算のみ」の推移を別バッファで導出する read-only API。
 * - replayScript / computedStates / computedRecords / pending を一切汚染しない。
 * - 戻り値はビュー状態であり、保存JSONに混入しない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CharacterStyle, Party, createBattleStateFromParty, loadDamageCalculationData } from '../src/index.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { getStore } from './helpers.js';

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

function createInitialState({ enemyDp = 0, enemyHp = 0 } = {}) {
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
  enemyState.destructionRateByEnemy = { 0: 100 };
  enemyState.destructionRateCapByEnemy = { 0: 300 };
  enemyState.breakStateByEnemy = {};
  enemyState.statuses = [];
  return state;
}

function enemyHasStatus(state, pattern, enemyIndex = 0) {
  const statuses = state?.turnState?.enemyState?.statuses ?? [];
  return statuses.some(
    (status) =>
      Number(status?.targetIndex ?? status?.enemyIndex ?? -1) === enemyIndex &&
      pattern.test(String(status?.statusType ?? ''))
  );
}

function getAutoBreakEvents(record) {
  return (record?.actions ?? [])
    .flatMap((action) => action.enemyStatusChanges ?? [])
    .filter(
      (change) =>
        String(change?.source ?? '') === 'auto' &&
        /downturn|break/i.test(String(change?.statusType ?? change?.mode ?? ''))
    );
}

// ---------------------------------------------------------------------------
// テスト 1: 手動kill指定が比較バッファでは無効化される（本体は不変）
// ---------------------------------------------------------------------------

test('comparison view: manual kill is disabled in comparison buffer while main states keep it', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {});

  manager.commitNextTurn(
    { 0: { skillId: ATTACK_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    {
      enemyCount: 1,
      note: 'manual kill',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  assert.equal(
    enemyHasStatus(manager.computedStates[0], /^dead$/i),
    true,
    '本体の computedStates では手動討伐が有効であること'
  );

  const comparison = manager.buildComparisonComputedStates();
  assert.ok(comparison, '比較バッファが取得できること');
  assert.equal(comparison.states.length, 1, '比較バッファのターン数が一致すること');
  assert.equal(
    enemyHasStatus(comparison.states[0], /^dead$/i),
    false,
    '比較バッファでは手動討伐が無効化されること'
  );

  // 本体は比較ビュー取得後も不変
  assert.equal(
    enemyHasStatus(manager.computedStates[0], /^dead$/i),
    true,
    '比較取得後も本体の手動討伐が維持されること'
  );
});

// ---------------------------------------------------------------------------
// テスト 2: replayScript / computedStates が完全不変（JSON純度）
// ---------------------------------------------------------------------------

test('comparison view: replayScript and computedStates are byte-identical after comparison build', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyDp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  manager.commitNextTurn(
    { 0: { skillId: ATTACK_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    {
      enemyCount: 1,
      note: 'manual break',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Break', enemyIndexes: [0] }],
    }
  );
  manager.commitNextTurn({ 0: { skillId: 9902 } }, { enemyCount: 1, note: 'second' });

  const replayBefore = JSON.stringify(manager.replayScript);
  const statesRef = manager.computedStates;
  const recordsRef = manager.computedRecords;
  const statesBefore = JSON.stringify(
    manager.computedStates.map((state) => state?.turnState?.enemyState ?? null)
  );

  const comparison = manager.buildComparisonComputedStates();
  assert.ok(comparison, '比較バッファが取得できること');

  assert.equal(JSON.stringify(manager.replayScript), replayBefore, 'replayScript が不変であること');
  assert.equal(manager.computedStates, statesRef, 'computedStates の参照が不変であること');
  assert.equal(manager.computedRecords, recordsRef, 'computedRecords の参照が不変であること');
  assert.equal(
    JSON.stringify(manager.computedStates.map((state) => state?.turnState?.enemyState ?? null)),
    statesBefore,
    'computedStates の内容が不変であること'
  );
  assert.notEqual(comparison.states, manager.computedStates, '比較バッファは別配列であること');
});

// ---------------------------------------------------------------------------
// テスト 3: 自動計算（DP自動ブレイク）は比較バッファでも有効
// ---------------------------------------------------------------------------

test('comparison view: auto DP break remains active in comparison buffer', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState({ enemyDp: 1 }), {}, { damageCalculationData: DAMAGE_DATA });

  manager.commitNextTurn(
    { 0: { skillId: ATTACK_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'attack' }
  );

  assert.equal(
    enemyHasStatus(manager.computedStates[0], /break|downturn/i),
    true,
    '本体でDP自動ブレイクが有効であること'
  );

  const comparison = manager.buildComparisonComputedStates();
  assert.equal(
    enemyHasStatus(comparison.states[0], /break|downturn/i),
    true,
    '比較バッファでもDP自動ブレイク（自動計算）が有効であること'
  );
});

// ---------------------------------------------------------------------------
// テスト 4: pending 状態が復元される
// ---------------------------------------------------------------------------

test('comparison view: pending OD levels survive comparison build', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(), {});

  manager.commitNextTurn({ 0: { skillId: 9902 } }, { enemyCount: 1, note: 'first' });
  manager.setPendingInterruptOd(1);
  const pendingBefore = manager.pendingInterruptOdLevel;

  manager.buildComparisonComputedStates();

  assert.equal(
    manager.pendingInterruptOdLevel,
    pendingBefore,
    'pendingInterruptOdLevel が比較取得後も維持されること'
  );
});

// ---------------------------------------------------------------------------
// テスト 5: replayScript 未ロード時は null
// ---------------------------------------------------------------------------

test('comparison view: returns null when replayScript is not loaded', () => {
  const manager = new TurnEngineManager();
  assert.equal(manager.buildComparisonComputedStates(), null);
});

test('comparison view: skullfeather fixture keeps interrupt OD skills and swapped #3 actor', () => {
  const session = JSON.parse(
    readFileSync('tests/e2e/fixtures/ui_next_session_skullfeather_repro.json', 'utf-8')
  );
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);
  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
    damageCalculationData: loadDamageCalculationData(),
  });

  const comparison = manager.buildComparisonComputedStates();

  assert.ok(comparison, '比較バッファが取得できること');
  assert.equal(comparison.records.length, 8);
  assert.equal(comparison.records.every(Boolean), true);

  const turn2SkillNames = comparison.records[1].actions.map((action) => action.skillName);
  assert.equal(turn2SkillNames.includes('コードダクネス'), true);
  assert.equal(turn2SkillNames.includes('咲き昇る宵の幻'), true);

  const nikaidoBeforeTurn3 = comparison.stateBefores[2].party.find(
    (member) => member.characterName === '二階堂 三郷'
  );
  assert.equal(nikaidoBeforeTurn3?.position, 0);

  const softeningAction = comparison.records[2].actions.find(
    (action) => Number(action.skillId) === 46300009
  );
  assert.equal(softeningAction?.characterName, '二階堂 三郷');

  assert.equal(
    enemyHasStatus(comparison.states[2], /break|downturn|dead|superdown/i),
    true,
    '比較ビューでは#2で導出された自動Break/DownTurnを#3のEnemyStatuses置換で消さないこと'
  );
  assert.equal(Number(comparison.states[2]?.turnState?.enemyState?.remainingDpByEnemy?.['0']), 0);

  const autoBreakTurnIndexes = comparison.records
    .map((record, index) => (getAutoBreakEvents(record).length > 0 ? index : -1))
    .filter((index) => index >= 0);
  assert.deepEqual(
    autoBreakTurnIndexes,
    [1],
    '#2で自動ブレイク後、DownTurn継続中のターンにはsource:auto DownTurnを再発生させないこと'
  );

  for (const turnIndex of autoBreakTurnIndexes) {
    const previousState = turnIndex > 0 ? comparison.states[turnIndex - 1] : null;
    assert.equal(
      previousState ? enemyHasStatus(previousState, /break|downturn/i) : false,
      false,
      `#${turnIndex + 1}の自動ブレイク直前は非Breakであること`
    );
  }

  for (let index = 2; index < comparison.states.length; index += 1) {
    const previousState = comparison.states[index - 1];
    if (!enemyHasStatus(previousState, /break|downturn/i)) {
      continue;
    }
    assert.equal(
      enemyHasStatus(comparison.states[index], /break|downturn/i),
      true,
      `#${index + 1}でEnemyStatuses entry適用により導出済みBreak/DownTurnを消さないこと`
    );
    assert.equal(
      Number(comparison.states[index]?.turnState?.enemyState?.remainingDpByEnemy?.['0']),
      0,
      `#${index + 1}で非Break+remaining0扱いの最大DP回復を発生させないこと`
    );
  }
});

test('destruction preview fixture keeps action-before destruction rates and DP-aware deltas', () => {
  const session = JSON.parse(
    readFileSync('tests/e2e/fixtures/ui_next_session_destruction_preview_2026-06-14.json', 'utf-8')
  );
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);
  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
    damageCalculationData: loadDamageCalculationData(),
  });

  const turn1Miya = manager.computedRecords[0].actions.find(
    (action) => action.characterName === '瑞原 あいな' || action.skillName === '咲き昇る宵の幻'
  );
  const turn1Yuki = manager.computedRecords[0].actions.find(
    (action) => action.characterName === '和泉 ユキ' || action.skillName === '通常攻撃'
  );
  assert.equal(
    turn1Miya?.damageContext?.destructionRateByEnemy?.['0'],
    undefined,
    '#1美也はDPが割れていないので破壊率を更新しない'
  );
  assert.equal(
    turn1Yuki?.damageContext?.destructionRateByEnemy?.['0'],
    undefined,
    '#1ユキはDPが割れていないので破壊率を更新しない'
  );

  const turn2Yuki = manager.computedRecords[1].actions.find(
    (action) => action.characterName === '和泉 ユキ' && action.skillName === 'コードダクネス'
  );
  const turn2Miya = manager.computedRecords[1].actions.find(
    (action) => action.skillName === '咲き昇る宵の幻'
  );
  const yukiBreakdown = turn2Yuki?.destructionBreakdownByEnemy?.['0'];
  const miyaBreakdown = turn2Miya?.destructionBreakdownByEnemy?.['0'];

  assert.ok(yukiBreakdown, '#2ユキの破壊率 breakdown が存在すること');
  assert.ok(miyaBreakdown, '#2美也の破壊率 breakdown が存在すること');
  assert.ok(Math.abs(Number(yukiBreakdown.rateBefore) - 100) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.rateAfter) - 132.625) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.appliedGainPercent) - 32.625) < 1e-9);
  assert.equal(yukiBreakdown.contactHitCount, 9);
  assert.equal(yukiBreakdown.calculationHitCount, 9);
  assert.deepEqual(yukiBreakdown.hitRatios, [0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.25, 0.25, 0.25]);
  assert.deepEqual(yukiBreakdown.baseHitRatios, [0.1, 0.1, 0.1, 0.2, 0.2, 0.3]);
  assert.equal(yukiBreakdown.breakHitNumber, 7);
  assert.equal(yukiBreakdown.damageBreakHitNumber, 7);
  assert.equal(yukiBreakdown.destructionStartHitNumber, 7);
  assert.equal(yukiBreakdown.destructionHitCount, 3);
  assert.equal(yukiBreakdown.destructionFunnelHitCount, 3);
  assert.ok(Math.abs(Number(yukiBreakdown.totalDestructionWeight) - 1.75) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.appliedDestructionWeight) - 0.75) < 1e-9);
  assert.equal(yukiBreakdown.useAutoBreak, false);
  assert.ok(Number(yukiBreakdown.dpBeforeThisAction) > 0);
  assert.equal(yukiBreakdown.hitBreakdown?.[6]?.source, 'funnel');
  assert.equal(yukiBreakdown.hitBreakdown?.[6]?.isBreakHit, true);
  assert.equal(yukiBreakdown.hitBreakdown?.[6]?.isDamageBreakHit, true);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[6]?.hpApplied) - 174165.42857142887) < 1e-6);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[6]?.destructionWeight) - 0.25) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[6]?.destructionGainPercent) - 10.875) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[6]?.destructionRateAfterPercent) - 110.875) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[7]?.hpApplied) - 524381.4117857142) < 1e-6);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[7]?.destructionGainPercent) - 10.875) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[7]?.destructionRateAfterPercent) - 121.75) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[8]?.hpApplied) - 575814.5378571429) < 1e-6);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[8]?.destructionGainPercent) - 10.875) < 1e-9);
  assert.ok(Math.abs(Number(yukiBreakdown.hitBreakdown?.[8]?.destructionRateBeforePercent) - 121.75) < 1e-9);

  assert.ok(Math.abs(Number(miyaBreakdown.rateBefore) - 132.625) < 1e-9);
  assert.ok(Math.abs(Number(miyaBreakdown.rateAfter) - 717.335) < 1e-9);
  assert.ok(Math.abs(Number(miyaBreakdown.rateAfter) - Number(miyaBreakdown.rateBefore) - 584.71) < 1e-9);
  assert.equal(miyaBreakdown.useAutoBreak, false);
  assert.equal(Number(miyaBreakdown.dpBeforeThisAction), 0);
});

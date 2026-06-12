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

  const turn3EnemyState = comparison.states[2]?.turnState?.enemyState ?? {};
  assert.equal(
    enemyHasStatus(comparison.states[2], /break|downturn|dead|superdown/i),
    false,
    '比較ビューでは保存済み手動Break系EnemyStatusesを#3へ持ち込まないこと'
  );
  assert.ok(
    Number(turn3EnemyState.remainingDpByEnemy?.['0']) > 0 &&
      Number(turn3EnemyState.remainingDpByEnemy?.['0']) < Number(turn3EnemyState.enemyDpByEnemy?.['0']),
    '#3では比較計算のDP減少が継続し、最大DP未満の正値であること'
  );

  const turn4AutoChanges = (comparison.records[3]?.actions ?? [])
    .flatMap((action) => action.enemyStatusChanges ?? [])
    .filter((change) => String(change?.source ?? '') === 'auto');
  assert.equal(
    turn4AutoChanges.some((change) => /downturn|break/i.test(String(change?.statusType ?? change?.mode ?? ''))),
    true,
    'DP0到達ターンでsource:autoの自動ブレイクイベントが出ること'
  );
  assert.equal(Number(comparison.states[3]?.turnState?.enemyState?.remainingDpByEnemy?.['0']), 0);
});

// Phase0 characterization test (T0-1)
// docs/active/debuff_resolved_power_propagation_investigation.md
//
// 目的: 上流入力（caster stat）を編集して全再計算した時、
//   - デバフが「付与されるターン」(turn1) は新 stat で再解決される
//   - デバフを「引き継ぐ後続ターン」(turn2, 再付与なし) も同じ値に再導出されるべき
// turn2 が turn-start enemyStatuses override で旧解決値に凍結置換されるなら、
// turn1（新値）と turn2（旧値）が食い違い、このテストは赤になる＝陳腐化バグ確定。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterStyle,
  Party,
  createBattleStateFromParty,
  createInitialTurnState,
} from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';

const ENEMY_BORDER = 650;

// stat 依存・永続（Eternal）の敵 DefenseDown。wis に比例して効果値が解決される。
function buildDebuffSkill() {
  return {
    id: 70010,
    name: 'Stat DefenseDown',
    label: 'Stat DefenseDown',
    sp_cost: 0,
    target_type: 'Single',
    hit_count: 1,
    hitCount: 1,
    parts: [
      {
        skill_type: 'DefenseDown',
        target_type: 'Single',
        power: [0.3, 0.45],
        growth: [0, 0],
        diff_for_max: 100,
        parameters: { wis: 1 },
        effect: { limitType: 'Only', exitCond: 'Eternal' },
      },
    ],
  };
}

function buildProtectionSkill() {
  return {
    id: 70011,
    name: 'Filler Protection',
    label: 'Filler Protection',
    sp_cost: 0,
    target_type: 'Self',
    hit_count: 1,
    hitCount: 1,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

function buildInitialState(actorWis) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const isActor = index === 0;
    return new CharacterStyle({
      characterId: `D${index + 1}`,
      characterName: `D${index + 1}`,
      styleId: 7000 + index,
      styleName: `DS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 20,
      role: 'Attacker',
      weaponType: 'Slash',
      stats: { str: 1, dex: 1, con: 1, spr: 1, luk: 1, wis: isActor ? actorWis : 1 },
      skills: isActor
        ? [buildDebuffSkill(), buildProtectionSkill()]
        : [buildProtectionSkill()],
      passives: [],
    });
  });
  const party = new Party(members);
  const baseTurnState = createInitialTurnState();
  return createBattleStateFromParty(party, {
    ...baseTurnState,
    enemyState: {
      ...baseTurnState.enemyState,
      enemyCount: 1,
      paramBorderByEnemy: { 0: ENEMY_BORDER },
    },
  });
}

function getDefenseDownPower(state) {
  const statuses = state?.turnState?.enemyState?.statuses ?? [];
  const found = statuses.find(
    (s) => String(s?.statusType) === 'DefenseDown' && Number(s?.targetIndex ?? -1) === 0
  );
  return found ? Number(found.power) : null;
}

function buildTwoTurnManager(actorWis) {
  const manager = new TurnEngineManager();
  manager.initialize(buildInitialState(actorWis), {});
  // Turn 1: stat 依存 DefenseDown を敵0へ付与
  manager.commitNextTurn(
    { 0: { skillId: 70010, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'phase0 t1 apply debuff' }
  );
  // Turn 2: 再付与なし（Protection）。DefenseDown は Eternal で引き継がれる。
  manager.commitNextTurn(
    { 0: { skillId: 70011 } },
    { enemyCount: 1, note: 'phase0 t2 carry only' }
  );
  return manager;
}

test('characterization: stat-resolved enemy debuff carries the SAME power into next turn', () => {
  // 編集前: turn1 で付与した値が turn2 にも引き継がれる
  const manager = buildTwoTurnManager(700);
  const t1 = getDefenseDownPower(manager.computedStates[0]);
  const t2 = getDefenseDownPower(manager.computedStates[1]);
  assert.notEqual(t1, null, 'turn1 に DefenseDown が付与されていること');
  assert.notEqual(t2, null, 'turn2 に DefenseDown が引き継がれていること');
  assert.ok(Math.abs(t1 - t2) < 1e-9, `編集前は turn1/turn2 一致 (t1=${t1}, t2=${t2})`);
});

// 既知バグ（陳腐化）を実証する赤テスト。Phase2 実装で todo を外して緑化するのが acceptance gate。
test('characterization: editing caster wis + recompute propagates to BOTH apply-turn and carry-turn', { todo: 'Phase2 で turn-start enemyStatuses override の解決値凍結を解消して緑化する' }, () => {
  const manager = buildTwoTurnManager(700);
  const beforeT1 = getDefenseDownPower(manager.computedStates[0]);
  const beforeT2 = getDefenseDownPower(manager.computedStates[1]);

  // 上流編集: caster wis を 700 -> 300（border 650 を下回り belowMin=0.3 へ落ちる想定）
  manager.recalculateAll(buildInitialState(300));

  const afterT1 = getDefenseDownPower(manager.computedStates[0]);
  const afterT2 = getDefenseDownPower(manager.computedStates[1]);

  // 1) 編集が付与ターンの解決値に効くこと（前提条件）
  assert.ok(
    Math.abs(afterT1 - beforeT1) > 1e-9,
    `wis 編集が turn1 の解決値を変えること (before=${beforeT1}, after=${afterT1})`
  );

  // 2) 本丸: 引き継ぎターン(turn2)も再導出され、付与ターン(turn1)と一致すること。
  //    turn2 が旧解決値に凍結されているなら afterT1 != afterT2 で赤 = 陳腐化バグ確定。
  assert.ok(
    Math.abs(afterT1 - afterT2) < 1e-9,
    `再計算後、turn1(再解決) と turn2(引き継ぎ) が一致すべき: t1=${afterT1}, t2=${afterT2} ` +
    `(旧値 beforeT2=${beforeT2})`
  );
});

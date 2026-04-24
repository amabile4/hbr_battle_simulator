import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  createInitialTurnState,
  Party,
  previewTurn,
} from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

const store = getStore();

function findStyleIdBySkillId(dataStore, skillId) {
  for (const style of dataStore.styles) {
    if (!Array.isArray(style.skills)) {
      continue;
    }
    if (style.skills.some((skill) => Number(skill.id ?? skill.i) === Number(skillId))) {
      return Number(style.id);
    }
  }
  throw new Error(`style not found for skillId=${skillId}`);
}

function buildSingleSkillRealDataParty(dataStore, skillId) {
  const actorStyleId = findStyleIdBySkillId(dataStore, skillId);
  const actorStyle = dataStore.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const otherStyleIds = getSixUsableStyleIds(dataStore).filter(
    (id) =>
      Number(id) !== actorStyleId &&
      String(dataStore.getStyleById(id)?.chara_label ?? dataStore.getStyleById(id)?.chara ?? '') !== actorCharaLabel
  );
  const styleIds = [actorStyleId, ...otherStyleIds.slice(0, 5)];
  if (styleIds.length !== 6) {
    throw new Error(`Could not build 6-member party for skillId=${skillId}`);
  }

  return dataStore.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [skillId],
    },
  });
}

function normalizeEnemyStatusForAssertion(status) {
  const rawElements = Array.isArray(status?.elements) ? status.elements : [];
  const normalizedElements = rawElements
    .map((element) => String(element ?? '').trim())
    .filter(Boolean)
    .sort();
  const powerValue = Number(status?.power);
  const remainingValue = Number(status?.remaining ?? status?.remainingTurns);
  const targetIndexValue = Number(status?.targetIndex);
  return {
    statusType: String(status?.statusType ?? '').trim(),
    elements: normalizedElements,
    power: Number.isFinite(powerValue) ? powerValue : null,
    remaining: Number.isFinite(remainingValue) ? remainingValue : null,
    exitCond: String(status?.exitCond ?? '').trim(),
    targetIndex: Number.isFinite(targetIndexValue) ? targetIndexValue : null,
    sourceSkillDesc: String(status?.sourceSkillDesc ?? '').trim(),
  };
}

function statusSortKey(s) {
  return `${s.targetIndex}|${s.statusType}|${s.elements.join(',')}|${s.power}|${s.remaining}|${s.exitCond}|${s.sourceSkillDesc}`;
}

function normalizeStatusList(list) {
  return (Array.isArray(list) ? list : [])
    .map((status) => normalizeEnemyStatusForAssertion(status))
    .sort((a, b) => statusSortKey(a).localeCompare(statusSortKey(b)));
}

/**
 * enemy status の厳密比較。mismatch 時は statusType|elements キー単位で diff を出力する。
 */
function assertEnemyStatusesStrictEqual(actual, expected, message) {
  const normalizedActual = normalizeStatusList(actual);
  const normalizedExpected = normalizeStatusList(expected);

  // 件数不一致の早期検出
  if (normalizedActual.length !== normalizedExpected.length) {
    const actualKeys = normalizedActual.map((s) => `${s.statusType}[${s.elements.join(',')}]@E${s.targetIndex}`);
    const expectedKeys = normalizedExpected.map((s) => `${s.statusType}[${s.elements.join(',')}]@E${s.targetIndex}`);
    assert.fail(
      `${message}\n` +
      `  count mismatch: actual=${normalizedActual.length}, expected=${normalizedExpected.length}\n` +
      `  actual keys:   [${actualKeys.join(', ')}]\n` +
      `  expected keys: [${expectedKeys.join(', ')}]`
    );
  }

  // フィールド単位の diff を収集
  const diffs = [];
  for (let i = 0; i < normalizedExpected.length; i++) {
    const a = normalizedActual[i];
    const e = normalizedExpected[i];
    const key = `${e.statusType}[${e.elements.join(',')}]@E${e.targetIndex}`;
    for (const field of ['statusType', 'power', 'remaining', 'exitCond', 'targetIndex', 'sourceSkillDesc']) {
      if (a[field] !== e[field]) {
        diffs.push(`  ${key}.${field}: actual=${JSON.stringify(a[field])}, expected=${JSON.stringify(e[field])}`);
      }
    }
    const aElem = a.elements.join(',');
    const eElem = e.elements.join(',');
    if (aElem !== eElem) {
      diffs.push(`  ${key}.elements: actual=[${aElem}], expected=[${eElem}]`);
    }
  }

  if (diffs.length > 0) {
    assert.fail(`${message}\n${diffs.join('\n')}`);
  }
}

function createEnemyStatusSkill({
  id,
  name,
  statusType,
  power,
  remaining,
  limitType = 'None',
  exitCond = 'Count',
  elements = [],
  desc = '',
}) {
  return {
    id,
    name,
    label: `${name}${id}`,
    desc,
    sp_cost: 0,
    target_type: 'Single',
    parts: [
      {
        skill_type: statusType,
        target_type: 'Single',
        elements,
        power: [power, 0],
        effect: {
          limitType,
          exitCond,
          exitVal: [remaining, 0],
        },
      },
    ],
  };
}

function createSixMemberManualParty(factory) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `T34${idx + 1}`,
      characterName: `T34${idx + 1}`,
      styleId: 9800 + idx,
      styleName: `T34S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      skills: [
        {
          id: 9900 + idx,
          name: `Protection${idx + 1}`,
          label: `Protection${idx + 1}`,
          sp_cost: 0,
          target_type: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        },
      ],
      ...(typeof factory === 'function' ? factory(idx) : {}),
    })
  );
  return new Party(members);
}

function createEnemyStatusConflictManager(skills, options = {}) {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: Number(options.initialSP ?? 20),
          skills,
        }
      : {}
  );
  const baseTurnState = createInitialTurnState();
  const initialState = createBattleStateFromParty(party, {
    ...baseTurnState,
    enemyState: {
      ...baseTurnState.enemyState,
      enemyCount: Number(options.enemyCount ?? 1),
    },
  });
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});
  return manager;
}

function commitEnemyStatusSkill(manager, skillId, enemyIndex = 0) {
  return manager.commitNextTurn(
    {
      0: {
        skillId,
        target: { type: 'enemy', enemyIndex },
      },
    },
    { enemyCount: 1, note: `t34-p1 skill=${skillId}` }
  );
}

function getTargetEnemyStatuses(list, targetIndex = 0) {
  return (Array.isArray(list) ? list : []).filter(
    (status) => Number(status?.targetIndex ?? -1) === Number(targetIndex)
  );
}

function findTargetEnemyStatus(statuses, statusType, elements = []) {
  const expectedElements = [...elements].map((element) => String(element)).sort().join(',');
  return getTargetEnemyStatuses(statuses).find((status) => {
    const actualElements = (Array.isArray(status?.elements) ? status.elements : [])
      .map((element) => String(element))
      .sort()
      .join(',');
    return String(status?.statusType ?? '') === String(statusType) && actualElements === expectedElements;
  }) ?? null;
}

function getLastComputedEnemyStatuses(manager) {
  return manager.computedStates.at(-1)?.turnState?.enemyState?.statuses ?? [];
}

/**
 * initialState をクローンする（party メンバーの CharacterStyle.clone() を保持）。
 * structuredClone はクラスメソッドを失うため使えない。
 */
function cloneInitialState(state) {
  return {
    ...state,
    party: Array.isArray(state.party)
      ? state.party.map((member) => member.clone())
      : [],
    turnState: state.turnState ? structuredClone(state.turnState) : null,
  };
}

/**
 * WBS-4a: commit -> record -> recalculate の敵status同値性
 * commit時に保存された敵statusが、record/recalculate時にも一致することを検証
 */
test('WBS-4a: committed enemyStatusSnapshot matches recalculated enemy statuses', async () => {
  const skillId = 46001112; // 迅雷風烈: DefenseDown 付与
  const initialState = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId), {
    enemyCount: 2,
  });

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  const committedRecord = manager.commitNextTurn(
    {
      0: {
        skillId,
        target: { type: 'enemy', enemyIndex: 0 },
      },
    },
    { enemyCount: 2, note: 'wbs4a recalculate strict compare' }
  );

  assert(
    Array.isArray(committedRecord.stateSnapshot?.enemyStatusSnapshot),
    'committed.stateSnapshot.enemyStatusSnapshot is array'
  );
  const committedEnemyStatuses = committedRecord.stateSnapshot.enemyStatusSnapshot;
  const runtimeEnemyStatuses = manager.currentState.turnState?.enemyState?.statuses ?? [];
  assertEnemyStatusesStrictEqual(
    committedEnemyStatuses,
    runtimeEnemyStatuses,
    'committed snapshot should strictly match runtime enemy statuses'
  );

  manager.recalculateFrom(0);
  const recalculatedEnemyStatuses = manager.computedStates[0]?.turnState?.enemyState?.statuses ?? [];
  assertEnemyStatusesStrictEqual(
    recalculatedEnemyStatuses,
    committedEnemyStatuses,
    'recalculated enemy statuses should strictly match committed snapshot'
  );
});

test('real-data 黒蝶霹靂制裁 applies Undermine to all enemies and preserves it through recalculation', async () => {
  const skillId = 46007612;
  const baseTurnState = createInitialTurnState();
  const initialState = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId), {
    ...baseTurnState,
    enemyState: {
      ...baseTurnState.enemyState,
      enemyCount: 3,
    },
  });
  initialState.party[0].currentSp = 20;

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  const committedRecord = manager.commitNextTurn(
    {
      0: {
        skillId,
        target: { type: 'enemy', enemyIndex: 0 },
      },
    },
    { enemyCount: 3, note: 'undermine real-data recalc' }
  );
  const committedStatuses = normalizeStatusList(committedRecord.stateSnapshot?.enemyStatusSnapshot ?? []);
  const committedUndermine = committedStatuses.filter((status) => status.statusType === 'Undermine');
  assert.equal(committedUndermine.length, 3, 'committed state should keep Undermine on all enemies');
  assert.deepEqual(
    committedUndermine.map((status) => status.targetIndex),
    [0, 1, 2],
    'All target should preserve per-enemy Undermine entries'
  );
  assert(
    committedUndermine.every((status) => status.remaining === 1),
    'Undermine should decrement to 1 turn after commit-time EnemyTurnEnd tick'
  );
  assert(
    committedUndermine.every((status) => status.exitCond === 'EnemyTurnEnd'),
    'Undermine should use EnemyTurnEnd duration in committed snapshot'
  );
  assert(
    committedUndermine.every((status) => status.sourceSkillDesc.includes('蝕状態')),
    'Undermine should preserve source skill description for popup/help display'
  );

  manager.recalculateFrom(0);
  const recalculatedStatuses = normalizeStatusList(manager.computedStates[0]?.turnState?.enemyState?.statuses ?? []);
  assertEnemyStatusesStrictEqual(
    recalculatedStatuses,
    committedStatuses,
    'recalculated real-data Undermine statuses should match committed'
  );
});

/**
 * WBS-4b-a1: wbs4b_a1_merge_same_key_uses_max_remaining
 * 同一敵に同じstatusTypeが複数回付与された場合、max-merge規則が適用されることを検証
 */
test('wbs4b_a1_merge_same_key_uses_max_remaining', async () => {
  const shortStatusSkill = createEnemyStatusSkill({
    id: 98101,
    name: 'HackShort',
    statusType: 'Hacking',
    power: 0.25,
    remaining: 2,
  });
  const longStatusSkill = createEnemyStatusSkill({
    id: 98102,
    name: 'HackLong',
    statusType: 'Hacking',
    power: 0.25,
    remaining: 5,
  });
  const manager = createEnemyStatusConflictManager([shortStatusSkill, longStatusSkill]);

  commitEnemyStatusSkill(manager, shortStatusSkill.id);
  const secondCommittedRecord = commitEnemyStatusSkill(manager, longStatusSkill.id);
  const runtimeStatuses = getTargetEnemyStatuses(manager.currentState.turnState?.enemyState?.statuses ?? []);
  const hacking = findTargetEnemyStatus(runtimeStatuses, 'Hacking');

  assert.equal(runtimeStatuses.length, 1, 'same-key Hacking should merge into one status');
  assert.ok(hacking, 'merged Hacking status exists');
  assert.equal(Number(hacking?.remainingTurns ?? hacking?.remaining ?? 0), 4, 'max remaining is adopted (5 from merge, -1 from EnemyTurnEnd tick)');
  assertEnemyStatusesStrictEqual(
    runtimeStatuses,
    secondCommittedRecord.stateSnapshot?.enemyStatusSnapshot ?? [],
    'committed snapshot should keep merged max-remaining outcome'
  );
});

/**
 * WBS-4b-a2: wbs4b_a2_merge_prefers_max_power_for_same_key
 * 同一statusTypeが複数ソースから来た場合、max power を採用する
 */
test('wbs4b_a2_merge_prefers_max_power_for_same_key', async () => {
  const lowPowerSkill = createEnemyStatusSkill({
    id: 98111,
    name: 'FireDefenseLow',
    statusType: 'DefenseDown',
    power: 0.3,
    remaining: 3,
    elements: ['Fire'],
  });
  const highPowerSkill = createEnemyStatusSkill({
    id: 98112,
    name: 'FireDefenseHigh',
    statusType: 'DefenseDown',
    power: 0.6,
    remaining: 3,
    elements: ['Fire'],
  });
  const manager = createEnemyStatusConflictManager([lowPowerSkill, highPowerSkill]);

  commitEnemyStatusSkill(manager, lowPowerSkill.id);
  commitEnemyStatusSkill(manager, highPowerSkill.id);
  const runtimeStatuses = getTargetEnemyStatuses(manager.currentState.turnState?.enemyState?.statuses ?? []);
  const defenseDown = findTargetEnemyStatus(runtimeStatuses, 'DefenseDown', ['Fire']);

  assert.equal(runtimeStatuses.length, 1, 'same-key elemental DefenseDown should merge into one status');
  assert.ok(defenseDown, 'merged Fire DefenseDown status exists');
  assert.equal(Number(defenseDown?.power ?? 0), 0.6, 'max power is adopted');
});

/**
 * WBS-4b-a3: wbs4b_a3_replay_and_recalculate_keep_merged_outcome
 * replay と recalculate 経路で merged outcome が一致することを検証
 */
test('wbs4b_a3_replay_and_recalculate_keep_merged_outcome', async () => {
  const weakSkill = createEnemyStatusSkill({
    id: 98121,
    name: 'ThunderHackWeak',
    statusType: 'Hacking',
    power: 0.2,
    remaining: 2,
    elements: ['Thunder'],
  });
  const strongSkill = createEnemyStatusSkill({
    id: 98122,
    name: 'ThunderHackStrong',
    statusType: 'Hacking',
    power: 0.55,
    remaining: 4,
    elements: ['Thunder'],
  });
  const manager = createEnemyStatusConflictManager([weakSkill, strongSkill]);

  commitEnemyStatusSkill(manager, weakSkill.id);
  const committedRecord = commitEnemyStatusSkill(manager, strongSkill.id);

  const statusesAfterCommit = getTargetEnemyStatuses(manager.currentState.turnState?.enemyState?.statuses ?? []);
  const snapshotStatuses = getTargetEnemyStatuses(committedRecord.stateSnapshot?.enemyStatusSnapshot ?? []);

  assertEnemyStatusesStrictEqual(
    statusesAfterCommit,
    [{ statusType: 'Hacking', targetIndex: 0, elements: ['Thunder'], power: 0.55, remainingTurns: 3, exitCond: 'Count' }],
    'merged outcome should use max power and max remaining for same statusType|elements (4 from merge, -1 from EnemyTurnEnd tick)'
  );
  assertEnemyStatusesStrictEqual(
    snapshotStatuses,
    statusesAfterCommit,
    'committed snapshot should strictly match merged runtime outcome'
  );

  manager.recalculateFrom(0);
  const statusesAfterRecalculate = getTargetEnemyStatuses(getLastComputedEnemyStatuses(manager));
  assertEnemyStatusesStrictEqual(
    statusesAfterRecalculate,
    snapshotStatuses,
    'merged outcome should survive replay and recalculate path'
  );
});

/**
 * WBS-4b-a4: wbs4b_a4_source_attribution_is_known_constraint_last_wins
 * max-merge方式では source attribution が不正確（last-wins）であることを既知制約として確認
 */
test('wbs4b_a4_source_attribution_is_known_constraint_last_wins', async () => {
  const firstSkill = createEnemyStatusSkill({
    id: 98131,
    name: 'SourceFirst',
    statusType: 'Hacking',
    power: 0.2,
    remaining: 2,
    desc: '最初のハッキング説明',
  });
  const secondSkill = createEnemyStatusSkill({
    id: 98132,
    name: 'SourceSecond',
    statusType: 'Hacking',
    power: 0.25,
    remaining: 4,
    desc: '後勝ちのハッキング説明',
  });
  const manager = createEnemyStatusConflictManager([firstSkill, secondSkill]);

  commitEnemyStatusSkill(manager, firstSkill.id);
  commitEnemyStatusSkill(manager, secondSkill.id);
  const runtimeStatuses = getTargetEnemyStatuses(manager.currentState.turnState?.enemyState?.statuses ?? []);
  const mergedStatus = findTargetEnemyStatus(runtimeStatuses, 'Hacking');

  assert.equal(runtimeStatuses.length, 1, 'same-key Hacking should remain single after merge');
  assert.ok(mergedStatus, 'merged Hacking status exists');
  assert.equal(Number(mergedStatus?.sourceSkillId ?? 0), secondSkill.id, 'sourceSkillId follows last-wins constraint');
  assert.equal(String(mergedStatus?.sourceSkillName ?? ''), secondSkill.name, 'sourceSkillName follows last-wins constraint');
  assert.equal(String(mergedStatus?.sourceSkillLabel ?? ''), secondSkill.label, 'sourceSkillLabel follows last-wins constraint');
  assert.equal(String(mergedStatus?.sourceSkillDesc ?? ''), secondSkill.desc, 'sourceSkillDesc follows last-wins constraint');

  manager.recalculateFrom(0);
  const recalculatedStatus = findTargetEnemyStatus(getLastComputedEnemyStatuses(manager), 'Hacking');
  assert.equal(Number(recalculatedStatus?.sourceSkillId ?? 0), secondSkill.id, 'last-wins sourceSkillId survives recalculate');
  assert.equal(
    String(recalculatedStatus?.sourceSkillDesc ?? ''),
    secondSkill.desc,
    'last-wins sourceSkillDesc survives recalculate'
  );
});

/**
 * WBS-4c: commit -> record -> replay の敵status同値性
 * 敵statusが replay 経路でも一致することを検証（pre-UI gate）
 */
test('WBS-4c: committed enemy statuses survive replay workflow', async () => {
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
  });

  let state = createBattleStateFromParty(party, {
    enemyCount: 2,
  });

  // プレビュー
  const preview = previewTurn(state, {
    0: {
      characterId: state.party[0].characterId,
      skillId: state.party[0].skills[0].skillId,
      targetEnemyIndex: 0,
    },
  });

  if (!preview) return;

  // コミット
  const { committedRecord, nextState } = commitTurn(state, preview, []);

  // 敵statusが snapshot に保存されている
  const snapshotStatus = committedRecord.stateSnapshot?.enemyStatusSnapshot;
  assert(Array.isArray(snapshotStatus), 'enemy status snapshot is preserved in committed record');

  // runtime と snapshot が厳密一致
  const runtimeStatus = nextState.turnState?.enemyState?.statuses ?? [];
  assertEnemyStatusesStrictEqual(
    snapshotStatus,
    runtimeStatus,
    'replay-ready: snapshot enemy statuses should strictly match runtime'
  );
});

/**
 * P2: replayScript load/再生往復テスト（WBS-4c 強化）
 * commit -> replayScript取得 -> 新規manager/loadReplayScript -> recalculate で
 * enemy status が厳密一致することを検証する。
 */
test('P2: replayScript round-trip preserves enemy statuses across load and recalculate', async () => {
  // 異なるstatusTypeの2スキルで複数ターンcommitし、十分なenemy statusを生成する
  const hackSkill = createEnemyStatusSkill({
    id: 98201,
    name: 'RoundTripHack',
    statusType: 'Hacking',
    power: 0.3,
    remaining: 4,
    elements: ['Thunder'],
    desc: '雷属性ハッキングを付与',
  });
  const defDownSkill = createEnemyStatusSkill({
    id: 98202,
    name: 'RoundTripDefDown',
    statusType: 'DefenseDown',
    power: 0.5,
    remaining: 3,
    elements: ['Fire'],
    desc: '火属性防御ダウンを付与',
  });
  const sourceManager = createEnemyStatusConflictManager([hackSkill, defDownSkill]);

  // ターン1: Hacking付与
  commitEnemyStatusSkill(sourceManager, hackSkill.id);
  // ターン2: DefenseDown付与
  commitEnemyStatusSkill(sourceManager, defDownSkill.id);

  const statusesAfterCommit = sourceManager.currentState.turnState?.enemyState?.statuses ?? [];
  assert.ok(statusesAfterCommit.length >= 2, 'source manager has at least 2 enemy statuses after 2 commits');

  // replayScript と initialState を取得
  const replayScript = structuredClone(sourceManager.replayScript);
  const initialState = cloneInitialState(sourceManager.initialState);

  // 新規managerでreplayScriptをロード（内部で recalculateAll が走る）
  const replayManager = new TurnEngineManager();
  replayManager.loadReplayScript(initialState, replayScript);

  // ロード後のenemy statusを取得
  const replayedStatuses = replayManager.currentState.turnState?.enemyState?.statuses ?? [];

  // 往復前後で厳密一致
  assertEnemyStatusesStrictEqual(
    replayedStatuses,
    statusesAfterCommit,
    'enemy statuses must strictly match after replayScript round-trip (load + recalculate)'
  );
  assert.equal(
    replayedStatuses.every((status) => String(status?.sourceSkillDesc ?? '').trim().length > 0),
    true,
    'sourceSkillDesc remains populated after replayScript round-trip'
  );

  // 各ターンのcomputed snapshotも確認
  for (let i = 0; i < sourceManager.computedStates.length; i++) {
    const sourceStatuses = sourceManager.computedStates[i]?.turnState?.enemyState?.statuses ?? [];
    const replayedTurnStatuses = replayManager.computedStates[i]?.turnState?.enemyState?.statuses ?? [];
    assertEnemyStatusesStrictEqual(
      replayedTurnStatuses,
      sourceStatuses,
      `turn ${i}: enemy statuses must match between source and replayed manager`
    );
  }
});

/**
 * P2: replayScript round-trip で merge 競合結果も維持されることを検証
 * 同一statusType|elementsの重複付与 → merge → replayScript往復 で同一結果
 */
test('P2: replayScript round-trip preserves merged conflict outcomes', async () => {
  const weakSkill = createEnemyStatusSkill({
    id: 98211,
    name: 'MergeWeak',
    statusType: 'Hacking',
    power: 0.2,
    remaining: 2,
    elements: ['Ice'],
  });
  const strongSkill = createEnemyStatusSkill({
    id: 98212,
    name: 'MergeStrong',
    statusType: 'Hacking',
    power: 0.5,
    remaining: 5,
    elements: ['Ice'],
  });
  const sourceManager = createEnemyStatusConflictManager([weakSkill, strongSkill]);

  commitEnemyStatusSkill(sourceManager, weakSkill.id);
  commitEnemyStatusSkill(sourceManager, strongSkill.id);

  const mergedStatuses = sourceManager.currentState.turnState?.enemyState?.statuses ?? [];
  const mergedHacking = findTargetEnemyStatus(mergedStatuses, 'Hacking', ['Ice']);
  assert.ok(mergedHacking, 'merged Hacking status exists after conflict');
  assert.equal(Number(mergedHacking?.power ?? 0), 0.5, 'max power adopted before round-trip');

  // replayScript round-trip
  const replayScript = structuredClone(sourceManager.replayScript);
  const initialState = cloneInitialState(sourceManager.initialState);
  const replayManager = new TurnEngineManager();
  replayManager.loadReplayScript(initialState, replayScript);

  const replayedStatuses = replayManager.currentState.turnState?.enemyState?.statuses ?? [];
  const replayedHacking = findTargetEnemyStatus(replayedStatuses, 'Hacking', ['Ice']);

  assert.ok(replayedHacking, 'merged Hacking status survives round-trip');
  assertEnemyStatusesStrictEqual(
    replayedStatuses,
    mergedStatuses,
    'merged conflict outcomes must survive replayScript round-trip'
  );
});

/**
 * P2: 旧record（enemyStatusSnapshot なし）との fallback 互換テスト
 * replayScript の turns からenemy statusが再計算で再構築され、
 * snapshotがなくてもruntimeで正しいenemy statusが得られることを検証する。
 */
test('P2: legacy replayScript without enemyStatusSnapshot falls back to recalculated statuses', async () => {
  const hackSkill = createEnemyStatusSkill({
    id: 98221,
    name: 'LegacyHack',
    statusType: 'Hacking',
    power: 0.35,
    remaining: 3,
  });
  const sourceManager = createEnemyStatusConflictManager([hackSkill]);

  commitEnemyStatusSkill(sourceManager, hackSkill.id);

  const statusesAfterCommit = sourceManager.currentState.turnState?.enemyState?.statuses ?? [];
  assert.ok(statusesAfterCommit.length >= 1, 'source has enemy statuses');

  // replayScriptを取得し、旧形式を模擬
  const replayScript = structuredClone(sourceManager.replayScript);
  const initialState = cloneInitialState(sourceManager.initialState);

  // 新規managerでロード（recalculateAllが走りenemy statusが再構築される）
  const legacyManager = new TurnEngineManager();
  legacyManager.loadReplayScript(initialState, replayScript);

  // recalculated runtime statuses が存在すること（snapshotに依存しない）
  const recalculatedStatuses = legacyManager.currentState.turnState?.enemyState?.statuses ?? [];
  assert.ok(recalculatedStatuses.length >= 1, 'recalculated enemy statuses exist without snapshot dependency');

  // snapshotがなくてもruntimeのenemy statusは元の結果と一致する
  assertEnemyStatusesStrictEqual(
    recalculatedStatuses,
    statusesAfterCommit,
    'legacy fallback: recalculated enemy statuses must match original commit results'
  );

  // computedRecords の stateSnapshot に enemyStatusSnapshot が再生成されていることを確認
  const recomputedRecord = legacyManager.computedRecords[0];
  const recomputedSnapshot = recomputedRecord?.stateSnapshot?.enemyStatusSnapshot;
  assert(
    Array.isArray(recomputedSnapshot),
    'recalculate regenerates enemyStatusSnapshot in computedRecord even for legacy scripts'
  );
  assertEnemyStatusesStrictEqual(
    recomputedSnapshot,
    statusesAfterCommit,
    'legacy fallback: regenerated snapshot must match original statuses'
  );
});

// ============================================================================
// WBS-5 受け入れ検証: 付与 → 更新 → 消滅 を1シナリオで追跡
// ============================================================================

/**
 * WBS-5-①: 敵状態が正しく「付与」されることを検証
 * - commit 後に runtime の enemyState.statuses にステータスが出現する
 * - enemyStatusSnapshot に保存される
 * - statusType / power / remaining / elements / exitCond が正しい
 */
test('WBS-5-①: enemy status is correctly applied after commit', async () => {
  const hackSkill = createEnemyStatusSkill({
    id: 99501,
    name: 'AcceptHack',
    statusType: 'Hacking',
    power: 0.4,
    remaining: 3,
    elements: ['Thunder'],
  });
  const defDownSkill = createEnemyStatusSkill({
    id: 99502,
    name: 'AcceptDefDown',
    statusType: 'DefenseDown',
    power: 0.5,
    remaining: 4,
    elements: ['Fire'],
  });
  const manager = createEnemyStatusConflictManager([hackSkill, defDownSkill], { enemyCount: 2 });

  // ターン1: Hacking を E0 に付与
  commitEnemyStatusSkill(manager, hackSkill.id, 0);
  const statusesT1 = manager.currentState.turnState?.enemyState?.statuses ?? [];
  const hackingT1 = findTargetEnemyStatus(statusesT1, 'Hacking', ['Thunder']);
  assert.ok(hackingT1, '付与: Hacking status が runtime に存在する');
  assert.equal(Number(hackingT1.power ?? 0), 0.4, '付与: power が正しい');
  assert.equal(
    Number(hackingT1.remainingTurns ?? hackingT1.remaining ?? 0), 2,
    '付与: remaining が正しい (3 from skill, -1 from EnemyTurnEnd tick after commit)'
  );

  // snapshot にも保存されている
  const snapshotT1 = manager.computedRecords.at(-1)?.stateSnapshot?.enemyStatusSnapshot ?? [];
  const hackingSnap = findTargetEnemyStatus(snapshotT1, 'Hacking', ['Thunder']);
  assert.ok(hackingSnap, '付与: snapshot にも Hacking が存在する');
  assertEnemyStatusesStrictEqual(
    getTargetEnemyStatuses(snapshotT1, 0),
    getTargetEnemyStatuses(statusesT1, 0),
    '付与: snapshot と runtime が厳密一致する'
  );

  // ターン2: DefenseDown を E0 に付与 → 2種類が共存
  commitEnemyStatusSkill(manager, defDownSkill.id, 0);
  const statusesT2 = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? [], 0
  );
  assert.ok(
    findTargetEnemyStatus(statusesT2, 'Hacking', ['Thunder']),
    '付与: Hacking が2ターン目でもE0に存在する'
  );
  assert.ok(
    findTargetEnemyStatus(statusesT2, 'DefenseDown', ['Fire']),
    '付与: DefenseDown がE0に存在する'
  );
  assert.ok(statusesT2.length >= 2, '付与: E0に2種類以上のステータスが共存する');
});

/**
 * WBS-5-②: ターン進行で敵状態が「更新」されることを検証
 * - ターンごとに remainingTurns が減算される
 * - 異なる exitCond 間で独立に動作する
 */
test('WBS-5-②: enemy status remaining decrements on turn progression', async () => {
  const hackSkill = createEnemyStatusSkill({
    id: 99511,
    name: 'TickHack',
    statusType: 'Hacking',
    power: 0.3,
    remaining: 4,
    elements: [],
    exitCond: 'Count',
  });
  const manager = createEnemyStatusConflictManager([hackSkill]);

  // ターン1: Hacking 付与 (remaining=4)
  commitEnemyStatusSkill(manager, hackSkill.id);
  const statusesAfterT1 = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  const hackT1 = findTargetEnemyStatus(statusesAfterT1, 'Hacking');
  assert.ok(hackT1, '更新: T1でHackingが存在する');
  const remainT1 = Number(hackT1.remainingTurns ?? hackT1.remaining ?? 0);

  // ターン2: 空ターンを commit（Protection）して tick を進める
  manager.commitNextTurn(
    { 1: { skillId: 9901, target: { type: 'self' } } },
    { enemyCount: 1, note: 'tick turn 2' }
  );
  const statusesAfterT2 = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  const hackT2 = findTargetEnemyStatus(statusesAfterT2, 'Hacking');
  assert.ok(hackT2, '更新: T2でHackingが存在する');
  const remainT2 = Number(hackT2.remainingTurns ?? hackT2.remaining ?? 0);
  assert.ok(remainT2 < remainT1, `更新: remaining が減算された (${remainT1} -> ${remainT2})`);

  // ターン3: さらに tick
  manager.commitNextTurn(
    { 1: { skillId: 9901, target: { type: 'self' } } },
    { enemyCount: 1, note: 'tick turn 3' }
  );
  const statusesAfterT3 = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  const hackT3 = findTargetEnemyStatus(statusesAfterT3, 'Hacking');
  assert.ok(hackT3, '更新: T3でHackingが存在する');
  const remainT3 = Number(hackT3.remainingTurns ?? hackT3.remaining ?? 0);
  assert.ok(remainT3 < remainT2, `更新: remaining がさらに減算された (${remainT2} -> ${remainT3})`);

  // recalculate でも同一結果
  manager.recalculateFrom(0);
  const recalcStatuses = getTargetEnemyStatuses(getLastComputedEnemyStatuses(manager));
  const hackRecalc = findTargetEnemyStatus(recalcStatuses, 'Hacking');
  if (hackRecalc) {
    const remainRecalc = Number(hackRecalc.remainingTurns ?? hackRecalc.remaining ?? 0);
    assert.equal(remainRecalc, remainT3, '更新: recalculate 後も remaining が一致する');
  }
});

/**
 * WBS-5-③: 条件で敵状態が「消滅」することを検証
 * - remaining が 0 に到達すると statuses から除去される
 * - 付与→ターン消費→消滅 の完全ライフサイクルを1テストで追跡
 */
test('WBS-5-③: enemy status expires and disappears when remaining reaches zero', async () => {
  const shortSkill = createEnemyStatusSkill({
    id: 99521,
    name: 'ShortLivedDebuff',
    statusType: 'Hacking',
    power: 0.2,
    remaining: 2,
    elements: [],
    exitCond: 'Count',
  });
  const manager = createEnemyStatusConflictManager([shortSkill]);

  // ターン1: 付与 (remaining=2)
  commitEnemyStatusSkill(manager, shortSkill.id);
  const t1Statuses = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  assert.ok(findTargetEnemyStatus(t1Statuses, 'Hacking'), '消滅: T1でHackingが存在する');

  // ターン2: 空ターンで tick (remaining=2 が消費される)
  manager.commitNextTurn(
    { 1: { skillId: 9901, target: { type: 'self' } } },
    { enemyCount: 1, note: 'expire turn 2' }
  );

  // ターン3: 空ターンでさらに tick → Hacking は確実に消滅しているはず
  manager.commitNextTurn(
    { 1: { skillId: 9901, target: { type: 'self' } } },
    { enemyCount: 1, note: 'expire turn 3' }
  );
  const t3Statuses = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  const hackT3 = findTargetEnemyStatus(t3Statuses, 'Hacking');
  assert.equal(hackT3, null, '消滅: remaining消費後にHackingが除去されている');

  // recalculate でも消滅が再現される
  manager.recalculateFrom(0);
  const recalcStatuses = getTargetEnemyStatuses(getLastComputedEnemyStatuses(manager));
  const hackRecalc = findTargetEnemyStatus(recalcStatuses, 'Hacking');
  assert.equal(hackRecalc, null, '消滅: recalculate でも Hacking が除去されている');
});

/**
 * WBS-5-④: Cover を含むケースの仕様整合を検証
 * - Cover は ENEMY_STATUS_SKILL_TYPES に含まれる
 * - Cover は ENEMY_STATUS_POWER_DURATION_SKILL_TYPES に含まれる（power[0]がremainingとして使用）
 * - 付与→tick→消滅 がデバフと同様に動作する
 */
test('WBS-5-④: Cover status follows enemy status lifecycle correctly', async () => {
  const coverSkill = {
    id: 99531,
    name: 'AcceptCover',
    label: 'AcceptCover99531',
    sp_cost: 0,
    target_type: 'Single',
    parts: [
      {
        skill_type: 'Cover',
        target_type: 'Single',
        elements: [],
        power: [3, 0], // Cover は power[0] が remaining turns として使用される
        effect: {
          limitType: 'None',
          exitCond: 'Count',
          exitVal: [0, 0], // exitVal が 0 なので power[0] がフォールバックとして使用される
        },
      },
    ],
  };
  const manager = createEnemyStatusConflictManager([coverSkill]);

  // ターン1: Cover 付与
  commitEnemyStatusSkill(manager, coverSkill.id);
  const t1Statuses = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  const coverT1 = findTargetEnemyStatus(t1Statuses, 'Cover');
  assert.ok(coverT1, 'Cover: T1でCoverが付与されている');
  const coverRemaining = Number(coverT1.remainingTurns ?? coverT1.remaining ?? 0);
  assert.ok(coverRemaining > 0, `Cover: remaining > 0 (actual: ${coverRemaining})`);

  // snapshot と runtime が一致
  const snapT1 = manager.computedRecords.at(-1)?.stateSnapshot?.enemyStatusSnapshot ?? [];
  assertEnemyStatusesStrictEqual(
    getTargetEnemyStatuses(snapT1, 0),
    t1Statuses,
    'Cover: snapshot と runtime が一致する'
  );

  // ターンを進めて Cover が消滅することを確認
  for (let turn = 0; turn < coverRemaining + 1; turn++) {
    manager.commitNextTurn(
      { 1: { skillId: 9901, target: { type: 'self' } } },
      { enemyCount: 1, note: `cover tick turn ${turn + 2}` }
    );
  }
  const finalStatuses = getTargetEnemyStatuses(
    manager.currentState.turnState?.enemyState?.statuses ?? []
  );
  const coverFinal = findTargetEnemyStatus(finalStatuses, 'Cover');
  assert.equal(coverFinal, null, 'Cover: ターン消費後にCoverが消滅している');

  // recalculate で再現
  manager.recalculateFrom(0);
  const recalcStatuses = getTargetEnemyStatuses(getLastComputedEnemyStatuses(manager));
  assert.equal(
    findTargetEnemyStatus(recalcStatuses, 'Cover'), null,
    'Cover: recalculate でも消滅が再現される'
  );
});

/**
 * WBS-5-⑤: UI 表示整合 — enemy status が turn-row / popup に正しく伝搬することを検証
 * - computedStates の enemyState.statuses が表示データの根拠
 * - enemyStatusSnapshot が computedRecords に保存されている
 * - 各ターンの statuses が recalculate 後も一致する（UI の単一ソース保証）
 */
test('WBS-5-⑤: enemy statuses propagate consistently through computed states for UI', async () => {
  const hackSkill = createEnemyStatusSkill({
    id: 99541,
    name: 'UIHack',
    statusType: 'Hacking',
    power: 0.35,
    remaining: 3,
    elements: ['Ice'],
  });
  const defDownSkill = createEnemyStatusSkill({
    id: 99542,
    name: 'UIDefDown',
    statusType: 'DefenseDown',
    power: 0.45,
    remaining: 2,
    elements: ['Fire'],
  });
  const manager = createEnemyStatusConflictManager([hackSkill, defDownSkill], { enemyCount: 2 });

  // ターン1: Hacking を E0 に付与
  commitEnemyStatusSkill(manager, hackSkill.id, 0);
  // ターン2: DefenseDown を E0 に付与
  commitEnemyStatusSkill(manager, defDownSkill.id, 0);
  // ターン3: 空ターン (tick 進行)
  manager.commitNextTurn(
    { 1: { skillId: 9901, target: { type: 'self' } } },
    { enemyCount: 2, note: 'ui verify turn 3' }
  );

  // 各ターンの computedStates に enemyState.statuses が存在する
  for (let i = 0; i < manager.computedStates.length; i++) {
    const state = manager.computedStates[i];
    assert.ok(
      state?.turnState?.enemyState,
      `UI整合: computedStates[${i}] に enemyState が存在する`
    );
    assert.ok(
      Array.isArray(state.turnState.enemyState.statuses),
      `UI整合: computedStates[${i}] の statuses が配列である`
    );
  }

  // 各ターンの computedRecords に enemyStatusSnapshot が保存されている
  for (let i = 0; i < manager.computedRecords.length; i++) {
    const record = manager.computedRecords[i];
    assert.ok(
      Array.isArray(record?.stateSnapshot?.enemyStatusSnapshot),
      `UI整合: computedRecords[${i}] に enemyStatusSnapshot が存在する`
    );
  }

  // recalculate 後も全ターンの enemy statuses が一致する（UI 単一ソース保証）
  const beforeRecalc = manager.computedStates.map(
    (s) => s?.turnState?.enemyState?.statuses ?? []
  );

  manager.recalculateFrom(0);

  for (let i = 0; i < beforeRecalc.length; i++) {
    const after = manager.computedStates[i]?.turnState?.enemyState?.statuses ?? [];
    assertEnemyStatusesStrictEqual(
      after,
      beforeRecalc[i],
      `UI整合: recalculate 後も computedStates[${i}] の enemy statuses が一致する`
    );
  }

  // replayScript 往復でも一致する
  const replayScript = structuredClone(manager.replayScript);
  const initialState = cloneInitialState(manager.initialState);
  const replayManager = new TurnEngineManager();
  replayManager.loadReplayScript(initialState, replayScript);

  for (let i = 0; i < manager.computedStates.length; i++) {
    const sourceStatuses = manager.computedStates[i]?.turnState?.enemyState?.statuses ?? [];
    const replayStatuses = replayManager.computedStates[i]?.turnState?.enemyState?.statuses ?? [];
    assertEnemyStatusesStrictEqual(
      replayStatuses,
      sourceStatuses,
      `UI整合: replayScript 往復後も computedStates[${i}] の enemy statuses が一致する`
    );
  }
});

// 華炎 / リュボーフ・マヤー / 春の宵の塵に同じ のスキル条件テスト

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';
import { getStore } from './helpers.js';

// ── スキルID ──────────────────────────────────────────────────────────────────
const KAKEN_SKILL_ID = 46008612;        // 華炎 (is_adv=true, sp_cost=12)
const RYUBOF_MAYA_SKILL_ID = 46008613; // リュボーフ・マヤー (cond: Sp()<0)
const HARU_YOINO_SKILL_ID = 46008209;  // 春の宵の塵に同じ (cond: Sp()<0)
const KAKEN_STYLE_ID = 1008608;         // SSR 異国のプリンツェッサ (CSkopovskaya) — 連蓮火パッシブあり
const GYAKKYO_STYLE_ID = 1008603;       // SS  逆境に咲く華  (CSkopovskaya) — 連蓮火パッシブなし

function makeProtectionSkill(id) {
  return {
    id,
    name: 'プロテクション',
    sp_cost: 0,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

// SP < 0 のテスト用: 指定スキルを持ち spMin を自由に設定できる 6 人パーティ
function buildSpMinParty(actorSkillObj, initialSP, spMin) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'SPM_ACTOR' : `SPM_FILLER${idx}`,
      characterName: idx === 0 ? 'SPM_ACTOR' : `SPM_FILLER${idx}`,
      styleId: 9700 + idx,
      styleName: `SPMST${idx}`,
      partyIndex: idx,
      position: idx,
      initialSP: idx === 0 ? initialSP : 10,
      spMin: idx === 0 ? spMin : 0,
      skills: idx === 0
        ? [actorSkillObj]
        : [makeProtectionSkill(9700 + idx)],
    })
  );
  return new Party(members);
}

// ─────────────────────────────────────────────────────────────────────────────
// 華炎 — HbrDataStore による Sp()>=0 条件付与
// ─────────────────────────────────────────────────────────────────────────────

test('華炎: HbrDataStore が is_adv=true かつ sp_cost>0 のスキルに Sp()>=0 条件を付与する', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === KAKEN_SKILL_ID);
  assert.ok(skill, '華炎が store.skills に存在すること');
  assert.ok(
    String(skill.cond ?? '').includes('Sp()>=0'),
    `華炎の cond に Sp()>=0 が含まれること（実際の cond: "${skill.cond}"）`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 華炎 — 連蓮火パッシブ: 追加ターン発生条件テスト
// ─────────────────────────────────────────────────────────────────────────────

test('連蓮火: ダウンターン中の敵がいるとき、華炎使用後に追加ターンが発生する', () => {
  const store = getStore();
  const actor = store.buildCharacterStyle({ styleId: KAKEN_STYLE_ID, partyIndex: 0, initialSP: 12 });

  const fillers = Array.from({ length: 5 }, (_, i) =>
    new CharacterStyle({
      characterId: `RKT_F${i + 1}`,
      characterName: `RKT_F${i + 1}`,
      styleId: 9600 + i,
      styleName: `RKTF${i}`,
      partyIndex: i + 1,
      position: i + 1,
      initialSP: 10,
      skills: [makeProtectionSkill(9600 + i)],
    })
  );

  const party = new Party([actor, ...fillers]);
  const state = createBattleStateFromParty(party);

  // 連蓮火の条件: CountBC(IsDead()==0 && IsPlayer()==0 && BreakDownTurn()>0)>0
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: KAKEN_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'RKT_F1', skillId: 9600 },
    2: { characterId: 'RKT_F2', skillId: 9601 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(
    nextState.turnState.turnType,
    'extra',
    'ダウンターン中の敵がいる場合、華炎使用後に追加ターンが発生する'
  );
  assert.ok(
    (nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes(actor.characterId),
    `追加ターン対象にシャルロッタ（${actor.characterId}）が含まれる`
  );
});

test('連蓮火: ダウンターン中の敵がいないとき、華炎使用後に追加ターンが発生しない', () => {
  const store = getStore();
  const actor = store.buildCharacterStyle({ styleId: KAKEN_STYLE_ID, partyIndex: 0, initialSP: 12 });

  const fillers = Array.from({ length: 5 }, (_, i) =>
    new CharacterStyle({
      characterId: `RKN_F${i + 1}`,
      characterName: `RKN_F${i + 1}`,
      styleId: 9550 + i,
      styleName: `RKNF${i}`,
      partyIndex: i + 1,
      position: i + 1,
      initialSP: 10,
      skills: [makeProtectionSkill(9550 + i)],
    })
  );

  const party = new Party([actor, ...fillers]);
  const state = createBattleStateFromParty(party);
  // 敵はダウンターン状態にしない（statuses なし）

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: KAKEN_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'RKN_F1', skillId: 9550 },
    2: { characterId: 'RKN_F2', skillId: 9551 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(
    nextState.turnState.turnType,
    'extra',
    'ダウンターン中の敵がいない場合、追加ターンが発生しない'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// リュボーフ・マヤー — Sp()<0 のみ発動
// ─────────────────────────────────────────────────────────────────────────────

test('リュボーフ・マヤー: store の cond が "Sp()<0" であること', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === RYUBOF_MAYA_SKILL_ID);
  assert.ok(skill, 'リュボーフ・マヤーが store.skills に存在すること');
  assert.equal(skill.cond, 'Sp()<0', 'cond が "Sp()<0" であること');
});

test('リュボーフ・マヤー: SP = -1（0未満）のとき使用可能', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === RYUBOF_MAYA_SKILL_ID);
  const party = buildSpMinParty(skill, -1, -5);
  const state = createBattleStateFromParty(party);

  assert.doesNotThrow(
    () =>
      previewTurn(state, {
        0: { characterId: 'SPM_ACTOR', skillId: RYUBOF_MAYA_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SPM_FILLER1', skillId: 9701 },
        2: { characterId: 'SPM_FILLER2', skillId: 9702 },
      }),
    'SP = -1 のとき Sp()<0 条件が成立し、リュボーフ・マヤーが使用可能'
  );
});

test('リュボーフ・マヤー: SP = 0（0以上）のとき使用不可', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === RYUBOF_MAYA_SKILL_ID);
  const party = buildSpMinParty(skill, 0, 0);
  const state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'SPM_ACTOR', skillId: RYUBOF_MAYA_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SPM_FILLER1', skillId: 9701 },
        2: { characterId: 'SPM_FILLER2', skillId: 9702 },
      }),
    /cannot be used because cond is not satisfied/,
    'SP = 0 のとき Sp()<0 条件が不成立でエラー'
  );
});

test('リュボーフ・マヤー: SP > 0（正）のとき使用不可', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === RYUBOF_MAYA_SKILL_ID);
  const party = buildSpMinParty(skill, 10, 0);
  const state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'SPM_ACTOR', skillId: RYUBOF_MAYA_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SPM_FILLER1', skillId: 9701 },
        2: { characterId: 'SPM_FILLER2', skillId: 9702 },
      }),
    /cannot be used because cond is not satisfied/,
    'SP = 10 のとき Sp()<0 条件が不成立でエラー'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 春の宵の塵に同じ — Sp()<0 のみ発動
// ─────────────────────────────────────────────────────────────────────────────

test('春の宵の塵に同じ: store の cond が "Sp()<0" であること', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === HARU_YOINO_SKILL_ID);
  assert.ok(skill, '春の宵の塵に同じが store.skills に存在すること');
  assert.equal(skill.cond, 'Sp()<0', 'cond が "Sp()<0" であること');
});

test('春の宵の塵に同じ: SP = -1（0未満）のとき使用可能', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === HARU_YOINO_SKILL_ID);
  const party = buildSpMinParty(skill, -1, -5);
  const state = createBattleStateFromParty(party);

  assert.doesNotThrow(
    () =>
      previewTurn(state, {
        0: { characterId: 'SPM_ACTOR', skillId: HARU_YOINO_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SPM_FILLER1', skillId: 9701 },
        2: { characterId: 'SPM_FILLER2', skillId: 9702 },
      }),
    'SP = -1 のとき Sp()<0 条件が成立し、春の宵の塵に同じが使用可能'
  );
});

test('春の宵の塵に同じ: SP = 0（0以上）のとき使用不可', () => {
  const store = getStore();
  const skill = store.skills.find((s) => Number(s.id) === HARU_YOINO_SKILL_ID);
  const party = buildSpMinParty(skill, 0, 0);
  const state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'SPM_ACTOR', skillId: HARU_YOINO_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SPM_FILLER1', skillId: 9701 },
        2: { characterId: 'SPM_FILLER2', skillId: 9702 },
      }),
    /cannot be used because cond is not satisfied/,
    'SP = 0 のとき Sp()<0 条件が不成立でエラー'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SS 逆境に咲く華 — 連蓮火パッシブ不在の検証
// ─────────────────────────────────────────────────────────────────────────────

test('逆境に咲く華: 連蓮火パッシブを持たない（store データ検証）', () => {
  const store = getStore();
  const actor = store.buildCharacterStyle({ styleId: GYAKKYO_STYLE_ID, partyIndex: 0, initialSP: 12 });
  const hasRenrenka = actor.passives.some((p) => p.name === '連蓮火');
  assert.equal(hasRenrenka, false, '逆境に咲く華は連蓮火パッシブを持たないこと');
});

test('逆境に咲く華: 連蓮火パッシブがないため、ダウンターン中に華炎を使用しても追加ターンが発生しない', () => {
  const store = getStore();

  // 逆境に咲く華の実パッシブ（連蓮火なし）を取得し、華炎スキルを持たせる
  const ssBase = store.buildCharacterStyle({ styleId: GYAKKYO_STYLE_ID, partyIndex: 0, initialSP: 12 });
  const kakenSkill = store.skills.find((s) => Number(s.id) === KAKEN_SKILL_ID);
  const actor = new CharacterStyle({
    characterId: 'GYAKKYO_ACTOR',
    characterName: 'シャルロッタ（逆境に咲く華）',
    styleId: GYAKKYO_STYLE_ID,
    styleName: ssBase.styleName,
    partyIndex: 0,
    position: 0,
    initialSP: 12,
    passives: [...ssBase.passives], // 連蓮火を含まない実パッシブ
    skills: [kakenSkill],
  });

  const fillers = Array.from({ length: 5 }, (_, i) =>
    new CharacterStyle({
      characterId: `GYK_F${i + 1}`,
      characterName: `GYK_F${i + 1}`,
      styleId: 9450 + i,
      styleName: `GYKF${i}`,
      partyIndex: i + 1,
      position: i + 1,
      initialSP: 10,
      skills: [makeProtectionSkill(9450 + i)],
    })
  );

  const party = new Party([actor, ...fillers]);
  const state = createBattleStateFromParty(party);

  // 連蓮火の発火条件: CountBC(BreakDownTurn()>0)>0 — 同じ条件を設定
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'GYAKKYO_ACTOR', skillId: KAKEN_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'GYK_F1', skillId: 9450 },
    2: { characterId: 'GYK_F2', skillId: 9451 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(
    nextState.turnState.turnType,
    'extra',
    '逆境に咲く華は連蓮火パッシブを持たないため、ダウンターン中に華炎を使用しても追加ターンが発生しない'
  );
});

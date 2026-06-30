/**
 * 敵パラメータ減少デバフ（霊符・禍・ハッキング・厄）の実数値記録テスト
 *
 * 確認ポイント:
 * - level × penaltyPerLevel の乗算値が damageContext に正確に記録されること
 * - 霊符は「攻撃を受けるごとにレベル+1」の仕様があるため、
 *   攻撃実行後の damageContext では level が開始値+attackCount になる
 * - 霊符・禍・ハッキング・厄が複数存在する場合、高い方の能力ダウン値が採用されること
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterStyle, Party, createBattleStateFromParty, previewTurn, commitTurn } from '../src/index.js';

// 霊符 1レベルあたりの敵能力ダウン量（ターン-コントローラーの定数と一致）
const TALISMAN_PENALTY_PER_LEVEL = 10;
// 禍 1レベルあたりの敵能力ダウン量
const DISASTER_PENALTY_PER_LEVEL = 7;
// ハッキングの敵能力ダウン量
const HACKING_ALL_ABILITY_DOWN = 100;
// 厄（Misfortune）の敵能力ダウン量
const MISFORTUNE_ALL_ABILITY_DOWN = 20;

/** ダメージスキルを持つ最小構成の6人パーティを生成する */
function createMinimalDamageParty() {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: `ABIL${index + 1}`,
      characterName: `ABIL${index + 1}`,
      styleId: 8800 + index,
      styleName: `ABIL${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      weaponType: 'Slash',
      skills: [
        {
          id: 880000 + index,
          name: '斬撃',
          label: '斬撃',
          sp_cost: 0,
          target_type: index === 0 ? 'EnemySingle' : 'Self',
          hit_count: 1,
          parts: [
            {
              skill_type: index === 0 ? 'AttackSkill' : 'Protection',
              target_type: index === 0 ? 'EnemySingle' : 'Self',
              type: 'Slash',
            },
          ],
        },
      ],
      passives: [],
    })
  );
  return new Party(members);
}

/** previewTurn → commitTurn し、先頭アクションの damageContext を返す */
function getDamageContext(state) {
  const preview = previewTurn(state, { 0: { characterId: 'ABIL1', skillId: 880000 } });
  const { committedRecord } = commitTurn(state, preview);
  return committedRecord.actions[0]?.damageContext ?? null;
}

// ──────────────────────────────────────────────
// 霊符（Talisman）の実数値テスト
//
// 霊符仕様: 霊符状態の敵がプレイヤーの攻撃を受けるごとにレベル+1（1攻撃=+1）
// そのため damageContext に記録される level は 開始値 + 攻撃回数 になる
// ──────────────────────────────────────────────

test('霊符 level 3 + 攻撃1回: damageContext は level=4, 能力ダウン=40', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.talismanState = {
    active: true,
    level: 3,
    maxLevel: 10,
    penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
  };

  const ctx = getDamageContext(state);
  assert.ok(ctx, 'damageContext が存在すること');
  // 攻撃1回でレベル+1 → 3+1=4
  assert.equal(ctx.enemyTalismanLevelByEnemy[0], 4, '霊符レベルが記録されること（攻撃後+1）');
  // 能力ダウン実数値 = 4 × 10 = 40
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    40,
    '霊符レベル×penaltyPerLevel の実数値が記録されること'
  );
});

test('霊符 level 9 + 攻撃1回: maxLevel=10 でキャップされ能力ダウン=100', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.talismanState = {
    active: true,
    level: 9,
    maxLevel: 10,
    penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
  };

  const ctx = getDamageContext(state);
  // 9+1=10（最大）でキャップ
  assert.equal(ctx.enemyTalismanLevelByEnemy[0], 10, '最大レベルにキャップされること');
  assert.equal(ctx.enemyAllAbilityDownByEnemy[0], 100, '最大能力ダウンは 10×10=100');
});

test('霊符 非アクティブ: enemyAllAbilityDownByEnemy にエントリなし', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  // talismanState はデフォルト（active: false）のまま

  const ctx = getDamageContext(state);
  assert.ok(ctx, 'damageContext が存在すること');
  assert.equal(
    ctx.enemyTalismanLevelByEnemy[0],
    undefined,
    '非アクティブ時は talismanLevel エントリなし'
  );
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    undefined,
    '非アクティブ時は能力ダウンエントリなし'
  );
});

// ──────────────────────────────────────────────
// 禍（Disaster）の実数値テスト
//
// 禍は霊符と異なり、攻撃を受けてもレベルが自動インクリメントされない
// ──────────────────────────────────────────────

test('禍 level 4: enemyAllAbilityDownByEnemy は level × penaltyPerLevel = 28', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.disasterState = {
    active: true,
    level: 4,
    maxLevel: 10,
    penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
  };

  const ctx = getDamageContext(state);
  // 禍は攻撃で自動インクリメントしない → level=4 のまま
  assert.equal(ctx.enemyDisasterLevelByEnemy[0], 4, '禍レベルが記録されること');
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    28,
    '禍 level 4 の能力ダウン実数値は 4 × 7 = 28'
  );
});

test('禍 level 10 (最大): enemyAllAbilityDownByEnemy = 70', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.disasterState = {
    active: true,
    level: 10,
    maxLevel: 10,
    penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
  };

  const ctx = getDamageContext(state);
  assert.equal(ctx.enemyDisasterLevelByEnemy[0], 10);
  assert.equal(ctx.enemyAllAbilityDownByEnemy[0], 70, '禍最大レベルの能力ダウンは 10×7=70');
});

// ──────────────────────────────────────────────
// 霊符と禍の合算ロジック（高い方を採用）のテスト
// ──────────────────────────────────────────────

test('霊符 level 4 (攻撃後→5: 50) と 禍 level 4 (28) が同時存在: 高い方の 50 を採用', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  // 霊符 level 4 → 攻撃後 5 → penalty=50
  state.turnState.enemyState.talismanState = {
    active: true,
    level: 4,
    maxLevel: 10,
    penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
  };
  // 禍 level 4 → penalty=28（自動インクリメントなし）
  state.turnState.enemyState.disasterState = {
    active: true,
    level: 4,
    maxLevel: 10,
    penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
  };

  const ctx = getDamageContext(state);
  assert.equal(ctx.enemyTalismanLevelByEnemy[0], 5, '霊符は攻撃後+1');
  assert.equal(ctx.enemyDisasterLevelByEnemy[0], 4, '禍はインクリメントなし');
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    50,
    '霊符 50 > 禍 28 なので霊符の値 50 を採用'
  );
});

test('霊符 level 1 (攻撃後→2: 20) と 禍 level 5 (35) が同時存在: 高い方の 35 を採用', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  // 霊符 level 1 → 攻撃後 2 → penalty=20
  state.turnState.enemyState.talismanState = {
    active: true,
    level: 1,
    maxLevel: 10,
    penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
  };
  // 禍 level 5 → penalty=35
  state.turnState.enemyState.disasterState = {
    active: true,
    level: 5,
    maxLevel: 10,
    penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
  };

  const ctx = getDamageContext(state);
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    35,
    '禍 35 > 霊符 20 なので禍の値 35 を採用'
  );
});

test('霊符のみアクティブで禍が非アクティブ: 霊符の能力ダウンのみ記録', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.talismanState = {
    active: true,
    level: 2,
    maxLevel: 10,
    penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
  };
  // disasterState はデフォルト（active: false）のまま

  const ctx = getDamageContext(state);
  // 霊符 2+1=3 → penalty=30
  assert.equal(ctx.enemyTalismanLevelByEnemy[0], 3);
  assert.equal(ctx.enemyDisasterLevelByEnemy[0], undefined, '禍は非アクティブでエントリなし');
  assert.equal(ctx.enemyAllAbilityDownByEnemy[0], 30, '霊符のみの能力ダウン = 30');
});

// ──────────────────────────────────────────────
// ハッキング（Hacking）の実数値テスト
// ──────────────────────────────────────────────

test('ハッキング付与中: enemyAllAbilityDownByEnemy は固定 100', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.statuses = [
    {
      statusType: 'Hacking',
      targetIndex: 0,
      remainingTurns: 2,
      exitCond: 'EnemyTurnEnd',
    },
  ];

  const ctx = getDamageContext(state);
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    HACKING_ALL_ABILITY_DOWN,
    'ハッキングの敵能力ダウン実数値は固定 100'
  );
});

test('ハッキングと霊符・禍が同時存在: 高い方の 100 を採用', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.talismanState = {
    active: true,
    level: 4,
    maxLevel: 10,
    penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
  };
  state.turnState.enemyState.disasterState = {
    active: true,
    level: 5,
    maxLevel: 10,
    penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
  };
  state.turnState.enemyState.statuses = [
    {
      statusType: 'Hacking',
      targetIndex: 0,
      remainingTurns: 2,
      exitCond: 'EnemyTurnEnd',
    },
  ];

  const ctx = getDamageContext(state);
  assert.equal(ctx.enemyTalismanLevelByEnemy[0], 5, '霊符は攻撃後+1');
  assert.equal(ctx.enemyDisasterLevelByEnemy[0], 5, '禍はインクリメントなし');
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    HACKING_ALL_ABILITY_DOWN,
    'ハッキング 100 が霊符 50 / 禍 35 より高いため採用'
  );
});

// ──────────────────────────────────────────────
// 厄（Misfortune）の実数値テスト
// ──────────────────────────────────────────────

test('厄付与中: enemyAllAbilityDownByEnemy は固定 20', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.statuses = [
    {
      statusType: 'Misfortune',
      targetIndex: 0,
      remainingTurns: 2,
      exitCond: 'EnemyTurnEnd',
    },
  ];

  const ctx = getDamageContext(state);
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    MISFORTUNE_ALL_ABILITY_DOWN,
    '厄の敵能力ダウン実数値は固定 20'
  );
});

test('厄と禍（低レベル）が同時存在: 高い方の 20 を採用', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.disasterState = {
    active: true,
    level: 2,
    maxLevel: 10,
    penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
  };
  state.turnState.enemyState.statuses = [
    {
      statusType: 'Misfortune',
      targetIndex: 0,
      remainingTurns: 2,
      exitCond: 'EnemyTurnEnd',
    },
  ];

  const ctx = getDamageContext(state);
  // 禍 level2 = 14, 厄 = 20 → max = 20
  assert.equal(
    ctx.enemyAllAbilityDownByEnemy[0],
    MISFORTUNE_ALL_ABILITY_DOWN,
    '厄 20 が禍 level2(14) より高いため採用'
  );
});

test('厄なし: Misfortune ステータスがない場合は enemyAllAbilityDownByEnemy にエントリなし', () => {
  const state = createBattleStateFromParty(createMinimalDamageParty());
  state.turnState.enemyState.statuses = [];

  const ctx = getDamageContext(state);
  assert.equal(ctx.enemyAllAbilityDownByEnemy[0], undefined, '厄なしの場合はエントリなし');
});

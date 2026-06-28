/**
 * 条件式 AST 評価器。
 *
 * cond-parser が生成した AST と評価コンテキストを受け取り、
 * boolean 結果 + known/unknown カウントを返す。
 *
 * 従来 src/turn/turn-controller.js の evaluateConditionExpression() と同じ
 * 「unknown 述語は安全側(value:true) で fallback する」挙動を維持する。
 *
 * ## 入力（ConditionContext）
 *   {
 *     state:   { turnIndex, odGauge, zone, territory, talismanActive, isOverDrive },
 *     member:  { sp, ep, dpRate, token, morale, motivation, markStates, position,
 *                isAlive, isBreak, isShredding, isReinforcedMode, specialStatuses,
 *                characterId, team, elements, weaponElement, role,
 *                isAttackNormal, isApplyLearning, debuffIconCount,
 *                hasSkill(label), getSkillUseCountByLabel(label) },
 *     skill:   { label, tier, spCost },
 *     action:  { breakHitCount, removeDebuffCount, targetEnemyIndex },
 *     target:  { isWeakToElement(el), isTargetWeakNatureElement(el),
 *                damageRate, breakDownTurn, isBroken, isDead, isCharging,
 *                debuffIconCount },
 *     party:   [member, ...],      // CountBC の player 側反復用
 *     enemies: [enemy, ...],       // CountBC の enemy 側反復用
 *   }
 *
 * ## 出力（EvaluationResult）
 *   { result:boolean, knownCount:number, unknownCount:number, trace?:TraceEntry[] }
 *
 * CountBC(<bool式>) は party + enemies の各キャラクターに対して内側式を評価し、
 * 真となった数を返す。内側式の IsPlayer()==1 で player 側、IsPlayer()==0 で enemy 側に絞り込む。
 */

import { parseConditionOrThrow } from './cond-parser.js';

/**
 * 空の評価コンテキスト。フィールド欠損時の安全なデフォルト。
 * テストや最小構成で評価を試す際に使う。
 */
export function createEmptyContext(overrides = {}) {
  const member = {
    sp: { current: 0 },
    ep: { current: 0 },
    dpRate: 1.0,
    token: { current: 0 },
    morale: { current: 0 },
    motivation: { current: 0 },
    markStates: {},
    position: 99,
    isAlive: true,
    isBreak: false,
    isShredding: false,
    isReinforcedMode: false,
    specialStatuses: new Set(),
    characterId: '',
    team: '',
    elements: [],
    weaponElement: '',
    role: '',
    isAttackNormal: false,
    isApplyLearning: false,
    debuffIconCount: 0,
    hasSkill: () => false,
    getSkillUseCountByLabel: () => 0,
  };
  return {
    state: {
      turnIndex: 1,
      odGauge: 0,
      zone: '',
      territory: '',
      talismanActive: false,
      isOverDrive: false,
    },
    member,
    skill: { label: '', tier: '', spCost: 0 },
    action: { breakHitCount: 0, removeDebuffCount: 0, targetEnemyIndex: -1 },
    target: {
      isWeakToElement: () => false,
      isTargetWeakNatureElement: () => false,
      damageRate: 0,
      breakDownTurn: 0,
      isBroken: false,
      isDead: false,
      isCharging: false,
      debuffIconCount: 0,
    },
    party: [],
    enemies: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 比較演算
// ---------------------------------------------------------------------------

function compareNumbers(left, op, right) {
  switch (op) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// AST 評価コア
// ---------------------------------------------------------------------------

/**
 * AST を評価する。
 * @param {object} ast - cond-parser が生成した AST
 * @param {object} context - ConditionContext
 * @param {boolean} [collectTrace=false]
 * @returns {{result:boolean, knownCount:number, unknownCount:number, trace?:object[]}}
 */
export function evaluateAst(ast, context, collectTrace = false) {
  const acc = { knownCount: 0, unknownCount: 0, trace: collectTrace ? [] : undefined };
  const result = evalNode(ast, context, acc);
  return { result: Boolean(result), knownCount: acc.knownCount, unknownCount: acc.unknownCount, trace: acc.trace };
}

function evalNode(node, context, acc) {
  switch (node.type) {
    case 'literal':
      return node.value;

    case 'or': {
      let anyTrue = false;
      for (const child of node.children) {
        const v = evalNode(child, context, acc);
        if (v) { anyTrue = true; }
      }
      return anyTrue;
    }

    case 'and': {
      for (const child of node.children) {
        const v = evalNode(child, context, acc);
        if (!v) return false;
      }
      return true;
    }

    case 'compare': {
      const left = evalOperand(node.left, context, acc);
      const right = evalOperand(node.right, context, acc);
      if (!left.known || !right.known) {
        acc.unknownCount += 1;
        return true; // safe-side fallback
      }
      acc.knownCount += 1;
      return compareNumbers(Number(left.value), node.op, Number(right.value));
    }

    case 'call':
    case 'countBc': {
      // bare call (truthy) — 比較演算子を伴わない単独呼び出し
      const resolved = evalOperand(node, context, acc);
      if (!resolved.known) {
        acc.unknownCount += 1;
        return true;
      }
      acc.knownCount += 1;
      return Boolean(Number(resolved.value));
    }

    default:
      acc.unknownCount += 1;
      return true;
  }
}

/**
 * operand（call / number / countBc）を数値に解決する。
 * @returns {{known:boolean, value:number}}
 */
function evalOperand(node, context, acc) {
  switch (node.type) {
    case 'number':
      return { known: true, value: node.value };
    case 'call':
      return resolvePredicate(node.name, node.args, context, acc);
    case 'countBc':
      return resolveCountBc(node, context, acc);
    default:
      return { known: false, value: 0 };
  }
}

// ---------------------------------------------------------------------------
// CountBC: 内側 boolean 式を各キャラクターで評価し、真となった数を数える
// ---------------------------------------------------------------------------

function resolveCountBc(node, context, acc) {
  const count = countCountBcMatches(node, context, acc);
  const rhsResolved = evalOperand(node.rhs, context, acc);
  if (!rhsResolved.known) return { known: false, value: 0 };
  const matched = compareNumbers(count, node.op, Number(rhsResolved.value));
  return { known: true, value: matched ? 1 : 0 };
}

function countCountBcMatches(node, context, acc) {
  const players = Array.isArray(context.party) ? context.party : [];
  const enemies = Array.isArray(context.enemies) ? context.enemies : [];
  let count = 0;
  for (const char of [...players, ...enemies]) {
    const subContext = { ...context, member: char };
    if (evalNode(node.inner, subContext, acc)) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 述語ディスパッチヘルパー
// ---------------------------------------------------------------------------

const MARK_LEVEL_PREDICATES = Object.freeze({
  FireMarkLevel: 'Fire', IceMarkLevel: 'Ice', ThunderMarkLevel: 'Thunder',
  DarkMarkLevel: 'Dark', LightMarkLevel: 'Light',
});

const ROLE_PREDICATES = Object.freeze({
  IsAttacker: 'Attacker', IsBlaster: 'Blaster', IsBreaker: 'Breaker',
  IsDefender: 'Defender', IsBuffer: 'Buffer', IsDebuffer: 'Debuffer', IsHealer: 'Healer',
});

const DEFAULT_CONQUEST_BIKE_LEVEL = 160;

function getSpecialStatusCount(member, typeId) {
  const ss = member?.specialStatuses;
  if (!ss) return 0;
  if (ss instanceof Map) return Number(ss.get(Number(typeId)) ?? 0);
  if (typeof ss.getSpecialStatusCount === 'function') {
    return Number(ss.getSpecialStatusCount(Number(typeId)) ?? 0);
  }
  return Number(ss[Number(typeId)] ?? 0);
}

/**
 * 述語を解決する。全51種類をカバー。未対応/コンテキスト不足は {known:false} で安全側 fallback。
 * @param {string} name
 * @param {object[]} args
 * @param {object} context
 * @returns {{known:boolean, value:number}}
 */
export function resolvePredicate(name, args, context) {
  const { state, member, skill, action, target } = context;
  const arg0 = args[0]?.value ?? '';

  // --- 数値を返す zero-arg 述語 ---
  switch (name) {
    case 'Sp':
      return { known: true, value: Number(member?.sp?.current ?? 0) };
    case 'Ep':
      return { known: true, value: Number(member?.ep?.current ?? 0) };
    case 'DpRate':
      return { known: true, value: Number(member?.dpRate ?? 1.0) };
    case 'OverDriveGauge':
      return { known: true, value: Number(state?.odGauge ?? 0) };
    case 'Token':
      return { known: true, value: Number(member?.token?.current ?? 0) };
    case 'MoraleLevel':
      return { known: true, value: Number(member?.morale?.current ?? 0) };
    case 'MotivationLevel':
      return { known: true, value: Number(member?.motivation?.current ?? 0) };
    case 'DamageRate':
      return { known: true, value: Number(target?.damageRate ?? 0) };
    case 'BreakHitCount':
      return { known: true, value: Number(action?.breakHitCount ?? 0) };
    case 'RemoveDebuffCount':
      return { known: true, value: Number(action?.removeDebuffCount ?? 0) };
    case 'Turn':
      return { known: true, value: Number(state?.turnIndex ?? 1) };
    case 'ConsumeSp':
      return { known: true, value: Number(skill?.spCost ?? 0) };
    case 'ConquestBikeLevel':
      return { known: true, value: DEFAULT_CONQUEST_BIKE_LEVEL };
    case 'Random': {
      const tier = String(skill?.tier ?? '').trim().toUpperCase();
      const DEFAULTS = { A: 0, S: 0, SS: 0, SSR: 0 };
      return { known: true, value: Object.hasOwn(DEFAULTS, tier) ? DEFAULTS[tier] : 1 };
    }
    case 'BreakDownTurn':
    case 'TargetBreakDownTurn':
      return { known: true, value: Number(target?.breakDownTurn ?? 0) };
    case 'DebuffIconCount':
      return { known: true, value: Number(member?.debuffIconCount ?? target?.debuffIconCount ?? 0) };
    default:
      break;
  }

  // --- Mark level ---
  if (MARK_LEVEL_PREDICATES[name]) {
    const element = MARK_LEVEL_PREDICATES[name];
    return { known: true, value: Number(member?.markStates?.[element]?.current ?? 0) };
  }

  // --- boolean zero-arg 述語（0/1）---
  switch (name) {
    case 'IsPlayer':
      return { known: true, value: member?.isPlayer === false ? 0 : 1 };
    case 'IsOverDrive':
      return { known: true, value: state?.isOverDrive ? 1 : 0 };
    case 'IsReinforcedMode':
      return { known: true, value: member?.isReinforcedMode ? 1 : 0 };
    case 'IsShredding':
      return { known: true, value: member?.isShredding ? 1 : 0 };
    case 'IsCharging':
      return { known: true, value: getSpecialStatusCount(member, 25) > 0 ? 1 : 0 };
    case 'IsFront':
      return { known: true, value: Number(member?.position ?? 99) <= 2 ? 1 : 0 };
    case 'IsDead':
      return { known: true, value: member?.isAlive === false ? 1 : 0 };
    case 'IsBroken':
      return { known: true, value: member?.isBreak ? 1 : 0 };
    case 'IsEnemyCharge':
      return { known: true, value: target?.isCharging ? 1 : 0 };
    case 'IsApplyLearning':
      return { known: true, value: member?.isApplyLearning ? 1 : 0 };
    case 'IsHitWeak':
      if (target && typeof target.isWeakToElement === 'function') {
        return { known: true, value: target.isWeakToElement(skill?.element ?? '') ? 1 : 0 };
      }
      return { known: false, value: 1 };
    case 'IsAttackNormal':
      return { known: true, value: (skill?.isNormalAttack ?? member?.isAttackNormal) ? 1 : 0 };
    default:
      break;
  }

  // --- Role 述語 (IsAttacker 等) ---
  if (ROLE_PREDICATES[name]) {
    return { known: true, value: String(member?.role ?? '') === ROLE_PREDICATES[name] ? 1 : 0 };
  }

  // --- one-arg boolean 述語 ---
  switch (name) {
    case 'IsCharacter':
      return { known: true, value: String(member?.characterId ?? '') === arg0 ? 1 : 0 };
    case 'IsTeam':
      return { known: true, value: String(member?.team ?? '') === arg0 ? 1 : 0 };
    case 'IsZone':
      return { known: true, value: String(state?.zone ?? '') === arg0 ? 1 : 0 };
    case 'IsTerritory':
      return { known: true, value: String(state?.territory ?? '') === arg0 ? 1 : 0 };
    case 'HasSkill':
      if (typeof member?.hasSkill === 'function') {
        return { known: true, value: member.hasSkill(arg0) ? 1 : 0 };
      }
      return { known: false, value: 1 };
    case 'IsNatureElement':
      return { known: true, value: Array.isArray(member?.elements) && member.elements.includes(arg0) ? 1 : 0 };
    case 'IsWeakElement':
      if (target && typeof target.isWeakToElement === 'function') {
        return { known: true, value: target.isWeakToElement(arg0) ? 1 : 0 };
      }
      return { known: false, value: 1 };
    case 'IsRole':
      return { known: true, value: String(member?.role ?? '') === arg0 ? 1 : 0 };
    case 'IsWeaponElement':
      return { known: true, value: String(member?.weaponElement ?? '') === arg0 ? 1 : 0 };
    case 'IsTargetWeakNatureElement':
      if (target && typeof target.isTargetWeakNatureElement === 'function') {
        return { known: true, value: target.isTargetWeakNatureElement(arg0) ? 1 : 0 };
      }
      return { known: false, value: 1 };
    default:
      break;
  }

  // --- 特殊カウント述語 ---
  if (name === 'SpecialStatusCountByType' || name === 'SpecialStatusIconCountByType') {
    return { known: true, value: getSpecialStatusCount(member, Number(arg0)) };
  }
  if (name === 'PlayedSkillCount') {
    const ref = arg0 || String(skill?.label ?? '');
    if (typeof member?.getSkillUseCountByLabel === 'function') {
      return { known: true, value: Number(member.getSkillUseCountByLabel(ref) ?? 0) };
    }
    return { known: false, value: 1 };
  }

  // 未対応述語: 安全側 fallback
  return { known: false, value: 1 };
}

// ---------------------------------------------------------------------------
// Public API: 文字列表現からの直接評価
// ---------------------------------------------------------------------------

/**
 * 条件式文字列をパース + 評価する統合エントリポイント。
 * @param {string} expression
 * @param {object} context
 * @param {boolean} [collectTrace=false]
 * @returns {{result:boolean, knownCount:number, unknownCount:number, ok:boolean, parseError?:string}}
 */
export function evaluateCondition(expression, context, collectTrace = false) {
  const source = String(expression ?? '').trim();
  if (!source) {
    return { result: true, knownCount: 0, unknownCount: 0, ok: true };
  }
  let ast;
  try {
    ast = parseConditionOrThrow(source);
  } catch (e) {
    return { result: true, knownCount: 0, unknownCount: 0, ok: false, parseError: e.message };
  }
  const evaluation = evaluateAst(ast, context, collectTrace);
  return { ...evaluation, ok: true };
}

export function evaluateCountBcValue(expression, context) {
  let ast;
  try {
    ast = parseConditionOrThrow(String(expression ?? '').trim());
  } catch {
    return { known: false, value: 0 };
  }
  if (ast.type !== 'countBc') {
    return { known: false, value: 0 };
  }
  const acc = { knownCount: 0, unknownCount: 0 };
  const value = countCountBcMatches(ast, context, acc);
  return { known: acc.unknownCount === 0, value };
}

/**
 * 評価結果が「安全側 fallback に依存していないか」を判定する。
 * unknownCount === 0 なら全述語が解決済み。
 */
export function isFullyResolved(evaluation) {
  return evaluation.unknownCount === 0;
}

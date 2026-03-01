import {
  createBattleState,
  cloneTurnState,
  snapshotPartyByPartyIndex,
  buildPositionMap,
} from '../contracts/interfaces.js';
import { fromSnapshot, commitRecord, buildTurnContext } from '../records/record-assembler.js';

export const BASE_SP_RECOVERY = 2;
const OD_RECOVERY_BY_LEVEL = Object.freeze({ 1: 5, 2: 12, 3: 20 });
const OD_GAUGE_PER_HIT_PERCENT = 2.5;
const OD_DAMAGE_PART_TYPES = new Set([
  'AttackNormal',
  'AttackSkill',
  'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack',
  'AttackByOwnDpRate',
  'AttackBySp',
  'TokenAttack',
  'FixedHpDamageRateAttack',
]);

function isNormalAttackSkill(skill) {
  const name = String(skill?.name ?? '');
  const label = String(skill?.label ?? '');
  return name === '通常攻撃' || label.endsWith('AttackNormal');
}

function resolveSkillHitCount(skill) {
  const direct = Number(skill?.hitCount ?? 0);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const hitsArrayCount = Array.isArray(skill?.hits) ? skill.hits.length : 0;
  return Number.isFinite(hitsArrayCount) && hitsArrayCount > 0 ? hitsArrayCount : 0;
}

function hasDamagePartInParts(parts) {
  for (const part of parts ?? []) {
    const skillType = String(part?.skill_type ?? '');
    if (OD_DAMAGE_PART_TYPES.has(skillType)) {
      return true;
    }

    if (Array.isArray(part?.strval)) {
      for (const nested of part.strval) {
        if (nested && typeof nested === 'object' && Array.isArray(nested.parts)) {
          if (hasDamagePartInParts(nested.parts)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function resolveDrivePierceBonusPercent(effectiveHitCount, drivePiercePercent) {
  const p = Number(drivePiercePercent ?? 0);
  if (![10, 12, 15].includes(p)) {
    return 0;
  }

  const hit = Math.max(1, Number(effectiveHitCount ?? 1));
  const clamped = Math.min(10, hit);

  // 今回仕様: 役割で分岐せず、ドライブピアス列のみを使用する。
  const baseAt1 = 5;
  const step = (p - baseAt1) / 9;
  const bonus = baseAt1 + step * (clamped - 1);
  return Number(bonus.toFixed(4));
}

function truncateToTwoDecimals(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n >= 0) {
    return Math.floor((n + 1e-9) * 100) / 100;
  }
  return Math.ceil((n - 1e-9) * 100) / 100;
}

function computeOdGaugeGainPercentBySkill(skill, enemyCount = 1, member = null) {
  if (!hasDamagePartInParts(skill?.parts ?? [])) {
    return 0;
  }

  const numericEnemyCount = Number.isFinite(Number(enemyCount))
    ? Math.max(1, Math.min(3, Number(enemyCount)))
    : 1;
  const targetType = String(skill?.targetType ?? '');
  const isAllTarget = targetType === 'All';

  const baseHitCount = resolveSkillHitCount(skill);
  const hitCountPerEnemy = isNormalAttackSkill(skill) ? Math.max(3, baseHitCount) : baseHitCount;
  let hitCount = hitCountPerEnemy * (isAllTarget ? numericEnemyCount : 1);
  if (isNormalAttackSkill(skill)) {
    // 通常攻撃はヒット数に関わらず最低3hit(=7.5%)保証。
    hitCount = Math.max(3, hitCount);
  }

  if (!Number.isFinite(hitCount) || hitCount <= 0) {
    return 0;
  }

  const baseGain = hitCount * OD_GAUGE_PER_HIT_PERCENT;
  if (isNormalAttackSkill(skill)) {
    return truncateToTwoDecimals(baseGain);
  }

  // ピアス補正テーブルの hit 数は、敵数を掛けた後ではなく「スキル本来の hit 数」を使う。
  const bonusPercent = resolveDrivePierceBonusPercent(baseHitCount, member?.drivePiercePercent ?? 0);
  const multiplier = 1 + bonusPercent / 100;

  if (isAllTarget && numericEnemyCount > 1) {
    // 仕様: 全体攻撃は敵1体ごとにOD増加を計算し、小数第2位まで保持して合算する。
    const perEnemyGain = truncateToTwoDecimals(hitCountPerEnemy * OD_GAUGE_PER_HIT_PERCENT * multiplier);
    return truncateToTwoDecimals(perEnemyGain * numericEnemyCount);
  }

  return truncateToTwoDecimals(baseGain * multiplier);
}

function applyOdGaugeFromActions(state, previewRecord) {
  const events = [];
  let total = 0;
  const enemyCountRaw = Number(previewRecord?.enemyCount ?? 1);
  const enemyCount = Number.isFinite(enemyCountRaw)
    ? Math.max(1, Math.min(3, enemyCountRaw))
    : 1;

  for (const actionEntry of previewRecord.actions ?? []) {
    const member = findMemberByCharacterId(state, actionEntry.characterId);
    if (!member) {
      continue;
    }

    const skill = member.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const baseHitCount = resolveSkillHitCount(skill);
    const effectiveHitCount =
      String(skill?.targetType ?? '') === 'All' ? baseHitCount * enemyCount : baseHitCount;
    const odGaugeGain = computeOdGaugeGainPercentBySkill(skill, enemyCount, member);
    if (!Number.isFinite(odGaugeGain) || odGaugeGain === 0) {
      continue;
    }

    total += odGaugeGain;
    events.push({
      characterId: member.characterId,
      skillId: skill.skillId,
      skillName: skill.name,
      hitCount: effectiveHitCount,
      odGaugeGain,
    });
  }

  const startOdGauge = Number(state.turnState.odGauge ?? 0);
  const endOdGauge = truncateToTwoDecimals(startOdGauge + total);
  state.turnState.odGauge = endOdGauge;

  return {
    startOdGauge,
    endOdGauge,
    totalGain: total,
    events,
  };
}

function findMemberByCharacterId(state, characterId) {
  return state.party.find((member) => member.characterId === characterId) ?? null;
}

function hasReinforcedMode(member) {
  if (member.isReinforcedMode) {
    return true;
  }

  if (!Array.isArray(member.effects)) {
    return false;
  }

  return member.effects.some((effect) => {
    const type = String(effect?.type ?? effect?.effectType ?? effect?.kind ?? '');
    const tag = String(effect?.tag ?? effect?.label ?? effect?.name ?? '');
    return (
      type === 'ReinforcedMode' ||
      type === 'Kishin' ||
      tag.includes('鬼神') ||
      tag.includes('Reinforced')
    );
  });
}

function getFrontlineMembers(state) {
  return state.party
    .filter((member) => member.position <= 2)
    .slice()
    .sort((a, b) => a.position - b.position);
}

function getExtraAllowedSet(turnState) {
  if (turnState.turnType !== 'extra' || !turnState.extraTurnState) {
    return null;
  }
  return new Set(turnState.extraTurnState.allowedCharacterIds ?? []);
}

function syncExtraActiveFlags(party, allowedCharacterIds = []) {
  const allowed = new Set(allowedCharacterIds);
  for (const member of party) {
    member.setExtraActive(allowed.has(member.characterId));
  }
}

function resolveAdditionalTurnTargets(state, actorMember, targetTypes) {
  const ids = new Set();
  const frontline = getFrontlineMembers(state);

  for (const targetTypeRaw of targetTypes ?? []) {
    const targetType = String(targetTypeRaw ?? '');
    if (!targetType) {
      continue;
    }

    if (targetType === 'Self') {
      ids.add(actorMember.characterId);
      continue;
    }

    if (targetType === 'AllyFront') {
      for (const member of frontline) {
        ids.add(member.characterId);
      }
      continue;
    }

    if (targetType === 'AllySingleWithoutSelf') {
      const target =
        frontline.find((member) => member.characterId !== actorMember.characterId) ?? null;
      if (target) {
        ids.add(target.characterId);
      }
      continue;
    }

    if (targetType === 'AllySingle') {
      const target = frontline[0] ?? null;
      if (target) {
        ids.add(target.characterId);
      }
      continue;
    }
  }

  return [...ids];
}

function deriveGrantedExtraTurnCharacterIds(state, previewRecord) {
  const granted = new Set();

  for (const actionEntry of previewRecord.actions ?? []) {
    const member = findMemberByCharacterId(state, actionEntry.characterId);
    if (!member) {
      continue;
    }

    const skill = member.getSkill(actionEntry.skillId);
    if (!skill?.additionalTurnRule) {
      continue;
    }

    const rule = skill.additionalTurnRule;
    if (!rule.additionalTurnGrantInExtraTurn && state.turnState.turnType === 'extra') {
      continue;
    }

    const conditions = rule.conditions ?? {};
    if (conditions.requiresOverDrive && state.turnState.turnType !== 'od') {
      continue;
    }
    if (conditions.requiresReinforcedMode && !hasReinforcedMode(member)) {
      continue;
    }

    const targetTypes = Array.isArray(rule.additionalTurnTargetTypes)
      ? rule.additionalTurnTargetTypes
      : [];
    const targets = resolveAdditionalTurnTargets(state, member, targetTypes);
    for (const characterId of targets) {
      granted.add(characterId);
    }
  }

  return [...granted];
}

function validateActionDict(state, actions) {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    throw new Error('actions must be an object keyed by position index.');
  }

  const allowedInExtra = getExtraAllowedSet(state.turnState);
  const entries = Object.entries(actions).map(([positionKey, action]) => {
    const position = Number(positionKey);
    const member = state.party.find((item) => item.position === position) ?? null;

    if (!member) {
      throw new Error(`No member at position ${position}.`);
    }

    if (member.position > 2) {
      throw new Error(`Action is allowed only for front positions (0..2). got=${position}`);
    }

    if (action.characterId && action.characterId !== member.characterId) {
      throw new Error(`characterId mismatch at position ${position}`);
    }

    if (allowedInExtra && !allowedInExtra.has(member.characterId)) {
      throw new Error(`Character ${member.characterId} is not allowed to act in extra turn.`);
    }

    const skill = member.getSkill(action.skillId);
    if (!skill) {
      throw new Error(`Skill ${action.skillId} is not available for ${member.characterId}`);
    }

    return {
      position,
      member,
      skill,
      action,
    };
  });

  const phaseOf = (skillType) => (skillType === 'non_damage' ? 0 : 1);
  entries.sort((a, b) => {
    const p = phaseOf(a.skill.type) - phaseOf(b.skill.type);
    if (p !== 0) {
      return p;
    }

    return a.position - b.position;
  });

  return entries;
}

function previewActionEntries(state, sortedActions) {
  return sortedActions.map(({ member, position, skill }) => {
    const preview = member.previewSkillUse(skill.skillId);

    return {
      characterId: member.characterId,
      characterName: member.characterName,
      partyIndex: member.partyIndex,
      positionIndex: position,
      isExtraAction: state.turnState.turnType === 'extra',
      skillId: skill.skillId,
      skillName: skill.name,
      spCost: skill.spCost,
      consumeType: String(skill.consumeType ?? 'Sp'),
      spChanges: [
        {
          source: 'cost',
          delta: preview.spDelta,
          preSP: preview.startSP,
          postSP: preview.endSP,
          eventCeiling: Number.POSITIVE_INFINITY,
        },
      ],
      startSP: preview.startSP,
      endSP: preview.endSP,
      startEP: preview.startEP,
      endEP: preview.endEP,
      _baseRevision: preview.baseRevision,
    };
  });
}

function getEpRule(member) {
  return member?.epRule && typeof member.epRule === 'object' ? member.epRule : null;
}

function getPassiveOverdriveEpLimit(member) {
  let limit = null;
  for (const passive of member.passives ?? []) {
    if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
      continue;
    }
    for (const part of passive.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'EpLimitOverwrite') {
        continue;
      }
      const value = Number(part?.power?.[0] ?? 0);
      if (Number.isFinite(value) && value > 0) {
        limit = limit === null ? value : Math.max(limit, value);
      }
    }
  }
  return limit;
}

function getEpCeilingForTurn(member, turnState) {
  const rule = getEpRule(member);
  if (turnState.turnType === 'od') {
    const passiveLimit = getPassiveOverdriveEpLimit(member);
    if (Number.isFinite(passiveLimit)) {
      return Number(passiveLimit);
    }
    if (Number.isFinite(Number(rule?.ep?.odMax))) {
      return Number(rule.ep.odMax);
    }
    return Number(member.ep.odMax ?? member.ep.max ?? 0);
  }
  if (Number.isFinite(Number(rule?.ep?.max))) {
    return Number(rule.ep.max);
  }
  return Number(member.ep.max ?? 0);
}

function applyRoleEpGain(member, turnState) {
  const rule = getEpRule(member);
  const delta = Number(rule?.turnStartEpDelta ?? 0);
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const source = String(rule?.turnStartSource ?? 'ep_rule');
  const change = member.applyEpDelta(delta, getEpCeilingForTurn(member, turnState));
  return { characterId: member.characterId, source, ...change };
}

function applyPassiveSkillEpTurnStart(member, turnState) {
  const events = [];
  for (const skill of member.skills ?? []) {
    if (!skill.isPassive) {
      continue;
    }
    if (String(skill?.passive?.timing ?? '') !== 'OnEveryTurn') {
      continue;
    }
    for (const part of skill.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }
      const change = member.applyEpDelta(amount, getEpCeilingForTurn(member, turnState));
      events.push({
        characterId: member.characterId,
        source: 'ep_passive_skill',
        skillId: skill.skillId,
        ...change,
      });
    }
  }
  return events;
}

function applyPassiveEpOnOverdriveStart(member, turnState) {
  const events = [];
  for (const passive of member.passives ?? []) {
    if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
      continue;
    }
    for (const part of passive.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }
      const change = member.applyEpDelta(amount, getEpCeilingForTurn(member, turnState));
      events.push({
        characterId: member.characterId,
        source: 'ep_passive',
        passiveName: passive.name,
        ...change,
      });
    }
  }
  return events;
}

function applySkillSelfEpGains(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const member = findMemberByCharacterId(state, actionEntry.characterId);
    if (!member) {
      continue;
    }

    const skill = member.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    for (const part of skill.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }

      const change = member.applyEpDelta(amount, getEpCeilingForTurn(member, state.turnState));
      events.push({
        characterId: member.characterId,
        source: 'ep_skill',
        skillId: skill.skillId,
        ...change,
      });
    }
  }
  return events;
}

function applyRecoveryPipeline(party, turnState) {
  const recoveryEvents = [];
  const epEvents = [];

  for (const member of party) {
    const base = member.recoverBaseSP(BASE_SP_RECOVERY);
    recoveryEvents.push({
      characterId: member.characterId,
      source: 'base',
      ...base,
    });

    const epRole = applyRoleEpGain(member, turnState);
    if (epRole) {
      epEvents.push(epRole);
    }

    const passiveSkillEvents = applyPassiveSkillEpTurnStart(member, turnState);
    if (passiveSkillEvents.length > 0) {
      epEvents.push(...passiveSkillEvents);
    }
  }

  if (turnState.turnType === 'od' && turnState.odLevel > 0) {
    const odAmount = OD_RECOVERY_BY_LEVEL[turnState.odLevel] ?? 0;
    for (const member of party) {
      const od = member.applySpDelta(odAmount, 'od');
      recoveryEvents.push({
        characterId: member.characterId,
        source: 'od',
        ...od,
      });
    }
  }

  return {
    spEvents: recoveryEvents,
    epEvents,
  };
}

function applySwapEvents(state, swapEvents) {
  for (const swap of swapEvents) {
    const from = state.party.find((member) => member.position === swap.fromPositionIndex) ?? null;
    const to = state.party.find((member) => member.position === swap.toPositionIndex) ?? null;

    if (!from || !to) {
      throw new Error('Invalid swap event target positions.');
    }

    const fromPos = from.position;
    const toPos = to.position;
    from.setPosition(toPos);
    to.setPosition(fromPos);
  }
}

function computeNextTurnState(current, grantedExtraCharacterIds = []) {
  const next = cloneTurnState(current);
  next.sequenceId += 1;
  const hasGrantedExtra = grantedExtraCharacterIds.length > 0;
  const grantedSet = new Set(grantedExtraCharacterIds);

  if (current.turnType === 'od') {
    const remainingOdActions = Math.max(0, Number(current.remainingOdActions) - 1);
    next.remainingOdActions = remainingOdActions;

    if (hasGrantedExtra) {
      next.turnType = 'extra';
      next.turnLabel = 'EX';
      next.odSuspended = true;
      next.extraTurnState = {
        active: true,
        remainingActions: 1,
        allowedCharacterIds: [...grantedSet],
        grantTurnIndex: current.turnIndex,
      };
      return next;
    }

    if (current.remainingOdActions > 1) {
      next.turnType = 'od';
      next.turnLabel = `OD${current.odLevel}-${current.odLevel - next.remainingOdActions + 1}`;
      return next;
    }

    next.turnType = 'normal';
    next.turnIndex = current.turnIndex + 1;
    next.turnLabel = `T${next.turnIndex}`;
    next.odLevel = 0;
    next.remainingOdActions = 0;
    next.odContext = null;
    next.odSuspended = false;
    next.odPending = false;
    return next;
  }

  if (current.turnType === 'extra') {
    if (hasGrantedExtra) {
      const prevAllowed = current.extraTurnState?.allowedCharacterIds ?? [];
      for (const id of prevAllowed) {
        grantedSet.add(id);
      }

      next.turnType = 'extra';
      next.turnLabel = 'EX';
      next.extraTurnState = {
        active: true,
        remainingActions: 1,
        allowedCharacterIds: [...grantedSet],
        grantTurnIndex: current.turnIndex,
      };
      return next;
    }

    const extraState = current.extraTurnState;
    if (extraState && extraState.remainingActions > 1) {
      next.extraTurnState = {
        ...extraState,
        remainingActions: extraState.remainingActions - 1,
      };
      next.turnType = 'extra';
      next.turnLabel = 'EX';
      return next;
    }

    if (current.odPending) {
      const level = current.odLevel > 0 ? current.odLevel : 1;
      next.turnType = 'od';
      next.turnLabel = `OD${level}-1`;
      next.odContext = 'interrupt';
      next.odLevel = level;
      next.remainingOdActions = level;
      next.odPending = false;
      next.extraTurnState = null;
      next.odSuspended = false;
      return next;
    }

    next.turnType = 'normal';
    next.turnIndex = current.turnIndex + 1;
    next.turnLabel = `T${next.turnIndex}`;
    next.extraTurnState = null;
    next.odSuspended = false;
    return next;
  }

  if (hasGrantedExtra) {
    next.turnType = 'extra';
    next.turnLabel = 'EX';
    next.extraTurnState = {
      active: true,
      remainingActions: 1,
      allowedCharacterIds: [...grantedSet],
      grantTurnIndex: current.turnIndex,
    };
    return next;
  }

  next.turnType = 'normal';
  next.turnIndex = current.turnIndex + 1;
  next.turnLabel = `T${next.turnIndex}`;
  return next;
}

export function createBattleStateFromParty(party, turnState) {
  const members = Array.isArray(party) ? party : party.members;
  const next = createBattleState(members, turnState);
  const allowed = next.turnState.extraTurnState?.allowedCharacterIds ?? [];
  syncExtraActiveFlags(next.party, allowed);
  return next;
}

export function previewTurn(state, actions, enemyAction = null, enemyCount = 1) {
  const sortedActions = validateActionDict(state, actions);
  const actionEntries = previewActionEntries(state, sortedActions);
  const snapBefore = snapshotPartyByPartyIndex(state.party);

  const record = fromSnapshot(
    snapBefore,
    buildTurnContext(state.turnState, enemyAction, enemyCount),
    actionEntries,
    [],
    state.turnState.sequenceId
  );

  return record;
}

export function commitTurn(state, previewRecord, swapEvents = [], options = {}) {
  if (!previewRecord || previewRecord.recordStatus !== 'preview') {
    throw new Error('commitTurn requires preview TurnRecord.');
  }
  const applySwapOnCommit = options.applySwapOnCommit !== false;

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    if (!member) {
      throw new Error(`Member not found: ${entry.characterId}`);
    }

    if (member.revision !== entry._baseRevision) {
      throw new Error(`State changed after preview for character ${entry.characterId}`);
    }
  }

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    member.commitSkillPreview({
      characterId: entry.characterId,
      skillId: entry.skillId,
      startSP: entry.startSP,
      endSP: entry.endSP,
      startEP: entry.startEP,
      endEP: entry.endEP,
      baseRevision: entry._baseRevision,
    });
  }

  const epSkillEvents = applySkillSelfEpGains(state, previewRecord);
  const odGaugeGain = applyOdGaugeFromActions(state, previewRecord);
  const recovery = applyRecoveryPipeline(state.party, state.turnState);
  const recoveryEvents = recovery.spEvents;
  const epEvents = [...epSkillEvents, ...recovery.epEvents];

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    entry.endSP = member.sp.current;
    entry.endEP = member.ep.current;

    const extraChanges = recoveryEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preSP: ev.startSP,
        postSP: ev.endSP,
        eventCeiling: ev.eventCeiling,
      }));

    entry.spChanges = [...entry.spChanges, ...extraChanges];
    entry.epChanges = epEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preEP: ev.startEP,
        postEP: ev.endEP,
        eventCeiling: ev.eventCeiling,
      }));
    const odEvent = odGaugeGain.events.find(
      (ev) => ev.characterId === entry.characterId && ev.skillId === entry.skillId
    );
    entry.odGaugeGain = Number(odEvent?.odGaugeGain ?? 0);
  }

  if (applySwapOnCommit) {
    applySwapEvents(state, swapEvents);
  }

  const snapAfter = snapshotPartyByPartyIndex(state.party);
  const committed = commitRecord(previewRecord, snapAfter, swapEvents);
  const grantedExtraCharacterIds = deriveGrantedExtraTurnCharacterIds(state, previewRecord);
  const nextTurnState = computeNextTurnState(state.turnState, grantedExtraCharacterIds);
  syncExtraActiveFlags(state.party, nextTurnState.extraTurnState?.allowedCharacterIds ?? []);

  const nextState = {
    ...state,
    party: [...state.party],
    positionMap: buildPositionMap(state.party),
    turnState: nextTurnState,
  };

  return {
    nextState,
    committedRecord: committed,
  };
}

export function activateOverdrive(state, level, context = 'preemptive') {
  const numericLevel = Number(level);
  if (numericLevel < 1 || numericLevel > 3) {
    throw new Error('OD level must be 1..3');
  }

  const nextTurnState = {
    ...cloneTurnState(state.turnState),
    turnType: 'od',
    turnLabel: `OD${numericLevel}-1`,
    odLevel: numericLevel,
    remainingOdActions: numericLevel,
    odContext: context,
    odSuspended: false,
  };

  const nextState = {
    ...state,
    turnState: nextTurnState,
  };

  for (const member of nextState.party) {
    const rule = getEpRule(member);
    const delta = Number(rule?.onOverdriveStartEpDelta ?? 0);
    if (Number.isFinite(delta) && delta !== 0) {
      member.applyEpDelta(delta, getEpCeilingForTurn(member, nextTurnState));
    }
    applyPassiveEpOnOverdriveStart(member, nextTurnState);
  }

  return nextState;
}

export function grantExtraTurn(state, allowedCharacterIds) {
  const ids = [...new Set(allowedCharacterIds ?? [])];
  const nextTurnState = {
    ...cloneTurnState(state.turnState),
    turnType: 'extra',
    turnLabel: 'EX',
    extraTurnState: {
      active: true,
      remainingActions: 1,
      allowedCharacterIds: ids,
      grantTurnIndex: state.turnState.turnIndex,
    },
  };

  return {
    ...state,
    party: state.party.map((member) => {
      member.setExtraActive(ids.includes(member.characterId));
      return member;
    }),
    turnState: nextTurnState,
  };
}

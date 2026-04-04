import { resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import { isNormalAttackSkill, isExSkillByLabel } from '../../src/domain/skill-classifiers.js';

const USED_SKILL_CATEGORY_ORDER = Object.freeze({
  style: 0,
  master: 1,
  general: 2,
  orb: 3,
  unknown: 4,
});

const USED_SKILL_CATEGORY_LABELS = Object.freeze({
  style: 'スタイル固有',
  master: 'キャラマスター',
  general: 'キャラ汎用',
  orb: 'オーブ',
  unknown: '',
});

const ATTACK_TYPE_ICON_BY_KEY = Object.freeze({
  Slash: resolveUiAssetUrl('Slash.webp'),
  Stab: resolveUiAssetUrl('Stab.webp'),
  Strike: resolveUiAssetUrl('Strike.webp'),
});

const ELEMENT_ICON_BY_KEY = Object.freeze({
  Fire: resolveUiAssetUrl('Fire.webp'),
  Ice: resolveUiAssetUrl('Ice.webp'),
  Thunder: resolveUiAssetUrl('Thunder.webp'),
  Dark: resolveUiAssetUrl('Dark.webp'),
  Light: resolveUiAssetUrl('Light.webp'),
});

function normalizeNumeric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveSkillCategoryBySourceType({ styleId, sourceType, sourceMeta = {} }) {
  if (sourceType === 'master') {
    return 'master';
  }
  if (sourceType === 'orb') {
    return 'orb';
  }
  if (sourceType !== 'style') {
    return 'unknown';
  }

  const sourceStyleId = normalizeNumeric(sourceMeta.sourceStyleId);
  const normalizedStyleId = normalizeNumeric(styleId);
  if (sourceStyleId == null || normalizedStyleId == null) {
    return 'unknown';
  }
  return sourceStyleId === normalizedStyleId ? 'style' : 'general';
}

function buildSkillMetadataResolver(store, memberStyleIds = []) {
  const cacheByStyleId = new Map();
  const targetStyleIds = Array.from(new Set(
    (Array.isArray(memberStyleIds) ? memberStyleIds : [])
      .map((styleId) => normalizeNumeric(styleId))
      .filter((styleId) => styleId != null)
  ));

  for (const styleId of targetStyleIds) {
    const skills = typeof store?.listSkillsByStyleId === 'function'
      ? store.listSkillsByStyleId(styleId)
      : [];
    const bySkillId = new Map();
    for (const skill of Array.isArray(skills) ? skills : []) {
      const skillId = normalizeNumeric(skill?.id);
      if (skillId == null) {
        continue;
      }
      bySkillId.set(skillId, {
        sourceType: String(skill?.sourceType ?? ''),
        sourceMeta: skill?.sourceMeta && typeof skill.sourceMeta === 'object'
          ? structuredClone(skill.sourceMeta)
          : {},
        skill: structuredClone(skill),
      });
    }
    cacheByStyleId.set(styleId, bySkillId);
  }

  return function resolveMetadata(styleId, skillId) {
    const normalizedStyleId = normalizeNumeric(styleId);
    const normalizedSkillId = normalizeNumeric(skillId);
    if (normalizedStyleId == null || normalizedSkillId == null) {
      return null;
    }

    const candidates = cacheByStyleId.get(normalizedStyleId);
    return candidates?.get(normalizedSkillId) ?? null;
  };
}

function isExSkillHeuristic(skill) {
  return isExSkillByLabel(skill);
}

function extractSkillIconDescriptors(skill) {
  if (!skill || typeof skill !== 'object') {
    return { attackTypeIcon: null, elementIcons: [] };
  }
  const parts = Array.isArray(skill.parts) ? skill.parts : [];
  const attackType = parts
    .map((part) => String(part?.type ?? '').trim())
    .find((type) => Boolean(ATTACK_TYPE_ICON_BY_KEY[type]));
  const elementSet = new Set();
  for (const part of parts) {
    const elements = Array.isArray(part?.elements) ? part.elements : [];
    for (const element of elements) {
      const key = String(element ?? '').trim();
      if (ELEMENT_ICON_BY_KEY[key]) {
        elementSet.add(key);
      }
    }
  }
  return {
    attackTypeIcon: attackType
      ? { key: attackType, url: ATTACK_TYPE_ICON_BY_KEY[attackType] }
      : null,
    elementIcons: [...elementSet].map((key) => ({ key, url: ELEMENT_ICON_BY_KEY[key] })),
  };
}

function shouldIgnoreUsedSkill({ skillId, skillName, skill }) {
  if (Number(skillId) === 0) {
    return true;
  }
  if (isNormalAttackSkill(skill)) {
    return true;
  }
  const name = String(skillName ?? '').trim();
  return name === '行動なし';
}

function sortUsedSkills(items = [], { store = null } = {}) {
  return [...items].sort((left, right) => {
    const categoryDelta =
      (USED_SKILL_CATEGORY_ORDER[left.category] ?? USED_SKILL_CATEGORY_ORDER.unknown) -
      (USED_SKILL_CATEGORY_ORDER[right.category] ?? USED_SKILL_CATEGORY_ORDER.unknown);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }
    const leftEx = isExSkillHeuristic(left.skill);
    const rightEx = isExSkillHeuristic(right.skill);
    if (leftEx !== rightEx) {
      return leftEx ? -1 : 1;
    }
    if (left.firstSeenTurnIndex !== right.firstSeenTurnIndex) {
      return left.firstSeenTurnIndex - right.firstSeenTurnIndex;
    }
    if (left.firstSeenActionIndex !== right.firstSeenActionIndex) {
      return left.firstSeenActionIndex - right.firstSeenActionIndex;
    }
    return String(left.name ?? '').localeCompare(String(right.name ?? ''), 'ja');
  });
}

export function buildUsedSkillsByPartyMember({ store, turnEngineManager }) {
  const members = Array.isArray(turnEngineManager?.initialState?.party)
    ? [...turnEngineManager.initialState.party]
        .sort((a, b) => Number(a?.partyIndex ?? 0) - Number(b?.partyIndex ?? 0))
    : [];
  const memberByStyleId = new Map();

  for (const member of members) {
    const styleId = normalizeNumeric(member?.styleId);
    if (styleId == null) {
      continue;
    }
    memberByStyleId.set(styleId, member);
  }

  const resolveMetadata = buildSkillMetadataResolver(
    store,
    members.map((member) => member?.styleId)
  );

  const usedByStyleId = new Map();
  const turns = Array.isArray(turnEngineManager?.replayScript?.turns)
    ? turnEngineManager.replayScript.turns
    : [];

  turns.forEach((turn, turnIndex) => {
    const slots = Array.isArray(turn?.slots) ? turn.slots : [];
    slots.forEach((slot, actionIndex) => {
      const styleId = normalizeNumeric(slot?.styleId);
      const skillId = normalizeNumeric(slot?.skillId);
      if (styleId == null || skillId == null || !memberByStyleId.has(styleId)) {
        return;
      }

      const resolvedMetadata = resolveMetadata(styleId, skillId);
      const category = resolvedMetadata
        ? resolveSkillCategoryBySourceType({
            styleId,
            sourceType: resolvedMetadata.sourceType,
            sourceMeta: resolvedMetadata.sourceMeta,
          })
        : 'unknown';
      let skillMap = usedByStyleId.get(styleId);
      if (!skillMap) {
        skillMap = new Map();
        usedByStyleId.set(styleId, skillMap);
      }

      const existing = skillMap.get(skillId);
      if (existing) {
        return;
      }

      const skillName =
        typeof store?.resolveSkillName === 'function'
          ? String(store.resolveSkillName(skillId) ?? '').trim()
          : '';
      const skill = resolvedMetadata?.skill ?? (typeof store?.getSkillById === 'function'
        ? store.getSkillById(skillId)
        : null);
      if (shouldIgnoreUsedSkill({
        skillId,
        skillName,
        skill,
      })) {
        return;
      }
      const icons = extractSkillIconDescriptors(skill);
      skillMap.set(skillId, {
        skillId,
        name: skillName || `Skill #${skillId}`,
        category,
        categoryLabel: USED_SKILL_CATEGORY_LABELS[category] ?? '',
        skill,
        attackTypeIcon: icons.attackTypeIcon,
        elementIcons: icons.elementIcons,
        firstSeenTurnIndex: turnIndex,
        firstSeenActionIndex: actionIndex,
      });
    });
  });

  return members.map((member, index) => {
    const styleId = normalizeNumeric(member?.styleId);
    const usedMap = styleId == null ? null : usedByStyleId.get(styleId);
    const usedSkills = sortUsedSkills(usedMap ? [...usedMap.values()] : [], { store });
    const characterName =
      (typeof store?.resolveCharacterNameByStyleId === 'function'
        ? String(store.resolveCharacterNameByStyleId(styleId) ?? '').trim()
        : '') ||
      String(member?.characterName ?? '').trim() ||
      '-';
    const styleName =
      (typeof store?.resolveStyleName === 'function'
        ? String(store.resolveStyleName(styleId) ?? '').trim()
        : '') ||
      String(member?.styleName ?? '').trim() ||
      '-';
    const equippedSkillIds = Array.isArray(turnEngineManager?.replayScript?.setup?.skillSetsByPartyIndex?.[index])
      ? turnEngineManager.replayScript.setup.skillSetsByPartyIndex[index]
      : Array.isArray(turnEngineManager?.replayScript?.setup?.skillSetsByPartyIndex?.[String(index)])
        ? turnEngineManager.replayScript.setup.skillSetsByPartyIndex[String(index)]
        : [];

    const equippedPassiveSkills = (Array.isArray(equippedSkillIds) ? equippedSkillIds : [])
      .map((skillId) => normalizeNumeric(skillId))
      .filter((skillId) => skillId != null)
      .map((skillId) => {
        const skill = typeof store?.getSkillById === 'function' ? store.getSkillById(skillId) : null;
        if (!skill || typeof store?.isPassiveSkill !== 'function' || !store.isPassiveSkill(skill)) {
          return null;
        }
        const skillName = String(skill?.name ?? '').trim() || `Skill #${skillId}`;
        const resolvedMetadata = resolveMetadata(styleId, skillId);
        const category = resolvedMetadata
          ? resolveSkillCategoryBySourceType({
              styleId,
              sourceType: resolvedMetadata.sourceType,
              sourceMeta: resolvedMetadata.sourceMeta,
            })
          : 'unknown';
        return {
          skillId,
          name: skillName,
          category,
          categoryLabel: USED_SKILL_CATEGORY_LABELS[category] ?? '',
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const categoryDelta =
          (USED_SKILL_CATEGORY_ORDER[left.category] ?? USED_SKILL_CATEGORY_ORDER.unknown) -
          (USED_SKILL_CATEGORY_ORDER[right.category] ?? USED_SKILL_CATEGORY_ORDER.unknown);
        if (categoryDelta !== 0) {
          return categoryDelta;
        }
        return String(left.name ?? '').localeCompare(String(right.name ?? ''), 'ja');
      });

    return {
      partyIndex: Number(member?.partyIndex ?? index),
      styleId,
      characterName,
      styleName,
      usedSkills,
      equippedPassiveSkills,
    };
  });
}

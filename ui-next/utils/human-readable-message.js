function normalizeInlineText(value) {
  return String(value ?? '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function appendNameIfResolved(idText, resolver) {
  const numericId = Number(idText);
  if (!Number.isFinite(numericId) || typeof resolver !== 'function') {
    return String(idText);
  }
  const resolvedName = normalizeInlineText(resolver(numericId));
  if (!resolvedName) {
    return String(idText);
  }
  return `${idText}(${resolvedName})`;
}

function resolveStyleDisplayName(store, styleId) {
  const style = store?.getStyleById?.(styleId) ?? null;
  if (!style || typeof style !== 'object') {
    return '';
  }
  const characterName = normalizeInlineText(style.chara ?? '');
  const styleName = normalizeInlineText(style.name ?? '');
  if (characterName && styleName) {
    return `${characterName}/${styleName}`;
  }
  return styleName || characterName;
}

function resolveSkillDisplayName(store, skillId) {
  const skill = store?.getSkillById?.(skillId) ?? null;
  if (!skill || typeof skill !== 'object') {
    return '';
  }
  return normalizeInlineText(skill.name ?? skill.label ?? '');
}

function resolveCharacterDisplayName(store, characterId) {
  const character = store?.getCharacterById?.(characterId) ?? null;
  if (!character || typeof character !== 'object') {
    return '';
  }
  return normalizeInlineText(character.name ?? character.chara ?? '');
}

export function formatHumanReadableMessage(message, { store } = {}) {
  const original = String(message ?? '');
  if (!original) {
    return '';
  }

  const styleResolver = (id) => resolveStyleDisplayName(store, id);
  const skillResolver = (id) => resolveSkillDisplayName(store, id);
  const characterResolver = (id) => resolveCharacterDisplayName(store, id);

  let formatted = original;
  formatted = formatted.replace(/\b(styleId\s*[:=]\s*)(\d+)(?!\s*\()/gi, (_, prefix, id) => {
    return `${prefix}${appendNameIfResolved(id, styleResolver)}`;
  });
  formatted = formatted.replace(/\b(style\s+)(\d+)(?!\s*\()/gi, (_, prefix, id) => {
    return `${prefix}${appendNameIfResolved(id, styleResolver)}`;
  });
  formatted = formatted.replace(/\b(skillId\s*[:=]\s*)(\d+)(?!\s*\()/gi, (_, prefix, id) => {
    return `${prefix}${appendNameIfResolved(id, skillResolver)}`;
  });
  formatted = formatted.replace(/\b(skill\s+)(\d+)(?!\s*\()/gi, (_, prefix, id) => {
    return `${prefix}${appendNameIfResolved(id, skillResolver)}`;
  });
  formatted = formatted.replace(
    /\b(characterId\s*[:=]\s*["']?)(\d+)(["']?)(?!\s*\()/gi,
    (_, prefix, id, suffix) => `${prefix}${appendNameIfResolved(id, characterResolver)}${suffix}`
  );

  return normalizeInlineText(formatted);
}

export function createHumanReadableMessageFormatter({ store } = {}) {
  return (message) => formatHumanReadableMessage(message, { store });
}

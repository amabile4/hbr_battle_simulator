export function resolveSourceSkillDescription(entry, resolveSkillDescription = null) {
  const explicitDescription = String(entry?.sourceSkillDesc ?? '').trim();
  if (explicitDescription) {
    return explicitDescription;
  }

  if (typeof resolveSkillDescription !== 'function') {
    return '';
  }

  const sourceSkillId = Number(entry?.sourceSkillId ?? NaN);
  if (!Number.isFinite(sourceSkillId)) {
    return '';
  }

  return String(resolveSkillDescription(sourceSkillId) ?? '').trim();
}

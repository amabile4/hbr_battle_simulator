export const FORM_CHANGE_STYLE_IDS = Object.freeze({
  K_ASAKURA_TWINS: 1001509,
});

export const FORM_CHANGE_KEYS = Object.freeze({
  KAREI: 'karei',
  KAREN: 'karen',
});

const FORM_CHANGE_STYLE_CONFIGS = Object.freeze({
  [FORM_CHANGE_STYLE_IDS.K_ASAKURA_TWINS]: Object.freeze({
    type: 'KAsakuraTwins',
    defaultFormKey: FORM_CHANGE_KEYS.KAREI,
    alternateFormKey: FORM_CHANGE_KEYS.KAREN,
    defaultDisplayName: '朝倉可憐',
    alternateDisplayName: 'カレン',
  }),
});

function cloneFormEntry(entry = {}) {
  return {
    key: String(entry.key ?? '').trim(),
    displayName: String(entry.displayName ?? '').trim(),
    role: String(entry.role ?? '').trim(),
    image: String(entry.image ?? '').trim(),
    cardForm: String(entry.cardForm ?? '').trim(),
  };
}

function normalizeFormChangeEntry(entry = {}, fallbackKey = '') {
  const cloned = cloneFormEntry(entry);
  if (!cloned.key) {
    cloned.key = String(fallbackKey ?? '').trim();
  }
  return cloned.key ? cloned : null;
}

function getFormChangeSource(value = null) {
  if (value?.formChange && typeof value.formChange === 'object') {
    return value.formChange;
  }
  return value && typeof value === 'object' ? value : null;
}

export function buildStyleFormChange(style = {}) {
  const styleId = Number(style?.id ?? 0);
  const config = FORM_CHANGE_STYLE_CONFIGS[styleId];
  if (!config) {
    return null;
  }
  const another = style?.another;
  if (!another || typeof another !== 'object') {
    return null;
  }
  return {
    type: String(config.type),
    defaultFormKey: String(config.defaultFormKey),
    currentFormKey: String(config.defaultFormKey),
    forms: {
      [config.defaultFormKey]: {
        key: String(config.defaultFormKey),
        displayName: String(config.defaultDisplayName),
        role: String(style?.role ?? ''),
        image: String(style?.image ?? ''),
        cardForm: String(style?.label ?? ''),
      },
      [config.alternateFormKey]: {
        key: String(config.alternateFormKey),
        displayName: String(config.alternateDisplayName),
        role: String(another?.role ?? ''),
        image: String(another?.image ?? ''),
        cardForm: String(another?.label ?? ''),
      },
    },
  };
}

export function normalizeFormChange(input = null) {
  const source = getFormChangeSource(input);
  if (!source) {
    return null;
  }
  if (
    source.forms &&
    typeof source.forms === 'object' &&
    typeof source.currentFormKey === 'string' &&
    typeof source.defaultFormKey === 'string'
  ) {
    const currentEntry = source.forms[source.currentFormKey];
    const defaultEntry = source.forms[source.defaultFormKey];
    if (currentEntry?.key && defaultEntry?.key) {
      return source;
    }
  }
  const formsSource = source?.forms && typeof source.forms === 'object' ? source.forms : {};
  const entries = Object.fromEntries(
    Object.entries(formsSource)
      .map(([key, value]) => [String(key), normalizeFormChangeEntry(value, key)])
      .filter(([, value]) => Boolean(value))
  );
  const formKeys = Object.keys(entries);
  if (formKeys.length === 0) {
    return null;
  }
  const defaultFormKeyCandidate = String(source?.defaultFormKey ?? '').trim();
  const defaultFormKey = formKeys.includes(defaultFormKeyCandidate)
    ? defaultFormKeyCandidate
    : formKeys[0];
  const currentFormKeyCandidate = String(source?.currentFormKey ?? '').trim();
  const currentFormKey = formKeys.includes(currentFormKeyCandidate)
    ? currentFormKeyCandidate
    : defaultFormKey;
  return {
    type: String(source?.type ?? '').trim(),
    defaultFormKey,
    currentFormKey,
    forms: entries,
  };
}

export function hasFormChange(value = null) {
  return normalizeFormChange(value) !== null;
}

export function getCurrentFormKey(value = null) {
  const normalized = normalizeFormChange(value);
  return normalized ? normalized.currentFormKey : null;
}

export function getFormInfo(value = null, formKey = null) {
  const normalized = normalizeFormChange(value);
  if (!normalized) {
    return null;
  }
  const resolvedFormKey = String(formKey ?? normalized.currentFormKey).trim();
  return normalized.forms[resolvedFormKey] ?? null;
}

export function getCurrentFormInfo(value = null) {
  return getFormInfo(value, getCurrentFormKey(value));
}

export function getAlternateFormInfo(value = null) {
  const normalized = normalizeFormChange(value);
  if (!normalized) {
    return null;
  }
  const currentFormKey = getCurrentFormKey(normalized);
  const alternateKey = Object.keys(normalized.forms).find((key) => key !== currentFormKey) ?? null;
  return alternateKey ? normalized.forms[alternateKey] : null;
}

export function toggleFormKey(value = null) {
  const normalized = normalizeFormChange(value);
  if (!normalized) {
    return null;
  }
  const currentFormKey = getCurrentFormKey(normalized);
  return Object.keys(normalized.forms).find((key) => key !== currentFormKey) ?? currentFormKey;
}

export function resolveRequiredFormKey(value = null, cardForm = '') {
  const normalized = normalizeFormChange(value);
  const normalizedCardForm = String(cardForm ?? '').trim();
  if (!normalized || !normalizedCardForm) {
    return null;
  }
  return (
    Object.values(normalized.forms).find((entry) => String(entry?.cardForm ?? '') === normalizedCardForm)?.key ??
    null
  );
}

export function isFormEntryActive(value = null, entry = null) {
  const requiredFormKey = resolveRequiredFormKey(value, entry?.cardForm ?? entry?.card_form ?? '');
  if (!requiredFormKey) {
    return true;
  }
  return requiredFormKey === getCurrentFormKey(value);
}

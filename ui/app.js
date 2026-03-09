import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { BattleDomAdapter } from '../src/ui/dom-adapter.js';
import { DEFAULT_INITIAL_SP } from '../src/config/battle-defaults.js';

async function fetchJson(path) {
  if (window.location.protocol === 'file:') {
    const url = new URL(path, import.meta.url).href;
    const module = await import(url, { with: { type: 'json' } });
    return module.default;
  }

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  return response.json();
}

function isOptionalJsonMissing(error, path) {
  const message = String(error?.message ?? error ?? '');
  return (
    message.includes(`Failed to fetch ${path}: 404`) ||
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Cannot find module') ||
    message.includes('Importing a module script failed')
  );
}

async function fetchJsonOrFallback(path, fallback) {
  try {
    return await fetchJson(path);
  } catch (error) {
    if (!isOptionalJsonMissing(error, path)) {
      throw error;
    }
    console.warn(`Optional JSON missing, using fallback for ${path}`, error);
    return fallback;
  }
}

async function main() {
  const payload = {
    characters: await fetchJson('../json/characters.json'),
    styles: await fetchJson('../json/styles.json'),
    skills: await fetchJson('../json/skills.json'),
    passives: await fetchJson('../json/passives.json'),
    accessories: await fetchJson('../json/accessories.json'),
    skillRuleOverrides: await fetchJson('../json/skill_rule_overrides.json'),
    epRuleOverrides: await fetchJson('../json/ep_rule_overrides.json'),
    transcendenceRuleOverrides: await fetchJson('../json/transcendence_rule_overrides.json'),
    skillDbSchema: await fetchJson('../json/new_skill_database.schema.json'),
    skillDbDraft: await fetchJsonOrFallback('../json/reports/migration/new_skill_database.draft.json', {}),
  };

  const store = HbrDataStore.fromRawData(payload);
  const root = document.querySelector('#app');

  const adapter = new BattleDomAdapter({
    root,
    dataStore: store,
    initialSP: DEFAULT_INITIAL_SP,
  });

  adapter.mount();
}

main().catch((error) => {
  const status = document.querySelector('[data-role="status"]');
  if (status) {
    status.textContent = `Error: ${error.message}`;
  }
  console.error(error);
});

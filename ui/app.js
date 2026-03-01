import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { BattleDomAdapter } from '../src/ui/dom-adapter.js';

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

async function main() {
  const payload = {
    characters: await fetchJson('../json/characters.json'),
    styles: await fetchJson('../json/styles.json'),
    skills: await fetchJson('../json/skills.json'),
    passives: await fetchJson('../json/passives.json'),
    accessories: await fetchJson('../json/accessories.json'),
    skillDbSchema: await fetchJson('../json/new_skill_database.schema.json'),
    skillDbDraft: await fetchJson('../json/reports/migration/new_skill_database.draft.json'),
  };

  const store = HbrDataStore.fromRawData(payload);
  const root = document.querySelector('#app');

  const adapter = new BattleDomAdapter({
    root,
    dataStore: store,
    initialSP: 10,
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

import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { InitialSetupController } from './components/initial-setup.js';

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

async function fetchJsonOrFallback(path, fallback) {
  try {
    return await fetchJson(path);
  } catch (error) {
    const msg = String(error?.message ?? error ?? '');
    const isMissing =
      msg.includes(`Failed to fetch ${path}: 404`) ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Cannot find module') ||
      msg.includes('Importing a module script failed');
    if (!isMissing) throw error;
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
    supportSkills: await fetchJsonOrFallback('../json/support_skills.json', []),
  };

  const store = HbrDataStore.fromRawData(payload);

  const setupRoot = document.querySelector('#initial-setup-root');
  const pickerOverlay = document.querySelector('#style-picker-overlay');

  const initialSetup = new InitialSetupController({ root: setupRoot, pickerOverlay, store });
  initialSetup.mount();
}

main().catch((error) => {
  const status = document.querySelector('[data-role="status"]');
  if (status) {
    status.textContent = `Error: ${error.message}`;
    status.classList.remove('hidden');
  }
  console.error(error);
});

import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { InitialSetupController } from './components/initial-setup.js';
import { BattleStateManager } from './engine/battle-state-manager.js';

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

function showStatus(msg) {
  const el = document.querySelector('[data-role="status"]');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function renderBattleStatePreview(state) {
  const area = document.querySelector('#turn-area');
  const rows = state.party
    .map((m) => `<tr class="border-b border-gray-100">
      <td class="py-1 px-2 text-xs text-gray-700">${m.characterId ?? '?'}</td>
      <td class="py-1 px-2 text-xs text-center text-blue-600">${m.sp?.current ?? '—'}</td>
    </tr>`)
    .join('');
  area.innerHTML = `
    <div class="max-w-sm mx-auto py-4">
      <h2 class="text-sm font-semibold text-gray-600 mb-2">BattleState — Turn 1</h2>
      <table class="w-full text-left">
        <thead><tr class="bg-gray-50">
          <th class="py-1 px-2 text-xs text-gray-500">キャラ</th>
          <th class="py-1 px-2 text-xs text-gray-500 text-center">SP</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
  const battleStateManager = new BattleStateManager({ store });

  const setupRoot = document.querySelector('#initial-setup-root');
  const pickerOverlay = document.querySelector('#style-picker-overlay');

  const initialSetup = new InitialSetupController({
    root: setupRoot,
    pickerOverlay,
    store,
    onApply: (snapshot) => {
      try {
        const state = battleStateManager.buildFromSnapshot(snapshot);
        renderBattleStatePreview(state);
      } catch (err) {
        showStatus(`BattleState 生成エラー: ${err.message}`);
        console.error(err);
      }
    },
  });
  initialSetup.mount();
}

main().catch((error) => {
  showStatus(`Error: ${error.message}`);
  console.error(error);
});

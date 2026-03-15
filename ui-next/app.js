import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { InitialSetupController } from './components/initial-setup.js';
import { BattleStateManager } from './engine/battle-state-manager.js';
import { TurnEngineManager } from './engine/turn-engine-manager.js';
import { TurnAreaController } from './components/turn-area.js';

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
  const turnEngineManager = new TurnEngineManager();
  const turnArea = new TurnAreaController({
    root: document.querySelector('#turn-area'),
    store,
    engineManager: turnEngineManager,
  });

  const setupRoot = document.querySelector('#initial-setup-root');
  const pickerOverlay = document.querySelector('#style-picker-overlay');

  const initialSetup = new InitialSetupController({
    root: setupRoot,
    pickerOverlay,
    store,
    onApply: (snapshot) => {
      try {
        const state = battleStateManager.buildFromSnapshot(snapshot);
        // snapshot から ReplayScript の setup を生成
        const replaySetup = buildReplaySetupFromSnapshot(snapshot);
        turnArea.initialize(state, replaySetup);
      } catch (err) {
        showStatus(`BattleState 生成エラー: ${err.message}`);
        console.error(err);
      }
    },
  });
  initialSetup.mount();
}

/**
 * PartySetupController.getSnapshot() の戻り値から LightweightReplaySetup を生成する。
 * @param {object} snapshot
 * @returns {object} setup オブジェクト（createEmptyLightweightReplayScript に渡す）
 */
function buildReplaySetupFromSnapshot(snapshot) {
  // filledIndices: null を除いた前衛→後衛の左詰めインデックス
  const filledIndices = snapshot.styleIds
    .map((id, i) => (id !== null ? i : null))
    .filter((i) => i !== null);

  return {
    styleIds: filledIndices.map((i) => snapshot.styleIds[i]),
    supportStyleIdsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => [newIdx, snapshot.supportStyleIds[srcIdx]])
        .filter(([, id]) => id !== null)
    ),
    limitBreakLevelsByPartyIndex: Object.fromEntries(
      filledIndices.map((srcIdx, newIdx) => [newIdx, snapshot.limitBreakLevelsByPartyIndex[srcIdx] ?? 0])
    ),
  };
}

main().catch((error) => {
  showStatus(`Error: ${error.message}`);
  console.error(error);
});

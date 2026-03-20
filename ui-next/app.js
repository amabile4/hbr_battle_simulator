import { HbrDataStore } from '../src/data/hbr-data-store.js';
import { InitialSetupController } from './components/initial-setup.js';
import { BattleStateManager } from './engine/battle-state-manager.js';
import { TurnEngineManager } from './engine/turn-engine-manager.js';
import { TurnAreaController } from './components/turn-area.js';
import { createEmptyLightweightReplayScript } from '../src/ui/lightweight-replay-script.js';
import {
  normalizeSessionSnapshot,
  serializeSessionSnapshot,
} from './utils/session-snapshot.js';
import { DEFAULT_VALIDATION_POLICY } from './utils/validation-policy.js';

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

let _statusTimer = null;
function showStatus(msg) {
  const el = document.querySelector('[data-role="status"]');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function makeSessionFilename() {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  return `ui_next_session_${stamp}.json`;
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

  // initialSetup は turnArea の onTurnCommitted から参照するため let で先行宣言する
  let initialSetup;

  const turnArea = new TurnAreaController({
    root: document.querySelector('#turn-area'),
    store,
    engineManager: turnEngineManager,
    onError: (err) => showStatus(`ターン実行エラー: ${err.message}`),
    onTurnCommitted: () => initialSetup?.setHasRecords(true),
  });

  const setupRoot = document.querySelector('#initial-setup-root');
  const pickerOverlay = document.querySelector('#style-picker-overlay');

  initialSetup = new InitialSetupController({
    root: setupRoot,
    pickerOverlay,
    store,
    onApply: (snapshot) => {
      try {
        const state = battleStateManager.buildFromSnapshot(snapshot.party);
        const replaySetup = buildReplaySetupFromSnapshot(snapshot.party);
        turnArea.initialize(state, replaySetup, snapshot.simulatorSettings, DEFAULT_VALIDATION_POLICY);
        initialSetup.setHasRecords(false);
        window.collapseSetup?.();
      } catch (err) {
        showStatus(`BattleState 生成エラー: ${err.message}`);
        console.error(err);
      }
    },
    onRecalculate: (snapshot) => {
      try {
        const state = battleStateManager.buildFromSnapshot(snapshot.party);
        turnArea.reinitialize(state, snapshot.simulatorSettings);
        window.collapseSetup?.();
      } catch (err) {
        showStatus(`再計算エラー: ${err.message}`);
        console.error(err);
      }
    },
    onSaveSession: (snapshot) => {
      try {
        if (!snapshot?.party?.isFrontFilled) {
          throw new Error('前衛3スロットを設定してください。');
        }
        const replaySetup = buildReplaySetupFromSnapshot(snapshot.party);
        const replayScript = turnEngineManager.replayScript
          ? structuredClone(turnEngineManager.replayScript)
          : createEmptyLightweightReplayScript(replaySetup);
        const sessionText = serializeSessionSnapshot({
          setup: snapshot.party,
          simulatorSettings: snapshot.simulatorSettings,
          validationPolicy: turnEngineManager.validationPolicy ?? DEFAULT_VALIDATION_POLICY,
          replayScript,
        });
        downloadTextFile(sessionText, makeSessionFilename());
        showStatus('セッション JSON を保存しました。');
      } catch (err) {
        showStatus(`保存エラー: ${err.message}`);
        console.error(err);
      }
    },
    onLoadSession: (text) => {
      try {
        const session = normalizeSessionSnapshot(JSON.parse(text));
        initialSetup.applySetupSnapshot({
          party: session.setup,
          simulatorSettings: session.simulatorSettings,
        });
        const state = battleStateManager.buildFromSnapshot(session.setup);
        turnArea.loadSession(
          state,
          session.replayScript,
          session.simulatorSettings,
          session.validationPolicy,
        );
        initialSetup.setHasRecords(session.replayScript.turns.length > 0);
        window.collapseSetup?.();
        showStatus(`セッションを読み込みました (${session.replayScript.turns.length} turns).`);
      } catch (err) {
        showStatus(`読込エラー: ${err.message}`);
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
    skillSetsByPartyIndex: Object.fromEntries(
      filledIndices
        .map((srcIdx, newIdx) => {
          const equippedSkillIds =
            snapshot.skillSetsByPartyIndex?.[srcIdx] ??
            snapshot.skillSetsByPartyIndex?.[String(srcIdx)] ??
            null;
          return Array.isArray(equippedSkillIds)
            ? [newIdx, structuredClone(equippedSkillIds)]
            : null;
        })
        .filter(Boolean)
    ),
  };
}

main().catch((error) => {
  showStatus(`Error: ${error.message}`);
  console.error(error);
});

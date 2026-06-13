import { test, expect } from '@playwright/test';

import { getStore } from '../helpers.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../../src/ui/lightweight-replay-script.js';
import { BattleStateManager } from '../../ui-next/engine/battle-state-manager.js';
import { TurnEngineManager } from '../../ui-next/engine/turn-engine-manager.js';
import { buildReplaySetupFromPartySnapshot } from '../../ui-next/utils/replay-setup.js';
import { gotoUiNext } from './ui-next-helpers.js';

const DEBUFFER_STYLE_ID = 1002606;
const DEBUFFER_SKILL_ID = 46002610;
const ATTACKER_STYLE_ID = 1001101;
const ATTACKER_SKILL_ID = 46001101;
const STYLE_IDS = [DEBUFFER_STYLE_ID, ATTACKER_STYLE_ID, 1001201, 1001301, 1001401, 1001501];
const HIGH_STATS = Object.freeze({ str: 1000, dex: 1000, con: 1000, spr: 1000, luk: 1000, wis: 1000 });
const LOW_STATS = Object.freeze({ str: 100, dex: 100, con: 100, spr: 100, luk: 100, wis: 100 });

function buildPartySetup(stats) {
  return {
    isFrontFilled: true,
    styleIds: STYLE_IDS,
    supportStyleIds: [null, null, null, null, null, null],
    limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    supportLimitBreakLevelsByPartyIndex: {},
    statsByPartyIndex: { 0: { stats } },
    drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    pierceByPartyIndex: {},
    chainEquipByPartyIndex: {},
    startSpEquipByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    normalAttackElementsByPartyIndex: {},
    skillSetsByPartyIndex: {
      0: [DEBUFFER_SKILL_ID],
      1: [ATTACKER_SKILL_ID],
    },
    stageSetup: {},
  };
}

function injectLegacyEnemyStatusesOverride(replayScript, sourceManager) {
  const secondTurn = replayScript.turns[1];
  const staleStatuses = structuredClone(sourceManager.computedStates[0]?.turnState?.enemyState?.statuses ?? []);
  secondTurn.overrideEntries = (secondTurn.overrideEntries ?? []).filter(
    (entry) => entry?.type !== REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES
  );
  secondTurn.overrideEntries.push({
    type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES,
    payload: staleStatuses,
  });
}

function buildLegacySessionText() {
  const store = getStore();
  const setup = buildPartySetup(HIGH_STATS);
  const battleStateManager = new BattleStateManager({ store });
  const initialState = battleStateManager.buildFromSnapshot(setup, {});
  const manager = new TurnEngineManager();
  manager.initialize(initialState, buildReplaySetupFromPartySnapshot(setup));
  manager.commitNextTurn(
    { 0: { skillId: DEBUFFER_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'apply stat-resolved debuff' }
  );
  manager.commitNextTurn(
    { 1: { skillId: ATTACKER_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'attack with carried debuff' }
  );

  const replayScript = structuredClone(manager.replayScript);
  injectLegacyEnemyStatusesOverride(replayScript, manager);

  return JSON.stringify({
    version: 1,
    setup,
    enemy: {},
    simulatorSettings: {},
    validationPolicy: {},
    replayScript,
  });
}

async function ensureSetupVisible(page) {
  const recalcButton = page.locator('[data-role="recalc-btn"]');
  if (await recalcButton.isVisible()) {
    return;
  }
  await page.locator('#toggle-setup').click();
  await expect(recalcButton).toBeVisible({ timeout: 5000 });
}

function parseDisplayedNumber(text) {
  const numeric = Number(String(text ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

async function readTurn2DamageMultiplier(page) {
  const committedRows = page.locator('[data-turn-row][data-row-mode="committed"]');
  await expect(committedRows).toHaveCount(2, { timeout: 10000 });
  const secondRow = committedRows.nth(1);
  await secondRow.locator('[data-turn-slot-icon]').nth(1).click({ button: 'right' });

  const popup = page.locator('#char-detail-popup');
  await expect(popup).toBeVisible({ timeout: 5000 });
  await popup.locator('.char-popup-tab[data-tab="damage"]').click();
  const value = popup.locator('[data-role="char-popup-damage-target"]').first().locator('.char-popup-damage-summary-value');
  await expect(value).toBeVisible({ timeout: 10000 });
  const parsed = parseDisplayedNumber(await value.textContent());
  await popup.locator('[data-role="char-popup-backdrop"]').click({ position: { x: 4, y: 4 } });
  await expect(popup).not.toHaveClass(/open/);
  return parsed;
}

async function editDebufferStatsAndRecalculate(page) {
  await ensureSetupVisible(page);
  await page.locator('[role="tab"][data-tab="party"]').click();
  await page.locator('[data-action="open-stats-settings"][data-slot-index="0"][data-mode="main"]').click();
  const statsPanel = page.locator('#stats-settings-panel');
  await expect(statsPanel).toBeVisible({ timeout: 5000 });
  for (const [stat, value] of Object.entries(LOW_STATS)) {
    await statsPanel.locator(`[data-stat="${stat}"]`).fill(String(value));
  }
  await statsPanel.locator('[data-action="apply-stats"]').click();
  await page.locator('[data-role="recalc-btn"]').click();
  await expect(page.locator('[data-turn-row][data-row-mode="committed"]')).toHaveCount(2, { timeout: 10000 });
}

test('past stats edit recalculates carried enemy debuff in later committed turn', async ({ page }) => {
  await gotoUiNext(page);
  await page.locator('#session-load-input').setInputFiles({
    name: 'legacy_debuff_staleness_session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(buildLegacySessionText(), 'utf-8'),
  });

  const beforeMultiplier = await readTurn2DamageMultiplier(page);
  expect(beforeMultiplier).not.toBeNull();

  await editDebufferStatsAndRecalculate(page);

  await expect
    .poll(async () => readTurn2DamageMultiplier(page), {
      timeout: 10000,
      message: 'turn2 multiplier should follow the recalculated carried debuff power',
    })
    .toBeLessThan(beforeMultiplier);
});

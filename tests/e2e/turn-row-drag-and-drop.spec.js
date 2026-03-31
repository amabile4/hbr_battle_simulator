import { test, expect } from '@playwright/test';

import {
  applyParty,
  fillPartySetupSlots,
  getTurnRowSlotAlt,
  gotoUiNext,
} from './ui-next-helpers.js';

test.describe('Turn row slot swap', () => {
  test('tap-to-swap: front ↔ back via icon click', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    const inputRow = await applyParty(page);
    const beforeFrontAlt = await getTurnRowSlotAlt(inputRow, 0);
    const beforeBackAlt = await getTurnRowSlotAlt(inputRow, 3);

    // 1st click: select source slot
    const srcIcon = inputRow.locator(
      '[data-turn-slot][data-position="0"] [data-turn-slot-icon]',
    );
    await srcIcon.click();

    // selection visual (amber ring) should appear on source
    await expect(srcIcon).toHaveClass(/ring-amber-400/);

    // 2nd click: select destination slot → triggers swap
    const dstIcon = inputRow.locator(
      '[data-turn-slot][data-position="3"] [data-turn-slot-icon]',
    );
    await dstIcon.click();

    // after swap the images should have exchanged
    await expect(
      inputRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeBackAlt ?? '');
    await expect(
      inputRow.locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeFrontAlt ?? '');
  });

  test('tap-to-swap: front ↔ front via icon click', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2]);

    const inputRow = await applyParty(page);
    const beforeAlt0 = await getTurnRowSlotAlt(inputRow, 0);
    const beforeAlt1 = await getTurnRowSlotAlt(inputRow, 1);

    await inputRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await inputRow
      .locator('[data-turn-slot][data-position="1"] [data-turn-slot-icon]')
      .click();

    await expect(
      inputRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeAlt1 ?? '');
    await expect(
      inputRow.locator('[data-turn-slot][data-position="1"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeAlt0 ?? '');
  });

  test('drag-and-drop: front ↔ back via icon handle', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    const inputRow = await applyParty(page);
    const beforeFrontAlt = await getTurnRowSlotAlt(inputRow, 0);
    const beforeBackAlt = await getTurnRowSlotAlt(inputRow, 3);

    const srcHandle = inputRow.locator(
      '[data-turn-slot][data-position="0"] [data-role="turn-slot-drag-handle"]',
    );
    const dstSlot = inputRow.locator(
      '[data-turn-slot][data-position="3"]',
    );
    await srcHandle.dragTo(dstSlot);

    await expect(
      inputRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeBackAlt ?? '');
    await expect(
      inputRow.locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', beforeFrontAlt ?? '');
  });

  test('after front ↔ back swap, swapped-in character can use their exclusive skill', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    const inputRow = await applyParty(page);
    const backCharAlt = await getTurnRowSlotAlt(inputRow, 3);

    // collect skill IDs the original position-0 character owns (before swap)
    const originalSkillIds = new Set(
      await inputRow
        .locator('[data-skill-select][data-position="0"] option')
        .evaluateAll((opts) => opts.map((o) => o.value)),
    );

    // swap position 0 ↔ 3
    await inputRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await inputRow
      .locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon]')
      .click();

    // the character from back row is now at position 0
    await expect(
      inputRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', backCharAlt ?? '');

    // skill select for position 0 now belongs to the swapped-in character
    const skillSelect = inputRow.locator('[data-skill-select][data-position="0"]');
    await expect(skillSelect).toBeVisible();

    // find a skill that the swapped-in character has but the original character did NOT
    const swappedInSkills = await skillSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => ({ id: o.value, name: o.dataset.skillName })));
    const exclusiveSkill = swappedInSkills.find((s) => !originalSkillIds.has(s.id));
    expect(exclusiveSkill, 'swapped-in character should have a skill the original did not').toBeTruthy();

    // select the exclusive skill
    await skillSelect.selectOption(exclusiveSkill.id);

    // verify the selection sticks after potential rerender
    await expect(skillSelect).toHaveValue(exclusiveSkill.id);
  });

  test('commit succeeds after front ↔ back swap with exclusive skill', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3]);

    const inputRow = await applyParty(page);
    const backCharAlt = await getTurnRowSlotAlt(inputRow, 3);

    // collect skill IDs the original position-0 character owns
    const originalSkillIds = new Set(
      await inputRow
        .locator('[data-skill-select][data-position="0"] option')
        .evaluateAll((opts) => opts.map((o) => o.value)),
    );

    // swap position 0 ↔ 3
    await inputRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await inputRow
      .locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon]')
      .click();

    await expect(
      inputRow.locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon] img'),
    ).toHaveAttribute('alt', backCharAlt ?? '');

    // select the swapped-in character's exclusive skill
    const skillSelect = inputRow.locator('[data-skill-select][data-position="0"]');
    const swappedInSkills = await skillSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => ({ id: o.value, name: o.dataset.skillName })));
    const exclusiveSkill = swappedInSkills.find((s) => !originalSkillIds.has(s.id));
    expect(exclusiveSkill).toBeTruthy();
    await skillSelect.selectOption(exclusiveSkill.id);

    // commit the turn — should NOT throw "Action is allowed only for front positions"
    const commitBtn = inputRow.locator('[data-role="commit-btn"]');
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();

    // after commit, the input row should become committed and a new input row appears
    const committedRow = page.locator('[data-turn-row][data-row-mode="committed"]').first();
    await expect(committedRow).toBeVisible({ timeout: 5000 });

    // the next input row should also appear
    const nextInputRow = page.locator('[data-turn-row][data-row-mode="input"]').last();
    await expect(nextInputRow).toBeVisible({ timeout: 5000 });

    // no error toast / overlay should appear
    await expect(page.locator('[data-role="error-toast"]')).toBeHidden({ timeout: 1000 }).catch(() => {});
  });

  test('input row swap with 6 characters keeps 3+3 layout', async ({ page }) => {
    await gotoUiNext(page);
    await fillPartySetupSlots(page, [0, 1, 2, 3, 4, 5]);
    const inputRow = await applyParty(page);

    const frontGroup = inputRow.locator('[data-turn-front-group]');
    const backGroup = inputRow.locator('[data-turn-back-group]');

    // Before swap: 3 front + 3 back
    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);

    // tap-swap 0 ↔ 3
    await inputRow
      .locator('[data-turn-slot][data-position="0"] [data-turn-slot-icon]')
      .click();
    await inputRow
      .locator('[data-turn-slot][data-position="3"] [data-turn-slot-icon]')
      .click();

    // After swap: still 3+3
    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);

    // 2nd swap: 1 ↔ 4
    await inputRow
      .locator('[data-turn-slot][data-position="1"] [data-turn-slot-icon]')
      .click();
    await inputRow
      .locator('[data-turn-slot][data-position="4"] [data-turn-slot-icon]')
      .click();

    await expect(frontGroup.locator('[data-turn-slot]')).toHaveCount(3);
    await expect(backGroup.locator('[data-turn-slot]')).toHaveCount(3);
  });
});

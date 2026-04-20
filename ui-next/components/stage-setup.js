import {
  STAGE_SETUP_ENCHANT_EFFECT_SCOPES,
  STAGE_SETUP_ENCHANT_EFFECT_TYPES,
  buildStageSetupEnchantEffectLabels,
  normalizeStageSetupEnchantEffects,
} from '../../src/domain/stage-setup-enchants.js';

const DEFAULT_STAGE_SETUP = Object.freeze({
  initialOdGauge: 0,
  initialSpBonusAll: 0,
  initialStatusEffects: Object.freeze([]),
  enchantEffects: Object.freeze([]),
  selectedDimensionBattleId: null,
  turnlySpAll: 0,
  turnlySpFront: 0,
  turnlySpBack: 0,
});

const STAGE_EFFECT_IDS = Object.freeze({
  DEFENSE_UP: 'DefenseUp',
  DEBUFF_GUARD: 'DebuffGuard',
});

const STAGE_PRESET_RESULT_DEFAULT = Object.freeze({
  initialOdGauge: 0,
  initialSpBonusAll: 0,
  turnlySpAll: 0,
  turnlySpFront: 0,
  turnlySpBack: 0,
  enchantEffects: Object.freeze([]),
  enableDefenseUp: false,
  enableDebuffGuard: false,
  unsupportedDescriptions: Object.freeze([]),
});

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDimensionBattles(raw = []) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry, index) => {
      const id = Number(entry?.id);
      const normalizedId = Number.isFinite(id) ? id : index + 1;
      const label = String(entry?.label ?? '').trim();
      const parsedRound = Number((label.match(/(\d+)$/)?.[1] ?? '').replace(/^0+/, ''));
      const round = Number.isFinite(parsedRound) && parsedRound > 0 ? parsedRound : index + 1;
      const satellites = Array.isArray(entry?.satellites)
        ? entry.satellites.map((satellite, satelliteIndex) => ({
            key: `${normalizedId}-${satelliteIndex}`,
            index: satelliteIndex,
            desc: String(satellite?.enchant?.desc ?? '').trim(),
          }))
        : [];

      return {
        id: normalizedId,
        round,
        title: `第${round}回 恒星戦`,
        satellites,
      };
    })
    .filter((entry) => entry.satellites.length > 0);
}

function parsePresetDescriptions(descriptions = []) {
  const result = {
    initialOdGauge: 0,
    initialSpBonusAll: 0,
    turnlySpAll: 0,
    turnlySpFront: 0,
    turnlySpBack: 0,
    enchantEffects: [],
    enableDefenseUp: false,
    enableDebuffGuard: false,
    unsupportedDescriptions: [],
  };

  for (const rawDescription of descriptions) {
    const description = String(rawDescription ?? '').trim();
    if (!description) {
      continue;
    }

    let consumed = false;
    const odMatch = description.match(/戦闘開始時ODゲージ([+-]\d+)%/);
    if (odMatch) {
      result.initialOdGauge += Number(odMatch[1]);
      consumed = true;
    }

    const odGaugeGainBonusMatch = description.match(/ODゲージ上昇量([+-]\d+)(?:%|％)/);
    if (odGaugeGainBonusMatch) {
      result.enchantEffects.push({
        effectType: STAGE_SETUP_ENCHANT_EFFECT_TYPES.OD_GAUGE_GAIN_BONUS_PERCENT,
        amount: Number(odGaugeGainBonusMatch[1]),
      });
      consumed = true;
    }

    const spMatch = description.match(/戦闘開始時SP\+(\d+)/);
    if (spMatch) {
      result.initialSpBonusAll += Number(spMatch[1]);
      consumed = true;
    }

    if (description.includes('防御力50%アップ') || description.includes('防御力50％アップ')) {
      result.enableDefenseUp = true;
      consumed = true;
    }

    if (description.includes('デバフ無効1回付与')) {
      result.enableDebuffGuard = true;
      consumed = true;
    }

    const turnlySpFrontMatch = description.match(/毎ターン前衛のSP([+-]\d+)/);
    if (turnlySpFrontMatch) {
      result.turnlySpFront += Number(turnlySpFrontMatch[1]);
      consumed = true;
    }

    const turnlySpBackMatch = description.match(/毎ターン後衛のSP([+-]\d+)/);
    if (turnlySpBackMatch) {
      result.turnlySpBack += Number(turnlySpBackMatch[1]);
      consumed = true;
    }

    const turnlySpAllMatch = description.match(/毎ターンSP([+-]\d+)/);
    if (turnlySpAllMatch && !turnlySpFrontMatch && !turnlySpBackMatch) {
      result.turnlySpAll += Number(turnlySpAllMatch[1]);
      consumed = true;
    }

    const turnStartSpIfEnemyDownMatch = description.match(/ターン開始時ダウンターン中の敵がいるとSP([+-]\d+)/);
    if (turnStartSpIfEnemyDownMatch) {
      result.enchantEffects.push({
        effectType: STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_ENEMY_DOWN,
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL,
        amount: Number(turnStartSpIfEnemyDownMatch[1]),
      });
      consumed = true;
    }

    const turnStartSpIfNegativeFrontMatch = description.match(/ターン開始時SP0未満の前衛の味方のSP([+-]\d+)/);
    if (turnStartSpIfNegativeFrontMatch) {
      result.enchantEffects.push({
        effectType: STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP,
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT,
        amount: Number(turnStartSpIfNegativeFrontMatch[1]),
      });
      consumed = true;
    }

    const turnStartSpIfNegativeBackMatch = description.match(/ターン開始時SP0未満の後衛の味方のSP([+-]\d+)/);
    if (turnStartSpIfNegativeBackMatch) {
      result.enchantEffects.push({
        effectType: STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP,
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK,
        amount: Number(turnStartSpIfNegativeBackMatch[1]),
      });
      consumed = true;
    }

    const spOnEnemyKillMatch = description.match(/敵を倒したとき敵1体につき味方全体のSP([+-]\d+)/);
    if (spOnEnemyKillMatch) {
      result.enchantEffects.push({
        effectType: STAGE_SETUP_ENCHANT_EFFECT_TYPES.SP_ON_ENEMY_KILL,
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL,
        amount: Number(spOnEnemyKillMatch[1]),
      });
      consumed = true;
    }

    if (!consumed) {
      result.unsupportedDescriptions.push(description);
    }
  }

  result.enchantEffects = normalizeStageSetupEnchantEffects(result.enchantEffects);
  return result;
}

function buildStatusEffectsFromUi({ enableDefenseUp = false, enableDebuffGuard = false }) {
  const effects = [];
  if (enableDefenseUp) {
    effects.push({
      scope: 'all',
      statusType: STAGE_EFFECT_IDS.DEFENSE_UP,
      power: 0.5,
      remaining: 0,
      exitCond: 'Eternal',
    });
  }
  if (enableDebuffGuard) {
    effects.push({
      scope: 'all',
      statusType: STAGE_EFFECT_IDS.DEBUFF_GUARD,
      remaining: 1,
      limitType: 'Count',
      exitCond: 'Count',
    });
  }
  return effects;
}

function parseUiFromStatusEffects(effects = []) {
  const statusEffects = Array.isArray(effects) ? effects : [];
  return {
    enableDefenseUp: statusEffects.some(
      (effect) => String(effect?.statusType ?? '') === STAGE_EFFECT_IDS.DEFENSE_UP
    ),
    enableDebuffGuard: statusEffects.some(
      (effect) => String(effect?.statusType ?? '') === STAGE_EFFECT_IDS.DEBUFF_GUARD
    ),
  };
}

function normalizeStageSetupSnapshot(stageSetup = {}) {
  const initialOdGauge = toFiniteNumber(stageSetup?.initialOdGauge, DEFAULT_STAGE_SETUP.initialOdGauge);
  const initialSpBonusAll = toFiniteNumber(stageSetup?.initialSpBonusAll, DEFAULT_STAGE_SETUP.initialSpBonusAll);
  const turnlySpAll = toFiniteNumber(stageSetup?.turnlySpAll, DEFAULT_STAGE_SETUP.turnlySpAll);
  const turnlySpFront = toFiniteNumber(stageSetup?.turnlySpFront, DEFAULT_STAGE_SETUP.turnlySpFront);
  const turnlySpBack = toFiniteNumber(stageSetup?.turnlySpBack, DEFAULT_STAGE_SETUP.turnlySpBack);
  const enchantEffects = normalizeStageSetupEnchantEffects(stageSetup?.enchantEffects);
  const selectedDimensionBattleIdRaw = Number(stageSetup?.selectedDimensionBattleId);
  const selectedDimensionBattleId = Number.isFinite(selectedDimensionBattleIdRaw)
    ? selectedDimensionBattleIdRaw
    : null;
  const statusEffects = Array.isArray(stageSetup?.initialStatusEffects)
    ? structuredClone(stageSetup.initialStatusEffects)
    : [];

  return {
    initialOdGauge,
    initialSpBonusAll,
    turnlySpAll,
    turnlySpFront,
    turnlySpBack,
    enchantEffects,
    initialStatusEffects: statusEffects,
    selectedDimensionBattleId,
  };
}

export class StageSetupController {
  #root;
  #dimensionBattles = [];
  #selectedDimensionBattleId = null;
  #selectedSatelliteKeys = new Set();
  #odInput = null;
  #spInput = null;
  #defenseUpToggle = null;
  #debuffGuardToggle = null;
  #turnlySpAllInput = null;
  #turnlySpFrontInput = null;
  #turnlySpBackInput = null;
  #enchantEffects = [];
  #dimensionBattleSelect = null;
  #satellitesContainer = null;
  #enchantSummary = null;
  #enchantSummaryEmpty = null;
  #hint = null;
  #onChange = null;

  constructor({ root, dimensionBattles = [], onChange = null }) {
    this.#root = root;
    this.#dimensionBattles = normalizeDimensionBattles(dimensionBattles);
    this.#onChange = typeof onChange === 'function' ? onChange : null;
    if (this.#dimensionBattles.length > 0) {
      this.#selectedDimensionBattleId = this.#dimensionBattles.at(-1).id;
    }
  }

  mount() {
    this.#root.innerHTML = `
      <div class="space-y-4 p-4 text-sm text-gray-700">
        <section class="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold text-gray-900">バトル開始時設定</h3>
            <button data-action="reset-stage-upper-inputs"
                    type="button"
                    class="shrink-0 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    title="上段の設定を初期値へ戻します">
              初期値に戻す
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
            <label class="block">
              <span class="mb-0.5 block text-xs font-medium text-gray-600">初期OD（%）</span>
              <input data-role="stage-initial-od"
                     type="number" step="1" value="0"
                     class="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums" />
            </label>
            <label class="block">
              <span class="mb-0.5 block text-xs font-medium text-gray-600">初期SP（全員）</span>
              <input data-role="stage-initial-sp"
                     type="number" step="1" value="0"
                     class="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums" />
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2">
            <label class="block">
              <span class="mb-0.5 block text-xs font-medium text-gray-600">毎ターンSP（全員）</span>
              <input data-role="stage-turnly-sp-all"
                     type="number" step="1" min="-99" max="99" value="0"
                     class="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums" />
            </label>
            <label class="block">
              <span class="mb-0.5 block text-xs font-medium text-gray-600">毎ターンSP（前衛）</span>
              <input data-role="stage-turnly-sp-front"
                     type="number" step="1" min="-99" max="99" value="0"
                     class="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums" />
            </label>
            <label class="block">
              <span class="mb-0.5 block text-xs font-medium text-gray-600">毎ターンSP（後衛）</span>
              <input data-role="stage-turnly-sp-back"
                     type="number" step="1" min="-99" max="99" value="0"
                     class="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums" />
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label class="flex items-center gap-1.5 text-xs">
              <input data-role="stage-effect-defense-up" type="checkbox" />
              <span>防御力50%アップ</span>
            </label>
            <label class="flex items-center gap-1.5 text-xs">
              <input data-role="stage-effect-debuff-guard" type="checkbox" />
              <span>デバフ無効1回付与</span>
            </label>
          </div>
        </section>

        <section class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <h3 class="font-semibold text-gray-900">恒星戦プリセット（入力補助）</h3>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-gray-600">恒星戦を選択</span>
            <select data-role="stage-dimension-battle"
                    class="w-full rounded border border-gray-300 px-2 py-1 bg-white"></select>
          </label>
          <div data-role="stage-satellites" class="space-y-2"></div>
          <p data-role="stage-preset-hint" class="text-xs text-amber-700 hidden"></p>
          <div class="rounded border border-sky-200 bg-sky-50 p-2 space-y-1">
            <p class="text-xs font-medium text-sky-900">有効なプリセット効果</p>
            <ul data-role="stage-enchant-summary" class="space-y-1 text-xs text-sky-900"></ul>
            <p data-role="stage-enchant-summary-empty" class="text-xs text-sky-700">
              現在、有効なプリセット効果はありません。
            </p>
          </div>
        </section>
      </div>
    `;

    this.#odInput = this.#root.querySelector('[data-role="stage-initial-od"]');
    this.#spInput = this.#root.querySelector('[data-role="stage-initial-sp"]');
    this.#defenseUpToggle = this.#root.querySelector('[data-role="stage-effect-defense-up"]');
    this.#debuffGuardToggle = this.#root.querySelector('[data-role="stage-effect-debuff-guard"]');
    this.#turnlySpAllInput = this.#root.querySelector('[data-role="stage-turnly-sp-all"]');
    this.#turnlySpFrontInput = this.#root.querySelector('[data-role="stage-turnly-sp-front"]');
    this.#turnlySpBackInput = this.#root.querySelector('[data-role="stage-turnly-sp-back"]');
    this.#dimensionBattleSelect = this.#root.querySelector('[data-role="stage-dimension-battle"]');
    this.#satellitesContainer = this.#root.querySelector('[data-role="stage-satellites"]');
    this.#enchantSummary = this.#root.querySelector('[data-role="stage-enchant-summary"]');
    this.#enchantSummaryEmpty = this.#root.querySelector('[data-role="stage-enchant-summary-empty"]');
    this.#hint = this.#root.querySelector('[data-role="stage-preset-hint"]');

    this.#bindEvents();
    this.#renderDimensionBattleOptions();
    this.#renderSatellites();
    this.#renderEnchantSummary();
  }

  setDimensionBattles(rawDimensionBattles = []) {
    this.#dimensionBattles = normalizeDimensionBattles(rawDimensionBattles);

    if (!this.#dimensionBattles.some((entry) => entry.id === this.#selectedDimensionBattleId)) {
      this.#selectedDimensionBattleId = this.#dimensionBattles.length > 0 ? this.#dimensionBattles.at(-1).id : null;
      this.#selectedSatelliteKeys.clear();
    }

    this.#renderDimensionBattleOptions();
    this.#renderSatellites();
    this.#emitChange();
  }

  getSnapshot() {
    const initialOdGauge = toFiniteNumber(this.#odInput?.value, 0);
    const initialSpBonusAll = toFiniteNumber(this.#spInput?.value, 0);
    const turnlySpAll = toFiniteNumber(this.#turnlySpAllInput?.value, 0);
    const turnlySpFront = toFiniteNumber(this.#turnlySpFrontInput?.value, 0);
    const turnlySpBack = toFiniteNumber(this.#turnlySpBackInput?.value, 0);
    const statusEffects = buildStatusEffectsFromUi({
      enableDefenseUp: Boolean(this.#defenseUpToggle?.checked),
      enableDebuffGuard: Boolean(this.#debuffGuardToggle?.checked),
    });

    return {
      initialOdGauge,
      initialSpBonusAll,
      turnlySpAll,
      turnlySpFront,
      turnlySpBack,
      enchantEffects: structuredClone(this.#enchantEffects),
      initialStatusEffects: statusEffects,
      selectedDimensionBattleId: this.#selectedDimensionBattleId,
    };
  }

  applySnapshot(stageSetup = {}) {
    const normalized = normalizeStageSetupSnapshot(stageSetup);
    const uiState = parseUiFromStatusEffects(normalized.initialStatusEffects);

    if (this.#odInput) {
      this.#odInput.value = String(normalized.initialOdGauge);
    }
    if (this.#spInput) {
      this.#spInput.value = String(normalized.initialSpBonusAll);
    }
    if (this.#defenseUpToggle) {
      this.#defenseUpToggle.checked = uiState.enableDefenseUp;
    }
    if (this.#debuffGuardToggle) {
      this.#debuffGuardToggle.checked = uiState.enableDebuffGuard;
    }
    if (this.#turnlySpAllInput) {
      this.#turnlySpAllInput.value = String(normalized.turnlySpAll);
    }
    if (this.#turnlySpFrontInput) {
      this.#turnlySpFrontInput.value = String(normalized.turnlySpFront);
    }
    if (this.#turnlySpBackInput) {
      this.#turnlySpBackInput.value = String(normalized.turnlySpBack);
    }
    this.#enchantEffects = structuredClone(normalized.enchantEffects);

    if (
      normalized.selectedDimensionBattleId !== null &&
      this.#dimensionBattles.some((entry) => entry.id === normalized.selectedDimensionBattleId)
    ) {
      this.#selectedDimensionBattleId = normalized.selectedDimensionBattleId;
    }

    this.#selectedSatelliteKeys.clear();
    this.#renderDimensionBattleOptions();
    this.#renderSatellites();
    this.#setUnsupportedDescriptions([]);
    this.#renderEnchantSummary();
  }

  resetToDefaults() {
    if (this.#dimensionBattles.length > 0) {
      this.#selectedDimensionBattleId = this.#dimensionBattles.at(-1).id;
    } else {
      this.#selectedDimensionBattleId = null;
    }
    this.#selectedSatelliteKeys.clear();
    this.#resetUpperInputsToDefaults();
    this.#renderDimensionBattleOptions();
    this.#renderSatellites();
    this.#emitChange();
  }

  #bindEvents() {
    const controls = [
      this.#odInput,
      this.#spInput,
      this.#defenseUpToggle,
      this.#debuffGuardToggle,
      this.#turnlySpAllInput,
      this.#turnlySpFrontInput,
      this.#turnlySpBackInput,
    ];
    for (const control of controls) {
      control?.addEventListener('change', () => this.#emitChange());
    }

    this.#dimensionBattleSelect?.addEventListener('change', () => {
      const selectedId = Number(this.#dimensionBattleSelect.value);
      this.#selectedDimensionBattleId = Number.isFinite(selectedId) ? selectedId : null;
      this.#selectedSatelliteKeys.clear();
      this.#enchantEffects = [];
      this.#renderSatellites();
      this.#setUnsupportedDescriptions([]);
      this.#renderEnchantSummary();
      this.#emitChange();
    });

    this.#root.querySelector('[data-action="reset-stage-upper-inputs"]')?.addEventListener('click', () => {
      this.#selectedSatelliteKeys.clear();
      this.#resetUpperInputsToDefaults();
      this.#renderSatellites();
    });
  }

  #renderDimensionBattleOptions() {
    if (!this.#dimensionBattleSelect) {
      return;
    }

    this.#dimensionBattleSelect.innerHTML = '';
    if (this.#dimensionBattles.length === 0) {
      this.#dimensionBattleSelect.innerHTML = '<option value="">読み込み中 / データなし</option>';
      this.#dimensionBattleSelect.disabled = true;
      return;
    }

    const options = this.#dimensionBattles.map((entry) => {
      const selected = entry.id === this.#selectedDimensionBattleId ? 'selected' : '';
      return `<option value="${entry.id}" ${selected}>${entry.title}</option>`;
    });

    this.#dimensionBattleSelect.innerHTML = options.join('');
    this.#dimensionBattleSelect.disabled = false;
  }

  #renderSatellites() {
    if (!this.#satellitesContainer) {
      return;
    }

    const current = this.#dimensionBattles.find((entry) => entry.id === this.#selectedDimensionBattleId) ?? null;
    if (!current) {
      this.#satellitesContainer.innerHTML = '<p class="text-xs text-gray-500">恒星戦データがありません。</p>';
      return;
    }

    const rows = current.satellites.map((satellite) => {
      const checked = this.#selectedSatelliteKeys.has(satellite.key) ? 'checked' : '';
      const safeDescription = satellite.desc || '（説明なし）';
      return `
        <label class="block rounded border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700">
          <span class="flex items-start gap-2">
            <input type="checkbox"
                   data-role="stage-satellite-checkbox"
                   data-key="${satellite.key}"
                   ${checked}
                   class="mt-0.5" />
            <span>
              <span class="block font-medium text-gray-800">惑星戦${satellite.index + 1}</span>
              <span class="block text-gray-600">${safeDescription}</span>
            </span>
          </span>
        </label>
      `;
    });

    this.#satellitesContainer.innerHTML = rows.join('');
    this.#satellitesContainer.querySelectorAll('[data-role="stage-satellite-checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const key = String(checkbox?.dataset?.key ?? '');
        if (!key) {
          return;
        }
        if (checkbox.checked) {
          this.#selectedSatelliteKeys.add(key);
        } else {
          this.#selectedSatelliteKeys.delete(key);
        }
        this.#applyPresetToUpperInputs();
      });
    });
  }

  #applyPresetToUpperInputs() {
    const current = this.#dimensionBattles.find((entry) => entry.id === this.#selectedDimensionBattleId) ?? null;
    if (!current) {
      return;
    }

    const checkedDescriptions = current.satellites
      .filter((satellite) => this.#selectedSatelliteKeys.has(satellite.key))
      .map((satellite) => satellite.desc)
      .filter(Boolean);
    const parsed = checkedDescriptions.length > 0
      ? parsePresetDescriptions(checkedDescriptions)
      : { ...STAGE_PRESET_RESULT_DEFAULT };

    if (this.#odInput) {
      this.#odInput.value = String(parsed.initialOdGauge);
    }
    if (this.#spInput) {
      this.#spInput.value = String(parsed.initialSpBonusAll);
    }
    if (this.#defenseUpToggle) {
      this.#defenseUpToggle.checked = parsed.enableDefenseUp;
    }
    if (this.#debuffGuardToggle) {
      this.#debuffGuardToggle.checked = parsed.enableDebuffGuard;
    }
    if (this.#turnlySpAllInput) {
      this.#turnlySpAllInput.value = String(parsed.turnlySpAll);
    }
    if (this.#turnlySpFrontInput) {
      this.#turnlySpFrontInput.value = String(parsed.turnlySpFront);
    }
    if (this.#turnlySpBackInput) {
      this.#turnlySpBackInput.value = String(parsed.turnlySpBack);
    }
    this.#enchantEffects = structuredClone(parsed.enchantEffects ?? []);
    this.#renderEnchantSummary();

    this.#setUnsupportedDescriptions(parsed.unsupportedDescriptions);

    this.#emitChange();
  }

  #resetUpperInputsToDefaults() {
    if (this.#odInput) {
      this.#odInput.value = String(DEFAULT_STAGE_SETUP.initialOdGauge);
    }
    if (this.#spInput) {
      this.#spInput.value = String(DEFAULT_STAGE_SETUP.initialSpBonusAll);
    }
    if (this.#defenseUpToggle) {
      this.#defenseUpToggle.checked = false;
    }
    if (this.#debuffGuardToggle) {
      this.#debuffGuardToggle.checked = false;
    }
    if (this.#turnlySpAllInput) {
      this.#turnlySpAllInput.value = String(DEFAULT_STAGE_SETUP.turnlySpAll);
    }
    if (this.#turnlySpFrontInput) {
      this.#turnlySpFrontInput.value = String(DEFAULT_STAGE_SETUP.turnlySpFront);
    }
    if (this.#turnlySpBackInput) {
      this.#turnlySpBackInput.value = String(DEFAULT_STAGE_SETUP.turnlySpBack);
    }
    this.#enchantEffects = [];
    this.#setUnsupportedDescriptions([]);
    this.#renderEnchantSummary();
    this.#emitChange();
  }

  #setUnsupportedDescriptions(descriptions = []) {
    if (!this.#hint) {
      return;
    }
    const normalized = Array.isArray(descriptions) ? descriptions.filter(Boolean) : [];
    if (normalized.length > 0) {
      this.#hint.textContent = `未対応効果は転記対象外です: ${normalized.join(' / ')}`;
      this.#hint.classList.remove('hidden');
      return;
    }
    this.#hint.textContent = '';
    this.#hint.classList.add('hidden');
  }

  #renderEnchantSummary() {
    if (!this.#enchantSummary || !this.#enchantSummaryEmpty) {
      return;
    }
    const labels = buildStageSetupEnchantEffectLabels(this.#enchantEffects);
    this.#enchantSummary.innerHTML = labels
      .map((label) => `<li class="leading-5">${label}</li>`)
      .join('');
    this.#enchantSummaryEmpty.classList.toggle('hidden', labels.length > 0);
  }

  #emitChange() {
    this.#onChange?.(this.getSnapshot());
  }
}

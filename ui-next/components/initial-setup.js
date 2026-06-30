import { PartySetupController } from './party-setup.js';
import { EnemySetupController } from './enemy-setup.js';
import { StageSetupController } from './stage-setup.js';
import {
  DEFAULT_SIMULATOR_SETTINGS,
  normalizeSimulatorSettings,
  TARGET_SELECTION_MODES,
} from '../utils/simulator-settings.js';
import { readStyleOwnership, writeStyleOwnership } from '../utils/style-ownership-store.js';
import {
  DEFAULT_REINCARNATION,
  DEFAULT_TITLE_RANK,
  MAX_REINCARNATION,
  MAX_TITLE_RANK,
  readCharacterSettings,
  writeCharacterSettings,
} from '../utils/character-settings-store.js';
import {
  exportStyleOwnershipCsv,
  importStyleOwnershipCsv,
  exportCharacterSettingsCsv,
  importCharacterSettingsCsv,
  downloadCSV,
} from '../utils/csv-import-export.js';

const TABS = [
  { id: 'party', label: 'Party' },
  { id: 'enemy', label: 'Enemy' },
  { id: 'stage', label: 'Stage' },
  { id: 'simulator', label: 'Global' },
];

/**
 * InitialSetup コンテナ（右サイドバー）
 * - Party / Enemy / Stage の3タブシェル
 * - Party タブに PartySetupController をマウント
 * - Enemy / Stage は placeholder（TODO）
 * - タブ切り替えは hidden 属性で制御（内部状態を保持するため）
 */
export class InitialSetupController {
  #root;
  #pickerOverlay;
  #store;
  #onApply;
  #onRecalculate;
  #partySetup = null;
  #enemySetup = null;
  #stageSetup = null;
  #enemies = [];
  #dimensionBattles = [];
  #applyBtn = null;
  #recalcBtn = null;
  #hasRecords = false;
  #hasActiveBattle = false;
  #activeTab = 'party';
  #isApplyingSetupSnapshot = false;

  #onOpenStyleOwnership = null;
  #onOpenCharacterSettings = null;

  constructor({
    root,
    pickerOverlay,
    store,
    enemies = [],
    dimensionBattles = [],
    onApply = null,
    onRecalculate = null,
    onOpenStyleOwnership = null,
    onOpenCharacterSettings = null,
  }) {
    this.#root = root;
    this.#pickerOverlay = pickerOverlay;
    this.#store = store;
    this.#enemies = enemies;
    this.#dimensionBattles = Array.isArray(dimensionBattles) ? dimensionBattles : [];
    this.#onApply = onApply;
    this.#onRecalculate = onRecalculate;
    this.#onOpenStyleOwnership = onOpenStyleOwnership;
    this.#onOpenCharacterSettings = onOpenCharacterSettings;
  }

  /**
   * 記録の有無を外部から通知する。
   * commitNextTurn 成功時に true、戦闘開始（initialize）時に false を渡す。
   * @param {boolean} hasRecords
   */
  setHasRecords(hasRecords) {
    this.#hasRecords = hasRecords;
    this.#syncPartySetupBattleState();
    this.#updateFooterButtons();
  }

  setHasActiveBattle(hasActiveBattle) {
    this.#hasActiveBattle = Boolean(hasActiveBattle);
    this.#syncPartySetupBattleState();
  }

  recomputePartyStats() {
    this.#partySetup?.recomputeAllAutomaticStats?.();
  }

  mount() {
    // 一度だけ DOM を構築
    this.#root.innerHTML = `
      <div class="flex h-full min-h-0 flex-col bg-white">
        <!-- タブヘッダー -->
        <div class="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10 shrink-0" role="tablist">
          ${TABS.map((tab) => `
            <button role="tab"
                    data-tab="${tab.id}"
                    aria-selected="${tab.id === this.#activeTab}"
                    class="flex-1 text-xs py-1.5 font-medium transition-colors
                           ${tab.id === this.#activeTab
                             ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                             : 'text-gray-500 hover:text-gray-700'}">
              ${tab.label}
            </button>
          `).join('')}
        </div>

        <!-- Party タブコンテンツ -->
        <div data-tab-content="party" class="min-h-0 flex-1 overflow-y-auto">
          <div id="party-setup-root"></div>
        </div>

        <!-- Enemy タブコンテンツ -->
        <div data-tab-content="enemy" hidden class="min-h-0 flex-1 overflow-y-auto">
          <div id="enemy-setup-root"></div>
        </div>

        <!-- Stage タブコンテンツ -->
        <div data-tab-content="stage" hidden class="min-h-0 flex-1 overflow-y-auto bg-white">
          <div id="stage-setup-root"></div>
        </div>

        <!-- Simulator Settings タブコンテンツ -->
        <div data-tab-content="simulator" hidden class="min-h-0 flex-1 overflow-y-auto p-4 text-sm bg-white">
          <div class="space-y-4">
            <h3 class="font-bold border-b border-gray-200 pb-2 text-gray-700">ターゲット選択の簡略化</h3>
            <label class="setting-switch flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 cursor-pointer">
              <div class="min-w-0">
                <div class="font-medium text-gray-800">敵ターゲット選択を簡略化</div>
                <div class="mt-1 text-xs leading-5 text-gray-500">
                  オンのときは敵単体指定スキルでも個別ターゲット picker を出さず、target 未指定時は engine default に委ねます。
                </div>
              </div>
              <span class="shrink-0 pt-0.5">
                <input type="checkbox" data-role="enemy-target-simplify-toggle" class="sr-only peer" checked />
                <span class="setting-switch__track">
                  <span class="setting-switch__thumb"></span>
                </span>
              </span>
            </label>
            <label class="setting-switch flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 cursor-pointer">
              <div class="min-w-0">
                <div class="font-medium text-gray-800">味方ターゲット選択を簡略化</div>
                <div class="mt-1 text-xs leading-5 text-gray-500">
                  オンのときは味方単体指定スキルでも個別ターゲット picker を出さず、target 未指定時は engine default に委ねます。
                </div>
              </div>
              <span class="shrink-0 pt-0.5">
                <input type="checkbox" data-role="ally-target-simplify-toggle" class="sr-only peer" />
                <span class="setting-switch__track">
                  <span class="setting-switch__thumb"></span>
                </span>
              </span>
            </label>
            <!-- キャプチャ設定 -->
            <h3 class="font-bold border-b border-gray-200 pb-2 text-gray-700 mt-4">キャプチャ</h3>
            <label class="setting-switch flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 cursor-pointer">
              <div class="min-w-0">
                <div class="font-medium text-gray-800">バトル終了までをキャプチャ</div>
                <div class="mt-1 text-xs leading-5 text-gray-500">
                  オンのときは、最初にバトル終了になった行を含むところまでを PNG 保存します。
                </div>
              </div>
              <span class="shrink-0 pt-0.5">
                <input type="checkbox"
                       data-role="capture-until-battle-end-toggle"
                       class="sr-only peer"
                       ${DEFAULT_SIMULATOR_SETTINGS.captureUntilBattleEnd ? 'checked' : ''} />
                <span class="setting-switch__track">
                  <span class="setting-switch__thumb"></span>
                </span>
              </span>
            </label>
            <!-- 所持スタイル状況 -->
            <h3 class="font-bold border-b border-gray-200 pb-2 text-gray-700 mt-4">所持スタイル状況</h3>
            <div class="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
              <div class="mt-1 text-xs leading-5 text-gray-500 mb-2">
                スタイルの所持・限界突破状況を設定します。未設定の場合、A/S は限界突破最大、SS/SSR は限界突破 0 としてステータスが計算されます。
              </div>
              <div class="global-csv-btns">
                <button data-role="open-style-ownership"
                        class="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
                  所持状況を設定
                </button>
                <button data-role="export-style-ownership"
                        class="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  CSVエクスポート
                </button>
                <button data-role="import-style-ownership"
                        class="text-xs px-3 py-1.5 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors">
                  CSVインポート
                </button>
                <input type="file" data-role="import-style-ownership-file" accept=".csv,.CSV" hidden>
              </div>
              <div data-role="status-style-ownership" class="global-csv-status"></div>
            </div>
            <!-- 転生・称号設定 -->
            <h3 class="font-bold border-b border-gray-200 pb-2 text-gray-700 mt-4">転生・称号レベル</h3>
            <div class="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
              <div class="mt-1 text-xs leading-5 text-gray-500 mb-2">
                キャラクターごとの転生回数（0〜${MAX_REINCARNATION}）と称号レベル（0〜${MAX_TITLE_RANK}）を設定します。未設定の場合、転生 ${DEFAULT_REINCARNATION}・称号レベル ${DEFAULT_TITLE_RANK} として計算されます。
              </div>
              <div class="global-csv-btns">
                <button data-role="open-character-settings"
                        class="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
                  転生・称号を設定
                </button>
                <button data-role="export-character-settings"
                        class="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  CSVエクスポート
                </button>
                <button data-role="import-character-settings"
                        class="text-xs px-3 py-1.5 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors">
                  CSVインポート
                </button>
                <input type="file" data-role="import-character-settings-file" accept=".csv,.CSV" hidden>
              </div>
              <div data-role="status-character-settings" class="global-csv-status"></div>
            </div>
          </div>
        </div>

        <!-- 共有フッター: 全タブ共通 -->
        <div class="shrink-0 bg-white border-t border-gray-200 px-3 pt-2 space-y-1.5"
             style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom))">
          <button data-role="recalc-btn" hidden disabled
                  class="w-full text-sm py-1.5 rounded-md font-medium bg-amber-500 text-white
                         disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-600 transition-colors">
            ↺ 設定を反映
          </button>
          <button data-role="apply-btn" disabled
                  class="w-full text-sm py-1.5 rounded-md font-medium bg-blue-500 text-white
                         disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors">
            ▶ 戦闘開始
          </button>
          <p data-role="apply-hint"
             class="text-xs text-center text-gray-400 hidden">
            前衛3スロットを設定してください
          </p>
        </div>
      </div>
    `;

    // タブ切り替えイベント
    this.#root.querySelectorAll('[role="tab"]').forEach((btn) => {
      btn.addEventListener('click', () => this.#switchTab(btn.dataset.tab));
    });

    // ボタン・ヒントへの参照
    this.#applyBtn = this.#root.querySelector('[data-role="apply-btn"]');
    this.#recalcBtn = this.#root.querySelector('[data-role="recalc-btn"]');

    // PartySetup を初期化（1回のみ）
    const partyRoot = this.#root.querySelector('#party-setup-root');
    this.#partySetup = new PartySetupController({
      root: partyRoot,
      pickerOverlay: this.#pickerOverlay,
      store: this.#store,
      onResetAll: () => this.#resetAllSetup(),
      onChange: (snapshot, meta) => {
        this.#updateFooterButtons();
        if (this.#isApplyingSetupSnapshot) {
          return;
        }
        if (!this.#hasActiveBattle || !meta?.hasSkillSetDelta || !snapshot?.isFrontFilled) {
          return;
        }
        this.#onRecalculate?.(this.getSetupSnapshot(snapshot), {
          automatic: true,
          meta,
        });
      },
    });
    this.#partySetup.mount();
    this.#syncPartySetupBattleState();

    // EnemySetup を初期化（1回のみ）
    const enemyRoot = this.#root.querySelector('#enemy-setup-root');
    this.#enemySetup = new EnemySetupController({
      root: enemyRoot,
      enemies: this.#enemies,
      onChange: () => {
        this.#updateFooterButtons();
        if (this.#isApplyingSetupSnapshot) {
          return;
        }
        const partySnapshot = this.#partySetup?.getSnapshot();
        if (!this.#hasActiveBattle || !partySnapshot?.isFrontFilled) {
          return;
        }
        this.#onRecalculate?.(this.getSetupSnapshot(partySnapshot), {
          automatic: true,
          meta: { enemySetupChanged: true },
        });
      },
    });
    this.#enemySetup.mount();

    // StageSetup を初期化（1回のみ）
    const stageRoot = this.#root.querySelector('#stage-setup-root');
    this.#stageSetup = new StageSetupController({
      root: stageRoot,
      dimensionBattles: this.#dimensionBattles,
    });
    this.#stageSetup.mount();

    // 戦闘開始クリック
    this.#applyBtn.addEventListener('click', () => {
      if (this.#applyBtn.disabled) return;
      const snapshot = this.#partySetup.getSnapshot();
      if (!snapshot.isFrontFilled) return;
      this.#onApply?.(this.getSetupSnapshot(snapshot));
    });

    // 設定を反映クリック
    this.#recalcBtn.addEventListener('click', () => {
      if (this.#recalcBtn.disabled) return;
      const snapshot = this.#partySetup.getSnapshot();
      if (!snapshot.isFrontFilled) return;
      this.#onRecalculate?.(this.getSetupSnapshot(snapshot), {
        automatic: false,
        meta: null,
      });
    });

    // 所持スタイル状況ボタン
    this.#root.querySelector('[data-role="open-style-ownership"]')
      ?.addEventListener('click', () => this.#onOpenStyleOwnership?.());

    // 転生・称号設定ボタン
    this.#root.querySelector('[data-role="open-character-settings"]')
      ?.addEventListener('click', () => this.#onOpenCharacterSettings?.());

    // CSV ステータス表示ユーティリティ
    const showCsvStatus = (roleEl, message, ok) => {
      if (!roleEl) return;
      roleEl.textContent = message;
      roleEl.style.color = ok ? '#059669' : '#dc2626';
      clearTimeout(roleEl._csvTimer);
      roleEl._csvTimer = setTimeout(() => { roleEl.textContent = ''; }, 5000);
    };

    // 所持スタイル CSV エクスポート
    this.#root.querySelector('[data-role="export-style-ownership"]')
      ?.addEventListener('click', () => {
        const entries = readStyleOwnership();
        const csv = exportStyleOwnershipCsv(this.#store, entries);
        downloadCSV('style_ownership.csv', csv);
      });

    // 所持スタイル CSV インポート
    const sof = this.#root.querySelector('[data-role="import-style-ownership-file"]');
    const sosStatus = this.#root.querySelector('[data-role="status-style-ownership"]');
    this.#root.querySelector('[data-role="import-style-ownership"]')
      ?.addEventListener('click', () => sof?.click());
    sof?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = importStyleOwnershipCsv(ev.target.result, this.#store);
        if (result.ok) {
          const merged = { ...readStyleOwnership(), ...result.entries };
          writeStyleOwnership(merged);
        }
        showCsvStatus(sosStatus, result.message, result.ok);
      };
      reader.readAsText(file, 'utf-8');
    });

    // キャラクター設定 CSV エクスポート
    this.#root.querySelector('[data-role="export-character-settings"]')
      ?.addEventListener('click', () => {
        const settings = readCharacterSettings();
        const csv = exportCharacterSettingsCsv(this.#store, settings);
        downloadCSV('character_settings.csv', csv);
      });

    // キャラクター設定 CSV インポート
    const csf = this.#root.querySelector('[data-role="import-character-settings-file"]');
    const cssStatus = this.#root.querySelector('[data-role="status-character-settings"]');
    this.#root.querySelector('[data-role="import-character-settings"]')
      ?.addEventListener('click', () => csf?.click());
    csf?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = importCharacterSettingsCsv(ev.target.result, this.#store);
        if (result.ok) {
          const merged = { ...readCharacterSettings(), ...result.settings };
          writeCharacterSettings(merged);
        }
        showCsvStatus(cssStatus, result.message, result.ok);
      };
      reader.readAsText(file, 'utf-8');
    });

  }

  /**
   * InitialSetup 全体の設定（Party設定 + Enemy設定）を結合して返す
   */
  getSetupSnapshot(partySnapshot) {
    const stageSetup = this.getStageSetupSnapshot();
    return {
      party: {
        ...partySnapshot,
        stageSetup,
      },
      simulatorSettings: this.getSimulatorSettings(),
      enemy: this.#enemySetup?.getSnapshot() ?? { enemyCount: 1 },
    };
  }

  getStageSetupSnapshot() {
    return this.#stageSetup?.getSnapshot?.() ?? {
      initialOdGauge: 0,
      initialSpBonusAll: 0,
      initialStatusEffects: [],
      enchantEffects: [],
      selectedDimensionBattleId: null,
      turnlyOdGauge: 0,
      turnlySpAll: 0,
      turnlySpFront: 0,
      turnlySpBack: 0,
    };
  }

  getCurrentSetupSnapshot() {
    const partySnapshot = this.#partySetup?.getSnapshot();
    if (!partySnapshot) {
      throw new Error('Party Setup is not mounted.');
    }
    return this.getSetupSnapshot(partySnapshot);
  }

  getPartyPresetPreviews() {
    return this.#partySetup?.getPresetPreviews?.() ?? [];
  }

  savePartyPreset(index, options = {}) {
    return this.#partySetup?.savePreset(index, options) ?? false;
  }

  loadPartyPreset(index) {
    return this.#partySetup?.loadPreset(index) ?? false;
  }

  renamePartyPreset(index, options = {}) {
    return this.#partySetup?.renamePreset(index, options) ?? false;
  }

  clearPartyPreset(index) {
    return this.#partySetup?.clearPreset(index) ?? false;
  }

  getSimulatorSettings() {
    const enemyMode = this.#root.querySelector('[data-role="enemy-target-simplify-toggle"]')?.checked
      ? TARGET_SELECTION_MODES.SIMPLE
      : TARGET_SELECTION_MODES.MANUAL;
    const allyMode = this.#root.querySelector('[data-role="ally-target-simplify-toggle"]')?.checked
      ? TARGET_SELECTION_MODES.SIMPLE
      : TARGET_SELECTION_MODES.MANUAL;
    return normalizeSimulatorSettings({
      targetSelection: {
        enemyMode,
        allyMode,
      },
      captureUntilBattleEnd:
        this.#root.querySelector('[data-role="capture-until-battle-end-toggle"]')?.checked ?? false,
    });
  }

  applySetupSnapshot(snapshot = {}) {
    this.#isApplyingSetupSnapshot = true;
    try {
      this.#partySetup?.applySnapshot(snapshot.party ?? {});
    } finally {
      this.#isApplyingSetupSnapshot = false;
    }
    if (snapshot.enemy) {
      this.#enemySetup?.applySnapshot(snapshot.enemy);
    }
    this.#stageSetup?.applySnapshot(snapshot?.party?.stageSetup ?? {});
    const simulatorSettings = normalizeSimulatorSettings(snapshot.simulatorSettings);
    const enemyMode = simulatorSettings.targetSelection.enemyMode;
    const allyMode = simulatorSettings.targetSelection.allyMode;
    const enemyToggle = this.#root.querySelector('[data-role="enemy-target-simplify-toggle"]');
    if (enemyToggle) {
      enemyToggle.checked = enemyMode === TARGET_SELECTION_MODES.SIMPLE;
    }
    const allyToggle = this.#root.querySelector('[data-role="ally-target-simplify-toggle"]');
    if (allyToggle) {
      allyToggle.checked = allyMode === TARGET_SELECTION_MODES.SIMPLE;
    }
    const captureToggle = this.#root.querySelector('[data-role="capture-until-battle-end-toggle"]');
    if (captureToggle) {
      captureToggle.checked = Boolean(simulatorSettings.captureUntilBattleEnd);
    }
    this.#updateFooterButtons();
  }

  setEnemies(enemies = []) {
    this.#enemies = Array.isArray(enemies) ? enemies : [];
    this.#enemySetup?.setEnemies(this.#enemies);
  }

  setDimensionBattles(dimensionBattles = []) {
    this.#dimensionBattles = Array.isArray(dimensionBattles) ? dimensionBattles : [];
    this.#stageSetup?.setDimensionBattles(this.#dimensionBattles);
  }

  #resetAllSetup() {
    const ok = window.confirm?.('Party / Enemy / Stage の設定をすべて初期化しますか？') ?? true;
    if (!ok) {
      return;
    }
    this.#isApplyingSetupSnapshot = true;
    try {
      this.#partySetup?.disbandParty?.();
      this.#enemySetup?.resetToDefaults?.();
      this.#stageSetup?.resetToDefaults?.();
    } finally {
      this.#isApplyingSetupSnapshot = false;
    }
    this.#updateFooterButtons();
  }

  #syncPartySetupBattleState() {
    this.#partySetup?.setBattleState({
      hasActiveBattle: this.#hasActiveBattle,
      hasRecords: this.#hasRecords,
    });
  }

  /** ボタンの有効/無効・表示を partySetup の状態と hasRecords に基づいて更新する */
  #updateFooterButtons() {
    if (!this.#applyBtn) return;
    const snapshot = this.#partySetup?.getSnapshot();
    const filled = snapshot?.isFrontFilled ?? false;

    this.#applyBtn.disabled = !filled;

    const applyHint = this.#root.querySelector('[data-role="apply-hint"]');
    applyHint?.classList.toggle('hidden', filled);

    // ↺ 設定を反映: 記録がある時のみ表示・前衛が埋まっている時のみ有効
    if (this.#recalcBtn) {
      this.#recalcBtn.hidden = !this.#hasRecords;
      this.#recalcBtn.disabled = !(filled && this.#hasRecords);
    }
  }

  #switchTab(tabId) {
    this.#activeTab = tabId;

    // タブボタンの active スタイルを更新
    this.#root.querySelectorAll('[role="tab"]').forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.setAttribute('aria-selected', String(isActive));
      btn.className = [
        'flex-1 text-xs py-1.5 font-medium transition-colors',
        isActive
          ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
          : 'text-gray-500 hover:text-gray-700',
      ].join(' ');
    });

    // コンテンツの hidden 切り替え
    this.#root.querySelectorAll('[data-tab-content]').forEach((el) => {
      el.hidden = el.dataset.tabContent !== tabId;
    });
  }
}

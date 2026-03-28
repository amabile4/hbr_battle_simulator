import { PartySetupController } from './party-setup.js';
import {
  normalizeSimulatorSettings,
  TARGET_SELECTION_MODES,
} from '../utils/simulator-settings.js';

const TABS = [
  { id: 'party', label: 'Party Setup' },
  { id: 'enemy', label: 'Enemy Setup' },
  { id: 'stage', label: 'Stage Setup' },
  { id: 'simulator', label: 'Simulator Settings' },
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
  #applyBtn = null;
  #recalcBtn = null;
  #hasRecords = false;
  #hasActiveBattle = false;
  #activeTab = 'party';
  #isApplyingSetupSnapshot = false;

  constructor({
    root,
    pickerOverlay,
    store,
    onApply = null,
    onRecalculate = null,
  }) {
    this.#root = root;
    this.#pickerOverlay = pickerOverlay;
    this.#store = store;
    this.#onApply = onApply;
    this.#onRecalculate = onRecalculate;
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
                    class="flex-1 text-xs py-2.5 font-medium transition-colors
                           ${tab.id === this.#activeTab
                             ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                             : 'text-gray-500 hover:text-gray-700'}">
              ${tab.label}
            </button>
          `).join('')}
        </div>

        <!-- Party タブコンテンツ -->
        <div data-tab-content="party" class="flex min-h-0 flex-1 flex-col">
          <div id="party-setup-root" class="flex-1 min-h-0 overflow-y-auto"></div>
          <div class="sticky bottom-0 bg-white border-t border-gray-200 px-3 pt-2 pb-safe space-y-1.5"
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

        <!-- Enemy タブコンテンツ -->
        <div data-tab-content="enemy" hidden
             class="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-gray-400 text-center py-12">
          Enemy Setup<br /><span class="text-xs">(TODO)</span>
        </div>

        <!-- Stage タブコンテンツ -->
        <div data-tab-content="stage" hidden
             class="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-gray-400 text-center py-12">
          Stage Setup<br /><span class="text-xs">(TODO)</span>
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
                <input type="checkbox" data-role="ally-target-simplify-toggle" class="sr-only peer" checked />
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
                <input type="checkbox" data-role="capture-until-battle-end-toggle" class="sr-only peer" />
                <span class="setting-switch__track">
                  <span class="setting-switch__thumb"></span>
                </span>
              </span>
            </label>
          </div>
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

  }

  /**
   * InitialSetup 全体の設定（Party設定 + Enemy設定）を結合して返す
   */
  getSetupSnapshot(partySnapshot) {
    return {
      party: partySnapshot,
      simulatorSettings: this.getSimulatorSettings(),
    };
  }

  getCurrentSetupSnapshot() {
    const partySnapshot = this.#partySetup?.getSnapshot();
    if (!partySnapshot) {
      throw new Error('Party Setup is not mounted.');
    }
    return this.getSetupSnapshot(partySnapshot);
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
        'flex-1 text-xs py-2.5 font-medium transition-colors',
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

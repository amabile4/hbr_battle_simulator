import { PartySetupController } from './party-setup.js';

const TABS = [
  { id: 'party', label: 'Party Setup' },
  { id: 'enemy', label: 'Enemy Setup' },
  { id: 'stage', label: 'Stage Setup' },
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
  #activeTab = 'party';

  constructor({ root, pickerOverlay, store, onApply = null, onRecalculate = null }) {
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
    this.#updateFooterButtons();
  }

  mount() {
    // 一度だけ DOM を構築
    this.#root.innerHTML = `
      <div class="flex flex-col">
        <!-- タブヘッダー -->
        <div class="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10" role="tablist">
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
        <div data-tab-content="party">
          <div id="party-setup-root"></div>
          <div class="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 space-y-1.5">
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
             class="p-4 text-sm text-gray-400 text-center py-12">
          Enemy Setup<br /><span class="text-xs">(TODO)</span>
        </div>

        <!-- Stage タブコンテンツ -->
        <div data-tab-content="stage" hidden
             class="p-4 text-sm text-gray-400 text-center py-12">
          Stage Setup<br /><span class="text-xs">(TODO)</span>
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
      onChange: () => this.#updateFooterButtons(),
    });
    this.#partySetup.mount();

    // 戦闘開始クリック
    this.#applyBtn.addEventListener('click', () => {
      if (this.#applyBtn.disabled) return;
      const snapshot = this.#partySetup.getSnapshot();
      if (!snapshot.isFrontFilled) return;
      this.#onApply?.(snapshot);
    });

    // 設定を反映クリック
    this.#recalcBtn.addEventListener('click', () => {
      if (this.#recalcBtn.disabled) return;
      const snapshot = this.#partySetup.getSnapshot();
      if (!snapshot.isFrontFilled) return;
      this.#onRecalculate?.(snapshot);
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

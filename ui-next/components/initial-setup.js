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
  #activeTab = 'party';

  constructor({ root, pickerOverlay, store }) {
    this.#root = root;
    this.#pickerOverlay = pickerOverlay;
    this.#store = store;
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

    // PartySetup を初期化（1回のみ）
    const partyRoot = this.#root.querySelector('#party-setup-root');
    const partySetup = new PartySetupController({
      root: partyRoot,
      pickerOverlay: this.#pickerOverlay,
      store: this.#store,
    });
    partySetup.mount();
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

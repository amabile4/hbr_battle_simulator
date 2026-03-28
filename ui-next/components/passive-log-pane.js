export class PassiveLogPaneController {
  #root;
  #onHasRowsChange;
  #rows = [];

  constructor({ root, onHasRowsChange = null }) {
    this.#root = root;
    this.#onHasRowsChange = onHasRowsChange;
  }

  mount() {
    this.#root.innerHTML = `
      <div class="flex h-full min-h-0 flex-col bg-white">
        <div class="hidden shrink-0 sm:flex">
          <div data-role="passive-log-resize-handle"
               role="separator"
               tabindex="0"
               aria-controls="passive-log-pane"
               aria-label="Passive Log の高さを変更"
               aria-orientation="horizontal"
               class="passive-log-pane__resize-handle w-full">
            <span class="passive-log-pane__resize-grip" aria-hidden="true"></span>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 flex-col bg-white">
          <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold text-gray-800">Passive Log</h2>
              <p class="mt-0.5 text-xs text-gray-500">
                現在の session から再構築したパッシブ発火ログ
              </p>
            </div>
            <span data-role="passive-log-count"
                  class="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
              0
            </span>
          </div>
          <p data-role="passive-log-empty"
             class="m-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-400">
            まだ表示できるパッシブログはありません。
          </p>
          <div data-role="passive-log-rows"
               class="hidden min-h-0 flex-1 overflow-auto border-t border-gray-100 bg-white"
               style="white-space: nowrap;"></div>
        </div>
      </div>
    `;
    this.#emitHasRowsChange(false);
  }

  setRows(rows = []) {
    this.#rows = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
    this.#renderRows();
    this.#emitHasRowsChange(this.#rows.length > 0);
  }

  #emitHasRowsChange(hasRows) {
    if (typeof this.#onHasRowsChange === 'function') {
      this.#onHasRowsChange(Boolean(hasRows));
    }
  }

  #renderRows() {
    const container = this.#root.querySelector('[data-role="passive-log-rows"]');
    const empty = this.#root.querySelector('[data-role="passive-log-empty"]');
    const count = this.#root.querySelector('[data-role="passive-log-count"]');
    if (!container || !empty || !count) {
      return;
    }

    container.innerHTML = '';
    const rows = Array.isArray(this.#rows) ? this.#rows : [];
    const hasRows = rows.length > 0;
    count.textContent = String(rows.length);
    empty.classList.toggle('hidden', hasRows);
    container.classList.toggle('hidden', !hasRows);
    if (!hasRows) {
      return;
    }

    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof row.text !== 'string') {
        continue;
      }
      const line = document.createElement('div');
      line.dataset.role = 'passive-log-row';
      line.dataset.rowKind = String(row.kind ?? '');
      line.textContent = row.text;
      line.className =
        row.kind === 'marker'
          ? 'border-b border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-[11px] text-gray-600'
          : 'px-3 py-1.5 font-mono text-[11px] text-gray-800';
      container.appendChild(line);
    }
  }
}

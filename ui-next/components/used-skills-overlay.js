function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSkillIcon(icon, label, iconClassName = 'h-4 w-4') {
  if (!icon || typeof icon !== 'object' || !icon.url) {
    return '';
  }
  return `<img src="${escapeHtml(icon.url)}" alt="${escapeHtml(label)}" class="${iconClassName} shrink-0 object-contain" loading="lazy" />`;
}

export class UsedSkillsOverlayController {
  #root;
  #rows = [];
  #isOpen = false;

  constructor({ root }) {
    this.#root = root;
  }

  mount() {
    this.#root.innerHTML = `
      <div data-role="used-skills-backdrop"
           class="hidden absolute inset-0 bg-gray-900/50"></div>
      <section data-role="used-skills-dialog"
               role="dialog"
               aria-modal="true"
               aria-label="使用スキル一覧"
               class="hidden absolute inset-0 z-10 flex items-center justify-center p-3 sm:p-6">
        <div class="flex w-full max-w-[min(98vw,1800px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
             style="max-height: min(88dvh, 92vh)">
          <header class="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold text-gray-800 sm:text-base">使用スキル一覧</h2>
              <p class="mt-0.5 text-xs text-gray-500">現時点の Turn 記録から、キャラクターごとに実際に使用したスキルを表示</p>
            </div>
            <button type="button"
                    data-role="used-skills-close"
                    aria-label="使用スキル一覧を閉じる"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
              ×
            </button>
          </header>
          <div data-role="used-skills-content" class="min-h-0 flex-1 overflow-auto p-4 sm:p-5"></div>
        </div>
      </section>
    `;

    this.#root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof window.HTMLElement)) {
        return;
      }
      if (target.closest('[data-role="used-skills-close"]')) {
        this.close();
        return;
      }
      if (target.matches('[data-role="used-skills-backdrop"]')) {
        this.close();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#isOpen) {
        this.close();
      }
    });

    this.#render();
    this.close();
  }

  toggle() {
    if (this.#isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.#isOpen = true;
    this.#syncVisibility();
  }

  close() {
    this.#isOpen = false;
    this.#syncVisibility();
  }

  setRows(rows = []) {
    this.#rows = Array.isArray(rows) ? rows.map((row) => structuredClone(row)) : [];
    this.#render();
  }

  #syncVisibility() {
    const backdrop = this.#root.querySelector('[data-role="used-skills-backdrop"]');
    const dialog = this.#root.querySelector('[data-role="used-skills-dialog"]');
    if (!backdrop || !dialog) {
      return;
    }

    this.#root.classList.toggle('hidden', !this.#isOpen);
    backdrop.classList.toggle('hidden', !this.#isOpen);
    dialog.classList.toggle('hidden', !this.#isOpen);
  }

  #render() {
    const content = this.#root.querySelector('[data-role="used-skills-content"]');
    if (!content) {
      return;
    }

    if (!Array.isArray(this.#rows) || this.#rows.length === 0) {
      content.innerHTML = `
        <p class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
          使用スキルを表示できるキャラクターがいません。
        </p>
      `;
      return;
    }

    const cards = this.#rows.map((row) => {
      const partyLabel = `P${Number(row?.partyIndex ?? 0) + 1}`;
      const header = `${escapeHtml(partyLabel)} ${escapeHtml(row?.characterName ?? '-')}`;
      const styleText = escapeHtml(row?.styleName ?? '-');
      const usedSkills = Array.isArray(row?.usedSkills) ? row.usedSkills : [];

      const skillItems = usedSkills.length > 0
        ? usedSkills.map((skill) => {
            const attackIconHtml = renderSkillIcon(
              skill?.attackTypeIcon,
              String(skill?.attackTypeIcon?.key ?? '攻撃属性')
            );
            const elementIconsHtml = Array.isArray(skill?.elementIcons)
              ? skill.elementIcons
                  .map((icon) => renderSkillIcon(icon, String(icon?.key ?? '属性')))
                  .join('')
              : '';
            return `
              <li class="border-b border-gray-100 py-1.5 last:border-b-0">
                <div class="used-skill-entry min-w-0">
                  <div class="used-skill-entry__icons-container">
                    <div class="used-skill-entry__icons used-skill-entry__icons--element">${elementIconsHtml}</div>
                    <div class="used-skill-entry__icons used-skill-entry__icons--attack">${attackIconHtml}</div>
                  </div>
                  <div class="used-skill-entry__name break-words text-sm text-gray-800">${escapeHtml(skill?.name ?? '')}</div>
                </div>
              </li>
            `;
          }).join('')
        : '<li class="py-1.5 text-sm text-gray-400">まだ使用スキルはありません</li>';

      const equippedPassiveSkills = Array.isArray(row?.equippedPassiveSkills)
        ? row.equippedPassiveSkills
        : [];
      const equippedPassiveItems = equippedPassiveSkills.length > 0
        ? equippedPassiveSkills
            .map((skill) => {
              return `<li class="py-1"><span class="min-w-0 break-words text-xs text-sky-900">${escapeHtml(skill?.name ?? '')}</span></li>`;
            })
            .join('')
        : '';

      const equippedPassiveSection = equippedPassiveSkills.length > 0
        ? `
          <div class="mt-2 rounded-lg border border-sky-200 bg-sky-50/80 px-2.5 py-2">
            <ul class="mt-0">${equippedPassiveItems}</ul>
          </div>
        `
        : '';

      return `
        <article class="used-skills-card flex min-h-[22rem] flex-col rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <h3 class="text-sm font-semibold text-gray-800">${header}</h3>
          <p class="mt-0.5 text-xs text-gray-500">${styleText}</p>
          <div class="mt-2 rounded-lg border border-gray-100 bg-gray-50/50 px-2.5 py-2">
            <ul class="mt-0">${skillItems}</ul>
          </div>
          ${equippedPassiveSection}
        </article>
      `;
    }).join('');

    content.innerHTML = `
      <div class="overflow-auto">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          ${cards}
        </div>
      </div>
    `;
  }
}

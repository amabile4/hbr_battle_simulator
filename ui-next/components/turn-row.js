import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';

/**
 * 1ターン分の横長コンテナ UI
 *
 * - 未コミット行: record=null、stateBefore のみ（スキル選択 + Commit ボタン表示）
 * - コミット済み行: record あり、stateBefore/stateAfter で SP 表示
 * - スロットは commit 時点の position 順で表示
 */
export class TurnRowController {
  #root;
  #store;
  #turnIndex;
  #record;
  #stateBefore;
  #stateAfter;
  #onSlotChange;
  #onCommit;
  #onNoteChange;

  // D&D 用
  #dragSrcPosition = null;

  constructor({ root, store, turnIndex, record, stateBefore, stateAfter, onSlotChange, onCommit, onNoteChange }) {
    this.#root = root;
    this.#store = store;
    this.#turnIndex = turnIndex;
    this.#record = record;
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    this.#onSlotChange = onSlotChange;
    this.#onCommit = onCommit;
    this.#onNoteChange = onNoteChange;
  }

  mount() {
    this.#root.innerHTML = this.#buildHtml();
    this.#bindEvents();
  }

  update({ record, stateBefore, stateAfter }) {
    this.#record = record;
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    this.#root.innerHTML = this.#buildHtml();
    this.#bindEvents();
  }

  /** コミットボタン押下時に呼ばれる前に TurnAreaController が現在のスロット選択を収集するため */
  getCurrentSlotActions() {
    const actions = {};
    this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
      const position = Number(sel.dataset.position);
      const skillId = sel.value === '' ? null : Number(sel.value);
      if (skillId != null) actions[position] = { skillId };
    });
    return actions;
  }

  getCurrentNote() {
    return this.#root.querySelector('[data-role="note"]')?.value ?? '';
  }

  // ---- private ----

  /** commit 済みターンの position 順メンバーリスト（snapBefore ベース） */
  #getMembersInPositionOrder() {
    const state = this.#stateBefore;
    if (!state?.party) return [];
    return [...state.party].sort((a, b) => a.position - b.position);
  }

  #buildHtml() {
    const isCommitted = this.#record !== null;
    const members = this.#getMembersInPositionOrder();

    // ターン情報
    const turnInfoHtml = this.#buildTurnInfoHtml(isCommitted);

    // スロット（前衛 position 0-2）
    const frontSlots = members
      .filter((m) => m.position <= 2)
      .map((m) => this.#buildFrontSlotHtml(m, isCommitted))
      .join('');

    // スロット（後衛 position 3-5）
    const backSlots = members
      .filter((m) => m.position >= 3)
      .map((m) => this.#buildBackSlotHtml(m))
      .join('');

    // ボタン列
    const buttonHtml = this.#buildButtonHtml(isCommitted);

    // メモ欄
    const noteValue = isCommitted
      ? (this.#record?.note ?? '')
      : (this.#root.querySelector('[data-role="note"]')?.value ?? '');
    const noteHtml = `
      <div class="flex-shrink-0 w-24">
        <textarea data-role="note" rows="3"
                  class="w-full h-full text-xs border border-gray-200 rounded px-1 py-0.5
                         resize-none focus:outline-none focus:ring-1 focus:ring-blue-300
                         ${isCommitted ? 'bg-gray-50' : 'bg-white'}"
                  placeholder="メモ">${noteValue}</textarea>
      </div>`;

    return `
      <div class="flex items-stretch gap-px border-b border-gray-200 bg-white
                  hover:bg-gray-50 transition-colors ${isCommitted ? '' : 'bg-blue-50/30'}">
        ${turnInfoHtml}
        <div class="flex gap-px flex-1">
          ${frontSlots}
          <div class="w-px bg-gray-200 self-stretch mx-0.5"></div>
          ${backSlots}
        </div>
        ${buttonHtml}
        ${noteHtml}
      </div>`;
  }

  #buildTurnInfoHtml(isCommitted) {
    if (!isCommitted) {
      // 未コミット行: 次のターン番号を仮表示
      const nextTurnNo = (this.#stateBefore?.turnState?.turnIndex ?? 1);
      return `
        <div class="flex-shrink-0 w-14 flex flex-col items-center justify-center
                    gap-0.5 px-1 py-1 bg-gray-50 border-r border-gray-200 text-gray-400">
          <span class="text-xs font-bold">T${nextTurnNo}</span>
          <span class="text-xs">—</span>
        </div>`;
    }

    const ts = this.#record.turnState ?? {};
    const turnNo = ts.turnIndex ?? '?';
    const seqId = ts.sequenceId ?? '?';
    const odGauge = Number(this.#record.projections?.odGaugeAtEnd ?? ts.odGauge ?? 0).toFixed(0);
    const isExtra = ts.turnType === 'extra';
    const isOd = ts.odLevel > 0;
    const odLabel = isExtra ? 'EX' : isOd ? `OD${ts.odLevel}` : '';
    const odLabelClass = isExtra
      ? 'bg-amber-100 text-amber-700'
      : isOd
        ? 'bg-purple-100 text-purple-700'
        : '';

    return `
      <div class="flex-shrink-0 w-14 flex flex-col items-center justify-center
                  gap-0.5 px-1 py-1 bg-gray-50 border-r border-gray-200">
        <span class="text-xs font-bold text-gray-700">T${turnNo}</span>
        ${odLabel
          ? `<span class="text-xs px-1 rounded font-medium ${odLabelClass}">${odLabel}</span>`
          : '<span class="text-xs text-gray-300">—</span>'}
        <span class="text-xs text-gray-400">${odGauge}%</span>
        <span class="text-xs text-gray-300">#${seqId}</span>
      </div>`;
  }

  /** member.styleId から raw style 経由で画像 URL を取得する */
  #resolveImageUrl(member) {
    const rawStyle = this.#store?.getStyleById?.(member.styleId);
    return rawStyle ? resolveStyleImageUrl(rawStyle) : '';
  }

  #buildFrontSlotHtml(member, isCommitted) {
    const imageUrl = this.#resolveImageUrl(member);
    const spAfter = isCommitted
      ? (this.#stateAfter?.party.find((m) => m.partyIndex === member.partyIndex)?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');

    // スキル選択肢
    const skills = member.getActionSkills ? member.getActionSkills() : [];
    const replaySlot = isCommitted
      ? (this.#record?.actions?.find?.(a => a.position === member.position) ?? null)
      : null;
    const selectedSkillId = isCommitted
      ? (replaySlot?.skillId ?? replaySlot?.action?.skillId ?? null)
      : null;

    const skillOptions = [
      `<option value="">— スキル選択 —</option>`,
      ...skills.map((s) => {
        const selected = selectedSkillId === s.skillId ? 'selected' : '';
        const cost = s.spCost > 0 ? `SP${s.spCost} ` : '';
        return `<option value="${s.skillId}" ${selected}>${cost}${s.name}</option>`;
      }),
    ].join('');

    const selectDisabled = isCommitted ? 'disabled' : '';

    return `
      <div draggable="${!isCommitted}" data-turn-slot data-position="${member.position}"
           class="flex flex-col w-20 border-r border-gray-100 last:border-r-0 select-none
                  ${!isCommitted ? 'cursor-grab active:cursor-grabbing' : ''}">
        <!-- スキル select -->
        <div class="px-0.5 pt-0.5">
          <select data-skill-select data-position="${member.position}" ${selectDisabled}
                  class="w-full text-xs border border-gray-200 rounded px-0.5 py-px
                         ${isCommitted ? 'bg-gray-50 text-gray-500' : 'bg-white'}
                         focus:outline-none focus:ring-1 focus:ring-blue-300">
            ${skillOptions}
          </select>
        </div>
        <!-- アイコン + SP オーバーレイ -->
        <div class="relative aspect-square overflow-hidden bg-gray-100">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                    class="w-full h-full object-cover" />`
            : `<div class="w-full h-full flex items-center justify-center text-gray-300 text-lg">？</div>`
          }
          <div class="absolute top-0.5 right-0.5 bg-black/60 text-white rounded
                      text-xs px-0.5 leading-none font-bold min-w-[18px] text-center">
            ${spAfter}
          </div>
        </div>
      </div>`;
  }

  #buildBackSlotHtml(member) {
    const imageUrl = this.#resolveImageUrl(member);
    const sp = member.sp?.current ?? '—';

    return `
      <div data-turn-slot data-position="${member.position}"
           class="flex flex-col w-14 border-r border-gray-100 last:border-r-0">
        <!-- スキル select プレースホルダー（高さ揃え用） -->
        <div class="px-0.5 pt-0.5">
          <div class="w-full text-xs text-gray-300 border border-gray-100 rounded px-0.5 py-px
                      bg-gray-50">後衛</div>
        </div>
        <!-- アイコン + SP オーバーレイ -->
        <div class="relative aspect-square overflow-hidden bg-gray-50">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                    class="w-full h-full object-cover opacity-60" />`
            : `<div class="w-full h-full flex items-center justify-center text-gray-200 text-lg">？</div>`
          }
          <div class="absolute top-0.5 right-0.5 bg-black/40 text-white rounded
                      text-xs px-0.5 leading-none min-w-[18px] text-center">
            ${sp}
          </div>
        </div>
      </div>`;
  }

  #buildButtonHtml(isCommitted) {
    if (isCommitted) {
      return `<div class="flex-shrink-0 w-12"></div>`;
    }
    return `
      <div class="flex-shrink-0 w-12 flex flex-col items-center justify-center gap-1 px-1 py-1">
        <button data-role="commit-btn"
                class="w-full text-xs py-1 rounded bg-blue-500 text-white font-medium
                       hover:bg-blue-600 active:bg-blue-700 transition-colors">
          実行
        </button>
      </div>`;
  }

  #bindEvents() {
    // スキル select 変更（コミット済み行のみ、未コミット行は commitNextTurn 時に収集）
    if (this.#record !== null) {
      this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const position = Number(sel.dataset.position);
          const skillId = sel.value === '' ? null : Number(sel.value);
          this.#onSlotChange?.(this.#turnIndex, position, { skillId });
        });
      });
    }

    // Commit ボタン
    const commitBtn = this.#root.querySelector('[data-role="commit-btn"]');
    commitBtn?.addEventListener('click', () => {
      this.#onCommit?.(this.#turnIndex);
    });

    // メモ欄
    const noteEl = this.#root.querySelector('[data-role="note"]');
    noteEl?.addEventListener('input', () => {
      this.#onNoteChange?.(this.#turnIndex, noteEl.value);
    });

    // D&D（未コミット行のみ）
    if (this.#record === null) {
      this.#bindDragAndDrop();
    }
  }

  #bindDragAndDrop() {
    const slots = this.#root.querySelectorAll('[data-turn-slot]');

    slots.forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        this.#dragSrcPosition = Number(el.dataset.position);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('opacity-40');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('opacity-40');
        this.#dragSrcPosition = null;
        slots.forEach((s) => s.classList.remove('ring-2', 'ring-blue-400'));
      });

      el.addEventListener('dragover', (e) => {
        if (this.#dragSrcPosition === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slots.forEach((s) => s.classList.remove('ring-2', 'ring-blue-400'));
        el.classList.add('ring-2', 'ring-blue-400');
      });

      el.addEventListener('dragleave', (e) => {
        if (el.contains(e.relatedTarget)) return;
        el.classList.remove('ring-2', 'ring-blue-400');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const dst = Number(el.dataset.position);
        const src = this.#dragSrcPosition;
        if (src !== null && src !== dst) {
          this.#onSlotChange?.(this.#turnIndex, src, { swapWith: dst });
        }
        slots.forEach((s) => s.classList.remove('ring-2', 'ring-blue-400'));
        this.#dragSrcPosition = null;
      });
    });
  }
}

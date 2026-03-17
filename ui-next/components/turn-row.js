import { resolveStyleImageUrl } from '../../src/ui/style-asset-url.js';
import { formatSkillCostLabel } from '../utils/skill-label.js';
import { getExcludedSkillIds } from '../utils/skill-filter.js';
import { resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';

const ATTACK_TYPE_MAP = {
  Slash:  { label: '斬', cls: 'bg-red-100 text-red-700' },
  Stab:   { label: '刺', cls: 'bg-blue-100 text-blue-700' },
  Strike: { label: '打', cls: 'bg-stone-100 text-stone-700' },
};

const ELEMENT_MAP = {
  Fire:    { label: '火', cls: 'bg-orange-100 text-orange-700' },
  Ice:     { label: '氷', cls: 'bg-cyan-100 text-cyan-700' },
  Thunder: { label: '雷', cls: 'bg-yellow-100 text-yellow-700' },
  Dark:    { label: '闇', cls: 'bg-purple-100 text-purple-700' },
  Light:   { label: '光', cls: 'bg-amber-100 text-amber-700' },
};

/**
 * OD ゲージ値を "000.00%" 形式にフォーマットする。
 * 負の値は "-000.00%" 形式（符号の後ろをゼロ埋め）。
 * エンジン仕様の範囲は [-999.99, 300]。
 */
function formatOdGauge(value) {
  const num = Number(value ?? 0);
  if (num < 0) {
    return '-' + Math.abs(num).toFixed(2).padStart(6, '0') + '%';
  }
  return num.toFixed(2).padStart(6, '0') + '%';
}

/**
 * 1ターン分の横長コンテナ UI
 *
 * - 未コミット行: record=null、stateBefore のみ（スキル選択 + Commit ボタン表示）
 * - コミット済み行: record あり、stateBefore の SP をそのまま表示
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
  #onPreviewRequest;
  #onOdChange;
  // OD 選択状態（未コミット行のみ使用）
  #odState = null;  // { preemptiveOdLevel, interruptOdLevel, activatablePreemptive, activatableInterrupt }

  // D&D 用
  #dragSrcPosition = null;
  // update() 時にスキル選択を保持するための一時フィールド
  #savedSlotActions = null;

  constructor({ root, store, turnIndex, record, stateBefore, stateAfter, onSlotChange, onCommit, onNoteChange, onPreviewRequest, onOdChange, odState = null }) {
    this.#root = root;
    this.#store = store;
    this.#turnIndex = turnIndex;
    this.#record = record;
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    this.#onSlotChange = onSlotChange;
    this.#onCommit = onCommit;
    this.#onNoteChange = onNoteChange;
    this.#onPreviewRequest = onPreviewRequest;
    this.#onOdChange = onOdChange;
    this.#odState = odState;
  }

  mount() {
    this.#root.innerHTML = this.#buildHtml();
    this.#bindEvents();
  }

  /**
   * フィルタ変更時にフロントスロットの skill select の innerHTML のみを差し替える。
   * 全再描画を避けるための軽量更新メソッド。
   */
  refreshSkillSelects() {
    const members = this.#getMembersInPositionOrder();
    const isCommitted = this.#record !== null;
    const stateForCost = this.#stateBefore ?? null;

    for (const member of members.filter((m) => m.position <= 2)) {
      const sel = this.#root.querySelector(
        `[data-skill-select][data-position="${member.position}"]`,
      );
      if (!sel) continue;

      const skills = member.getActionSkills ? member.getActionSkills() : [];
      const excludedIds = getExcludedSkillIds(member.styleId);
      const visibleSkills =
        excludedIds.size > 0 ? skills.filter((s) => !excludedIds.has(s.skillId)) : skills;

      const replaySlot = isCommitted
        ? (this.#record?.actions?.find?.((a) => a.positionIndex === member.position) ?? null)
        : null;
      const currentValue = sel.value === '' ? null : Number(sel.value);
      const selectedSkillId = isCommitted ? (replaySlot?.skillId ?? null) : currentValue;
      const hasSelection =
        selectedSkillId != null && visibleSkills.some((s) => s.skillId === selectedSkillId);

      sel.innerHTML = [
        `<option value=""${hasSelection ? '' : ' selected'}>— スキル選択 —</option>`,
        ...visibleSkills.map((s) => {
          const selected = s.skillId === selectedSkillId ? 'selected' : '';
          const costLabel = formatSkillCostLabel(s, member, stateForCost);
          return `<option value="${s.skillId}" ${selected}>${costLabel} ${s.name}</option>`;
        }),
      ].join('');

      const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${member.position}"]`);
      if (badgeEl) {
        const newSelectedId = hasSelection ? selectedSkillId : null;
        const badgeSkill = newSelectedId != null ? skills.find((s) => s.skillId === newSelectedId) ?? null : null;
        badgeEl.innerHTML = this.#buildSkillBadgesHtml(badgeSkill, member, stateForCost);
      }
    }
  }

  update({ record, stateBefore, stateAfter, odState = undefined }) {
    // 未コミット行→未コミット行の再描画（D&D など）ではスキル選択を保持する。
    // DOM の data-party-index 属性から直接 partyIndex を読むことで、
    // swapCurrentPositions() による state の事前書き換えの影響を受けない。
    if (this.#record === null && record === null) {
      const byPartyIndex = {};
      this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
        const partyIndex = Number(sel.dataset.partyIndex);
        const skillId = sel.value === '' ? null : Number(sel.value);
        if (skillId != null && Number.isFinite(partyIndex)) {
          byPartyIndex[partyIndex] = { skillId };
        }
      });
      this.#savedSlotActions = byPartyIndex;
    }
    this.#record = record;
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    if (odState !== undefined) this.#odState = odState;
    this.#root.innerHTML = this.#buildHtml();
    this.#savedSlotActions = null;
    this.#bindEvents();
  }

  /**
   * 割込OD 発動可能候補を部分更新する（全再描画なし）。
   * スキル変更のたびに previewCurrentTurn が返す候補を反映する。
   * @param {number[]} candidates 発動可能レベルの配列（例: [1, 2]）
   */
  updateInterruptOdCandidates(candidates) {
    const sel = this.#root.querySelector('[data-od-type="interrupt"]');
    if (!sel) return;
    [...sel.options].forEach((opt) => {
      const lv = Number(opt.value);
      if (lv >= 1 && lv <= 3) {
        opt.disabled = !candidates.includes(lv);
      }
    });
    // 選択中レベルが候補から外れた場合はリセット
    const currentLv = Number(sel.value);
    if (currentLv >= 1 && !candidates.includes(currentLv)) {
      sel.value = '';
      this.#onOdChange?.(this.#turnIndex, 'interrupt', null);
    }
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

  /**
   * 未コミット行の OD After 表示をリアルタイム更新する。
   * TurnAreaController から previewCurrentTurn の結果を受けて呼ばれる。
   * @param {number|null} odGaugeAfter null の場合は "→ —" に戻す
   */
  updateOdPreview(odGaugeAfter) {
    const el = this.#root.querySelector('[data-od-after]');
    if (!el) return;
    el.textContent = odGaugeAfter != null
      ? `→${formatOdGauge(odGaugeAfter)}`
      : '→ —';
  }

  // ---- private ----

  #buildSkillBadgesHtml(skill, member, state) {
    if (!skill) return '';
    let effective = skill;
    if (state && member) {
      try { effective = resolveEffectiveSkillForAction(state, member, skill) ?? skill; } catch { /* noop */ }
    }
    const parts = effective.parts ?? [];
    const types = [...new Set(parts.map((p) => p.type).filter((t) => t && t in ATTACK_TYPE_MAP))];
    const elems = [...new Set(
      parts.flatMap((p) => (Array.isArray(p.elements) ? p.elements : [])).filter((e) => e in ELEMENT_MAP)
    )];
    if (types.length === 0 && elems.length === 0) return '';
    return [
      ...types.map((t) => `<span class="text-[9px] px-0.5 rounded leading-none ${ATTACK_TYPE_MAP[t].cls}">${ATTACK_TYPE_MAP[t].label}</span>`),
      ...elems.map((e) => `<span class="text-[9px] px-0.5 rounded leading-none ${ELEMENT_MAP[e].cls}">${ELEMENT_MAP[e].label}</span>`),
    ].join('');
  }

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
      .map((m) => this.#buildBackSlotHtml(m, isCommitted))
      .join('');

    // ボタン列
    const buttonHtml = this.#buildButtonHtml(isCommitted);

    // メモ欄
    const noteValue = isCommitted
      ? (this.#record?.note ?? '')
      : (this.#root.querySelector('[data-role="note"]')?.value ?? '');
    const noteHtml = `
      <div data-turn-note class="flex-shrink-0 w-24">
        <textarea data-role="note" rows="3"
                  class="w-full h-full text-xs border border-gray-200 rounded px-1 py-0.5
                         resize-none focus:outline-none focus:ring-1 focus:ring-blue-300
                         ${isCommitted ? 'bg-gray-50' : 'bg-white'}"
                  placeholder="メモ">${noteValue}</textarea>
      </div>`;

    return `
      <div data-turn-row class="flex items-stretch gap-px border-b border-gray-200 bg-white
                  hover:bg-gray-50 transition-colors ${isCommitted ? '' : 'bg-blue-50/30'}">
        ${turnInfoHtml}
        <div data-turn-slots class="flex gap-px flex-1 min-w-0">
          <div data-turn-front-group class="flex gap-px min-w-0">
            ${frontSlots}
          </div>
          <div class="w-px bg-gray-200 self-stretch mx-0.5 flex-shrink-0"></div>
          <div data-turn-back-group class="flex gap-px min-w-0">
            ${backSlots}
          </div>
        </div>
        ${buttonHtml}
        ${noteHtml}
      </div>`;
  }

  #buildTurnInfoHtml(isCommitted) {
    if (!isCommitted) {
      // 未コミット行: stateBefore の turnState から OD / EX 状態を先読みする
      const turnState = this.#stateBefore?.turnState;
      const nextTurnNo = turnState?.turnIndex ?? 1;
      const turnType   = String(turnState?.turnType ?? '');
      const isOdTurn     = turnType === 'od';
      const isExtraTurn  = turnType === 'extra';
      const odSuspended  = Boolean(turnState?.odSuspended);
      // OD文脈 = ODターン or OD一時停止中（EX中のOD）
      const inOd = isOdTurn || odSuspended;
      const inEx = isExtraTurn;
      // ODレベルラベル: turnLabel から "OD1" 等を抽出
      const odTurnLabel  = String(turnState?.turnLabel ?? '');
      const odMatch      = odTurnLabel.match(/^(OD\d+)/);
      const odLevelLabel = inOd ? (odMatch ? odMatch[1] : 'OD') : '';
      const odGaugeBefore = formatOdGauge(turnState?.odGauge);
      return `
        <div data-turn-info class="flex-shrink-0 w-[108px] flex flex-col items-start justify-center
                    gap-0.5 px-2 py-1 bg-gray-50 border-r border-gray-200">
          <div class="flex items-center gap-1 text-xs font-bold text-gray-900 flex-wrap leading-none">
            <span>T${nextTurnNo}</span>
            ${odLevelLabel ? `<span class="text-purple-700">${odLevelLabel}</span>` : ''}
            ${inEx ? `<span class="text-amber-700">EX</span>` : ''}
          </div>
          <div data-turn-od-gauge class="font-mono text-[10px] text-gray-700 leading-none whitespace-nowrap">
            ${odGaugeBefore}<span data-od-after class="text-gray-400">→ —</span>
          </div>
        </div>`;
    }

    const rec = this.#record;
    const turnNo = rec.turnIndex ?? '?';
    const seqId  = rec.turnId ?? '?';
    const odGaugeBefore = formatOdGauge(rec.odGaugeAtStart);
    const odGaugeAfter  = formatOdGauge(rec.projections?.odGaugeAtEnd ?? rec.odGaugeAtStart);
    const isExtraTurn   = rec.isExtraTurn;
    const odMatch       = String(rec.odTurnLabelAtStart ?? '').match(/^(OD\d+)/);
    const odLevelLabel  = odMatch ? odMatch[1] : '';
    // OD文脈 = ODレベルラベルあり（コミット済みではodSuspendedをodTurnLabelAtStartで兼用）
    const inOd = !!odLevelLabel;
    const inEx = isExtraTurn;

    return `
      <div data-turn-info class="flex-shrink-0 w-[108px] flex flex-col items-start justify-center
                  gap-0.5 px-2 py-1 bg-gray-50 border-r border-gray-200">
        <div class="flex items-center gap-1 text-xs font-bold text-gray-900 flex-wrap leading-none">
          <span class="text-gray-400 font-normal">#${seqId}</span>
          <span>T${turnNo}</span>
          ${inOd ? `<span class="text-purple-700">${odLevelLabel}</span>` : ''}
          ${inEx ? `<span class="text-amber-700">EX</span>` : ''}
        </div>
        <div data-turn-od-gauge class="font-mono text-[10px] text-gray-700 leading-none whitespace-nowrap">
          ${odGaugeBefore}→${odGaugeAfter}
        </div>
      </div>`;
  }

  /** member.styleId から raw style 経由で画像 URL を取得する */
  #resolveImageUrl(member) {
    const rawStyle = this.#store?.getStyleById?.(member.styleId);
    return rawStyle ? resolveStyleImageUrl(rawStyle) : '';
  }

  /** EX ターン中かどうかを判定する（未コミット行専用）。*/
  #isExtraTurn() {
    return this.#stateBefore?.turnState?.turnType === 'extra';
  }

  /**
   * EX ターンでこのメンバーが行動可能かを判定する。
   * エンジンの isMemberActionableInCurrentTurn と同じロジック。
   * 未コミット行でのみ使用（コミット済み行は record に結果が確定している）。
   */
  #isActionable(member) {
    const turnState = this.#stateBefore?.turnState;
    if (turnState?.turnType !== 'extra') return true;
    const allowed = turnState.extraTurnState?.allowedCharacterIds ?? [];
    return allowed.includes(member.characterId);
  }

  /**
   * D&D によるポジション入れ替えが許可されているかを判定する。
   * ドメイン層の canSwapWith() と同じロジック。
   * EX ターン中: 両方のメンバーが allowedCharacterIds に含まれる場合のみ許可。
   */
  #isSwapAllowed(srcPosition, dstPosition) {
    if (!this.#isExtraTurn()) return true;
    const party = this.#stateBefore?.party;
    const src = party?.find((m) => m.position === srcPosition);
    const dst = party?.find((m) => m.position === dstPosition);
    const allowed = new Set(this.#stateBefore?.turnState?.extraTurnState?.allowedCharacterIds ?? []);
    return allowed.has(src?.characterId) && allowed.has(dst?.characterId);
  }

  #buildFrontSlotHtml(member, isCommitted) {
    const imageUrl = this.#resolveImageUrl(member);

    // スキル選択肢（replaySlot は inactive 判定でも必要なため先に算出）
    const skills = member.getActionSkills ? member.getActionSkills() : [];
    const replaySlot = isCommitted
      ? (this.#record?.actions?.find?.(a => a.positionIndex === member.position) ?? null)
      : null;

    // EX ターンで行動しなかったメンバーは inactive スロット表示にする。
    //   - 未コミット行: allowedCharacterIds に含まれない → EX待機
    //   - コミット済み行: EX ターンで action が null → EX待機（コミット後も同様に表示）
    if (!isCommitted && !this.#isActionable(member)) {
      return this.#buildInactiveSlotHtml(member, imageUrl, isCommitted);
    }
    if (isCommitted && this.#record?.isExtraTurn && replaySlot === null) {
      return this.#buildInactiveSlotHtml(member, imageUrl, isCommitted);
    }

    // SP: ターン開始前の値（stateBefore 時点）を表示する。
    // コミット済み行: CharacterStyle は commitSkillPreview() による in-place mutation で
    //   常に最新ターン後の値を持つため、member.sp?.current は誤り。
    //   代わりに previewTurn が mutation 前に取得した不変コピー（record.snapBefore）から読む。
    // 未コミット行: currentState は常に最新なので member.sp?.current が正しい。
    const spDisplay = isCommitted
      ? (this.#record?.snapBefore?.find((s) => s.partyIndex === member.partyIndex)?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');
    const spColor = typeof spDisplay === 'number' && spDisplay < 0 ? '#ef4444' : '#ffffff';
    // コミット済み: record から復元 / 未コミット: D&D 後の保存値（partyIndex キー）→ なければ先頭スキル
    // TODO: skills[0] が通常攻撃/指揮行動であることは JSON 挿入順への暗黙依存。
    //       CharacterStyle.getDefaultActionSkillId() が追加されたらそちらに移行する。
    const selectedSkillId = isCommitted
      ? (replaySlot?.skillId ?? null)
      : (this.#savedSlotActions?.[member.partyIndex]?.skillId ?? skills[0]?.skillId ?? null);

    // this.#stateBefore が null の場合は formatSkillCostLabel が raw spCost をフォールバック表示する。
    const stateForCost = this.#stateBefore ?? null;

    // フィルタ適用: 除外スキルを option から除く
    const excludedSkillIds = getExcludedSkillIds(member.styleId);
    const visibleSkills = excludedSkillIds.size > 0
      ? skills.filter((s) => !excludedSkillIds.has(s.skillId))
      : skills;

    // 選択中スキルがフィルタで非表示になった場合は "— スキル選択 —" に fallback
    const hasSelection = selectedSkillId != null && visibleSkills.some((s) => s.skillId === selectedSkillId);
    // バッジ表示用: フィルタで非表示でも全件から引く（コミット済み行で正しく表示するため）
    const selectedSkill = hasSelection
      ? (skills.find((s) => s.skillId === selectedSkillId) ?? null)
      : null;
    const skillOptions = [
      `<option value=""${hasSelection ? '' : ' selected'}>— スキル選択 —</option>`,
      ...visibleSkills.map((s) => {
        const selected = selectedSkillId === s.skillId ? 'selected' : '';
        const costLabel = formatSkillCostLabel(s, member, stateForCost);
        return `<option value="${s.skillId}" ${selected}>${costLabel} ${s.name}</option>`;
      }),
    ].join('');

    const selectDisabled = isCommitted ? 'disabled' : '';

    // EX ターン: 非行動可能メンバーは #buildInactiveSlotHtml で早期 return 済みのため、
    // ここに到達するメンバーは全員 allowedCharacterIds に含まれる。draggable に EX 制限不要。
    const draggable = !isCommitted;
    return `
      <div draggable="${draggable}" data-turn-slot data-position="${member.position}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none
                  ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}">
        <!-- スキル select -->
        <div class="px-0.5 pt-0.5">
          <select data-skill-select data-position="${member.position}" data-party-index="${member.partyIndex}" ${selectDisabled}
                  class="w-full text-xs border border-gray-200 rounded px-0.5 py-px
                         ${isCommitted ? 'bg-gray-50 text-gray-500' : 'bg-white'}
                         focus:outline-none focus:ring-1 focus:ring-blue-300">
            ${skillOptions}
          </select>
        </div>
        <!-- 属性バッジ（スキル select 直下） -->
        <div data-skill-badges data-position="${member.position}"
             class="px-0.5 flex flex-wrap gap-px min-h-[12px]">
          ${this.#buildSkillBadgesHtml(selectedSkill, member, stateForCost)}
        </div>
        <!-- アイコン（固定サイズ）＋ 情報スペース -->
        <div class="flex items-start gap-1 p-0.5">
          <div data-turn-slot-icon class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-100">
            ${imageUrl
              ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                      class="w-full h-full object-cover" />`
              : `<div class="w-full h-full flex items-center justify-center text-gray-300">？</div>`
            }
            <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px]"
                 style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.9);">
              ${spDisplay}
            </div>
          </div>
          <!-- 将来のバフ/デバフ・状態異常アイコンスペース -->
          <div data-slot-info-space class="flex-1 min-w-0"></div>
        </div>
      </div>`;
  }

  /** EX ターンで行動しなかった前衛メンバー用スロット（スキル select なし）。
   *  未コミット行: amber 色で「EX待機」表示。
   *  コミット済み行: gray 色で「EX待機」表示（後衛スロットと同トーン）。
   */
  #buildInactiveSlotHtml(member, imageUrl, isCommitted) {
    const sp = isCommitted
      ? (this.#record?.snapBefore?.find((s) => s.partyIndex === member.partyIndex)?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');
    const spColor = typeof sp === 'number' && sp < 0 ? '#ef4444' : '#ffffff';
    const labelClass = isCommitted
      ? 'text-gray-300 border-gray-100 bg-gray-50'
      : 'text-amber-400 border-amber-100 bg-amber-50';
    return `
      <div data-turn-slot data-position="${member.position}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none">
        <div class="px-0.5 pt-0.5">
          <div class="w-full text-xs rounded px-0.5 py-px border ${labelClass}">EX待機</div>
        </div>
        <div class="flex items-start gap-1 p-0.5">
          <div data-turn-slot-icon class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-50">
            ${imageUrl
              ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                      class="w-full h-full object-cover opacity-40" />`
              : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
            }
            <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px] opacity-60"
                 style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.7);">
              ${sp}
            </div>
          </div>
          <div data-slot-info-space class="flex-1 min-w-0"></div>
        </div>
      </div>`;
  }

  #buildBackSlotHtml(member, isCommitted) {
    const imageUrl = this.#resolveImageUrl(member);
    // コミット済み行: #buildFrontSlotHtml と同様に snapBefore から読む
    const sp = isCommitted
      ? (this.#record?.snapBefore?.find((s) => s.partyIndex === member.partyIndex)?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');
    const spColor = typeof sp === 'number' && sp < 0 ? '#ef4444' : '#ffffff';

    // EX ターン: allowedCharacterIds に含まれない後衛メンバーはドラッグ不可
    const draggable = !isCommitted && (!this.#isExtraTurn() || this.#isActionable(member));
    return `
      <div draggable="${draggable}" data-turn-slot data-position="${member.position}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none
                  ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}">
        <!-- スキル select プレースホルダー（高さ揃え用） -->
        <div class="px-0.5 pt-0.5">
          <div class="w-full text-xs text-gray-300 border border-gray-100 rounded px-0.5 py-px
                      bg-gray-50">後衛</div>
        </div>
        <!-- アイコン（固定サイズ）＋ 情報スペース -->
        <div class="flex items-start gap-1 p-0.5">
          <div data-turn-slot-icon class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-50">
            ${imageUrl
              ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                      class="w-full h-full object-cover opacity-60" />`
              : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
            }
            <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px] opacity-80"
                 style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.7);">
              ${sp}
            </div>
          </div>
          <!-- 将来のバフ/デバフ・状態異常アイコンスペース -->
          <div data-slot-info-space class="flex-1 min-w-0"></div>
        </div>
      </div>`;
  }

  #buildButtonHtml(isCommitted) {
    if (isCommitted) {
      return `<div data-turn-buttons class="flex-shrink-0 w-[72px]"></div>`;
    }

    const od = this.#odState;
    const preemptiveLevel = od?.preemptiveOdLevel ?? null;
    const interruptLevel  = od?.interruptOdLevel  ?? null;
    const canPreemptive   = od?.activatablePreemptive ?? [];
    const canInterrupt    = od?.activatableInterrupt  ?? [];

    // 先制OD select オプション
    const preemptiveOptions = [
      `<option value="">先制—</option>`,
      ...[1, 2, 3].map((lv) => {
        const disabled  = !canPreemptive.includes(lv) ? 'disabled' : '';
        const selected  = preemptiveLevel === lv ? 'selected' : '';
        return `<option value="${lv}" ${disabled} ${selected}>OD${lv}</option>`;
      }),
    ].join('');

    // 割込OD select オプション
    const interruptOptions = [
      `<option value="">割込—</option>`,
      ...[1, 2, 3].map((lv) => {
        const disabled  = !canInterrupt.includes(lv) ? 'disabled' : '';
        const selected  = interruptLevel === lv ? 'selected' : '';
        return `<option value="${lv}" ${disabled} ${selected}>OD${lv}</option>`;
      }),
    ].join('');

    const preemptiveActive = preemptiveLevel != null;
    const interruptActive  = interruptLevel  != null;

    return `
      <div data-turn-buttons class="flex-shrink-0 w-[72px] flex flex-col items-stretch justify-center gap-0.5 px-1 py-1">
        <button data-role="commit-btn"
                class="w-full text-xs py-1 rounded bg-blue-500 text-white font-medium
                       hover:bg-blue-600 active:bg-blue-700 transition-colors">
          実行
        </button>
        <select data-od-type="preemptive" title="先制OD"
                class="w-full text-[11px] border rounded px-0.5 py-px focus:outline-none focus:ring-1
                       ${preemptiveActive
                         ? 'border-purple-400 bg-purple-100 text-purple-700 font-semibold focus:ring-purple-300'
                         : 'border-gray-200 bg-white text-gray-400 focus:ring-gray-300'}">
          ${preemptiveOptions}
        </select>
        <select data-od-type="interrupt" title="割込OD"
                class="w-full text-[11px] border rounded px-0.5 py-px focus:outline-none focus:ring-1
                       ${interruptActive
                         ? 'border-orange-400 bg-orange-100 text-orange-700 font-semibold focus:ring-orange-300'
                         : 'border-gray-200 bg-white text-gray-400 focus:ring-gray-300'}">
          ${interruptOptions}
        </select>
      </div>`;
  }

  #bindEvents() {
    // スキル select 変更（コミット済み行）
    if (this.#record !== null) {
      this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const position = Number(sel.dataset.position);
          const skillId = sel.value === '' ? null : Number(sel.value);
          this.#onSlotChange?.(this.#turnIndex, position, { skillId });
        });
      });
    }

    // スキル select 変更（未コミット行: OD After プレビューをリクエスト）
    if (this.#record === null) {
      this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const slotActions = this.getCurrentSlotActions();
          this.#onPreviewRequest?.(this.#turnIndex, slotActions);
          // バッジ更新
          const newSkillId = sel.value === '' ? null : Number(sel.value);
          this.#updateSkillBadges(Number(sel.dataset.position), newSkillId);
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

    // OD select（未コミット行のみ）
    if (this.#record === null) {
      this.#root.querySelectorAll('[data-od-type]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const odType = sel.dataset.odType;  // 'preemptive' | 'interrupt'
          const level = sel.value === '' ? null : Number(sel.value);
          this.#onOdChange?.(this.#turnIndex, odType, level);
        });
      });
    }

    // D&D（未コミット行のみ）
    if (this.#record === null) {
      this.#bindDragAndDrop();
    }
  }

  #updateSkillBadges(position, skillId) {
    const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${position}"]`);
    if (!badgeEl) return;
    const member = this.#stateBefore?.party?.find((m) => m.position === position);
    const skill = skillId != null ? (member?.getSkill?.(skillId) ?? null) : null;
    badgeEl.innerHTML = this.#buildSkillBadgesHtml(skill, member, this.#stateBefore);
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
        const dst = Number(el.dataset.position);
        // EX ターン: 両者が allowedCharacterIds に含まれない組み合わせはドロップ不可
        if (!this.#isSwapAllowed(this.#dragSrcPosition, dst)) return;
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
        if (src !== null && src !== dst && this.#isSwapAllowed(src, dst)) {
          this.#onSlotChange?.(this.#turnIndex, src, { swapWith: dst });
        }
        slots.forEach((s) => s.classList.remove('ring-2', 'ring-blue-400'));
        this.#dragSrcPosition = null;
      });
    });
  }
}

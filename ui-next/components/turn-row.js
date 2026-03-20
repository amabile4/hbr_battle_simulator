import { resolveStyleImageUrl, resolveUiAssetUrl } from '../../src/ui/style-asset-url.js';
import { isNormalAttackSkill, isAdmiralCommandSkill } from '../../src/domain/skill-classifiers.js';
import { clampEnemyCount, DEFAULT_ENEMY_COUNT } from '../../src/config/battle-defaults.js';
import { formatSkillCostLabel } from '../utils/skill-label.js';
import { getExcludedSkillIds } from '../utils/skill-filter.js';
import { resolveEffectiveSkillForAction } from '../../src/turn/turn-controller.js';
import {
  coerceTurnReplayTarget,
  formatTurnTargetLabel,
  normalizeTurnReplayTarget,
  resolveTurnManualTargetConfig,
} from '../utils/turn-targeting.js';

// select 幅の閾値（px）：スキルバッジ・SPコスト表示の切り替えに使用
const BADGE_MIN_SELECT_WIDTH = 90;
const COST_MIN_SELECT_WIDTH  = 60;

const ATTACK_TYPE_MAP = {
  Slash:  { img: resolveUiAssetUrl('Slash.webp'),  alt: '斬' },
  Stab:   { img: resolveUiAssetUrl('Stab.webp'),   alt: '突' },
  Strike: { img: resolveUiAssetUrl('Strike.webp'), alt: '打' },
};

const ELEMENT_MAP = {
  Fire:    { img: resolveUiAssetUrl('Fire.webp'),    alt: '火' },
  Ice:     { img: resolveUiAssetUrl('Ice.webp'),     alt: '氷' },
  Thunder: { img: resolveUiAssetUrl('Thunder.webp'), alt: '雷' },
  Dark:    { img: resolveUiAssetUrl('Dark.webp'),    alt: '闇' },
  Light:   { img: resolveUiAssetUrl('Light.webp'),   alt: '光' },
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
  #onKishinkaActivate;
  // OD 選択状態（未コミット行のみ使用）
  #odState = null;  // { preemptiveOdLevel, interruptOdLevel, activatablePreemptive, activatableInterrupt, kishinkaStatus }

  // D&D 用
  #dragSrcPosition = null;
  // タップ swap 用（iOS 代替操作・クリック swap 兼用）
  #selectedSlotPosition = null;
  // update() 時にスキル選択を保持するための一時フィールド
  #savedSlotActions = null;
  #savedEnemyCount = null;
  #savedTargetActions = null;
  #openTargetPickerPartyIndex = null;
  // Enemy Setup パラメータ
  #enemyParams = null;

  constructor({ root, store, turnIndex, record, stateBefore, stateAfter, onSlotChange, onCommit, onNoteChange, onPreviewRequest, onOdChange, onKishinkaActivate, odState = null, enemyParams = null }) {
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
    this.#onKishinkaActivate = onKishinkaActivate;
    this.#odState = odState;
    this.#enemyParams = enemyParams;
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
        excludedIds.size > 0
          ? skills.filter((s) => isNormalAttackSkill(s) || isAdmiralCommandSkill(s) || !excludedIds.has(s.skillId))
          : skills;

      const replaySlot = isCommitted
        ? (this.#record?.actions?.find?.((a) => a.positionIndex === member.position) ?? null)
        : null;
      const currentValue = sel.value === '' ? null : Number(sel.value);
      const selectedSkillId = isCommitted ? (replaySlot?.skillId ?? null) : currentValue;
      const hasSelection =
        selectedSkillId != null && visibleSkills.some((s) => s.skillId === selectedSkillId);

      const effectiveSelectedId = hasSelection ? selectedSkillId : (visibleSkills[0]?.skillId ?? null);
      sel.innerHTML = visibleSkills.map((s) => {
        const isSelected = s.skillId === effectiveSelectedId;
        const costLabel = formatSkillCostLabel(s, member, stateForCost);
        return `<option value="${s.skillId}" data-cost-label="${costLabel}" data-skill-name="${s.name}"${isSelected ? ' selected' : ''}>${costLabel}${s.name}</option>`;
      }).join('');
      this.#applyWidthBasedVisibility(sel);

      const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${member.position}"]`);
      if (badgeEl) {
        const badgeSkill = effectiveSelectedId != null ? skills.find((s) => s.skillId === effectiveSelectedId) ?? null : null;
        badgeEl.innerHTML = this.#buildSkillBadgesHtml(badgeSkill, member, stateForCost);
      }
    }
  }

  update({
    record,
    stateBefore,
    stateAfter,
    odState = undefined,
    enemyParams = undefined,
    openTargetPickerPartyIndex = null,
  }) {
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

      const countEl = this.#root.querySelector('[data-role="enemy-count"]');
      if (countEl) {
        this.#savedEnemyCount = Number(countEl.value);
      }
    }
    // コミット済みになったら選択状態をリセット
    if (record !== null) this.#selectedSlotPosition = null;
    this.#openTargetPickerPartyIndex = openTargetPickerPartyIndex;
    this.#record = record;
    this.#stateBefore = stateBefore;
    this.#stateAfter = stateAfter;
    if (odState !== undefined) this.#odState = odState;
    if (enemyParams !== undefined) this.#enemyParams = enemyParams;
    this.#root.innerHTML = this.#buildHtml();
    this.#savedSlotActions = null;
    this.#bindEvents();
    // 再描画後に選択ビジュアルを復元
    if (this.#selectedSlotPosition !== null) this.#updateSelectionVisual();
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

  getCurrentEnemyCount() {
    const el = this.#root.querySelector('[data-role="enemy-count"]');
    if (el) return Number(el.value);
    if (this.#savedEnemyCount != null) {
      return clampEnemyCount(this.#savedEnemyCount);
    }

    // 初期値は前のターンの敵の数を継承する
    const stateEnemyCount = this.#stateBefore?.turnState?.enemyState?.enemyCount;
    if (Number.isFinite(stateEnemyCount)) {
      return clampEnemyCount(stateEnemyCount);
    }

    return DEFAULT_ENEMY_COUNT;
  }

  /** コミットボタン押下時に呼ばれる前に TurnAreaController が現在のスロット選択を収集するため */
  getCurrentSlotActions() {
    const actions = {};
    const enemyCount = this.getCurrentEnemyCount();
    this.#root.querySelectorAll('[data-skill-select]').forEach((sel) => {
      const position = Number(sel.dataset.position);
      const partyIndex = Number(sel.dataset.partyIndex);
      const skillId = sel.value === '' ? null : Number(sel.value);
      if (skillId != null) {
        const member = this.#stateBefore?.party?.find((item) => item.position === position) ?? null;
        const skill = member?.getSkill?.(skillId) ?? null;
        const effectiveSkill = this.#resolveEffectiveSkill(member, skill, this.#stateBefore);
        const manualTargetConfig = resolveTurnManualTargetConfig({
          member,
          skill,
          effectiveSkill,
          state: this.#stateBefore,
          enemyCount,
          isDetailedMode: Boolean(this.#enemyParams?.isDetailedMode),
        });
        const target = this.#getCurrentReplayTarget({
          partyIndex,
          manualTargetConfig,
          recordAction: null,
        });

        actions[position] = {
          skillId,
          target,
        };
      }
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

  /**
   * トークン表示 HTML を生成する。
   * 5×2 グリッドに白丸を並べ、active 個数 = current 値。
   * current が 0 かつ max が 0 以下なら空文字を返す（非表示）。
   * @param {number} current
   * @param {number} max
   */
  #buildTokenHtml(current, max) {
    const cur = Number(current);
    const mx  = Number(max);
    if (!Number.isFinite(cur) || cur <= 0 || !Number.isFinite(mx) || mx <= 0) return '';
    const effective = Math.min(cur, mx);
    const total = Math.max(mx, 10);
    const dots = Array.from({ length: total }, (_, i) => {
      if (i < effective) return '<span class="token-dot active"></span>';
      if (i === effective) return '<span class="token-dot afterglow"></span>';
      return '<span class="token-dot"></span>';
    });
    return `<div class="token-grid">${dots.join('')}</div>`;
  }

  /**
   * 士気（Morale）表示 HTML を生成する。
   * 大丸（5px）= 2 士気、小丸（3px）= 1 士気として組み合わせ表示。
   * current が 0 なら空文字を返す（非表示）。
   * @param {number} current
   */
  #buildMoraleHtml(current) {
    const cur = Number(current);
    if (!Number.isFinite(cur) || cur <= 0) return '';
    // 白丸1個=5士気、赤丸1個=1士気
    const whiteDots = Math.floor(cur / 5);
    const redDots   = cur % 5;
    const dots = [
      ...Array.from({ length: whiteDots }, () => '<span class="morale-dot-white"></span>'),
      ...Array.from({ length: redDots   }, () => '<span class="morale-dot-red"></span>'),
    ].join('');
    return `<div class="morale-display">
      <img src="${resolveUiAssetUrl('Morale.webp')}" class="morale-icon" alt="士気" />
      <div class="morale-dots">${dots}</div>
    </div>`;
  }

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
      ...types.map((t) => `<img src="${ATTACK_TYPE_MAP[t].img}" alt="${ATTACK_TYPE_MAP[t].alt}" class="w-6 h-6 object-contain" />`),
      ...elems.map((e) => `<img src="${ELEMENT_MAP[e].img}" alt="${ELEMENT_MAP[e].alt}" class="w-6 h-6 object-contain" />`),
    ].join('');
  }

  #resolveEffectiveSkill(member, skill, state = this.#stateBefore) {
    if (!skill) {
      return null;
    }
    if (state && member) {
      try {
        return resolveEffectiveSkillForAction(state, member, skill) ?? skill;
      } catch {
        return skill;
      }
    }
    return skill;
  }

  #getRecordActionReplayTarget(action = null) {
    if (!action || typeof action !== 'object') {
      return normalizeTurnReplayTarget(null);
    }

    const targetEnemyIndex = Number(action.targetEnemyIndex);
    if (Number.isFinite(targetEnemyIndex) && targetEnemyIndex >= 0) {
      return normalizeTurnReplayTarget({ type: 'enemy', enemyIndex: targetEnemyIndex });
    }

    const targetCharacterId = String(action.targetCharacterId ?? '').trim();
    if (targetCharacterId) {
      const targetMember =
        this.#stateBefore?.party?.find((member) => String(member?.characterId) === targetCharacterId) ?? null;
      if (Number.isFinite(Number(targetMember?.styleId))) {
        return normalizeTurnReplayTarget({ type: 'ally', styleId: Number(targetMember.styleId) });
      }
      return normalizeTurnReplayTarget({ type: 'ally', characterId: targetCharacterId });
    }

    return normalizeTurnReplayTarget(null);
  }

  #getCurrentReplayTarget({ partyIndex, manualTargetConfig, recordAction = null }) {
    const baseTarget =
      recordAction != null
        ? this.#getRecordActionReplayTarget(recordAction)
        : normalizeTurnReplayTarget(this.#savedTargetActions?.[partyIndex]);
    return coerceTurnReplayTarget(manualTargetConfig, baseTarget);
  }

  #buildTargetControlHtml({ member, manualTargetConfig, currentReplayTarget, isCommitted }) {
    if (!manualTargetConfig) {
      return '';
    }

    const enemyNamesByEnemy =
      this.#stateBefore?.turnState?.enemyState?.enemyNamesByEnemy &&
      typeof this.#stateBefore.turnState.enemyState.enemyNamesByEnemy === 'object'
        ? this.#stateBefore.turnState.enemyState.enemyNamesByEnemy
        : {};
    const summaryLabel = formatTurnTargetLabel(manualTargetConfig, currentReplayTarget, {
      enemyNamesByEnemy,
    });
    const kindLabel = manualTargetConfig.kind === 'enemy' ? '敵' : '味方';

    if (isCommitted) {
      return `
        <div data-role="target-trigger-label"
             class="shrink-0 text-[10px] leading-none px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
          ${kindLabel}: ${summaryLabel}
        </div>
      `;
    }

    const isOpen = this.#openTargetPickerPartyIndex === member.partyIndex;
    const popoverHtml =
      manualTargetConfig.kind === 'enemy'
        ? this.#buildEnemyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, enemyNamesByEnemy, member.partyIndex)
        : this.#buildAllyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, member.partyIndex);

    return `
      <div class="relative shrink-0">
        <button type="button"
                data-role="target-trigger"
                data-party-index="${member.partyIndex}"
                data-target-kind="${manualTargetConfig.kind}"
                class="target-trigger inline-flex items-center gap-1 text-[10px] leading-none px-2 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors">
          <span class="font-semibold">${kindLabel}</span>
          <span>${summaryLabel}</span>
        </button>
        <div data-role="target-popover"
             data-party-index="${member.partyIndex}"
             data-target-kind="${manualTargetConfig.kind}"
             class="target-popover absolute right-0 top-[calc(100%+4px)] z-20 min-w-[180px] rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
             ${isOpen ? '' : 'hidden'}>
          ${popoverHtml}
        </div>
      </div>
    `;
  }

  #buildEnemyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, enemyNamesByEnemy, actorPartyIndex) {
    const selectedTarget = coerceTurnReplayTarget(manualTargetConfig, currentReplayTarget);
    return `
      <div class="flex flex-wrap gap-1.5">
        ${manualTargetConfig.candidates.map((candidate) => {
          const isSelected = Number(selectedTarget.enemyIndex) === Number(candidate.enemyIndex);
          const enemyName = String(
            enemyNamesByEnemy[String(candidate.enemyIndex)] ?? enemyNamesByEnemy[candidate.enemyIndex] ?? ''
          ).trim();
          const label = enemyName ? `E${candidate.enemyIndex + 1} ${enemyName}` : `E${candidate.enemyIndex + 1}`;
          return `
            <button type="button"
                    data-role="target-candidate"
                    data-actor-party-index="${actorPartyIndex}"
                    data-target-kind="enemy"
                    data-enemy-index="${candidate.enemyIndex}"
                    class="target-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
                           ${isSelected
                             ? 'border-sky-500 bg-sky-500 text-white'
                             : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}">
              ${label}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  #buildAllyTargetPopoverHtml(manualTargetConfig, currentReplayTarget, actorPartyIndex) {
    const selectedTarget = coerceTurnReplayTarget(manualTargetConfig, currentReplayTarget);
    return `
      <div class="grid grid-cols-3 gap-2">
        ${manualTargetConfig.candidates.map((candidate) => {
          const rawStyle = this.#store?.getStyleById?.(candidate.styleId) ?? null;
          const imageUrl = rawStyle ? resolveStyleImageUrl(rawStyle) : '';
          const isSelected = Number(selectedTarget.styleId) === Number(candidate.styleId);
          const isDisabled = candidate.disabled === true;
          return `
            <button type="button"
                    data-role="target-candidate"
                    data-actor-party-index="${actorPartyIndex}"
                    data-target-kind="ally"
                    data-style-id="${candidate.styleId}"
                    ${isDisabled ? 'disabled' : ''}
                    class="target-ally-option flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] transition-colors
                           ${isSelected
                             ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                             : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}
                           ${isDisabled ? 'opacity-35 grayscale cursor-not-allowed' : ''}"
                    title="Pos ${candidate.position + 1} ${candidate.characterName}">
              <span class="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                ${imageUrl
                  ? `<img src="${imageUrl}" alt="${candidate.characterName}" class="h-full w-full object-cover" />`
                  : '<span class="text-gray-300">？</span>'}
              </span>
              <span class="block w-full truncate text-center">P${candidate.position + 1}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
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
      <div data-turn-note class="flex-shrink-0 w-14">
        <textarea data-role="note" rows="2"
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
      const currentEnemyCount = this.getCurrentEnemyCount();
      const enemyCountSelect = `
        <select data-role="enemy-count" title="敵の数"
                class="text-[10px] border border-gray-200 rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-blue-300 ml-auto bg-white">
          <option value="1" ${currentEnemyCount === 1 ? 'selected' : ''}>1</option>
          <option value="2" ${currentEnemyCount === 2 ? 'selected' : ''}>2</option>
          <option value="3" ${currentEnemyCount === 3 ? 'selected' : ''}>3</option>
        </select>`;

      return `
        <div data-turn-info class="flex-shrink-0 w-[108px] flex flex-col items-start justify-center
                    gap-0.5 px-2 py-1 bg-gray-50 border-r border-gray-200">
          <div class="flex flex-col sm:flex-row items-baseline gap-1 w-full text-xs font-bold text-gray-900 flex-wrap leading-none">
            <div class="flex items-center gap-1">
              <span>T${nextTurnNo}</span>
              ${odLevelLabel ? `<span class="text-purple-700">${odLevelLabel}</span>` : ''}
              ${inEx ? `<span class="text-amber-700">EX</span>` : ''}
            </div>
            ${enemyCountSelect}
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
    const snapEntry = isCommitted
      ? (this.#record?.snapBefore?.find((s) => s.partyIndex === member.partyIndex) ?? null)
      : null;
    const spDisplay = isCommitted
      ? (snapEntry?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');
    // トークン・士気（ターン開始前の値）
    const tokenCurrent  = isCommitted ? (snapEntry?.tokenState?.current  ?? 0) : (member.tokenState?.current  ?? 0);
    const tokenMax      = isCommitted ? (snapEntry?.tokenState?.max      ?? 10) : (member.tokenState?.max      ?? 10);
    const moraleCurrent = isCommitted ? (snapEntry?.moraleState?.current ?? 0) : (member.moraleState?.current ?? 0);
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
    // フィルタ適用: 通常攻撃・指揮行動は除外対象から除く
    const visibleSkills = excludedSkillIds.size > 0
      ? skills.filter((s) => isNormalAttackSkill(s) || isAdmiralCommandSkill(s) || !excludedSkillIds.has(s.skillId))
      : skills;

    // 選択中スキルがフィルタで非表示になった場合は先頭スキルにフォールバック
    const hasSelection = selectedSkillId != null && visibleSkills.some((s) => s.skillId === selectedSkillId);
    const effectiveSelectedId = hasSelection ? selectedSkillId : (visibleSkills[0]?.skillId ?? null);
    // バッジ表示用: フィルタで非表示でも全件から引く（コミット済み行で正しく表示するため）
    const selectedSkill = effectiveSelectedId != null
      ? (skills.find((s) => s.skillId === effectiveSelectedId) ?? null)
      : null;
    const skillOptions = visibleSkills.map((s) => {
      const isSelected = s.skillId === effectiveSelectedId;
      const costLabel = formatSkillCostLabel(s, member, stateForCost);
      return `<option value="${s.skillId}" data-cost-label="${costLabel}" data-skill-name="${s.name}"${isSelected ? ' selected' : ''}>${costLabel}${s.name}</option>`;
    }).join('');

    const selectDisabled = isCommitted ? 'disabled' : '';
    const currentEnemyCount = this.getCurrentEnemyCount();
    const effectiveSelectedSkill = this.#resolveEffectiveSkill(member, selectedSkill, stateForCost);
    const manualTargetConfig = resolveTurnManualTargetConfig({
      member,
      skill: selectedSkill,
      effectiveSkill: effectiveSelectedSkill,
      state: this.#stateBefore,
      enemyCount: currentEnemyCount,
      isDetailedMode: Boolean(this.#enemyParams?.isDetailedMode),
    });
    const currentReplayTarget = this.#getCurrentReplayTarget({
      partyIndex: member.partyIndex,
      manualTargetConfig,
      recordAction: replaySlot,
    });
    const targetControlHtml = this.#buildTargetControlHtml({
      member,
      manualTargetConfig,
      currentReplayTarget,
      isCommitted,
    });

    // EX ターン: 非行動可能メンバーは #buildInactiveSlotHtml で早期 return 済みのため、
    // ここに到達するメンバーは全員 allowedCharacterIds に含まれる。draggable に EX 制限不要。
    const draggable = !isCommitted;
    return `
      <div draggable="${draggable}" data-turn-slot data-position="${member.position}"
           class="flex flex-col flex-1 min-w-0 border-r border-gray-100 last:border-r-0 select-none
                  ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}">
        <!-- 属性バッジ（左）＋ スキル select（中）＋ ターゲット trigger（右）横並び -->
        <div class="flex items-center gap-0.5 px-0.5 pt-0.5">
          <div data-skill-badges data-position="${member.position}"
               class="grid grid-cols-2 gap-px flex-shrink-0 self-stretch">
            ${this.#buildSkillBadgesHtml(selectedSkill, member, stateForCost)}
          </div>
          <select data-skill-select data-position="${member.position}" data-party-index="${member.partyIndex}" ${selectDisabled}
                  class="flex-1 min-w-0 text-xs border border-gray-200 rounded px-0.5 py-px
                         ${isCommitted ? 'bg-gray-50 text-gray-500' : 'bg-white'}
                         focus:outline-none focus:ring-1 focus:ring-blue-300">
            ${skillOptions}
          </select>
          ${targetControlHtml}
        </div>
        <!-- アイコン（固定サイズ）＋ 情報スペース ＋ アイコン直下トークン/士気 -->
        <div class="flex flex-col p-0.5 gap-0.5">
          <div class="flex items-start gap-1">
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
          <!-- アイコン直下: トークン・士気 -->
          <div class="flex items-center gap-1.5 flex-wrap px-0.5">
            ${this.#buildTokenHtml(tokenCurrent, tokenMax)}
            ${this.#buildMoraleHtml(moraleCurrent)}
          </div>
        </div>
      </div>`;
  }

  /** EX ターンで行動しなかった前衛メンバー用スロット（スキル select なし）。
   *  未コミット行: amber 色で「EX待機」表示。
   *  コミット済み行: gray 色で「EX待機」表示（後衛スロットと同トーン）。
   */
  #buildInactiveSlotHtml(member, imageUrl, isCommitted) {
    const inactiveSnap = isCommitted
      ? (this.#record?.snapBefore?.find((s) => s.partyIndex === member.partyIndex) ?? null)
      : null;
    const sp = isCommitted
      ? (inactiveSnap?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');
    const tokenCurrent  = isCommitted ? (inactiveSnap?.tokenState?.current  ?? 0) : (member.tokenState?.current  ?? 0);
    const tokenMax      = isCommitted ? (inactiveSnap?.tokenState?.max      ?? 10) : (member.tokenState?.max      ?? 10);
    const moraleCurrent = isCommitted ? (inactiveSnap?.moraleState?.current ?? 0) : (member.moraleState?.current ?? 0);
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
        <div class="flex flex-col p-0.5 gap-0.5 opacity-50">
          <div class="flex items-start gap-1">
            <div data-turn-slot-icon class="relative flex-shrink-0 overflow-hidden rounded-sm bg-gray-50">
              ${imageUrl
                ? `<img src="${imageUrl}" alt="${member.styleName ?? ''}" draggable="false"
                        class="w-full h-full object-cover opacity-40" />`
                : `<div class="w-full h-full flex items-center justify-center text-gray-200">？</div>`
              }
              <div data-sp-badge class="absolute -top-0.5 -right-0.5 font-bold leading-none text-center px-1 py-0.5 min-w-[20px]"
                   style="color:${spColor};text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,0.7);">
                ${sp}
              </div>
            </div>
            <div data-slot-info-space class="flex-1 min-w-0"></div>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap px-0.5">
            ${this.#buildTokenHtml(tokenCurrent, tokenMax)}
            ${this.#buildMoraleHtml(moraleCurrent)}
          </div>
        </div>
      </div>`;
  }

  #buildBackSlotHtml(member, isCommitted) {
    const imageUrl = this.#resolveImageUrl(member);
    // コミット済み行: #buildFrontSlotHtml と同様に snapBefore から読む
    const backSnap = isCommitted
      ? (this.#record?.snapBefore?.find((s) => s.partyIndex === member.partyIndex) ?? null)
      : null;
    const sp = isCommitted
      ? (backSnap?.sp?.current ?? '—')
      : (member.sp?.current ?? '—');
    const tokenCurrent  = isCommitted ? (backSnap?.tokenState?.current  ?? 0) : (member.tokenState?.current  ?? 0);
    const tokenMax      = isCommitted ? (backSnap?.tokenState?.max      ?? 10) : (member.tokenState?.max      ?? 10);
    const moraleCurrent = isCommitted ? (backSnap?.moraleState?.current ?? 0) : (member.moraleState?.current ?? 0);
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
        <!-- アイコン（固定サイズ）＋ 情報スペース ＋ アイコン直下トークン/士気 -->
        <div class="flex flex-col p-0.5 gap-0.5 opacity-70">
          <div class="flex items-start gap-1">
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
          <!-- アイコン直下: トークン・士気（後衛） -->
          <div class="flex items-center gap-1.5 flex-wrap px-0.5">
            ${this.#buildTokenHtml(tokenCurrent, tokenMax)}
            ${this.#buildMoraleHtml(moraleCurrent)}
          </div>
        </div>
      </div>`;
  }

  #buildButtonHtml(isCommitted) {
    if (isCommitted) {
      return `<div data-turn-buttons class="flex-shrink-0 w-[80px]"></div>`;
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

    // 鬼神化セル（2×2 グリッドの右下：手塚咲がいる場合のみ）
    const ks = od?.kishinkaStatus ?? { hasTezuka: false };
    let kishinkaHtml = '';
    if (ks.hasTezuka) {
      if (ks.isActive) {
        kishinkaHtml = `<div class="flex items-center justify-center text-center text-[9px] leading-tight text-purple-700 font-semibold bg-purple-100 border border-purple-300 rounded px-0.5 py-0.5">
          鬼神化中<br>残${ks.turnsRemaining}T
        </div>`;
      } else if (ks.actionDisabledTurns > 0) {
        kishinkaHtml = `<div class="flex items-center justify-center text-center text-[9px] leading-tight text-gray-500 bg-gray-100 border border-gray-300 rounded px-0.5 py-0.5">
          行動不能<br>残${ks.actionDisabledTurns}T
        </div>`;
      } else {
        const kActive = Boolean(ks.activePending);
        kishinkaHtml = `<button data-role="kishinka-btn"
          title="${kActive ? '鬼神化予約を解除' : '鬼神化を予約（OD+15%）'}"
          class="w-full h-full text-[9px] leading-tight rounded px-0.5 py-0.5 border font-semibold
                 ${kActive
                   ? 'bg-purple-600 text-white border-purple-600'
                   : 'bg-white text-purple-700 border-purple-400 hover:bg-purple-50'}">
          ${kActive ? '鬼神化✓' : '鬼神化'}
        </button>`;
      }
    }

    // 2×2 グリッド: [実行][先制OD] / [割込OD][鬼神化]
    return `
      <div data-turn-buttons class="flex-shrink-0 w-[80px] grid grid-cols-2 gap-0.5 px-1 py-1">
        <button data-role="commit-btn"
                class="text-xs py-0.5 rounded bg-blue-500 text-white font-medium
                       hover:bg-blue-600 active:bg-blue-700 transition-colors">
          実行
        </button>
        <select data-od-type="preemptive" title="先制OD"
                class="w-full text-[10px] border rounded px-0.5 py-px focus:outline-none focus:ring-1
                       ${preemptiveActive
                         ? 'border-purple-400 bg-purple-100 text-purple-700 font-semibold focus:ring-purple-300'
                         : 'border-gray-200 bg-white text-gray-400 focus:ring-gray-300'}">
          ${preemptiveOptions}
        </select>
        <select data-od-type="interrupt" title="割込OD"
                class="w-full text-[10px] border rounded px-0.5 py-px focus:outline-none focus:ring-1
                       ${interruptActive
                         ? 'border-orange-400 bg-orange-100 text-orange-700 font-semibold focus:ring-orange-300'
                         : 'border-gray-200 bg-white text-gray-400 focus:ring-gray-300'}">
          ${interruptOptions}
        </select>
        ${kishinkaHtml}
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
          this.update({
            record: null,
            stateBefore: this.#stateBefore,
            stateAfter: null,
            odState: this.#odState,
            enemyParams: this.#enemyParams,
          });
          this.#onPreviewRequest?.(this.#turnIndex, this.getCurrentSlotActions());
        });
      });

      this.#root.querySelectorAll('[data-role="target-trigger"]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const partyIndex = Number(btn.dataset.partyIndex);
          this.#openTargetPickerPartyIndex =
            this.#openTargetPickerPartyIndex === partyIndex ? null : partyIndex;
          this.update({
            record: null,
            stateBefore: this.#stateBefore,
            stateAfter: null,
            odState: this.#odState,
            enemyParams: this.#enemyParams,
            openTargetPickerPartyIndex: this.#openTargetPickerPartyIndex,
          });
        });
      });

      this.#root.querySelectorAll('[data-role="target-candidate"]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (btn.disabled) {
            return;
          }

          const actorPartyIndex = Number(btn.dataset.actorPartyIndex);
          const targetKind = String(btn.dataset.targetKind ?? '');
          let target = normalizeTurnReplayTarget(null);
          if (targetKind === 'enemy') {
            target = normalizeTurnReplayTarget({
              type: 'enemy',
              enemyIndex: Number(btn.dataset.enemyIndex),
            });
          } else if (targetKind === 'ally') {
            target = normalizeTurnReplayTarget({
              type: 'ally',
              styleId: Number(btn.dataset.styleId),
            });
          }

          this.#savedTargetActions = {
            ...(this.#savedTargetActions ?? {}),
            [actorPartyIndex]: target,
          };
          this.#openTargetPickerPartyIndex = null;
          this.update({
            record: null,
            stateBefore: this.#stateBefore,
            stateAfter: null,
            odState: this.#odState,
            enemyParams: this.#enemyParams,
          });
          this.#onPreviewRequest?.(this.#turnIndex, this.getCurrentSlotActions());
        });
      });

      const countEl = this.#root.querySelector('[data-role="enemy-count"]');
      if (countEl) {
        countEl.addEventListener('change', () => {
          this.update({
            record: null,
            stateBefore: this.#stateBefore,
            stateAfter: null,
            odState: this.#odState,
            enemyParams: this.#enemyParams,
          });
          this.#onPreviewRequest?.(this.#turnIndex, this.getCurrentSlotActions());
        });
      }
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

    // 鬼神化ボタン（未コミット行のみ）
    if (this.#record === null) {
      const kishinkaBtn = this.#root.querySelector('[data-role="kishinka-btn"]');
      kishinkaBtn?.addEventListener('click', () => {
        this.#onKishinkaActivate?.(this.#turnIndex);
      });
    }

    // アイコンタップ swap（未コミット行のみ）
    // D&D が使えない iOS での入れ替え手段：タップで選択→別アイコンタップで交換
    if (this.#record === null) {
      this.#root.querySelectorAll('[data-turn-slot-icon]').forEach((icon) => {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
          // スキル select の誤検知を防ぐ（click が icon 内から来た場合のみ）
          e.stopPropagation();
          const slotEl = icon.closest('[data-turn-slot]');
          if (!slotEl) return;
          const position = Number(slotEl.dataset.position);
          this.#handleIconTap(position);
        });
      });
    }

    // D&D（未コミット行のみ）
    if (this.#record === null) {
      this.#bindDragAndDrop();
    }

    // select 幅監視（バッジ・SPコスト表示切り替え）
    this.#bindResizeObserver();
  }

  /**
   * アイコンタップ時の swap 処理。
   * 1回目: 選択状態にしてアンバーリングを表示。
   * 2回目（同じ）: 選択解除。
   * 2回目（別スロット）: 2スロットを入れ替え。
   * @param {number} position
   */
  #handleIconTap(position) {
    if (this.#selectedSlotPosition === null) {
      this.#selectedSlotPosition = position;
      this.#updateSelectionVisual();
    } else if (this.#selectedSlotPosition === position) {
      this.#selectedSlotPosition = null;
      this.#updateSelectionVisual();
    } else {
      const srcPos = this.#selectedSlotPosition;
      // EX ターン制約チェック（D&D と同じルール）
      if (!this.#isSwapAllowed(srcPos, position)) {
        this.#selectedSlotPosition = null;
        this.#updateSelectionVisual();
        return;
      }
      this.#selectedSlotPosition = null;  // swap 前にリセット
      this.#onSlotChange?.(this.#turnIndex, srcPos, { swapWith: position });
    }
  }

  /** 選択中スロットのアイコンにアンバーリングを付ける（DOM 直接操作）。 */
  #updateSelectionVisual() {
    this.#root.querySelectorAll('[data-turn-slot]').forEach((slotEl) => {
      const pos = Number(slotEl.dataset.position);
      const iconEl = slotEl.querySelector('[data-turn-slot-icon]');
      if (!iconEl) return;
      if (pos === this.#selectedSlotPosition) {
        iconEl.classList.add('ring-2', 'ring-amber-400', 'bg-amber-50');
      } else {
        iconEl.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-50');
      }
    });
  }

  #updateSkillBadges(position, skillId) {
    const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${position}"]`);
    if (!badgeEl) return;
    const member = this.#stateBefore?.party?.find((m) => m.position === position);
    const skill = skillId != null ? (member?.getSkill?.(skillId) ?? null) : null;
    badgeEl.innerHTML = this.#buildSkillBadgesHtml(skill, member, this.#stateBefore);
  }

  /**
   * select 幅に応じてバッジ表示・SPコスト表示を切り替える。
   * ResizeObserver コールバックおよび refreshSkillSelects() から呼ばれる。
   */
  #applyWidthBasedVisibility(selectEl) {
    const width = selectEl.offsetWidth;
    const position = Number(selectEl.dataset.position);

    // バッジ表示制御
    const badgeEl = this.#root.querySelector(`[data-skill-badges][data-position="${position}"]`);
    if (badgeEl) {
      badgeEl.style.display = width >= BADGE_MIN_SELECT_WIDTH ? '' : 'none';
    }

    // SPコスト表示制御（option.textContent を直接更新、value は維持）
    const showCost = width >= COST_MIN_SELECT_WIDTH;
    Array.from(selectEl.options).forEach((opt) => {
      const cost = opt.dataset.costLabel ?? '';
      const name = opt.dataset.skillName ?? '';
      if (cost || name) {
        opt.textContent = showCost ? `${cost}${name}` : name;
      }
    });
  }

  /**
   * 前衛スロットの select 幅を監視し、幅変化時にバッジ・SPコストを更新する。
   */
  #bindResizeObserver() {
    const selects = this.#root.querySelectorAll('[data-skill-select]');
    if (!selects.length) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.#applyWidthBasedVisibility(entry.target);
      }
    });
    selects.forEach((sel) => {
      observer.observe(sel);
      // ResizeObserver は初回コールバックが非同期のため即時も適用
      this.#applyWidthBasedVisibility(sel);
    });
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

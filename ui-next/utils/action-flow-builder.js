/**
 * action-flow-builder.js
 *
 * record.actions を表示用 actionFlow 配列へ変換する共通ヘルパー。
 * turn-engine-manager.js (#buildPreviewActionFlow) と
 * turn-row.js (#buildCommittedActionFlow) の重複ロジックを集約。
 *
 * T34-FU2: レビュー Minor 指摘 — preview action flow 変換ロジックの共通化
 */

/**
 * @param {Object} record - previewRecord or committedRecord ({ actions: Action[] })
 * @returns {Array} actionFlow entries
 */
export function buildActionFlowFromRecord(record) {
  const actions = Array.isArray(record?.actions) ? record.actions : [];
  return actions.map((action, index) => {
    const costChanges = Array.isArray(action?.spChanges)
      ? action.spChanges.filter((change) =>
          change?.source === 'cost' &&
          Number.isFinite(Number(change?.delta)) &&
          Number.isFinite(Number(change?.preSP)) &&
          Number.isFinite(Number(change?.postSP))
        )
      : [];
    const costDeltaFromChanges = costChanges.reduce((sum, change) => sum + Number(change.delta), 0);
    const fallbackSpCost = Number(action?.spCost);
    const costDelta = costChanges.length > 0
      ? costDeltaFromChanges
      : (Number.isFinite(fallbackSpCost) ? -Math.max(0, fallbackSpCost) : 0);
    const firstCostChange = costChanges[0] ?? null;
    const lastCostChange = costChanges.at(-1) ?? null;
    const startSp = Number(firstCostChange?.preSP ?? action?.startSP);
    const endSp = Number(lastCostChange?.postSP ?? action?.endSP);
    return {
      order: index + 1,
      actorCharacterId: String(action?.characterId ?? ''),
      actorCharacterName: String(action?.characterName ?? ''),
      actorPartyIndex: Number(action?.partyIndex),
      skillId: Number(action?.skillId ?? 0),
      skillName: String(action?.skillName ?? ''),
      costDelta: Number.isFinite(costDelta) ? costDelta : 0,
      costPreSp: Number.isFinite(startSp) ? startSp : null,
      costPostSp: Number.isFinite(endSp) ? endSp : null,
      funnelApplied: structuredClone(action?.funnelApplied ?? []),
      statusEffectsApplied: structuredClone(action?.statusEffectsApplied ?? []),
      statusEffectsRemoved: structuredClone(action?.statusEffectsRemoved ?? []),
      enemyStatusChanges: structuredClone(action?.enemyStatusChanges ?? []),
    };
  });
}

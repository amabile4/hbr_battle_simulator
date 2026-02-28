/**
 * actionPlan: [{ position: number, skillId: number }]
 */
export function previewTurn(party, actionPlan) {
  if (!Array.isArray(actionPlan)) {
    throw new Error('actionPlan must be an array.');
  }

  const sorted = [...actionPlan].sort((a, b) => Number(a.position) - Number(b.position));
  const previews = [];
  const baseRevisionVector = party.getRevisionVector();

  for (const action of sorted) {
    const member = party.getByPosition(Number(action.position));
    if (!member) {
      throw new Error(`No character on position ${action.position}.`);
    }

    previews.push(member.previewSkillUse(action.skillId));
  }

  return {
    status: 'preview',
    baseRevisionVector,
    entries: previews,
    createdAt: new Date().toISOString(),
  };
}

export function commitTurn(party, previewRecord) {
  if (!previewRecord || previewRecord.status !== 'preview') {
    throw new Error('commitTurn requires a previewRecord.');
  }

  for (const base of previewRecord.baseRevisionVector) {
    const member = party.members.find((m) => m.characterId === base.characterId);
    if (!member || member.revision !== base.revision) {
      throw new Error('State changed after preview. Re-run preview before commit.');
    }
  }

  const applied = previewRecord.entries.map((entry) => {
    const member = party.members.find((m) => m.characterId === entry.characterId);
    return member.commitSkillPreview(entry);
  });

  return {
    status: 'committed',
    applied,
    committedAt: new Date().toISOString(),
  };
}

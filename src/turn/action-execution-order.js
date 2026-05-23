const NON_DAMAGE_EXECUTION_PHASE = 0;
const DAMAGE_EXECUTION_PHASE = 1;

export function getTurnActionExecutionPhase(skill) {
  return String(skill?.type ?? '') === 'damage'
    ? DAMAGE_EXECUTION_PHASE
    : NON_DAMAGE_EXECUTION_PHASE;
}

function getTurnActionEntryExecutionPhase(entry) {
  return String(entry?.skill?.type ?? '') === 'damage'
    ? DAMAGE_EXECUTION_PHASE
    : NON_DAMAGE_EXECUTION_PHASE;
}

export function compareTurnActionExecutionOrder(left, right) {
  const phaseDelta =
    getTurnActionEntryExecutionPhase(left) - getTurnActionEntryExecutionPhase(right);
  if (phaseDelta !== 0) {
    return phaseDelta;
  }

  const leftPosition = Number(left?.position);
  const rightPosition = Number(right?.position);
  const normalizedLeftPosition = Number.isInteger(leftPosition) ? leftPosition : Number.MAX_SAFE_INTEGER;
  const normalizedRightPosition = Number.isInteger(rightPosition) ? rightPosition : Number.MAX_SAFE_INTEGER;
  return normalizedLeftPosition - normalizedRightPosition;
}

export function sortTurnActionExecutionEntries(entries = []) {
  return [...(Array.isArray(entries) ? entries : [])].sort(compareTurnActionExecutionOrder);
}

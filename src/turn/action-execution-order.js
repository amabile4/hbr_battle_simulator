export function getTurnActionExecutionPhase(skill) {
  return String(skill?.type ?? '') === 'damage' ? 1 : 0;
}

export function compareTurnActionExecutionOrder(left, right) {
  const phaseDelta =
    getTurnActionExecutionPhase(left?.skill) - getTurnActionExecutionPhase(right?.skill);
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

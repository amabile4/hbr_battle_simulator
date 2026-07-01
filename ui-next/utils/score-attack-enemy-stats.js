const SCORE_ATTACK_ENEMY_LABEL_PATTERN = /scoreattack/i;
const GRADE_40_DIFFICULTY = 40;

export function isScoreAttackEnemyLabel(label) {
  return SCORE_ATTACK_ENEMY_LABEL_PATTERN.test(String(label ?? ''));
}

// json/score_attack.json はキー'0'〜'N'の連想配列（各キーが1イベント）。
export function normalizeScoreAttackEvents(raw) {
  if (Array.isArray(raw)) {
    return raw.filter((event) => Array.isArray(event?.battles));
  }
  if (raw && typeof raw === 'object') {
    return Object.values(raw).filter((event) => Array.isArray(event?.battles));
  }
  return [];
}

function findEventsContainingEnemyLabel(enemyLabel, scoreAttackEvents) {
  return scoreAttackEvents.filter((event) =>
    event.battles.some((battle) => Array.isArray(battle?.b) && battle.b.includes(enemyLabel))
  );
}

function pickMostRecentEvent(events) {
  return events.reduce((latest, event) => {
    if (!latest) {
      return event;
    }
    const eventTime = new Date(event?.in_date ?? '').getTime();
    const latestTime = new Date(latest?.in_date ?? '').getTime();
    if (Number.isFinite(eventTime) && (!Number.isFinite(latestTime) || eventTime > latestTime)) {
      return event;
    }
    return latest;
  }, null);
}

// 選択中のスコアアタック敵プリセットラベルから、そのラベルが登場する最新イベントの
// 難易度(d)===40（最高、アビス）のバトルにある rbl/dl/hl を敵パラメータとして返す。
// enemies.json 側のプリセット自体の base_param は難易度によらないプレースホルダのため参照しない。
export function resolveScoreAttackStatsByGrade(enemyLabel, scoreAttackEvents = [], grade = GRADE_40_DIFFICULTY) {
  const label = String(enemyLabel ?? '').trim();
  if (!label || !Array.isArray(scoreAttackEvents) || scoreAttackEvents.length === 0) {
    return null;
  }
  const matchingEvents = findEventsContainingEnemyLabel(label, scoreAttackEvents);
  const latestEvent = pickMostRecentEvent(matchingEvents);
  if (!latestEvent) {
    return null;
  }
  const targetGrade = Number(grade);
  const battle = latestEvent.battles.find((entry) => Number(entry?.d) === targetGrade);
  if (!battle) {
    return null;
  }
  return {
    param_border: Number(battle.rbl?.[0]) || 0,
    dp: Number(battle.dl?.[0]) || 0,
    hp: Number(battle.hl?.[0]) || 0,
  };
}

export function resolveScoreAttackGrade40Stats(enemyLabel, scoreAttackEvents = []) {
  return resolveScoreAttackStatsByGrade(enemyLabel, scoreAttackEvents, GRADE_40_DIFFICULTY);
}

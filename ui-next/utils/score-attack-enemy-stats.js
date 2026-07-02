const SCORE_ATTACK_ENEMY_LABEL_PATTERN = /scoreattack/i;
const GRADE_40_DIFFICULTY = 40;

// 2025-12-26(#88 Awakening Feather)以降のイベントが現行ルール(難易度1〜40 + ルールA〜F選択)と
// 同一形式であることを実データ調査で確認済み。それ以前は難易度レンジ(最大150)・グレード方式
// (複数ルールの段階的組み合わせ)が異なるレガシースキーマのため、対象外として除外する。
// 詳細: docs/active/score_attack_special_rule_phase3_wbs.md
export const SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID = 145000088;

export function isScoreAttackEnemyLabel(label) {
  return SCORE_ATTACK_ENEMY_LABEL_PATTERN.test(String(label ?? ''));
}

// json/score_attack.json はキー'0'〜'N'の連想配列（各キーが1イベント）。
// SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID 未満のレガシー形式イベントはここで除外し、
// 以降の全解決処理(resolveScoreAttackStatsByGrade 等)に一括で波及させる。
export function normalizeScoreAttackEvents(raw) {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  return list.filter((event) =>
    Array.isArray(event?.battles) && Number(event?.id) >= SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID
  );
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

export const SCORE_ATTACK_EVENT_CATEGORY_KEY = 'normal:score-attack';
export const SCORE_ATTACK_EVENT_CATEGORY_LABEL = 'スコアアタック';
const DEFAULT_SCORE_ATTACK_ENEMY_RESISTANCE_RATE_PERCENT = 100;
const SCORE_ATTACK_ENEMY_ELEMENT_KEYS = Object.freeze([
  'slash', 'stab', 'strike', 'fire', 'ice', 'thunder', 'light', 'dark', 'nonelement',
]);

// イベント先頭から順にバトルを走査し、最初に有効な(空文字でないラベル・bnが非null の)
// 敵ラベル/日本語名の組を代表種族として抽出する。
// (#94相当: 先頭バトルの1体目がラベル空文字・bn=null で、2体目から有効データが取れる例に対応)
function findRepresentativeCreature(event) {
  const battles = Array.isArray(event?.battles) ? event.battles : [];
  for (const battle of battles) {
    const labels = Array.isArray(battle?.b) ? battle.b : [];
    const names = Array.isArray(battle?.bn) ? battle.bn : [];
    for (let i = 0; i < labels.length; i += 1) {
      const label = String(labels[i] ?? '').trim();
      const name = names[i]?.n;
      if (label && name) {
        return { label, name: String(name) };
      }
    }
  }
  return null;
}

// score_attack.json のイベント(id >= SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID)から、
// enemy setup の敵選択に混ぜ込める仮想プリセット(1イベント=1敵)を合成する。
// 実パラメータ(dp/hp/param_border)は resolveEnemyDp 等が難易度選択時に都度解決するため、
// ここでは base_param を持たせない。id はイベントIDの符号反転(負値)で、実在の
// enemies.json のIDと衝突しない(既存の buildOrbBossLevel4Enemies と同じ仮想ID方式)。
// 新しいイベントが先頭に来るよう id 降順でソートして返す。
export function buildScoreAttackEventEnemyPresets(scoreAttackEvents = []) {
  if (!Array.isArray(scoreAttackEvents)) {
    return [];
  }
  const sortedEvents = [...scoreAttackEvents]
    .filter((event) => Number(event?.id) >= SCORE_ATTACK_MIN_SUPPORTED_EVENT_ID)
    .sort((a, b) => Number(b?.id) - Number(a?.id));

  const presets = [];
  for (const event of sortedEvents) {
    const creature = findRepresentativeCreature(event);
    if (!creature) {
      continue;
    }
    presets.push({
      id: -Number(event.id),
      name: `${String(event?.name ?? '').trim()} — ${creature.name}`.trim(),
      label: creature.label,
      base_param: {},
      categoryKey: SCORE_ATTACK_EVENT_CATEGORY_KEY,
      categoryLabel: SCORE_ATTACK_EVENT_CATEGORY_LABEL,
      param_border: 0,
      dp: 0,
      od_rate: 0,
      max_d_rate: 999,
      d_rate: 5,
      resistances: {
        element: Object.fromEntries(
          SCORE_ATTACK_ENEMY_ELEMENT_KEYS.map((key) => [key, DEFAULT_SCORE_ATTACK_ENEMY_RESISTANCE_RATE_PERCENT])
        ),
      },
      absorbElementList: [],
    });
  }
  return presets;
}

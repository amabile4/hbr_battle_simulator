/**
 * damage-calculation-data.js
 *
 * DPダメージガイド導出・ダメージ計算ポップアップで共用する JSON データローダー。
 * styles / characters / enemies / skills の 4 ファイルを fetch してキャッシュする。
 *
 * - 同一ページセッション中は 1 度だけ fetch する（Promise キャッシュ）。
 * - fetch 失敗時は reject された Promise を返す（呼び出し側が try/catch で処理すること）。
 */

const DAMAGE_CALC_JSON_FILES = Object.freeze(['styles', 'characters', 'enemies', 'skills']);

/** @type {Promise<{styles: any[], characters: any[], enemies: any[], skills: any[]}>|null} */
let _damageCalculationDataPromise = null;

/**
 * styles / characters / enemies / skills を fetch して返す。
 * 同一セッション内では 1 度だけ fetch し結果をキャッシュする（Promise キャッシュ）。
 *
 * @returns {Promise<{styles: any[], characters: any[], enemies: any[], skills: any[]}>}
 */
export function loadDamageCalculationData() {
  if (!_damageCalculationDataPromise) {
    _damageCalculationDataPromise = Promise.all(
      DAMAGE_CALC_JSON_FILES.map((name) =>
        fetch(`../json/${name}.json`).then((response) => {
          if (!response.ok) {
            throw new Error(`${name}.json ${response.status}`);
          }
          return response.json();
        })
      )
    ).then(([styles, characters, enemies, skills]) => ({ styles, characters, enemies, skills }));
  }
  return _damageCalculationDataPromise;
}

/**
 * テスト・SSR など fetch が使えない環境向けにキャッシュをリセットする。
 * プロダクションコードでは呼ばない。
 */
export function _resetDamageCalculationDataCache() {
  _damageCalculationDataPromise = null;
}

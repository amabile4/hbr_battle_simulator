// グローバル変数の定義
let characterDatabase = {};
let currentParty = [];
let currentTurn = 1;
let isSwapMode = false;
let swapFirstSelected = null;
let selectedCharacterForSkill = null;
let turnActions = {};
let battleHistory = [];
let positionMap = [0, 1, 2, 3, 4, 5]; // ポジションインデックスマップ

// 設定値
const CONFIG = {
    MAX_CHARACTERS: 6,
    FRONT_POSITIONS: 3,
    MAX_SP: 20,
    BASE_SP_RECOVERY: 2,
    FRONT_POSITIONS_ARRAY: [0, 1, 2]
};

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('GUI初期化開始');
    DataManager.loadSkillData();
});

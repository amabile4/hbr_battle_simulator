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
let savedSPState = []; // ターン実行前のSP状態を保存

// 設定値
const CONFIG = {
    MAX_CHARACTERS: 6,
    FRONT_POSITIONS: 3,
    MAX_SP: 20,
    BASE_SP_RECOVERY: 2,
    FRONT_POSITIONS_ARRAY: [0, 1, 2]
};

// デフォルトパーティー設定（将来的に設定画面で変更可能）
let defaultPartySettings = {
    characters: [
        "茅森月歌",
        "和泉ユキ", 
        "逢川めぐみ",
        "東城つかさ",
        "朝倉可憐",
        "國見タマ"
    ],
    initialSP: 6,
    spBonus: 0
};

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔥 ヘブンバーンズレッド戦闘シミュレータ');
    console.log('Version: 2025-06-15-TableLayout-Fix-v4');
    console.log('戦闘結果テーブル固定レイアウト対応版が読み込まれました');
    DataManager.loadSkillData();
});

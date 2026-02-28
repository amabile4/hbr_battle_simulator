// データ管理クラス
class DataManager {
    // スキルデータの読み込み
    static async loadSkillData() {
        try {
            const response = await fetch('skillDatabase.json');
            const jsonData = await response.json();
            
            characterDatabase = jsonData.characters;
            
            if (Object.keys(characterDatabase).length === 0) {
                throw new Error('JSONデータの解析に失敗しました');
            }
            
            console.log('スキルデータ読み込み完了:', Object.keys(characterDatabase).length, 'キャラクター');
            PartyManager.generateCharacterConfig();
            
        } catch (error) {
            console.warn('skillDatabase.jsonの読み込みに失敗しました。模擬データを使用します:', error);
            this.loadMockData();
        }
    }
    
    // 模擬データの読み込み
    static loadMockData() {
        characterDatabase = {
            "茅森月歌": [
                {name: "茅森通常攻撃", cost: 0, type: "damage"},
                {name: "クロス斬り", cost: 6, type: "damage"},
                {name: "ノーブルウェッジ", cost: 8, type: "damage"},
                {name: "フルブレイカー", cost: 10, type: "damage"}
            ],
            "和泉ユキ": [
                {name: "和泉通常攻撃", cost: 0, type: "damage"},
                {name: "ブレイクカノン", cost: 7, type: "damage"},
                {name: "ブレイクバースト", cost: 4, type: "damage"},
                {name: "流星", cost: 11, type: "damage"}
            ],
            "逢川めぐみ": [
                {name: "逢川通常攻撃", cost: 0, type: "damage"},
                {name: "スタンブレード", cost: 5, type: "damage"},
                {name: "ハードブレード", cost: 8, type: "non_damage"},
                {name: "リミットインパクト", cost: 14, type: "damage"}
            ]
        };
        
        console.log('模擬データ読み込み完了');
        PartyManager.generateCharacterConfig();
    }
}
// パーティー管理クラス
class PartyManager {
    // キャラクター設定UIの生成
    static generateCharacterConfig() {
        const container = document.getElementById('characterConfig');
        container.innerHTML = '';
        
        const characters = Object.keys(characterDatabase);
        console.log('利用可能なキャラクター:', characters);
        
        if (characters.length === 0) {
            container.innerHTML = '<div class="loading">キャラクターデータを読み込み中...</div>';
            return;
        }
        
        for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
            const slot = document.createElement('div');
            slot.className = 'character-slot';
            slot.innerHTML = `
                <h3>キャラクター ${i + 1}</h3>
                <div class="input-group">
                    <label>キャラクター選択</label>
                    <select id="char_${i}" onchange="PartyManager.updateCharacterSelection()">
                        <option value="">選択してください</option>
                        ${characters.map(char => `<option value="${char}">${char}</option>`).join('')}
                    </select>
                </div>
                <div class="input-group">
                    <label>初期SP (基本4 + 装備 + パッシブ)</label>
                    <input type="number" id="sp_${i}" min="4" max="20" value="6" onchange="PartyManager.updateCharacterSelection()">
                </div>
                <div class="input-group">
                    <label>ターン経過SP追加ボーナス (基本+2に上乗せ)</label>
                    <input type="number" id="bonus_${i}" min="0" max="3" value="0" onchange="PartyManager.updateCharacterSelection()">
                </div>
            `;
            container.appendChild(slot);
        }
        
        console.log('キャラクター設定UI生成完了');
        
        // デフォルトパーティーを設定
        this.loadDefaultParty();
    }
    
    // デフォルトパーティーの設定
    static loadDefaultParty() {
        // デフォルトパーティーのキャラクターが存在するかチェック
        const availableChars = Object.keys(characterDatabase);
        const validDefaultChars = defaultPartySettings.characters.filter(char => 
            availableChars.includes(char)
        );
        
        if (validDefaultChars.length === 0) {
            console.log('デフォルトパーティーのキャラクターが見つかりません');
            return;
        }
        
        // デフォルト値を設定
        for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
            const charSelect = document.getElementById(`char_${i}`);
            const spInput = document.getElementById(`sp_${i}`);
            const bonusInput = document.getElementById(`bonus_${i}`);
            
            if (charSelect && i < validDefaultChars.length) {
                charSelect.value = validDefaultChars[i];
            }
            if (spInput) {
                spInput.value = defaultPartySettings.initialSP;
            }
            if (bonusInput) {
                bonusInput.value = defaultPartySettings.spBonus;
            }
        }
        
        // 重複チェックを実行
        this.updateCharacterSelection();
        
        // 自動的にパーティーを確定
        this.loadPartySetup();
        
        console.log('デフォルトパーティー設定完了');
    }
    
    // キャラクター選択の更新（重複チェック）
    static updateCharacterSelection() {
        const selectedChars = [];
        for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
            const select = document.getElementById(`char_${i}`);
            if (select && select.value) {
                selectedChars.push(select.value);
            }
        }
        
        // 重複チェック
        for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
            const select = document.getElementById(`char_${i}`);
            if (!select) continue;
            
            const options = select.querySelectorAll('option');
            
            options.forEach(option => {
                if (option.value && option.value !== select.value) {
                    const duplicateCount = selectedChars.filter(c => c === option.value).length;
                    option.disabled = duplicateCount > 0;
                } else {
                    option.disabled = false;
                }
            });
        }
        
        console.log('選択中のキャラクター:', selectedChars);
    }
    
    // パーティー設定のロード
    static loadPartySetup() {
        currentParty = [];
        let hasIncompleteSelection = false;
        
        for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
            const charSelect = document.getElementById(`char_${i}`);
            const spInput = document.getElementById(`sp_${i}`);
            const bonusInput = document.getElementById(`bonus_${i}`);
            
            const charName = charSelect ? charSelect.value : '';
            const initialSP = spInput ? (parseInt(spInput.value) || 6) : 6;
            const spBonus = bonusInput ? (parseInt(bonusInput.value) || 0) : 0;
            
            if (!charName) {
                alert(`キャラクター ${i + 1} を選択してください`);
                hasIncompleteSelection = true;
                break;
            }
            
            if (!characterDatabase[charName]) {
                alert(`キャラクター "${charName}" のデータが見つかりません`);
                hasIncompleteSelection = true;
                break;
            }
            
            currentParty.push({
                name: charName,
                initialSP: initialSP,
                currentSP: initialSP,
                spBonus: spBonus,
                position: i,
                skills: characterDatabase[charName] || []
            });
        }
        
        if (hasIncompleteSelection) {
            return;
        }
        
        // 成功時の処理
        console.log('パーティー編成完了:', currentParty);
        DisplayManager.generatePartyDisplay();
        ResultsManager.updateResultsTableHeaders();
        
        // パーティー編成セクションを自動的に折りたたむ
        const partySetup = document.getElementById('partySetup');
        partySetup.classList.add('collapsed');
        
        // パーティー状況を更新
        const partyStatus = document.getElementById('partyStatus');
        const selectedNames = currentParty.map(p => p.name).join(', ');
        partyStatus.textContent = `✅ 編成完了: ${selectedNames} - クリックして再編集`;
    }
    
    // リセット機能
    static resetParty() {
        if (confirm('パーティー設定をリセットしますか？')) {
            currentParty = [];
            currentTurn = 1;
            battleHistory = [];
            turnActions = {};
            positionMap = [0, 1, 2, 3, 4, 5];
            
            // UI要素のリセット
            for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
                const charSelect = document.getElementById(`char_${i}`);
                const spInput = document.getElementById(`sp_${i}`);
                const bonusInput = document.getElementById(`bonus_${i}`);
                
                if (charSelect) charSelect.value = '';
                if (spInput) spInput.value = '6';
                if (bonusInput) bonusInput.value = '0';
            }
            
            this.updateCharacterSelection();
            DisplayManager.generatePartyDisplay();
            document.getElementById('turnInfo').textContent = 'ターン 1 - 戦闘準備中';
            document.getElementById('resultsBody').innerHTML = '';
            
            console.log('パーティーリセット完了');
        }
    }
}

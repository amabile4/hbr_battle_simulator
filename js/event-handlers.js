// イベントハンドラークラス
class EventHandler {
    // キャラクターカードクリック処理
    static handleCharacterClick(position) {
        if (isSwapMode) {
            SwapManager.handleSwapClick(position);
        } else {
            SkillManager.handleSkillSelection(position);
        }
    }
}

// 配置入れ替え管理クラス
class SwapManager {
    // 配置入れ替えモードの切り替え
    static toggleSwapMode() {
        isSwapMode = !isSwapMode;
        const btn = document.getElementById('swapBtn');
        
        if (isSwapMode) {
            btn.textContent = '入れ替え中止';
            btn.className = 'btn btn-warning';
            document.querySelectorAll('.character-card').forEach(card => {
                card.classList.add('swap-mode');
            });
        } else {
            btn.textContent = '配置入れ替え';
            btn.className = 'btn btn-warning';
            swapFirstSelected = null;
            document.querySelectorAll('.character-card').forEach(card => {
                card.classList.remove('swap-mode', 'selected');
            });
        }
    }
    
    // 配置入れ替え処理
    static handleSwapClick(position) {
        if (swapFirstSelected === null) {
            swapFirstSelected = position;
            document.getElementById(`char_card_${position}`).classList.add('selected');
        } else {
            if (swapFirstSelected !== position) {
                // 位置を交換
                [positionMap[swapFirstSelected], positionMap[position]] = 
                [positionMap[position], positionMap[swapFirstSelected]];
                
                // パーティー表示を更新
                DisplayManager.generatePartyDisplay();
            }
            
            // 入れ替えモード終了
            this.toggleSwapMode();
        }
    }
}

// スキル管理クラス
class SkillManager {
    // スキル選択処理
    static handleSkillSelection(position) {
        const playerIndex = positionMap[position];
        const character = currentParty[playerIndex];
        
        console.log('スキル選択開始:', {
            position,
            playerIndex,
            character: character ? character.name : 'なし',
            isFrontLine: position < CONFIG.FRONT_POSITIONS
        });
        
        if (!character || position >= CONFIG.FRONT_POSITIONS) {
            console.log('スキル選択不可:', position >= CONFIG.FRONT_POSITIONS ? '後衛' : '未設定');
            return;
        }
        
        selectedCharacterForSkill = position;
        
        const skillSelection = document.getElementById('skillSelection');
        const skillTitle = document.getElementById('skillSelectionTitle');
        const skillDropdown = document.getElementById('skillDropdown');
        
        skillTitle.textContent = `${character.name} のスキル選択`;
        skillDropdown.innerHTML = '<option value="">スキルを選択してください</option>';
        
        character.skills.forEach((skill, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${skill.name} (SP:${skill.cost})`;
            option.disabled = skill.cost > character.currentSP;
            skillDropdown.appendChild(option);
        });
        
        // 現在選択されているスキルをハイライト
        if (turnActions[position]) {
            const currentSkillIndex = character.skills.findIndex(skill => 
                skill.name === turnActions[position].skill.name && 
                skill.cost === turnActions[position].skill.cost
            );
            if (currentSkillIndex >= 0) {
                skillDropdown.value = currentSkillIndex;
            }
        }
        
        skillSelection.style.display = 'block';
        
        // 選択された状態を表示
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.getElementById(`char_card_${position}`).classList.add('selected');
    }
    
    // スキル選択
    static selectSkill() {
        const skillDropdown = document.getElementById('skillDropdown');
        const skillIndex = skillDropdown.value;
        
        if (skillIndex !== '' && selectedCharacterForSkill !== null) {
            const playerIndex = positionMap[selectedCharacterForSkill];
            const character = currentParty[playerIndex];
            const skill = character.skills[skillIndex];
            
            turnActions[selectedCharacterForSkill] = {
                character: character.name,
                skill: skill,
                position: selectedCharacterForSkill
            };
            
            // UI更新
            const card = document.getElementById(`char_card_${selectedCharacterForSkill}`);
            card.style.border = '3px solid #4ade80';
            
            // スキル表示更新
            DisplayManager.updateSkillDisplay(selectedCharacterForSkill);
            
            // ダイアログを閉じる
            document.getElementById('skillSelection').style.display = 'none';
            
            // 選択状態をリセット
            document.querySelectorAll('.character-card').forEach(card => {
                card.classList.remove('selected');
            });
            
            selectedCharacterForSkill = null;
            ControlManager.updateExecuteButton();
            
            console.log(`スキル選択完了: ${character.name} → ${skill.name}`);
        }
    }
}

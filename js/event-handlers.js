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
            // 入れ替えモード開始時：スキル選択UIを非表示
            this.hideSkillSelection();
            
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
    
    // スキル選択UIを非表示にする
    static hideSkillSelection() {
        const skillSelection = document.getElementById('skillSelection');
        if (skillSelection) {
            skillSelection.style.display = 'none';
        }
        
        // スキル選択対象をリセット
        selectedCharacterForSkill = null;
        
        // キャラクターカードの選択状態をクリア
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('selected');
        });
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
                
                // スキル選択状態の管理
                this.handleSkillSwap(swapFirstSelected, position);
                
                // SP状態を復元（プレビュー状態をリセット）
                ControlManager.restoreSPState();
                
                // パーティー表示を更新
                DisplayManager.generatePartyDisplay();
                
                // スキル選択状態を確実にリセット
                this.hideSkillSelection();
                
                // 配置入れ替え後、現在のターンの戦闘結果を再計算
                this.updateBattleResultAfterSwap();
            }
            
            // 入れ替えモード終了
            this.toggleSwapMode();
        }
    }
    
    // スキル選択状態の入れ替え処理
    static handleSkillSwap(pos1, pos2) {
        const isFront1 = pos1 < CONFIG.FRONT_POSITIONS;
        const isFront2 = pos2 < CONFIG.FRONT_POSITIONS;
        
        if (isFront1 && isFront2) {
            // 前衛同士の入れ替え：スキル選択状態も入れ替え
            const action1 = turnActions[pos1];
            const action2 = turnActions[pos2];
            
            // 単純に行動を入れ替え（キャラクター名は後で再設定）
            if (action1) {
                turnActions[pos2] = {
                    ...action1,
                    position: pos2
                };
            } else {
                delete turnActions[pos2];
            }
            
            if (action2) {
                turnActions[pos1] = {
                    ...action2,
                    position: pos1
                };
            } else {
                delete turnActions[pos1];
            }
        } else {
            // 前衛と後衛の入れ替え：関連するスキル選択をすべてクリア
            delete turnActions[pos1];
            delete turnActions[pos2];
        }
        
        // 配置入れ替え後のキャラクター名を更新
        if (isFront1 && isFront2) {
            // 前衛同士の場合、キャラクター名を正しく更新
            if (turnActions[pos1]) {
                const char1Index = positionMap[pos1];
                turnActions[pos1].character = currentParty[char1Index].name;
            }
            if (turnActions[pos2]) {
                const char2Index = positionMap[pos2];
                turnActions[pos2].character = currentParty[char2Index].name;
            }
        }
        
        // 新しく前衛になったキャラクターにデフォルトスキルを設定
        [pos1, pos2].forEach(pos => {
            if (pos < CONFIG.FRONT_POSITIONS && !turnActions[pos]) {
                const playerIndex = positionMap[pos];
                const character = currentParty[playerIndex];
                if (character) {
                    const defaultSkill = character.skills.find(skill => skill.cost === 0);
                    if (defaultSkill) {
                        turnActions[pos] = {
                            character: character.name,
                            skill: defaultSkill,
                            position: pos
                        };
                    }
                }
            }
        });
    }
    
    // 配置入れ替え後の戦闘結果更新
    static updateBattleResultAfterSwap() {
        // 現在のターンの戦闘結果が存在する場合のみ更新
        const currentTurnIndex = battleHistory.findIndex(turn => turn.turn === currentTurn);
        if (currentTurnIndex >= 0) {
            // 現在の配置とスキル選択で戦闘結果を再計算
            const turnData = {
                turn: currentTurn,
                enemyAction: "敵行動",
                characters: []
            };
            
            currentParty.forEach((character, index) => {
                if (!character) return;
                
                const startSP = character.currentSP;
                
                // 行動処理
                const position = positionMap.indexOf(index);
                let action = "—";
                let endSP = character.currentSP;
                
                if (position < CONFIG.FRONT_POSITIONS && turnActions[position]) {
                    const skillData = turnActions[position].skill;
                    action = skillData.name;
                    endSP = character.currentSP - skillData.cost;
                }
                
                turnData.characters.push({
                    name: character.name,
                    startSP: startSP,
                    action: action,
                    endSP: endSP
                });
            });
            
            // 戦闘履歴を更新
            battleHistory[currentTurnIndex] = turnData;
            
            // 結果テーブルを更新
            ResultsManager.updateResultsTable();
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

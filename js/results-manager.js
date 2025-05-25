// 結果管理クラス
class ResultsManager {
    // 結果テーブルのヘッダー更新
    static updateResultsTableHeaders() {
        const headerRow = document.querySelector('.results-table thead tr:first-child');
        const subHeaderRow = document.querySelector('.results-table thead tr:last-child');
        
        if (!headerRow || !subHeaderRow) return;
        
        // ヘッダーを動的に更新
        headerRow.innerHTML = `
            <th>ターン</th>
            <th>敵行動など</th>
            ${currentParty.map(char => `<th colspan="3">${char.name}</th>`).join('')}
        `;
        
        subHeaderRow.innerHTML = `
            <th></th>
            <th></th>
            ${currentParty.map(() => '<th>始</th><th>行動</th><th>終</th>').join('')}
        `;
    }
    
    // 結果テーブルの更新
    static updateResultsTable() {
        const tbody = document.getElementById('resultsBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        battleHistory.forEach(turn => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${turn.turn}</td>
                <td>${turn.enemyAction}</td>
                ${turn.characters.map(char => 
                    `<td>${char.startSP}</td><td>${char.action}</td><td>${char.endSP}</td>`
                ).join('')}
            `;
            tbody.appendChild(row);
        });
    }
}

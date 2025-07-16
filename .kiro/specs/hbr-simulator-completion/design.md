# HBRシミュレータ完成化プロジェクト 設計書

## 概要

既存のモジュラー設計を活用し、未実装機能を段階的に追加する設計。既存のクラス構造を拡張し、新機能を統合する。

## アーキテクチャ

### 既存システムの活用
- **DataManager**: スキルデータベース管理（拡張: 設定データ管理）
- **PartyManager**: パーティー編成管理（拡張: 設定画面連携）
- **ControlManager**: 戦闘制御（拡張: OD・追加ターン管理）
- **ResultsManager**: 結果表示（拡張: CSV出力機能）

### 新規コンポーネント
- **OverdriveManager**: オーバードライブシステム管理
- **BuffDebuffManager**: バフ・デバフ状態管理
- **ExportManager**: CSV出力機能
- **SettingsManager**: 設定画面管理
- **ActionOrderManager**: 行動順序実行管理

## コンポーネント設計

### 1. タブ区切りデータ出力システム (ExportManager)

#### データ構造
```javascript
class ExportManager {
    static generateTSV() {
        // 既存スプレッドシートテンプレート対応のタブ区切り形式
        return {
            header1: "キャラクター名行（各キャラ3列分のスペース）",
            header2: "列ヘッダー行（T\t敵行動\t始\t行動\t終\t...）",
            dataRows: battleHistory.map(turn => this.formatTurnData(turn))
        };
    }
    
    static formatTurnData(turnData) {
        // T列（ターン種別）、敵行動列、各キャラ3列（始SP、行動、終SP）
        const turnType = this.getTurnTypeLabel(turnData.turnNumber, turnData.isSpecial);
        const enemyAction = turnData.enemyAction || "";
        const characterData = turnData.characters.map(char => 
            `${char.startSP}\t${char.action}\t${char.endSP}`
        ).join('\t');
        
        return `${turnType}\t${enemyAction}\t${characterData}`;
    }
}
```

#### 出力フォーマット
- **区切り文字**: タブ文字（\t）
- **文字エンコーディング**: UTF-8
- **列構造**: T列（ターン種別）、敵行動列、キャラ1（始・行動・終）、キャラ2（始・行動・終）...
- **特殊ターン表記**: 数字（通常ターン）、OD1/OD2/OD3、追加
- **貼り付け対応**: 既存スプレッドシートに直接Ctrl+Vで貼り付け可能

### 2. オーバードライブシステム (OverdriveManager)

#### 状態管理
```javascript
class OverdriveManager {
    static odState = {
        gauge: 0,        // -300% ～ +300%
        isActive: false,
        level: 0,        // 1, 2, 3
        remainingTurns: 0,
        activator: null  // 発動者
    };
    
    static activateOD(level, character) {
        // OD発動処理
        // SP回復: OD1=+5, OD2=+12, OD3=+20
        // 追加ターン: OD1=+1, OD2=+2, OD3=+3
    }
}
```

#### UI要素
- **ODゲージ表示**: プログレスバー形式
- **OD発動ボタン**: ゲージ100%以上で有効化
- **OD状態表示**: 現在のODレベルと残りターン数

### 3. 追加ターンシステム (AdditionalTurnManager)

#### 状態管理
```javascript
class AdditionalTurnManager {
    static additionalTurnState = {
        activeCharacters: [],  // 追加ターン状態のキャラクター
        turnCount: 0,         // 追加ターン番号
        restrictions: {}      // 配置交代制限
    };
    
    static grantAdditionalTurn(characterIds, count = 1) {
        // 追加ターン付与
        // 初回追加ターン時SP+5
    }
}
```

#### 配置交代制限
- **前衛全員追加ターン**: 前衛3人間でのみ交代可能
- **個別追加ターン**: 追加ターン状態のキャラクター間でのみ交代
- **交代不可**: 追加ターン1人の場合

### 4. 設定システム (SettingsManager)

#### 設定データ構造
```javascript
class SettingsManager {
    static defaultSettings = {
        defaultParty: {
            characters: ["茅森月歌", "和泉ユキ", "逢川めぐみ", "東城つかさ", "朝倉可憐", "國見タマ"],
            initialSP: 6,
            spBonus: 0
        },
        ui: {
            autoCollapse: true,
            showDebugInfo: false
        },
        export: {
            includeMetadata: true,
            dateFormat: "YYYY-MM-DD"
        }
    };
}
```

#### 設定画面UI
- **タブ形式**: パーティー設定、UI設定、エクスポート設定
- **リアルタイムプレビュー**: 設定変更の即座反映
- **インポート/エクスポート**: 設定ファイルの保存・読み込み

### 5. バフ・デバフ管理システム (BuffDebuffManager)

#### 状態データ構造
```javascript
class BuffDebuffManager {
    static statusEffects = {
        buffs: {
            enhance: { level: 0, duration: 0 },      // 攻撃力アップ（2重複まで）
            defense: { level: 0, duration: 0 },     // 防御力アップ
            speed: { level: 0, duration: 0 }        // 速度アップ
        },
        debuffs: {
            enemyAttack: { level: 0, duration: 0 }, // 敵攻撃力ダウン
            enemyDefense: { level: 0, duration: 0 } // 敵防御力ダウン
        }
    };
}
```

#### 状態管理機能
- **効果適用**: スキル使用時の状態変更
- **継続管理**: ターン経過による効果減少
- **重複処理**: エンハンス等の重ね掛け管理
- **表示更新**: UI上での状態表示

### 6. 行動順序実行システム (ActionOrderManager)

#### 実行フェーズ管理
```javascript
class ActionOrderManager {
    static executePhase1() {
        // 非ダメージスキル実行（ポジション1→2→3）
        const nonDamageActions = this.getNonDamageActions();
        nonDamageActions.forEach(action => this.executeAction(action));
    }
    
    static executePhase2() {
        // ダメージスキル実行（ポジション1→2→3）
        const damageActions = this.getDamageActions();
        damageActions.forEach(action => this.executeAction(action));
    }
}
```

## データモデル

### 拡張されたキャラクターデータ
```javascript
const enhancedCharacterData = {
    name: "キャラクター名",
    initialSP: 6,
    currentSP: 6,
    spBonus: 0,
    position: 0,
    skills: [],
    // 新規追加
    statusEffects: {},
    additionalTurns: 0,
    isODActivator: false
};
```

### 拡張されたターンデータ
```javascript
const enhancedTurnData = {
    turnNumber: 1,
    turnType: "normal", // "normal", "OD1", "OD2", "OD3", "additional"
    actions: [],
    spChanges: [],
    statusChanges: [],
    // 新規追加
    odState: {},
    additionalTurnInfo: {}
};
```

## エラーハンドリング

### CSV出力エラー
- **データ不整合**: 不完全なデータの検出と修復
- **ファイル生成失敗**: ブラウザ互換性問題の対処
- **大容量データ**: メモリ効率的な処理

### 状態管理エラー
- **不正な状態遷移**: 状態の整合性チェック
- **データ破損**: 自動復旧機能
- **同期エラー**: UI表示との同期保証

## テスト戦略

### 単体テスト
- **各マネージャークラス**: 個別機能のテスト
- **データ変換**: CSV出力フォーマットの検証
- **状態遷移**: OD・追加ターンの状態管理

### 統合テスト
- **エンドツーエンド**: 完全な戦闘フローのテスト
- **データ整合性**: 複数システム間のデータ同期
- **パフォーマンス**: 大量データ処理の性能テスト

### ユーザビリティテスト
- **UI操作性**: 新機能の使いやすさ
- **エラー処理**: ユーザーフレンドリーなエラー表示
- **レスポンシブ**: モバイル対応の確認
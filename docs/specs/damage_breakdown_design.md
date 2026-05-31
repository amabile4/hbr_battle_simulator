# 威力増加ブレイクダウンパネル HTML/CSS 設計書 (スキル種別グループ色分け・2列テーブル)

このドキュメントは、ゲーム内の「状態変化ウィンドウ（キャラクター詳細ポップアップ）」のトーン＆マナーに合わせ、ユーザー提示の「ヘブバン情報まとめ①【スキル効果値】」のグループ分類・配色を完全に踏襲したダメージ威力ブレイクダウンパネルのHTML/CSS設計書です。

---

## 1. グループ分類と配色方針 (画像のスキル種別に準拠)

画像の色分けと同等の粒度で計算の種別グループを定義し、各グループ内で計算（加算/乗算）された結果が、最後に全て積算されるプロセスを視覚的に表現します。

1. **攻撃バフ枠 (`buff`) [赤ピンク系]**
   - 項目: スキル攻撃力バフ、属性スキル攻撃力バフ、チャージ（スキル攻撃力）、属性強化フィールド等
   - 配色: `rgba(244, 63, 94, 0.08)` 背景 / 文字色 `#f43f5e`
2. **クリティカル・心眼枠 (`crit-mindeye`) [黄緑系]**
   - 項目: クリティカル威力バフ、属性クリティカル威力バフ、心眼（弱点スキル攻撃力）
   - 配色: `rgba(132, 204, 22, 0.08)` 背景 / 文字色 `#84cc16`
3. **連撃バフ枠 (`funnel`) [薄青系]**
   - 項目: 連撃数アップ
   - 配色: `rgba(56, 189, 248, 0.08)` 背景 / 文字色 `#38bdf8`
4. **トークン・固有枠 (`token-passive`) [ピンクパープル系]**
   - 項目: トークン攻撃倍率、アビリティや固有パッシブバフ（影分身、オギャり等）
   - 配色: `rgba(217, 70, 239, 0.08)` 背景 / 文字色 `#d946ef`
5. **敵デバフ・脆弱枠 (`debuff`) [オレンジ/黄系]**
   - 項目: 防御ダウン、永続防御ダウン、属性防御ダウン、脆弱
   - 配色: `rgba(249, 115, 22, 0.08)` 背景 / 文字色 `#f97316`
6. **属性耐性ダウン枠 (`resist-down`) [紫系]**
   - 項目: 属性耐性ダウン（エレメンタルダウン）
   - 配色: `rgba(139, 92, 246, 0.08)` 背景 / 文字色 `#8b5cf6`
7. **基本相性枠 (`affinity`) [グレー/その他]**
   - 項目: 敵の基本武器属性相性（斬・突・打）、基本属性相性値
   - 配色: `rgba(148, 163, 184, 0.08)` 背景 / 文字色 `#94a3b8`

---

## 2. HTML構造

```html
<div id="damage-breakdown-popup" class="dmg-popup">
  <div class="dmg-popup__backdrop" data-role="dmg-popup-backdrop"></div>
  
  <div class="dmg-popup__panel" data-role="dmg-popup-panel">
    <!-- ヘッダー部 -->
    <div class="dmg-popup__header" data-role="char-popup-header">
      <div class="dmg-popup__header-title">
        <span class="char-popup-hdr-style">[専用スキル]</span>
        <span class="char-popup-hdr-char">クロス斬り</span>
        <span class="dmg-popup__actor-name">by 茅森月歌</span>
      </div>
      <div class="dmg-popup__summary">
        <div class="dmg-popup__summary-value">7.17<span class="dmg-popup__summary-unit">x</span></div>
        <div class="dmg-popup__summary-label">(+617% 威力増加)</div>
      </div>
      <button type="button" data-role="char-popup-close" class="dmg-popup__close-btn" aria-label="閉じる">✕</button>
    </div>

    <!-- 2列テーブルによる積算ブレイクダウン -->
    <div class="dmg-popup__table">
      
      <!-- 1. 攻撃バフ枠 -->
      <div class="dmg-popup__row" data-group="buff">
        <div class="dmg-popup__group-col">
          <div class="dmg-popup__group-title">攻撃バフ枠</div>
          <div class="dmg-popup__group-formula">式: 1.0 + (0.50 + 0.60)</div>
          <div class="dmg-popup__group-total">2.10x</div>
        </div>
        <div class="dmg-popup__effects-col">
          <div class="char-popup-buff-block">
            <div class="char-popup-buff-icon">🛡️</div>
            <div class="char-popup-buff-center">
              <div class="char-popup-buff-title">
                攻撃力アップ
                <span class="char-popup-buff-power">+50%</span>
                <span class="char-popup-buff-skill">[専用スキル]</span>
                <span class="char-popup-buff-from">東城つかさ</span>
              </div>
              <div class="char-popup-buff-desc line-clamp-2">味方全体の攻撃力を上昇させる</div>
            </div>
          </div>
          <div class="char-popup-buff-block">
            <div class="char-popup-buff-icon">🔥</div>
            <div class="char-popup-buff-center">
              <div class="char-popup-buff-title">
                火属性攻撃力アップ
                <span class="char-popup-buff-power">+60%</span>
                <span class="char-popup-buff-skill">[火の領域]</span>
                <span class="char-popup-buff-from">歌陽</span>
              </div>
              <div class="char-popup-buff-desc line-clamp-2">味方全体の火属性攻撃力を上昇させる</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. クリティカル・心眼枠 -->
      <div class="dmg-popup__row" data-group="crit-mindeye">
        <div class="dmg-popup__group-col">
          <div class="dmg-popup__group-title">クリティカル・心眼枠</div>
          <div class="dmg-popup__group-formula">式: 1.50 * 1.50</div>
          <div class="dmg-popup__group-total">2.25x</div>
        </div>
        <div class="dmg-popup__effects-col">
          <!-- 心眼 -->
          <div class="char-popup-buff-block">
            <div class="char-popup-buff-icon">👁️</div>
            <div class="char-popup-buff-center">
              <div class="char-popup-buff-title">
                心眼 (弱点スキル攻撃力)
                <span class="char-popup-buff-power">+50%</span>
                <span class="char-popup-buff-skill">[専用スキル]</span>
                <span class="char-popup-buff-from">大島一千子</span>
              </div>
              <div class="char-popup-buff-desc line-clamp-2">敵の弱点属性を突いた時のダメージを上昇させる</div>
            </div>
          </div>
          <!-- クリティカル威力 -->
          <div class="char-popup-buff-block">
            <div class="char-popup-buff-icon">✨</div>
            <div class="char-popup-buff-center">
              <div class="char-popup-buff-title">
                クリティカル威力
                <span class="char-popup-buff-power">+30%</span>
                <span class="char-popup-buff-skill">[通常バフ]</span>
                <span class="char-popup-buff-from">櫻庭星羅</span>
              </div>
              <div class="char-popup-buff-desc line-clamp-2">クリティカル発生時の基礎威力上昇</div>
            </div>
          </div>
        </div>
      </div>

      <!-- その他の枠は ui-next/design_preview.html に記載の通り続きます -->
      
    </div>
  </div>
</div>
```

## 3. CSSスタイル (Vanilla CSS)

```css
/* ポップアップ配置・オーバーレイ */
.dmg-popup {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dmg-popup__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
}

.dmg-popup__panel {
  position: fixed;
  inset: 10%;        /* 上下左右 10% マージンによる 80% x 80% 表示 */
  width: auto;
  height: auto;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
  font-size: 13px;
  padding: 14px;
  gap: 12px;
  overflow-y: auto;
}

/* 2列構造のテーブルレイアウト */
.dmg-popup__table {
  display: flex;
  flex-direction: column;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #0f172a;
  overflow: hidden;
  flex: 1;
}

.dmg-popup__row {
  display: grid;
  grid-template-columns: 240px 1fr;
  border-bottom: 1px solid #273549;
}

.dmg-popup__row:last-child {
  border-bottom: none;
}

/* 左列: 計算の種別グループ情報 */
.dmg-popup__group-col {
  padding: 12px 14px;
  border-right: 1px solid #273549;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

/* 各グループの背景色・テキストカラー設定 */
.dmg-popup__row[data-group="buff"] .dmg-popup__group-col { background: rgba(244, 63, 94, 0.08); }
.dmg-popup__row[data-group="buff"] .dmg-popup__group-title { color: #fda4af; }
.dmg-popup__row[data-group="buff"] .dmg-popup__group-total { color: #f43f5e; }

.dmg-popup__row[data-group="crit-mindeye"] .dmg-popup__group-col { background: rgba(132, 204, 22, 0.08); }
.dmg-popup__row[data-group="crit-mindeye"] .dmg-popup__group-title { color: #bef264; }
.dmg-popup__row[data-group="crit-mindeye"] .dmg-popup__group-total { color: #84cc16; }

.dmg-popup__row[data-group="funnel"] .dmg-popup__group-col { background: rgba(56, 189, 248, 0.08); }
.dmg-popup__row[data-group="funnel"] .dmg-popup__group-title { color: #7dd3fc; }
.dmg-popup__row[data-group="funnel"] .dmg-popup__group-total { color: #38bdf8; }

.dmg-popup__row[data-group="token-passive"] .dmg-popup__group-col { background: rgba(217, 70, 239, 0.08); }
.dmg-popup__row[data-group="token-passive"] .dmg-popup__group-title { color: #f5d0fe; }
.dmg-popup__row[data-group="token-passive"] .dmg-popup__group-total { color: #d946ef; }

.dmg-popup__row[data-group="debuff"] .dmg-popup__group-col { background: rgba(249, 115, 22, 0.08); }
.dmg-popup__row[data-group="debuff"] .dmg-popup__group-title { color: #ffedd5; }
.dmg-popup__row[data-group="debuff"] .dmg-popup__group-total { color: #f97316; }

.dmg-popup__row[data-group="resist-down"] .dmg-popup__group-col { background: rgba(139, 92, 246, 0.08); }
.dmg-popup__row[data-group="resist-down"] .dmg-popup__group-title { color: #ddd6fe; }
.dmg-popup__row[data-group="resist-down"] .dmg-popup__group-total { color: #8b5cf6; }

.dmg-popup__row[data-group="affinity"] .dmg-popup__group-col { background: rgba(148, 163, 184, 0.08); }
.dmg-popup__row[data-group="affinity"] .dmg-popup__group-title { color: #cbd5e1; }
.dmg-popup__row[data-group="affinity"] .dmg-popup__group-total { color: #94a3b8; }

/* 右列: 具体的な採用効果一覧 */
.dmg-popup__effects-col {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
```

## 未実装要素と将来の計算式拡張

ステータス差分によるダメージ補正（攻撃側ATKと防御側DEFの差）は威力に影響する。
ただし現時点のシミュレータは、キャラクターや敵の絶対ステータス値を入力・保持していない。

全能力ダウン（タリスマン/霊符・禍）は、敵の防御ステータスを一定量引き下げる効果としてこの差分計算に関与する。
倍率値ではないため、絶対ステータス追跡が実装されるまでは威力詳細に表示しない。

将来は、攻撃側ATKと防御側DEF（全能力ダウン適用後）の差分を算出し、その差分を補正係数に変換したうえで debuff 枠に表示する。

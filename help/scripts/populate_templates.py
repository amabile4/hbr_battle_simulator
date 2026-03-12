import json
import os
import re
from collections import Counter

def load_json(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def clean_text(text):
    if not text:
        return ""
    # 改行などを削除して一行にする
    text = text.replace('\n', ' ').replace('\\n', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def get_ignore_skill_types():
    return {"AttackSkill", "Heal", "RecoverDp", "Buff", "Debuff", "None", "Summon"}

def process_keyword(keywords, skills_data, passives_data):
    """
    指定されたキーワードリスト（表記揺れ含む）で skills.json と passives.json の「desc」を検索。
    完全一致（部分文字列一致）するものを抽出し、内部名・条件判定名を推測して返す。
    """
    if isinstance(keywords, str):
        keywords = [keywords]

    matched_skills = []
    matched_passives = []
    skill_types = []
    conditions = []

    # skills.json の検索
    for s in skills_data:
        desc = clean_text(s.get("desc", ""))
        if any(k in desc for k in keywords):
            matched_skills.append({
                "chara": s.get("chara", "").split(" — ")[0].strip(),
                "style": s.get("style", ""),
                "name": s.get("name", ""),
                "desc": desc
            })
            for p in s.get("parts", []):
                st = p.get("skill_type")
                if st and st not in get_ignore_skill_types():
                    skill_types.append(st)
                    
            cond = s.get("overwrite_cond", "")
            if cond:
                conditions.append(cond)
            c2 = s.get("cond", "")
            if c2:
                conditions.append(c2)

    # passives.json の検索
    for p in passives_data:
        desc = clean_text(p.get("desc", ""))
        if any(k in desc for k in keywords):
            matched_passives.append({
                "chara": p.get("chara", "").split(" — ")[0].strip(),
                "style": p.get("style", ""),
                "name": p.get("name", ""),
                "desc": desc
            })
            cond = p.get("cond", "")
            if cond:
                conditions.append(cond)

    if not matched_skills and not matched_passives:
        return None
        
    # 最も出現頻度が高いものを内部名/判定条件として推測する
    inferred_skill_type = Counter(skill_types).most_common(1)[0][0] if skill_types else None
    inferred_cond = Counter(conditions).most_common(1)[0][0] if conditions else None
        
    return {
        "skill_type": inferred_skill_type,
        "cond": inferred_cond,
        "skills": matched_skills,
        "passives": matched_passives
    }

import sys

def main():
    """
    一括再生成する場合はこの main を実行します。
    ※一部手動で修正・除外したファイル（例: EXスキル連続発動.md など）があるため、
    全上書きする場合は注意して実行してください。
    """
    
    if len(sys.argv) < 2:
        print("Usage: python3 help/scripts/populate_templates.py <keyword | --all>")
        print("\nExamples:")
        print("  python3 help/scripts/populate_templates.py --all      # すべてのファイルを更新します（SKIP_LISTにある手動更新ファイルは除外）")
        print("  python3 help/scripts/populate_templates.py 闘志        # '闘志.md' のみを更新します（単体更新の場合はSKIP_LISTを無視して更新可能です）")
        print("\n引数を指定せずに実行したため、処理を中断しました。")
        sys.exit(1)
        
    target_arg = sys.argv[1]
    
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    json_dir = os.path.join(project_root, "data", "json") if os.path.exists(os.path.join(project_root, "data", "json")) else os.path.join(project_root, "json")
    
    skills_data = load_json(os.path.join(json_dir, 'skills.json'))
    passives_data = load_json(os.path.join(json_dir, 'passives.json'))
    
    base_dirs = [
        os.path.join(project_root, "help", "HEAVEN_BURNS_RED", "バトル"),
        os.path.join(project_root, "help", "HEAVEN_BURNS_RED", "キャラクター")
    ]
    
    # 手動スキップリスト (引数指定時は無視して強制実行される仕様でもOKですが、安全のため残します)
    SKIP_LIST = ["脆弱", "心眼", "やる気", "EXスキル連続発動", "ハッキング", "ジェネライズ", "霊符", "ハイブースト", "単独発動", "サポート枠", "共鳴アビリティ", "速弾き"]
    
    # 検索エイリアス（表記揺れ）マップ
    ALIAS_MAP = {
        "BREAK": ["ブレイク"],
        "OVERDRIVE": ["ODゲージ", "OD中", "オーバードライブ"],
        "フィールド効果": ["フィールド"]
    }
    
    updated_count = 0
    no_match_count = 0
    
    for base_dir in base_dirs:
        if not os.path.exists(base_dir):
            continue
            
        for filename in os.listdir(base_dir):
            if not filename.endswith(".md"):
                continue
                
            filepath = os.path.join(base_dir, filename)
            keyword = os.path.splitext(filename)[0]
            
            # 引数指定によるフィルタ
            if target_arg != "--all" and keyword != target_arg:
                continue
            
            # 手動で「ヒットなし」としたりカスタマイズしたファイルはここで除外する
            # ただし、単発指定の時は強制実行したい場合はコメントアウトなどを調整してください
            if target_arg == "--all" and keyword in SKIP_LIST:
                continue
                
            # エイリアスの適用
            search_keywords = ALIAS_MAP.get(keyword, [keyword])
            
            result = process_keyword(search_keywords, skills_data, passives_data)
            
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            internal_section = "## シミュレーター実装情報\n"
            
            if len(search_keywords) > 1 or search_keywords[0] != keyword:
                alias_display = " または ".join(search_keywords)
                internal_section += f"- **検索エイリアス (表記揺れ)**: `{alias_display}`\n"
            else:
                alias_display = keyword
            
            if result:
                if result["skill_type"]:
                    internal_section += f"- **内部名**: `{result['skill_type']}`\n"
                else:
                    internal_section += f"- **内部名**: 明確な skill_type なし\n"
                    
                if result["cond"]:
                    internal_section += f"- **条件判定名**: `{result['cond']}` などを利用\n"
                    
                internal_section += f"\n### 所持スタイルリスト ({alias_display} での検索結果)\n"
                
                # 最大5件ずつ表示する制限
                if result["skills"]:
                    internal_section += f"\n#### スキル (skills.json)\n"
                    for m in result["skills"][:5]:
                        chara = m['chara'] if m['chara'] else "共通/敵"
                        internal_section += f"- **{chara}** [{m['style']}]\n  - {m['name']}\n  - {m['desc']}\n"
                    if len(result["skills"]) > 5:
                        internal_section += f"- ...他 {len(result['skills'])-5} 件\n"
                        
                if result["passives"]:
                    internal_section += f"\n#### パッシブ (passives.json)\n"
                    for m in result["passives"][:5]:
                        chara = m['chara'] if m['chara'] else "共通/敵"
                        internal_section += f"- **{chara}** [{m['style']}]\n  - {m['name']}\n  - {m['desc']}\n"
                    if len(result["passives"]) > 5:
                        internal_section += f"- ...他 {len(result['passives'])-5} 件\n"
                updated_count += 1
            else:
                internal_section += "説明文(desc)の完全一致によるヒットなし。\n\n<!-- この機能や仕様が本シミュレーターでどのように実装されているか、あるいは実装予定か、制限事項などを追記してください。 -->\n"
                no_match_count += 1
                
            new_content = re.sub(r'## シミュレーター実装情報.*', internal_section, content, flags=re.DOTALL)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
                
    print(f"Update complete. Updated: {updated_count}, No Match: {no_match_count}")

if __name__ == "__main__":
    main()

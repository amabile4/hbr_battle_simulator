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

def main():
    """
    一括再生成する場合はこの main を実行します。
    ※一部手動で修正・除外したファイル（例: EXスキル連続発動.md など）があるため、
    全上書きする場合は注意して実行してください。
    """
    rootDir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_dir = os.path.join(rootDir, "data", "json") if os.path.exists(os.path.join(rootDir, "data", "json")) else os.path.join(rootDir, "json")
    
    skills_data = load_json(os.path.join(json_dir, 'skills.json'))
    passives_data = load_json(os.path.join(json_dir, 'passives.json'))
    
    base_dirs = [
        os.path.join(rootDir, "help/HEAVEN_BURNS_RED/バトル"),
        os.path.join(rootDir, "help/HEAVEN_BURNS_RED/キャラクター")
    ]
    
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
            
            # 手動で「ヒットなし」としたりカスタマイズしたファイルはここで除外する
            if keyword in ["脆弱", "心眼", "やる気", "EXスキル連続発動", "BREAK", "OVERDRIVE"]:
                continue
                
            result = process_keyword([keyword], skills_data, passives_data)
            
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            internal_section = "## シミュレーター実装情報\n"
            
            if result:
                if result["skill_type"]:
                    internal_section += f"- **内部名**: `{result['skill_type']}`\n"
                else:
                    internal_section += f"- **内部名**: 明確な skill_type なし\n"
                    
                if result["cond"]:
                    internal_section += f"- **条件判定名**: `{result['cond']}` などを利用\n"
                    
                internal_section += f"\n### 所持スタイルリスト\n"
                
                if result["skills"]:
                    internal_section += f"\n#### スキル (skills.json)\n"
                    # サンプルとして最大5件に絞るなら result["skills"][:5]
                    for m in result["skills"]:
                        chara = m['chara'] if m['chara'] else "共通/敵"
                        internal_section += f"- **{chara}** [{m['style']}]\n  - {m['name']}\n  - {m['desc']}\n"
                        
                if result["passives"]:
                    internal_section += f"\n#### パッシブ (passives.json)\n"
                    for m in result["passives"]:
                        chara = m['chara'] if m['chara'] else "共通/敵"
                        internal_section += f"- **{chara}** [{m['style']}]\n  - {m['name']}\n  - {m['desc']}\n"
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

#!/usr/bin/env python3
import json
import argparse
import os

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_manual(query, characters_file, skills_file, output_file):
    characters = load_json(characters_file)
    skills = load_json(skills_file)

    name_map = {}
    for chara in characters:
        full_name = chara.get('name', '')
        if full_name:
            jp_name = full_name.split(' — ')[0].strip()
            name_map[full_name] = jp_name

    matched_skills = []
    for s in skills:
        desc = s.get('desc', '')
        if query in desc:
            matched_skills.append(s)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"# ヘルプ：HEAVEN BURNS RED > バトル > {query}\n\n")
        f.write("## 基本情報\n\n")
        f.write("- **URL**: なし (ゲーム内共通仕様)\n")
        f.write("- **カテゴリ**: HEAVEN BURNS RED > バトル\n\n")
        f.write("## 概要\n\n")
        f.write(f"「{query}」に関するヘルプドキュメントです。（※ここに詳細仕様を追記してください）\n\n")
        f.write(f"### 所持スタイルリスト ({query} での検索結果)\n\n")
        f.write("#### スキル (skills.json)\n")
        
        for s in matched_skills:
            raw_chara = s.get('chara', '')
            jp_chara = name_map.get(raw_chara, raw_chara.split(' — ')[0].strip())
            style = s.get('style', '')
            name = s.get('name', '')
            desc = s.get('desc', '').replace('\n', ' ')
            
            f.write(f"- **{jp_chara}** [{style}]\n")
            f.write(f"  - {name}\n")
            f.write(f"  - {desc}\n")

    print(f"Generated template for '{query}' at {output_file} with {len(matched_skills)} skills.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Generate HBR Help Manual Template for Skills")
    parser.add_argument("query", help="The exact text to search for in skill descriptions (e.g. 'SPが0以上であれば使用可能')")
    parser.add_argument("output", help="The output path for the markdown file (e.g. 'help/HEAVEN_BURNS_RED/バトル/SPが0以上であれば使用可能.md')")
    parser.add_argument("--chars", default="json/characters.json", help="Path to characters.json")
    parser.add_argument("--skills", default="json/skills.json", help="Path to skills.json")
    
    args = parser.parse_args()
    generate_manual(args.query, args.chars, args.skills, args.output)

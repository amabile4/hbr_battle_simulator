import os
import json
import re

INPUT_PATH = "extracted_info/formulas_by_sheet.json"
OUTPUT_DIR = "extracted_info/clean_formulas"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def restore_formula(raw_formula):
    if not raw_formula:
        return raw_formula
    
    # __xludf.DUMMYFUNCTION("...") を探す
    # 最外周の DUMMYFUNCTION を抽出する
    # 例: =IFERROR(__xludf.DUMMYFUNCTION("original_formula"), default_value)
    # パターン1: =__xludf.DUMMYFUNCTION("...")
    # パターン2: =IFERROR(__xludf.DUMMYFUNCTION("..."), ...)
    
    # DUMMYFUNCTION(" から始まり、対応する ") までの文字列を抽出
    # 文字列内のダブルクォーテーションは "" でエスケープされている
    # 正規表現で __xludf.DUMMYFUNCTION(" と、その後の閉じ括弧までをキャプチャ
    # ※引数内のダブルクォートは "" になっているので、単純に "(.*?)" でマッチングすると
    # 途中の "" で切れる可能性がある。そのため、"" または ダブルクォート以外の文字の繰り返しをマッチさせる。
    pattern = r'__xludf\.DUMMYFUNCTION\("((?:""|[^"])*)"\)'
    match = re.search(pattern, raw_formula)
    
    if match:
        inner = match.group(1)
        # "" を " に置換
        restored = inner.replace('""', '"')
        # 改行文字などのエスケープ解除
        restored = restored.replace('\\n', '\n')
        # 先頭に = がなければ付ける
        if not restored.startswith('='):
            restored = '=' + restored
        return restored
    
    return raw_formula

def main():
    print(f"Loading raw formulas from {INPUT_PATH}...")
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        formulas_data = json.load(f)
        
    cleaned_data = {}
    
    print("Cleaning and restoring formulas...")
    for sheet_name, cells in formulas_data.items():
        sheet_cleaned = []
        # 各シートごとのテキストファイル用バッファ
        text_lines = []
        
        for cell_info in cells:
            cell = cell_info["cell"]
            raw = cell_info["formula"]
            clean = restore_formula(raw)
            
            sheet_cleaned.append({
                "cell": cell,
                "original_formula": raw,
                "clean_formula": clean
            })
            
            # テキストファイル用の見やすいフォーマット
            # 改行がある場合はインデントを揃える
            clean_indented = clean.replace('\n', '\n        ')
            text_lines.append(f"[{cell}]\nFormula: {clean_indented}\nOriginal: {raw}\n" + "-"*40)
            
        cleaned_data[sheet_name] = sheet_cleaned
        
        # シートごとにテキストファイルを保存
        if text_lines:
            # ファイル名に使えない文字を置換
            safe_sheet_name = re.sub(r'[\\/*?:[\]]', '_', sheet_name)
            sheet_text_path = os.path.join(OUTPUT_DIR, f"{safe_sheet_name}.txt")
            with open(sheet_text_path, "w", encoding="utf-8") as sf:
                sf.write(f"Sheet: {sheet_name}\n")
                sf.write(f"Formula Cells Count: {len(text_lines)}\n")
                sf.write("="*60 + "\n\n")
                sf.write("\n\n".join(text_lines))
                
    # 全体JSONを保存
    output_json_path = "extracted_info/clean_formulas_all.json"
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
        
    print(f"Cleaned formulas saved to {output_json_path} and individual files in {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()

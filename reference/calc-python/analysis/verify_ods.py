import os
import xml.etree.ElementTree as ET
import json
import re

CONTENT_XML_PATH = "extracted_ods_xml/content.xml"
CLEAN_JSON_PATH = "extracted_info/clean_formulas_all.json"

NS = {
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'
}

def get_column_letter(col_idx):
    result = ""
    while col_idx > 0:
        col_idx, remainder = divmod(col_idx - 1, 26)
        result = chr(65 + remainder) + result
    return result

def parse_ods_formulas(target_sheets):
    print(f"Parsing ODS content.xml from {CONTENT_XML_PATH}...")
    tree = ET.parse(CONTENT_XML_PATH)
    root = tree.getroot()
    
    ods_data = {}
    for sheet_elem in root.findall('.//table:table', NS):
        sheet_name = sheet_elem.get(f'{{{NS["table"]}}}name')
        if sheet_name not in target_sheets:
            continue
            
        ods_data[sheet_name] = {}
        row_idx = 1
        for row_elem in sheet_elem.findall('table:table-row', NS):
            rows_repeated = row_elem.get(f'{{{NS["table"]}}}number-rows-repeated')
            num_rows = int(rows_repeated) if rows_repeated else 1
            
            col_idx = 1
            for cell_elem in row_elem.findall('table:table-cell', NS):
                cols_repeated = cell_elem.get(f'{{{NS["table"]}}}number-columns-repeated')
                num_cols = int(cols_repeated) if cols_repeated else 1
                
                formula = cell_elem.get(f'{{{NS["table"]}}}formula')
                if formula:
                    for r_offset in range(num_rows):
                        for c_offset in range(num_cols):
                            c_letter = get_column_letter(col_idx + c_offset)
                            cell_coord = f"{c_letter}{row_idx + r_offset}"
                            ods_data[sheet_name][cell_coord] = formula
                            
                col_idx += num_cols
            row_idx += num_rows
            
    return ods_data

def normalize_formula(formula, is_ods=False):
    if not formula:
        return ""
        
    f = formula.strip()
    
    # 1. DUMMYFUNCTION の解除 (ODS版は dummyfunction 小文字になっているケースがある)
    # 例: of:=IFERROR(__xludf.dummyfunction("original_formula");"")
    # 例: of:=IFERROR(__xludf.DUMMYFUNCTION("original_formula"), "")
    dummy_pattern = r'__xludf\.[dD][uU][mM][mM][yY][fF][uU][nN][cC][tT][iI][oO][nN]\("((?:""|[^"])*)"\)'
    match = re.search(dummy_pattern, f)
    if match:
        inner = match.group(1).replace('""', '"').replace('\\n', '\n')
        # IFERROR部分を剥ぎ取るか、もしくはDUMMYFUNCTIONの中身そのものを対象にする
        f = "=" + inner if not inner.startswith('=') else inner

    # ODS固有のプレフィックス削除
    f = re.sub(r'^(of|oooc|org\.libreoffice\.ext\.google-sheets):=', '=', f)
    
    if is_ods:
        # 2. ODSのセル参照表記の正規化
        # [.P2] -> P2
        f = re.sub(r'\[\.([^\]]+)\]', r'\1', f)
        # ['$仮想敵.A$1:.G$1048576'] -> '仮想敵'!A:G に類する表記へ (大枠の簡易置換)
        # ドットをエクスクラメーションに置換 (例: $ダメージ計算機.AZ11 -> 'ダメージ計算機'!AZ11)
        f = re.sub(r'\[?\$([^\].]+)\.([A-Z0-9$:]+)\]?', r"'\1'!\2", f)
        f = re.sub(r'\'([^\']+)\'\.([A-Z0-9$:]+)', r"'\1'!\2", f)
        f = f.replace('.$', '$').replace('.', '')
        # 引数区切りのセミコロンをカンマに統一
        # 文字列リテラル内のセミコロンを置換しないよう簡易対処（簡易的に ; を , に置換）
        # ※本来はパーサーが必要だが、一般的な数式比較のため置換
        # リテラル外の ; を置換するため、簡易的に文字列リテラルを退避するか、文字置換を行う
        # ここでは文字単位の置換。数式中の ";" を "," に
        f = f.replace(';', ',')
        # ODSではIFSの最後のTRUEが1になっているケースがあるため、統一
        f = re.sub(r'\b1,', 'true,', f)
        f = re.sub(r'\b0\b', 'false', f) # FALSE / 0 の統一
    else:
        # XLSX側
        f = f.replace('FALSE', 'false').replace('TRUE', 'true')
        
    # 余分な記号・空白の削除
    f = f.replace(" ", "").replace("\n", "").lower()
    f = f.replace("'", "").replace('"', "") # 引用符の違いも無視
    return f

def verify_and_compare():
    target_sheets = ["スコアタ計算機", "能力値", "消費SPX以下アビ"]
    ods_formulas = parse_ods_formulas(target_sheets)
    
    print(f"Loading restored formulas from {CLEAN_JSON_PATH}...")
    with open(CLEAN_JSON_PATH, "r", encoding="utf-8") as f:
        xlsx_clean_data = json.load(f)
        
    verification_results = []
    
    for sheet_name in target_sheets:
        if sheet_name not in ods_formulas:
            continue
            
        print(f"Verifying sheet: {sheet_name} ...")
        xlsx_cells = xlsx_clean_data.get(sheet_name, [])
        xlsx_cell_dict = {c["cell"]: c for c in xlsx_cells}
        ods_cells = ods_formulas[sheet_name]
        
        for cell_coord, xlsx_info in xlsx_cell_dict.items():
            xlsx_restored = xlsx_info["clean_formula"]
            ods_raw = ods_cells.get(cell_coord)
            
            if ods_raw:
                norm_xlsx = normalize_formula(xlsx_restored, is_ods=False)
                norm_ods = normalize_formula(ods_raw, is_ods=True)
                
                # スコアタ計算機などで "computed_value" はxlsxのエクスポートのプレースホルダーなので除外して比較
                # または computed_value 同士で一致するか
                is_match = (norm_xlsx == norm_ods)
                
                verification_results.append({
                    "sheet": sheet_name,
                    "cell": cell_coord,
                    "xlsx_restored": xlsx_restored,
                    "ods_raw": ods_raw,
                    "norm_xlsx": norm_xlsx,
                    "norm_ods": norm_ods,
                    "is_match": is_match
                })
            else:
                # ODS側に数式属性がない場合
                verification_results.append({
                    "sheet": sheet_name,
                    "cell": cell_coord,
                    "xlsx_restored": xlsx_restored,
                    "ods_raw": None,
                    "is_match": False,
                    "reason": "Missing formula attribute in ODS"
                })
                
    total = len(verification_results)
    actual_checks = sum(1 for r in verification_results if r["ods_raw"] is not None)
    matches = sum(1 for r in verification_results if r["is_match"])
    mismatches = actual_checks - matches
    
    print("\n=== Verification Summary ===")
    print(f"Total checked cells (with formulas in both): {actual_checks}")
    print(f"Matches (normalized): {matches} ({matches/actual_checks*100:.2f}%)")
    print(f"Missing in ODS: {total - actual_checks}")
    
    mismatch_report_path = "extracted_info/mismatch_report_normalized.txt"
    with open(mismatch_report_path, "w", encoding="utf-8") as f:
        f.write(f"=== ODS vs XLSX Normalized Verification Report ===\n")
        f.write(f"Matches: {matches} / {actual_checks}\n\n")
        
        if mismatches > 0:
            f.write("--- Mismatched Cells Details (Normalized) ---\n")
            for r in verification_results:
                if r["ods_raw"] is not None and not r["is_match"]:
                    f.write(f"Sheet: {r['sheet']}, Cell: {r['cell']}\n")
                    f.write(f"  [XLSX Restored]: {r['xlsx_restored']}\n")
                    f.write(f"  [ODS Raw]: {r['ods_raw']}\n")
                    f.write(f"  [Norm XLSX]: {r['norm_xlsx']}\n")
                    f.write(f"  [Norm ODS ]: {r['norm_ods']}\n")
                    f.write("-" * 50 + "\n")
        else:
            f.write("All cell formulas matched perfectly after normalization!\n")
            
    print(f"Normalized verification report saved to: {mismatch_report_path}")

if __name__ == "__main__":
    verify_and_compare()

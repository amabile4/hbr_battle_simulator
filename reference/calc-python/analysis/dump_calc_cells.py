import openpyxl

EXCEL_PATH = "HBR計算機\U0001f3adVer.4.31.03.xlsx"

def dump():
    wb_val = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws_val = wb_val["ダメージ計算機"]
    
    wb_form = openpyxl.load_workbook(EXCEL_PATH, data_only=False)
    ws_form = wb_form["ダメージ計算機"]
    
    target_cells = [
        "AK2", "AK3", "AK4", "AK5", "AK6", "AK7",
        "AJ2", "AJ3", "AJ4", "AJ5", "AJ6", "AJ7",
        "AH2", "AH3", "AH4", "AH5", "AH6", "AH7",
        "AM2", "AM3", "AM4", "AM5", "AM6", "AM7",
        "AW49", "AS47", "AW49", "AR51",
        "AZ18", "AZ20", "AZ5", "AY5", "AY6",
        "AF24", "AG24", "AH24", "AI24", "AJ24", "AK24", "AL24", "AM24", "AN24", "AO24", "AP24"
    ]
    
    for coord in target_cells:
        val = ws_val[coord].value
        form = ws_form[coord].value
        print(f"Cell {coord}: Value={val} | Formula={form}")

if __name__ == "__main__":
    dump()

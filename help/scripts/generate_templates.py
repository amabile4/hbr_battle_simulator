import json
import os
import re

def clean_filename(title):
    # Keep only safe characters for filenames or just replace slashes and spaces
    safe = re.sub(r'[\\/*?:"<>|]', "", title)
    return safe.strip().replace(" ", "_")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_file = os.path.join(script_dir, '..', 'data', 'help_crawl_raw.json')
    base_dir = os.path.join(script_dir, '..')

    if not os.path.exists(data_file):
        print(f"Data file not found at: {data_file}")
        return

    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Initial markdown template
    template = """# ヘルプ：{breadcrumb_path} > {title}

## 基本情報
- **URL**: {url}
- **カテゴリ**: {breadcrumbs_text}

## ヘルプ記載内容
{body_text}

## シミュレーター実装情報
- **内部名 (Internal Name)**: <!-- data/json/ 内の該当データの内部名を記載してください。 -->
- **タイミング (Timing)**: <!-- 発動・処理されるタイミングの内部名を記載してください。 -->

## シミュレーター実装メモ
<!-- この機能や仕様が本シミュレーターでどのように実装されているか、あるいは実装予定か、制限事項などを追記してください。 -->
"""

    articles = data.get('articleFacts', [])
    generated_count = 0
    for item in articles:
        breadcrumbs = item.get('breadcrumbs', [])
        # We process all categories containing body_lines
        if "body_lines" in item:
            title = item.get('title', 'Unknown').replace(' – HEAVEN BURNS RED', '').strip()
            body_lines = item.get('body_lines', [])
            body_text = "\n".join(body_lines)
            url = item.get('url', '')
            
            # Setup path structure: help / breadcrumb[0] / breadcrumb[1] / ...
            dir_paths = [clean_filename(b) for b in breadcrumbs]
            target_dir = os.path.join(base_dir, *dir_paths)
            os.makedirs(target_dir, exist_ok=True)
            
            filename = clean_filename(title) + ".md"
            filepath = os.path.join(target_dir, filename)
            
            breadcrumb_path = " > ".join(breadcrumbs)
            
            # 既存のファイルがある場合は上書きしない方針（必要なら変更）
            if os.path.exists(filepath):
                continue
                
            content = template.format(
                breadcrumb_path=breadcrumb_path,
                title=title,
                url=url,
                breadcrumbs_text=breadcrumb_path,
                body_text=body_text
            )
            
            with open(filepath, 'w', encoding='utf-8') as out:
                out.write(content)
            print(f"Generated {filepath}")
            generated_count += 1
            
    print(f"Total new files generated: {generated_count}")

if __name__ == "__main__":
    main()

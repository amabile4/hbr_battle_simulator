#!/usr/bin/env python3
"""
SeraphDB JSONデータ更新モジュール

https://master.hbr.quest/{name}.json から json/{name}.json を更新する。
"""

import json
import logging
import os
import subprocess
import hashlib
import tempfile
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.request import urlopen

LOGGER = logging.getLogger("json_data_updater")

DEFAULT_SOURCE_BASE_URL = "https://master.hbr.quest"
DEFAULT_OUTPUT_DIR = Path("json")
DEFAULT_DATASETS = [
    "accessories",
    "arts_items",
    "battles",
    "boosters",
    "characters",
    "chips",
    "conquest",
    "cooking",
    "enemies",
    "events",
    "gachasim",
    "items",
    "levels",
    "missions",
    "packs",
    "passives",
    "skills",
    "styles",
]


def setup_logging() -> None:
    """ロガー初期化"""
    if LOGGER.handlers:
        return
    LOGGER.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s - %(message)s"))
    LOGGER.addHandler(handler)


def fetch_json(dataset_name: str, base_url: str = DEFAULT_SOURCE_BASE_URL):
    """指定データセットを取得してJSONとして返す"""
    url = f"{base_url.rstrip('/')}/{dataset_name}.json"

    # この環境ではcurlが安定しているため優先利用
    try:
        proc = subprocess.run(
            ["curl", "-sSL", "--max-time", "60", url],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return json.loads(proc.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        # フォールバック: 標準ライブラリ
        with urlopen(url, timeout=60) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw)


def write_json_atomic(output_path: Path, data: bytes) -> None:
    """JSON(バイト列)を一時ファイル経由で原子的に書き込む"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    existing_mode = (output_path.stat().st_mode & 0o777) if output_path.exists() else 0o644
    with tempfile.NamedTemporaryFile(
        mode="wb", delete=False, dir=output_path.parent, suffix=".tmp"
    ) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, output_path)
    os.chmod(output_path, existing_mode)


def update_json_data_files(
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    datasets=None,
    base_url: str = DEFAULT_SOURCE_BASE_URL,
) -> bool:
    """JSONデータ群を更新する。1件でも失敗したらFalseを返す。"""
    setup_logging()

    names = datasets or DEFAULT_DATASETS
    all_ok = True

    LOGGER.info("JSON更新開始: %s (%s件)", output_dir, len(names))
    for name in names:
        output_file = output_dir / f"{name}.json"
        try:
            payload = fetch_json(name, base_url=base_url)
            new_data_bytes = json.dumps(payload, ensure_ascii=False, separators=(", ", ": ")).encode("utf-8") + b"\n"
            new_hash = hashlib.sha256(new_data_bytes).hexdigest()

            if output_file.exists():
                existing_data_bytes = output_file.read_bytes()
                existing_hash = hashlib.sha256(existing_data_bytes).hexdigest()
                
                if new_hash == existing_hash:
                    LOGGER.info("変更なし(スキップ): %s", output_file)
                    continue

            write_json_atomic(output_file, new_data_bytes)
            LOGGER.info("更新完了: %s", output_file)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            all_ok = False
            LOGGER.error("更新失敗: %s (%s)", output_file, exc)
        except Exception as exc:  # 想定外エラー
            all_ok = False
            LOGGER.error("更新失敗(想定外): %s (%s)", output_file, exc)

    if all_ok:
        LOGGER.info("JSON更新完了: 全件成功")
    else:
        LOGGER.warning("JSON更新完了: 一部失敗あり")
    return all_ok


def main() -> int:
    ok = update_json_data_files()
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

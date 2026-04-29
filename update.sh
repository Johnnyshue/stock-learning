#!/usr/bin/env bash
# 一鍵更新：抓最新股價 + 重切章節 + 重爬 RSS
# 用法：./update.sh [stock|guide|extras|all]   # 預設 all

set -euo pipefail
cd "$(dirname "$0")"

# 啟用 venv
# shellcheck disable=SC1090
source ~/.clinical-tools/venv/bin/activate

mode="${1:-all}"

case "$mode" in
  stock|all)
    echo "▶ 1/3 抓最新股價（11 檔）"
    python scripts/fetch_data.py
    ;;
esac

case "$mode" in
  guide|all)
    echo "▶ 2/3 重切學習指南章節"
    python scripts/split_guide.py
    ;;
esac

case "$mode" in
  extras|all)
    echo "▶ 3/3 爬學習資源 RSS"
    python scripts/scrape_extras.py
    ;;
esac

echo
echo "✅ 更新完成。預覽："
echo "   python3 -m http.server 8765"
echo "   open http://localhost:8765"

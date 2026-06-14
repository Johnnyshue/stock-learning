#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飆股雷達 (MOPS Radar)
抓台股公開資料 -> 算指標篩選 -> 終端機表格 + JSON + Telegram 推送。

複製自投資 YouTube 影片的概念：監控公開資訊、算月營收動能與估值、
早上滑手機看「今日值得注意標的」名單。

資料來源（TWSE OpenAPI，真實資料；失敗即報錯，不塞假數據）：
  - 上市月營收 : https://openapi.twse.com.tw/v1/opendata/t187ap05_L
  - 上櫃月營收 : https://openapi.twse.com.tw/v1/opendata/t187ap05_P
  - 本益比/殖利率/PB : https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL

用法：
  python3 radar.py            # 抓資料、篩選、印表格、真的推 Telegram（若有設 token）
  python3 radar.py --dry-run  # 同上但 Telegram 走 dry-run（只印訊息不送）
  python3 radar.py --otc      # 額外納入上櫃月營收
  python3 radar.py --top 30   # 表格最多顯示 30 筆
"""

import argparse
import json
import os
import sys
from datetime import datetime

# ---- HTTP：優先 requests，沒有就退 urllib（不硬裝套件）----
try:
    import requests

    def http_get_json(url, timeout=30):
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "mops-radar/1.0"})
        r.raise_for_status()
        return r.json()

    def http_post(url, data, timeout=30):
        r = requests.post(url, data=data, timeout=timeout)
        return r.status_code, r.text

except ImportError:
    import urllib.request
    import urllib.parse
    import urllib.error

    def http_get_json(url, timeout=30):
        req = urllib.request.Request(url, headers={"User-Agent": "mops-radar/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def http_post(url, data, timeout=30):
        body = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(url, data=body)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8")


# =====================================================================
# CONFIG —— 篩選門檻放這裡，方便調整
# =====================================================================
MIN_DIVIDEND_YIELD = 4.0  # 殖利率 > 此值 (%)
MAX_PB_RATIO = 2.0  # 股價淨值比 < 此值
MIN_REVENUE_YOY = 10.0  # 月營收 YoY% > 此值 (轉強門檻)
MIN_REVENUE_MOM = 0.0  # 月營收 MoM% > 此值 (預設僅要求不衰退)
TOP_N = 20  # 終端機表格預設顯示筆數

URL_REV_TWSE = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"
URL_REV_OTC = "https://openapi.twse.com.tw/v1/opendata/t187ap05_P"
URL_VALUATION = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"

# 月營收欄位名（TWSE 實際欄名）
F_CODE = "公司代號"
F_NAME = "公司名稱"
F_YM = "資料年月"
F_REV_CUR = "營業收入-當月營收"
F_REV_PREV = "營業收入-上月營收"
F_REV_LASTYEAR = "營業收入-去年當月營收"


def to_float(s):
    """robust 清洗：字串、可能空、含逗號或百分比。失敗回 None，不崩。"""
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).strip().replace(",", "").replace("%", "")
    if s in ("", "-", "N/A", "NA", "null", "None"):
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def fetch_revenue(url, source_label):
    """抓月營收，回傳 dict: code -> {name, ym, mom, yoy, rev_cur}。"""
    data = http_get_json(url)
    if not isinstance(data, list) or not data:
        raise RuntimeError(f"{source_label} 月營收回傳格式異常或為空")
    out = {}
    for row in data:
        code = str(row.get(F_CODE, "")).strip()
        if not code:
            continue
        rev_cur = to_float(row.get(F_REV_CUR))
        rev_prev = to_float(row.get(F_REV_PREV))
        rev_ly = to_float(row.get(F_REV_LASTYEAR))

        mom = None
        if rev_cur is not None and rev_prev not in (None, 0):
            mom = (rev_cur - rev_prev) / abs(rev_prev) * 100.0
        yoy = None
        if rev_cur is not None and rev_ly not in (None, 0):
            yoy = (rev_cur - rev_ly) / abs(rev_ly) * 100.0

        out[code] = {
            "name": str(row.get(F_NAME, "")).strip(),
            "ym": str(row.get(F_YM, "")).strip(),
            "rev_cur": rev_cur,
            "mom": mom,
            "yoy": yoy,
            "market": source_label,
        }
    return out


def fetch_valuation():
    """抓本益比/殖利率/PB，回傳 dict: code -> {pe, yield, pb}。"""
    data = http_get_json(URL_VALUATION)
    if not isinstance(data, list) or not data:
        raise RuntimeError("估值 (BWIBBU_ALL) 回傳格式異常或為空")
    out = {}
    for row in data:
        code = str(row.get("Code", "")).strip()
        if not code:
            continue
        out[code] = {
            "pe": to_float(row.get("PEratio")),
            "yield": to_float(row.get("DividendYield")),
            "pb": to_float(row.get("PBratio")),
        }
    return out


def screen(revenue, valuation):
    """合併資料並套用門檻，回傳通過篩選的標的清單（依 YoY 排序）。"""
    picks = []
    for code, rev in revenue.items():
        val = valuation.get(code)
        if not val:
            continue
        dy = val["yield"]
        pb = val["pb"]
        yoy = rev["yoy"]
        mom = rev["mom"]

        # 缺關鍵指標就跳過
        if dy is None or pb is None or yoy is None or mom is None:
            continue

        if (
            dy > MIN_DIVIDEND_YIELD
            and pb < MAX_PB_RATIO
            and yoy > MIN_REVENUE_YOY
            and mom > MIN_REVENUE_MOM
        ):
            picks.append(
                {
                    "code": code,
                    "name": rev["name"],
                    "market": rev["market"],
                    "ym": rev["ym"],
                    "rev_cur": rev["rev_cur"],
                    "mom": round(mom, 2),
                    "yoy": round(yoy, 2),
                    "dividend_yield": dy,
                    "pb": pb,
                    "pe": val["pe"],
                }
            )
    picks.sort(key=lambda x: x["yoy"], reverse=True)
    return picks


def print_table(picks, top_n):
    if not picks:
        print("（今日無標的通過篩選門檻）")
        return
    header = f"{'代號':<6}{'名稱':<10}{'市場':<6}{'月營收YoY%':>11}{'MoM%':>9}{'殖利率%':>9}{'PB':>7}{'PE':>8}"
    print(header)
    print("-" * len(header.encode("ascii", "ignore").decode()) if False else "-" * 78)
    for p in picks[:top_n]:
        name = p["name"][:8]
        pe = f"{p['pe']:.1f}" if p["pe"] is not None else "-"
        print(
            f"{p['code']:<6}{name:<10}{p['market']:<6}"
            f"{p['yoy']:>11.2f}{p['mom']:>9.2f}{p['dividend_yield']:>9.2f}"
            f"{p['pb']:>7.2f}{pe:>8}"
        )
    if len(picks) > top_n:
        print(f"... 另有 {len(picks) - top_n} 檔未顯示（共 {len(picks)} 檔）")


def build_telegram_message(picks, ym, top_n=15):
    lines = []
    lines.append(f"\U0001F4C8 飆股雷達 {datetime.now():%Y-%m-%d}（資料年月 {ym}）")
    lines.append(
        f"篩選: 殖利率>{MIN_DIVIDEND_YIELD}% / PB<{MAX_PB_RATIO} / "
        f"營收YoY>{MIN_REVENUE_YOY}% / MoM>{MIN_REVENUE_MOM}%"
    )
    lines.append(f"共 {len(picks)} 檔通過\n")
    if not picks:
        lines.append("今日無標的通過篩選。")
        return "\n".join(lines)
    for i, p in enumerate(picks[:top_n], 1):
        lines.append(
            f"{i}. {p['code']} {p['name']}  "
            f"YoY {p['yoy']:.1f}% / 殖利 {p['dividend_yield']:.1f}% / "
            f"PB {p['pb']:.2f}"
        )
    if len(picks) > top_n:
        lines.append(f"...另有 {len(picks) - top_n} 檔，詳見 JSON。")
    lines.append("\n(僅供參考，非投資建議)")
    return "\n".join(lines)


def send_telegram(message, dry_run):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if dry_run or not token or not chat_id:
        reason = (
            "--dry-run" if dry_run else "未設定 TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID"
        )
        print(f"\n[DRY-RUN] ({reason}) 將推送以下訊息至 Telegram：")
        print("-" * 50)
        print(message)
        print("-" * 50)
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    status, body = http_post(url, {"chat_id": chat_id, "text": message})
    if status == 200:
        print("\n[Telegram] 已成功送出。")
        return True
    print(f"\n[Telegram] 送出失敗 (HTTP {status}): {body[:300]}", file=sys.stderr)
    return False


def main():
    ap = argparse.ArgumentParser(description="飆股雷達 MOPS Radar")
    ap.add_argument(
        "--dry-run", action="store_true", help="Telegram 走 dry-run，只印訊息不真的送出"
    )
    ap.add_argument("--otc", action="store_true", help="額外納入上櫃月營收")
    ap.add_argument("--top", type=int, default=TOP_N, help="終端機表格顯示筆數")
    ap.add_argument(
        "--out",
        default=None,
        help="輸出 JSON 路徑（預設 ./output/radar_YYYYMMDD.json）",
    )
    args = ap.parse_args()

    print("=" * 78)
    print(f"飆股雷達 MOPS Radar  |  {datetime.now():%Y-%m-%d %H:%M:%S}")
    print("=" * 78)

    # --- 抓資料（失敗即明確報錯，不塞假數據）---
    try:
        print("抓取上市月營收 ...", flush=True)
        revenue = fetch_revenue(URL_REV_TWSE, "上市")
        if args.otc:
            print("抓取上櫃月營收 ...", flush=True)
            revenue.update(fetch_revenue(URL_REV_OTC, "上櫃"))
        print("抓取估值資料 (本益比/殖利率/PB) ...", flush=True)
        valuation = fetch_valuation()
    except Exception as e:
        print(f"\n[錯誤] 抓取 TWSE 資料失敗：{e}", file=sys.stderr)
        print("不產生任何結果（拒絕塞假數據）。", file=sys.stderr)
        sys.exit(1)

    print(f"  月營收 {len(revenue)} 檔 / 估值 {len(valuation)} 檔")

    # --- 篩選 ---
    picks = screen(revenue, valuation)
    ym = (
        picks[0]["ym"]
        if picks
        else (next(iter(revenue.values()))["ym"] if revenue else "")
    )

    print(f"\n>>> 今日值得注意標的（共 {len(picks)} 檔）<<<\n")
    print_table(picks, args.top)

    # --- 寫 JSON ---
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(out_dir, exist_ok=True)
    out_path = args.out or os.path.join(out_dir, f"radar_{datetime.now():%Y%m%d}.json")
    payload = {
        "generated_at": datetime.now().isoformat(),
        "data_year_month": ym,
        "thresholds": {
            "min_dividend_yield": MIN_DIVIDEND_YIELD,
            "max_pb_ratio": MAX_PB_RATIO,
            "min_revenue_yoy": MIN_REVENUE_YOY,
            "min_revenue_mom": MIN_REVENUE_MOM,
        },
        "count": len(picks),
        "picks": picks,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\n已寫入 JSON：{out_path}")

    # --- Telegram ---
    msg = build_telegram_message(picks, ym)
    send_telegram(msg, args.dry_run)


if __name__ == "__main__":
    main()

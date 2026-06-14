#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 投資資訊站 — 資料抓取 / 指標計算 / 入庫
======================================================
從 TWSE OpenAPI 抓三支已驗證端點，清洗 → 算自訂指標 → 寫 SQLite(station.db) + data.json。

資料來源（皆 HTTP 200 驗證可用）：
  1. 公司基本資料   t187ap03_L     公司代號/簡稱/產業別/住址 ...
  2. 上市月營收     t187ap05_L     當月/上月/去年同月營收 ...
  3. 本益比/殖利率/PB BWIBBU_ALL    Code/Name/PEratio/DividendYield/PBratio

誠實聲明：影片提到的「籌碼資料」（董監事持股變化、CB 可轉債轉換）
TWSE OpenAPI 無公開端點，本工具不抓、也不造假 → 於 DB/JSON/UI 標「待接源」。
"""
import json
import sqlite3
import sys
import os
from datetime import datetime, timezone

try:
    import requests

    HAVE_REQUESTS = True
except ImportError:
    HAVE_REQUESTS = False
    import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "station.db")
JSON_PATH = os.path.join(HERE, "data.json")

ENDPOINTS = {
    "basic": "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
    "revenue": "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
    "value": "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL",
    # 董監事/內部人持股 + 設質：每位內部人一列，需依公司代號彙總
    "insider": "https://openapi.twse.com.tw/v1/opendata/t187ap11_L",
}

# CB 可轉債：TWSE 無純公開端點（TWT53U 含 ETF 等一般證券，非乾淨 CB 源）→ 維持 N/A，不造假
PENDING_FIELDS = ["cb_conversion"]


# ---------------------------------------------------------------- 抓取 ----
def fetch_json(url, timeout=30):
    """抓 TWSE JSON。失敗明確報錯（拋例外，不靜默吞）。"""
    if HAVE_REQUESTS:
        r = requests.get(
            url, timeout=timeout, headers={"User-Agent": "invest-station/1.0"}
        )
        r.raise_for_status()
        data = r.json()
    else:
        req = urllib.request.Request(url, headers={"User-Agent": "invest-station/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status} from {url}")
            data = json.loads(resp.read().decode("utf-8"))
    if not isinstance(data, list) or not data:
        raise RuntimeError(f"非預期回傳（空或非陣列）: {url}")
    return data


# ------------------------------------------------------------ 數字清洗 ----
def to_float(raw):
    """robust：空字串/None/逗號/全形空白/'-' → None；否則 float。"""
    if raw is None:
        return None
    s = (
        str(raw)
        .strip()
        .replace(",", "")
        .replace("　", "")
        .replace("%", "")
        .replace(" ", "")
    )
    if s in ("", "-", "－", "N/A", "NA", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(raw):
    f = to_float(raw)
    return int(f) if f is not None else None


def pct(numer, denom):
    """成長率% = (numer-denom)/denom*100，分母無效或 0 → None。"""
    if numer is None or denom is None or denom == 0:
        return None
    return round((numer - denom) / abs(denom) * 100, 2)


def aggregate_insiders(rows):
    """
    t187ap11_L 每位內部人一列 → 依公司代號彙總成每檔一列。
    回傳 {code: {"total_shares": int|None, "pledge_ratio": float|None}}。
      total_shares = 全公司內部人「目前持股」加總
      pledge_ratio = 全公司「設質股數」加總 / 「目前持股」加總 ×100；分母 0/缺 → None
    欄名注意全形空格（如 '選任時持股 '）；本表用到的鍵名無尾隨空白，仍以 get() robust 讀取。
    """
    agg = {}
    for r in rows:
        code = str(r.get("公司代號", "")).strip()
        if not code:
            continue
        hold = to_int(r.get("目前持股"))
        pledge = to_int(r.get("設質股數"))
        a = agg.setdefault(code, {"hold_sum": 0, "pledge_sum": 0, "has_data": False})
        if hold is not None:
            a["hold_sum"] += hold
            a["has_data"] = True
        if pledge is not None:
            a["pledge_sum"] += pledge

    out = {}
    for code, a in agg.items():
        if not a["has_data"]:
            out[code] = {"total_shares": None, "pledge_ratio": None}
            continue
        hs = a["hold_sum"]
        ratio = round(a["pledge_sum"] / hs * 100, 2) if hs > 0 else None
        out[code] = {"total_shares": hs, "pledge_ratio": ratio}
    return out


# ------------------------------------------------------------ 自訂指標 ----
def value_score(dividend_yield, pb):
    """
    殖利率/PB 性價比分數：殖利率越高、PB 越低越好。
    分數 = 殖利率(%) / PB。PB 無效或<=0 → None。
    直覺：高殖利率 + 低淨值比 = 便宜又會配息。
    """
    if dividend_yield is None or pb is None or pb <= 0:
        return None
    return round(dividend_yield / pb, 2)


def cheap_flag(dividend_yield, pb):
    """便宜度標記：低 PB(<1.5) 且 高殖利率(>=5%) → True。資料缺 → False。"""
    if dividend_yield is None or pb is None:
        return False
    return pb < 1.5 and dividend_yield >= 5.0


def growth_flag(mom, yoy):
    """營收成長標記：MoM% 與 YoY% 皆 > 0 → True。"""
    if mom is None or yoy is None:
        return False
    return mom > 0 and yoy > 0


# ------------------------------------------------------------ DB schema --
def init_db(conn):
    conn.execute("DROP TABLE IF EXISTS stocks")
    conn.execute(
        """
        CREATE TABLE stocks (
            code            TEXT PRIMARY KEY,
            name            TEXT,
            industry        TEXT,
            address         TEXT,
            chairman        TEXT,
            -- 估值（BWIBBU）
            pe_ratio        REAL,
            dividend_yield  REAL,
            pb_ratio        REAL,
            value_date      TEXT,
            -- 月營收（t187ap05_L）
            rev_month       TEXT,
            rev_current     INTEGER,
            rev_last_month  INTEGER,
            rev_last_year   INTEGER,
            rev_mom_pct     REAL,
            rev_yoy_pct     REAL,
            -- 董監/內部人持股 + 設質（t187ap11_L，依公司彙總）
            insider_total_shares  INTEGER,
            insider_pledge_ratio  REAL,
            director_holding_change TEXT,  -- 狀態標記：已接 t187ap11_L（資料見 insider_* 欄）
            -- CB 可轉債：無純公開端點 → 待接源（永遠 NULL，不造假）
            cb_conversion           TEXT,
            -- 自訂指標
            value_score     REAL,
            is_cheap        INTEGER,
            is_growing      INTEGER,
            is_high_pledge  INTEGER,
            updated_at      TEXT
        )
    """
    )
    conn.commit()


# ------------------------------------------------------------ 主流程 -----
def main():
    print("=" * 60)
    print("AI 投資資訊站 — TWSE OpenAPI ingest")
    print("requests:", "可用" if HAVE_REQUESTS else "未安裝 → 改用 urllib")
    print("=" * 60)

    raw = {}
    for key, url in ENDPOINTS.items():
        print(f"[抓取] {key:8s} {url}")
        try:
            raw[key] = fetch_json(url)
            print(f"        → {len(raw[key])} 筆")
        except Exception as e:
            print(f"  !! 失敗: {e}", file=sys.stderr)
            sys.exit(1)

    # 以「基本資料」為主鍵集合，join 估值與營收
    basic_by_code = {}
    for row in raw["basic"]:
        code = str(row.get("公司代號", "")).strip()
        if not code:
            continue
        basic_by_code[code] = row

    value_by_code = {str(r.get("Code", "")).strip(): r for r in raw["value"]}
    revenue_by_code = {str(r.get("公司代號", "")).strip(): r for r in raw["revenue"]}
    insider_by_code = aggregate_insiders(raw["insider"])  # 27391 列 → 依公司彙總

    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
    rows = []
    for code, b in basic_by_code.items():
        v = value_by_code.get(code, {})
        rv = revenue_by_code.get(code, {})

        pe = to_float(v.get("PEratio"))
        dy = to_float(v.get("DividendYield"))
        pb = to_float(v.get("PBratio"))

        rev_cur = to_int(rv.get("營業收入-當月營收"))
        rev_lm = to_int(rv.get("營業收入-上月營收"))
        rev_ly = to_int(rv.get("營業收入-去年當月營收"))
        # TWSE 自帶成長率欄位，但缺漏多 → 自算（更 robust），缺資料才退回官方
        mom = pct(rev_cur, rev_lm)
        if mom is None:
            mom = to_float(rv.get("營業收入-上月比較增減(%)"))
            mom = round(mom, 2) if mom is not None else None
        yoy = pct(rev_cur, rev_ly)
        if yoy is None:
            yoy = to_float(rv.get("營業收入-去年同月增減(%)"))
            yoy = round(yoy, 2) if yoy is not None else None

        vs = value_score(dy, pb)
        cheap = cheap_flag(dy, pb)
        grow = growth_flag(mom, yoy)

        ins = insider_by_code.get(code, {})
        insider_total = ins.get("total_shares")
        pledge_ratio = ins.get("pledge_ratio")
        # 設質比例 >30% = 籌碼風險警示
        high_pledge = pledge_ratio is not None and pledge_ratio > 30
        # 董監持股狀態：有彙總到資料就標「已接」，否則該檔無內部人資料
        dhc_status = "已接 t187ap11_L" if insider_total is not None else None

        name = (
            str(v.get("Name", "")).strip()
            or str(rv.get("公司名稱", "")).strip()
            or str(b.get("公司簡稱", "")).strip()
        )

        rows.append(
            {
                "code": code,
                "name": name,
                "industry": (
                    str(rv.get("產業別", "")).strip()
                    or str(b.get("產業別", "")).strip()
                    or None
                ),
                "address": str(b.get("住址", "")).strip() or None,
                "chairman": str(b.get("董事長", "")).strip() or None,
                "pe_ratio": pe,
                "dividend_yield": dy,
                "pb_ratio": pb,
                "value_date": str(v.get("Date", "")).strip() or None,
                "rev_month": str(rv.get("資料年月", "")).strip() or None,
                "rev_current": rev_cur,
                "rev_last_month": rev_lm,
                "rev_last_year": rev_ly,
                "rev_mom_pct": mom,
                "rev_yoy_pct": yoy,
                # 董監/內部人持股 + 設質（已接 t187ap11_L）
                "insider_total_shares": insider_total,
                "insider_pledge_ratio": pledge_ratio,
                "director_holding_change": dhc_status,
                # CB 可轉債：無純公開端點 → 待接源，不造假
                "cb_conversion": None,
                "value_score": vs,
                "is_cheap": 1 if cheap else 0,
                "is_growing": 1 if grow else 0,
                "is_high_pledge": 1 if high_pledge else 0,
                "updated_at": now,
            }
        )

    # 排序：性價比分數高的在前（None 殿後），方便前端預設
    rows.sort(key=lambda r: (r["value_score"] is None, -(r["value_score"] or 0)))

    # --- 寫 SQLite ---
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)
    cols = list(rows[0].keys())
    placeholders = ",".join("?" * len(cols))
    conn.executemany(
        f"INSERT INTO stocks ({','.join(cols)}) VALUES ({placeholders})",
        [tuple(r[c] for c in cols) for r in rows],
    )
    conn.commit()
    db_count = conn.execute("SELECT COUNT(*) FROM stocks").fetchone()[0]
    conn.close()

    # --- 寫 data.json（給靜態前端）---
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    # --- 統計 ---
    n_value = sum(1 for r in rows if r["pb_ratio"] is not None)
    n_rev = sum(1 for r in rows if r["rev_current"] is not None)
    n_cheap = sum(r["is_cheap"] for r in rows)
    n_grow = sum(r["is_growing"] for r in rows)
    n_insider = sum(1 for r in rows if r["insider_total_shares"] is not None)
    n_pledge = sum(1 for r in rows if r["insider_pledge_ratio"] is not None)
    n_high_pledge = sum(r["is_high_pledge"] for r in rows)

    print("-" * 60)
    print(f"基本資料抓取:   {len(basic_by_code)} 檔")
    print(f"有估值(PB)資料: {n_value} 檔")
    print(f"有月營收資料:   {n_rev} 檔")
    print(f"董監/內部人持股: 原始 {len(raw['insider'])} 列 → 彙總 {n_insider} 檔有資料")
    print(f"有設質比例資料: {n_pledge} 檔（高設質>30% 警示: {n_high_pledge} 檔）")
    print(f"便宜標的(低PB+高殖利率): {n_cheap} 檔")
    print(f"營收雙成長標的: {n_grow} 檔")
    print(f"寫入 SQLite:    {DB_PATH}  → {db_count} 列")
    print(f"寫入 data.json: {JSON_PATH}  → {len(rows)} 列")
    print(
        f"董監持股: ✅ 已接 TWSE t187ap11_L（insider_total_shares / insider_pledge_ratio）"
    )
    print(f"待接源欄位(不造假): {', '.join(PENDING_FIELDS)} = N/A（CB 無純公開源）")
    print("完成。")


if __name__ == "__main__":
    main()

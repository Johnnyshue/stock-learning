"""抓 yfinance 真實 K 線資料 → 寫成網頁要用的 JSON。

支援的代號（會抓全部）：
  - 台股：0050.TW、2330.TW、0056.TW、006208.TW
  - 美股：SPY、VOO、VTI、QQQ、AAPL、NVDA

輸出格式（Lightweight Charts 期待的格式）：
  data/<symbol>.json = [{time, open, high, low, close, volume, sma20, sma60, rsi, macd, signal, hist, bb_up, bb_low}, ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import yfinance as yf


SYMBOLS = {
    # 台股
    "0050.TW": "元大台灣50",
    "2330.TW": "台積電",
    "0056.TW": "元大高股息",
    "006208.TW": "富邦台50",
    "00878.TW": "國泰永續高股息",
    # 美股
    "SPY": "S&P 500 ETF",
    "VOO": "Vanguard S&P 500",
    "VTI": "Vanguard 美國全市場",
    "QQQ": "NASDAQ 100",
    "AAPL": "Apple",
    "NVDA": "NVIDIA",
}

OUT_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def calc_sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(window=n).mean()


def calc_ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def calc_rsi(s: pd.Series, n: int = 14) -> pd.Series:
    delta = s.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=n, min_periods=n).mean()
    avg_loss = loss.rolling(window=n, min_periods=n).mean()
    for i in range(n, len(s)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (n - 1) + gain.iloc[i]) / n
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (n - 1) + loss.iloc[i]) / n
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def calc_macd(s: pd.Series, fast: int = 12, slow: int = 26, sig: int = 9):
    ema_fast = calc_ema(s, fast)
    ema_slow = calc_ema(s, slow)
    macd = ema_fast - ema_slow
    signal = calc_ema(macd, sig)
    hist = macd - signal
    return macd, signal, hist


def calc_bb(s: pd.Series, n: int = 20, k: float = 2.0):
    mid = calc_sma(s, n)
    std = s.rolling(window=n).std()
    return mid + k * std, mid, mid - k * std


def fetch_one(symbol: str, period: str = "2y") -> dict:
    print(f"  → {symbol} ({period}) ...", end=" ", flush=True)
    df = yf.Ticker(symbol).history(period=period, interval="1d")
    if df.empty:
        print("EMPTY")
        return None

    close = df["Close"]
    df["SMA20"] = calc_sma(close, 20)
    df["SMA60"] = calc_sma(close, 60)
    df["SMA240"] = calc_sma(close, 240)
    df["RSI"] = calc_rsi(close, 14)
    macd, sig, hist = calc_macd(close)
    df["MACD"] = macd
    df["Signal"] = sig
    df["Hist"] = hist
    bb_up, bb_mid, bb_lo = calc_bb(close)
    df["BB_Up"] = bb_up
    df["BB_Mid"] = bb_mid
    df["BB_Low"] = bb_lo

    candles = []
    for ts, row in df.iterrows():
        d = ts.strftime("%Y-%m-%d")
        rec = {
            "time": d,
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
        }
        for col in [
            "SMA20",
            "SMA60",
            "SMA240",
            "RSI",
            "MACD",
            "Signal",
            "Hist",
            "BB_Up",
            "BB_Low",
        ]:
            v = row[col]
            rec[col.lower()] = None if pd.isna(v) else round(float(v), 4)
        candles.append(rec)

    print(f"{len(candles)} bars")
    return {"symbol": symbol, "name": SYMBOLS.get(symbol, symbol), "bars": candles}


def main(symbols=None):
    target = symbols or list(SYMBOLS.keys())
    print(f"📊 抓 {len(target)} 檔，2 年日線：")
    summary = {}
    for sym in target:
        try:
            data = fetch_one(sym)
            if data is None:
                continue
            out_path = OUT_DIR / f"{sym.replace('.', '_')}.json"
            out_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            summary[sym] = {
                "name": data["name"],
                "file": out_path.name,
                "bars": len(data["bars"]),
                "last_close": data["bars"][-1]["close"],
                "last_date": data["bars"][-1]["time"],
            }
        except Exception as e:
            print(f"  ✗ {sym}: {e}")

    (OUT_DIR / "_index.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n✅ 寫入 {OUT_DIR}/")
    print(f"   index: {OUT_DIR}/_index.json ({len(summary)} 檔)")


if __name__ == "__main__":
    args = sys.argv[1:] or None
    main(args)

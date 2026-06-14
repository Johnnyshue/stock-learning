#!/usr/bin/env python3
"""
Phase 1 回測：影片 Level 2「抄底策略」 vs 單純買進持有

忠實重現影片規則：每天比昨收，跌 1% 買 1 股、2% 買 2 股、3% 買 3 股、
≥5% 買 4 股（封頂 4），一天只進場一次、只進不出（基礎版，不含移動停損）。

對照組：買進持有（第一天全部投入）。

兩者同起始資金，最終淨值 = 現金 + 持股市值。純 stdlib，無第三方相依。

⚠️ 學習與驗證用途，非投資建議。
"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
# 跑這幾檔：台股大盤、美股大盤、科技、個股 → 看策略在不同標的的表現
SYMBOLS = ["0050_TW", "SPY", "QQQ", "NVDA", "2330_TW", "AAPL"]


def load_bars(sym):
    path = os.path.join(DATA_DIR, f"{sym}.json")
    if not os.path.exists(path):
        return None, None
    d = json.load(open(path))
    return d.get("name", sym), d["bars"]


def dip_shares(drop_pct):
    """影片規則：跌幅(正數%)→買幾股。跌<1% 不買；≥5% 封頂 4 股。"""
    if drop_pct >= 5:
        return 4
    if drop_pct >= 1:
        return min(int(drop_pct), 3)  # 1%→1, 2%→2, 3%/4%→3
    return 0


def max_drawdown(equity):
    """最大回撤 %（峰到谷）。"""
    peak = equity[0]
    mdd = 0.0
    for v in equity:
        peak = max(peak, v)
        mdd = min(mdd, (v - peak) / peak)
    return mdd * 100


def run(bars, start_cash):
    closes = [b["close"] for b in bars]
    p0, pN = closes[0], closes[-1]

    # --- 策略 A：買進持有（第一天全投入）---
    hold_shares = int(start_cash // p0)
    hold_cash = start_cash - hold_shares * p0
    hold_equity = [hold_cash + hold_shares * c for c in closes]
    hold_expo = [hold_shares * c / (hold_cash + hold_shares * c) for c in closes]

    # --- 策略 B：抄底（影片 Level 2 基礎版）---
    cash = start_cash
    shares = 0
    invested = 0.0  # 累計實際投入金額
    buy_days = 0
    dip_equity = [start_cash]
    dip_expo = [0.0]
    for i in range(1, len(closes)):
        prev, cur = closes[i - 1], closes[i]
        drop = (prev - cur) / prev * 100  # 正數 = 下跌
        n = dip_shares(drop)
        if n > 0:
            affordable = int(cash // cur)
            n = min(n, affordable)
            if n > 0:
                cost = n * cur
                cash -= cost
                shares += n
                invested += cost
                buy_days += 1
        eq = cash + shares * cur
        dip_equity.append(eq)
        dip_expo.append(shares * cur / eq)

    return {
        "hold": {
            "final": hold_equity[-1],
            "ret": (hold_equity[-1] / start_cash - 1) * 100,
            "mdd": max_drawdown(hold_equity),
            "avg_expo": sum(hold_expo) / len(hold_expo) * 100,
        },
        "dip": {
            "final": dip_equity[-1],
            "ret": (dip_equity[-1] / start_cash - 1) * 100,
            "mdd": max_drawdown(dip_equity),
            "deployed_pct": invested / start_cash * 100,
            "avg_expo": sum(dip_expo) / len(dip_expo) * 100,  # 平均在市時間
            "buy_days": buy_days,
            "shares": shares,
        },
        "underlying_ret": (pN / p0 - 1) * 100,
        "n_days": len(closes),
    }


def main():
    rows = []
    for sym in SYMBOLS:
        name, bars = load_bars(sym)
        if bars is None:
            print(f"⚠️ 跳過 {sym}：找不到資料")
            continue
        start_cash = (
            bars[0]["close"] * 100
        )  # 起始資金 = 首日收盤 × 100（讓買進持有充分投入）
        r = run(bars, start_cash)
        rows.append((sym, name, r))

    # 表格輸出
    print(f"\n{'='*92}")
    print("Phase 1 回測：抄底策略 vs 買進持有（2 年日線）")
    print(f"{'='*92}")
    hdr = f"{'標的':<10}{'標的漲跌':>9}{'買進持有':>10}{'抄底':>9}{'抄底投入':>9}{'抄底平均在市':>11}{'勝者':>8}"
    print(hdr)
    print("-" * 92)
    hold_wins = 0
    for sym, name, r in rows:
        h, d = r["hold"], r["dip"]
        winner = "買進持有" if h["ret"] > d["ret"] else "抄底"
        if h["ret"] > d["ret"]:
            hold_wins += 1
        print(
            f"{sym:<11}{r['underlying_ret']:>+8.1f}%{h['ret']:>+9.1f}%"
            f"{d['ret']:>+8.1f}%{d['deployed_pct']:>8.0f}%{d['avg_expo']:>10.0f}%{winner:>9}"
        )
    print("-" * 92)
    print(f"買進持有勝出：{hold_wins}/{len(rows)} 檔（買進持有平均在市 ~100%）")
    print(
        "\n關鍵觀察（修正版）：抄底「投入%」其實高達 81-100%——錢最後幾乎都投進去了，"
        "\n但「平均在市時間」明顯低於買進持有。真正原因不是『沒投入』，是『太慢投入』："
        "\n影片抄底本質 = 只在下跌日進場的『漸進式 DCA』。過去 2 年是多頭，漸進進場"
        "\n→ 平均在市時間低 → 必然跑輸第一天就全額投入的買進持有（lump-sum vs DCA 效應）。"
        "\n⚠️ 窗口偏誤：此資料近 2 年多為多頭。若遇橫盤/崩盤，留現金的漸進策略未必輸。"
    )

    # 存 JSON 結果供報告引用
    out = os.path.join(os.path.dirname(__file__), "results.json")
    json.dump(
        [{"sym": s, "name": n, **r} for s, n, r in rows],
        open(out, "w"),
        ensure_ascii=False,
        indent=2,
    )
    print(f"\n結果已存：{out}")


if __name__ == "__main__":
    main()

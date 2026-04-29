"""把 664 行的股票學習指南切成 12 個 markdown 章節（Ch0-Ch10 + 附錄）。

來源：~/Documents/Claude/Projects/STOCK/Best PGY/Investing/00_股票市場完全學習指南.md
輸出：content/ch00.md, ch01.md, ..., ch10.md, ch_appendix.md
順便產生 content/manifest.json（前端讀來建側邊欄）
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = (
    Path.home()
    / "Documents/Claude/Projects/STOCK/Best PGY/Investing/00_股票市場完全學習指南.md"
)
OUT_DIR = ROOT / "content"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 章節定義：(順序, 檔名, 顯示標題, 對應原檔的 H2 開頭)
CHAPTERS = [
    ("10", "ch10_doctor.md", "Ch10 醫師專屬投資策略", "## Ch10 "),
    ("00", "ch00_mindset.md", "Ch0 投資前的心態建設", "## Ch0 "),
    ("01", "ch01_basics.md", "Ch1 金融市場基礎知識", "## Ch1 "),
    ("02", "ch02_tw_stock.md", "Ch2 台股入門", "## Ch2 "),
    ("03", "ch03_account.md", "Ch3 開戶與第一筆交易", "## Ch3 "),
    ("04", "ch04_us_stock.md", "Ch4 美股與全球市場", "## Ch4 "),
    ("05", "ch05_etf.md", "Ch5 ETF 完全攻略", "## Ch5 "),
    ("06", "ch06_passive.md", "Ch6 被動投資與定期定額", "## Ch6 "),
    ("07", "ch07_fundamental.md", "Ch7 基本面分析——主動選股", "## Ch7 "),
    ("08", "ch08_technical.md", "Ch8 技術分析入門（K 線・MA・RSI・MACD）", "## Ch8 "),
    ("09", "ch09_allocation.md", "Ch9 資產配置與投資組合", "## Ch9 "),
    ("99", "ch_appendix.md", "附錄 推薦學習資源", "## 附錄"),
]


def main():
    text = SRC.read_text(encoding="utf-8")
    lines = text.split("\n")

    # 找每個章節的起始行
    starts = []
    for i, line in enumerate(lines):
        for order, fname, title, marker in CHAPTERS:
            if line.startswith(marker):
                starts.append((i, order, fname, title))
                break

    starts.sort()
    print(f"找到 {len(starts)} 個章節分界")

    manifest = {"chapters": []}

    for idx, (start, order, fname, title) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        body = "\n".join(lines[start:end]).strip()
        # 移除尾端的 --- 分隔線（避免章節內混進下一章 anchor）
        body = re.sub(r"\n*---\s*$", "", body)
        # 在最前面加 frontmatter 風格的 metadata
        front = f"<!-- order: {order} | title: {title} -->\n\n"
        out_path = OUT_DIR / fname
        out_path.write_text(front + body + "\n", encoding="utf-8")
        manifest["chapters"].append({"order": order, "file": fname, "title": title})
        print(f"  ✓ {fname} ({end - start} 行)")

    # 加上 K 線互動 demo 章節（自製）
    kline_path = OUT_DIR / "ch08b_kline_interactive.md"
    if not kline_path.exists():
        kline_path.write_text(
            """<!-- order: 08b | title: Ch8.5 互動 K 線實戰 -->

## Ch8.5 互動 K 線實戰

> **這是你 click「看懂股票」的核心章節**。下面是真實的台股/美股歷史 K 線，你可以切換標的、切換指標。
> 點 **打開 K 線實驗室** 進入完整互動版。

<div style="margin: 2em 0;">
  <a href="#kline-lab" class="lab-link" data-route="lab">🔬 打開 K 線實驗室 →</a>
</div>

### 看 K 線的 5 個重點

1. **紅 K = 收盤 > 開盤（上漲）；綠 K = 收盤 < 開盤（下跌）**
   ⚠️ 注意：**台灣紅綠定義跟美國相反**！美股是 Green = up / Red = down。
2. **實體越長 = 動能越強**；長紅 = 強買盤、長綠 = 強賣壓。
3. **影線（鬚鬚）代表盤中試探**：上影線長 = 衝高被打下來、下影線長 = 探底被拉回。
4. **量價配合**：價漲量增 = 健康；價漲量縮 = 乏力可能反轉。
5. **單根 K 不準，要看「組合」**：晨星、夜星、吞噬、十字線……

### 5 個一定要會看的型態

| 型態 | 圖形 | 意義 |
|---|---|---|
| 大紅 K | █ 整根紅、影線短 | 強買盤湧入 |
| 大綠 K | █ 整根綠、影線短 | 強賣壓出貨 |
| 十字線 | ┼ 開盤=收盤 | 多空拉鋸，常見轉折前兆 |
| 鎚子（hammer） | T 下影線長、實體小 | 探底被拉回，**底部反轉**訊號 |
| 流星（shooting star） | ⊥ 上影線長、實體小 | 衝高被打下，**頭部反轉**訊號 |

### 三條線你必須認識

- **紅線 = 通常是 5 日均線（5MA）** → 短期動能
- **黃線 = 通常是 20 日均線（20MA / 月線）** → 中期方向
- **綠線 = 通常是 60 日均線（60MA / 季線）** → 長期趨勢

> ⚠️ 不同看盤軟體顏色不一樣！國泰、富邦、永豐、TradingView 都不同。**看圖看「線的位置」不要看顏色就猜**。

### 黃金交叉 vs 死亡交叉

- 短線（5MA）由下往上穿過長線（20MA）→ **黃金交叉**，多頭訊號
- 短線由上往下跌破長線 → **死亡交叉**，空頭訊號

但要注意：**任何訊號都會騙人**。震盪盤裡黃金/死亡交叉一天到晚出現，全部進場會被巴。
""",
            encoding="utf-8",
        )
        # 把 ch08b 排到 ch08 後面
        ch08_idx = next(
            i for i, c in enumerate(manifest["chapters"]) if c["order"] == "08"
        )
        manifest["chapters"].insert(
            ch08_idx + 1,
            {
                "order": "08b",
                "file": "ch08b_kline_interactive.md",
                "title": "Ch8.5 互動 K 線實戰",
            },
        )
        print(f"  ✓ ch08b_kline_interactive.md (互動章節)")

    # 寫 manifest
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n✅ {len(manifest['chapters'])} 章 → {OUT_DIR}/")


if __name__ == "__main__":
    main()

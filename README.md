# 📈 股票學習筆記（個人用）

個人股票自學網站。從 0 開始學會看 K 線、選 ETF、做資產配置。
僅供個人學習用，請勿散佈。

## 看法

```bash
cd ~/claude_projects/股票/
python3 -m http.server 8765
open http://localhost:8765
```

## 結構

```
股票/
├── index.html              ← 主頁（SPA）
├── update.sh               ← 一鍵更新（抓股價 + 重切章節 + 重爬 RSS）
├── content/                ← 13 章 markdown（Ch0-Ch10 + Ch8.5 互動 + 附錄）
│   └── manifest.json       ← 章節清單（決定側邊欄順序）
├── data/                   ← 11 檔股票的真實 K 線 JSON（2 年日線）
│   └── _index.json
├── extra/                  ← 爬蟲產出（綠角 blog + Yahoo 財經新聞）
│   └── manifest.json
├── assets/
│   ├── style.css
│   └── app.js              ← SPA 路由 + Lightweight Charts 整合
└── scripts/
    ├── fetch_data.py       ← yfinance 抓 K 線、算 SMA/RSI/MACD/BB
    ├── split_guide.py      ← 切學習指南成章節
    └── scrape_extras.py    ← 爬綠角/Yahoo RSS
```

## 更新

```bash
./update.sh           # 全部
./update.sh stock     # 只更新股價
./update.sh guide     # 只重切章節
./update.sh extras    # 只重爬 RSS
```

## 新增筆記

直接在 `extra/` 放 markdown 檔，再執行 `python scripts/scrape_extras.py` 重建 manifest。
或編輯 `content/` 下任一 `chXX_*.md`，重整就會載入新內容（不需要 build）。

## 包含的股票

| 代號 | 名稱 | 用途 |
|---|---|---|
| 0050.TW | 元大台灣50 | 台股大盤代表 |
| 2330.TW | 台積電 | 台股龍頭 |
| 0056.TW | 元大高股息 | 高股息 ETF |
| 006208.TW | 富邦台50 | 0050 替代 |
| 00878.TW | 國泰永續高股息 | 月配息 |
| SPY / VOO | S&P 500 | 美國大盤 |
| VTI | 美國全市場 | 全美股 |
| QQQ | NASDAQ 100 | 美國科技 |
| AAPL / NVDA | 個股 | 美股龍頭 |

## 互動 K 線實驗室

- **顏色規則**：台股紅漲綠跌、美股相反（自動切換）
- **可切換**：標的、時間區間（3 月 / 6 月 / 1 年 / 全部）
- **可開關**：5MA / 20MA / 240MA / 布林通道 / RSI / MACD
- **同步**：主圖 + RSI + MACD 三圖時間軸連動

## 資料來源

- 歷史 K 線：[yfinance](https://github.com/ranaroussi/yfinance)（Yahoo Finance 公開資料）
- 學習指南：個人整理（原檔在 `~/Documents/Claude/Projects/STOCK/Best PGY/Investing/`）
- 技術指標：自算（pandas）
- RSS：綠角財經筆記 + Yahoo 奇摩股市 + Yahoo Finance

## 免責

僅供個人學習，不構成任何投資建議。

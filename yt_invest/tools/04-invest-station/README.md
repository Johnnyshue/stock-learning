# AI 投資資訊站（04-invest-station）

複製一支投資 YouTube 影片的工具理念：**自建資料庫 + 自訂指標 + 網頁 dashboard**，
整合即時月營收 / 財報估值，快速判斷一家公司值不值得深入研究。

- 後端：`ingest.py` 抓 TWSE OpenAPI → 清洗 → 算指標 → 寫 `station.db`（SQLite）+ `data.json`
- 前端：`index.html` 純靜態 dashboard，`fetch('./data.json')`，無框架、無 CDN、可離線開
- 規模：約 1090 檔上市公司

---

## 怎麼跑

### 1. 抓資料 / 建庫
```bash
cd ~/claude_projects/股票/yt_invest/tools/04-invest-station
python3 ingest.py
```
會抓三支 TWSE 端點、建 `station.db`、寫 `data.json`，並印出抓了幾檔、寫入幾列。
需要 `requests`（沒有會自動退回標準庫 `urllib`）。

### 2. 開 dashboard
建議用本機 HTTP server（避免瀏覽器 `file://` 的 CORS 擋 `fetch`）：
```bash
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000/index.html
```
> 直接雙擊 `index.html` 多數情況可運作，但部分瀏覽器會擋本機 `fetch('./data.json')`，
> 此時改用上面的 http.server。

---

## Dashboard 功能
- 股票表格：代號 / 名稱 / 產業 / 本益比 / 殖利率 / PB / 性價比★ / 營收 MoM% / YoY%
- 搜尋：依代號或名稱即時過濾
- 排序：點任一欄位標題排序（再點一次反向；N/A 一律殿後）
- 高亮：便宜標的（左側綠條 + 「便宜」標籤）、營收雙成長（綠字 + 「成長」標籤）
- 快速篩選 chip：只看便宜標的 / 只看營收雙成長
- 繁中介面、手機友善 RWD

---

## 資料來源（皆 HTTP 200 驗證可用）
| 用途 | 端點 |
|---|---|
| 公司基本資料（代號/簡稱/產業/住址/董事長） | `https://openapi.twse.com.tw/v1/opendata/t187ap03_L` |
| 上市月營收（當月/上月/去年同月） | `https://openapi.twse.com.tw/v1/opendata/t187ap05_L` |
| 本益比/殖利率/PB | `https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL` |

數字皆做 robust 清洗（空字串、逗號、全形空白、`-`/`－` → 視為缺值 None，不當 0）。

---

## 自訂指標（ingest 時算好存欄位）
| 欄位 | 定義 |
|---|---|
| `value_score` 性價比★ | 殖利率% ÷ PB；越高代表「便宜又會配息」。PB≤0 或缺值 → N/A |
| `rev_mom_pct` 月營收 MoM% | (當月−上月)/上月×100，自算；缺資料才退回 TWSE 官方欄位 |
| `rev_yoy_pct` 月營收 YoY% | (當月−去年同月)/去年同月×100，自算；缺資料才退回官方欄位 |
| `is_cheap` 便宜標記 | PB < 1.5 且 殖利率 ≥ 5% |
| `is_growing` 營收成長標記 | MoM% 與 YoY% 皆 > 0 |

---

## ⚠️ 待接資料源（誠實聲明，不造假）
影片提到的「籌碼資料」目前 **TWSE OpenAPI 無公開端點**，本工具**不抓、也不造假**，
DB / JSON / UI 一律標 `N/A`，待日後另接公開或付費資料源：

| 欄位 | 內容 | 狀態 |
|---|---|---|
| `director_holding_change` | 董監事持股變化 | 待接源（需另找公開 API 或付費源） |
| `cb_conversion` | CB 可轉換公司債轉換 | 待接源（需另找公開 API 或付費源） |

> 可能來源方向（未實作）：公開資訊觀測站（MOPS）內部人持股異動、可轉債相關公告，
> 多為 HTML 報表或需另行解析，非本工具當前 OpenAPI 範圍。

---

## 檔案
```
ingest.py     抓取 + 指標計算 + 入庫
index.html    純靜態 dashboard
station.db    SQLite（執行 ingest 後產生）
data.json     前端用資料（執行 ingest 後產生）
README.md     本檔
```

## DB schema（stocks 表）
主鍵 `code`。欄位含基本資料、估值（pe/dividend_yield/pb）、月營收（rev_*）、
自訂指標（value_score/is_cheap/is_growing），及兩個永遠為 NULL 的待接源欄位。

> 僅供研究參考，非投資建議。

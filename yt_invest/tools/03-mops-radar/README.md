# 飆股雷達 MOPS Radar

抓台股公開資料 → 算指標篩選 → 早上滑手機看名單。複製自一支投資 YouTube 影片的概念：監控公開資訊（月營收 + 估值）、算動能、推 Telegram，「我睡覺，AI 工作」。

## 它做什麼

1. 從 **TWSE OpenAPI** 抓真實資料：
   - 上市月營收 `t187ap05_L`（可選上櫃 `t187ap05_P`）
   - 本益比 / 殖利率 / PB `BWIBBU_ALL`
2. 算指標：月營收 **MoM%**、**YoY%**（用 TWSE 提供的去年當月營收欄位）
3. 篩選（門檻可調，見下）：殖利率 > 門檻 **且** PB < 門檻 **且** 月營收 YoY 轉強 **且** MoM 不衰退 → 產出「今日值得注意標的」清單，依 YoY 排序
4. 輸出三路：(a) 終端機表格 (b) 寫 `output/radar_YYYYMMDD.json` (c) 推 Telegram（沒設 token 自動 dry-run，只印不送）

> 資料一律取自 TWSE API 真實回傳；API 失敗會明確報錯並 `exit 1`，**不會塞假數據**。
> 僅供參考，非投資建議。

## 安裝

只需 Python 3。優先用 `requests`，沒裝會自動退回標準庫 `urllib`（不會硬裝套件）。

```bash
# （可選）裝 requests，沒有也能跑
python3 -m pip install requests
```

## 跑

```bash
cd ~/claude_projects/股票/yt_invest/tools/03-mops-radar

python3 radar.py --dry-run     # 抓真資料、篩選、印表格、印 Telegram 訊息但不送
python3 radar.py               # 同上，但若有設 token 則真的推送
python3 radar.py --otc         # 額外納入上櫃月營收
python3 radar.py --top 30      # 表格最多顯示 30 筆
python3 radar.py --out /tmp/x.json   # 自訂 JSON 輸出路徑
```

## 設定 Telegram（要真的推送才需要）

1. 在 Telegram 找 **@BotFather** → `/newbot` → 取得 **bot token**。
2. 把你的 bot 加進對話，傳一則訊息給它；然後開
   `https://api.telegram.org/bot<TOKEN>/getUpdates`，從回傳找你的 **chat id**。
3. 設環境變數後再跑（不加 `--dry-run`）：

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC-yourtoken"
export TELEGRAM_CHAT_ID="123456789"
python3 radar.py
```

沒設這兩個變數（或加了 `--dry-run`）→ 自動走 dry-run，把訊息印到終端機，**不會謊報「已送出」**。

## 調整篩選門檻

打開 `radar.py` 最上方 `CONFIG` 區塊，改常數即可：

```python
MIN_DIVIDEND_YIELD = 4.0    # 殖利率 > 此值 (%)
MAX_PB_RATIO       = 2.0    # 股價淨值比 < 此值
MIN_REVENUE_YOY    = 10.0   # 月營收 YoY% > 此值（轉強門檻）
MIN_REVENUE_MOM    = 0.0    # 月營收 MoM% > 此值（預設僅要求不衰退）
TOP_N              = 20     # 終端機表格預設顯示筆數
```

門檻越寬名單越長；想抓「爆發成長」可把 `MIN_REVENUE_YOY` 拉到 50 或 100。

## 每天早上自動跑（macOS launchd）

範本：`com.johnny.mops-radar.plist`（每天 08:00 觸發）。

1. 先查路徑：
   ```bash
   which python3                                    # → PythonExecutable
   echo ~/claude_projects/股票/yt_invest/tools/03-mops-radar/radar.py   # → RadarScriptPath
   ```
2. 複製範本並替換 placeholder：
   ```bash
   RADAR_DIR=~/claude_projects/股票/yt_invest/tools/03-mops-radar
   PY=$(which python3)
   sed -e "s|__PYTHON3_PATH__|$PY|" \
       -e "s|__RADAR_PY_PATH__|$RADAR_DIR/radar.py|" \
       -e "s|__RADAR_DIR__|$RADAR_DIR|g" \
       -e "s|__YOUR_BOT_TOKEN__|你的token|" \
       -e "s|__YOUR_CHAT_ID__|你的chatid|" \
       "$RADAR_DIR/com.johnny.mops-radar.plist" \
       > ~/Library/LaunchAgents/com.johnny.mops-radar.plist
   ```
   （不想推 Telegram？把 token/chatid 兩處留原樣即可，會自動 dry-run，結果仍寫進 JSON 與 log。）
3. 載入並啟用：
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.johnny.mops-radar.plist 2>/dev/null
   launchctl load   ~/Library/LaunchAgents/com.johnny.mops-radar.plist
   ```
4. 立即測一次（不等到早上）：
   ```bash
   launchctl start com.johnny.mops-radar
   cat ~/claude_projects/股票/yt_invest/tools/03-mops-radar/launchd.out.log
   ```
5. 之後想停：
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.johnny.mops-radar.plist
   ```

> 註：`StartCalendarInterval` 若到點時電腦在睡眠，launchd 會在喚醒後補跑一次。

## 輸出 JSON 結構

```json
{
  "generated_at": "2026-06-14T18:14:49",
  "data_year_month": "11505",
  "thresholds": { "min_dividend_yield": 4.0, "max_pb_ratio": 2.0, "min_revenue_yoy": 10.0, "min_revenue_mom": 0.0 },
  "count": 54,
  "picks": [
    { "code": "2528", "name": "皇普", "market": "上市", "ym": "11505",
      "rev_cur": 833803.0, "mom": 4721.9, "yoy": 506.23,
      "dividend_yield": 13.33, "pb": 1.36, "pe": 9.41 }
  ]
}
```

## 檔案

- `radar.py` —— 主程式（抓資料 / 算指標 / 篩選 / 表格 / JSON / Telegram）
- `com.johnny.mops-radar.plist` —— launchd 排程範本
- `output/radar_YYYYMMDD.json` —— 每次執行的結果
- `README.md` —— 本說明

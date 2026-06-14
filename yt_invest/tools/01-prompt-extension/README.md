# AI 投資 Prompt 模板庫 — Chrome 擴充功能

複製自投資 YouTube 影片（aXMBcJK9aeI）中展示的 Chrome 擴充工具。

## 功能

- **10 組內建模板**，涵蓋：事件選股、財報分析、產業研究、風險評估
- **即時搜尋**：標題、內容、分類全文過濾
- **一鍵複製**：含佔位符（`【事件】`）的模板複製後自動提示替換
- **自訂新增**：標題 + 分類 + 內容，存 localStorage
- **匯出 / 匯入 JSON**：備份或跨裝置移轉自訂模板
- **使用者模板可刪除**，內建模板唯讀

## 安裝（開發者模式載入）

1. 開啟 Chrome，網址列輸入 `chrome://extensions`
2. 右上角開啟「**開發人員模式**」（Developer mode）
3. 點選「**載入未封裝項目**」（Load unpacked）
4. 選擇本資料夾：`01-prompt-extension/`
5. 擴充功能列出現「AI 投資 Prompt 模板庫」即成功

## 使用方式

1. 點擊 Chrome 工具列的擴充功能圖示，開啟 Popup
2. 使用頂部搜尋框或分類標籤篩選模板
3. 點「**複製 Prompt**」即可複製到剪貼簿
4. 貼到 ChatGPT / Claude / Gemini，並替換 `【佔位符】` 中的內容
5. 如需新增自己的模板：點「**＋ 新增模板**」→ 填入標題、分類、內容 → 儲存

## 自訂模板格式（匯入 JSON）

```json
{
  "version": 1,
  "userTemplates": [
    {
      "title": "我的選股模板",
      "category": "自訂",
      "content": "請幫我分析【股票代號】…"
    }
  ]
}
```

## 檔案結構

```
01-prompt-extension/
├── manifest.json   MV3 設定
├── popup.html      主介面
├── popup.css       樣式
├── popup.js        邏輯（含內建模板）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 注意事項

- 純前端，無網路請求，無外部依賴，CSP 友善
- 自訂模板存於瀏覽器 `localStorage`，清除瀏覽器資料會遺失，請定期匯出備份
- 本工具提供的是「**Prompt 模板**」，不構成投資建議

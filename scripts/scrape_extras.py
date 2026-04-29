"""爬學習資源 → 寫成 extra/ markdown，前端會自動列在側邊欄「額外資料」。

抓哪些（依使用者選 B - 積極）：
  1. 綠角財經筆記 RSS（被動投資聖經）→ 標題 + 連結 + 發表日 + 摘要（不抓全文，避免版權）
  2. 股癌 podcast 公開節目清單（Spotify Podcast 沒有公開 API，改抓 Apple Podcast feed）
  3. Yahoo 股市新聞 RSS（台股/美股）

⚠️ 只抓 metadata + 摘要 + 連結，不複製全文。這是合法做法。
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import feedparser

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "extra"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = [
    {
        "id": "lvjiao_blog",
        "title": "綠角財經筆記（最新文章）",
        "url": "https://greenhornfinancefootnote.blogspot.com/feeds/posts/summary?alt=rss&max-results=30",
        "desc": "台灣被動投資啟蒙者，ETF / 資產配置觀念之最佳免費資源。",
    },
    {
        "id": "yahoo_tw_finance",
        "title": "Yahoo 奇摩股市 - 台股新聞",
        "url": "https://tw.stock.yahoo.com/rss/url/d/e/N1.html",
        "desc": "台股即時新聞（每日更新）。",
    },
    {
        "id": "yahoo_us_finance",
        "title": "Yahoo Finance - Top Stories",
        "url": "https://finance.yahoo.com/news/rssindex",
        "desc": "美股每日重點新聞。",
    },
]


def clean_html(text: str) -> str:
    """簡單去 HTML tag。"""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def truncate(text: str, n: int = 150) -> str:
    text = text.strip()
    if len(text) <= n:
        return text
    return text[:n] + "…"


def scrape_one(src: dict, max_items: int = 20) -> dict | None:
    print(f"  → {src['id']} …", end=" ", flush=True)
    try:
        feed = feedparser.parse(src["url"])
    except Exception as e:
        print(f"✗ {e}")
        return None

    if feed.bozo and not feed.entries:
        print(f"✗ feed parse error: {feed.bozo_exception}")
        return None

    items = []
    for entry in feed.entries[:max_items]:
        title = entry.get("title", "（無標題）")
        link = entry.get("link", "#")
        published = entry.get("published") or entry.get("updated") or ""
        # 嘗試解析時間
        try:
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6]).strftime("%Y-%m-%d")
            elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                published = datetime(*entry.updated_parsed[:6]).strftime("%Y-%m-%d")
        except Exception:
            pass

        summary = clean_html(entry.get("summary", entry.get("description", "")))
        summary = truncate(summary, 200)

        items.append(
            {
                "title": title,
                "link": link,
                "published": str(published)[:10],
                "summary": summary,
            }
        )

    print(f"{len(items)} 篇")

    # 寫成 markdown
    md = [
        f"# {src['title']}",
        "",
        f"> {src['desc']}",
        f"> 來源：[{src['url']}]({src['url']})　|　爬取時間：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "---",
        "",
    ]
    for i, it in enumerate(items, 1):
        md.append(f"### {i}. [{it['title']}]({it['link']})")
        if it["published"]:
            md.append(f"*{it['published']}*")
        if it["summary"]:
            md.append("")
            md.append(f"{it['summary']}")
        md.append("")
        md.append("---")
        md.append("")

    fname = f"{src['id']}.md"
    (OUT / fname).write_text("\n".join(md), encoding="utf-8")
    return {"id": src["id"], "title": src["title"], "file": fname, "count": len(items)}


def main():
    print(f"📰 爬 {len(SOURCES)} 個來源：")
    results = []
    for src in SOURCES:
        r = scrape_one(src)
        if r:
            results.append(r)

    manifest = {"extras": results, "updated": datetime.now().strftime("%Y-%m-%d %H:%M")}
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n✅ {len(results)} 個來源 → {OUT}/")


if __name__ == "__main__":
    main()

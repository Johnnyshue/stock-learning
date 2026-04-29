// === 股票學習筆記 SPA ===
// 路由：#ch00, #ch08, ..., #lab, #cheatsheet, #about
// 章節 markdown 從 content/ 載入；K 線資料從 data/ 載入

const $ = (sel) => document.querySelector(sel);
const contentEl = $("#content");

let manifest = null;
let extras = [];
let dataIndex = null;
let chartObjects = null; // { mainChart, rsiChart, macdChart, series... }

// === 初始化 ===
async function init() {
  try {
    const noCache = { cache: "no-store" };
    const [m, ex, di] = await Promise.all([
      fetch("content/manifest.json", noCache).then((r) => r.json()),
      fetch("extra/manifest.json", noCache)
        .then((r) => (r.ok ? r.json() : { extras: [] }))
        .catch(() => ({ extras: [] })),
      fetch("data/_index.json", noCache).then((r) => r.json()),
    ]);
    manifest = m;
    extras = ex.extras || [];
    dataIndex = di;
    renderSidebar();
    handleRoute();
  } catch (e) {
    contentEl.innerHTML = `<p style="color:var(--red)">載入失敗：${e.message}<br>提醒：必須用 <code>python -m http.server</code> 開，不能直接 file://</p>`;
  }
  updateDate();
}

function updateDate() {
  // 找最新的章節 mtime — 簡化為今天
  $("#update-date").textContent = new Date().toISOString().slice(0, 10);
}

// === Sidebar ===
function renderSidebar() {
  const list = $("#chapter-list");
  list.innerHTML = manifest.chapters
    .map(
      (c) => `<li><a href="#${c.order}" data-route="${c.order}">${c.title}</a></li>`
    )
    .join("");

  const exList = $("#extra-list");
  if (extras.length === 0) {
    exList.innerHTML = `<li><small style="color:var(--text-dim);padding:0.4rem 0.6rem;display:block">尚未爬取</small></li>`;
  } else {
    exList.innerHTML = extras
      .map(
        (e) =>
          `<li><a href="#extra/${e.id}" data-route="extra/${e.id}">${e.title}</a></li>`
      )
      .join("");
  }
}

// === 漢堡選單（mobile）===
function setupMenuToggle() {
  const btn = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!btn || !sidebar || !overlay) return;

  function open() { sidebar.classList.add("open"); overlay.classList.add("show"); }
  function close() { sidebar.classList.remove("open"); overlay.classList.remove("show"); }
  btn.addEventListener("click", () => sidebar.classList.contains("open") ? close() : open());
  overlay.addEventListener("click", close);
  // 任何路由變化（點章節、互動工具）都收起 sidebar — 手機才收
  window.addEventListener("hashchange", () => {
    if (window.matchMedia("(max-width: 768px)").matches) close();
  });
  // 額外：直接點 sidebar 的連結也立即收（hashchange 有微小延遲）
  sidebar.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (a && window.matchMedia("(max-width: 768px)").matches) close();
  });
}
setupMenuToggle();

// === Router ===
window.addEventListener("hashchange", handleRoute);

function handleRoute() {
  const route = (location.hash.slice(1) || "00").trim();
  highlightActive(route);

  if (route === "lab") return renderLab();
  if (route === "cheatsheet") return renderCheatsheet();
  if (route === "about") return renderAbout();
  if (route === "trade") return window.renderTrade(contentEl, dataIndex);
  if (route === "quiz") return window.renderQuiz(contentEl, dataIndex);
  if (route === "patterns") return window.renderPatterns(contentEl, dataIndex);
  if (route === "backtest") return window.renderBacktest(contentEl, dataIndex);
  if (route === "fire") return window.renderFire(contentEl);
  if (route.startsWith("extra/")) return renderExtra(route.slice(6));
  return renderChapter(route);
}

function highlightActive(route) {
  document.querySelectorAll("#sidebar nav a").forEach((a) => {
    const r = a.dataset.route;
    a.classList.toggle("active", r === route);
  });
}

// === 渲染章節 markdown ===
async function renderChapter(order) {
  const chapter = manifest.chapters.find((c) => c.order === order);
  if (!chapter) {
    contentEl.innerHTML = `<p>找不到章節：${order}</p>`;
    return;
  }
  contentEl.innerHTML = `<div class="loader">載入 ${chapter.title}…</div>`;
  const md = await fetch(`content/${chapter.file}`, { cache: "no-store" }).then((r) => r.text());
  // 移除 frontmatter 註解
  const cleaned = md.replace(/^<!--[\s\S]*?-->\s*/m, "");
  contentEl.innerHTML = marked.parse(cleaned);
  // 攔截 lab-link
  contentEl.querySelectorAll('a[data-route]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = a.dataset.route;
    });
  });
  window.scrollTo(0, 0);
}

async function renderExtra(id) {
  const item = extras.find((e) => e.id === id);
  if (!item) {
    contentEl.innerHTML = `<p>找不到：${id}</p>`;
    return;
  }
  const md = await fetch(`extra/${item.file}`, { cache: "no-store" }).then((r) => r.text());
  contentEl.innerHTML = marked.parse(md);
  window.scrollTo(0, 0);
}

// === K 線實驗室 ===
function renderLab() {
  const symbols = Object.entries(dataIndex);
  contentEl.innerHTML = `
    <h1>🔬 K 線實驗室</h1>
    <p>選股票、開關指標，邊看邊學。台股紅綠定義 = <span style="color:var(--red)">紅漲</span> / <span style="color:var(--green)">綠跌</span>（與美股相反）。</p>

    <div class="lab-controls">
      <label>標的：
        <select id="sym-select">
          <optgroup label="台股">
            ${symbols.filter(([k]) => k.endsWith(".TW")).map(([k, v]) => `<option value="${k}">${k} ${v.name}</option>`).join("")}
          </optgroup>
          <optgroup label="美股">
            ${symbols.filter(([k]) => !k.endsWith(".TW")).map(([k, v]) => `<option value="${k}">${k} ${v.name}</option>`).join("")}
          </optgroup>
        </select>
      </label>
      <label>時間：
        <select id="range-select">
          <option value="60">3 個月</option>
          <option value="120">6 個月</option>
          <option value="240" selected>1 年</option>
          <option value="0">全部（2 年）</option>
        </select>
      </label>
      <span class="toggle"><input type="checkbox" id="t-sma20" checked> <label for="t-sma20">5MA 紅</label></span>
      <span class="toggle"><input type="checkbox" id="t-sma60" checked> <label for="t-sma60">20MA 黃</label></span>
      <span class="toggle"><input type="checkbox" id="t-sma240"> <label for="t-sma240">240MA 綠</label></span>
      <span class="toggle"><input type="checkbox" id="t-bb"> <label for="t-bb">布林通道</label></span>
      <span class="toggle"><input type="checkbox" id="t-rsi" checked> <label for="t-rsi">RSI</label></span>
      <span class="toggle"><input type="checkbox" id="t-macd" checked> <label for="t-macd">MACD</label></span>
    </div>

    <div id="chart-main"></div>
    <div id="chart-rsi" style="display:none"></div>
    <div id="chart-macd" style="display:none"></div>

    <div class="lab-info" id="lab-info">
      <strong>怎麼看？</strong><br>
      • <span class="tag tag-up">紅 K</span> = 收盤 > 開盤（上漲），<span class="tag tag-down">綠 K</span> = 收盤 < 開盤（下跌）<br>
      • 短均線（5MA）由下往上穿過長均線（20MA）= <strong>黃金交叉</strong>，多頭訊號<br>
      • 短均線跌破長均線 = <strong>死亡交叉</strong>，空頭訊號<br>
      • RSI > 70 超買、< 30 超賣；MACD 柱狀圖由負轉正 = 趨勢轉多
    </div>
  `;

  buildCharts();

  ["sym-select", "range-select"].forEach((id) =>
    document.getElementById(id).addEventListener("change", buildCharts)
  );
  ["t-sma20", "t-sma60", "t-sma240", "t-bb", "t-rsi", "t-macd"].forEach((id) =>
    document.getElementById(id).addEventListener("change", buildCharts)
  );
}

async function buildCharts() {
  const sym = $("#sym-select").value;
  const range = parseInt($("#range-select").value, 10);
  const showSMA20 = $("#t-sma20").checked;
  const showSMA60 = $("#t-sma60").checked;
  const showSMA240 = $("#t-sma240").checked;
  const showBB = $("#t-bb").checked;
  const showRSI = $("#t-rsi").checked;
  const showMACD = $("#t-macd").checked;

  const file = sym.replace(".", "_") + ".json";
  const raw = await fetch(`data/${file}`).then((r) => r.json());
  let bars = raw.bars;
  if (range > 0) bars = bars.slice(-range);

  // 清掉舊圖表
  ["chart-main", "chart-rsi", "chart-macd"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  // 主圖
  const mainEl = $("#chart-main");
  const mainChart = LightweightCharts.createChart(mainEl, chartOpts(mainEl));

  // 台股「紅漲綠跌」設定
  const isTW = sym.endsWith(".TW");
  const upColor = isTW ? "#ef4444" : "#22c55e";
  const downColor = isTW ? "#22c55e" : "#ef4444";

  const candle = mainChart.addCandlestickSeries({
    upColor, downColor,
    borderUpColor: upColor, borderDownColor: downColor,
    wickUpColor: upColor, wickDownColor: downColor,
  });
  candle.setData(bars.map((b) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
  })));

  // 量
  const volumeSeries = mainChart.addHistogramSeries({
    color: "#777",
    priceFormat: { type: "volume" },
    priceScaleId: "vol",
  });
  mainChart.priceScale("vol").applyOptions({
    scaleMargins: { top: 0.85, bottom: 0 },
  });
  volumeSeries.setData(bars.map((b) => ({
    time: b.time,
    value: b.volume,
    color: b.close >= b.open ? upColor + "88" : downColor + "88",
  })));

  // MA
  if (showSMA20) {
    const ma = mainChart.addLineSeries({ color: "#ef4444", lineWidth: 1, title: "5MA" });
    // 用 SMA20 當 5MA 不對 — 用 close 當場算 5MA
    const sma5 = rollingMean(bars.map(b => b.close), 5);
    ma.setData(bars.map((b, i) => ({ time: b.time, value: sma5[i] })).filter(d => d.value !== null));
  }
  if (showSMA60) {
    const ma = mainChart.addLineSeries({ color: "#eab308", lineWidth: 1, title: "20MA" });
    ma.setData(bars.filter((b) => b.sma20 !== null).map((b) => ({ time: b.time, value: b.sma20 })));
  }
  if (showSMA240) {
    const ma = mainChart.addLineSeries({ color: "#22c55e", lineWidth: 1, title: "240MA" });
    ma.setData(bars.filter((b) => b.sma240 !== null).map((b) => ({ time: b.time, value: b.sma240 })));
  }
  if (showBB) {
    const up = mainChart.addLineSeries({ color: "#58a6ff", lineWidth: 1, lineStyle: 2, title: "BB Up" });
    const lo = mainChart.addLineSeries({ color: "#58a6ff", lineWidth: 1, lineStyle: 2, title: "BB Low" });
    up.setData(bars.filter((b) => b.bb_up !== null).map((b) => ({ time: b.time, value: b.bb_up })));
    lo.setData(bars.filter((b) => b.bb_low !== null).map((b) => ({ time: b.time, value: b.bb_low })));
  }

  mainChart.timeScale().fitContent();

  // RSI
  const rsiEl = $("#chart-rsi");
  rsiEl.style.display = showRSI ? "block" : "none";
  if (showRSI) {
    const rsiChart = LightweightCharts.createChart(rsiEl, chartOpts(rsiEl, true));
    const rsiSeries = rsiChart.addLineSeries({ color: "#a855f7", lineWidth: 2, title: "RSI(14)" });
    rsiSeries.setData(bars.filter(b => b.rsi !== null).map(b => ({ time: b.time, value: b.rsi })));
    // 70/30 線
    const overbought = rsiChart.addLineSeries({ color: "#ef4444", lineWidth: 1, lineStyle: 2 });
    overbought.setData(bars.map(b => ({ time: b.time, value: 70 })));
    const oversold = rsiChart.addLineSeries({ color: "#22c55e", lineWidth: 1, lineStyle: 2 });
    oversold.setData(bars.map(b => ({ time: b.time, value: 30 })));
    rsiChart.timeScale().fitContent();
    syncCharts(mainChart, rsiChart);
  }

  // MACD
  const macdEl = $("#chart-macd");
  macdEl.style.display = showMACD ? "block" : "none";
  if (showMACD) {
    const macdChart = LightweightCharts.createChart(macdEl, chartOpts(macdEl, true));
    const macdLine = macdChart.addLineSeries({ color: "#58a6ff", lineWidth: 2, title: "MACD" });
    const sigLine = macdChart.addLineSeries({ color: "#eab308", lineWidth: 2, title: "Signal" });
    const hist = macdChart.addHistogramSeries({ title: "Hist" });
    macdLine.setData(bars.filter(b => b.macd !== null).map(b => ({ time: b.time, value: b.macd })));
    sigLine.setData(bars.filter(b => b.signal !== null).map(b => ({ time: b.time, value: b.signal })));
    hist.setData(bars.filter(b => b.hist !== null).map(b => ({
      time: b.time,
      value: b.hist,
      color: b.hist >= 0 ? upColor + "aa" : downColor + "aa",
    })));
    macdChart.timeScale().fitContent();
    syncCharts(mainChart, macdChart);
  }

  // 更新資訊
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const change = last.close - prev.close;
  const pct = (change / prev.close) * 100;
  const tag = change >= 0 ? `<span class="tag tag-up">▲ +${change.toFixed(2)} (+${pct.toFixed(2)}%)</span>`
                          : `<span class="tag tag-down">▼ ${change.toFixed(2)} (${pct.toFixed(2)}%)</span>`;
  $("#lab-info").innerHTML = `
    <strong>${raw.name} (${sym})</strong><br>
    最新 ${last.time}：收 ${last.close} ${tag}　量 ${last.volume.toLocaleString()}<br>
    區間最高：${Math.max(...bars.map(b => b.high)).toFixed(2)}　最低：${Math.min(...bars.map(b => b.low)).toFixed(2)}<br>
    <hr style="border:none;border-top:1px solid var(--border);margin:0.5rem 0">
    <strong>怎麼看？</strong>
    紅 K 漲、綠 K 跌（台股）；MA 由下往上穿越 = 黃金交叉；RSI > 70 超買、< 30 超賣
  `;
}

function chartOpts(el, isSubchart = false) {
  return {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: "#161b22" }, textColor: "#e6edf3" },
    grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
    timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false, visible: !isSubchart },
    rightPriceScale: { borderColor: "#30363d" },
    crosshair: { mode: 1 },
  };
}

function syncCharts(a, b) {
  a.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    if (r) b.timeScale().setVisibleLogicalRange(r);
  });
  b.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    if (r) a.timeScale().setVisibleLogicalRange(r);
  });
}

function rollingMean(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < n - 1) {
      out.push(null);
    } else {
      const slice = arr.slice(i - n + 1, i + 1);
      out.push(slice.reduce((a, b) => a + b, 0) / n);
    }
  }
  return out;
}

// === 速查表 ===
function renderCheatsheet() {
  contentEl.innerHTML = `
    <h1>📋 速查表</h1>
    <p>這頁是給你「忘記時 5 秒看回來」用的。</p>

    <div class="cheat-grid">
      <div class="cheat-card">
        <h3>K 線顏色（台股）</h3>
        <p><span class="tag tag-up">紅 K</span> = 收盤 > 開盤（漲）</p>
        <p><span class="tag tag-down">綠 K</span> = 收盤 < 開盤（跌）</p>
        <p><strong>美股相反</strong>：綠漲紅跌</p>
      </div>

      <div class="cheat-card">
        <h3>三條均線</h3>
        <p>5MA = 短期動能（紅）</p>
        <p>20MA = 月線、中期方向（黃）</p>
        <p>60MA = 季線、長期趨勢（綠）</p>
        <p>240MA = 年線（藍）</p>
      </div>

      <div class="cheat-card">
        <h3>進出場訊號</h3>
        <p><strong>黃金交叉</strong>：短均線↑穿長均線 → 多頭</p>
        <p><strong>死亡交叉</strong>：短均線↓破長均線 → 空頭</p>
        <p>但震盪盤會騙人，要配合量看</p>
      </div>

      <div class="cheat-card">
        <h3>RSI 解讀</h3>
        <p>0-100 範圍</p>
        <p>RSI > 70 → 超買，可能回檔</p>
        <p>RSI < 30 → 超賣，可能反彈</p>
        <p>強勢股可在超買區待很久，不是賣訊號</p>
      </div>

      <div class="cheat-card">
        <h3>MACD 解讀</h3>
        <p>DIF 上穿 MACD → 買進</p>
        <p>DIF 下穿 MACD → 賣出</p>
        <p>柱狀圖由負轉正 → 趨勢轉多</p>
        <p>柱狀圖由正轉負 → 趨勢轉空</p>
      </div>

      <div class="cheat-card">
        <h3>布林通道</h3>
        <p>中軌 = 20MA</p>
        <p>上軌 = 中軌 + 2σ</p>
        <p>下軌 = 中軌 - 2σ</p>
        <p>觸上軌 = 過熱；觸下軌 = 超跌；通道收窄 = 即將大波動</p>
      </div>

      <div class="cheat-card">
        <h3>量價關係</h3>
        <p>價漲量增 → 健康</p>
        <p>價漲量縮 → 乏力</p>
        <p>爆量 → 注意頭/底部</p>
      </div>

      <div class="cheat-card">
        <h3>5 個基本面數字</h3>
        <p>P/E（本益比）= 股價 / EPS</p>
        <p>P/B（股價淨值比）= 股價 / 每股淨值</p>
        <p>殖利率 = 股利 / 股價</p>
        <p>ROE = 淨利 / 股東權益（> 15% 優秀）</p>
        <p>PEG = P/E / 盈餘成長率（< 1 可能低估）</p>
      </div>

      <div class="cheat-card">
        <h3>台股交易成本</h3>
        <p>手續費：0.1425%（可打 6 折）</p>
        <p>證交稅：0.3%（賣出才收）</p>
        <p>ETF 證交稅：0.1%</p>
        <p>一買一賣總成本約 0.27%</p>
      </div>

      <div class="cheat-card">
        <h3>新手 0 → 1</h3>
        <p>1. 開券商戶 + 交割銀行</p>
        <p>2. 0050 或 006208 定期定額</p>
        <p>3. 每月 3,000-5,000 元起</p>
        <p>4. 設定好就忘了它</p>
        <p>5. 不要每天看</p>
      </div>
    </div>
  `;
  window.scrollTo(0, 0);
}

function renderAbout() {
  contentEl.innerHTML = `
    <h1>關於</h1>
    <p>給徐嘉佑（TSGH PGY）的個人股票學習筆記。</p>
    <h3>更新方式</h3>
    <pre><code>cd ~/claude_projects/股票/
./update.sh        # 抓最新資料 + 重新切章節
python3 -m http.server 8000   # 本地預覽</code></pre>
    <h3>新增自己的筆記</h3>
    <p>在 <code>extra/</code> 資料夾放 markdown，再執行 <code>scripts/build_extras.py</code> 即可。</p>
    <h3>資料來源</h3>
    <ul>
      <li>歷史 K 線：<a href="https://finance.yahoo.com/" target="_blank">Yahoo Finance（yfinance）</a> — 真實資料</li>
      <li>學習指南：自己整理，原檔在 <code>~/Documents/Claude/Projects/STOCK/</code></li>
      <li>技術指標：自己用 pandas 算（SMA/RSI/MACD/Bollinger）</li>
    </ul>
    <h3>免責</h3>
    <p>本網頁僅供個人學習，不構成任何投資建議。投資有風險，盈虧自負。</p>
  `;
  window.scrollTo(0, 0);
}

init();

// 紙上交易模擬器
// 起始 100 萬，可穿越時空：選一個歷史起點，逐日下單，看到末日績效。
// 持久化在 localStorage(key=stock_paper_v2)。
window.renderTrade = (() => {
  const STORAGE_KEY = "stock_paper_v2";
  const INITIAL_CASH = 1_000_000;
  const FEE_RATE = 0.001425 * 0.6; // 6 折手續費
  const TAX_RATE_STOCK = 0.003;
  const TAX_RATE_ETF = 0.001;

  let dataIndex = null;
  let allBars = {}; // symbol -> bars
  let state = null;
  let priceChart = null;
  let priceCandle = null;
  let priceVol = null;

  const C = window.STOCK_COMMON;

  // === state ===
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isETF(sym) {
    return sym.startsWith("00") || ["SPY","VOO","VTI","QQQ"].includes(sym);
  }

  function totalEquity(asOfDate) {
    let eq = state.cash;
    for (const [sym, p] of Object.entries(state.positions || {})) {
      const bars = allBars[sym];
      const bar = bars.find(b => b.time === asOfDate) || bars[bars.findIndex(b => b.time > asOfDate) - 1] || bars[bars.length - 1];
      eq += p.shares * (bar?.close || p.avgCost);
    }
    return eq;
  }

  // === main render ===
  async function renderTrade(contentEl, di) {
    dataIndex = di;
    contentEl.innerHTML = `<div class="loader">載入交易資料…</div>`;

    // 預載所有股票
    await Promise.all(Object.keys(dataIndex).map(async sym => {
      if (!allBars[sym]) {
        const r = await C.loadBars(sym);
        allBars[sym] = r.bars;
      }
    }));

    state = loadState();
    if (!state) {
      // 預設：用 0050.TW 第 60 個交易日當起點
      const refBars = allBars["0050.TW"];
      const startIdx = 60;
      state = {
        cash: INITIAL_CASH,
        startCash: INITIAL_CASH,
        startDate: refBars[startIdx].time,
        currentDate: refBars[startIdx].time,
        positions: {},  // symbol -> {shares, avgCost}
        history: [],    // {date, action, sym, shares, price, fee, tax, cashAfter}
        equityHistory: [{date: refBars[startIdx].time, equity: INITIAL_CASH}],
      };
      saveState();
    }

    drawUI(contentEl);
  }

  function drawUI(contentEl) {
    const symbols = Object.keys(dataIndex);
    contentEl.innerHTML = `
      <h1>💰 紙上交易模擬器</h1>
      <p>起始 100 萬，從 <strong>${state.startDate}</strong> 開始，每按「下一日」前進 1 個交易日。手續費 0.0855%（6 折），證交稅 0.3%（ETF 0.1%，賣出才收）。</p>

      <div class="trade-stats" id="trade-stats"></div>

      <div class="lab-controls">
        <label>標的：
          <select id="trade-sym">
            <optgroup label="台股">
              ${symbols.filter(s => s.endsWith(".TW")).map(s => `<option value="${s}">${s} ${dataIndex[s].name}</option>`).join("")}
            </optgroup>
            <optgroup label="美股">
              ${symbols.filter(s => !s.endsWith(".TW")).map(s => `<option value="${s}">${s} ${dataIndex[s].name}</option>`).join("")}
            </optgroup>
          </select>
        </label>
        <button id="btn-next1">▶ 下一日</button>
        <button id="btn-next5">▶▶ +5 日</button>
        <button id="btn-next30">▶▶▶ +30 日</button>
        <button id="btn-end">⏭ 跳到最後</button>
        <button id="btn-reset" style="margin-left:auto;background:#7f1d1d">🔄 重置</button>
      </div>

      <div id="trade-chart" style="height: 380px; border:1px solid var(--border); border-radius:6px; margin-bottom:1rem"></div>

      <div class="trade-action lab-controls">
        <label>數量（股）：
          <input type="number" id="trade-qty" value="1000" min="1" step="1" style="width:100px;background:var(--bg-side);color:var(--text);border:1px solid var(--border);padding:0.35rem 0.7rem;border-radius:4px">
        </label>
        <button id="btn-buy" style="background:#dc2626">📥 買入</button>
        <button id="btn-sell" style="background:#16a34a">📤 賣出</button>
        <button id="btn-allin" style="background:#374151">🎯 All In（全現金）</button>
        <span id="trade-msg" style="margin-left:1rem;font-size:0.9rem;color:var(--yellow)"></span>
      </div>

      <h3 style="margin-top:1.5rem">📦 持倉</h3>
      <div id="trade-positions"></div>

      <h3 style="margin-top:1.5rem">📜 交易紀錄（最新 20 筆）</h3>
      <div id="trade-history"></div>
    `;

    // 事件
    document.getElementById("trade-sym").addEventListener("change", refreshChart);
    document.getElementById("btn-next1").addEventListener("click", () => advance(1));
    document.getElementById("btn-next5").addEventListener("click", () => advance(5));
    document.getElementById("btn-next30").addEventListener("click", () => advance(30));
    document.getElementById("btn-end").addEventListener("click", () => advance(99999));
    document.getElementById("btn-reset").addEventListener("click", reset);
    document.getElementById("btn-buy").addEventListener("click", () => trade("buy"));
    document.getElementById("btn-sell").addEventListener("click", () => trade("sell"));
    document.getElementById("btn-allin").addEventListener("click", allIn);

    refreshChart();
    refreshStats();
    refreshPositions();
    refreshHistory();
  }

  function refreshChart() {
    const sym = document.getElementById("trade-sym").value;
    const bars = allBars[sym];
    const upTo = bars.findIndex(b => b.time === state.currentDate);
    const visible = upTo === -1 ? bars : bars.slice(0, upTo + 1);

    const el = document.getElementById("trade-chart");
    el.innerHTML = "";
    priceChart = LightweightCharts.createChart(el, C.chartOpts(el));
    const col = C.colors(sym);
    priceCandle = priceChart.addCandlestickSeries({
      upColor: col.up, downColor: col.down,
      borderUpColor: col.up, borderDownColor: col.down,
      wickUpColor: col.up, wickDownColor: col.down,
    });
    priceCandle.setData(visible.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));

    // 5MA / 20MA
    const closes = visible.map(b => b.close);
    const sma5 = C.rollingMean(closes, 5);
    const sma20 = C.rollingMean(closes, 20);
    const ma5 = priceChart.addLineSeries({ color: "#ef4444", lineWidth: 1, title: "5MA" });
    const ma20 = priceChart.addLineSeries({ color: "#eab308", lineWidth: 1, title: "20MA" });
    ma5.setData(visible.map((b, i) => ({ time: b.time, value: sma5[i] })).filter(d => d.value !== null));
    ma20.setData(visible.map((b, i) => ({ time: b.time, value: sma20[i] })).filter(d => d.value !== null));

    // 量
    priceVol = priceChart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    priceChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    priceVol.setData(visible.map(b => ({
      time: b.time, value: b.volume,
      color: b.close >= b.open ? col.up + "88" : col.down + "88",
    })));

    // 標出我的買賣
    const markers = state.history
      .filter(h => h.sym === sym)
      .map(h => ({
        time: h.date,
        position: h.action === "buy" ? "belowBar" : "aboveBar",
        color: h.action === "buy" ? "#dc2626" : "#16a34a",
        shape: h.action === "buy" ? "arrowUp" : "arrowDown",
        text: `${h.action === "buy" ? "買" : "賣"} ${h.shares}@${C.fmt(h.price)}`,
      }));
    if (markers.length > 0) priceCandle.setMarkers(markers);

    priceChart.timeScale().fitContent();
  }

  function refreshStats() {
    const eq = totalEquity(state.currentDate);
    const profit = eq - state.startCash;
    const pct = (profit / state.startCash) * 100;
    const lastBar = allBars["0050.TW"][allBars["0050.TW"].length - 1];
    const isEnd = state.currentDate >= lastBar.time;

    // Buy & Hold 0050 比較
    const refBars = allBars["0050.TW"];
    const startBar = refBars.find(b => b.time === state.startDate);
    const curBar = refBars.find(b => b.time === state.currentDate) || refBars.findLast(b => b.time <= state.currentDate);
    const bnh = ((curBar.close - startBar.close) / startBar.close) * 100;

    const profitColor = profit >= 0 ? "var(--red)" : "var(--green)";
    document.getElementById("trade-stats").innerHTML = `
      <div class="stat-grid">
        <div><small>當前日期</small><strong>${state.currentDate}</strong></div>
        <div><small>現金</small><strong>$${C.fmtMoney(state.cash)}</strong></div>
        <div><small>總資產</small><strong>$${C.fmtMoney(eq)}</strong></div>
        <div><small>損益</small><strong style="color:${profitColor}">${profit >= 0 ? "▲" : "▼"} $${C.fmtMoney(Math.abs(profit))} (${C.fmtPct(pct)})</strong></div>
        <div><small>持倉檔數</small><strong>${Object.keys(state.positions).length}</strong></div>
        <div><small>vs 0050 Buy&Hold</small><strong style="color:${pct >= bnh ? 'var(--red)' : 'var(--green)'}">${C.fmtPct(bnh)}</strong></div>
      </div>
      ${isEnd ? `<p style="margin-top:0.5rem;color:var(--yellow)">⏰ 已到資料末日，按重置可重新開始。</p>` : ""}
    `;
  }

  function refreshPositions() {
    const positions = state.positions || {};
    const syms = Object.keys(positions);
    const el = document.getElementById("trade-positions");
    if (syms.length === 0) {
      el.innerHTML = `<p style="color:var(--text-dim)">目前沒有持倉</p>`;
      return;
    }
    let html = `<table><thead><tr><th>標的</th><th>股數</th><th>成本均價</th><th>現價</th><th>市值</th><th>未實現損益</th></tr></thead><tbody>`;
    for (const sym of syms) {
      const p = positions[sym];
      const bars = allBars[sym];
      const bar = bars.find(b => b.time === state.currentDate) || bars.findLast(b => b.time <= state.currentDate);
      const cur = bar?.close || p.avgCost;
      const value = p.shares * cur;
      const profit = value - p.shares * p.avgCost;
      const pct = (profit / (p.shares * p.avgCost)) * 100;
      const color = profit >= 0 ? "var(--red)" : "var(--green)";
      html += `<tr>
        <td><strong>${sym}</strong> ${dataIndex[sym].name}</td>
        <td>${p.shares.toLocaleString()}</td>
        <td>$${C.fmt(p.avgCost)}</td>
        <td>$${C.fmt(cur)}</td>
        <td>$${C.fmtMoney(value)}</td>
        <td style="color:${color}">$${C.fmtMoney(profit)} (${C.fmtPct(pct)})</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    el.innerHTML = html;
  }

  function refreshHistory() {
    const el = document.getElementById("trade-history");
    if (state.history.length === 0) {
      el.innerHTML = `<p style="color:var(--text-dim)">尚無交易紀錄</p>`;
      return;
    }
    const recent = state.history.slice(-20).reverse();
    let html = `<table><thead><tr><th>日期</th><th>動作</th><th>標的</th><th>股數</th><th>價格</th><th>手續費+稅</th><th>剩餘現金</th></tr></thead><tbody>`;
    for (const h of recent) {
      const tag = h.action === "buy" ? "📥 買" : "📤 賣";
      html += `<tr>
        <td>${h.date}</td>
        <td>${tag}</td>
        <td>${h.sym}</td>
        <td>${h.shares.toLocaleString()}</td>
        <td>$${C.fmt(h.price)}</td>
        <td>$${C.fmtMoney(h.fee + h.tax)}</td>
        <td>$${C.fmtMoney(h.cashAfter)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    el.innerHTML = html;
  }

  function advance(days) {
    const refBars = allBars["0050.TW"];
    const idx = refBars.findIndex(b => b.time === state.currentDate);
    const newIdx = Math.min(idx + days, refBars.length - 1);
    state.currentDate = refBars[newIdx].time;
    state.equityHistory.push({ date: state.currentDate, equity: totalEquity(state.currentDate) });
    saveState();
    refreshChart();
    refreshStats();
    refreshPositions();
  }

  function trade(action) {
    const sym = document.getElementById("trade-sym").value;
    const qty = parseInt(document.getElementById("trade-qty").value, 10);
    const msg = document.getElementById("trade-msg");
    msg.textContent = "";

    if (!qty || qty <= 0) {
      msg.textContent = "❌ 數量無效";
      return;
    }

    const bars = allBars[sym];
    const bar = bars.find(b => b.time === state.currentDate) || bars.findLast(b => b.time <= state.currentDate);
    if (!bar) { msg.textContent = "❌ 找不到該日報價"; return; }

    const price = bar.close;
    const gross = qty * price;
    const fee = Math.max(20, gross * FEE_RATE);

    if (action === "buy") {
      const cost = gross + fee;
      if (cost > state.cash) {
        msg.textContent = `❌ 現金不足。需要 $${C.fmtMoney(cost)}，只有 $${C.fmtMoney(state.cash)}`;
        return;
      }
      const cur = state.positions[sym] || { shares: 0, avgCost: 0 };
      const newShares = cur.shares + qty;
      const newAvgCost = (cur.shares * cur.avgCost + qty * price) / newShares;
      state.positions[sym] = { shares: newShares, avgCost: newAvgCost };
      state.cash -= cost;
      state.history.push({
        date: state.currentDate, action: "buy", sym, shares: qty, price,
        fee, tax: 0, cashAfter: state.cash,
      });
      msg.textContent = `✓ 買進 ${qty} 股 ${sym} @ $${C.fmt(price)}（含手續費 $${C.fmtMoney(fee)}）`;
      msg.style.color = "var(--red)";
    } else {
      const cur = state.positions[sym];
      if (!cur || cur.shares < qty) {
        msg.textContent = `❌ 持倉不足。${sym} 現有 ${cur?.shares || 0} 股`;
        return;
      }
      const tax = gross * (isETF(sym) ? TAX_RATE_ETF : TAX_RATE_STOCK);
      const net = gross - fee - tax;
      cur.shares -= qty;
      if (cur.shares === 0) delete state.positions[sym];
      state.cash += net;
      state.history.push({
        date: state.currentDate, action: "sell", sym, shares: qty, price,
        fee, tax, cashAfter: state.cash,
      });
      msg.textContent = `✓ 賣出 ${qty} 股 ${sym} @ $${C.fmt(price)}（手續費+稅 $${C.fmtMoney(fee + tax)}）`;
      msg.style.color = "var(--green)";
    }

    saveState();
    refreshChart();
    refreshStats();
    refreshPositions();
    refreshHistory();
  }

  function allIn() {
    const sym = document.getElementById("trade-sym").value;
    const bars = allBars[sym];
    const bar = bars.find(b => b.time === state.currentDate) || bars.findLast(b => b.time <= state.currentDate);
    if (!bar) return;
    const price = bar.close;
    // 算最大可買股數（保留 1% 給手續費）
    const maxQty = Math.floor((state.cash * 0.99) / price);
    if (maxQty <= 0) {
      document.getElementById("trade-msg").textContent = "❌ 現金太少";
      return;
    }
    document.getElementById("trade-qty").value = maxQty;
    trade("buy");
  }

  function reset() {
    if (!confirm("確定要清空所有交易紀錄、回到 100 萬起始狀態嗎？")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = null;
    renderTrade(document.getElementById("content"), dataIndex);
  }

  return renderTrade;
})();

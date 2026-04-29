// 策略回測：MA 交叉 / RSI 超賣超買 / MACD 黃金交叉 → 跑歷史，輸出績效
// 對比 Buy & Hold。
window.renderBacktest = (() => {
  const C = window.STOCK_COMMON;
  const FEE_RATE = 0.001425 * 0.6;
  const TAX_RATE = 0.003;
  const TAX_RATE_ETF = 0.001;

  let dataIndex = null;
  let allBars = {};

  function isETF(sym) {
    return sym.startsWith("00") || ["SPY","VOO","VTI","QQQ"].includes(sym);
  }

  async function renderBacktest(contentEl, di) {
    dataIndex = di;
    contentEl.innerHTML = `<div class="loader">載入…</div>`;
    await Promise.all(Object.keys(dataIndex).map(async sym => {
      if (!allBars[sym]) {
        const r = await C.loadBars(sym);
        allBars[sym] = r.bars;
      }
    }));
    drawUI(contentEl);
  }

  function drawUI(contentEl) {
    const symbols = Object.keys(dataIndex);
    contentEl.innerHTML = `
      <h1>📊 策略回測</h1>
      <p>選一條策略 + 一檔股票，跑 2 年歷史。看看「黃金交叉買、死亡交叉賣」這類訊號真的有用嗎？</p>

      <div class="lab-controls">
        <label>標的：
          <select id="bt-sym">
            <optgroup label="台股">
              ${symbols.filter(s => s.endsWith(".TW")).map(s => `<option value="${s}">${s} ${dataIndex[s].name}</option>`).join("")}
            </optgroup>
            <optgroup label="美股">
              ${symbols.filter(s => !s.endsWith(".TW")).map(s => `<option value="${s}">${s} ${dataIndex[s].name}</option>`).join("")}
            </optgroup>
          </select>
        </label>
        <label>策略：
          <select id="bt-strategy">
            <option value="ma_cross">MA 交叉（5MA 穿 20MA）</option>
            <option value="rsi">RSI 超賣超買（< 30 買、> 70 賣）</option>
            <option value="macd">MACD 黃金/死亡交叉</option>
            <option value="combo">組合（MA + RSI 雙確認）</option>
          </select>
        </label>
        <label>停損 %：
          <input type="number" id="bt-stop" value="10" min="0" max="50" step="1" style="width:70px;background:var(--bg-side);color:var(--text);border:1px solid var(--border);padding:0.35rem 0.5rem;border-radius:4px">
        </label>
        <button id="bt-run" style="background:var(--accent);color:white">▶ 跑回測</button>
      </div>

      <div id="bt-summary" class="stat-grid"></div>

      <div id="bt-chart" style="height:380px; border:1px solid var(--border); border-radius:6px; margin: 1rem 0"></div>

      <h3>📜 交易紀錄</h3>
      <div id="bt-trades"></div>
    `;
    document.getElementById("bt-run").addEventListener("click", run);
    run();
  }

  function genSignals(bars, strategy) {
    const closes = bars.map(b => b.close);
    const sma5 = C.rollingMean(closes, 5);
    const sma20 = C.rollingMean(closes, 20);
    const signals = bars.map(() => null);

    if (strategy === "ma_cross") {
      for (let i = 1; i < bars.length; i++) {
        if (sma5[i - 1] != null && sma20[i - 1] != null && sma5[i] != null && sma20[i] != null) {
          if (sma5[i - 1] <= sma20[i - 1] && sma5[i] > sma20[i]) signals[i] = "buy";
          else if (sma5[i - 1] >= sma20[i - 1] && sma5[i] < sma20[i]) signals[i] = "sell";
        }
      }
    } else if (strategy === "rsi") {
      for (let i = 0; i < bars.length; i++) {
        if (bars[i].rsi != null) {
          if (bars[i].rsi < 30 && (i === 0 || bars[i - 1].rsi >= 30)) signals[i] = "buy";
          else if (bars[i].rsi > 70 && (i === 0 || bars[i - 1].rsi <= 70)) signals[i] = "sell";
        }
      }
    } else if (strategy === "macd") {
      for (let i = 1; i < bars.length; i++) {
        const a = bars[i - 1], b = bars[i];
        if (a.macd != null && a.signal != null && b.macd != null && b.signal != null) {
          if (a.macd <= a.signal && b.macd > b.signal) signals[i] = "buy";
          else if (a.macd >= a.signal && b.macd < b.signal) signals[i] = "sell";
        }
      }
    } else if (strategy === "combo") {
      // MA 交叉買 + 當天 RSI < 70；MA 死叉賣 + RSI > 30
      for (let i = 1; i < bars.length; i++) {
        if (sma5[i - 1] != null && sma20[i - 1] != null && sma5[i] != null && sma20[i] != null && bars[i].rsi != null) {
          if (sma5[i - 1] <= sma20[i - 1] && sma5[i] > sma20[i] && bars[i].rsi < 70) signals[i] = "buy";
          else if (sma5[i - 1] >= sma20[i - 1] && sma5[i] < sma20[i] && bars[i].rsi > 30) signals[i] = "sell";
        }
      }
    }
    return signals;
  }

  function backtest(sym, bars, strategy, stopPct) {
    const signals = genSignals(bars, strategy);
    const taxRate = isETF(sym) ? TAX_RATE_ETF : TAX_RATE;

    let cash = 1_000_000;
    let shares = 0;
    let entryPrice = 0;
    const trades = [];
    const equity = [];

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const sig = signals[i];

      // 停損
      if (shares > 0 && stopPct > 0 && entryPrice > 0) {
        const drop = (b.low - entryPrice) / entryPrice * 100;
        if (drop <= -stopPct) {
          const stopP = entryPrice * (1 - stopPct / 100);
          const fee = Math.max(20, shares * stopP * FEE_RATE);
          const tax = shares * stopP * taxRate;
          cash += shares * stopP - fee - tax;
          trades.push({ date: b.time, action: "stop", price: stopP, shares, fee, tax, cash });
          shares = 0;
          entryPrice = 0;
          equity.push({ time: b.time, value: cash });
          continue;
        }
      }

      if (sig === "buy" && shares === 0) {
        // 全現金買
        const price = b.close;
        const maxShares = Math.floor(cash * 0.99 / price);
        if (maxShares > 0) {
          const cost = maxShares * price;
          const fee = Math.max(20, cost * FEE_RATE);
          if (cost + fee <= cash) {
            cash -= cost + fee;
            shares = maxShares;
            entryPrice = price;
            trades.push({ date: b.time, action: "buy", price, shares: maxShares, fee, tax: 0, cash });
          }
        }
      } else if (sig === "sell" && shares > 0) {
        const price = b.close;
        const gross = shares * price;
        const fee = Math.max(20, gross * FEE_RATE);
        const tax = gross * taxRate;
        cash += gross - fee - tax;
        trades.push({ date: b.time, action: "sell", price, shares, fee, tax, cash });
        shares = 0;
        entryPrice = 0;
      }

      const eq = cash + shares * b.close;
      equity.push({ time: b.time, value: eq });
    }

    // 結算最後持倉（依 buy & hold 同樣不結算更公平 — 都用最後 close 估值）
    const lastPrice = bars[bars.length - 1].close;
    const finalEq = cash + shares * lastPrice;

    // 績效
    const totalReturn = (finalEq - 1_000_000) / 1_000_000 * 100;

    // Buy & Hold
    const startBar = bars.find(b => b.close > 0);
    const bnhShares = Math.floor(1_000_000 * 0.99 / startBar.close);
    const bnhFee = Math.max(20, bnhShares * startBar.close * FEE_RATE);
    const bnhCash = 1_000_000 - bnhShares * startBar.close - bnhFee;
    const bnhFinal = bnhCash + bnhShares * lastPrice;
    const bnhReturn = (bnhFinal - 1_000_000) / 1_000_000 * 100;

    // 最大回撤
    let peak = 1_000_000;
    let maxDD = 0;
    for (const e of equity) {
      if (e.value > peak) peak = e.value;
      const dd = (e.value - peak) / peak * 100;
      if (dd < maxDD) maxDD = dd;
    }

    // 勝率（只看完整 buy → sell 配對）
    const wins = [];
    let lastBuyPrice = null;
    for (const t of trades) {
      if (t.action === "buy") lastBuyPrice = t.price;
      else if ((t.action === "sell" || t.action === "stop") && lastBuyPrice != null) {
        wins.push(t.price > lastBuyPrice);
        lastBuyPrice = null;
      }
    }
    const winRate = wins.length > 0 ? wins.filter(x => x).length / wins.length * 100 : null;

    return {
      cash, shares, finalEq, totalReturn, bnhReturn, maxDD, trades, equity,
      tradeCount: trades.length, winRate, lastPrice,
    };
  }

  function run() {
    const sym = document.getElementById("bt-sym").value;
    const strategy = document.getElementById("bt-strategy").value;
    const stopPct = parseFloat(document.getElementById("bt-stop").value) || 0;

    const bars = allBars[sym];
    const result = backtest(sym, bars, strategy, stopPct);

    // summary
    const beat = result.totalReturn > result.bnhReturn;
    document.getElementById("bt-summary").innerHTML = `
      <div><small>策略總報酬</small><strong style="color:${result.totalReturn >= 0 ? 'var(--red)' : 'var(--green)'}">${C.fmtPct(result.totalReturn)}</strong></div>
      <div><small>Buy & Hold 報酬</small><strong style="color:${result.bnhReturn >= 0 ? 'var(--red)' : 'var(--green)'}">${C.fmtPct(result.bnhReturn)}</strong></div>
      <div><small>策略勝過 BnH？</small><strong style="color:${beat ? 'var(--red)' : 'var(--green)'}">${beat ? "✅ Yes" : "❌ No"}</strong></div>
      <div><small>交易次數</small><strong>${result.tradeCount}</strong></div>
      <div><small>勝率</small><strong>${result.winRate != null ? C.fmt(result.winRate, 1) + '%' : '—'}</strong></div>
      <div><small>最大回撤</small><strong style="color:var(--green)">${C.fmtPct(result.maxDD)}</strong></div>
    `;

    // chart：股價 + buy/sell marker
    const el = document.getElementById("bt-chart");
    el.innerHTML = "";
    const chart = LightweightCharts.createChart(el, C.chartOpts(el));
    const col = C.colors(sym);
    const candle = chart.addCandlestickSeries({
      upColor: col.up, downColor: col.down,
      borderUpColor: col.up, borderDownColor: col.down,
      wickUpColor: col.up, wickDownColor: col.down,
    });
    candle.setData(bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));

    const closes = bars.map(b => b.close);
    const sma5 = C.rollingMean(closes, 5);
    const sma20 = C.rollingMean(closes, 20);
    const ma5 = chart.addLineSeries({ color: "#ef4444", lineWidth: 1, title: "5MA" });
    const ma20 = chart.addLineSeries({ color: "#eab308", lineWidth: 1, title: "20MA" });
    ma5.setData(bars.map((b, i) => ({ time: b.time, value: sma5[i] })).filter(d => d.value !== null));
    ma20.setData(bars.map((b, i) => ({ time: b.time, value: sma20[i] })).filter(d => d.value !== null));

    const markers = result.trades.map(t => ({
      time: t.date,
      position: t.action === "buy" ? "belowBar" : "aboveBar",
      color: t.action === "buy" ? "#dc2626" : (t.action === "stop" ? "#7f1d1d" : "#16a34a"),
      shape: t.action === "buy" ? "arrowUp" : "arrowDown",
      text: t.action === "buy" ? "買" : (t.action === "stop" ? "停損" : "賣"),
    }));
    candle.setMarkers(markers);
    chart.timeScale().fitContent();

    // trades table
    const tradesEl = document.getElementById("bt-trades");
    if (result.trades.length === 0) {
      tradesEl.innerHTML = `<p style="color:var(--text-dim)">這段期間策略沒觸發任何交易</p>`;
      return;
    }
    let html = `<table><thead><tr><th>日期</th><th>動作</th><th>股數</th><th>價格</th><th>手續費+稅</th><th>剩餘資金</th></tr></thead><tbody>`;
    for (const t of result.trades.slice(-30).reverse()) {
      const tag = t.action === "buy" ? "📥 買" : (t.action === "stop" ? "🛑 停損" : "📤 賣");
      html += `<tr>
        <td>${t.date}</td>
        <td>${tag}</td>
        <td>${t.shares.toLocaleString()}</td>
        <td>$${C.fmt(t.price)}</td>
        <td>$${C.fmtMoney(t.fee + t.tax)}</td>
        <td>$${C.fmtMoney(t.cash)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    tradesEl.innerHTML = html;
  }

  return renderBacktest;
})();

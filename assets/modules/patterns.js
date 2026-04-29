// 型態偵測器：在 K 線圖上標出黃金交叉/死亡交叉/鎚子/流星/十字線/長紅 K/長綠 K，
// 點擊每個標記查看後續 5/10/20 日漲跌統計。
window.renderPatterns = (() => {
  const C = window.STOCK_COMMON;
  let dataIndex = null;
  let allBars = {};

  async function renderPatterns(contentEl, di) {
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
      <h1>🔍 型態偵測器</h1>
      <p>自動找出歷史上的買賣訊號 + 經典 K 線型態。每個訊號 → 顯示後續 5/10/20 日的真實變動。</p>

      <div class="lab-controls">
        <label>標的：
          <select id="pat-sym">
            <optgroup label="台股">
              ${symbols.filter(s => s.endsWith(".TW")).map(s => `<option value="${s}">${s} ${dataIndex[s].name}</option>`).join("")}
            </optgroup>
            <optgroup label="美股">
              ${symbols.filter(s => !s.endsWith(".TW")).map(s => `<option value="${s}">${s} ${dataIndex[s].name}</option>`).join("")}
            </optgroup>
          </select>
        </label>
        <label><input type="checkbox" id="p-golden" checked> 黃金交叉</label>
        <label><input type="checkbox" id="p-death" checked> 死亡交叉</label>
        <label><input type="checkbox" id="p-hammer" checked> 鎚子</label>
        <label><input type="checkbox" id="p-shoot" checked> 流星</label>
        <label><input type="checkbox" id="p-doji"> 十字線</label>
        <label><input type="checkbox" id="p-bigK"> 長紅/綠 K</label>
      </div>

      <div class="pattern-legend">
        <span><span class="dot" style="background:#facc15"></span>🟡 黃金交叉（買訊）</span>
        <span><span class="dot" style="background:#3b82f6"></span>🔵 死亡交叉（賣訊）</span>
        <span><span class="dot" style="background:#22c55e"></span>🟢 鎚子（底部反轉）</span>
        <span><span class="dot" style="background:#ef4444"></span>🔴 流星（頭部反轉）</span>
        <span><span class="dot" style="background:#a855f7"></span>🟣 十字線</span>
      </div>

      <div id="pat-chart" style="height: 480px; border:1px solid var(--border); border-radius:6px"></div>

      <h3 style="margin-top:1.5rem">📊 訊號準確率統計</h3>
      <p style="color:var(--text-dim);font-size:0.9rem">每個訊號發生後 5/10/20 個交易日的平均報酬。如果訊號真的有用，這些數字應該明顯大於 0。</p>
      <div id="pat-stats"></div>
    `;
    document.getElementById("pat-sym").addEventListener("change", refresh);
    document.querySelectorAll("input[type=checkbox]").forEach(cb => cb.addEventListener("change", refresh));
    refresh();
  }

  // === 偵測函式 ===
  function detect(bars) {
    const closes = bars.map(b => b.close);
    const sma5 = C.rollingMean(closes, 5);
    const sma20 = C.rollingMean(closes, 20);

    const events = [];

    for (let i = 1; i < bars.length; i++) {
      const b = bars[i];
      const prev = bars[i - 1];

      // 黃金 / 死亡交叉
      if (sma5[i - 1] != null && sma20[i - 1] != null && sma5[i] != null && sma20[i] != null) {
        if (sma5[i - 1] <= sma20[i - 1] && sma5[i] > sma20[i]) {
          events.push({ idx: i, type: "golden", color: "#facc15", shape: "arrowUp", pos: "belowBar", text: "黃金", desc: "5MA 上穿 20MA" });
        } else if (sma5[i - 1] >= sma20[i - 1] && sma5[i] < sma20[i]) {
          events.push({ idx: i, type: "death", color: "#3b82f6", shape: "arrowDown", pos: "aboveBar", text: "死叉", desc: "5MA 下穿 20MA" });
        }
      }

      // 鎚子（底部反轉）：下影線 ≥ 2× 實體、上影線 < 0.5× 實體、且前一根偏跌
      const body = Math.abs(b.close - b.open);
      const range = b.high - b.low;
      const upperWick = b.high - Math.max(b.open, b.close);
      const lowerWick = Math.min(b.open, b.close) - b.low;
      if (range > 0 && body > 0 && lowerWick >= 2 * body && upperWick <= 0.5 * body && prev.close < prev.open) {
        events.push({ idx: i, type: "hammer", color: "#22c55e", shape: "circle", pos: "belowBar", text: "鎚", desc: "下影線長、底部反轉" });
      }

      // 流星：上影線 ≥ 2× 實體、下影線 < 0.5× 實體、前一根偏漲
      if (range > 0 && body > 0 && upperWick >= 2 * body && lowerWick <= 0.5 * body && prev.close > prev.open) {
        events.push({ idx: i, type: "shoot", color: "#ef4444", shape: "circle", pos: "aboveBar", text: "流星", desc: "上影線長、頭部反轉" });
      }

      // 十字線：|open - close| / range < 0.1
      if (range > 0 && body / range < 0.1) {
        events.push({ idx: i, type: "doji", color: "#a855f7", shape: "square", pos: "aboveBar", text: "十字", desc: "開=收，多空拉鋸" });
      }

      // 長紅/綠 K：實體 ≥ 平均實體 × 2
      if (i >= 20) {
        const avgBody = bars.slice(i - 20, i).reduce((s, x) => s + Math.abs(x.close - x.open), 0) / 20;
        if (body >= 2 * avgBody) {
          if (b.close > b.open) {
            events.push({ idx: i, type: "bigRedK", color: "#dc2626", shape: "arrowUp", pos: "belowBar", text: "大紅", desc: "強買盤" });
          } else {
            events.push({ idx: i, type: "bigGreenK", color: "#16a34a", shape: "arrowDown", pos: "aboveBar", text: "大綠", desc: "強賣壓" });
          }
        }
      }
    }

    return events;
  }

  function refresh() {
    const sym = document.getElementById("pat-sym").value;
    const bars = allBars[sym];
    const events = detect(bars);

    // filter
    const want = {
      golden: document.getElementById("p-golden").checked,
      death: document.getElementById("p-death").checked,
      hammer: document.getElementById("p-hammer").checked,
      shoot: document.getElementById("p-shoot").checked,
      doji: document.getElementById("p-doji").checked,
      bigRedK: document.getElementById("p-bigK").checked,
      bigGreenK: document.getElementById("p-bigK").checked,
    };
    const filtered = events.filter(e => want[e.type]);

    drawChart(sym, bars, filtered);
    drawStats(bars, filtered);
  }

  function drawChart(sym, bars, events) {
    const el = document.getElementById("pat-chart");
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

    candle.setMarkers(events.map(e => ({
      time: bars[e.idx].time,
      position: e.pos,
      color: e.color,
      shape: e.shape,
      text: e.text,
    })));

    chart.timeScale().fitContent();
  }

  function drawStats(bars, events) {
    const types = ["golden", "death", "hammer", "shoot", "doji", "bigRedK", "bigGreenK"];
    const labels = {
      golden: "🟡 黃金交叉", death: "🔵 死亡交叉",
      hammer: "🟢 鎚子", shoot: "🔴 流星", doji: "🟣 十字線",
      bigRedK: "🔴 長紅 K", bigGreenK: "🟢 長綠 K",
    };

    const stats = {};
    for (const t of types) stats[t] = { count: 0, ret5: [], ret10: [], ret20: [] };

    for (const e of events) {
      const i0 = e.idx;
      if (i0 + 20 >= bars.length) continue;
      const p0 = bars[i0].close;
      const p5 = bars[i0 + 5]?.close;
      const p10 = bars[i0 + 10]?.close;
      const p20 = bars[i0 + 20]?.close;
      stats[e.type].count++;
      if (p5) stats[e.type].ret5.push((p5 - p0) / p0 * 100);
      if (p10) stats[e.type].ret10.push((p10 - p0) / p0 * 100);
      if (p20) stats[e.type].ret20.push((p20 - p0) / p0 * 100);
    }

    function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
    function winRate(arr) {
      if (!arr.length) return null;
      return arr.filter(x => x > 0).length / arr.length * 100;
    }

    let html = `<table><thead><tr>
      <th>型態</th><th>次數</th>
      <th>5 日平均報酬</th><th>5 日勝率</th>
      <th>10 日平均</th><th>10 日勝率</th>
      <th>20 日平均</th><th>20 日勝率</th>
    </tr></thead><tbody>`;

    for (const t of types) {
      const s = stats[t];
      if (s.count === 0) continue;
      const a5 = avg(s.ret5), a10 = avg(s.ret10), a20 = avg(s.ret20);
      const w5 = winRate(s.ret5), w10 = winRate(s.ret10), w20 = winRate(s.ret20);
      html += `<tr>
        <td>${labels[t]}</td>
        <td>${s.count}</td>
        <td style="color:${a5 >= 0 ? 'var(--red)' : 'var(--green)'}">${a5 != null ? C.fmtPct(a5) : '—'}</td>
        <td>${w5 != null ? C.fmt(w5, 1) + '%' : '—'}</td>
        <td style="color:${a10 >= 0 ? 'var(--red)' : 'var(--green)'}">${a10 != null ? C.fmtPct(a10) : '—'}</td>
        <td>${w10 != null ? C.fmt(w10, 1) + '%' : '—'}</td>
        <td style="color:${a20 >= 0 ? 'var(--red)' : 'var(--green)'}">${a20 != null ? C.fmtPct(a20) : '—'}</td>
        <td>${w20 != null ? C.fmt(w20, 1) + '%' : '—'}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    if (events.length === 0) html = `<p style="color:var(--text-dim)">沒勾選任何型態，或這檔股票沒有偵測到</p>`;
    document.getElementById("pat-stats").innerHTML = html;
  }

  return renderPatterns;
})();

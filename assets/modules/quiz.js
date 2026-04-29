// K 線猜謎：隨機選股 + 隨機選時段，遮住未來 20 根，猜漲/跌/盤整。
window.renderQuiz = (() => {
  const STORAGE_KEY = "stock_quiz_v1";
  const HIDDEN_DAYS = 20;
  const VISIBLE_DAYS = 60;
  const C = window.STOCK_COMMON;

  let dataIndex = null;
  let allBars = {};
  let stats = null;       // {correct, total, history}
  let currentQuiz = null; // {sym, startIdx, visibleBars, hiddenBars, answer}

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { correct: 0, total: 0, history: [] };
  }

  function saveStats() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }

  async function renderQuiz(contentEl, di) {
    dataIndex = di;
    contentEl.innerHTML = `<div class="loader">準備考題…</div>`;
    await Promise.all(Object.keys(dataIndex).map(async sym => {
      if (!allBars[sym]) {
        const r = await C.loadBars(sym);
        allBars[sym] = r.bars;
      }
    }));
    stats = loadStats();
    drawUI(contentEl);
    nextQuiz();
  }

  function drawUI(contentEl) {
    contentEl.innerHTML = `
      <h1>🎯 K 線猜謎</h1>
      <p>給你前 60 根 K 線，**遮住後 20 根**。請判斷之後 20 個交易日的走勢。</p>

      <div class="stat-grid" id="quiz-stats"></div>

      <div class="quiz-card">
        <h3 id="quiz-title" style="margin-top:0">第 1 題</h3>
        <div id="quiz-chart" style="height: 400px; margin: 1rem 0; border: 1px solid var(--border); border-radius: 6px"></div>

        <p style="text-align:center; font-size: 1.05rem">
          接下來 <strong style="color:var(--yellow)">${HIDDEN_DAYS} 個交易日</strong>，這檔股票會：
        </p>

        <div class="quiz-choices" id="quiz-choices">
          <button data-choice="up">📈 上漲<br><small>+2% 以上</small></button>
          <button data-choice="flat">↔️ 盤整<br><small>±2% 以內</small></button>
          <button data-choice="down">📉 下跌<br><small>-2% 以上</small></button>
        </div>

        <div id="quiz-result" style="display:none; margin-top:1rem; padding: 1rem; border-radius: 6px"></div>

        <div style="text-align:center; margin-top:1rem">
          <button id="btn-next" style="background:var(--accent); color:white; border:none; padding: 0.7rem 1.5rem; border-radius:6px; font-size: 1rem; cursor:pointer; display:none">下一題 →</button>
          <button id="btn-clear" style="background:#7f1d1d; color:white; border:none; padding: 0.5rem 1rem; border-radius:6px; cursor:pointer; margin-left:1rem">清除統計</button>
        </div>
      </div>

      <div id="quiz-history-area">
        <h3>📜 最近 10 題</h3>
        <div id="quiz-history"></div>
      </div>
    `;

    document.querySelectorAll("#quiz-choices button").forEach(btn => {
      btn.addEventListener("click", () => answer(btn.dataset.choice));
    });
    document.getElementById("btn-next").addEventListener("click", nextQuiz);
    document.getElementById("btn-clear").addEventListener("click", clearStats);
  }

  function nextQuiz() {
    const symbols = Object.keys(dataIndex);
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const bars = allBars[sym];
    // 起始索引：要至少 VISIBLE_DAYS + HIDDEN_DAYS 根
    const minStart = 0;
    const maxStart = bars.length - VISIBLE_DAYS - HIDDEN_DAYS;
    const startIdx = Math.floor(Math.random() * (maxStart - minStart)) + minStart;
    const visible = bars.slice(startIdx, startIdx + VISIBLE_DAYS);
    const hidden = bars.slice(startIdx + VISIBLE_DAYS, startIdx + VISIBLE_DAYS + HIDDEN_DAYS);

    const startPrice = visible[visible.length - 1].close;
    const endPrice = hidden[hidden.length - 1].close;
    const pct = ((endPrice - startPrice) / startPrice) * 100;
    let answer;
    if (pct > 2) answer = "up";
    else if (pct < -2) answer = "down";
    else answer = "flat";

    currentQuiz = { sym, startIdx, visible, hidden, answer, pct, startPrice, endPrice };

    document.getElementById("quiz-title").textContent =
      `第 ${stats.total + 1} 題　|　${sym} ${dataIndex[sym].name}　|　起點 ${visible[0].time}`;

    drawChart(visible, [], sym);
    document.querySelectorAll("#quiz-choices button").forEach(b => {
      b.classList.remove("correct", "wrong", "disabled");
      b.disabled = false;
    });
    document.getElementById("quiz-result").style.display = "none";
    document.getElementById("btn-next").style.display = "none";

    refreshStats();
    refreshHistory();
  }

  function drawChart(visible, hidden, sym) {
    const el = document.getElementById("quiz-chart");
    el.innerHTML = "";
    const chart = LightweightCharts.createChart(el, C.chartOpts(el));
    const col = C.colors(sym);
    const candle = chart.addCandlestickSeries({
      upColor: col.up, downColor: col.down,
      borderUpColor: col.up, borderDownColor: col.down,
      wickUpColor: col.up, wickDownColor: col.down,
    });
    const all = visible.concat(hidden);
    candle.setData(all.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));

    if (hidden.length > 0) {
      // 用 marker 標示「答案區開始」
      candle.setMarkers([
        {
          time: hidden[0].time,
          position: "aboveBar",
          color: "#eab308",
          shape: "arrowDown",
          text: "答案開始",
        },
      ]);
    }

    chart.timeScale().fitContent();
  }

  function answer(choice) {
    const correct = choice === currentQuiz.answer;
    stats.total += 1;
    if (correct) stats.correct += 1;
    stats.history.push({
      sym: currentQuiz.sym,
      date: currentQuiz.visible[0].time,
      guess: choice,
      answer: currentQuiz.answer,
      pct: currentQuiz.pct,
      correct,
    });
    saveStats();

    // 標出對錯
    document.querySelectorAll("#quiz-choices button").forEach(b => {
      b.disabled = true;
      b.classList.add("disabled");
      if (b.dataset.choice === currentQuiz.answer) b.classList.add("correct");
      if (b.dataset.choice === choice && !correct) b.classList.add("wrong");
    });

    // 重畫圖（顯示後 20 根）
    drawChart(currentQuiz.visible, currentQuiz.hidden, currentQuiz.sym);

    // 結果
    const msg = correct ? "✅ 答對！" : "❌ 答錯了";
    const moveText = currentQuiz.pct >= 0 ? `上漲 +${currentQuiz.pct.toFixed(2)}%` : `下跌 ${currentQuiz.pct.toFixed(2)}%`;
    const ansText = { up: "📈 上漲", flat: "↔️ 盤整", down: "📉 下跌" }[currentQuiz.answer];
    const result = document.getElementById("quiz-result");
    result.style.display = "block";
    result.style.background = correct ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";
    result.style.border = `1px solid ${correct ? "#22c55e" : "#ef4444"}`;
    result.innerHTML = `
      <strong>${msg}</strong><br>
      實際結果：${ansText}（${moveText}）<br>
      價格：$${C.fmt(currentQuiz.startPrice)} → $${C.fmt(currentQuiz.endPrice)}<br>
      <small style="color:var(--text-dim)">${currentQuiz.visible[0].time} ~ ${currentQuiz.hidden[currentQuiz.hidden.length - 1].time}</small>
    `;

    document.getElementById("btn-next").style.display = "inline-block";
    refreshStats();
    refreshHistory();
  }

  function refreshStats() {
    const acc = stats.total > 0 ? (stats.correct / stats.total * 100) : 0;
    const recent10 = stats.history.slice(-10);
    const recent10Correct = recent10.filter(h => h.correct).length;
    const recent10Acc = recent10.length > 0 ? (recent10Correct / recent10.length * 100) : 0;

    let comment;
    if (stats.total < 5) comment = "再多答幾題看看…";
    else if (acc >= 50) comment = "🎯 超過隨機猜中率！";
    else if (acc >= 33) comment = "等於隨機猜，K 線單看不準";
    else comment = "比隨機還差，逆操作可能更賺 🤣";

    document.getElementById("quiz-stats").innerHTML = `
      <div><small>總題數</small><strong>${stats.total}</strong></div>
      <div><small>答對</small><strong>${stats.correct}</strong></div>
      <div><small>累計答對率</small><strong>${C.fmt(acc, 1)}%</strong></div>
      <div><small>近 10 題答對率</small><strong>${C.fmt(recent10Acc, 1)}%</strong></div>
      <div><small>評語</small><strong style="font-size:0.95rem">${comment}</strong></div>
    `;
  }

  function refreshHistory() {
    const recent = stats.history.slice(-10).reverse();
    const el = document.getElementById("quiz-history");
    if (recent.length === 0) {
      el.innerHTML = `<p style="color:var(--text-dim)">尚無紀錄</p>`;
      return;
    }
    let html = `<table><thead><tr><th>標的</th><th>起點</th><th>你猜</th><th>實際</th><th>變動</th><th>結果</th></tr></thead><tbody>`;
    const labels = { up: "📈 漲", flat: "↔️ 盤整", down: "📉 跌" };
    for (const h of recent) {
      html += `<tr>
        <td>${h.sym}</td>
        <td>${h.date}</td>
        <td>${labels[h.guess]}</td>
        <td>${labels[h.answer]}</td>
        <td>${C.fmtPct(h.pct)}</td>
        <td>${h.correct ? "✅" : "❌"}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    el.innerHTML = html;
  }

  function clearStats() {
    if (!confirm("確定清除所有答題紀錄？")) return;
    localStorage.removeItem(STORAGE_KEY);
    stats = loadStats();
    refreshStats();
    refreshHistory();
  }

  return renderQuiz;
})();

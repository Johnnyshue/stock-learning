// FIRE 計算器
// 輸入：年支出、起始資金、月投入、年化報酬率、安全提領率
// 輸出：所需本金、達成年數、累積曲線圖
// 持久化：localStorage(key=fire_calc_v1)
window.renderFire = (() => {
  const STORAGE_KEY = "fire_calc_v1";

  const DEFAULTS = {
    annualExpense: 600000,    // 年支出（PGY 假設 60 萬）
    initialCapital: 0,        // 起始資金
    monthlyInvest: 20000,     // 月投入
    annualReturn: 7,          // 年化真實報酬率（扣通膨後）%
    swr: 4,                   // 安全提領率 % (4=25倍 / 3.5=28倍 / 3=33倍)
  };

  function loadInputs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULTS };
  }

  function saveInputs(inputs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }

  // 計算達到 FIRE 所需年數 + 每年累積資產（給畫圖）
  function project(inputs) {
    const { annualExpense, initialCapital, monthlyInvest, annualReturn, swr } = inputs;
    const targetCapital = annualExpense * (100 / swr);  // 25/28/33x
    const monthlyReturn = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;

    let capital = initialCapital;
    const history = [{ year: 0, month: 0, capital }];
    let yearsToFire = null;
    const maxMonths = 60 * 12;  // 最多 60 年

    for (let m = 1; m <= maxMonths; m++) {
      capital = capital * (1 + monthlyReturn) + monthlyInvest;
      if (m % 12 === 0) {
        history.push({ year: m / 12, month: m, capital });
      }
      if (yearsToFire === null && capital >= targetCapital) {
        yearsToFire = m / 12;
      }
    }

    return { targetCapital, yearsToFire, history };
  }

  function fmtMoney(n) {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)} 億`;
    if (n >= 10000) return `${(n / 10000).toFixed(0)} 萬`;
    return n.toLocaleString();
  }

  function render(contentEl) {
    const inputs = loadInputs();

    contentEl.innerHTML = `
      <h1>💰 FIRE 計算器</h1>
      <p>FIRE = Financial Independence Retire Early。輸入你的數字，算出達成被動收入 ≥ 年支出需要幾年。</p>

      <div class="fire-warn" style="background:#3a2a1a;border:1px solid #c9a45c;border-radius:6px;padding:0.8rem 1rem;margin:1rem 0;color:#e6b94a">
        ⚠️ <strong>免責</strong>：此工具基於數學公式（複利 + 4% 法則），假設報酬率與通膨穩定。<strong>過去績效不代表未來</strong>，實際結果會受市場、稅務、通膨偏離、突發支出影響。僅供規劃參考，不是承諾。
      </div>

      <div class="fire-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:1rem 0">
        <label class="fire-input">
          <span>年支出（NTD）</span>
          <input type="number" id="f-expense" value="${inputs.annualExpense}" min="100000" step="50000">
          <small style="color:var(--text-dim)">月支出 × 12</small>
        </label>

        <label class="fire-input">
          <span>起始資金（NTD）</span>
          <input type="number" id="f-capital" value="${inputs.initialCapital}" min="0" step="100000">
          <small style="color:var(--text-dim)">目前已有的投資資產</small>
        </label>

        <label class="fire-input">
          <span>月投入金額（NTD）</span>
          <input type="number" id="f-monthly" value="${inputs.monthlyInvest}" min="0" step="1000">
          <small style="color:var(--text-dim)">每月可定期定額金額</small>
        </label>

        <label class="fire-input">
          <span>年化真實報酬率 (%)</span>
          <input type="number" id="f-return" value="${inputs.annualReturn}" min="0" max="20" step="0.5">
          <small style="color:var(--text-dim)">扣通膨後。S&P 500 歷史 ~7%；保守 5%</small>
        </label>

        <label class="fire-input">
          <span>安全提領率 (%)</span>
          <select id="f-swr">
            <option value="4" ${inputs.swr == 4 ? "selected" : ""}>4%（25 倍年支出，標準）</option>
            <option value="3.5" ${inputs.swr == 3.5 ? "selected" : ""}>3.5%（28 倍，較保守）</option>
            <option value="3" ${inputs.swr == 3 ? "selected" : ""}>3%（33 倍，最保守）</option>
          </select>
          <small style="color:var(--text-dim)">越保守 = 越不容易破產</small>
        </label>
      </div>

      <div class="fire-result" id="fire-result"></div>

      <div id="fire-chart" style="margin-top:1.5rem;height:380px"></div>

      <div class="fire-presets" style="margin-top:2rem;padding:1rem;background:var(--card);border-radius:6px">
        <strong>📌 快速套用情境</strong>
        <div style="display:flex;flex-wrap:wrap;gap:0.6rem;margin-top:0.6rem">
          <button class="fire-preset" data-preset="pgy">PGY（年支出 60 萬，月存 2 萬）</button>
          <button class="fire-preset" data-preset="r1r2">R1-R2（年支出 80 萬，月存 4 萬）</button>
          <button class="fire-preset" data-preset="vs">VS 主治（年支出 120 萬，月存 8 萬）</button>
          <button class="fire-preset" data-preset="vs_aggressive">VS 積極（年支出 100 萬，月存 12 萬）</button>
        </div>
      </div>

      <details style="margin-top:1.5rem">
        <summary><strong>💡 算式說明</strong></summary>
        <ul style="margin-top:0.6rem;line-height:1.8">
          <li><strong>所需本金</strong> = 年支出 ÷ 安全提領率（如 4%）= 年支出 × 25</li>
          <li><strong>複利公式（月複利）</strong>：FV = PV × (1+r)^n + PMT × ((1+r)^n - 1) / r</li>
          <li><strong>真實報酬率</strong> = 名目報酬率 - 通膨率（避免通膨吃掉購買力）</li>
          <li><strong>安全提領率</strong>來源：Trinity Study (1998)，60/40 配置美股 + 美債歷史回測</li>
          <li><strong>本工具未考慮</strong>：稅務、二代健保補充保費、突發醫療/家庭支出、市場順序風險（sequence-of-returns risk）</li>
        </ul>
      </details>
    `;

    const inputIds = ["f-expense", "f-capital", "f-monthly", "f-return", "f-swr"];
    inputIds.forEach((id) => {
      document.getElementById(id).addEventListener("input", recalc);
      document.getElementById(id).addEventListener("change", recalc);
    });

    document.querySelectorAll(".fire-preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        const presets = {
          pgy: { annualExpense: 600000, initialCapital: 100000, monthlyInvest: 20000, annualReturn: 7, swr: 4 },
          r1r2: { annualExpense: 800000, initialCapital: 500000, monthlyInvest: 40000, annualReturn: 7, swr: 4 },
          vs: { annualExpense: 1200000, initialCapital: 2000000, monthlyInvest: 80000, annualReturn: 7, swr: 4 },
          vs_aggressive: { annualExpense: 1000000, initialCapital: 3000000, monthlyInvest: 120000, annualReturn: 7, swr: 3.5 },
        };
        const p = presets[preset];
        document.getElementById("f-expense").value = p.annualExpense;
        document.getElementById("f-capital").value = p.initialCapital;
        document.getElementById("f-monthly").value = p.monthlyInvest;
        document.getElementById("f-return").value = p.annualReturn;
        document.getElementById("f-swr").value = p.swr;
        recalc();
      });
    });

    recalc();
  }

  function recalc() {
    const inputs = {
      annualExpense: Number(document.getElementById("f-expense").value),
      initialCapital: Number(document.getElementById("f-capital").value),
      monthlyInvest: Number(document.getElementById("f-monthly").value),
      annualReturn: Number(document.getElementById("f-return").value),
      swr: Number(document.getElementById("f-swr").value),
    };
    saveInputs(inputs);

    const { targetCapital, yearsToFire, history } = project(inputs);
    const resultEl = document.getElementById("fire-result");
    const monthlyPassive = (targetCapital * inputs.swr / 100) / 12;

    if (yearsToFire === null) {
      resultEl.innerHTML = `
        <div style="background:#3a1a1a;border:1px solid #ef4444;border-radius:6px;padding:1rem;color:#fca5a5">
          ❌ <strong>60 年內達不到</strong>。需要本金 ${fmtMoney(targetCapital)}，但你的設定累積不到。
          <br>建議：提高月投入、提高報酬率、降低年支出，或調整安全提領率。
        </div>
      `;
    } else {
      const ageNote = yearsToFire <= 15 ? "⚡ 非常快" : yearsToFire <= 25 ? "🟢 務實" : yearsToFire <= 35 ? "🟡 偏慢" : "🔴 太慢";
      resultEl.innerHTML = `
        <div class="fire-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-top:1rem">
          <div style="background:var(--card);padding:1rem;border-radius:6px;border-left:4px solid #58a6ff">
            <small style="color:var(--text-dim)">🎯 所需 FIRE 本金</small>
            <div style="font-size:1.6rem;font-weight:bold;margin-top:0.3rem">${fmtMoney(targetCapital)}</div>
            <small style="color:var(--text-dim)">= 年支出 × ${(100/inputs.swr).toFixed(0)}</small>
          </div>
          <div style="background:var(--card);padding:1rem;border-radius:6px;border-left:4px solid #22c55e">
            <small style="color:var(--text-dim)">⏱ 達成年數</small>
            <div style="font-size:1.6rem;font-weight:bold;margin-top:0.3rem">${yearsToFire.toFixed(1)} 年</div>
            <small style="color:var(--text-dim)">${ageNote}</small>
          </div>
          <div style="background:var(--card);padding:1rem;border-radius:6px;border-left:4px solid #eab308">
            <small style="color:var(--text-dim)">💵 達成後月被動收入</small>
            <div style="font-size:1.6rem;font-weight:bold;margin-top:0.3rem">${fmtMoney(monthlyPassive)}</div>
            <small style="color:var(--text-dim)">= 年支出 ÷ 12</small>
          </div>
          <div style="background:var(--card);padding:1rem;border-radius:6px;border-left:4px solid #a855f7">
            <small style="color:var(--text-dim)">📥 累積投入本金</small>
            <div style="font-size:1.6rem;font-weight:bold;margin-top:0.3rem">${fmtMoney(inputs.initialCapital + inputs.monthlyInvest * 12 * yearsToFire)}</div>
            <small style="color:var(--text-dim)">複利賺 ${fmtMoney(targetCapital - inputs.initialCapital - inputs.monthlyInvest * 12 * yearsToFire)}</small>
          </div>
        </div>
      `;
    }

    drawChart(history, targetCapital, yearsToFire);
  }

  function drawChart(history, target, yearsToFire) {
    const el = document.getElementById("fire-chart");
    el.innerHTML = "";
    if (!window.LightweightCharts) {
      el.innerHTML = `<p style="color:var(--text-dim)">圖表載入失敗</p>`;
      return;
    }

    const chart = LightweightCharts.createChart(el, {
      width: el.clientWidth,
      height: 380,
      layout: { background: { color: "#161b22" }, textColor: "#e6edf3" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      timeScale: { borderColor: "#30363d" },
      rightPriceScale: { borderColor: "#30363d" },
    });

    // 累積資產曲線
    const series = chart.addAreaSeries({
      lineColor: "#58a6ff",
      topColor: "rgba(88,166,255,0.4)",
      bottomColor: "rgba(88,166,255,0.05)",
      lineWidth: 2,
      title: "資產累積",
    });
    // 用「年」當 timestamp（換算成假日期）
    const baseTime = Math.floor(new Date().getTime() / 1000);
    series.setData(history.map((h) => ({
      time: baseTime + h.month * 30 * 86400,
      value: h.capital,
    })));

    // 目標線
    const targetLine = chart.addLineSeries({
      color: "#ef4444",
      lineWidth: 2,
      lineStyle: 2,
      title: "FIRE 目標",
    });
    targetLine.setData(history.map((h) => ({
      time: baseTime + h.month * 30 * 86400,
      value: target,
    })));

    chart.timeScale().fitContent();
  }

  return render;
})();

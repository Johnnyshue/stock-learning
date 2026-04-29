// 共用工具：資料載入、台/美股顏色、圖表選項
window.STOCK_COMMON = (() => {
  async function loadBars(symbol) {
    const file = symbol.replace(".", "_") + ".json";
    const r = await fetch(`data/${file}`);
    if (!r.ok) throw new Error(`無法載入 ${file}`);
    return r.json();
  }

  function isTW(symbol) {
    return symbol.endsWith(".TW");
  }

  function colors(symbol) {
    const tw = isTW(symbol);
    return {
      up: tw ? "#ef4444" : "#22c55e",
      down: tw ? "#22c55e" : "#ef4444",
    };
  }

  function chartOpts(el, hideTime = false) {
    return {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: { background: { color: "#161b22" }, textColor: "#e6edf3" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false, visible: !hideTime },
      rightPriceScale: { borderColor: "#30363d" },
      crosshair: { mode: 1 },
    };
  }

  function fmt(n, d = 2) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toFixed(d);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return "—";
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return "—";
    return Math.round(n).toLocaleString();
  }

  // 計算 N 日移動平均
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

  return { loadBars, isTW, colors, chartOpts, fmt, fmtPct, fmtMoney, rollingMean };
})();

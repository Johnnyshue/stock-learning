'use strict';

// ===== 內建模板（唯讀，不可刪除）=====
const BUILTIN_TEMPLATES = [
  // --- 事件選股 ---
  {
    id: 'builtin-1',
    category: '事件選股',
    title: '事件概念股 Top5 篩選',
    content: '最近發生了【事件，例如：伊朗衝突、AI晶片禁令、颱風災害】，請幫我從全球/台股市場中，找出最受惠的 Top 5 概念股，並針對每一支股票提供：\n1. 受惠邏輯（為什麼這支股票會受益）\n2. 主要風險（此次事件對它的潛在威脅）\n3. 近期殖利率\n4. 建議的觀察重點\n\n請以表格形式呈現，最後附上整體市場背景說明。',
    builtin: true
  },
  {
    id: 'builtin-2',
    category: '事件選股',
    title: '黑天鵝事件防禦選股',
    content: '目前市場出現【黑天鵝事件，例如：VIX 飆破 40、美聯儲緊急降息、地緣政治危機】，請幫我找出在此類極端市場環境下：\n1. 防禦型股票（低波動、高殖利率）Top 5\n2. 逆向機會股（被錯殺、具基本面支撐）Top 5\n\n條件：月 KD 低檔、現金殖利率 > 5%、市值 > 50 億。\n請附受惠邏輯與主要風險。',
    builtin: true
  },
  {
    id: 'builtin-3',
    category: '事件選股',
    title: '題材輪動追蹤',
    content: '請分析【題材名稱，例如：AI 伺服器、電動車供應鏈、低軌衛星】這個投資題材：\n1. 目前題材發展到哪個階段（醞釀期/爆發期/退燒期）？\n2. 台股中受惠程度最高的 5 家公司是哪些？\n3. 題材的催化劑（什麼事件會讓股價繼續上漲）？\n4. 題材結束的風險訊號是什麼？\n\n請以具體數字與公司名稱說明。',
    builtin: true
  },

  // --- 財報分析 ---
  {
    id: 'builtin-4',
    category: '財報分析',
    title: '個股財報快篩',
    content: '請幫我分析【股票代號或公司名稱，例如：2330 台積電】的最新財報，提供以下重點：\n1. 營收 YoY（年增率）與 MoM（月增率）趨勢\n2. 毛利率與營業利益率變化\n3. EPS 趨勢（近 4 季）\n4. 本益比（P/E）的合理性評估（對比同業、歷史區間）\n5. 一句話結論：目前財報體質偏強/偏弱/持平\n\n請條列清楚，附上數字依據。',
    builtin: true
  },
  {
    id: 'builtin-5',
    category: '財報分析',
    title: '法說會重點解讀',
    content: '以下是【公司名稱】最新法說會的逐字稿/重點摘要：\n\n【貼上法說會內容】\n\n請幫我解析：\n1. 管理層對未來展望的態度（樂觀/保守/迴避）\n2. 本季最大的正面驚喜與負面警訊各是什麼？\n3. 下一季財測是否可信？有無保守或過於樂觀的跡象？\n4. 這場法說會對股價的短中長期影響評估\n5. 我應該追問的 3 個問題（若有機會提問）',
    builtin: true
  },
  {
    id: 'builtin-6',
    category: '財報分析',
    title: '重大公告影響評估',
    content: '【公司名稱】今天公告：【貼上公告內容】\n\n請幫我評估：\n1. 這份公告對公司基本面的實質影響（正面/負面/中性）\n2. 預估對股價的短期（1 週）、中期（1 季）影響幅度\n3. 機構法人可能的解讀角度\n4. 散戶最常見的誤解或過度反應\n5. 建議的應對策略（持有/加碼/減碼/觀望）',
    builtin: true
  },

  // --- 產業研究 ---
  {
    id: 'builtin-7',
    category: '產業研究',
    title: '產業鏈完整拆解',
    content: '請幫我拆解【產業名稱，例如：HBM 高頻寬記憶體】的完整產業鏈：\n1. 上游（原材料、設備供應商）\n2. 中游（製造、封測）\n3. 下游（品牌、系統整合商）\n\n針對每個環節：\n- 列出全球與台灣的龍頭企業\n- 各環節的毛利率水準\n- 目前競爭格局（寡頭/競爭激烈/技術壁壘高）\n\n最後：哪個環節是目前最值得關注的投資機會？',
    builtin: true
  },
  {
    id: 'builtin-8',
    category: '產業研究',
    title: '競爭格局分析',
    content: '請分析【產業或市場，例如：台灣 DRAM 封裝測試市場】的競爭格局：\n1. 主要玩家市占率排名（前 5 名）\n2. 各家差異化策略與核心競爭優勢\n3. 新進者的威脅程度（進入門檻）\n4. 未來 2 年可能的市場份額變動\n5. 護城河最寬的公司是哪家？為什麼？\n\n請提供具體數字與案例佐證。',
    builtin: true
  },

  // --- 風險評估 ---
  {
    id: 'builtin-9',
    category: '風險評估',
    title: '個股下檔風險評估',
    content: '請幫我評估持有【股票代號/公司名稱】的下檔風險：\n1. 技術面支撐位（短中長期均線、重要整理平台）\n2. 流動性風險（日均成交量、外資持股比例）\n3. 籌碼面分析（主力、外資、投信近期動向）\n4. 基本面地雷風險（債務、現金流、客戶集中度）\n5. 最壞情境下，股價可能的跌幅（%）與原因\n\n請給出明確的「停損建議價位」與依據。',
    builtin: true
  },
  {
    id: 'builtin-10',
    category: '風險評估',
    title: '投資組合集中度檢查',
    content: '我的持股如下：\n【貼上持股清單，例如：台積電 30%、聯發科 20%、鴻海 15%…】\n\n請幫我分析：\n1. 類股/題材集中度是否過高？\n2. 景氣敏感度：若 GDP 下滑 2%，估計整體影響？\n3. 匯率風險暴露程度（美元、日圓…）\n4. 建議調整哪些部位以降低整體波動？\n5. 是否有明顯的因子重疊（例如：全部都是 AI 受惠股）？',
    builtin: true
  }
];

// ===== Storage key =====
const USER_KEY = 'userTemplates';

// ===== State =====
let currentCategory = 'all';
let searchQuery = '';
let userTemplates = [];

// ===== DOM refs =====
const searchInput    = document.getElementById('searchInput');
const categoryTabs   = document.getElementById('categoryTabs');
const templateList   = document.getElementById('templateList');
const modalOverlay   = document.getElementById('modalOverlay');
const modalTitle     = document.getElementById('modalTitle');
const formTitle      = document.getElementById('formTitle');
const formCategory   = document.getElementById('formCategory');
const formContent    = document.getElementById('formContent');
const btnAdd         = document.getElementById('btnAddTemplate');
const btnSave        = document.getElementById('btnSaveTemplate');
const btnCancel      = document.getElementById('btnCancelModal');
const btnExport      = document.getElementById('btnExport');
const btnImportTrig  = document.getElementById('btnImportTrigger');
const importInput    = document.getElementById('importFileInput');
const toastEl        = document.getElementById('toast');

// ===== Init =====
function init() {
  loadUserTemplates();
  render();
  bindEvents();
}

// ===== Load / Save user templates =====
function loadUserTemplates() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    userTemplates = raw ? JSON.parse(raw) : [];
  } catch {
    userTemplates = [];
  }
}

function saveUserTemplates() {
  localStorage.setItem(USER_KEY, JSON.stringify(userTemplates));
}

// ===== Get filtered templates =====
function getFiltered() {
  const all = [...BUILTIN_TEMPLATES, ...userTemplates];
  return all.filter(t => {
    const matchCat = currentCategory === 'all' || t.category === currentCategory;
    const q = searchQuery.toLowerCase();
    const matchQ = !q ||
      t.title.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q);
    return matchCat && matchQ;
  });
}

// ===== Detect placeholders like 【...】=====
function detectPlaceholders(text) {
  const matches = text.match(/【[^】]+】/g);
  return matches ? [...new Set(matches)] : [];
}

// ===== Render =====
function render() {
  const filtered = getFiltered();
  templateList.innerHTML = '';

  if (filtered.length === 0) {
    templateList.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <div>找不到符合條件的模板</div>
      </div>`;
    return;
  }

  filtered.forEach(t => {
    const placeholders = detectPlaceholders(t.content);
    const hasPlaceholders = placeholders.length > 0;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">${escHtml(t.title)}</div>
        <span class="card-badge badge-${t.category}">${escHtml(t.category)}</span>
      </div>
      <div class="card-content">${escHtml(t.content)}</div>
      ${hasPlaceholders
        ? `<div class="placeholder-hint">包含可替換欄位：${placeholders.map(p => escHtml(p)).join('、')}</div>`
        : ''}
      <div class="card-actions">
        <button class="btn-copy" data-id="${t.id}">複製 Prompt</button>
        ${!t.builtin
          ? `<button class="btn-delete" data-id="${t.id}">刪除</button>`
          : ''}
      </div>`;
    templateList.appendChild(card);
  });
}

// ===== Escape HTML =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== Copy =====
async function copyTemplate(id) {
  const all = [...BUILTIN_TEMPLATES, ...userTemplates];
  const t = all.find(x => x.id === id);
  if (!t) return;

  try {
    await navigator.clipboard.writeText(t.content);
    const placeholders = detectPlaceholders(t.content);
    if (placeholders.length > 0) {
      showToast(`已複製！請替換：${placeholders.join('、')}`);
    } else {
      showToast('已複製到剪貼簿 ✓');
    }
  } catch {
    // Fallback for environments where clipboard API is restricted
    const ta = document.createElement('textarea');
    ta.value = t.content;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('已複製到剪貼簿 ✓');
    } catch {
      showToast('複製失敗，請手動選取');
    }
    document.body.removeChild(ta);
  }
}

// ===== Delete user template =====
function deleteTemplate(id) {
  userTemplates = userTemplates.filter(t => t.id !== id);
  saveUserTemplates();
  render();
  showToast('已刪除');
}

// ===== Modal open / close =====
function openAddModal() {
  modalTitle.textContent = '新增模板';
  formTitle.value = '';
  formCategory.value = currentCategory !== 'all' ? currentCategory : '自訂';
  formContent.value = '';
  modalOverlay.classList.remove('hidden');
  formTitle.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}

// ===== Save new template =====
function saveTemplate() {
  const title = formTitle.value.trim();
  const category = formCategory.value;
  const content = formContent.value.trim();

  if (!title) { showToast('請輸入標題'); formTitle.focus(); return; }
  if (!content) { showToast('請輸入內容'); formContent.focus(); return; }

  const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  userTemplates.push({ id, title, category, content, builtin: false });
  saveUserTemplates();
  closeModal();
  render();
  showToast('模板已儲存 ✓');
}

// ===== Export =====
function exportTemplates() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userTemplates
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-invest-prompts-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('匯出完成 ✓');
}

// ===== Import =====
function importTemplates(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let imported = [];
      if (Array.isArray(data)) {
        imported = data;
      } else if (data.userTemplates && Array.isArray(data.userTemplates)) {
        imported = data.userTemplates;
      } else {
        showToast('JSON 格式不正確');
        return;
      }
      // Validate & assign new IDs to avoid collision
      let count = 0;
      imported.forEach(t => {
        if (t.title && t.content && t.category) {
          const id = 'import-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
          userTemplates.push({ ...t, id, builtin: false });
          count++;
        }
      });
      saveUserTemplates();
      render();
      showToast(`匯入 ${count} 個模板 ✓`);
    } catch {
      showToast('JSON 解析失敗');
    }
  };
  reader.readAsText(file, 'utf-8');
  // Reset so same file can be re-imported
  importInput.value = '';
}

// ===== Toast =====
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

// ===== Bind events =====
function bindEvents() {
  // Search
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    render();
  });

  // Category tabs
  categoryTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    categoryTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentCategory = tab.dataset.cat;
    render();
  });

  // Card actions (copy / delete) via delegation
  templateList.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy');
    const delBtn  = e.target.closest('.btn-delete');
    if (copyBtn) copyTemplate(copyBtn.dataset.id);
    if (delBtn)  deleteTemplate(delBtn.dataset.id);
  });

  // Modal
  btnAdd.addEventListener('click', openAddModal);
  btnCancel.addEventListener('click', closeModal);
  btnSave.addEventListener('click', saveTemplate);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard: Enter to save, Escape to close
  document.addEventListener('keydown', (e) => {
    if (!modalOverlay.classList.contains('hidden')) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Enter' && e.ctrlKey) saveTemplate();
    }
  });

  // Export / Import
  btnExport.addEventListener('click', exportTemplates);
  btnImportTrig.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => importTemplates(importInput.files[0]));
}

// ===== Start =====
init();

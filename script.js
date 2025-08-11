/* Merged app JS: original app logic + Settings (currency & category management)
   + Dashboard enhancements: colored category pie, income/expense bar, counts, time-range switch.
   Preserves original features: transactions, filters, CSV import/export, reports, charts.
*/
(() => {
  'use strict';

  // --- defaults (original categories from your initial code) ---
  const DEFAULT_CATEGORIES = {
    income: ["Salary","Business","Interest","Investment","Gift","Rental Income","Bonus","Refund","Other Income"],
    expense: ["Food & Dining","Groceries","Transport","Fuel","Rent","Utilities","Shopping","Health","Insurance","Education","Entertainment","Travel","Housing","Taxes","Loan","Subscriptions","Gifts","Personal Care","Repairs","Other Expense"]
  };

  // --- storage keys (preserve original keys) ---
  const STORAGE_KEY = "expenseApp_transactions_v1";
  const REPORTS_KEY = "expenseApp_reports_v1";
  const CATEGORIES_KEY = "expenseApp_categories_v1";
  const CURRENCY_KEY = "expenseApp_currency_v1";

  // --- utility helpers ---
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function load(key){ try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch(e){ console.error(e); return null; } }
  function save(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){ console.error(e); } }

  // currency symbol (persisted)
  let currencySymbol = (function(){ const v = load(CURRENCY_KEY); return v || 'uc0u8377 '; })();

  function formatCurrency(n){
    // strict conversion and digit-by-digit formatting
    const num = Number(n) || 0;
    const abs = Math.abs(num);
    const formatted = abs.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
    return (num < 0 ? '- ' : '') + (currencySymbol || 'uc0u8377 ') + formatted;
  }

  // --- categories persistence & management ---
  function loadCategories(){
    const stored = load(CATEGORIES_KEY);
    if (stored && Array.isArray(stored.income) && Array.isArray(stored.expense)) return stored;
    return { income: DEFAULT_CATEGORIES.income.slice(), expense: DEFAULT_CATEGORIES.expense.slice() };
  }
  function saveCategories(cats){ save(CATEGORIES_KEY, cats); }

  let CATEGORIES = loadCategories();

  // --- DOM refs ---
  const menuBtns = $$('.menu-btn');
  const sections = {
    add: $('#section-add'),
    filter: $('#section-filter'),
    dashboard: $('#section-dashboard'),
    reports: $('#section-reports'),
    settings: $('#section-settings')
  };

  // add form
  const typeEl = $('#type'), categoryEl = $('#category'), dateEl = $('#date'), amountEl = $('#amount'), noteEl = $('#note'), formEl = $('#transactionForm'), saveBtn = $('#saveBtn'), resetFormBtn = $('#resetFormBtn');

  // filters / transactions table
  const filterFrom = $('#filterFrom'), filterTo = $('#filterTo'), filterType = $('#filterType'), filterCategory = $('#filterCategory'), filterSearch = $('#filterSearch'), applyFilterBtn = $('#applyFilterBtn'), clearFilterBtn = $('#clearFilterBtn');
  const transactionTableBody = document.querySelector('#transactionTable tbody');

  // dashboard
  const totalIncomeEl = $('#totalIncome'), totalExpenseEl = $('#totalExpense'), balanceEl = $('#balance');
  const totalIncomeCountEl = $('#totalIncomeCount'), totalExpenseCountEl = $('#totalExpenseCount');
  const dashboardRangeSelect = $('#dashboardRangeSelect');
  let categoryChart, monthlyChart;

  // reports UI
  const reportsListEl = $('#reportsList'), newReportNameEl = $('#newReportName'), addReportBtn = $('#addReportBtn');
  const reportModal = $('#reportModal'), reportModalTitle = $('#reportModalTitle'), reportTxTableBody = document.querySelector('#reportTxTable tbody'), reportTotalsEl = $('#reportTotals');
  const addTxToReportSelect = $('#addTxToReportSelect'), addTxToReportBtn = $('#addTxToReportBtn'), closeReportModalBtn = $('#closeReportModal');
  const exportReportCsvBtn = $('#exportReportCsvBtn'), printReportModalBtn = $('#printReportModalBtn');

  // header actions / csv import
  const exportCsvBtn = $('#exportCsvBtn'), printReportBtn = $('#printReportBtn'), clearAllBtn = $('#clearAllBtn'), csvFileInput = $('#csvFileInput');
  const csvMapModal = $('#csvMapModal'), csvMapControls = $('#csvMapControls'), csvPreview = $('#csvPreview'), applyCsvMapBtn = $('#applyCsvMapBtn'), closeCsvMapModal = $('#closeCsvMapModal');

  // settings UI
  const currencySelect = $('#currencySelect'), customCurrencyLabel = $('#customCurrencyLabel'), customCurrencyInput = $('#customCurrency'), saveCurrencyBtn = $('#saveCurrencyBtn');
  const expenseCategoryList = $('#expenseCategoryList'), incomeCategoryList = $('#incomeCategoryList'), addExpenseCategoryBtn = $('#addExpenseCategoryBtn'), addIncomeCategoryBtn = $('#addIncomeCategoryBtn'), newExpenseCategory = $('#newExpenseCategory'), newIncomeCategory = $('#newIncomeCategory');

  // --- state ---
  let transactions = load(STORAGE_KEY) || [];
  let reports = load(REPORTS_KEY) || [];
  let editingId = null;
  let currentReportId = null;
  let csvToImport = null; // holds parsed csv rows and headers during import

  // --- UI navigation ---
  menuBtns.forEach(btn => btn.addEventListener('click', () => {
    menuBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
    const sec = btn.dataset.section;
    for (const k in sections) sections[k].style.display = (k === sec) ? '' : 'none';
    if (sec === 'filter') applyFiltersAndRender();
    if (sec === 'dashboard') updateDashboardAndCharts(); // uses dashboard range
    if (sec === 'reports') renderReportsList();
    if (sec === 'settings') renderCategorySettingsLists();
  }));

  // --- categories population ---
  function populateCategorySelects(){
    categoryEl.innerHTML = '';
    const arr = typeEl.value === 'income' ? CATEGORIES.income : CATEGORIES.expense;
    arr.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; categoryEl.appendChild(o); });

    // filter includes all
    filterCategory.innerHTML = '<option value="all">All</option>';
    const allCats = [...new Set([...CATEGORIES.income, ...CATEGORIES.expense])];
    allCats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; filterCategory.appendChild(o); });
  }
  typeEl.addEventListener('change', populateCategorySelects);

  // --- render transactions in filter view ---
  function renderTransactions(list){
    transactionTableBody.innerHTML = '';
    if (!list.length) {
      transactionTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted)">No transactions</td></tr>`;
      return;
    }
    list.slice().sort((a,b)=> new Date(b.date) - new Date(a.date)).forEach(tx => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${tx.date}</td>
        <td>${tx.type === 'income' ? '<span style="color:var(--success)">Income</span>' : '<span style="color:var(--danger)">Expense</span>'}</td>
        <td>${escapeHtml(tx.category)}</td>
        <td>${formatCurrency(tx.amount)}</td>
        <td>${escapeHtml(tx.note || '')}</td>
        <td>
          <button class="edit-btn" data-id="${tx.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="del-btn" data-id="${tx.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      transactionTableBody.appendChild(tr);
    });

    // wire actions
    $$('.del-btn').forEach(b => b.onclick = (e) => {
      const id = e.currentTarget.dataset.id;
      if (!confirm('Delete this transaction?')) return;
      transactions = transactions.filter(t => t.id !== id);
      // remove from reports too
      reports.forEach(r => r.txIds = (r.txIds || []).filter(tid => tid !== id));
      saveState();
      applyFiltersAndRender();
    });

    $$('.edit-btn').forEach(b => b.onclick = (e) => {
      const id = e.currentTarget.dataset.id;
      const tx = transactions.find(t => t.id === id);
      if (!tx) return alert('Transaction not found');
      editingId = id;
      typeEl.value = tx.type;
      populateCategorySelects();
      categoryEl.value = tx.category;
      dateEl.value = tx.date;
      amountEl.value = tx.amount;
      noteEl.value = tx.note || '';
      saveBtn.textContent = 'Update';
      // switch to Add tab
      menuBtns.forEach(b => b.classList.remove('active'));
      $('.menu-btn[data-section="add"]').classList.add('active');
      for (const k in sections) sections[k].style.display = (k === 'add') ? '' : 'none';
    });
  }

  // --- add / update transaction ---
  formEl.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const type = typeEl.value, category = categoryEl.value, date = dateEl.value, amount = Number(amountEl.value), note = noteEl.value.trim();
    if (!date || !category || !amount || amount <= 0) return alert('Please provide valid date, category and amount (>0).');
    if (editingId) {
      const idx = transactions.findIndex(t => t.id === editingId);
      if (idx === -1) return alert('Transaction not found');
      transactions[idx] = { ...transactions[idx], type, category, date, amount, note };
      editingId = null;
      saveBtn.textContent = 'Add';
    } else {
      transactions.push({ id: uid(), type, category, date, amount, note, createdAt: new Date().toISOString() });
    }
    saveState();
    resetFormState();
    applyFiltersAndRender();
    updateDashboardAndCharts();
  });

  resetFormBtn.addEventListener('click', resetFormState);
  function resetFormState(){ editingId = null; saveBtn.textContent = 'Add'; formEl.reset(); populateCategorySelects(); dateEl.valueAsDate = new Date(); }

  // --- filters ---
  function getFilteredTransactions(){
    let out = transactions.slice();
    const from = filterFrom.value ? new Date(filterFrom.value) : null;
    const to = filterTo.value ? new Date(filterTo.value) : null;
    const fType = filterType.value, fCat = filterCategory.value, search = (filterSearch.value || '').trim().toLowerCase();
    out = out.filter(tx => {
      const d = new Date(tx.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (fType !== 'all' && tx.type !== fType) return false;
      if (fCat !== 'all' && tx.category !== fCat) return false;
      if (search) {
        const s = `${tx.note || ''} ${tx.amount}`.toLowerCase();
        if (!s.includes(search)) return false;
      }
      return true;
    });
    return out;
  }
  applyFilterBtn.addEventListener('click', applyFiltersAndRender);
  clearFilterBtn.addEventListener('click', () => { filterFrom.value = ''; filterTo.value = ''; filterType.value = 'all'; filterCategory.value = 'all'; filterSearch.value = ''; applyFiltersAndRender(); });

  function applyFiltersAndRender(){ const list = getFilteredTransactions(); renderTransactions(list); updateDashboardAndCharts(list); }

  // --- helper: filter by dashboard range (month/year/all) ---
  function filterByRange(list, range){
    if (!range || range === 'all') return list.slice();
    const now = new Date();
    return list.filter(tx => {
      const d = new Date(tx.date);
      if (range === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (range === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  }

  // --- charts & dashboard ---
  function ensureCharts(){
    if (!categoryChart) {
      const ctx = document.getElementById('categoryChart').getContext('2d');
      categoryChart = new Chart(ctx, { type: 'pie', data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    }
    if (!monthlyChart) {
      const ctx2 = document.getElementById('monthlyChart').getContext('2d');
      monthlyChart = new Chart(ctx2, { type: 'bar', data: { labels: [], datasets: [{ label: 'Income', data: [], backgroundColor: [] }, { label: 'Expense', data: [], backgroundColor: [] }] }, options: { scales: { x: { stacked: true }, y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } } });
    }
  }

  function generatePalette(n){
    // generate n distinct HSL colors
    const colors = [];
    for (let i=0;i<n;i++){
      const hue = Math.round((i * 360 / Math.max(1,n)));
      colors.push(`hsl(${hue}, 65%, 55%)`);
    }
    return colors;
  }

  /**
   * updateDashboardAndCharts(list)
   * - If `list` is provided, use it (this is how the Filter view drives charts).
   * - If no `list` provided, use all transactions but apply dashboard range filter (All/Month/Year).
   */
  function updateDashboardAndCharts(list){
    let data = Array.isArray(list) ? list.slice() : transactions.slice();
    // only apply dashboard range if no explicit list was passed (so filter view remains authoritative)
    if (!Array.isArray(list) && dashboardRangeSelect) {
      data = filterByRange(data, dashboardRangeSelect.value);
    }

    // totals & counts
    let income = 0, expense = 0, incomeCount = 0, expenseCount = 0;
    data.forEach(tx => {
      if (tx.type === 'income') { income += Number(tx.amount); incomeCount++; } else { expense += Number(tx.amount); expenseCount++; }
    });

    totalIncomeEl.textContent = formatCurrency(income);
    totalExpenseEl.textContent = formatCurrency(expense);
    balanceEl.textContent = formatCurrency(income - expense);
    totalIncomeCountEl.textContent = incomeCount;
    totalExpenseCountEl.textContent = expenseCount;

    // charts
    ensureCharts();

    // category pie: aggregate by category (both income & expense combined '97 preserves original behavior)
    const catMap = {};
    data.forEach(tx => { const c = tx.category || 'Uncategorized'; catMap[c] = (catMap[c] || 0) + Number(tx.amount); });
    const labels = Object.keys(catMap);
    const values = labels.map(l => parseFloat(catMap[l].toFixed(2)));
    const colors = generatePalette(labels.length);

    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = values;
    categoryChart.data.datasets[0].backgroundColor = colors;
    categoryChart.update();

    // monthly bar chart: last 12 months relative to now
    const now = new Date();
    const months = [];
    for (let i=11;i>=0;i--){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push({ key: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'), label: d.toLocaleString(undefined,{month:'short', year:'numeric'}) });
    }
    const incSeries = Array(months.length).fill(0), expSeries = Array(months.length).fill(0);
    data.forEach(tx => {
      if (!tx.date) return;
      const d = new Date(tx.date);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      const idx = months.findIndex(m => m.key === key);
      if (idx === -1) return;
      if (tx.type === 'income') incSeries[idx] += Number(tx.amount);
      else expSeries[idx] += Number(tx.amount);
    });

    monthlyChart.data.labels = months.map(m => m.label);
    monthlyChart.data.datasets[0].label = 'Income';
    monthlyChart.data.datasets[0].data = incSeries.map(v => parseFloat(v.toFixed(2)));
    monthlyChart.data.datasets[0].backgroundColor = generatePalette(1).map(() => 'rgba(22,163,74,0.85)'); // green
    monthlyChart.data.datasets[1].label = 'Expense';
    monthlyChart.data.datasets[1].data = expSeries.map(v => parseFloat(v.toFixed(2)));
    monthlyChart.data.datasets[1].backgroundColor = generatePalette(1).map(() => 'rgba(239,68,68,0.85)'); // red
    monthlyChart.update();
  }

  // when dashboard range changes, update charts (only when viewing dashboard)
  if (dashboardRangeSelect) {
    dashboardRangeSelect.addEventListener('change', () => {
      // update only when on dashboard: check if dashboard visible
      if (sections.dashboard.style.display !== 'none') updateDashboardAndCharts();
    });
  }

  // --- CSV export & print (filtered) ---
  exportCsvBtn.addEventListener('click', () => {
    const list = getFilteredTransactions();
    exportTransactionsToCSV(list, `transactions_${new Date().toISOString().slice(0,10)}.csv`);
  });

  printReportBtn.addEventListener('click', () => {
    const list = getFilteredTransactions().slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
    const html = makePrintableHtml(list, 'Filtered Transactions');
    const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.focus(); w.print();
  });

  function makePrintableHtml(list, title){
    return `<html><head><title>${title}</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ddd;text-align:left}</style></head><body><h2>${title}</h2><p>Generated: ${new Date().toLocaleString()}</p><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead><tbody>${list.map(tx=>`<tr><td>${tx.date}</td><td>${tx.type}</td><td>${escapeHtml(tx.category)}</td><td>${Number(tx.amount).toFixed(2)}</td><td>${escapeHtml(tx.note||'')}</td></tr>`).join('')}</tbody></table></body></html>`;
  }

  function exportTransactionsToCSV(list, filename){
    const header = ['id','date','type','category','amount','note','createdAt'];
    const rows = list.map(tx => header.map(h => `"${String(tx[h] ?? '')}"`).join(','));
    const csv = [header.join(','), ...rows].join('n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  // --- clear all ---
  clearAllBtn.addEventListener('click', () => {
    if (!confirm('Clear ALL data? This cannot be undone.')) return;
    transactions = []; reports = []; saveState(); applyFiltersAndRender(); renderReportsList(); updateDashboardAndCharts();
    alert('All data cleared.');
  });

  // --- REPORTS ---
  function renderReportsList(){
    reportsListEl.innerHTML = '';
    if (!reports.length) { reportsListEl.innerHTML = '<li style="color:var(--muted)">No reports yet</li>'; return; }
    reports.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${escapeHtml(r.name)}</strong><div style="color:var(--muted);font-size:12px">${(r.txIds||[]).length} transactions</div></div><div><button class="small-btn view" data-id="${r.id}">View</button><button class="small-btn delete" data-id="${r.id}">Delete</button></div>`;
      reportsListEl.appendChild(li);
    });
    $$('.small-btn.view').forEach(b => b.onclick = e => openReportModal(e.currentTarget.dataset.id));
    $$('.small-btn.delete').forEach(b => b.onclick = async e => { if (!confirm('Delete this report?')) return; reports = reports.filter(rep => rep.id !== e.currentTarget.dataset.id); save(REPORTS_KEY, reports); renderReportsList(); });
  }

  $('#addReportBtn').addEventListener('click', () => {
    const name = newReportNameEl.value.trim(); if (!name) return alert('Enter report name');
    reports.push({ id: uid(), name, txIds: [] }); save(REPORTS_KEY, reports); newReportNameEl.value = ''; renderReportsList();
  });

  function openReportModal(reportId){
    currentReportId = reportId;
    const rep = reports.find(r => r.id === reportId); if (!rep) return;
    reportModalTitle.textContent = rep.name;
    updateReportModal(); reportModal.style.display = 'flex';
  }

  function updateReportModal(){
    const rep = reports.find(r => r.id === currentReportId); if (!rep) return;
    reportTxTableBody.innerHTML = '';
    let inc = 0, exp = 0;
    (rep.txIds || []).forEach(txId => {
      const tx = transactions.find(t => t.id === txId); if (!tx) return;
      if (tx.type === 'income') inc += Number(tx.amount); else exp += Number(tx.amount);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tx.date}</td><td>${tx.type}</td><td>${escapeHtml(tx.category)}</td><td>${formatCurrency(tx.amount)}</td><td>${escapeHtml(tx.note||'')}</td><td><button class="small-btn remove" data-id="${tx.id}">Remove</button></td>`;
      reportTxTableBody.appendChild(tr);
    });
    reportTotalsEl.innerHTML = `<div>Income: ${formatCurrency(inc)}</div><div>Expense: ${formatCurrency(exp)}</div><div style="font-weight:700;margin-top:6px">Net: ${formatCurrency(inc - exp)}</div>`;

    // populate add select
    addTxToReportSelect.innerHTML = '';
    const available = transactions.filter(t => !(rep.txIds || []).includes(t.id));
    if (!available.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'No transactions available'; addTxToReportSelect.appendChild(o); addTxToReportSelect.disabled = true; addTxToReportBtn.disabled = true; }
    else {
      addTxToReportSelect.disabled = false; addTxToReportBtn.disabled = false;
      available.forEach(tx => { const o = document.createElement('option'); o.value = tx.id; o.textContent = `${tx.date} | ${tx.category} | ${formatCurrency(tx.amount)}`; addTxToReportSelect.appendChild(o); });
    }

    // wire remove buttons
    $$('#reportTxTable .remove').forEach(b => b.onclick = (e) => { const txId = e.currentTarget.dataset.id; rep.txIds = (rep.txIds || []).filter(id => id !== txId); save(REPORTS_KEY, reports); updateReportModal(); renderReportsList(); });
  }

  addTxToReportBtn.addEventListener('click', () => {
    const txId = addTxToReportSelect.value; if (!txId) return alert('Select transaction');
    const rep = reports.find(r => r.id === currentReportId); if (!rep) return;
    if (!rep.txIds) rep.txIds = [];
    if (rep.txIds.includes(txId)) return alert('Already added');
    rep.txIds.push(txId); save(REPORTS_KEY, reports); updateReportModal(); renderReportsList();
  });

  closeReportModalBtn.addEventListener('click', () => { reportModal.style.display = 'none'; currentReportId = null; });
  reportModal.addEventListener('click', (e) => { if (e.target === reportModal) { reportModal.style.display = 'none'; currentReportId = null; } });

  // per-report export / print
  exportReportCsvBtn.addEventListener('click', () => {
    const rep = reports.find(r => r.id === currentReportId); if (!rep) return alert('Report not found');
    const list = (rep.txIds || []).map(id => transactions.find(t => t.id === id)).filter(Boolean);
    exportTransactionsToCSV(list, `${rep.name.replace(/s+/g,'_')}_report_${new Date().toISOString().slice(0,10)}.csv`);
  });
  printReportModalBtn.addEventListener('click', () => {
    const rep = reports.find(r => r.id === currentReportId); if (!rep) return alert('Report not found');
    const list = (rep.txIds || []).map(id => transactions.find(t => t.id === id)).filter(Boolean);
    const html = makePrintableHtml(list, `Report: ${escapeHtml(rep.name)}`);
    const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.focus(); w.print();
  });

  // --- CSV IMPORT (with mapping UI) ---
  csvFileInput.addEventListener('change', handleCsvSelected);
  closeCsvMapModal.addEventListener('click', () => { csvMapModal.style.display = 'none'; csvToImport = null; });
  csvMapModal.addEventListener('click', (e) => { if (e.target === csvMapModal) { csvMapModal.style.display = 'none'; csvToImport = null; } });

  function handleCsvSelected(e){
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseCsv(text);
      if (!parsed || !parsed.headers || !parsed.rows) { alert('Failed to parse CSV'); return; }
      csvToImport = parsed; // { headers:[], rows:[[]] }
      showCsvMapModal(parsed);
    };
    reader.readAsText(file);
    // reset input so same file can be selected again later
    e.target.value = '';
  }

  // CSV parser (robust small parser)
  function parseCsv(text){
    const rows = [];
    let cur = '', row = [], i = 0, inQuotes = false;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"' ) {
        if (inQuotes && text[i+1] === '"') { cur += '"'; i += 2; continue; } // escaped quote
        inQuotes = !inQuotes; i++; continue;
      }
      if (ch === ',' && !inQuotes) { row.push(cur); cur=''; i++; continue; }
      if ((ch === 'n' || ch === 'r') && !inQuotes) {
        // handle CRLF
        if (cur !== '' || row.length>0) row.push(cur);
        if (row.length>0) rows.push(row);
        cur=''; row=[]; // skip all contiguous newlines
        // consume possible rn
        if (ch === 'r' && text[i+1] === 'n') i += 2; else i++;
        while (text[i] === 'r' || text[i] === 'n') i++;
        continue;
      }
      cur += ch; i++;
    }
    // push remaining
    if (cur !== '' || row.length>0) row.push(cur);
    if (row.length>0) rows.push(row);
    if (!rows.length) return null;
    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1).map(r => r.map(cell => cell.trim()));
    return { headers, rows: dataRows };
  }

  // builds the mapping UI and preview
  function showCsvMapModal(parsed){
    csvMapControls.innerHTML = '';
    csvPreview.innerHTML = '';
    // show small preview (first 6 rows)
    const maxPreview = Math.min(6, parsed.rows.length);
    const previewTable = document.createElement('table');
    previewTable.style.width = '100%';
    previewTable.style.borderCollapse = 'collapse';
    previewTable.innerHTML = `<thead><tr>${parsed.headers.map(h => `<th style="border:1px solid #eee;padding:6px;background:#fafafa">${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    const tbody = document.createElement('tbody');
    for (let i=0;i<maxPreview;i++){
      const r = parsed.rows[i];
      const tr = document.createElement('tr');
      tr.innerHTML = parsed.headers.map((_,j) => `<td style="border:1px solid #eee;padding:6px">${escapeHtml(r[j]||'')}</td>`).join('');
      tbody.appendChild(tr);
    }
    previewTable.appendChild(tbody);
    csvPreview.appendChild(previewTable);

    // mapping controls
    const fields = ['date','type','category','amount','note']; // required: date,amount,type
    // create mapping selector rows for each target field
    fields.forEach(field => {
      const row = document.createElement('div');
      row.style.marginBottom = '8px';
      const label = document.createElement('label');
      label.textContent = `Map "${field}": `;
      label.style.display = 'block';
      label.style.marginBottom = '6px';
      const sel = document.createElement('select');
      sel.style.width = '100%';
      sel.dataset.field = field;
      const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = '-- (none) --'; sel.appendChild(noneOpt);
      parsed.headers.forEach((h, idx2) => { const o = document.createElement('option'); o.value = idx2; o.textContent = h; sel.appendChild(o); });
      // try to pre-select sensible matches
      const lower = parsed.headers.map(h => h.toLowerCase());
      if (field === 'date') {
        const i = lower.findIndex(h => /(date|day|transaction_date|txn_date)/.test(h)); if (i>=0) sel.value = i;
      }
      if (field === 'amount') {
        const i = lower.findIndex(h => /(amount|amt|value|transaction_amount)/.test(h)); if (i>=0) sel.value = i;
      }
      if (field === 'type') {
        const i = lower.findIndex(h => /(type|kind|txn_type)/.test(h)); if (i>=0) sel.value = i;
      }
      if (field === 'category') {
        const i = lower.findIndex(h => /(category|cat|expense_category)/.test(h)); if (i>=0) sel.value = i;
      }
      if (field === 'note') {
        const i = lower.findIndex(h => /(note|description|memo)/.test(h)); if (i>=0) sel.value = i;
      }
      row.appendChild(label);
      row.appendChild(sel);
      csvMapControls.appendChild(row);
    });

    csvMapModal.style.display = 'flex';

    applyCsvMapBtn.onclick = async (ev) => {
      ev.preventDefault();
      // read mapping
      const sels = Array.from(csvMapControls.querySelectorAll('select'));
      const map = {};
      sels.forEach(s => { const f = s.dataset.field; if (s.value !== '') map[f] = Number(s.value); }); // index -> header index
      // validate
      if (map.date === undefined || map.amount === undefined || map.type === undefined) return alert('Please map date, amount and type fields (type should contain "income" or "expense").');
      // build transactions
      const rows = csvToImport.rows;
      const created = [];
      for (let r of rows) {
        try {
          const dateRaw = (r[map.date] || '').trim();
          const amountRaw = (r[map.amount] || '').trim();
          const typeRaw = (r[map.type] || '').trim().toLowerCase();
          if (!dateRaw || !amountRaw || !typeRaw) continue; // skip incomplete
          // normalize date: try to accept YYYY-MM-DD or DD/MM/YYYY or MM/DD/YYYY
          let dateVal = normalizeDateString(dateRaw);
          if (!dateVal) continue; // skip if can't parse
          // amount
          const amt = parseFloat(amountRaw.replace(/[^0-9.-]+/g,'')); if (isNaN(amt)) continue;
          let categoryVal = map.category !== undefined ? (r[map.category] || '').trim() : '';
          let noteVal = map.note !== undefined ? (r[map.note] || '').trim() : '';
          const ttype = typeRaw.includes('inc') || typeRaw === 'income' || typeRaw === 'in' ? 'income' : 'expense';

          // if category present and not in categories, add automatically so import doesn't break
          if (categoryVal) {
            if (!CATEGORIES[ttype].includes(categoryVal)) {
              CATEGORIES[ttype].push(categoryVal);
              saveCategories(CATEGORIES);
              populateCategorySelects();
            }
          } else {
            categoryVal = (ttype === 'income') ? (CATEGORIES.income[0] || 'Other Income') : (CATEGORIES.expense[0] || 'Other Expense');
          }

          created.push({ id: uid(), type: ttype, category: categoryVal, date: dateVal, amount: amt, note: noteVal, createdAt: new Date().toISOString() });
        } catch(ex) {
          // skip row on error
          continue;
        }
      }
      if (!created.length) return alert('No valid rows found to import. Check mapping and CSV content.');
      // confirm and append
      if (!confirm(`Import ${created.length} transactions into your data?`)) return;
      transactions = transactions.concat(created);
      saveState();
      csvMapModal.style.display = 'none';
      csvToImport = null;
      applyFiltersAndRender();
      updateDashboardAndCharts();
      renderReportsList();
      alert(`Imported ${created.length} transactions.`);
    };
  }

  function normalizeDateString(s){
    // try common formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, YYYY/MM/DD
    s = s.trim();
    // ISO-ish
    const iso = /^d{4}-d{2}-d{2}$/; if (iso.test(s)) return s;
    const iso2 = /^d{4}/d{2}/d{2}$/; if (iso2.test(s)) return s.replace(///g,'-');
    const dmy = /^(d{1,2})[/-](d{1,2})[/-](d{4})$/;
    const m = s.match(dmy);
    if (m) {
      // assume if first > 12 then it's day-first (d/m/y), otherwise ambiguous - choose d/m/y
      const a = Number(m[1]), b = Number(m[2]), y = m[3];
      let day = a, month = b;
      // if a > 12, definitely day-first
      if (a > 12) { day = a; month = b; }
      else { /* prefer day/month by default */ day = a; month = b; }
      return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    // fallback attempt: Date.parse
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0,10);
    }
    return null;
  }

  // --- small util ---
  function escapeHtml(s){ if (!s) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

  // --- persistence ---
  function saveState(){ save(STORAGE_KEY, transactions); save(REPORTS_KEY, reports); }

  // --- initial load & init ---
  function init(){
    // load currency and categories from storage (already done earlier)
    dateEl.valueAsDate = new Date();
    CATEGORIES = loadCategories();
    populateCategorySelects();
    transactions = load(STORAGE_KEY) || [];
    reports = load(REPORTS_KEY) || [];
    applyFiltersAndRender();
    updateDashboardAndCharts();
    renderReportsList();
    initSettingsUI();
  }
  init();

  // --- settings UI: rendering and actions ---
  function initSettingsUI(){
    // currency select - set current value
    if (["uc0u8377 ","$","'80","'a3"].includes(currencySymbol)) {
      currencySelect.value = currencySymbol;
      customCurrencyLabel.style.display = 'none';
      customCurrencyInput.value = '';
    } else {
      currencySelect.value = 'custom';
      customCurrencyLabel.style.display = 'block';
      customCurrencyInput.value = currencySymbol || '';
    }

    currencySelect.addEventListener('change', () => {
      customCurrencyLabel.style.display = (currencySelect.value === 'custom') ? 'block' : 'none';
    });

    saveCurrencyBtn.addEventListener('click', () => {
      const selected = currencySelect.value === 'custom' ? (customCurrencyInput.value.trim() || 'uc0u8377 ') : currencySelect.value;
      currencySymbol = selected;
      save(CURRENCY_KEY, currencySymbol);
      // update UI amounts
      updateDashboardAndCharts();
      applyFiltersAndRender();
      if (currentReportId) updateReportModal();
      alert('Currency saved: ' + currencySymbol);
    });

    // categories lists
    renderCategorySettingsLists();

    addExpenseCategoryBtn.addEventListener('click', () => {
      const v = (newExpenseCategory.value || '').trim();
      if (!v) return;
      if (CATEGORIES.expense.includes(v)) { alert('Category already exists'); return; }
      CATEGORIES.expense.push(v);
      saveCategories(CATEGORIES);
      newExpenseCategory.value = '';
      populateCategorySelects();
      renderCategorySettingsLists();
    });

    addIncomeCategoryBtn.addEventListener('click', () => {
      const v = (newIncomeCategory.value || '').trim();
      if (!v) return;
      if (CATEGORIES.income.includes(v)) { alert('Category already exists'); return; }
      CATEGORIES.income.push(v);
      saveCategories(CATEGORIES);
      newIncomeCategory.value = '';
      populateCategorySelects();
      renderCategorySettingsLists();
    });
  }

  function renderCategorySettingsLists(){
    // Expense list
    expenseCategoryList.innerHTML = '';
    CATEGORIES.expense.forEach((cat, idx) => {
      const li = document.createElement('li');
      const left = document.createElement('span'); left.textContent = cat;
      const right = document.createElement('span');

      // protected default categories (can't delete)
      const isProtected = DEFAULT_CATEGORIES.expense.includes(cat);
      // if category is used by any transaction, can't delete
      const inUse = transactions.some(t => t.category === cat);

      if (!isProtected && !inUse) {
        const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.textContent = ''d7';
        delBtn.title = 'Delete category';
        delBtn.onclick = () => {
          if (!confirm(`Delete category "${cat}"? This cannot be undone.`)) return;
          CATEGORIES.expense.splice(idx,1);
          saveCategories(CATEGORIES);
          populateCategorySelects();
          renderCategorySettingsLists();
        };
        right.appendChild(delBtn);
      } else if (isProtected) {
        const span = document.createElement('small'); span.style.color = 'var(--muted)'; span.textContent = 'default';
        right.appendChild(span);
      } else if (inUse) {
        const span = document.createElement('small'); span.style.color = 'var(--muted)'; span.textContent = 'in use';
        right.appendChild(span);
      }

      li.appendChild(left); li.appendChild(right);
      expenseCategoryList.appendChild(li);
    });

    // Income list
    incomeCategoryList.innerHTML = '';
    CATEGORIES.income.forEach((cat, idx) => {
      const li = document.createElement('li');
      const left = document.createElement('span'); left.textContent = cat;
      const right = document.createElement('span');

      const isProtected = DEFAULT_CATEGORIES.income.includes(cat);
      const inUse = transactions.some(t => t.category === cat);

      if (!isProtected && !inUse) {
        const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.textContent = ''d7';
        delBtn.title = 'Delete category';
        delBtn.onclick = () => {
          if (!confirm(`Delete category "${cat}"? This cannot be undone.`)) return;
          CATEGORIES.income.splice(idx,1);
          saveCategories(CATEGORIES);
          populateCategorySelects();
          renderCategorySettingsLists();
        };
        right.appendChild(delBtn);
      } else if (isProtected) {
        const span = document.createElement('small'); span.style.color = 'var(--muted)'; span.textContent = 'default';
        right.appendChild(span);
      } else if (inUse) {
        const span = document.createElement('small'); span.style.color = 'var(--muted)'; span.textContent = 'in use';
        right.appendChild(span);
      }

      li.appendChild(left); li.appendChild(right);
      incomeCategoryList.appendChild(li);
    });
  }

  // --- helpers for export / print inside report modal reused earlier ---
  // exportTransactionsToCSV defined above

  // --- expose debug (useful during development) ---
  window._expenseApp = {
    transactions, reports,
    saveState, load, save,
    getCategories: () => JSON.parse(JSON.stringify(CATEGORIES)),
    setCurrency: (s) => { currencySymbol = s; save(CURRENCY_KEY, currencySymbol); updateDashboardAndCharts(); applyFiltersAndRender(); }
  };

})();
}
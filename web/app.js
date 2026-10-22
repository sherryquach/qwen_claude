window.knowiReportReady = false;

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    location: $('location'),
    category: $('category'),
    dateFrom: $('dateFrom'),
    dateTo: $('dateTo'),
    apply: $('apply'),
    reset: $('reset'),
    status: $('status'),
    loading: $('loading'),
    emptyState: $('emptyState'),
    totalRevenue: $('totalRevenue'),
    totalTransactions: $('totalTransactions'),
    totalItems: $('totalItems'),
    avgTicket: $('avgTicket'),
    barChart: $('barChart'),
    tableBody: $('tableBody')
  };

  const fmtCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  const fmtInt = (n) => new Intl.NumberFormat('en-US').format(n || 0);
  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  function buildQuery() {
    const p = new URLSearchParams();
    if (els.location.value) p.set('location', els.location.value);
    if (els.category.value) p.set('category', els.category.value);
    if (els.dateFrom.value) p.set('dateFrom', els.dateFrom.value);
    if (els.dateTo.value) p.set('dateTo', els.dateTo.value);
    return p.toString();
  }

  function showLoading() {
    els.loading.hidden = false;
    els.emptyState.hidden = true;
    els.status.textContent = '';
  }
  function hideLoading() {
    els.loading.hidden = true;
  }
  function showError(msg) {
    hideLoading();
    els.emptyState.hidden = true;
    els.status.textContent = msg;
  }
  function showEmpty() {
    hideLoading();
    els.status.textContent = '';
    els.emptyState.hidden = false;
  }

  function populateSelect(el, values, allLabel) {
    const current = el.value;
    el.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = allLabel;
    el.appendChild(opt0);
    values.forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
    if (values.includes(current)) el.value = current;
  }

  function renderSummary(s) {
    els.totalRevenue.textContent = fmtCurrency(s.totalRevenue);
    els.totalTransactions.textContent = fmtInt(s.totalTransactions);
    els.totalItems.textContent = fmtInt(s.totalItems);
    els.avgTicket.textContent = fmtCurrency(s.avgTicket);
  }

  function renderChart(items) {
    const svg = els.barChart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!items || !items.length) return;

    const W = 720, H = 320, padL = 150, padR = 20, padT = 16, padB = 16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const max = Math.max.apply(null, items.map((i) => i.revenue)) || 1;
    const barH = Math.min(28, (chartH / items.length) * 0.7);
    const gap = (chartH - barH * items.length) / (items.length + 1);

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');

    items.forEach((it, i) => {
      const y = padT + gap + i * (barH + gap);
      const w = Math.max(2, (it.revenue / max) * chartW);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', padL - 10);
      label.setAttribute('y', y + barH / 2 + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 'bar-label');
      const name = it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name;
      label.textContent = name;
      svg.appendChild(label);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', padL);
      rect.setAttribute('y', y);
      rect.setAttribute('width', w);
      rect.setAttribute('height', barH);
      rect.setAttribute('rx', 3);
      rect.setAttribute('class', 'bar-rect');
      svg.appendChild(rect);

      const val = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      val.setAttribute('x', padL + w + 8);
      val.setAttribute('y', y + barH / 2 + 4);
      val.setAttribute('class', 'bar-value');
      val.textContent = fmtCurrency(it.revenue);
      svg.appendChild(val);
    });
  }

  function renderTable(rows, columns) {
    const idx = {};
    columns.forEach((c, i) => { idx[c] = i; });
    const g = (row, f) => (f in idx ? row[idx[f]] : '');

    els.tableBody.innerHTML = '';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const cells = [
        fmtDate(g(row, 'datetime')),
        g(row, 'item_name') || '—',
        g(row, 'sales_category') || '—',
        g(row, 'location_name') || '—',
        fmtInt(g(row, 'quantity')),
        fmtCurrency(g(row, 'line_total'))
      ];
      cells.forEach((txt) => {
        const td = document.createElement('td');
        td.textContent = txt;
        tr.appendChild(td);
      });
      els.tableBody.appendChild(tr);
    });
  }

  async function load() {
    showLoading();
    const q = buildQuery();
    try {
      const [salesRes, sumRes] = await Promise.all([
        fetch('api/sales?limit=100&sort=datetime:desc&' + q),
        fetch('api/summary?' + q)
      ]);
      if (!salesRes.ok || !sumRes.ok) {
        const err = await (salesRes.ok ? sumRes : salesRes).json().catch(() => ({}));
        throw new Error(err.error || 'Request failed');
      }
      const sales = await salesRes.json();
      const summary = await sumRes.json();

      const columns = sales.columns || [];
      const rows = sales.rows || [];

      const locIdx = columns.indexOf('location_name');
      const catIdx = columns.indexOf('sales_category');
      const locations = new Set();
      const categories = new Set();
      rows.forEach((r) => {
        if (locIdx >= 0 && r[locIdx]) locations.add(r[locIdx]);
        if (catIdx >= 0 && r[catIdx]) categories.add(r[catIdx]);
      });
      populateSelect(els.location, Array.from(locations).sort(), 'All locations');
      populateSelect(els.category, Array.from(categories).sort(), 'All categories');

      if (!rows.length) {
        showEmpty();
        renderSummary({ totalRevenue: 0, totalTransactions: 0, totalItems: 0, avgTicket: 0 });
        renderChart([]);
        els.tableBody.innerHTML = '';
        window.knowiReportReady = true;
        return;
      }

      hideLoading();
      els.emptyState.hidden = true;
      els.status.textContent = '';
      renderSummary(summary);
      renderChart(summary.topItems || []);
      renderTable(rows, columns);
      window.knowiReportReady = true;
    } catch (e) {
      showError('Could not load sales data. Please try again.');
      window.knowiReportReady = true;
    }
  }

  els.apply.addEventListener('click', load);
  els.reset.addEventListener('click', () => {
    els.location.value = '';
    els.category.value = '';
    els.dateFrom.value = '';
    els.dateTo.value = '';
    load();
  });

  load();
})();
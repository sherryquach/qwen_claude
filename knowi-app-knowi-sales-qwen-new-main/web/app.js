window.knowiReportReady = false;

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var dateFrom = $('date-from');
  var dateTo = $('date-to');
  var refreshBtn = $('refresh-btn');
  var statusEl = $('status');
  var loadingEl = $('loading');
  var errorBox = $('error-box');
  var contentEl = $('content');

  var kpiRevenue = $('kpi-revenue');
  var kpiTransactions = $('kpi-transactions');
  var kpiAvg = $('kpi-avg');
  var kpiItems = $('kpi-items');
  var categoryList = $('category-list');
  var itemsTable = $('items-table');
  var trendSvg = $('trend-svg');

  var lastData = null;
  var loading = false;

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtInt(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function setDates() {
    var now = new Date();
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var start = new Date(end);
    start.setDate(start.getDate() - 6);
    dateFrom.value = start.toISOString().slice(0, 10);
    dateTo.value = end.toISOString().slice(0, 10);
  }

  function showLoading() {
    loadingEl.hidden = false;
    errorBox.hidden = true;
    contentEl.style.display = 'none';
    statusEl.textContent = 'Loading sales data…';
  }

  function hideLoading() {
    loadingEl.hidden = true;
  }

  function showError(msg) {
    hideLoading();
    errorBox.textContent = msg;
    errorBox.hidden = false;
    contentEl.style.display = 'none';
    statusEl.textContent = 'Error';
  }

  function renderKpis(items) {
    var revenue = 0;
    var itemsSold = 0;
    var txSet = {};
    var txCount = 0;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var lt = Number(it.line_total) || 0;
      revenue += lt;
      itemsSold += Number(it.quantity) || 0;
      var tx = it.transaction_id;
      if (tx != null && tx !== '' && !txSet[tx]) {
        txSet[tx] = true;
        txCount++;
      }
    }

    var avg = txCount > 0 ? revenue / txCount : 0;

    kpiRevenue.textContent = fmtMoney(revenue);
    kpiTransactions.textContent = fmtInt(txCount);
    kpiAvg.textContent = fmtMoney(avg);
    kpiItems.textContent = fmtInt(itemsSold);
  }

  function renderCategories(items) {
    var map = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var cat = it.sales_category || 'Uncategorized';
      if (!map[cat]) map[cat] = 0;
      map[cat] += Number(it.line_total) || 0;
    }

    var entries = Object.keys(map).map(function (k) { return { name: k, total: map[k] }; });
    entries.sort(function (a, b) { return b.total - a.total; });

    var max = 0;
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].total > max) max = entries[j].total;
    }

    categoryList.innerHTML = '';
    if (entries.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = 'No category data for this range.';
      categoryList.appendChild(empty);
      return;
    }

    for (var k = 0; k < entries.length; k++) {
      var e = entries[k];
      var row = document.createElement('div');
      row.className = 'cat-row';

      var label = document.createElement('span');
      label.className = 'cat-name';
      label.textContent = e.name;

      var barWrap = document.createElement('div');
      barWrap.className = 'cat-bar-wrap';
      var bar = document.createElement('div');
      bar.className = 'cat-bar';
      var pct = max > 0 ? (e.total / max) * 100 : 0;
      bar.style.width = pct + '%';
      barWrap.appendChild(bar);

      var val = document.createElement('span');
      val.className = 'cat-value';
      val.textContent = fmtMoney(e.total);

      row.appendChild(label);
      row.appendChild(barWrap);
      row.appendChild(val);
      categoryList.appendChild(row);
    }
  }

  function renderItems(items) {
    var map = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var name = it.item_name || 'Unknown';
      if (!map[name]) map[name] = { qty: 0, revenue: 0 };
      map[name].qty += Number(it.quantity) || 0;
      map[name].revenue += Number(it.line_total) || 0;
    }

    var entries = Object.keys(map).map(function (k) { return { name: k, qty: map[k].qty, revenue: map[k].revenue }; });
    entries.sort(function (a, b) { return b.revenue - a.revenue; });
    entries = entries.slice(0, 10);

    var tbody = itemsTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (entries.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'empty-note';
      td.textContent = 'No item data for this range.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      tdName.textContent = e.name;

      var tdQty = document.createElement('td');
      tdQty.className = 'num';
      tdQty.textContent = fmtInt(e.qty);

      var tdRev = document.createElement('td');
      tdRev.className = 'num';
      tdRev.textContent = fmtMoney(e.revenue);

      tr.appendChild(tdName);
      tr.appendChild(tdQty);
      tr.appendChild(tdRev);
      tbody.appendChild(tr);
    }
  }

  function renderTrend(items) {
    // Build last 7 days from dateTo (or today)
    var endStr = dateTo.value || new Date().toISOString().slice(0, 10);
    var end = new Date(endStr + 'T00:00:00');
    if (isNaN(end.getTime())) end = new Date();

    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(end);
      d.setDate(d.getDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: 0
      });
    }

    var dayMap = {};
    for (var j = 0; j < days.length; j++) dayMap[days[j].key] = days[j];

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var dt = it.datetime;
      if (!dt) continue;
      var d = new Date(dt);
      if (isNaN(d.getTime())) continue;
      var key = d.toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].total += Number(it.line_total) || 0;
      }
    }

    // SVG dimensions
    var W = 640, H = 260;
    var padL = 56, padR = 20, padT = 20, padB = 40;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var maxVal = 0;
    for (var m = 0; m < days.length; m++) {
      if (days[m].total > maxVal) maxVal = days[m].total;
    }
    if (maxVal === 0) maxVal = 1;

    var svgNS = 'http://www.w3.org/2000/svg';
    trendSvg.innerHTML = '';

    // Grid lines (4 horizontal)
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (plotH / 4) * g;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL);
      line.setAttribute('x2', W - padR);
      line.setAttribute('y1', gy);
      line.setAttribute('y2', gy);
      line.setAttribute('stroke', '#d6e8dc');
      line.setAttribute('stroke-width', '1');
      trendSvg.appendChild(line);

      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', padL - 8);
      label.setAttribute('y', gy + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', '#4a6b52');
      var val = maxVal - (maxVal / 4) * g;
      label.textContent = '$' + Math.round(val).toLocaleString();
      trendSvg.appendChild(label);
    }

    // X axis labels
    for (var x = 0; x < days.length; x++) {
      var cx = padL + (plotW / (days.length - 1)) * x;
      var xl = document.createElementNS(svgNS, 'text');
      xl.setAttribute('x', cx);
      xl.setAttribute('y', H - padB + 20);
      xl.setAttribute('text-anchor', 'middle');
      xl.setAttribute('font-size', '11');
      xl.setAttribute('fill', '#4a6b52');
      xl.textContent = days[x].label;
      trendSvg.appendChild(xl);
    }

    // Line path
    var points = [];
    for (var p = 0; p < days.length; p++) {
      var px = padL + (plotW / (days.length - 1)) * p;
      var py = padT + plotH - (days[p].total / maxVal) * plotH;
      points.push({ x: px, y: py, total: days[p].total });
    }

    var pathD = '';
    for (var q = 0; q < points.length; q++) {
      if (q === 0) pathD += 'M' + points[q].x + ',' + points[q].y;
      else pathD += ' L' + points[q].x + ',' + points[q].y;
    }

    var path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#1e7a3c');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    trendSvg.appendChild(path);

    // Dots
    for (var r = 0; r < points.length; r++) {
      var dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', points[r].x);
      dot.setAttribute('cy', points[r].y);
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', '#1e7a3c');
      trendSvg.appendChild(dot);

      // Value label above dot
      var vlabel = document.createElementNS(svgNS, 'text');
      vlabel.setAttribute('x', points[r].x);
      vlabel.setAttribute('y', points[r].y - 10);
      vlabel.setAttribute('text-anchor', 'middle');
      vlabel.setAttribute('font-size', '10');
      vlabel.setAttribute('fill', '#14331f');
      vlabel.textContent = '$' + Math.round(points[r].total).toLocaleString();
      trendSvg.appendChild(vlabel);
    }
  }

  function render(items) {
    renderKpis(items);
    renderCategories(items);
    renderItems(items);
    renderTrend(items);
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    refreshBtn.disabled = true;
    showLoading();

    try {
      var params = new URLSearchParams();
      if (dateFrom.value) params.set('from', dateFrom.value);
      if (dateTo.value) params.set('to', dateTo.value);

      var url = 'api/sales' + (params.toString() ? '?' + params.toString() : '');
      var res = await fetch(url, { method: 'GET' });

      if (!res.ok) {
        var errData = null;
        try { errData = await res.json(); } catch (e) { /* ignore */ }
        throw new Error((errData && errData.error) || 'Failed to load sales data (HTTP ' + res.status + ')');
      }

      var data = await res.json();
      lastData = data;
      hideLoading();
      errorBox.hidden = true;
      contentEl.style.display = '';
      statusEl.textContent = 'Loaded ' + (data.rows ? data.rows.length : 0) + ' records';

      render(data.rows || []);
      window.knowiReportReady = true;
    } catch (err) {
      hideLoading();
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      loading = false;
      refreshBtn.disabled = false;
    }
  }

  // Initialize
  setDates();
  loadData();

  refreshBtn.addEventListener('click', function () {
    loadData();
  });

  dateFrom.addEventListener('change', function () {
    if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
      dateTo.value = dateFrom.value;
    }
    loadData();
  });

  dateTo.addEventListener('change', function () {
    if (dateTo.value && dateFrom.value && dateTo.value < dateFrom.value) {
      dateFrom.value = dateTo.value;
    }
    loadData();
  });
})();
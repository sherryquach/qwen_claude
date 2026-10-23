window.knowiReportReady = false;

(function () {
  'use strict';

  // ---------- State ----------
  var allRows = [];
  var columns = [];
  var colIndex = {};
  var filteredRows = [];
  var currentPage = 1;
  var PAGE_SIZE = 50;
  var maxDate = null;
  var minDate = null;
  var loading = true;
  var error = null;

  // ---------- DOM refs ----------
  var el = {
    kpiTotal: document.getElementById('kpi-total'),
    kpiTransactions: document.getElementById('kpi-transactions'),
    kpiItems: document.getElementById('kpi-items'),
    kpiTicket: document.getElementById('kpi-ticket'),
    filterRange: document.getElementById('filter-range'),
    filterLocation: document.getElementById('filter-location'),
    filterCategory: document.getElementById('filter-category'),
    filterItem: document.getElementById('filter-item'),
    btnReset: document.getElementById('btn-reset'),
    btnSend: document.getElementById('btn-send'),
    chartTrend: document.getElementById('chart-trend'),
    chartItems: document.getElementById('chart-items'),
    chartLocation: document.getElementById('chart-location'),
    chartCategory: document.getElementById('chart-category'),
    tableBody: document.getElementById('table-body'),
    tableStatus: document.getElementById('table-status'),
    pagePrev: document.getElementById('page-prev'),
    pageNext: document.getElementById('page-next'),
    pageInfo: document.getElementById('page-info'),
    modal: document.getElementById('modal'),
    modalClose: document.getElementById('modal-close'),
    reportTo: document.getElementById('report-to'),
    reportSubject: document.getElementById('report-subject'),
    reportNote: document.getElementById('report-note'),
    btnReportSend: document.getElementById('btn-report-send'),
    reportStatus: document.getElementById('report-status')
  };

  // ---------- Utilities ----------
  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function dateKey(d) {
    if (!d) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return dateKey(d);
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtInt(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    return node;
  }

  function makeSvg(width, height, viewBox) {
    var svg = svgEl('svg', {
      viewBox: viewBox,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });
    svg.classList.add('chart-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = width + 'px';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    return svg;
  }

  function addText(svg, x, y, text, cls, anchor) {
    var t = svgEl('text', { x: x, y: y, 'text-anchor': anchor || 'start' });
    t.textContent = text;
    if (cls) t.setAttribute('class', cls);
    svg.appendChild(t);
    return t;
  }

  function addRect(svg, x, y, w, h, fill, cls) {
    var r = svgEl('rect', { x: x, y: y, width: w, height: h, fill: fill });
    if (cls) r.setAttribute('class', cls);
    svg.appendChild(r);
    return r;
  }

  function addLine(svg, x1, y1, x2, y2, stroke, width, cls) {
    var l = svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, 'stroke-width': width });
    if (cls) l.setAttribute('class', cls);
    svg.appendChild(l);
    return l;
  }

  function addPath(svg, d, fill, stroke, sw, cls) {
    var p = svgEl('path', { d: d, fill: fill });
    if (stroke) p.setAttribute('stroke', stroke);
    if (sw) p.setAttribute('stroke-width', sw);
    if (cls) p.setAttribute('class', cls);
    svg.appendChild(p);
    return p;
  }

  function addCircle(svg, cx, cy, r, fill, cls) {
    var c = svgEl('circle', { cx: cx, cy: cy, r: r, fill: fill });
    if (cls) c.setAttribute('class', cls);
    svg.appendChild(c);
    return c;
  }

  function truncate(s, n) {
    if (s == null) return '';
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // ---------- Data loading ----------
  function loadSales() {
    fetch('api/sales', { method: 'GET' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        columns = data.columns || [];
        colIndex = {};
        columns.forEach(function (c, i) { colIndex[c] = i; });
        allRows = (data.rows || []).map(function (row) {
          var o = {};
          columns.forEach(function (c, i) { o[c] = row[i]; });
          return o;
        });
        computeDateBounds();
        populateFilterOptions();
        applyFilters();
        loading = false;
        window.knowiReportReady = true;
      })
      .catch(function (err) {
        error = err.message || 'Failed to load data';
        loading = false;
        window.knowiReportReady = true;
        renderError();
      });
  }

  function computeDateBounds() {
    var max = null, min = null;
    for (var i = 0; i < allRows.length; i++) {
      var d = parseDate(allRows[i].datetime);
      if (!d) continue;
      if (!max || d > max) max = d;
      if (!min || d < min) min = d;
    }
    maxDate = max;
    minDate = min;
  }

  function populateFilterOptions() {
    var locs = {}, cats = {}, items = {};
    for (var i = 0; i < allRows.length; i++) {
      var r = allRows[i];
      if (r.location_name) locs[r.location_name] = true;
      if (r.sales_category) cats[r.sales_category] = true;
      if (r.item_name) items[r.item_name] = true;
    }
    fillSelect(el.filterLocation, 'All locations', Object.keys(locs).sort());
    fillSelect(el.filterCategory, 'All categories', Object.keys(cats).sort());
    fillSelect(el.filterItem, 'All items', Object.keys(items).sort());
  }

  function fillSelect(sel, allLabel, values) {
    // keep first option (value="all")
    while (sel.options.length > 1) sel.remove(1);
    for (var i = 0; i < values.length; i++) {
      var opt = document.createElement('option');
      opt.value = values[i];
      opt.textContent = values[i];
      sel.appendChild(opt);
    }
  }

  // ---------- Filtering ----------
  function getFilteredRows() {
    var range = el.filterRange.value;
    var loc = el.filterLocation.value;
    var cat = el.filterCategory.value;
    var item = el.filterItem.value;

    var cutoff = null;
    if (range !== 'all' && maxDate) {
      var days = parseInt(range, 10);
      cutoff = new Date(maxDate);
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0, 0, 0, 0);
    }

    var out = [];
    for (var i = 0; i < allRows.length; i++) {
      var r = allRows[i];
      if (cutoff) {
        var d = parseDate(r.datetime);
        if (!d || d < cutoff) continue;
      }
      if (loc !== 'all' && r.location_name !== loc) continue;
      if (cat !== 'all' && r.sales_category !== cat) continue;
      if (item !== 'all' && r.item_name !== item) continue;
      out.push(r);
    }
    return out;
  }

  function applyFilters() {
    filteredRows = getFilteredRows();
    currentPage = 1;
    renderAll();
  }

  // ---------- Aggregations ----------
  function aggregate() {
    var totalSales = 0;
    var totalQty = 0;
    var txSet = {};
    var txCount = 0;
    var byDate = {};
    var byItem = {};
    var byLocation = {};
    var byCategory = {};

    for (var i = 0; i < filteredRows.length; i++) {
      var r = filteredRows[i];
      var amt = Number(r.line_total) || 0;
      var qty = Number(r.quantity) || 0;
      totalSales += amt;
      totalQty += qty;

      if (r.transaction_id) {
        if (!txSet[r.transaction_id]) {
          txSet[r.transaction_id] = true;
          txCount++;
        }
      }

      var d = parseDate(r.datetime);
      if (d) {
        var k = dateKey(d);
        byDate[k] = (byDate[k] || 0) + amt;
      }
      if (r.item_name) byItem[r.item_name] = (byItem[r.item_name] || 0) + amt;
      if (r.location_name) byLocation[r.location_name] = (byLocation[r.location_name] || 0) + amt;
      if (r.sales_category) byCategory[r.sales_category] = (byCategory[r.sales_category] || 0) + amt;
    }

    return {
      totalSales: totalSales,
      txCount: txCount,
      totalQty: totalQty,
      avgTicket: txCount > 0 ? totalSales / txCount : 0,
      byDate: byDate,
      byItem: byItem,
      byLocation: byLocation,
      byCategory: byCategory
    };
  }

  // ---------- Render ----------
  function renderAll() {
    if (error) { renderError(); return; }
    if (loading) { renderLoading(); return; }
    renderKPIs();
    renderCharts();
    renderTable();
  }

  function renderLoading() {
    el.kpiTotal.textContent = '…';
    el.kpiTransactions.textContent = '…';
    el.kpiItems.textContent = '…';
    el.kpiTicket.textContent = '…';
    el.chartTrend.innerHTML = '<p class="chart-empty">Loading…</p>';
    el.chartItems.innerHTML = '<p class="chart-empty">Loading…</p>';
    el.chartLocation.innerHTML = '<p class="chart-empty">Loading…</p>';
    el.chartCategory.innerHTML = '<p class="chart-empty">Loading…</p>';
    el.tableBody.innerHTML = '';
    el.tableStatus.textContent = 'Loading sales data…';
  }

  function renderError() {
    el.kpiTotal.textContent = '—';
    el.kpiTransactions.textContent = '—';
    el.kpiItems.textContent = '—';
    el.kpiTicket.textContent = '—';
    el.chartTrend.innerHTML = '<p class="chart-empty chart-error">Unable to load data. Please try again.</p>';
    el.chartItems.innerHTML = '<p class="chart-empty chart-error">—</p>';
    el.chartLocation.innerHTML = '<p class="chart-empty chart-error">—</p>';
    el.chartCategory.innerHTML = '<p class="chart-empty chart-error">—</p>';
    el.tableBody.innerHTML = '';
    el.tableStatus.textContent = 'Error: ' + (error || 'unknown');
  }

  function renderKPIs() {
    var a = aggregate();
    el.kpiTotal.textContent = fmtMoney(a.totalSales);
    el.kpiTransactions.textContent = fmtInt(a.txCount);
    el.kpiItems.textContent = fmtInt(a.totalQty);
    el.kpiTicket.textContent = fmtMoney(a.avgTicket);
  }

  function renderCharts() {
    var a = aggregate();
    renderTrend(a.byDate);
    renderTopItems(a.byItem);
    renderLocations(a.byLocation);
    renderCategories(a.byCategory);
  }

  function renderTrend(byDate) {
    el.chartTrend.innerHTML = '';
    var keys = Object.keys(byDate).sort();
    if (keys.length === 0) {
      el.chartTrend.innerHTML = '<p class="chart-empty">No data for the selected filters.</p>';
      return;
    }
    var W = 720, H = 260, padL = 56, padR = 16, padT = 16, padB = 40;
    var svg = makeSvg(W, H, '0 0 ' + W + ' ' + H);
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var maxVal = 0;
    for (var i = 0; i < keys.length; i++) if (byDate[keys[i]] > maxVal) maxVal = byDate[keys[i]];
    if (maxVal === 0) maxVal = 1;

    // gridlines + y labels
    var gridSteps = 4;
    for (var g = 0; g <= gridSteps; g++) {
      var gy = padT + plotH - (plotH * g / gridSteps);
      addLine(svg, padL, gy, W - padR, gy, '#d1d5db', 1, 'grid-line');
      var val = (maxVal * g / gridSteps);
      addText(svg, padL - 8, gy + 4, fmtMoney(val), 'axis-label', 'end');
    }

    var n = keys.length;
    var stepX = n > 1 ? plotW / (n - 1) : 0;
    var points = [];
    for (var j = 0; j < n; j++) {
      var x = padL + (n > 1 ? stepX * j : plotW / 2);
      var y = padT + plotH - (byDate[keys[j]] / maxVal) * plotH;
      points.push([x, y]);
    }

    // area fill
    if (n > 1) {
      var d = 'M ' + points[0][0] + ' ' + (padT + plotH);
      for (var p = 0; p < points.length; p++) d += ' L ' + points[p][0] + ' ' + points[p][1];
      d += ' L ' + points[points.length - 1][0] + ' ' + (padT + plotH) + ' Z';
      addPath(svg, d, 'rgba(37,99,235,0.15)', null, 0, 'area-fill');
    }

    // line
    if (n > 1) {
      var ld = 'M ' + points[0][0] + ' ' + points[0][1];
      for (var q = 1; q < points.length; q++) ld += ' L ' + points[q][0] + ' ' + points[q][1];
      addPath(svg, ld, 'none', '#2563eb', 2.5, 'trend-line');
    }

    // dots
    for (var c = 0; c < points.length; c++) {
      addCircle(svg, points[c][0], points[c][1], 3, '#2563eb', 'dot');
    }

    // x labels (show up to ~8)
    var labelStep = Math.max(1, Math.ceil(n / 8));
    for (var k = 0; k < n; k += labelStep) {
      var lbl = keys[k].length > 10 ? keys[k].slice(5) : keys[k];
      addText(svg, points[k][0], H - padB + 18, lbl, 'axis-label', 'middle');
    }

    el.chartTrend.appendChild(svg);
  }

  function renderTopItems(byItem) {
    el.chartItems.innerHTML = '';
    var entries = Object.keys(byItem).map(function (k) { return [k, byItem[k]]; });
    entries.sort(function (a, b) { return b[1] - a[1]; });
    var top = entries.slice(0, 10);
    if (top.length === 0) {
      el.chartItems.innerHTML = '<p class="chart-empty">No data for the selected filters.</p>';
      return;
    }
    var W = 360, H = 260, padL = 10, padR = 10, padT = 10, padB = 10;
    var svg = makeSvg(W, H, '0 0 ' + W + ' ' + H);
    var maxVal = top[0][1] || 1;
    var barH = Math.min(22, (H - padT - padB) / top.length - 4);
    var gap = (H - padT - padB - barH * top.length) / Math.max(1, top.length - 1);
    var labelW = 110;
    var barMaxW = W - padL - padR - labelW - 50;

    for (var i = 0; i < top.length; i++) {
      var y = padT + i * (barH + gap);
      var w = (top[i][1] / maxVal) * barMaxW;
      addText(svg, padL, y + barH / 2 + 4, truncate(top[i][0], 14), 'bar-label', 'start');
      addRect(svg, padL + labelW, y, Math.max(2, w), barH, '#2563eb', 'bar');
      addText(svg, padL + labelW + Math.max(2, w) + 6, y + barH / 2 + 4, fmtMoney(top[i][1]), 'bar-value', 'start');
    }
    el.chartItems.appendChild(svg);
  }

  function renderLocations(byLocation) {
    el.chartLocation.innerHTML = '';
    var entries = Object.keys(byLocation).map(function (k) { return [k, byLocation[k]]; });
    entries.sort(function (a, b) { return b[1] - a[1]; });
    if (entries.length === 0) {
      el.chartLocation.innerHTML = '<p class="chart-empty">No data for the selected filters.</p>';
      return;
    }
    var W = 360, H = 260, padL = 10, padR = 10, padT = 10, padB = 10;
    var svg = makeSvg(W, H, '0 0 ' + W + ' ' + H);
    var maxVal = entries[0][1] || 1;
    var barH = Math.min(22, (H - padT - padB) / entries.length - 4);
    var gap = (H - padT - padB - barH * entries.length) / Math.max(1, entries.length - 1);
    var labelW = 110;
    var barMaxW = W - padL - padR - labelW - 50;

    for (var i = 0; i < entries.length; i++) {
      var y = padT + i * (barH + gap);
      var w = (entries[i][1] / maxVal) * barMaxW;
      addText(svg, padL, y + barH / 2 + 4, truncate(entries[i][0], 14), 'bar-label', 'start');
      addRect(svg, padL + labelW, y, Math.max(2, w), barH, '#059669', 'bar');
      addText(svg, padL + labelW + Math.max(2, w) + 6, y + barH / 2 + 4, fmtMoney(entries[i][1]), 'bar-value', 'start');
    }
    el.chartLocation.appendChild(svg);
  }

  function renderCategories(byCategory) {
    el.chartCategory.innerHTML = '';
    var entries = Object.keys(byCategory).map(function (k) { return [k, byCategory[k]]; });
    if (entries.length === 0) {
      el.chartCategory.innerHTML = '<p class="chart-empty">No data for the selected filters.</p>';
      return;
    }
    var total = 0;
    for (var i = 0; i < entries.length; i++) total += entries[i][1];
    if (total === 0) total = 1;

    var W = 360, H = 260;
    var svg = makeSvg(W, H, '0 0 ' + W + ' ' + H);
    var cx = 110, cy = H / 2, r = 80, inner = 48;
    var palette = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#4b5563'];

    var startAngle = -Math.PI / 2;
    for (var j = 0; j < entries.length; j++) {
      var frac = entries[j][1] / total;
      var endAngle = startAngle + frac * Math.PI * 2;
      var largeArc = frac > 0.5 ? 1 : 0;
      var x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
      var x3 = cx + inner * Math.cos(endAngle), y3 = cy + inner * Math.sin(endAngle);
      var x4 = cx + inner * Math.cos(startAngle), y4 = cy + inner * Math.sin(startAngle);
      var d = 'M ' + x1 + ' ' + y1 +
        ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 +
        ' L ' + x3 + ' ' + y3 +
        ' A ' + inner + ' ' + inner + ' 0 ' + largeArc + ' 0 ' + x4 + ' ' + y4 + ' Z';
      addPath(svg, d, palette[j % palette.length], '#ffffff', 1, 'donut-seg');
      startAngle = endAngle;
    }

    // legend
    var lx = 210, ly = 24;
    for (var m = 0; m < entries.length; m++) {
      addRect(svg, lx, ly - 8, 12, 12, palette[m % palette.length], 'legend-swatch');
      addText(svg, lx + 18, ly + 2, truncate(entries[m][0], 16), 'legend-label', 'start');
      ly += 20;
    }
    el.chartCategory.appendChild(svg);
  }

  // ---------- Table ----------
  function renderTable() {
    var total = filteredRows.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var start = (currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var rows = filteredRows.slice(start, end);

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var d = parseDate(r.datetime);
      html += '<tr>' +
        '<td>' + esc(fmtDate(d)) + '</td>' +
        '<td>' + esc(r.item_name) + '</td>' +
        '<td>' + esc(r.location_name) + '</td>' +
        '<td>' + esc(r.sales_category) + '</td>' +
        '<td>' + esc(r.quantity) + '</td>' +
        '<td>' + esc(fmtMoney(Number(r.line_total) || 0)) + '</td>' +
        '</tr>';
    }
    el.tableBody.innerHTML = html;

    el.pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages + ' (' + fmtInt(total) + ' rows)';
    el.pagePrev.disabled = currentPage <= 1;
    el.pageNext.disabled = currentPage >= totalPages;
    el.tableStatus.textContent = total === 0 ? 'No rows match the current filters.' : 'Showing ' + (start + 1) + '–' + end + ' of ' + fmtInt(total) + ' rows.';
  }

  // ---------- Report query ----------
  function buildReportQuery() {
    var parts = [];
    if (el.filterRange.value !== 'all') parts.push('range=' + encodeURIComponent(el.filterRange.value));
    if (el.filterLocation.value !== 'all') parts.push('location=' + encodeURIComponent(el.filterLocation.value));
    if (el.filterCategory.value !== 'all') parts.push('category=' + encodeURIComponent(el.filterCategory.value));
    if (el.filterItem.value !== 'all') parts.push('item=' + encodeURIComponent(el.filterItem.value));
    return parts.join('&');
  }

  // ---------- Events ----------
  function wireEvents() {
    el.filterRange.addEventListener('change', applyFilters);
    el.filterLocation.addEventListener('change', applyFilters);
    el.filterCategory.addEventListener('change', applyFilters);
    el.filterItem.addEventListener('change', applyFilters);

    el.btnReset.addEventListener('click', function () {
      el.filterRange.value = 'all';
      el.filterLocation.value = 'all';
      el.filterCategory.value = 'all';
      el.filterItem.value = 'all';
      applyFilters();
    });

    el.pagePrev.addEventListener('click', function () {
      if (currentPage > 1) { currentPage--; renderTable(); }
    });
    el.pageNext.addEventListener('click', function () {
      var totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
      if (currentPage < totalPages) { currentPage++; renderTable(); }
    });

    el.btnSend.addEventListener('click', openModal);
    el.modalClose.addEventListener('click', closeModal);
    el.modal.addEventListener('click', function (e) {
      if (e.target === el.modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.modal.hidden) closeModal();
    });

    el.btnReportSend.addEventListener('click', sendReport);
  }

  function openModal() {
    el.modal.hidden = false;
    el.reportStatus.textContent = '';
    el.reportTo.focus();
  }

  function closeModal() {
    el.modal.hidden = true;
    el.reportStatus.textContent = '';
    el.btnReportSend.disabled = false;
  }

  function sendReport() {
    var to = el.reportTo.value.trim();
    if (!to) {
      el.reportStatus.textContent = 'Please enter a recipient email.';
      el.reportTo.focus();
      return;
    }
    el.btnReportSend.disabled = true;
    el.reportStatus.textContent = 'Sending…';

    var payload = {
      sendTo: to,
      subject: el.reportSubject.value.trim() || 'Restaurant Sales Report',
      note: el.reportNote.value.trim(),
      query: buildReportQuery()
    };

    fetch('api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      })
      .then(function (res) {
        el.btnReportSend.disabled = false;
        if (res.ok) {
          if (res.data && res.data.dryRun) {
            el.reportStatus.textContent = 'Preview: report validated (dry run).';
          } else {
            el.reportStatus.textContent = 'Report sent to ' + to + '.';
            closeModal();
          }
        } else {
          el.reportStatus.textContent = (res.data && res.data.error) ? res.data.error : 'Failed to send report.';
        }
      })
      .catch(function () {
        el.btnReportSend.disabled = false;
        el.reportStatus.textContent = 'Network error. Please try again.';
      });
  }

  // ---------- Init ----------
  wireEvents();
  renderLoading();
  loadSales();
})();
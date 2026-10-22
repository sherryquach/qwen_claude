import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const webRoot = new URL('../web', import.meta.url).pathname;
const indexHtmlPath = new URL('../web/index.html', import.meta.url).pathname;

const GATEWAY_URL = process.env.KNOWI_GATEWAY_URL;

async function invoke(req, capability, input) {
  const token = req.get('X-Knowi-Capability-Token');
  const res = await fetch(`${GATEWAY_URL}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token
    },
    body: JSON.stringify({ capability, input })
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function buildFilters({ location, category, dateFrom, dateTo }) {
  const filters = [];
  if (location) filters.push({ field: 'location_name', operator: 'eq', value: location });
  if (category) filters.push({ field: 'sales_category', operator: 'eq', value: category });
  if (dateFrom) filters.push({ field: 'datetime', operator: 'gte', value: dateFrom });
  if (dateTo) filters.push({ field: 'datetime', operator: 'lte', value: dateTo });
  return filters;
}

app.get('/api/sales', async (req, res) => {
  try {
    const { limit, offset, sort, location, category, dateFrom, dateTo } = req.query;
    const input = {
      binding: 'restaurant-sales',
      limit: limit ? parseInt(limit, 10) : 1000,
      offset: offset ? parseInt(offset, 10) : 0,
      fields: ['datetime', 'item_name', 'line_total', 'location_name', 'modifier', 'quantity', 'sales_category', 'transaction_id'],
      filters: buildFilters({ location, category, dateFrom, dateTo })
    };
    if (sort) {
      const [field, direction] = sort.split(':');
      if (['datetime', 'item_name', 'line_total', 'location_name', 'quantity', 'sales_category', 'transaction_id'].includes(field)) {
        input.sort = [{ field, direction: direction === 'desc' ? 'desc' : 'asc' }];
      }
    }
    const { status, data } = await invoke(req, 'data.query', input);
    res.status(status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const { location, category, dateFrom, dateTo } = req.query;
    const input = {
      binding: 'restaurant-sales',
      limit: 200000,
      fields: ['line_total', 'quantity', 'transaction_id', 'item_name'],
      filters: buildFilters({ location, category, dateFrom, dateTo })
    };
    const { status, data } = await invoke(req, 'data.query', input);
    if (status >= 400) {
      return res.status(status).json(data);
    }
    const { columns, rows } = data;
    const idx = {};
    columns.forEach((c, i) => { idx[c] = i; });

    let totalRevenue = 0;
    let totalItems = 0;
    const txIds = new Set();
    const itemRevenue = {};

    for (const row of rows) {
      const lt = row[idx['line_total']] || 0;
      const qty = row[idx['quantity']] || 0;
      const tx = row[idx['transaction_id']];
      const item = row[idx['item_name']] || 'Unknown';
      totalRevenue += lt;
      totalItems += qty;
      if (tx) txIds.add(tx);
      itemRevenue[item] = (itemRevenue[item] || 0) + lt;
    }

    const totalTransactions = txIds.size;
    const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const topItems = Object.entries(itemRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, revenue]) => ({ name, revenue }));

    res.json({
      totalRevenue,
      totalTransactions,
      totalItems,
      avgTicket,
      topItems
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');
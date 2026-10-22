import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const GATEWAY_URL = process.env.KNOWI_GATEWAY_URL;

async function invoke(req, capability, input) {
  const token = req.get('X-Knowi-Capability-Token');
  const res = await fetch(`${GATEWAY_URL}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token,
    },
    body: JSON.stringify({ capability, input }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: res.status, data };
}

const FIELDS = [
  'datetime',
  'item_name',
  'line_total',
  'location_id',
  'location_name',
  'modifier',
  'quantity',
  'sales_category',
  'transaction_id',
];

function toDateStr(v) {
  if (v == null) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

app.get('/api/sales', async (req, res) => {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;

    const filters = [];
    if (from) filters.push({ field: 'datetime', operator: 'gte', value: from });
    if (to) filters.push({ field: 'datetime', operator: 'lte', value: to });

    const { status, data } = await invoke(req, 'data.query', {
      binding: 'restaurant-sales',
      limit: 20000,
      fields: FIELDS,
      filters,
      sort: [{ field: 'datetime', direction: 'desc' }],
    });

    if (status >= 400) {
      return res.status(status).json({
        error: (data && data.error) || 'Failed to load sales data',
        requestId: data && data.requestId,
      });
    }

    const columns = data.columns || [];
    const rows = data.rows || [];
    const idx = Object.fromEntries(columns.map((c, i) => [c, i]));

    const items = rows.map((r) => ({
      datetime: r[idx.datetime],
      item_name: r[idx.item_name],
      line_total: r[idx.line_total],
      location_id: r[idx.location_id],
      location_name: r[idx.location_name],
      modifier: r[idx.modifier],
      quantity: r[idx.quantity],
      sales_category: r[idx.sales_category],
      transaction_id: r[idx.transaction_id],
    }));

    res.json({
      columns,
      rows: items,
      truncated: data.truncated,
      nextOffset: data.nextOffset,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal error while loading sales data' });
  }
});

const WEB_ROOT = new URL('../web', import.meta.url).pathname;

// Serve app.css, app.js and other static assets with correct MIME types.
// Must come before the SPA fallback below, which would otherwise return
// index.html for every GET (including /app.css and /app.js).
app.use(express.static(WEB_ROOT, { index: 'index.html' }));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile('index.html', { root: WEB_ROOT });
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');
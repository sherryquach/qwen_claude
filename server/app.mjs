import express from 'express';

const app = express();
const PORT = Number(process.env.PORT);
const GATEWAY_URL = process.env.KNOWI_GATEWAY_URL;

app.use(express.json({ limit: '256kb' }));

// Helper to invoke a governed capability through the gateway.
async function invoke(req, capability, input) {
  const token = req.headers['x-knowi-capability-token'];
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

// GET /api/sales — fetch all restaurant sales rows.
app.get('/api/sales', async (req, res) => {
  try {
    const { status, data } = await invoke(req, 'data.query', {
      binding: 'restaurant-sales',
      limit: 20000
    });
    if (status >= 200 && status < 300) {
      // Zip columns with rows into objects for easier frontend consumption
      const columns = data.columns || [];
      const rows = data.rows || [];
      const objects = rows.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
      res.json({
        columns,
        rows: objects,
        truncated: data.truncated || false,
        nextOffset: data.nextOffset,
        count: objects.length
      });
    } else {
      res.status(status).json(data);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});

// POST /api/report — send the current report via report.send.
app.post('/api/report', async (req, res) => {
  try {
    const { sendTo, subject, note, query } = req.body;
    if (!sendTo) {
      return res.status(400).json({ error: 'sendTo is required' });
    }
    const input = {
      sendTo,
      page: '/',
      subject: subject || 'Restaurant Sales Report',
      body: note || ''
    };
    if (query) {
      input.query = query;
    }
    const { status, data } = await invoke(req, 'report.send', input);
    if (status >= 200 && status < 300) {
      res.json(data);
    } else {
      res.status(status).json(data);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to send report' });
  }
});

// Serve static files from ../web
const path = await import('path');
const fs = await import('fs');
const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

app.use(express.static(webRoot));

// SPA fallback
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
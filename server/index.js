const path = require('node:path');
const express = require('express');
const session = require('express-session');

const app = express();

app.use(express.json());
app.use(session({
  secret: 'nis-demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', require('./routes/auth'));

// Routers are mounted here in later tasks:
// app.use('/api', require('./routes/content'));
// app.use('/api', require('./routes/exams'));
// app.use('/api', require('./routes/stats'));

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`NIS Practice Platform running at http://localhost:${PORT}`);
  });
}

module.exports = { app };

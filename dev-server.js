// LOCAL DEV server (in-memory) — production uses api/index.js + Upstash Redis on Vercel
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

let state = { surveys: [], activeSurveyId: null };
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const clean = (b) => ({
  title: String((b||{}).title||'').trim(),
  question: String((b||{}).question||'').trim(),
  options: ((b||{}).options||[]).map(o => String(o).trim()).filter(Boolean)
});

app.get('/api/surveys', (req, res) => res.json(state));

app.post('/api/surveys', (req, res) => {
  const { title, question, options } = clean(req.body);
  if (!title || !question || options.length < 2) {
    return res.status(400).json({ error: 'タイトル・質問・2つ以上の選択肢が必要です' });
  }
  const survey = {
    id: newId(), title, question, options,
    votes: Object.fromEntries(options.map(o => [o, 0])),
    createdAt: Date.now()
  };
  state.surveys.push(survey);
  res.json(survey);
});

app.put('/api/surveys/:id', (req, res) => {
  const { title, question, options } = clean(req.body);
  if (!title || !question || options.length < 2) {
    return res.status(400).json({ error: 'タイトル・質問・2つ以上の選択肢が必要です' });
  }
  const idx = state.surveys.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'アンケートが見つかりません' });
  const prevVotes = state.surveys[idx].votes || {};
  state.surveys[idx] = {
    ...state.surveys[idx], title, question, options,
    votes: Object.fromEntries(options.map(o => [o, prevVotes[o] || 0]))
  };
  res.json(state.surveys[idx]);
});

app.delete('/api/surveys/:id', (req, res) => {
  state.surveys = state.surveys.filter(s => s.id !== req.params.id);
  if (state.activeSurveyId === req.params.id) state.activeSurveyId = null;
  res.json({ success: true });
});

app.post('/api/surveys/deactivate', (req, res) => {
  state.activeSurveyId = null;
  res.json({ activeSurveyId: null });
});

app.post('/api/surveys/:id/activate', (req, res) => {
  const s = state.surveys.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'アンケートが見つかりません' });
  state.activeSurveyId = req.params.id;
  res.json({ activeSurveyId: req.params.id });
});

app.post('/api/surveys/:id/reset', (req, res) => {
  const s = state.surveys.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'アンケートが見つかりません' });
  s.votes = Object.fromEntries(s.options.map(o => [o, 0]));
  res.json(s);
});

app.get('/api/active', (req, res) => {
  const s = state.activeSurveyId ? state.surveys.find(x => x.id === state.activeSurveyId) || null : null;
  res.json(s);
});

app.post('/api/vote', (req, res) => {
  const { option } = req.body || {};
  if (!state.activeSurveyId) return res.status(400).json({ error: 'アンケートは現在受付中ではありません' });
  const s = state.surveys.find(x => x.id === state.activeSurveyId);
  if (!s) return res.status(400).json({ error: 'アンケートが見つかりません' });
  if (typeof option !== 'string' || !(option in s.votes)) return res.status(400).json({ error: '無効な選択肢です' });
  s.votes[option]++;
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ DEV server running\n`);
  console.log(`  管理画面:  http://localhost:${PORT}/admin.html`);
  console.log(`  回答画面:  http://localhost:${PORT}/vote.html`);
  console.log(`  結果画面:  http://localhost:${PORT}/results.html\n`);
});

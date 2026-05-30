const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

let survey = {
  version: 0,
  question: '',
  options: [],
  votes: {},
  active: false
};

app.get('/api/survey', (req, res) => res.json(survey));

app.post('/api/survey', (req, res) => {
  const { question, options = [] } = req.body;
  const cleanOpts = options.map(o => o.trim()).filter(Boolean);
  if (!question?.trim() || cleanOpts.length < 2) {
    return res.status(400).json({ error: '質問と2つ以上の選択肢が必要です' });
  }
  survey = {
    version: survey.version + 1,
    question: question.trim(),
    options: cleanOpts,
    votes: Object.fromEntries(cleanOpts.map(o => [o, 0])),
    active: false
  };
  res.json(survey);
});

app.post('/api/survey/activate', (req, res) => {
  if (!survey.question) return res.status(400).json({ error: 'アンケートが作成されていません' });
  survey.active = req.body.active !== false;
  res.json(survey);
});

app.post('/api/survey/reset', (req, res) => {
  survey.votes = Object.fromEntries(survey.options.map(o => [o, 0]));
  res.json(survey);
});

app.post('/api/vote', (req, res) => {
  const { option } = req.body;
  if (!survey.active) return res.status(400).json({ error: '受付中ではありません' });
  if (!(option in survey.votes)) return res.status(400).json({ error: '無効な選択肢' });
  survey.votes[option]++;
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ アンケートアプリが起動しました\n`);
  console.log(`  管理画面:  http://localhost:${PORT}/admin.html`);
  console.log(`  回答画面:  http://localhost:${PORT}/vote.html`);
  console.log(`  結果画面:  http://localhost:${PORT}/results.html\n`);
});

// Vercel serverless function — handles all /api/* routes
// In-memory state: works for training sessions (single warm instance)
let survey = {
  version: 0,
  question: '',
  options: [],
  votes: {},
  active: false
};

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Derive route from query params (Vercel catch-all) or URL (fallback)
  const qpath = req.query.path;
  const fromQuery = Array.isArray(qpath) ? qpath.join('/') : (typeof qpath === 'string' ? qpath : '');
  const fromUrl = (req.url || '').replace(/^\/api\//, '').replace(/\?.*$/, '');
  const route = fromQuery || fromUrl;

  // GET /api/survey
  if (route === 'survey' && req.method === 'GET') {
    return res.status(200).json(survey);
  }

  // POST /api/survey — create/update
  if (route === 'survey' && req.method === 'POST') {
    const { question, options = [] } = req.body || {};
    const cleanOpts = options.map(o => String(o).trim()).filter(Boolean);
    if (!String(question || '').trim() || cleanOpts.length < 2) {
      return res.status(400).json({ error: '質問と2つ以上の選択肢が必要です' });
    }
    survey = {
      version: survey.version + 1,
      question: String(question).trim(),
      options: cleanOpts,
      votes: Object.fromEntries(cleanOpts.map(o => [o, 0])),
      active: false
    };
    return res.status(200).json(survey);
  }

  // POST /api/survey/activate
  if (route === 'survey/activate' && req.method === 'POST') {
    if (!survey.question) {
      return res.status(400).json({ error: 'アンケートが作成されていません' });
    }
    survey.active = (req.body || {}).active !== false;
    return res.status(200).json(survey);
  }

  // POST /api/survey/reset
  if (route === 'survey/reset' && req.method === 'POST') {
    survey.votes = Object.fromEntries(survey.options.map(o => [o, 0]));
    return res.status(200).json(survey);
  }

  // POST /api/vote
  if (route === 'vote' && req.method === 'POST') {
    const { option } = req.body || {};
    if (!survey.active) {
      return res.status(400).json({ error: 'アンケートは現在受付中ではありません' });
    }
    if (typeof option !== 'string' || !(option in survey.votes)) {
      return res.status(400).json({ error: '無効な選択肢です' });
    }
    survey.votes[option]++;
    return res.status(200).json({ success: true });
  }

  return res.status(404).json({ error: 'Not found' });
};

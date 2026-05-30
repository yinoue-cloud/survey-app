// Vercel serverless function — multi-survey API backed by Upstash Redis
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const STATE_KEY = 'survey_app_state_v2';

const defaultState = () => ({ surveys: [], activeSurveyId: null });

async function getState() {
  const state = await redis.get(STATE_KEY);
  if (!state) return defaultState();
  if (typeof state === 'string') return JSON.parse(state);
  return state;
}

async function setState(state) {
  await redis.set(STATE_KEY, JSON.stringify(state));
}

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function cleanInput(body) {
  const title = String((body || {}).title || '').trim();
  const question = String((body || {}).question || '').trim();
  const options = ((body || {}).options || []).map(o => String(o).trim()).filter(Boolean);
  return { title, question, options };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const qpath = req.query && req.query.path;
  const fromQuery = Array.isArray(qpath) ? qpath.join('/') : (typeof qpath === 'string' ? qpath : '');
  const fromUrl = (req.url || '').replace(/^\/api\//, '').replace(/\?.*$/, '');
  const route = fromQuery || fromUrl;
  const method = req.method;

  try {
    // GET /api/surveys
    if (route === 'surveys' && method === 'GET') {
      const state = await getState();
      return res.status(200).json(state);
    }

    // POST /api/surveys
    if (route === 'surveys' && method === 'POST') {
      const { title, question, options } = cleanInput(req.body);
      if (!title || !question || options.length < 2) {
        return res.status(400).json({ error: 'タイトル・質問・2つ以上の選択肢が必要です' });
      }
      const state = await getState();
      const survey = {
        id: newId(),
        title, question, options,
        votes: Object.fromEntries(options.map(o => [o, 0])),
        createdAt: Date.now()
      };
      state.surveys.push(survey);
      await setState(state);
      return res.status(200).json(survey);
    }

    // PUT /api/surveys/{id}
    const m1 = route.match(/^surveys\/([^/]+)$/);
    if (m1 && method === 'PUT') {
      const id = m1[1];
      const { title, question, options } = cleanInput(req.body);
      if (!title || !question || options.length < 2) {
        return res.status(400).json({ error: 'タイトル・質問・2つ以上の選択肢が必要です' });
      }
      const state = await getState();
      const idx = state.surveys.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ error: 'アンケートが見つかりません' });
      const prevVotes = state.surveys[idx].votes || {};
      state.surveys[idx] = {
        ...state.surveys[idx],
        title, question, options,
        votes: Object.fromEntries(options.map(o => [o, prevVotes[o] || 0]))
      };
      await setState(state);
      return res.status(200).json(state.surveys[idx]);
    }

    // DELETE /api/surveys/{id}
    if (m1 && method === 'DELETE') {
      const id = m1[1];
      const state = await getState();
      state.surveys = state.surveys.filter(s => s.id !== id);
      if (state.activeSurveyId === id) state.activeSurveyId = null;
      await setState(state);
      return res.status(200).json({ success: true });
    }

    // POST /api/surveys/{id}/activate
    const m2 = route.match(/^surveys\/([^/]+)\/activate$/);
    if (m2 && method === 'POST') {
      const id = m2[1];
      const state = await getState();
      const survey = state.surveys.find(s => s.id === id);
      if (!survey) return res.status(404).json({ error: 'アンケートが見つかりません' });
      state.activeSurveyId = id;
      await setState(state);
      return res.status(200).json({ activeSurveyId: id });
    }

    // POST /api/surveys/deactivate
    if (route === 'surveys/deactivate' && method === 'POST') {
      const state = await getState();
      state.activeSurveyId = null;
      await setState(state);
      return res.status(200).json({ activeSurveyId: null });
    }

    // POST /api/surveys/{id}/reset
    const m3 = route.match(/^surveys\/([^/]+)\/reset$/);
    if (m3 && method === 'POST') {
      const id = m3[1];
      const state = await getState();
      const survey = state.surveys.find(s => s.id === id);
      if (!survey) return res.status(404).json({ error: 'アンケートが見つかりません' });
      survey.votes = Object.fromEntries(survey.options.map(o => [o, 0]));
      await setState(state);
      return res.status(200).json(survey);
    }

    // GET /api/active
    if (route === 'active' && method === 'GET') {
      const state = await getState();
      const survey = state.activeSurveyId
        ? state.surveys.find(s => s.id === state.activeSurveyId) || null
        : null;
      return res.status(200).json(survey);
    }

    // POST /api/vote
    if (route === 'vote' && method === 'POST') {
      const { option } = req.body || {};
      const state = await getState();
      if (!state.activeSurveyId) {
        return res.status(400).json({ error: 'アンケートは現在受付中ではありません' });
      }
      const survey = state.surveys.find(s => s.id === state.activeSurveyId);
      if (!survey) {
        return res.status(400).json({ error: 'アンケートが見つかりません' });
      }
      if (typeof option !== 'string' || !(option in survey.votes)) {
        return res.status(400).json({ error: '無効な選択肢です' });
      }
      survey.votes[option]++;
      await setState(state);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Not found', route });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err && err.message || err) });
  }
};

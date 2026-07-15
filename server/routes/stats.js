const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function dayString(offsetDays) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
}

router.get('/stats', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const attempts = db.prepare(`
    SELECT a.awarded_mark, a.duration_sec, substr(a.created_at, 1, 10) AS day, q.marks
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ?
  `).all(uid);

  const solved = attempts.length;
  let awarded = 0;
  let possible = 0;
  const byDay = {};
  const today = dayString(0);
  let timeTodaySec = 0;
  let todayCount = 0;
  for (const a of attempts) {
    awarded += a.awarded_mark;
    possible += a.marks;
    byDay[a.day] = (byDay[a.day] || 0) + 1;
    if (a.day === today) { timeTodaySec += a.duration_sec; todayCount += 1; }
  }
  const accuracy = possible ? Math.round((100 * awarded) / possible) : 0;

  let streak = 0;
  const start = byDay[today] ? 0 : 1; // an empty today does not break the streak
  while (byDay[dayString(start + streak)]) streak += 1;

  const heatmap = [];
  for (let off = 104; off >= 0; off -= 1) {
    const date = dayString(off);
    heatmap.push({ date, count: byDay[date] || 0 });
  }

  const recent = db.prepare(`
    SELECT id, subject, year, component, score, total, submitted_at
    FROM exams WHERE user_id=? AND submitted_at IS NOT NULL
    ORDER BY submitted_at DESC, id DESC LIMIT 5
  `).all(uid);

  const cont = db.prepare(`
    SELECT subject, year, component FROM exams
    WHERE user_id=? AND submitted_at IS NULL
    ORDER BY started_at DESC, id DESC LIMIT 1
  `).get(uid);

  res.json({
    solved,
    accuracy,
    streak,
    time_today_sec: timeTodaySec,
    today_count: todayCount,
    goal: 20,
    heatmap,
    recent,
    continue: cont || null,
  });
});

router.get('/objectives', requireAuth, (req, res) => {
  const subject = req.query.subject || 'Mathematics';
  const rows = db.prepare(`
    SELECT q.topic,
           COUNT(a.id) AS attempts,
           COALESCE(SUM(a.awarded_mark), 0) AS awarded,
           COALESCE(SUM(CASE WHEN a.id IS NULL THEN 0 ELSE q.marks END), 0) AS possible
    FROM questions q
    LEFT JOIN attempts a ON a.question_id = q.id AND a.user_id = ?
    WHERE q.subject = ?
    GROUP BY q.topic
    ORDER BY q.topic
  `).all(req.session.userId, subject);
  res.json({
    objectives: rows.map((r) => ({
      topic: r.topic,
      attempts: r.attempts,
      pct: r.possible ? Math.round((100 * r.awarded) / r.possible) : 0,
    })),
  });
});

module.exports = router;

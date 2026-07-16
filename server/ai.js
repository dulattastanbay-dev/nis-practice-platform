// Real AI marking, with the spec's required fallback:
//   "If AI is not available, the website should continue working normally."
//
// Enabled only when ANTHROPIC_API_KEY is set in the environment. Never commit a
// key — set it on the host (e.g. Render → Environment).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

function isEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Strip LaTeX delimiters etc. is unnecessary — the model reads them fine.
function buildPrompt({ questionText, markScheme, maxMarks, answer }) {
  return `You are marking one exam question for a Nazarbayev Intellectual Schools student.

<question>${questionText}</question>
<mark_scheme>${markScheme}</mark_scheme>
<maximum_marks>${maxMarks}</maximum_marks>
<student_answer>${answer}</student_answer>

Mark the answer strictly against the mark scheme. Then reply with ONLY a JSON object:
{"mark": <integer 0-${maxMarks}>, "feedback": "<2-3 sentences: what earned marks, which mark-scheme points are missing, and the specific mistake to fix. Address the student as 'you'. No preamble.>"}`;
}

// Returns { mark, feedback } or null when AI is unavailable/failing.
async function markAnswer({ questionText, markScheme, maxMarks, answer }) {
  if (!isEnabled()) return null;
  if (!String(answer || '').trim()) return null; // empty answers score 0 without a call
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildPrompt({ questionText, markScheme, maxMarks, answer }) }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`anthropic_${res.status}`);
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || '').join('').trim();
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json);
    const mark = Math.max(0, Math.min(Number(maxMarks), Math.round(Number(parsed.mark))));
    if (!Number.isFinite(mark) || typeof parsed.feedback !== 'string') throw new Error('bad_shape');
    return { mark, feedback: parsed.feedback };
  } catch (err) {
    // Never break marking because the model is down, slow, or misconfigured.
    console.warn('[ai] falling back to preset feedback:', err.message);
    return null;
  }
}

module.exports = { isEnabled, markAnswer, MODEL };

const { test } = require('node:test');
const assert = require('node:assert');
const {
  splitParts, stripNoise, cleanText, stripExaminerColumn, trimAtMarks,
} = require('../server/convert-math-dataset');

test('examiner column is stripped even mid-line (JS \\b does not work on Cyrillic)', () => {
  // Regression: /\bтора\b/ never matches, because \b is defined over ASCII only.
  const bled = 'Найдите уравнение сферы. тора';
  const out = stripExaminerColumn(bled);
  assert.ok(!/тора/.test(out), 'the stray "тора" fragment must go');
  assert.ok(out.includes('Найдите уравнение сферы.'));

  // ...but a real word merely containing those letters must survive.
  const real = 'Свойства ректора и аудитора важны.';
  assert.strictEqual(stripExaminerColumn(real), real);
});

test('question text is cut at its last [N] so the next question cannot bleed in', () => {
  // Real shape of the bug: Q3 ended with its [1] and then Q4's fragment followed.
  const bled = 'Точки P и Q имеют координаты. Найдите уравнение сферы.\n[1]\n3x 2 − x − 10';
  const out = cleanText(trimAtMarks(bled));
  assert.ok(out.includes('Найдите уравнение сферы.'));
  assert.ok(!out.includes('3x 2'), 'next question fragment removed');
  assert.ok(!out.includes('[1]'), 'marks marker removed');
});

test('text with no [N] marker is left intact', () => {
  const plain = 'Найдите значение p.';
  assert.strictEqual(trimAtMarks(plain), plain);
});

test('splits (a)(b)(c) with per-part marks that sum to the question total', () => {
  const text = [
    'Дано распределение вероятностей.',
    '   (a) Найдите значение m.',
    '                          [2]',
    '   (b) Найдите математическое ожидание.',
    '                          [3]',
  ].join('\n');
  const out = splitParts(text, 5);
  assert.ok(out, 'should split');
  assert.strictEqual(out.stem, 'Дано распределение вероятностей.');
  assert.deepStrictEqual(out.parts.map((p) => p.letter), ['a', 'b']);
  assert.deepStrictEqual(out.parts.map((p) => p.marks), [2, 3]);
  // the [N] marker is removed from the part body
  assert.ok(!out.parts[0].text.includes('[2]'));
  assert.ok(out.parts[0].text.includes('Найдите значение m'));
});

test('treats Cyrillic part labels (а)/(с) as a/c', () => {
  // U+0430 and U+0441 look identical to Latin a/c but are different characters.
  const text = [
    '   (а) First part.',
    '        [1]',
    '   (b) Second part.',
    '        [1]',
    '   (с) Third part.',
    '        [2]',
  ].join('\n');
  const out = splitParts(text, 4);
  assert.ok(out, 'Cyrillic labels must still split');
  assert.deepStrictEqual(out.parts.map((p) => p.letter), ['a', 'b', 'c']);
  assert.deepStrictEqual(out.parts.map((p) => p.marks), [1, 1, 2]);
});

test('refuses to split when part marks do not reconstruct the question total', () => {
  const text = '(a) One.\n[2]\n(b) Two.\n[2]';
  assert.strictEqual(splitParts(text, 7), null); // 2+2 != 7
  assert.ok(splitParts(text, 4), 'sums correctly -> splits');
});

test('refuses to split when a part has no marks, or labels are out of order', () => {
  assert.strictEqual(splitParts('(a) One.\n[2]\n(b) Two, no marks.', 4), null);
  // starts at (b): not a clean a,b,c run
  assert.strictEqual(splitParts('(b) One.\n[2]\n(c) Two.\n[2]', 4), null);
  // a single part is not a split
  assert.strictEqual(splitParts('(a) Only one.\n[4]', 4), null);
});

test('a question with no stem yields an empty stem, never a duplicate of the parts', () => {
  const text = '(a) First.\n[2]\n(b) Second.\n[2]';
  const out = splitParts(text, 4);
  assert.strictEqual(out.stem, '');
  assert.ok(!out.stem.includes('First'));
});

test('strips the "Для экзаменатора" margin column but keeps ordinary "Для"', () => {
  const bled = 'В таблице показано распределение X, где c - Для\nпостоянная. экзамена-\nтора';
  const out = cleanText(bled);
  assert.ok(out.includes('В таблице показано распределение'));
  assert.ok(out.includes('постоянная.'));
  assert.ok(!/экзамена/.test(out), 'examiner column removed');
  assert.ok(!/\bтора\b/.test(out));

  // "Для" in a normal sentence must survive untouched.
  const normal = 'Для решения используйте теорему Пифагора.';
  assert.strictEqual(cleanText(normal), normal);
});

test('strips repeated page headers/footers without eating real text', () => {
  const withFooter = 'Real question text.\n   AEO NIS 2025            NIS/G12/MATHS/02\n12\nMore text.';
  const cleaned = stripNoise(withFooter);
  assert.ok(cleaned.includes('Real question text.'));
  assert.ok(cleaned.includes('More text.'));
  assert.ok(!cleaned.includes('AEO NIS'));
  assert.ok(!/NIS\/G12/.test(cleaned));
  // a bare page number line is dropped
  assert.ok(!/^\s*12\s*$/m.test(cleaned));
  // text sharing a line with a footer survives
  assert.ok(cleanText('Answer is 5. AEO NIS 2025').includes('Answer is 5.'));
});

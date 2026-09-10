/* Практика по предложениям. Текст пользователя сравнивается без регистра и пунктуации. */
const Training = (() => {
  let pool = () => [], mode = 'test', session = null;
  const $ = id => document.getElementById(id);
  function node(tag, className, text) { const el = document.createElement(tag); el.className = className || ''; if (text !== undefined) el.textContent = text; return el; }
  function button(text, fn, className = 'secondary') { const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', fn); return el; }
  function shuffle(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
  const normalize = text => String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s]/g, '').replace(/\s+/g, ' ').trim();
  function makeQuestions(entries, type) {
    // Числовые варианты одного шаблона не заполняют всё занятие.
    const unique = new Map();
    for (const entry of shuffle(entries)) {
      const tokens = entry.word.split(/\s+/);
      if (tokens.length < 4 || tokens.length > 18 || !/[.!?]$/.test(entry.word)) continue;
      const pattern = normalize(entry.word).replace(/\d+/g, '#');
      if (unique.has(pattern)) continue;
      const eligible = tokens.map((word, index) => ({ word, index })).filter(item => /^[a-z][a-z'’]*[.,!?]?$/i.test(item.word) && normalize(item.word).length > 2);
      if (!eligible.length) continue;
      const gap = eligible[Math.floor(Math.random() * eligible.length)].index;
      unique.set(pattern, { entry, tokens, gap, order: shuffle(tokens.map((_, index) => index)), picked: [], checked: false, correct: false, typed: '' });
      if (unique.size === 10) break;
    }
    return [...unique.values()];
  }
  function summary() {
    const stats = Storage.read('lastQuiz', {})?.practiceStats;
    $('practice-summary').textContent = stats ? `Практика: ${stats.correct || 0} верных ответов из ${stats.attempts || 0}. Выберите вид задания.` : 'Короткое занятие до 10 заданий. Выберите вид практики.';
  }
  function reset() { session = null; if (mode !== 'test') start(); }
  function choose(next) {
    mode = next;
    $('learning-content').hidden = true;
    $('quiz-content').hidden = mode !== 'test'; $('training-content').hidden = mode === 'test';
    for (const id of ['test', 'gap', 'order']) $(`mode-${id}`).setAttribute('aria-pressed', String(id === mode));
    summary(); if (mode !== 'test') start();
  }
  function start() { session = { questions: makeQuestions(pool(), mode), index: 0 }; render(); }
  function record(correct, entry, exercise, actual) {
    Learning.record({ ...entry, exercise }, correct, Date.now(), actual);
    const result = Storage.read('lastQuiz', {}) || {};
    const stats = result.practiceStats || {};
    Storage.write('lastQuiz', { ...result, practiceStats: { attempts: (Number(stats.attempts) || 0) + 1, correct: (Number(stats.correct) || 0) + Number(correct) } });
    summary();
  }
  function render() {
    const host = $('training-content'); host.replaceChildren();
    if (!session.questions.length) { host.append(node('p', 'empty', 'В этой выборке нет подходящих предложений. Выберите файл «Предложения A1–C1» или расширьте фильтры.')); return; }
    const box = node('div', 'training-box'); host.append(box);
    if (session.index === session.questions.length) {
      const correct = session.questions.filter(q => q.correct).length;
      box.append(node('p', 'eyebrow', 'ЗАНЯТИЕ ЗАВЕРШЕНО'), node('h3', 'training-title', `${correct} из ${session.questions.length} — верно`));
      for (const q of session.questions.filter(q => !q.correct)) {
        const review = node('div', 'review', q.entry.word); review.append(node('span', '', q.entry.translation)); box.append(review);
      }
      box.append(button('Разобрать ошибки', () => LearningUI.open('errors')), button('Ещё 10 заданий →', start, 'primary')); return;
    }
    const q = session.questions[session.index];
    box.append(node('p', 'eyebrow', `${mode === 'gap' ? 'ВСТАВИТЬ СЛОВО' : 'СОБРАТЬ ФРАЗУ'} · ${session.index + 1} / ${session.questions.length}`));
    box.append(node('h3', 'training-title', q.entry.translation));
    const help = node('p', 'hint', mode === 'gap' ? `Вставьте слово, начинающееся на «${normalize(q.tokens[q.gap])[0]}». Подсказка: ${normalize(q.tokens[q.gap]).length} букв/символов. Регистр не важен.` : 'Нажимайте слова в нужном порядке. Слово в ответе можно нажать ещё раз, чтобы вернуть.'); box.append(help);
    let input;
    if (mode === 'gap') {
      const sentence = node('p', 'gap-sentence', q.tokens.map((word, index) => index === q.gap ? '_____' : word).join(' ')); sentence.lang = 'en'; box.append(sentence);
      input = node('input', 'gap-input'); input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Пропущенное слово'); input.placeholder = 'Ваш ответ…'; input.value = q.typed; input.disabled = q.checked; box.append(input);
    } else {
      const answer = node('div', 'sentence-answer'); answer.setAttribute('aria-label', 'Ваше предложение');
      if (!q.picked.length) answer.append(node('span', 'hint', 'Здесь появится ваше предложение'));
      for (const index of q.picked) { const el = button(q.tokens[index], () => { q.picked = q.picked.filter(i => i !== index); render(); }, 'word-token'); el.disabled = q.checked; answer.append(el); }
      const bank = node('div', 'word-bank');
      for (const index of q.order) { const el = button(q.tokens[index], () => { q.picked.push(index); render(); }, 'word-token'); el.disabled = q.checked || q.picked.includes(index); bank.append(el); }
      box.append(answer, bank);
    }
    const feedback = node('p', 'feedback'); feedback.setAttribute('role', 'status'); box.append(feedback);
    const check = button('Проверить', () => {
      if (q.checked) return;
      if (mode === 'gap') {
        q.typed = input.value;
        if (!normalize(q.typed)) { feedback.textContent = 'Сначала введите слово.'; return; }
        q.correct = Learning.accepts(q.tokens.map((word, i) => i === q.gap ? q.typed : word).join(' '), q.entry.word);
      } else {
        if (q.picked.length !== q.tokens.length) { feedback.textContent = 'Используйте все слова.'; return; }
        q.correct = Learning.accepts(q.picked.map(i => q.tokens[i]).join(' '), q.entry.word);
      }
      q.checked = true; record(q.correct, q.entry, mode === 'gap' ? { prompt: q.tokens.map((word, i) => i === q.gap ? '___' : word).join(' '), answer: q.tokens[q.gap], hint: `Слово начинается на «${normalize(q.tokens[q.gap])[0]}».` } : undefined, mode === 'gap' ? q.typed : q.picked.map(i => q.tokens[i]).join(' ')); render();
    }, 'primary');
    if (!q.checked) box.append(check);
    if (input) input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); check.click(); } });
    if (q.checked) {
      feedback.textContent = q.correct ? 'Верно! Фраза собрана правильно.' : 'Сравните с вариантом из материала:';
      if (mode === 'gap' && q.correct) feedback.textContent = 'Верно!';
      const full = node('div', 'training-solution'); full.append(node('p', '', q.entry.word), node('p', 'example-translation', q.entry.translation)); box.append(full);
      box.append(node('p', 'hint', Learning.explain(q.entry)));
      if (!q.correct) box.append(button('Мой вариант тоже верен', () => {
        q.correct = true; Learning.record(q.entry, true);
        const result = Storage.read('lastQuiz', {}) || {}; const stats = result.practiceStats || {};
        Storage.write('lastQuiz', { ...result, practiceStats: { ...stats, correct: (stats.correct || 0) + 1 } });
        summary(); render();
      }));
      box.append(button(session.index + 1 === session.questions.length ? 'Итоги занятия →' : 'Следующее задание →', () => { session.index++; render(); }, 'primary'));
    }
  }
  function init(getPool) { pool = getPool; for (const type of ['test', 'gap', 'order']) $(`mode-${type}`).addEventListener('click', () => choose(type)); summary(); }
  return { init, reset, makeQuestions, normalize, refresh: summary, resetAccount() { session = null; choose('test'); } };
})();

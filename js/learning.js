/* Планировщик, журнал ошибок и контролируемая проверка ответов. Данные аккаунта
   лежат в существующем lastQuiz.learning: миграция таблицы Supabase не требуется. */
const Learning = (() => {
  const DAY = 86400000;
  const tidy = text => String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-zа-яё0-9'\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  function canonical(text) {
    let value = tidy(text);
    const pairs = { "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "i've": 'i have', "we've": 'we have', "they've": 'they have', "you've": 'you have', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not', "isn't": 'is not', "aren't": 'are not', "hasn't": 'has not', "haven't": 'have not', "i'll": 'i will', "we'll": 'we will', "they'll": 'they will' };
    for (const [short, full] of Object.entries(pairs)) value = value.replace(new RegExp('\\b' + short + '\\b', 'g'), full);
    return value;
  }
  function forms(text) {
    const normal = canonical(text), result = new Set([normal]);
    // Только известные обстоятельства времени; произвольную перестановку не принимаем.
    for (const time of ['every day', 'every morning', 'every evening', 'yesterday', 'tomorrow', 'today', 'right now', 'now', 'on weekends']) {
      if (normal.endsWith(' ' + time)) result.add(time + ' ' + normal.slice(0, -time.length - 1));
      if (normal.startsWith(time + ' ')) result.add(normal.slice(time.length + 1) + ' ' + time);
    }
    return result;
  }
  function accepts(actual, expected, alternatives = []) { return [expected, ...alternatives].some(text => forms(text).has(canonical(actual))); }
  function state() {
    const value = Storage.read('lastQuiz', {})?.learning;
    const result = { reviews: value?.reviews || {}, errors: value?.errors || {}, courses: value?.courses || {}, mastery: value?.mastery || {}, daily: value?.daily || null, achievements: value?.achievements || { days: {}, earned: {} } };
    // Переносим исправленные записи, сохранённые старыми версиями.
    for (const [id, error] of Object.entries(result.errors)) {
      if (error.lastResult === 'correct' || error.lastResult === 'self-rated' || (!error.lastResult && error.due > error.wrongAt)) {
        result.reviews[id] = { ...result.reviews[id], entry: error.entry, due: error.due, corrected: true };
        delete result.errors[id];
      }
    }
    return result;
  }
  function save(value) { Storage.write('lastQuiz', { ...(Storage.read('lastQuiz', {}) || {}), learning: value }); }
  function schedule(previous, rating, now = Date.now()) {
    const interval = Math.max(0, Number(previous?.interval) || 0);
    const days = rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, Math.round(interval * 1.2)) : rating === 'easy' ? Math.max(3, Math.round(interval * 2.5)) : Math.max(1, Math.round(interval * 2));
    return { interval: Math.min(days, 180), due: now + (rating === 'again' ? 600000 : Math.min(days, 180) * DAY), lapses: (previous?.lapses || 0) + Number(rating === 'again') };
  }
  function explain(entry) {
    if (entry.explanation) return entry.explanation;
    const text = canonical(entry.word);
    if (/(^did (i|you|he|she|it|we|they)\b|\bdid not\b)/.test(text)) return 'После did и did not используется начальная форма глагола. Прошедшее время уже выражено словом did.';
    if (/(^does (he|she|it)\b|\bdoes not\b)/.test(text)) return 'После does и does not глагол используется без -s. Окончание третьего лица выражено в does.';
    if (/\b(have|has) been \w+ing\b/.test(text)) return 'Have/has been + форма на -ing подчёркивает длительность процесса; for задаёт период, since — начальную точку.';
    if (/\b(can|cannot|should|must|will)\b/.test(text)) return 'После can, should, must и will ставится начальная форма смыслового глагола без to.';
    if (/\b(am|is|are) \w+ing\b/.test(text)) return 'Действие в процессе: am/is/are + глагол на -ing. Форма be согласуется с подлежащим.';
    if (/\b(have|has) (already |just |never )?\w+/.test(text) && /\b(finished|seen|done|gone|arrived|been)\b/.test(text)) return 'Present Perfect: have/has + третья форма. С he/she/it используйте has, с I/you/we/they — have.';
    if (/^(i am|you are|he is|she is|we are|they are)\b/.test(text)) return 'Be связывает подлежащее с состоянием или местом: I am, he/she/it is, you/we/they are.';
    return `Значение в этом контексте: «${entry.translation}». Сопоставьте фразу целиком, а не отдельные слова.`;
  }
  function record(entry, correct, now = Date.now(), actual = null, evidence = {}) {
    entry = { ...entry, exercise: entry.exercise || (entry.prompt ? { prompt: entry.prompt, answer: entry.answer, hint: entry.hint, alternatives: entry.alternatives } : undefined) };
    const data = state();
    if (typeof Coach !== 'undefined') Coach.track(data, entry, correct, now, evidence);
    if (typeof Achievements !== 'undefined') Achievements.record(data, entry, correct, now, actual, evidence);
    data.reviews[entry.id] = { ...schedule(data.reviews[entry.id], correct ? 'good' : 'again', now), entry };
    if (!correct) data.errors[entry.id] = { entry, actual, wrongAt: now, due: now, lastResult: 'wrong', lastAttemptAt: now, attempts: (data.errors[entry.id]?.attempts || 0) + 1 };
    else if (data.errors[entry.id]) {
      delete data.errors[entry.id];
      data.reviews[entry.id].due = now + DAY;
      data.reviews[entry.id].corrected = true;
    }
    save(data); refresh();
  }
  function rate(entry, rating, now = Date.now()) {
    if (rating === 'again') return record(entry, false, now);
    entry = { ...entry, exercise: entry.exercise || (entry.prompt ? { prompt: entry.prompt, answer: entry.answer, hint: entry.hint, alternatives: entry.alternatives } : undefined) };
    const data = state();
    data.reviews[entry.id] = { ...schedule(data.reviews[entry.id], rating, now), entry };
    if (rating !== 'again' && data.errors[entry.id]) {
      delete data.errors[entry.id];
      data.reviews[entry.id].corrected = true;
    }
    save(data); refresh();
  }
  function due(now = Date.now()) {
    const data = state();
    const result = Object.values(data.reviews).filter(item => item.due <= now).map(item => item.entry);
    const known = Storage.read('known', []);
    if (Array.isArray(known)) for (const id of known) if (!data.reviews[id]) { const entry = Vocabulary.find(e => e.id === id); if (entry) result.push(entry); }
    return result;
  }
  function errors(now = Date.now()) { return Object.values(state().errors).filter(item => item.due <= now).map(item => item.entry); }
  function cleanEntries(entries) {
    const seen = new Set();
    return entries.filter(entry => {
      if (entry.qualityIssue) return false;
      const sentence = entry.word.split(/\s+/).length >= 4;
      const key = canonical(entry.word).replace(sentence ? /\d+/g : /$^/g, '#') + '\0' + tidy(entry.translation).replace(sentence ? /\d+/g : /$^/g, '#').replace(/минут[ауы]?/g, 'минут');
      if (seen.has(key)) return false; seen.add(key); return true;
    });
  }
  function refresh() { if (typeof LearningUI !== 'undefined') LearningUI.dashboard(); }
  return { state, save, schedule, record, rate, due, errors, explain, canonical, accepts, cleanEntries, refresh, meaning: tidy };
})();

const LearningUI = (() => {
  const $ = id => document.getElementById(id);
  let navigate = () => {}, currentCourse = null, questions = [], index = 0, score = 0;
  const el = (tag, className, text) => { const node = document.createElement(tag); node.className = className || ''; if (text !== undefined) node.textContent = text; return node; };
  function button(text, action, style = 'secondary') { const node = el('button', style, text); node.type = 'button'; node.addEventListener('click', action); return node; }
  function dashboard() {
    const host = $('learning-dashboard'); if (!host) return;
    host.replaceChildren();
    host.append(el('div', 'learning-heading', 'Ваш следующий шаг'));
    const actions = el('div', 'learning-actions');
    actions.append(button(`Повторить сегодня · ${Learning.due().length}`, () => open('review'), 'primary'), button(`Разобрать ошибки · ${Object.keys(Learning.state().errors).length}`, () => open('errors')), button('Короткий урок →', () => open('courses')));
    host.append(actions);
    host.append(button(`Повторить позже · ${Object.values(Learning.state().reviews).filter(item => item.due > Date.now()).length}`, later));
    host.append(el('p', 'hint', 'Исправленные ошибки переходят в повторения. В ошибках остаются только неверные ответы.'));
    if (typeof Coach !== 'undefined') Coach.dashboard(host);
  }
  function surface() {
    navigate('learning'); $('learning-content').hidden = false;
    $('learning-content').replaceChildren();
    const box = el('div', 'training-box'); $('learning-content').append(box); return box;
  }
  function open(type) {
    if (type === 'later') return later();
    if (type === 'courses') return courses();
    if (type === 'errors') return errorList();
    questions = (type === 'errors' ? Learning.errors() : Learning.due()).slice(0, 20); index = 0;
    if (type === 'errors') errorQuestion(); else reviewQuestion();
  }
  function reviewQuestion() {
    const box = surface();
    if (index >= questions.length) { box.append(el('h3', 'training-title', questions.length ? 'Повторение завершено' : 'На сегодня повторений нет'), el('p', 'hint', 'Отмечайте слова в карточках и выполняйте задания — они появятся в расписании.')); return; }
    const entry = questions[index]; box.append(el('p', 'eyebrow', `ПОВТОРЕНИЕ · ${index + 1} / ${questions.length}`), el('h3', 'training-title', entry.word));
    const reveal = button('Показать перевод', () => {
      reveal.disabled = true;
      box.append(el('p', '', entry.translation), el('p', 'hint', Learning.explain(entry)));
      const actions = el('div', 'learning-actions');
      for (const [rating, label] of [['again','Не помню'],['hard','Сложно'],['easy','Легко']]) actions.append(button(label, () => { Learning.rate(entry, rating); index++; reviewQuestion(); }));
      box.append(actions);
    }, 'primary'); box.append(reveal);
  }
  function errorQuestion() {
    const box = surface();
    box.append(button('← Все ошибки', errorList));
    if (index >= questions.length) {
      const remaining = Object.values(Learning.state().errors);
      const now = Date.now();
      const ready = remaining.filter(item => item.due <= now).length;
      const later = remaining.length - ready;
      box.append(el('h3', 'training-title', remaining.length ? 'Тренировка завершена' : 'Ошибок в журнале не осталось'));
      if (remaining.length) {
        box.append(el('p', '', `В журнале ошибок: ${remaining.length}. Доступно для повторения сейчас: ${ready}. Запланировано на позже: ${later}.`));
        box.append(el('p', 'hint', 'Завершение этой тренировки не закрывает остальные ошибки. Исправленные записи перенесены в повторения.'));
        box.append(button('Выбрать следующую ошибку', errorList, 'primary'));
      } else box.append(el('p', 'hint', 'Неисправленных ошибок нет. Исправленные записи сохранены в расписании повторений.'));
      return;
    }
    const entry = questions[index];
    box.append(el('p', 'eyebrow', `РАЗБОР ОШИБОК · ${index + 1} / ${questions.length}`), el('p', '', entry.translation));
    if (entry.exercise) box.append(el('h3', 'training-title', entry.exercise.prompt), el('p', 'hint', entry.exercise.hint || 'Вставьте пропущенное слово.'));
    else box.append(el('p', 'hint', 'Переведите на английский. Сокращения и полные формы учитываются.'));
    const input = el('input', 'gap-input'); input.setAttribute('aria-label', 'Перевод на английский'); input.autocomplete = 'off'; box.append(input);
    const feedback = el('p', 'feedback'); feedback.setAttribute('role','status');
    const check = button('Проверить', () => {
      if (!input.value.trim()) { feedback.textContent = 'Введите ответ.'; return; }
      check.disabled = true; input.disabled = true;
      const alternatives = Vocabulary.filter(e => e.translation === entry.translation).map(e => e.word);
      const correct = entry.exercise ? Learning.accepts(input.value, entry.exercise.answer, entry.exercise.alternatives || []) : Learning.accepts(input.value, entry.word, alternatives);
      Learning.record(entry, correct, Date.now(), input.value);
      feedback.textContent = correct ? (Storage.available ? 'Верно. Исправление сохранено. Повторная проверка — в другой день.' : 'Верно. Исправление осталось в памяти вкладки: хранилище браузера недоступно.') : 'Сравните с примером. Если ваш вариант тоже верен, отметьте это ниже.';
      box.append(el('p', 'training-solution', entry.word), el('p', 'hint', Learning.explain(entry)));
      if (!correct) { const accept = button('Мой вариант тоже верен', () => { accept.disabled = true; Learning.record(entry, true); feedback.textContent = 'Принято по вашей оценке. Проверим ещё раз завтра.'; }); box.append(accept); }
      box.append(button('Дальше →', () => { index++; errorQuestion(); }, 'primary'));
    }, 'primary'); box.append(check, feedback);
  }
  function later() {
    const box = surface();
    const items = Object.values(Learning.state().reviews).filter(item => item.due > Date.now()).sort((a,b) => a.due - b.due);
    box.append(el('h3', 'training-title', `Повторить позже · ${items.length}`), el('p', 'hint', 'Запланированные повторения, а не ошибки. Можно потренироваться заранее.'));
    for (const item of items) box.append(button(`${item.entry.word} · ${new Date(item.due).toLocaleString('ru-RU')}`, () => { questions = [item.entry]; index = 0; reviewQuestion(); }, 'course-tile'));
    if (!items.length) box.append(el('p', '', 'Отложенных повторений пока нет.'));
  }
  function errorList() {
    const box = surface();
    const errors = Object.values(Learning.state().errors).sort((a, b) => b.wrongAt - a.wrongAt);
    box.append(el('h3', 'training-title', `Мои ошибки · ${errors.length}`), el('p', 'hint', 'Только неисправленные ошибки. После правильного ответа запись перейдёт в повторения.'));
    if (!errors.length) box.append(el('p', '', 'Ошибок пока нет. Здесь появятся ошибки из ваших заданий.'));
    const list = el('div', 'mistake-list');
    for (const item of errors) {
      const entry = item.entry;
      const tile = button('', () => errorDetail(item), 'course-tile mistake-tile');
      const fixed = item.lastResult === 'correct' || item.lastResult === 'self-rated' || (!item.lastResult && item.due > item.wrongAt);
      tile.append(el('strong', '', entry.exercise?.prompt || entry.word), el('span', '', entry.translation), el('small', 'hint', fixed ? `✓ Исправлено · ${item.due > Date.now() ? 'проверка памяти позже' : 'пора проверить память'}` : 'Нужно исправить'));
      list.append(tile);
    }
    box.append(list);
  }
  function errorDetail(item) {
    const box = surface(), entry = item.entry;
    const original = Vocabulary.find(word => word.id === entry.id) || entry;
    box.append(button('← Все ошибки', errorList), el('h3', 'training-title', entry.exercise?.prompt || entry.word));
    if (item.lastResult === 'correct' || item.lastResult === 'self-rated') box.append(el('p', 'training-solution', `✓ Исправление сохранено. Повторная проверка: ${new Date(item.due).toLocaleString('ru-RU')}.`));
    box.append(el('p', 'eyebrow', 'ВАШ ОТВЕТ'), el('p', '', item.actual || 'Ответ не был сохранён для этой старой записи.'));
    box.append(el('p', 'eyebrow', 'ПРАВИЛЬНЫЙ ОТВЕТ'), el('p', 'training-solution', entry.exercise?.answer || entry.word), el('p', '', entry.translation));
    box.append(el('h4', '', 'Как разобраться'), el('p', '', Learning.explain(entry)));
    if (typeof Coach !== 'undefined') Coach.explainMistake(box, item);
    const tokens = new Set(Learning.meaning(entry.word).split(' '));
    const parts = new Map();
    for (const word of Vocabulary) {
      const key = Learning.meaning(word.word);
      if (tokens.has(key) && key !== Learning.meaning(entry.word)) {
        if (!parts.has(key)) parts.set(key, new Set());
        parts.get(key).add(word.translation);
      }
    }
    const unambiguous = [...parts].filter(([, meanings]) => meanings.size === 1).slice(0, 8);
    if (unambiguous.length) {
      box.append(el('h4', '', 'Слова из фразы'), el('p', 'hint', 'Словарные значения для опоры. Перевод всей фразы указан выше.'));
      for (const [word, meanings] of unambiguous) box.append(el('p', '', `${word} — ${[...meanings][0]}`));
    }
    if (entry.exercise?.hint) box.append(el('p', 'hint', entry.exercise.hint));
    if (original.example) box.append(el('h4', '', 'Пример употребления'), el('p', 'training-solution', original.example));
    if (!entry.explanation && !original.example && !entry.exercise) box.append(el('p', 'hint', 'Для этой записи пока нет отдельного авторского примера. При тренировке вспомните английское выражение по его переводу.'));
    box.append(button('Потренировать эту ошибку', () => { questions = [entry]; index = 0; errorQuestion(); }, 'primary'));
  }
  function courses() {
    const box = surface(); box.append(el('p', 'eyebrow', 'ПРАВИЛО → ПРИМЕРЫ → 5 ЗАДАНИЙ'), el('h3', 'training-title', 'Короткие уроки'));
    for (const course of Courses) {
      const progress = Learning.state().courses[course.id];
      box.append(button(`${course.title}${progress ? ` · ${progress.score}/5` : ''} →`, () => introduction(course), 'course-tile'));
    }
  }
  function introduction(course) {
    currentCourse = course; index = 0; score = 0;
    const box = surface(); box.append(el('h3', 'training-title', course.title), el('p', '', course.rule), el('p', 'training-solution', course.example));
    box.append(button('Начать 5 заданий →', courseQuestion, 'primary'));
  }
  function courseQuestion() {
    const box = surface();
    if (index === currentCourse.questions.length) {
      const data = Learning.state(); data.courses[currentCourse.id] = { score, completedAt: Date.now() }; Learning.save(data); dashboard();
      box.append(el('h3', 'training-title', `Урок пройден · ${score}/5`), button('Разобрать ошибки', () => open('errors')), button('Другой урок →', courses, 'primary')); return;
    }
    const q = currentCourse.questions[index]; box.append(el('p','eyebrow',`${currentCourse.title} · ${index+1}/5`), el('h3','training-title',q.prompt), el('p','',q.translation), el('p','hint',q.hint));
    const input = el('input','gap-input'); input.setAttribute('aria-label','Ответ'); box.append(input);
    const feedback = el('p','feedback'); feedback.setAttribute('role','status');
    const check = button('Проверить', () => {
      if (!input.value.trim()) { feedback.textContent = 'Введите ответ.'; return; }
      check.disabled = true; input.disabled = true;
      const correct = Learning.accepts(input.value, q.answer, q.alternatives || []); if (correct) score++;
      Learning.record(q, correct, Date.now(), input.value); feedback.textContent = correct ? 'Верно!' : `Ответ: ${q.answer}`;
      box.append(el('p','training-solution',q.explanation), button(index === 4 ? 'Итоги урока →' : 'Следующее →', () => { index++; courseQuestion(); },'primary'));
    },'primary'); box.append(check,feedback);
  }
  function init(go) { navigate = go; window.addEventListener('focus', dashboard); $('open-errors').addEventListener('click',()=>open('errors')); $('open-review').addEventListener('click',()=>open('review')); $('open-courses').addEventListener('click',courses); dashboard(); }
  function courseFor(title) { const text = title.toLowerCase(); const pairs = [['present perfect','perfect'], ['present continuous','continuous'], ['present simple','present'], ['past simple','past'], ['am /','be'], ['модаль','modals']]; const pair = pairs.find(([name]) => text.includes(name)); return pair ? Courses.find(course => course.id === pair[1]) : null; }
  return { init, dashboard, open, introduction, courseFor, surface, resetAccount() { currentCourse = null; questions = []; index = 0; score = 0; $('learning-content').hidden = true; } };
})();

/* Учебные маршруты. Проверка ограничена известными ответами, без внешнего AI.
   Прогресс хранится в learning внутри существующей синхронизируемой записи. */
const Coach = (() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text !== undefined) n.textContent = text; return n; };
  const button = (text, action, cls = 'secondary') => { const n = el('button', cls, text); n.type = 'button'; n.addEventListener('click', action); return n; };
  const dayKey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function course(entry) {
    const id = entry.id?.match(/^course:([^:]+)/)?.[1];
    if (id) return Courses.find(c => c.id === id);
    const text = Learning.canonical(entry.word);
    const key = /\b(can|cannot|should|must)\b/.test(text) ? 'modals' : /\b(have|has) (finished|seen|done|gone|been)\b/.test(text) ? 'perfect' : /\b(am|is|are) \w+ing\b/.test(text) ? 'continuous' : /\b(did|yesterday)\b/.test(text) ? 'past' : /^(i am|he is|she is|you are|we are|they are)\b/.test(text) ? 'be' : /\b(every day|does)\b/.test(text) ? 'present' : null;
    return Courses.find(c => c.id === key);
  }
  function topic(entry) {
    if (entry.studyTopic) return entry.studyTopic;
    const c = course(entry); if (c) return c.title;
    const original = entry.memberships ? entry : Vocabulary.find(e => e.id === entry.id) || entry;
    return original.memberships?.[0]?.topic || 'Слова и выражения';
  }
  // Только проверенные самостоятельные ответы дают свидетельство освоения.
  // Ошибка сбрасывает серию темы. Самооценка и подсказки её не увеличивают.
  function track(data, entry, correct, now, evidence) {
    const key = topic(entry), previous = Object.prototype.hasOwnProperty.call(data.mastery, key) ? data.mastery[key] : { days: [], items: [], attempts: 0, failures: 0 };
    previous.attempts++; previous.lastAt = now;
    if (!correct) { previous.failures++; previous.days = []; previous.items = []; previous.weak = true; }
    else if (evidence.independent) {
      previous.days = [...new Set([...previous.days, dayKey(now)])].slice(-3);
      previous.items = [...new Set([...previous.items, entry.id])].slice(-3);
      previous.weak = false;
    }
    data.mastery[key] = previous;
  }
  function status(item) { return item.days.length >= 3 && item.items.length >= 3 ? 'Освоено' : item.weak ? 'Нужно повторить' : item.days.length ? 'Закрепляем' : 'Начато'; }
  function dashboard(host) {
    const row = el('div', 'coach-dashboard');
    const today = Learning.state().daily;
    const saved = today?.date === dayKey();
    row.append(el('div', '', saved ? `План на сегодня · ${today.index}/${today.tasks.length}` : '10–15 минут · повторение, слова, правило и диалог'));
    const actions = el('div', 'learning-actions');
    actions.append(button(saved && today.index < today.tasks.length ? 'Продолжить занятие' : 'Занятие на день', daily, 'primary'), button('Мои темы и слабые места', mastery), button('✦ Прогресс и достижения', () => Achievements.open())); row.append(actions); host.append(row); StudyTools.dashboard(host);
  }
  function mastery() {
    const box = LearningUI.surface(), data = Learning.state().mastery;
    box.append(el('h3', 'training-title', 'Что уже получается'), el('p', 'hint', 'Освоено = верные ответы без подсказок в 3 разные даты и минимум на 3 разных заданиях после последней ошибки. Это показатель практики, а не оценка уровня CEFR.'));
    const entries = Object.entries(data).sort((a,b) => Number(b[1].weak)-Number(a[1].weak) || b[1].lastAt-a[1].lastAt);
    if (!entries.length) box.append(el('p', '', 'Пройдите занятие на день или ответьте в диалоге — здесь появятся ваши темы.'));
    for (const [name, item] of entries) {
      const card = el('div', 'mastery-card');
      card.append(el('strong', '', name), el('span', 'eyebrow', status(item)), el('p', 'hint', `Самостоятельно: ${item.days.length}/3 дня · ${item.items.length}/3 задания`));
      const errors = Object.values(Learning.state().errors).filter(e => topic(e.entry) === name);
      const c = Courses.find(c => c.title === name);
      card.append(button('Потренировать тему', () => {
        const pool = c ? c.questions.map(q => ({ ...q, studyTopic: name })) : Learning.cleanEntries([...errors.map(e => e.entry), ...Object.values(Learning.state().reviews).map(e=>e.entry), ...Vocabulary].filter(e => topic(e) === name));
        run(pool.slice(0, 5).map(e => task(e, 'Закрепление темы')), () => mastery());
      })); box.append(card);
    }
  }
  function explainMistake(box, item) {
    const entry = item.entry, expected = entry.exercise?.answer || entry.word;
    const actual = item.actual;
    box.append(el('h4', '', 'Что отличается'));
    if (actual) {
      const english = !/[а-яё]/i.test(actual);
      const target = english ? expected : entry.translation;
      const a = Learning.canonical(actual).split(' '), b = Learning.canonical(target).split(' ');
      let start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++;
      let endA = a.length, endB = b.length;
      while (endA > start && endB > start && a[endA-1] === b[endB-1]) { endA--; endB--; }
      const diff = el('div', 'answer-comparison');
      diff.append(el('p', 'answer-before', `В ответе: ${a.slice(start,endA).join(' ') || '(пропущено)'}`), el('p', 'answer-after', `В образце: ${b.slice(start,endB).join(' ') || '(лишняя часть)'}`)); box.append(diff);
      box.append(el('p', 'hint', 'Выделено текстовое отличие от образца. Другой вариант может быть допустимым: это не автоматический диагноз грамматической ошибки.'));
    } else box.append(el('p', 'hint', 'Старый ответ не сохранился. Сравнение появится после следующей попытки.'));
    const diagnosis = StudyTools.diagnosis(entry,item.actual);
    if (diagnosis) box.append(el('p','training-solution',diagnosis));
    const c = course(entry);
    if (c) box.append(el('h4', '', c.title), el('p', '', c.rule), el('p', 'training-solution', c.example));
    const drills = related(entry);
    box.append(button('Закрепить · 2 задания', () => run(drills, () => LearningUI.open('errors')), 'secondary'));
  }
  function task(entry, stage, extra = {}) {
    const exercise = entry.exercise || (entry.prompt ? { prompt: entry.prompt, answer: entry.answer, alternatives: entry.alternatives, hint: entry.hint } : null);
    return { entry, stage, prompt: exercise?.prompt || `Переведите: ${entry.translation}`, answer: exercise?.answer || entry.word, alternatives: exercise?.alternatives || [], hint: exercise?.hint || `Начало ответа: ${(exercise?.answer || entry.word).slice(0, 2)}…`, ...extra };
  }
  function related(entry) {
    const c = course(entry);
    if (c) return c.questions.filter(q => q.id !== entry.id).slice(0,2).map(q => task(q, 'То же правило · новый пример'));
    // Для лексики проверяем оба направления, не придумывая грамматических правил.
    return [task(entry, 'Вспомните выражение', { assisted: true }), task(entry, 'Проверьте значение', { assisted: true, prompt: `Переведите: ${entry.word}`, answer: entry.translation, hint: `Начало перевода: ${entry.translation.slice(0,2)}…` })];
  }
  const replyVariants = {
    'yes i do': ['Yes, I do.', 'Yes.'], 'no i do not': ["No, I don't.", 'No.'],
    'a little': ['A little.', 'A little bit.'],
    'nice to meet you too': ['Nice to meet you too.', 'It is nice to meet you too.'],
    'i am fine thanks and you': ["I'm fine, thanks. And you?", "I'm well, thank you. How about you?"],
    'of course what do you need': ['Of course. What do you need?', 'Sure. What do you need?']
  };
  function dialogueTasks(dialogue) {
    return dialogue.turns.flatMap((turn, i) => {
      if (turn.speaker !== 'B') return [];
      const variants = [...(replyVariants[Learning.canonical(turn.word)] || []), ...(turn.alternatives || [])];
      const alternatives = [...new Set([...variants, ...[turn.word.replace(/\bI am\b/g, "I'm"), turn.word.replace(/\bI'm\b/g, 'I am')]])].filter(t => t !== turn.word);
      const entry = { ...turn, id: `reply:${dialogue.id}:${i}`, studyTopic: `Диалог · ${dialogue.level} · ${dialogue.topic}`, explanation: `Смысл реплики: «${turn.translation}». Ответьте на предыдущую реплику собеседника и сохраните этот смысл.` };
      return [task(entry, 'Ваша реплика', { prompt: `Ответьте по смыслу: ${turn.translation}`, alternatives, context: dialogue.turns.slice(0,i), dialogue: dialogue.title })];
    });
  }
  function dialogue(dialogue) { run(dialogueTasks(dialogue), () => App.navigate('materials')); }
  function buildDaily(now = Date.now()) {
    const saved = Learning.state();
    const reviews = Learning.cleanEntries(Learning.due(now)).slice(0,3);
    const known = new Set(Storage.read('known', []));
    const fresh = Learning.cleanEntries(Vocabulary).filter(e => !known.has(e.id) && !saved.reviews[e.id] && (!Catalog.levels(e).length || Catalog.levels(e).includes(StudyTools.level())) && e.word.split(/\s+/).length <= 3).slice(0,3);
    const tasks = [...reviews.map(e => task(e, 'Повторение')), ...fresh.map(e => task(e, 'Новые слова', { introduction: `${e.word} — ${e.translation}${e.example ? '\n' + e.example : ''}` })), ...StudyTools.lesson().map(q => task(q, 'Правило', { rule: q.explanation }))];
    const dayNumber = Math.floor(now / 86400000);
    const selectedLevel = StudyTools.level();
    const scenes = MediaLibrary.dialogues.filter(d => d.level === selectedLevel && d.reviewed);
    tasks.push(...dialogueTasks(scenes[dayNumber % scenes.length]).slice(0,2));
    return { date: dayKey(now), level: selectedLevel, tasks, index: 0, responses: {}, startedAt: now };
  }
  function daily() {
    let data = Learning.state();
    if (data.daily?.date !== dayKey()) { data.daily = buildDaily(); Learning.save(data); }
    const plan = data.daily, box = LearningUI.surface();
    box.append(el('p', 'eyebrow', 'ВАШ ПЛАН · 10–15 МИНУТ'), el('h3', 'training-title', plan.index === plan.tasks.length ? 'Занятие на сегодня завершено' : 'Небольшой шаг каждый день'));
    for (const stage of [...new Set(plan.tasks.map(t => t.stage))]) {
      const count = plan.tasks.filter(t => t.stage === stage).length;
      box.append(el('p', '', `${stage} · ${count} задания`));
    }
    box.append(el('p', 'hint', `Пройдено ${plan.index} из ${plan.tasks.length}. Можно закрыть страницу и продолжить позже. Уровень диалога: ${plan.level || 'A1'}.`));
    if (plan.index < plan.tasks.length) box.append(button(plan.index ? 'Продолжить занятие' : 'Начать занятие', () => run(plan.tasks, daily, true), 'primary'));
    else box.append(button('Посмотреть прогресс по темам', mastery, 'primary'));
  }
  // Общий экран письменных заданий; ежедневная очередь и ответы переживают reload.
  function run(tasks, back = mastery, isDaily = false, saved = null) {
    if (saved) tasks = saved.tasks;
    let index = isDaily ? Learning.state().daily.index : (saved?.index || 0);
    const responses = isDaily ? Learning.state().daily.responses : (saved?.responses || {});
    function persist() {
      if (!isDaily) { StudyTools.session('coach',index < tasks.length ? {tasks,index,responses} : null); return; }
      const data = Learning.state(); data.daily.index = index; data.daily.responses = responses;
      if (index === tasks.length) Achievements.completePlan(data);
      Learning.save(data);
    }
    function render() {
      const box = LearningUI.surface(); box.append(button('← Назад к обзору', back));
      if (index >= tasks.length) { box.append(el('h3', 'training-title', 'Практика завершена'), el('p', '', `Проверено ${tasks.length} заданий. Верно без подсказок: ${Object.values(responses).filter(r=>r.correct && !r.assisted).length}.`), button('Мои темы', mastery, 'primary'), button('Разобрать ошибки', () => LearningUI.open('errors'))); return; }
      const q = tasks[index]; const r = responses[index] ||= { actual: '', assisted: Boolean(q.introduction || q.rule || q.assisted), checked: false, correct: false };
      box.append(el('p', 'eyebrow', `${q.stage} · ${index+1}/${tasks.length}`));
      if (q.rule) box.append(el('p', 'coach-rule', q.rule));
      if (q.introduction && !r.learned) {
        box.append(el('h3', 'training-title', 'Прочитайте и запомните'), el('p', 'training-solution', q.introduction), button('Скрыть и попробовать вспомнить', () => { r.learned = true; persist(); render(); }, 'primary')); return;
      }
      if (q.context) {
        box.append(el('h4', '', q.dialogue));
        for (const turn of q.context) box.append(el('p', 'dialogue-turn', `${turn.speaker}: ${turn.word}`));
      }
      box.append(el('h3', 'training-title', q.prompt));
      const input = el('input', 'gap-input'); input.value = r.actual; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Ваш ответ'); input.disabled = r.checked;
      input.addEventListener('input', () => { r.actual = input.value; persist(); }); box.append(input);
      const feedback = el('p', 'feedback'); feedback.setAttribute('role','status'); box.append(feedback);
      if (!r.checked) {
        if (r.hintShown) box.append(el('p', 'hint', q.hint));
        box.append(button('Подсказка', () => { r.actual = input.value; r.assisted = true; r.hintShown = true; persist(); render(); }), button('Проверить', () => {
          if (!input.value.trim()) { feedback.textContent = 'Введите ответ.'; return; }
          if (r.checked) return;
          r.actual = input.value; r.correct = Learning.accepts(r.actual, q.answer, q.alternatives); r.checked = true;
          Learning.record({ ...q.entry, exercise: { prompt: q.prompt, answer: q.answer, alternatives: q.alternatives, hint: q.hint } }, r.correct, Date.now(), r.actual, { independent: !r.assisted });
          persist(); render();
        }, 'primary'));
      } else {
        feedback.textContent = r.correct ? (r.assisted ? 'Верно с помощью. Повторите самостоятельно в другой день.' : 'Верно, самостоятельно!') : 'Ответ отличается от известных вариантов. Сравните смысл и форму.';
        box.append(el('p', 'training-solution', q.answer), el('p', '', Learning.explain(q.entry)));
        if (q.alternatives.length) box.append(el('p', 'hint', `Другие варианты: ${q.alternatives.join(' / ')}`));
        if (!r.correct && !r.selfAccepted) box.append(button('Мой вариант подходит по смыслу', () => { r.selfAccepted = true; r.assisted = true; r.correct = true; Learning.record(q.entry, true); persist(); render(); }));
        box.append(button(index+1 === tasks.length ? 'Завершить' : 'Следующее →', () => { index++; persist(); LearningUI.dashboard(); render(); }, 'primary'));
      }
    }
    persist(); render();
  }
  return { track, topic, status, dayKey, dashboard, mastery, explainMistake, related, dialogueTasks, dialogue, buildDaily, daily, run };
})();

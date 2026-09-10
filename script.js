// Интерфейс SPA. Данные и парсер подключаются перед этим файлом.
const App = (() => {
  const $ = selector => document.querySelector(selector);
  const validIds = new Set(Vocabulary.map(entry => entry.id));
  const savedKnown = Storage.read('known', []);
  const known = new Set((Array.isArray(savedKnown) ? savedKnown : []).filter(id => validIds.has(id)));
  const savedLessons = Storage.read('lessons', []);
  const readLessons = new Set(Array.isArray(savedLessons) ? savedLessons.filter(id => Lessons.some(lesson => lesson.id === id)) : []);
  let progressOwner = Storage.accountId;
  let learningOrigin = 'dictionary';
  const state = { view: 'dictionary', source: '', lesson: null, limit: 40, deck: [], card: 0, quiz: null };
  // Все данные из TXT вставляются через textContent, а не как HTML.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, handler) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }
  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function filtered() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    return Learning.cleanEntries(Vocabulary.filter(entry => entry.memberships.some(item => (!state.source || item.source === state.source) && (!$('#category').value || item.topic === $('#category').value))
      && (!$('#level').value || ($('#level').value === 'ungraded' ? !Catalog.levels(entry).length : Catalog.levels(entry).includes($('#level').value)))
      && (!$('#track').value || entry.sources.some(source => Catalog.tracks[source] === $('#track').value))
      && ($('#status').value === 'all' || known.has(entry.id) === ($('#status').value === 'known'))
      && matchesSearch(entry, query)));
  }
  function matchesSearch(entry, query) {
    if (!query) return true;
    const normalize = Learning.meaning;
    const fields = [entry.word, entry.translation].map(normalize);
    const term = normalize(query);
    const mode = $('#search-mode').value;
    if (mode === 'all') return `${entry.word} ${entry.translation} ${entry.example} ${entry.expansion}`.toLocaleLowerCase().includes(query);
    if (mode === 'words') return fields.some(text => ` ${text} `.includes(` ${term} `));
    return fields.some(text => text === term) || [entry.word, entry.translation].some(text => String(text).split(/[,;/]/).some(part => normalize(part) === term));
  }
  function updateStats() {
    $('#total').textContent = Vocabulary.length.toLocaleString('ru');
    $('#known').textContent = known.size.toLocaleString('ru');
    const percent = Vocabulary.length ? Math.round(known.size / Vocabulary.length * 100) : 0;
    $('#percent').textContent = `${percent}%`;
    $('#progress').value = percent;
  }
  function setKnown(entry, value, schedule = true) {
    if (value) known.add(entry.id); else known.delete(entry.id);
    Storage.write('known', [...known]);
    Achievements.reconcile();
    if (schedule) Learning.rate(entry, value ? 'hard' : 'again');
    updateStats();
  }
  function empty(container, message = 'Ничего не найдено. Попробуйте другой запрос или выберите все темы.') {
    container.replaceChildren(el('p', 'empty', message));
  }
  function updateTopics() {
    const topics = new Set(Vocabulary.flatMap(entry => entry.memberships.filter(item => !state.source || item.source === state.source).map(item => item.topic)));
    $('#category').replaceChildren(el('option', '', 'Все темы'));
    $('#category').firstChild.value = '';
    for (const topic of topics) { const option = el('option', '', topic); option.value = topic; $('#category').append(option); }
  }
  function selectSource(name) {
    state.source = name;
    state.lesson = null;
    $('#source-select').value = name;
    $('#search').value = '';
    state.limit = 40; state.deck = []; state.quiz = null;
    updateTopics();
    Training.reset();
    renderSources();
    navigate(state.view);
  }
  function renderSources() {
    const list = $('#source-list'); list.replaceChildren();
    for (const source of [{ name: '', label: 'Вся библиотека' }, ...SOURCES]) {
      const count = source.name ? Vocabulary.filter(entry => entry.sources.includes(source.name)).length : Vocabulary.length;
      const control = button('', 'source-button', () => selectSource(source.name));
      control.append(el('span', 'source-symbol', source.name ? '▤' : '▦'), el('span', 'source-name', source.label || source.name), el('span', 'source-count', count));
      control.setAttribute('aria-pressed', String(source.name === state.source));
      list.append(control);
    }
    const summary = $('#source-summary'); summary.replaceChildren();
    if (state.source) {
      const source = SOURCES.find(item => item.name === state.source);
      const text = el('div');
      text.append(el('strong', '', source.name), el('span', '', `${Lessons.filter(lesson => lesson.source === source.name).length} уроков · отдельная коллекция`));
      const download = el('a', 'file-link', 'Скачать TXT ↓');
      download.href = `materials/${source.filename}`; download.download = source.filename;
      summary.append(text, download);
    }
    summary.hidden = !state.source;
  }
  function rules() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    const lessons = Lessons.filter(lesson => (!state.source || lesson.source === state.source)
      && `${lesson.title} ${lesson.lines.join(' ')}`.toLocaleLowerCase().includes(query));
    const list = $('#lesson-list'); list.replaceChildren();
    const picker = $('#lesson-picker'); picker.replaceChildren();
    $('#lesson-count').textContent = `Уроков: ${lessons.length} · прочитано: ${lessons.filter(lesson => readLessons.has(lesson.id)).length}`;
    if (!lessons.length) { empty($('#lesson-reader'), 'Уроки не найдены. Измените запрос или выберите другой файл.'); return; }
    if (!lessons.some(lesson => lesson.id === state.lesson)) state.lesson = lessons[0].id;
    for (const [index, lesson] of lessons.entries()) {
      const option = el('option', '', `${index + 1}. ${lesson.title}`);
      option.value = lesson.id; picker.append(option);
      const control = button('', 'lesson-button', () => {
        state.lesson = lesson.id; rules();
        $('#lesson-reader').focus({ preventScroll: true });
        if (window.matchMedia('(max-width: 700px)').matches) $('#lesson-reader').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      });
      control.append(el('span', 'lesson-number', readLessons.has(lesson.id) ? '✓' : String(index + 1).padStart(2, '0')), el('span', '', lesson.title));
      if (lesson.id === state.lesson) control.setAttribute('aria-current', 'true');
      list.append(control);
    }
    picker.value = state.lesson;
    renderLesson(lessons.find(lesson => lesson.id === state.lesson), lessons);
  }
  function renderLesson(lesson, lessons) {
    const reader = $('#lesson-reader'); reader.replaceChildren(); reader.tabIndex = -1;
    reader.append(el('p', 'eyebrow', lesson.added ? `${lesson.source} · краткий разбор` : `${lesson.source} · из ваших материалов`), el('h3', 'lesson-title', lesson.title));
    let section = reader;
    for (const line of lesson.lines) {
      if (!line) continue;
      if (/^Ответы:/i.test(line)) {
        section = el('details', 'lesson-answers');
        section.append(el('summary', '', 'Показать ответы'));
        reader.append(section);
      } else if (/^[^—]{2,70}:$/.test(line)) {
        section = el('section', /^ВАЖНО:$/i.test(line) ? 'lesson-block important' : 'lesson-block');
        section.append(el('h4', '', line.replace(/:$/, ''))); reader.append(section);
      } else if (/\s[—–]\s/.test(line)) {
        const [english, ...rest] = line.split(/\s[—–]\s/);
        const pair = el('div', 'example-pair');
        const original = el('p', '', english); if (!/[а-яё]/i.test(english)) original.lang = 'en';
        pair.append(original, el('p', 'example-translation', rest.join(' — '))); section.append(pair);
      } else {
        const paragraph = el('p', /\+|→/.test(line) ? 'formula' : 'lesson-line', line);
        if (/[a-z]/i.test(line) && !/[а-яё]/i.test(line)) paragraph.lang = 'en';
        section.append(paragraph);
      }
    }
    const actions = el('div', 'lesson-actions');
    const read = button(readLessons.has(lesson.id) ? '✓ Прочитано' : 'Отметить прочитанным', 'primary', () => {
      if (readLessons.has(lesson.id)) readLessons.delete(lesson.id); else readLessons.add(lesson.id);
      Storage.write('lessons', [...readLessons]);
      Achievements.reconcile();
      const scrollPosition = $('#lesson-list').scrollTop;
      rules(); $('#lesson-list').scrollTop = scrollPosition;
    });
    read.setAttribute('aria-pressed', String(readLessons.has(lesson.id))); actions.append(read);
    const index = lessons.indexOf(lesson);
    if (index + 1 < lessons.length) actions.append(button('Следующий урок →', 'secondary', () => {
      state.lesson = lessons[index + 1].id; rules(); $('#lesson-reader').scrollIntoView({ block: 'start' }); $('#lesson-reader').focus({ preventScroll: true });
    }));
    const shortCourse = LearningUI.courseFor(lesson.title);
    if (shortCourse) actions.append(button('Закрепить: 5 заданий →', 'secondary', () => LearningUI.introduction(shortCourse)));
    reader.append(actions);
  }
  function dictionary() {
    const entries = filtered();
    $('#count').textContent = `В подборке: ${entries.length.toLocaleString('ru')} · без повторов`;
    const list = $('#word-list');
    list.replaceChildren();
    if (!entries.length) empty(list);
    for (const entry of entries.slice(0, state.limit)) {
      const row = el('article', 'word-row');
      const left = el('div');
      const word = el('div', 'word', entry.word); word.lang = 'en';
      const membership = entry.memberships.find(item => (!state.source || item.source === state.source) && (!$('#category').value || item.topic === $('#category').value));
      left.append(word, el('div', 'tag', membership.topic));
      const right = el('div', 'translation', entry.translation);
      if (entry.expansion) right.append(el('div', 'expansion', `Полная форма: ${entry.expansion}`));
      if (entry.example) {
        const details = el('details', 'word-example');
        details.append(el('summary', '', 'Пример в контексте'));
        const example = el('p', 'example', entry.example); example.lang = 'en'; details.append(example);
        if (entry.exampleTranslation) details.append(el('p', 'example-translation', entry.exampleTranslation));
        right.append(details);
      }
      const toggle = button(known.has(entry.id) ? '✓' : '+', 'learn-button', () => {
        setKnown(entry, !known.has(entry.id));
        if ($('#status').value !== 'all') dictionary();
        else { toggle.textContent = known.has(entry.id) ? '✓' : '+'; toggle.setAttribute('aria-pressed', String(known.has(entry.id))); }
      });
      toggle.setAttribute('aria-label', `Выучено: ${entry.word}`);
      toggle.setAttribute('aria-pressed', String(known.has(entry.id)));
      row.append(left, right, toggle); list.append(row);
    }
    $('#more').hidden = entries.length <= state.limit;
  }
  function startCards() { state.deck = shuffle(filtered()); state.card = 0; cards(); }
  function cards() {
    const container = $('#card-content'); container.replaceChildren();
    if (!state.deck.length) return empty(container);
    const study = el('div', 'study');
    if (state.card >= state.deck.length) {
      study.append(el('h3', '', 'Коллекция пройдена!'), el('p', 'hint', 'Хорошая работа. Повторение помогает запоминать.'), button('Повторить карточки', 'primary', startCards));
      container.append(study); return;
    }
    const entry = state.deck[state.card];
    const meta = el('div', 'study-meta'); meta.append(el('span', '', entry.topic), el('span', '', `${state.card + 1} / ${state.deck.length}`));
    const flash = button('', 'flashcard', () => {
      const flipped = flash.classList.toggle('flipped');
      front.setAttribute('aria-hidden', String(flipped)); back.setAttribute('aria-hidden', String(!flipped));
      flash.setAttribute('aria-label', flipped ? `${entry.translation}. Показать слово` : `${entry.word}. Показать перевод`);
    });
    flash.setAttribute('aria-label', `${entry.word}. Показать перевод`);
    const inner = el('span', 'card-inner');
    const front = el('span', 'face'); const word = el('strong', '', entry.word); word.lang = 'en';
    front.append(el('small', '', 'ENGLISH'), word, el('small', '', 'Нажмите, чтобы увидеть перевод ↻'));
    const back = el('span', 'face back'); back.setAttribute('aria-hidden', 'true');
    back.append(el('small', '', 'ПЕРЕВОД'), el('strong', '', entry.translation));
    if (entry.expansion) back.append(el('span', 'example', entry.expansion));
    if (entry.example) back.append(el('span', 'example', entry.example));
    if (entry.exampleTranslation) back.append(el('span', 'example-translation', entry.exampleTranslation));
    inner.append(front, back); flash.append(inner);
    const actions = el('div', 'actions');
    actions.append(button('Не помню', 'secondary', () => { setKnown(entry, false); state.card++; cards(); }), button('Сложно', 'secondary', () => { setKnown(entry, true); state.card++; cards(); }), button('Легко', 'primary', () => { setKnown(entry, true, false); Learning.rate(entry, 'easy'); state.card++; cards(); }));
    study.append(meta, flash, actions, el('p', 'hint', 'Enter или пробел на карточке — перевернуть'));
    container.append(study);
  }
  function startQuiz() {
    const entries = filtered();
    // Один вопрос на английскую фразу: варианты с другим значением этой же фразы исключены.
    const uniqueWords = [...new Map(shuffle(entries).map(entry => [Learning.canonical(entry.word), entry])).values()];
    const translations = [...new Map(entries.map(item => [Learning.meaning(item.translation), item.translation])).values()];
    const meanings = new Map();
    for (const item of Vocabulary) {
      const key = Learning.canonical(item.word);
      if (!meanings.has(key)) meanings.set(key, new Set());
      for (const meaning of item.translation.split(' / ')) meanings.get(key).add(Learning.meaning(meaning));
    }
    const questions = [];
    // Формируем только 10 вопросов, чтобы не нагружать телефон всей коллекцией.
    for (const entry of uniqueWords) {
      const accepted = meanings.get(Learning.canonical(entry.word));
      const distractors = shuffle(translations.filter(value => !value.split(' / ').some(meaning => accepted.has(Learning.meaning(meaning))))).slice(0, 3);
      if (distractors.length === 3) questions.push({ entry, options: shuffle([entry.translation, ...distractors]) });
      if (questions.length === 10) break;
    }
    state.quiz = { questions, index: 0, answers: [] };
    quiz();
  }
  function quiz() {
    const container = $('#quiz-content'); container.replaceChildren();
    const session = state.quiz;
    if (!session.questions.length) return empty(container, 'Для теста нужно минимум 4 разных перевода. Расширьте поиск или выберите другую тему.');
    const study = el('div', 'study');
    const box = el('div', 'quiz-box');
    if (session.index >= session.questions.length) {
      const correct = session.answers.filter(answer => answer.correct).length;
      box.append(el('p', 'eyebrow', 'ТЕСТ ЗАВЕРШЁН'), el('div', 'score', `${correct} / ${session.questions.length}`), el('h3', '', correct === session.questions.length ? 'Отличная работа!' : 'С каждым разом увереннее'));
      for (const answer of session.answers.filter(answer => !answer.correct)) {
        const review = el('div', 'review', `${answer.entry.word} — ${answer.entry.translation}`);
        review.append(el('span', '', `Ваш ответ: ${answer.selected}`)); box.append(review);
      }
      box.append(button('Разобрать ошибки', 'secondary', () => LearningUI.open('errors')), button('Пройти ещё раз', 'primary', startQuiz)); study.append(box); container.append(study); return;
    }
    const question = session.questions[session.index];
    const meta = el('div', 'study-meta'); meta.append(el('span', '', 'Выберите перевод'), el('span', '', `${session.index + 1} / ${session.questions.length}`));
    const questionTitle = el('h3', '', question.entry.word); questionTitle.lang = 'en';
    const answers = el('div', 'answers');
    const feedback = el('p', 'feedback'); feedback.setAttribute('role', 'status');
    const next = button(session.index + 1 === session.questions.length ? 'Показать результат →' : 'Следующий вопрос →', 'primary', () => { session.index++; quiz(); });
    next.hidden = true;
    for (const option of question.options) {
      const answerButton = button(option, 'answer', () => {
        const correct = option === question.entry.translation;
        session.answers.push({ entry: question.entry, selected: option, correct });
        Learning.record(question.entry, correct, Date.now(), option);
        for (const control of answers.children) {
          control.disabled = true;
          if (control.textContent === question.entry.translation) control.classList.add('correct');
        }
        if (!correct) answerButton.classList.add('wrong');
        feedback.textContent = (correct ? 'Верно! ' : `Правильный ответ: ${question.entry.translation}. `) + Learning.explain(question.entry);
        next.hidden = false;
        Storage.write('lastQuiz', { ...Storage.read('lastQuiz', {}), correct: session.answers.filter(answer => answer.correct).length, answered: session.answers.length, total: session.questions.length });
        next.focus();
      });
      answers.append(answerButton);
    }
    // При возвращении из другого раздела уже данный ответ остаётся заблокированным.
    const previous = session.answers[session.index];
    if (previous) {
      for (const control of answers.children) {
        control.disabled = true;
        if (control.textContent === question.entry.translation) control.classList.add('correct');
        else if (control.textContent === previous.selected) control.classList.add('wrong');
      }
      feedback.textContent = previous.correct ? 'Верно! Так держать.' : `Правильный ответ: ${question.entry.translation}`;
      next.hidden = false;
    }
    box.append(el('p', 'eyebrow', 'КАК ПЕРЕВОДИТСЯ'), questionTitle, answers, feedback, next);
    study.append(meta, box); container.append(study);
  }
  function navigate(view) {
    if (view === 'learning' && state.view !== 'learning') learningOrigin = state.view;
    state.view = ['dictionary', 'rules', 'cards', 'quiz', 'learning', 'materials', 'achievements'].includes(view) ? view : 'dictionary';
    document.body.dataset.view = state.view;
    for (const id of ['dictionary', 'rules', 'cards', 'quiz', 'learning', 'materials', 'achievements']) $(`#${id}`).hidden = id !== state.view;
    for (const item of document.querySelectorAll('[data-view]')) {
      const active = item.dataset.view === state.view; item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
    const labels = { achievements: ['ВАША АКТИВНОСТЬ', 'Достижения и серия'], dictionary: ['ВАША КОЛЛЕКЦИЯ', 'Словарь'], rules: ['ОТ ПРАВИЛА К ПРАКТИКЕ', 'Правила и примеры'], cards: ['ВСПОМНИТЬ И ЗАПОМНИТЬ', 'Карточки'], quiz: ['ИСПОЛЬЗУЙТЕ АНГЛИЙСКИЙ', 'Практика'], learning: ['ВАШ ПЛАН ОБУЧЕНИЯ', 'Повторение и уроки'], materials: ['АНГЛИЙСКИЙ В КОНТЕКСТЕ', 'Диалоги и песни'] };
    $('#section-kicker').textContent = labels[state.view][0]; $('#section-title').textContent = labels[state.view][1];
    $('#study-filters').hidden = ['learning', 'materials', 'achievements'].includes(state.view);
    $('#source-summary').hidden = !state.source || ['learning', 'materials', 'achievements'].includes(state.view);
    $('#catalog-filters').hidden = state.view === 'rules';
    $('#learning-back').textContent = '← Назад: ' + (labels[learningOrigin]?.[1] || 'Словарь');
    $('#topic-filter').hidden = state.view === 'rules'; $('#status-filter').hidden = state.view === 'rules';
    $('#search-mode').hidden = state.view === 'rules';
    $('#search').placeholder = state.view === 'rules' ? 'Найти правило или пример…' : 'Найти слово или перевод…';
    $('#search').setAttribute('aria-label', state.view === 'rules' ? 'Поиск правила или примера' : 'Поиск слова или перевода');
    if (state.view === 'dictionary') dictionary();
    else if (state.view === 'rules') rules();
    else if (state.view === 'cards') { if (!state.deck.length) startCards(); else cards(); }
    else if (state.view === 'quiz') { if (!state.quiz) startQuiz(); else quiz(); }
    else if (state.view === 'materials') MediaLibrary.render();
    else if (state.view === 'achievements') Achievements.render();
  }
  function init() {
    Training.init(filtered);
    LearningUI.init(navigate);
    MediaLibrary.init();
    $('#learning-back').addEventListener('click', () => navigate(learningOrigin));
    $('#lesson-picker').addEventListener('change', () => {
      state.lesson = $('#lesson-picker').value;
      rules();
    });
    for (const source of SOURCES) { const option = el('option', '', source.name); option.value = source.name; $('#source-select').append(option); }
    $('#source-select').addEventListener('change', () => selectSource($('#source-select').value));
    updateTopics(); renderSources();
    const themes = ['light', 'dark', 'terminal'];
    const themeNames = { light: 'Светлая', dark: 'Тёмная', terminal: 'Моно / Терминал' };
    let theme = Storage.read('theme', null);
    if (!themes.includes(theme)) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    function applyTheme() {
      document.documentElement.dataset.theme = theme;
      const next = themes[(themes.indexOf(theme) + 1) % themes.length];
      const label = `Тема: ${themeNames[theme]}. Переключить на ${themeNames[next]}`;
      $('#theme').setAttribute('aria-label', label);
      $('#theme').title = label;
      $('#theme').textContent = theme === 'terminal' ? '>_' : '◐';
      $('#theme-select').value = theme;
    }
    applyTheme();
    $('#theme').addEventListener('click', () => {
      theme = themes[(themes.indexOf(theme) + 1) % themes.length];
      applyTheme(); Storage.write('theme', theme);
    });
    $('#theme-select').addEventListener('change', () => {
      theme = $('#theme-select').value;
      if (!themes.includes(theme)) theme = 'light';
      applyTheme(); Storage.write('theme', theme);
    });
    // Не меняем location: file:// внутри встроенного браузера может иметь opaque origin.
    // Переключение разделов выполняется только в DOM, без загрузки URL.
    function openView(view) {
      navigate(view);
      Storage.write('view', state.view);
      $('#main').scrollIntoView({ block: 'start' });
    }
    for (const item of document.querySelectorAll('[data-view]')) item.addEventListener('click', () => openView(item.dataset.view));
    $('#home').addEventListener('click', () => openView('dictionary'));
    $('#skip-content').addEventListener('click', () => { $('#main').focus(); $('#main').scrollIntoView({ block: 'start' }); });
    window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
    const mobile = window.matchMedia('(max-width: 700px)');
    function adaptFilters() { $('#study-filters').open = !mobile.matches; }
    adaptFilters();
    mobile.addEventListener?.('change', adaptFilters);
    function filterChanged() { Training.reset(); state.limit = 40; state.deck = []; state.quiz = null; navigate(state.view); }
    $('#search').addEventListener('input', filterChanged);
    $('#search-mode').addEventListener('change', filterChanged);
    $('#level').addEventListener('change', filterChanged); $('#track').addEventListener('change', filterChanged);
    $('#category').addEventListener('change', filterChanged); $('#status').addEventListener('change', filterChanged);
    $('#more').addEventListener('click', () => { state.limit += 40; dictionary(); });
    updateStats(); navigate('dictionary');
    if (!Storage.available) $('#notice').textContent = 'Хранилище браузера недоступно. Прогресс сохранится только до закрытия страницы.';
  }
  function reloadProgress() {
    if (progressOwner !== Storage.accountId) {
      progressOwner = Storage.accountId; state.quiz = null; state.deck = []; state.card = 0;
      Training.resetAccount(); LearningUI.resetAccount(); MediaLibrary.resetAccount();
      if (state.view === 'learning' || state.view === 'achievements') navigate('dictionary');
    }
    known.clear(); readLessons.clear();
    const words = Storage.read('known', []);
    const lessons = Storage.read('lessons', []);
    if (Array.isArray(words)) for (const id of words) if (validIds.has(id)) known.add(id);
    if (Array.isArray(lessons)) for (const id of lessons) if (Lessons.some(lesson => lesson.id === id)) readLessons.add(id);
    updateStats();
    if (state.view === 'dictionary') dictionary();
    if (state.view === 'rules') rules();
    LearningUI.dashboard();
    Training.refresh();
    if (state.view === 'quiz' && !state.quiz) { startQuiz(); }
  }
  return { init, reloadProgress, navigate };
})();
App.init();

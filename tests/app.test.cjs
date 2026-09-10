const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);

// Небольшой DOM-адаптер для сценариев интерфейса без браузерных зависимостей.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {}; this.value = ''; this.hidden = false; this.disabled = false; this.className = ''; this._text = ''; this.scrollTop = 0;
    this.classList = { add: name => this.className += ` ${name}`, toggle: (name, force) => { const set = new Set(this.className.split(' ').filter(Boolean)); const add = force === undefined ? !set.has(name) : force; if (add) set.add(name); else set.delete(name); this.className = [...set].join(' '); return add; } };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  get firstChild() { return this.children[0]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  fire(name) { if (name === 'click' && this.disabled) return; for (const fn of this.events[name] || []) fn({ target: this }); }
  focus() {}
  scrollIntoView() {}
}
function setup(saved = {}, mobile = false) {
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  nodes.status.value = 'all';
  const nav = ['dictionary', 'rules', 'cards', 'quiz'].map(view => { const item = new Element('button'); item.dataset.view = view; return item; });
  const document = { querySelector: selector => nodes[selector.slice(1)], getElementById: id => nodes[id], querySelectorAll: () => nav, createElement: tag => new Element(tag), body: new Element('body'), documentElement: new Element('html') };
  const events = {};
  const stored = { ...saved };
  const window = { matchMedia: query => ({ matches: mobile && query === '(max-width: 700px)' }), addEventListener: (event, fn) => events[event] = fn };
  const context = vm.createContext({ document, window, location: { hash: '' }, localStorage: { getItem: key => stored[key] ?? null, setItem: (key, value) => stored[key] = value }, console });
  for (const script of scripts) vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), context, { filename: script });
  const evaluate = code => vm.runInContext(code, context);
  const navigate = view => { context.location.hash = '#' + view; events.hashchange(); };
  return { nodes, stored, document, evaluate, navigate, nav, context };
}
test('exact search excludes sentences and examples, broad search is opt-in', () => {
  const app = setup();
  // Exercise the real corpus through UI: broad results must contain more entries.
  app.nodes.search.value = 'time'; app.nodes.search.fire('input');
  const exact = app.nodes['word-list'].textContent;
  app.nodes['search-mode'].value = 'all'; app.nodes['search-mode'].fire('change');
  assert.notEqual(app.nodes['word-list'].textContent, exact);
  app.nodes['search-mode'].value = 'exact'; app.nodes.search.fire('input');
  assert.equal(app.nodes['word-list'].textContent, exact);
});

test('mistake list permits selecting a scheduled error and explains before practice', () => {
  const app = setup();
  app.evaluate(`Learning.record({id:'chosen',word:'I can swim',translation:'Я умею плавать'}, false, Date.now(), 'I can swimming');
    Learning.record({id:'another',word:'hello',translation:'привет'}, false);
    const data = Learning.state(); data.errors.chosen.due = Date.now() + 86400000; Learning.save(data);
    LearningUI.open('errors');`);
  const tiles = byClass(app.nodes['learning-content'], 'mistake-tile');
  assert.equal(tiles.length, 2);
  tiles.find(tile => tile.textContent.includes('I can swim')).fire('click');
  assert(app.nodes['learning-content'].textContent.includes('I can swimming'));
  assert(app.nodes['learning-content'].textContent.includes('начальная форма'));
  assert.equal(byClass(app.nodes['learning-content'], 'gap-input').length, 0);
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  assert.equal(byClass(app.nodes['learning-content'], 'gap-input').length, 1);
  assert(app.nodes['learning-content'].textContent.includes('Я умею плавать'));
});

function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
test('error session summary distinguishes remaining, deferred and cleared mistakes', () => {
  for (const scenario of ['wrong', 'deferred', 'cleared']) {
    const app = setup();
    app.evaluate(`Learning.record({id:'summary-error',word:'hello',translation:'привет'}, false, Date.now() - ${scenario === 'cleared' ? 172800000 : 0}); LearningUI.open('errors');`);
    byClass(app.nodes['learning-content'], 'mistake-tile')[0].fire('click');
    byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
    byClass(app.nodes['learning-content'], 'gap-input')[0].value = scenario === 'wrong' ? 'bye' : 'hello';
    byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
    byClass(app.nodes['learning-content'], 'primary').at(-1).fire('click');
    const text = app.nodes['learning-content'].textContent;
    assert(!text.includes('Ошибки разобраны'));
    if (scenario === 'cleared') assert(text.includes('Ошибок в журнале не осталось'));
    else {
      assert(text.includes('В журнале ошибок: 1'));
      assert(text.includes(scenario === 'wrong' ? 'сейчас: 1' : 'на позже: 1'));
      byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
      assert.equal(byClass(app.nodes['learning-content'], 'mistake-tile').length, 1);
    }
  }
});
test('achievement counters deduplicate same-day answers and exclude self assessment', () => {
  const app = setup();
  app.evaluate(`const atime = new Date(2026,8,10,12).getTime();
    Learning.record({id:'reply:test:0',word:'Hello',translation:'Привет'},true,atime,'Hello',{independent:true});
    Learning.record({id:'reply:test:0',word:'Hello',translation:'Привет'},true,atime,'Hello',{independent:true});
    Learning.record({id:'reply:test:1',word:'Hi',translation:'Привет'},true,atime);
  `);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state(),atime).answers'),1);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state(),atime).independent'),1);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state(),atime).replies'),1);
  assert(app.evaluate('Learning.state().achievements.earned.first'));
  assert.equal(setup(app.stored).evaluate('Achievements.metrics(Learning.state()).answers'),1);
});

test('streak spans local calendar dates, expires, and earned badges remain', () => {
  const app = setup();
  app.evaluate(`const stime = new Date(2026,8,10,12).getTime();
    for(let i=0;i<3;i++) Learning.record({id:'streak',word:'Hi',translation:'Привет'},true,stime+i*86400000,'Hi');`);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state(),stime+2*86400000).streak'),3);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state(),stime+3*86400000).streak'),3);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state(),stime+4*86400000).streak'),0);
  assert(app.evaluate('Learning.state().achievements.earned.streak3'));
  app.evaluate("Storage.setAccount('different');");
  assert.equal(app.evaluate('Achievements.metrics(Learning.state()).answers'),0);
  assert.equal(app.evaluate('Object.keys(Learning.state().achievements.earned).length'),0);
});

test('progress screen renders real empty charts, badges, and interactive days', () => {
  const app = setup();app.evaluate('Achievements.open()');
  assert.equal(byClass(app.nodes['learning-content'],'activity-day').length,28);
  assert.equal(byClass(app.nodes['learning-content'],'week-column').length,7);
  assert.equal(byClass(app.nodes['learning-content'],'badge-card').length,12);
  assert(app.nodes['learning-content'].textContent.includes('0/12'));
  byClass(app.nodes['learning-content'],'activity-day')[0].fire('click');
  assert(app.nodes['learning-content'].textContent.includes('0 заданий, 0 верных'));
  descendants(app.nodes['learning-content']).find(n=>n.tagName==='button' && n.textContent==='Открытые').fire('click');
  assert.equal(byClass(app.nodes['learning-content'],'badge-card').length,0);
  app.evaluate("Storage.write('known',Array.from({length:10},(_,i)=>'word'+i)); Achievements.open();");
  assert.equal(byClass(app.nodes['learning-content'],'is-earned').length,1);
  app.evaluate("Storage.write('known',[]); Achievements.open();");
  assert.equal(byClass(app.nodes['learning-content'],'is-earned').length,1);
});
test('daily plan finishes all stages, stays completed, and is isolated by account', () => {
  const app = setup(); app.evaluate('Coach.daily()');
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  const count = app.evaluate('Learning.state().daily.tasks.length');
  for (let i = 0; i < count; i++) {
    if (!byClass(app.nodes['learning-content'], 'gap-input').length) byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
    byClass(app.nodes['learning-content'], 'gap-input')[0].value = app.evaluate(`Learning.state().daily.tasks[${i}].answer`);
    byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
    byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  }
  assert.equal(app.evaluate('Learning.state().daily.index'), count);
  assert.equal(app.evaluate('Achievements.metrics(Learning.state()).plans'), 1);
  app.evaluate('const completed = Learning.state(); Achievements.completePlan(completed); Learning.save(completed);');
  assert.equal(app.evaluate('Achievements.metrics(Learning.state()).plans'), 1);
  assert(app.evaluate('Learning.state().achievements.earned.plan1'));
  app.evaluate('Coach.daily()'); assert(app.nodes['learning-content'].textContent.includes('на сегодня завершено'));
  app.evaluate("Storage.setAccount('other');");
  assert.equal(app.evaluate('Learning.state().daily'), null);
  assert.equal(app.evaluate('Object.keys(Learning.state().mastery).length'), 0);
  app.evaluate("Storage.setAccount(null); const d = Learning.state(); d.daily.date = '2000-01-01'; Learning.save(d); Coach.daily();");
  assert.equal(app.evaluate('Learning.state().daily.index'), 0);
});
test('mastery requires unassisted success across dates and items and resets on failure', () => {
  const app = setup();
  app.evaluate(`const mtime = new Date(2026, 8, 10, 12).getTime();
    for (let i=0;i<3;i++) Learning.record({id:'m'+i,word:'hello',translation:'привет',studyTopic:'Test topic'},true,mtime,'hello',{independent:true});`);
  assert.equal(app.evaluate('Learning.state().mastery["Test topic"].days.length'), 1);
  assert.notEqual(app.evaluate('Coach.status(Learning.state().mastery["Test topic"])'), 'Освоено');
  app.evaluate(`Learning.record({id:'m0',word:'hello',translation:'привет',studyTopic:'Test topic'},true,mtime+86400000,'hello');`);
  assert.equal(app.evaluate('Learning.state().mastery["Test topic"].days.length'), 1);
  app.evaluate(`for (let day=1;day<=2;day++) Learning.record({id:'m0',word:'hello',translation:'привет',studyTopic:'Test topic'},true,mtime+day*86400000,'hello',{independent:true});`);
  assert.equal(app.evaluate('Coach.status(Learning.state().mastery["Test topic"])'), 'Освоено');
  app.evaluate(`Learning.record({id:'m0',word:'hello',translation:'привет',studyTopic:'Test topic'},false,mtime+3*86400000,'bye');`);
  assert.equal(app.evaluate('Coach.status(Learning.state().mastery["Test topic"])'), 'Нужно повторить');
  assert.equal(setup(app.stored).evaluate('Learning.state().mastery["Test topic"].days.length'), 0);
});

test('daily plan resumes drafts and checked answers without recording twice', () => {
  let app = setup();
  app.evaluate('Coach.daily()');
  assert(app.evaluate('Learning.state().daily.tasks.some(t=>t.stage === "Правило")'));
  assert(app.evaluate('Learning.state().daily.tasks.some(t=>t.context)'));
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click'); // hide new word
  let input = byClass(app.nodes['learning-content'], 'gap-input')[0];
  input.value = 'draft'; input.fire('input');
  app = setup(app.stored); app.evaluate('Coach.daily()');
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  input = byClass(app.nodes['learning-content'], 'gap-input')[0]; assert.equal(input.value, 'draft');
  input.value = app.evaluate('Learning.state().daily.tasks[0].answer');
  const check = byClass(app.nodes['learning-content'], 'primary')[0]; check.fire('click'); check.fire('click');
  const attempts = app.evaluate('Object.values(Learning.state().mastery).reduce((n,m)=>n+m.attempts,0)');
  assert.equal(attempts, 1);
  assert.equal(app.evaluate('Object.values(Learning.state().mastery).reduce((n,m)=>n+m.days.length,0)'), 0);
  app = setup(app.stored); app.evaluate('Coach.daily()'); byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  assert(byClass(app.nodes['learning-content'], 'gap-input')[0].disabled);
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  assert.equal(app.evaluate('Learning.state().daily.index'), 1);
  assert.equal(app.evaluate('Object.values(Learning.state().mastery).reduce((n,m)=>n+m.attempts,0)'), attempts);
});

test('dialogue replies expose context, accept a curated alternative, and return to material', () => {
  const app = setup(); app.navigate('materials');
  byClass(app.nodes['media-content'], 'media-tile')[1].fire('click');
  descendants(app.nodes['media-content']).find(n=>n.tagName === 'button' && n.textContent.includes('Ответить за собеседника')).fire('click');
  assert(app.nodes['learning-content'].textContent.includes('A: How are you?'));
  const input = byClass(app.nodes['learning-content'], 'gap-input')[0];
  input.value = "I'm well, thank you. How about you?";
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  assert(app.nodes['learning-content'].textContent.includes('Верно, самостоятельно'));
  assert.equal(app.evaluate('Object.values(Learning.state().mastery)[0].days.length'), 1);
  byClass(app.nodes['learning-content'], 'secondary')[0].fire('click');
  assert.equal(app.nodes.materials.hidden, false);
  assert(app.nodes['media-content'].textContent.includes('Как дела'));
});

test('error reinforcement uses two different questions on the same grammar rule', () => {
  const app = setup();
  app.evaluate(`Learning.record(Courses[0].questions[0], false, Date.now(), 'is'); LearningUI.open('errors');`);
  byClass(app.nodes['learning-content'], 'mistake-tile')[0].fire('click');
  assert(app.nodes['learning-content'].textContent.includes('В ответе: is'));
  assert(app.nodes['learning-content'].textContent.includes('В образце: am'));
  const tasks = app.evaluate('Coach.related(Courses[0].questions[0])');
  assert.equal(tasks.length, 2); assert.notEqual(tasks[0].entry.id, tasks[1].entry.id);
  assert(tasks.every(t=>t.entry.id !== 'course:be:0'));
});
function byClass(node, name) { return descendants(node).filter(item => item.className.split(' ').includes(name)); }

test('all script and stylesheet references exist; all nine source texts survive unchanged', () => {
  for (const script of scripts) assert(fs.existsSync(path.join(root, script)));
  const app = setup();
  const sources = app.evaluate('SOURCES');
  assert.equal(sources.length, 12);
  for (const source of sources) assert.equal(fs.readFileSync(path.join(root, 'materials', source.filename), 'utf8'), source.text);
  for (const file of ['style.css', 'css/study.css', 'css/responsive.css']) assert(fs.readFileSync(path.join(root, file), 'utf8').includes('{'));
});

test('parser supports examples, slang, multiline translations and excludes mistakes', () => {
  const { evaluate } = setup();
  const parse = evaluate('parseText');
  assert.equal(parse('well-known - известный - A well-known writer.')[0].example, 'A well-known writer.');
  const slang = parse('btw — by the way — кстати')[0];
  assert.equal(slang.translation, 'кстати'); assert.equal(slang.expansion, 'by the way'); assert.equal(slang.example, '');
  assert.equal(parse('I had finished before he came.\n— Я закончил до того, как он пришёл.').length, 1);
  assert.equal(parse('Does he likes? — неправильно').length, 0);
  const data = evaluate('Vocabulary');
  assert.equal(new Set(data.map(item => item.id)).size, data.length);
  assert(data.every(item => item.memberships.length > 0));
});

test('lesson parser retains 100 sections and does not turn numbered exercises into lessons', () => {
  const { evaluate } = setup();
  assert.equal(evaluate('Lessons.filter(lesson => !lesson.added).length'), 100);
  assert.equal(evaluate('Lessons.filter(lesson => lesson.added).length'), 12);
  const simple = evaluate("Lessons.find(lesson => lesson.id === 'english_practice-1')");
  assert(simple.lines.includes('Ответы:'));
  assert(simple.lines.includes('1. I play every day.'));
  assert(simple.lines.includes('Does he likes? — неправильно'));
});

test('source selection, topics, search and learned filter work together', () => {
  const app = setup(); const { nodes } = app;
  assert.equal(nodes['word-list'].children.length, 40);
  nodes['source-select'].value = 'Фразовые глаголы'; nodes['source-select'].fire('change');
  assert(nodes['source-summary'].textContent.includes('Фразовые глаголы'));
  nodes.search.value = 'get up'; nodes.search.fire('input');
  assert.equal(nodes['word-list'].children.length, 1);
  byClass(nodes['word-list'], 'learn-button')[0].fire('click');
  assert.equal(JSON.parse(app.stored['speakly.known']).length, 1);
  nodes.status.value = 'new'; nodes.status.fire('change');
  assert(nodes['word-list'].textContent.includes('Ничего не найдено'));
  nodes.search.value = ''; nodes['source-select'].value = 'По темам'; nodes['source-select'].fire('change');
  assert(nodes.category.children.some(option => option.value === 'ПОГОДА И ПРИРОДА'));
});

test('rules show hidden answers and persist read state', () => {
  const app = setup(); const { nodes } = app;
  nodes['source-select'].value = 'Практика'; nodes['source-select'].fire('change'); app.navigate('rules');
  assert.equal(nodes.rules.hidden, false); assert.equal(nodes.dictionary.hidden, true);
  assert.equal(nodes['status-filter'].hidden, true);
  const answers = byClass(nodes['lesson-reader'], 'lesson-answers'); assert.equal(answers.length, 1); assert.notEqual(answers[0].open, true);
  byClass(nodes['lesson-reader'], 'primary')[0].fire('click');
  assert(JSON.parse(app.stored['speakly.lessons']).includes('english_practice-1'));
  nodes.search.value = 'I had finished before he came'; nodes.search.fire('input');
  assert(nodes['lesson-reader'].textContent.includes('PAST PERFECT'));
  const restored = setup(app.stored); restored.navigate('rules');
  assert.equal(restored.evaluate("Storage.read('lessons', []).length"), 1);
});

test('flashcards flip, advance and preserve previous learned word IDs', () => {
  const app = setup(); app.navigate('cards');
  const flash = byClass(app.nodes['card-content'], 'flashcard')[0];
  flash.fire('click'); assert(flash.className.includes('flipped'));
  byClass(app.nodes['card-content'], 'primary')[0].fire('click');
  assert.equal(JSON.parse(app.stored['speakly.known']).length, 1);
  assert(byClass(app.nodes['card-content'], 'study-meta')[0].textContent.includes('2 /'));
  const restored = setup(app.stored); assert.equal(restored.nodes.known.textContent, '1');
});

test('quiz has four unique choices; leaving and returning cannot answer twice', () => {
  const app = setup(); app.navigate('quiz');
  let choices = byClass(app.nodes['quiz-content'], 'answer'); assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map(choice => choice.textContent)).size, 4);
  choices[0].fire('click'); app.navigate('rules'); app.navigate('quiz');
  choices = byClass(app.nodes['quiz-content'], 'answer'); assert(choices.every(choice => choice.disabled));
  choices[1].fire('click'); assert.equal(JSON.parse(app.stored['speakly.lastQuiz']).answered, 1);
  byClass(app.nodes['quiz-content'], 'primary')[0].fire('click');
  assert(byClass(app.nodes['quiz-content'], 'answer').every(choice => !choice.disabled));
});

test('empty state, theme persistence and corrupt storage recover without crashing', () => {
  const app = setup({ 'speakly.known': '{broken', 'speakly.lessons': 'null' });
  app.nodes.theme.fire('click'); assert.equal(app.document.documentElement.dataset.theme, 'dark');
  assert.equal(JSON.parse(app.stored['speakly.theme']), 'dark');
  app.nodes.search.value = 'nothing-matches-12345'; app.nodes.search.fire('input'); app.navigate('quiz');
  assert(app.nodes['quiz-content'].textContent.includes('минимум 4'));
});

test('a complete quiz reaches its result and restarts cleanly', () => {
  const app = setup(); app.navigate('quiz');
  for (let index = 0; index < 10; index++) {
    byClass(app.nodes['quiz-content'], 'answer')[0].fire('click');
    byClass(app.nodes['quiz-content'], 'primary')[0].fire('click');
  }
  assert(app.nodes['quiz-content'].textContent.includes('ТЕСТ ЗАВЕРШЁН'));
  assert.equal(JSON.parse(app.stored['speakly.lastQuiz']).answered, 10);
  byClass(app.nodes['quiz-content'], 'primary')[0].fire('click');
  assert.equal(byClass(app.nodes['quiz-content'], 'answer').length, 4);
  assert(byClass(app.nodes['quiz-content'], 'answer').every(choice => !choice.disabled));
});


test('tabs and home work when the file URL rejects navigation', () => {
  const app = setup();
  Object.defineProperty(app.context.location, 'hash', {
    get() { return ''; },
    set() { throw new Error('Unsafe attempt to load file URL'); },
  });
  for (const [index, view] of ['dictionary', 'rules', 'cards', 'quiz'].entries()) {
    app.nav[index].fire('click');
    assert.equal(app.nodes[view].hidden, false);
    assert.equal(JSON.parse(app.stored['speakly.view']), view);
  }
  app.nodes.home.fire('click');
  assert.equal(app.nodes.dictionary.hidden, false);
  assert(!html.includes('href="#'));
});

test('phone filters start collapsed, desktop filters start expanded', () => {
  assert.equal(setup({}, true).nodes['study-filters'].open, false);
  assert.equal(setup().nodes['study-filters'].open, true);
});

test('all styles load directly without nested imports or cascade layers', () => {
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(styles, ['style.css', 'css/study.css', 'css/responsive.css', 'css/terminal.css', 'css/achievements.css']);
  for (const file of styles) {
    const css = fs.readFileSync(path.join(root, file), 'utf8');
    assert(!css.includes('@import'));
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
  }
});

test('mobile lesson picker opens the selected lesson', () => {
  const app = setup({}, true); app.navigate('rules');
  const picker = app.nodes['lesson-picker'];
  assert.equal(picker.children.length, 112);
  picker.value = 'english_practice-3'; picker.fire('change');
  assert(app.nodes['lesson-reader'].textContent.includes('PAST SIMPLE'));
  assert.equal(picker.value, 'english_practice-3');
});

test('every reload opens dictionary even after quiz or a legacy hash', () => {
  const app = setup({ 'speakly.view': '"quiz"' });
  assert.equal(app.nodes.dictionary.hidden, false);
  assert.equal(app.nodes.quiz.hidden, true);
  app.context.location.hash = '#quiz';
  app.evaluate('App.init()');
  assert.equal(app.nodes.dictionary.hidden, false);
});

test('progress storage is isolated between guest and different accounts', () => {
  const app = setup();
  app.evaluate("Storage.write('known', ['guest']); Storage.setAccount('a'); Storage.write('known', ['alice']); Storage.setAccount('b');");
  assert.equal(app.evaluate("Storage.read('known', []).length"), 0);
  app.evaluate("Storage.write('known', ['bob']); Storage.setAccount('a');");
  assert.equal(app.evaluate("Storage.read('known', [])[0]"), 'alice');
  app.evaluate('Storage.setAccount(null)');
  assert.equal(app.evaluate("Storage.read('known', [])[0]"), 'guest');
});

test('terminal theme can be selected, restored and cycled', () => {
  const app = setup();
  app.nodes['theme-select'].value = 'terminal'; app.nodes['theme-select'].fire('change');
  assert.equal(app.document.documentElement.dataset.theme, 'terminal');
  assert.equal(JSON.parse(app.stored['speakly.theme']), 'terminal');
  const restored = setup(app.stored);
  assert.equal(restored.document.documentElement.dataset.theme, 'terminal');
  restored.nodes.theme.fire('click');
  assert.equal(restored.document.documentElement.dataset.theme, 'light');
});

test('new source has 3000 sentences and five level filters without metadata entries', () => {
  const app = setup();
  assert.equal(app.evaluate("parseText(SOURCES.find(s => s.id === 'english_sentences_3000').text, 'Предложения A1–C1').length"), 3000);
  assert.equal(app.evaluate("new Set(Vocabulary.filter(e => e.sources.includes('Предложения A1–C1')).flatMap(e => e.memberships.filter(m => m.source === 'Предложения A1–C1').map(m => m.topic))).size"), 5);
});

test('gap exercise validates input, records once and moves to next question', () => {
  const app = setup(); app.navigate('quiz');
  app.nodes['mode-gap'].fire('click');
  assert.equal(app.nodes['quiz-content'].hidden, true);
  const input = byClass(app.nodes['training-content'], 'gap-input')[0];
  input.value = 'zzzzzzzz';
  const check = byClass(app.nodes['training-content'], 'primary')[0];
  check.fire('click'); check.fire('click');
  assert.equal(JSON.parse(app.stored['speakly.lastQuiz']).practiceStats.attempts, 1);
  assert(byClass(app.nodes['training-content'], 'training-solution').length);
  byClass(app.nodes['training-content'], 'primary')[0].fire('click');
  assert(byClass(app.nodes['training-content'], 'gap-input').length);
  app.nodes['mode-test'].fire('click');
  assert.equal(app.nodes['quiz-content'].hidden, false);
});

test('sentence assembly uses tokens once and permits undo', () => {
  const app = setup(); app.navigate('quiz'); app.nodes['mode-order'].fire('click');
  byClass(app.nodes['training-content'], 'word-bank')[0].children[0].fire('click');
  assert.equal(byClass(app.nodes['training-content'], 'sentence-answer')[0].children[0].tagName, 'button');
  assert.equal(byClass(app.nodes['training-content'], 'word-bank')[0].children.filter(child => child.disabled).length, 1);
  byClass(app.nodes['training-content'], 'sentence-answer')[0].children[0].fire('click');
  assert.equal(byClass(app.nodes['training-content'], 'word-bank')[0].children.filter(child => child.disabled).length, 0);
  app.nodes.search.value = 'no-such-sentence-123'; app.nodes.search.fire('input');
  assert(app.nodes['training-content'].textContent.includes('нет подходящих предложений'));
});

test('spaced repetition has deterministic intervals and imports old known words as due', () => {
  const app = setup();
  const schedule = app.evaluate('Learning.schedule');
  assert.equal(schedule(null, 'again', 0).due, 600000);
  assert.equal(schedule(null, 'hard', 0).due, 86400000);
  assert.equal(schedule(null, 'easy', 0).due, 3 * 86400000);
  assert.equal(schedule({interval: 4}, 'easy', 0).interval, 10);
  app.evaluate("Storage.write('known', [Vocabulary[0].id])");
  assert.equal(app.evaluate('Learning.due().length'), 1);
});

test('mistake is rehearsed now and verified again tomorrow', () => {
  const app = setup();
  app.evaluate('Learning.record(Vocabulary[0], false, 1000)');
  assert.equal(app.evaluate('Learning.errors(1000).length'), 1);
  app.evaluate('Learning.record(Vocabulary[0], true, 2000)');
  assert.equal(app.evaluate('Learning.errors(2000).length'), 0);
  assert.equal(app.evaluate('Learning.errors(86401000).length'), 1);
  app.evaluate('Learning.record(Vocabulary[0], true, 86401000)');
  assert.equal(app.evaluate('Object.keys(Learning.state().errors).length'), 0);
});

test('answer checking accepts safe variants but rejects meaning-changing changes', () => {
  const accept = setup().evaluate('Learning.accepts');
  assert(accept("I'm ready!", 'I am ready.'));
  assert(accept('Yesterday, I worked.', 'I worked yesterday.'));
  assert(!accept('I am not ready', 'I am ready'));
  assert(!accept('He likes me', 'I like him'));
});

test('curated course runs from rule to five checked tasks and persists score', () => {
  const app = setup(); app.nodes['open-courses'].fire('click');
  byClass(app.nodes['learning-content'], 'course-tile')[0].fire('click');
  assert(app.nodes['learning-content'].textContent.includes('В настоящем времени'));
  byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
  for (const answer of ['am', 'is', 'are', 'Are', 'is']) {
    byClass(app.nodes['learning-content'], 'gap-input')[0].value = answer;
    byClass(app.nodes['learning-content'], 'primary')[0].fire('click');
    const controls = byClass(app.nodes['learning-content'], 'primary');
    controls[controls.length - 1].fire('click');
  }
  assert.equal(app.evaluate('Learning.state().courses.be.score'), 5);
  assert(app.nodes['learning-content'].textContent.includes('Урок пройден'));
  assert.equal(setup(app.stored).evaluate('Learning.state().courses.be.score'), 5);
});

test('quality removes repetitive templates and flags unnatural translations without deleting IDs', () => {
  const app = setup();
  assert(app.evaluate('Quality.corrections.length') > 0);
  assert(app.evaluate('Quality.excluded.length') > 0);
  assert(app.evaluate('Learning.cleanEntries(Vocabulary).length < Vocabulary.length'));
  assert(app.evaluate('Learning.cleanEntries(Vocabulary).every(e => !e.qualityIssue)'));
});

test('errors open a standalone screen and return to the originating section', () => {
  const app = setup();
  byClass(app.nodes['learning-dashboard'], 'secondary')[0].fire('click');
  assert.equal(app.nodes.learning.hidden, false);
  assert.equal(app.nodes.quiz.hidden, true);
  app.nodes['learning-back'].fire('click');
  assert.equal(app.nodes.dictionary.hidden, false);
  app.navigate('quiz'); app.nodes['open-courses'].fire('click');
  app.nodes['learning-back'].fire('click');
  assert.equal(app.nodes.quiz.hidden, false);
});

test('dialogues preserve levels and bilingual turns, and filter by level', () => {
  const app = setup();
  assert.equal(app.evaluate('MediaLibrary.dialogues.length'), 150);
  assert(app.evaluate('MediaLibrary.dialogues.every(d => d.turns.every(t => t.word && t.translation))'));
  app.navigate('materials'); app.nodes['media-level'].value = 'A1'; app.nodes['media-level'].fire('change');
  assert.equal(byClass(app.nodes['media-content'], 'media-tile').length, 30);
  byClass(app.nodes['media-content'], 'media-tile')[0].fire('click');
  assert.equal(byClass(app.nodes['media-content'], 'dialogue-turn').length, 4);
  byClass(app.nodes['media-content'], 'primary')[0].fire('click');
  assert.equal(byClass(app.nodes['media-content'], 'answer').length, 4);
  byClass(app.nodes['media-content'], 'answer')[0].fire('click');
  assert.equal(JSON.parse(app.stored['speakly.lastQuiz']).mediaResult.answered, 1);
});

test('songs distinguish source excerpts and have vocabulary practice without invented lyrics', () => {
  const app = setup(); app.navigate('materials'); app.nodes['media-songs'].fire('click');
  assert.equal(byClass(app.nodes['media-content'], 'media-tile').length, 9);
  assert.equal(app.evaluate('MediaLibrary.songs.filter(s => s.excerpt).length'), 8);
  byClass(app.nodes['media-content'], 'media-tile')[0].fire('click');
  assert.equal(byClass(app.nodes['media-content'], 'song-word').length, 7);
  assert(app.nodes['media-content'].textContent.includes('новые учебные примеры'));
});

test('level and direction filters compose on vocabulary without inventing A3', () => {
  const app = setup(); app.nodes.level.value = 'A1'; app.nodes.level.fire('change');
  assert(app.nodes['word-list'].children.length > 0);
  app.nodes.track.value = 'Английский по песням'; app.nodes.track.fire('change');
  assert(app.nodes['word-list'].textContent.includes('Ничего не найдено'));
  assert(!html.includes('<option>A3</option>'));
});

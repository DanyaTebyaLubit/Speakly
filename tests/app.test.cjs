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
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function byClass(node, name) { return descendants(node).filter(item => item.className.split(' ').includes(name)); }

test('all script and stylesheet references exist; all nine source texts survive unchanged', () => {
  for (const script of scripts) assert(fs.existsSync(path.join(root, script)));
  const app = setup();
  const sources = app.evaluate('SOURCES');
  assert.equal(sources.length, 9);
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
  assert.equal(evaluate('Lessons.filter(lesson => lesson.added).length'), 7);
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
  assert.deepEqual(styles, ['style.css', 'css/study.css', 'css/responsive.css', 'css/terminal.css']);
  for (const file of styles) {
    const css = fs.readFileSync(path.join(root, file), 'utf8');
    assert(!css.includes('@import'));
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
  }
});

test('mobile lesson picker opens the selected lesson', () => {
  const app = setup({}, true); app.navigate('rules');
  const picker = app.nodes['lesson-picker'];
  assert.equal(picker.children.length, 107);
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

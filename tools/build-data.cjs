// После редактирования materials/*.txt: node tools/build-data.cjs
// Генерация JS вместо fetch сохраняет возможность запуска через file://.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sources = [
  ['ENG', 'Основы'], ['english_conversation_words', 'В разговоре'],
  ['english_people_description', 'О людях'], ['english_phrasal_verbs', 'Фразовые глаголы'],
  ['english_practice', 'Практика'], ['english_reactions', 'Реакции'],
  ['english_sentences_and_grammar', 'Конструкции'], ['english_slang', 'Сленг'],
  ['english_vocabulary_all_topics', 'По темам'],
  ['english_sentences_3000', 'Предложения A1–C1'],
  ['english_dialogues', 'Диалоги'], ['english_songs', 'Песни'],
];
for (const [index, [id, name]] of sources.entries()) {
  const text = fs.readFileSync(path.join(root, 'materials', `${id}.txt`), 'utf8').replace(/^\uFEFF/, '');
  const prefix = '// Учебный материал. Сгенерировано из materials/*.txt.\n' + (index === 0 ? 'window.SPEAKLY_SOURCES = [];\n' : '');
  fs.writeFileSync(path.join(root, 'data', `${id}.js`), prefix + 'window.SPEAKLY_SOURCES.push(' + JSON.stringify({ name, text, id, filename: `${id}.txt` }, null, 2) + ');\n');
}
console.log('Обновлено файлов: ' + sources.length);

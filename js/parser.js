/* Чистые функции разбора: не обращаются к DOM и localStorage. */
const SOURCES = window.SPEAKLY_SOURCES;

function normalizeLines(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  return lines.reduce((result, raw) => {
    const line = raw.trim();
    const previous = result[result.length - 1] || '';
    // В исходнике некоторые переводы перенесены на следующую строку.
    if (/^[—–]\s+[А-Яа-яЁё]/.test(line) && /[a-z]/i.test(previous)
      && !/[а-яё]/i.test(previous) && !/[:—–]$/.test(previous)
      && !/^\d+[.)]\s/.test(previous) && !/\s[-—–]\s/.test(previous)) {
      result[result.length - 1] += ` ${line}`;
    } else result.push(line);
    return result;
  }, []);
}

function isHeading(lines, index, source) {
  return /^\d+[.)]\s+/.test(lines[index]) && (
    /^[=\-_]{3,}$/.test(lines[index + 1] || '')
    || (!['Практика', 'Конструкции'].includes(source) && !/\s[-–—]\s/.test(lines[index]))
  );
}

/** Принимает «слово - перевод - пример», а также длинное тире и сленг. */
function parseText(text, source = 'Мои слова') {
  let topic = source;
  const result = [];
  const lines = normalizeLines(text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /^[=\-–—_\s]+$/.test(line)) continue;
    if (isHeading(lines, i, source)) {
      topic = line.replace(/^\d+[.)]\s+/, '');
      continue;
    }
    if (/^[=\-]{3,}$/.test(lines[i + 1] || '')) continue;
    const parts = line.split(/\s+[-–—]\s+/).map(part => part.trim());
    if (parts.length < 2) continue;
    let [word, translation, ...examples] = parts;
    let expansion = '';
    word = word.replace(/^\d+[.)]\s+/, '');
    if (!/[a-z]/i.test(word) || /[а-яё]/i.test(word) || !translation) continue;
    if (!/[а-яё]/i.test(translation) && examples.length && /[а-яё]/i.test(examples[0])) {
      expansion = translation;
      translation = examples.shift();
    }
    if (!/[а-яё]/i.test(translation) || /^(неправильно|правильно)$/i.test(translation)) continue;
    // Сохраняем прежние идентификаторы, чтобы не потерять выученные слова.
    const id = JSON.stringify([word.toLocaleLowerCase('en'), translation.toLocaleLowerCase('ru')]);
    result.push({ id, word, translation, expansion, example: examples.join(' — '), topic, source });
  }
  return result;
}

/** Выделяет только нумерованные разделы с подчёркнутым заголовком, не номера заданий. */
function parseLessons(text, source) {
  const lines = normalizeLines(text);
  const lessons = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^\d+[.)]\s+/.test(lines[i]) && /^[=\-_]{3,}$/.test(lines[i + 1] || '')) {
      current = { id: `${source.id}-${lines[i].match(/^\d+/)[0]}`, title: lines[i].replace(/^\d+[.)]\s+/, ''), source: source.name, sourceId: source.id, lines: [] };
      lessons.push(current);
      i++;
    } else if (current && !/^[=\-_]{3,}$/.test(lines[i]) && !/^КОНЕЦ/.test(lines[i])) {
      current.lines.push(lines[i]);
    }
  }
  return lessons;
}

const Vocabulary = (() => {
  const unique = new Map();
  for (const source of SOURCES) {
    for (const entry of parseText(source.text, source.name)) {
      const membership = { source: entry.source, topic: entry.topic };
      if (unique.has(entry.id)) {
        const existing = unique.get(entry.id);
        if (!existing.sources.includes(entry.source)) existing.sources.push(entry.source);
        if (!existing.memberships.some(item => item.source === membership.source && item.topic === membership.topic)) existing.memberships.push(membership);
        if (!existing.example) existing.example = entry.example;
        if (!existing.expansion) existing.expansion = entry.expansion;
      } else unique.set(entry.id, { ...entry, sources: [entry.source], memberships: [membership] });
    }
  }
  return [...unique.values()];
})();

const Lessons = SOURCES.filter(source => ['Практика', 'Конструкции'].includes(source.name))
  .flatMap(source => parseLessons(source.text, source));

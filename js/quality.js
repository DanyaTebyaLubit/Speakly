/* Точечные правки рабочего отображения. Исходные TXT и идентификаторы неизменны. */
const Quality = (() => {
  const corrections = [], excluded = [];
  const exact = new Map([
    ['Я хотел бы подробнее поставить под сомнение этот проект.', 'Я хотел бы подробнее обсудить сомнения по поводу этого проекта.'],
  ]);
  for (const entry of Vocabulary) {
    const original = entry.translation;
    entry.translation = exact.get(original) || original;
    const precise = { 'Do you like school?':'Тебе нравится школа?', 'Do you like work?':'Тебе нравится работать?', 'Do you like English?':'Тебе нравится английский?', 'Do you like programming?':'Тебе нравится программирование?' };
    if (precise[entry.word]) entry.translation = precise[entry.word];
    entry.translation = entry.translation.replace(/(уже\s+)(\d+) минут(?:а|ы|у)?(?=\s|[.!?,]|$)/g, (_, prefix, digits) => {
      const number = Number(digits), last = number % 10, teen = number % 100;
      const ending = teen >= 11 && teen <= 14 ? 'минут' : last === 1 ? 'минуту' : last >= 2 && last <= 4 ? 'минуты' : 'минут';
      return `${prefix}${digits} ${ending}`;
    });
    entry.translation = entry.translation.replace('но я сильно улучшился', 'но я заметно продвинулся');
    if (entry.translation !== original) corrections.push({ id: entry.id, before: original, after: entry.translation });
    // Очевидные следы механической склейки. Не выдаём их за качественные задания.
    if (entry.word === 'Do you like a project?' || /before proceeding before we move forward|before proceeding for the time being/i.test(entry.word) || /с темой «|У темы «|в теме «/.test(entry.translation)) {
      entry.qualityIssue = 'Неестественная шаблонная формулировка: требуется редакторская проверка.';
      excluded.push({ id: entry.id, english: entry.word, translation: entry.translation, reason: entry.qualityIssue });
    }
  }
  return { corrections, excluded };
})();

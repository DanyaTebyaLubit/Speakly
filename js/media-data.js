// Разбираем только содержимое пользовательских файлов.
function parseDialogues(text) {
  const result = []; let level = '', current = null;
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^[ABC][12] —/.test(line)) { level = line.slice(0, 2); current = null; continue; }
    const heading = line.match(/^(\d+)\.\s+(.+)/);
    if (heading) { current = { id: `dialogue-${heading[1]}`, title: heading[2], topic: heading[2].replace(/\s*— пример \d+$/, ''), level, turns: [] }; result.push(current); }
    const turn = line.match(/^([A-Z]):\s+(.+)/);
    if (current && turn) {
      const translation = (lines[i + 1] || '').trim();
      if (/[а-яё]/i.test(translation)) { current.turns.push({ speaker: turn[1], word: turn[2], translation }); i++; }
    }
  }
  return result.filter(item => item.turns.length);
}
function parseSongs(text) {
  const result = []; let current = null;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const heading = line.match(/^(\d+)\.\s+(.+)/);
    if (heading) { current = { id: `song-${heading[1]}`, title: heading[2], lines: [], excerpt: false }; result.push(current); continue; }
    if (!current || !line.trim() || /^=+$/.test(line.trim()) || /^\[/.test(line)) continue;
    if (line.startsWith('Для изучения:')) { current.description = line.replace('Для изучения:', '').trim(); continue; }
    if (line.startsWith('Короткий фрагмент:')) { current.excerpt = true; current.lines.push(line.replace('Короткий фрагмент:', '').trim()); }
    else current.lines.push(line);
  }
  return result;
}
const SongNotes = {
  'song-1': { rule: 'В песне встречаются разговорные формы: mornin’ = morning, turnin’ = turning, wanna = want to. В обычном письме используйте полные формы. Be on the verge of + -ing означает «быть на грани чего-либо».', words: [
    ['daylight','дневной свет','We arrived in daylight.','Мы приехали при дневном свете.'],
    ['bizarre','странный, необычный','That was a bizarre dream.','Это был странный сон.'],
    ['shadows','тени','The trees cast long shadows.','Деревья отбрасывали длинные тени.'],
    ['on the verge of','на грани','She is on the verge of tears.','Она на грани слёз.'],
    ['cave in','сдаться, уступить','He refused to cave in.','Он отказался уступать.'],
    ['from afar','издалека','I watched the city from afar.','Я смотрел на город издалека.'],
    ['wanna','want to — хотеть','I want to go home.','Я хочу пойти домой.'],
  ] },
  'song-2': { rule: 'First things first — вводное выражение «прежде всего». I’ma — очень неформальное сокращение I am going to, обозначающее намерение.', words: [
    ['first things first','прежде всего','First things first, check the address.','Прежде всего проверь адрес.'], ['say','сказать','What did you say?','Что ты сказал?'], ['words','слова','Choose your words carefully.','Подбирай слова внимательно.'] ] },
  'song-3': { rule: 'When вводит придаточное времени. В days are cold форма are согласуется с множественным числом days.', words: [ ['when','когда','Call me when you arrive.','Позвони, когда приедешь.'], ['cold','холодный','The water is cold.','Вода холодная.'], ['days','дни','The days are getting longer.','Дни становятся длиннее.'] ] },
  'song-4': { rule: 'Tryna — разговорное trying to. Have been trying — Present Perfect Continuous: попытки начались раньше и связаны с настоящим.', words: [ ['tryna','trying to — пытаться','I am trying to understand.','Я пытаюсь понять.'], ['call','звонить','I will call you later.','Я позвоню тебе позже.'] ] },
  'song-5': { rule: 'Isn’t = is not. Best — превосходная степень good; перед best place в этом контексте употребляется the.', words: [ ['club','клуб','The club opens at nine.','Клуб открывается в девять.'], ['best','лучший','This is the best option.','Это лучший вариант.'], ['place','место','This is a quiet place.','Это тихое место.'] ] },
  'song-6': { rule: 'Lately означает «в последнее время». Have been losing — процесс, продолжающийся до настоящего или недавно завершившийся. Lose sleep — не высыпаться или не спать из-за переживаний.', words: [ ['lately','в последнее время','I have been busy lately.','В последнее время я занят.'], ['lose sleep','терять сон, не высыпаться','Do not lose sleep over it.','Не теряй из-за этого сон.'] ] },
  'song-7': { rule: 'Be tired of + существительное или -ing означает «устать от чего-либо». После предлога of используется being, а не be.', words: [ ['tired of','уставший от','I am tired of waiting.','Я устал ждать.'], ['want','хотеть','What do you want?','Чего ты хочешь?'], ['being','форма -ing глагола be','Thank you for being here.','Спасибо, что ты здесь.'] ] },
  'song-8': { rule: 'Used to + глагол описывает привычку или состояние в прошлом, которых больше нет. Это не то же самое, что be used to — «быть привыкшим».', words: [ ['used to','раньше бывало','I used to live here.','Раньше я здесь жил.'], ['rule','править','The king ruled for years.','Король правил много лет.'], ['world','мир','They travelled around the world.','Они путешествовали по миру.'] ] },
  'song-9': { rule: 'Heard — прошедшая форма hear. Settle down может означать «остепениться» или «устроить спокойную жизнь»; перевод зависит от контекста.', words: [ ['heard','слышал','I heard the news yesterday.','Я услышал новости вчера.'], ['settle down','остепениться, обосноваться','They decided to settle down here.','Они решили обосноваться здесь.'] ] },
};

const Catalog = {
  levels(entry) { return [...new Set((entry.memberships || []).map(item => item.topic.match(/\b([ABC][12])\b/)?.[1]).filter(Boolean))]; },
  level(entry) { return entry.memberships?.map(item => item.topic.match(/\b([ABC][12])\b/)?.[1]).find(Boolean) || ''; },
  tracks: { 'Основы': 'Базовая лексика', 'В разговоре': 'Разговорный английский', 'Реакции': 'Разговорный английский', 'Сленг': 'Разговорный английский', 'Диалоги': 'Разговорный английский', 'Предложения A1–C1': 'Разговорный английский', 'Практика': 'Грамматика', 'Конструкции': 'Грамматика', 'По темам': 'Повседневные темы', 'О людях': 'Повседневные темы', 'Песни': 'Английский по песням' },
};

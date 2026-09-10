const MediaLibrary = (() => {
  const dialogues = parseDialogues(SOURCES.find(s => s.name === 'Диалоги').text);
  const songs = parseSongs(SOURCES.find(s => s.name === 'Песни').text);
  const $ = id => document.getElementById(id);
  let tab = 'dialogues', selected = null, training = null, showTranslations = true;
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text !== undefined) n.textContent = text; return n; };
  function button(text, action, cls = 'secondary') { const n = el('button', cls, text); n.type = 'button'; n.addEventListener('click', action); return n; }
  function shuffle(items) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function pairs(item) {
    if (tab === 'songs') return SongNotes[item.id].words.map(([word,translation,example,exampleTranslation], i) => ({ id: `media:${item.id}:${i}`, word, translation, example, exampleTranslation, explanation: SongNotes[item.id].rule }));
    return item.turns.map((turn, i) => ({ ...turn, id: `media:${item.id}:${i}` }));
  }
  function render() {
    if (training) return practice();
    if (selected) return detail();
    const host = $('media-content'); host.replaceChildren();
    const query = $('media-search').value.toLowerCase().trim();
    const data = (tab === 'dialogues' ? dialogues : songs).filter(item => (tab !== 'dialogues' || ((!$('media-level').value || item.level === $('media-level').value) && (!$('media-topic').value || item.topic === $('media-topic').value))) && `${item.title} ${item.description || ''}`.toLowerCase().includes(query));
    host.append(el('p','hint', `${data.length} материалов${tab === 'dialogues' ? ' · уровни из вашего файла' : ' · разбор слов и разговорных форм'}`));
    const grid = el('div','media-grid'); host.append(grid);
    for (const item of data) {
      const tile = button('',()=>{ selected=item; detail(); },'media-tile');
      tile.append(el('span','eyebrow',tab === 'dialogues' ? item.level + ' · ' + item.turns.length + ' реплик' : item.excerpt ? 'ФРАГМЕНТ + РАЗБОР' : 'ТЕКСТ + РАЗБОР'), el('strong','',item.title), el('span','hint','Читать и практиковаться →')); grid.append(tile);
    }
    if (!data.length) host.append(el('p','empty','Материалов не найдено. Измените тему, уровень или поиск.'));
  }
  function detail() {
    const host = $('media-content'); host.replaceChildren();
    host.append(button('← К списку',()=>{selected=null;render();}));
    const box=el('article','media-reader');host.append(box);
    box.append(el('p','eyebrow',tab==='dialogues' ? selected.level+' · '+selected.topic : 'АНГЛИЙСКИЙ ПО ПЕСНЯМ'),el('h3','training-title',selected.title));
    if (tab==='dialogues') {
      box.append(button(showTranslations ? 'Скрыть переводы' : 'Показать переводы',()=>{showTranslations=!showTranslations;detail();}));
      for(const turn of selected.turns) {
        const row=el('div','dialogue-turn '+(turn.speaker==='B'?'speaker-b':''));
        row.append(el('span','speaker',turn.speaker));
        const content=el('div');const english=el('p','',turn.word);english.lang='en';content.append(english);
        const russian=el('p','example-translation',turn.translation);russian.hidden=!showTranslations;content.append(russian);row.append(content);box.append(row);
      }
      box.append(el('h4','','Слова и выражения'));
      const text=' '+Learning.canonical(selected.turns.map(t=>t.word).join(' '))+' ';
      const terms=Vocabulary.filter(e=>e.word.length>=3 && e.word.split(/\s+/).length<=3 && !/[.!?]/.test(e.word) && text.includes(' '+Learning.canonical(e.word)+' '));
      const seen=new Set();let count=0;
      for(const term of terms.sort((a,b)=>b.word.length-a.word.length)) {
        const key=Learning.canonical(term.word);if(seen.has(key))continue;seen.add(key);
        const translations=new Set(terms.filter(t=>Learning.canonical(t.word)===key).map(t=>Learning.meaning(t.translation)));
        if(translations.size>1)continue;
        box.append(el('p','vocab-pair',`${term.word} — ${term.translation}`)); if(++count===8)break;
      }
      if(!count)box.append(el('p','hint','Для этой сцены используйте перевод целых реплик выше.'));
    } else {
      box.append(el('p','hint', selected.excerpt ? 'В исходном файле есть короткий фрагмент этой песни.' : 'Текст предоставлен в вашем файле.'));
      const lyrics=el('details','lyrics');lyrics.append(el('summary','','Прочитать текст из файла'));
      lyrics.append(el('div','lyrics-text',selected.lines.join('\n')));box.append(lyrics);
      box.append(el('h4','','Как это устроено'),el('p','',SongNotes[selected.id].rule),el('h4','','Слова в контексте'),el('p','hint','Ниже — новые учебные примеры, не строки песни.'));
      for(const entry of pairs(selected)) {
        const row=el('div','song-word');row.append(el('strong','',entry.word),el('p','',entry.translation),el('p','example',entry.example),el('p','example-translation',entry.exampleTranslation));box.append(row);
      }
    }
    const actions=el('div','learning-actions');actions.append(button(tab==='songs'?'Проверить слова →':'Практика по репликам →',()=>start('meaning'),'primary'));
    if(tab==='songs')actions.append(button('Вставить слово в пример →',()=>start('gap')));
    if(tab==='dialogues')actions.append(button('Ответить за собеседника →',()=>Coach.dialogue(selected)));
    box.append(actions);
  }
  function start(mode) {
    let entries=pairs(selected);
    if(mode==='gap') entries=entries.filter(e=>(' '+Learning.canonical(e.example)+' ').includes(' '+Learning.canonical(e.word)+' ') && !/[—]/.test(e.translation));
    training={mode, entries:shuffle(entries).slice(0,8), index:0, correct:0, wrong:[], checked:false};practice();
  }
  function practice() {
    const host=$('media-content');host.replaceChildren();host.append(button('← К материалу',()=>{training=null;detail();}));
    const box=el('div','training-box');host.append(box);
    if(training.index===training.entries.length) {
      box.append(el('h3','training-title',`Результат: ${training.correct} / ${training.entries.length}`));
      if(!training.entries.length)box.append(el('p','hint','Для этого фрагмента нет точных пропусков. Попробуйте проверку слов.'));
      for(const entry of training.wrong)box.append(el('p','review',`${entry.word} — ${entry.translation}`));
      box.append(button('Повторить',()=>start(training.mode),'primary'));
      return;
    }
    const entry=training.entries[training.index];
    box.append(el('p','eyebrow',`${selected.title} · ${training.index+1}/${training.entries.length}`));
    const feedback=el('p','feedback',training.checked ? training.feedback : '');feedback.setAttribute('role','status');
    let controls=[];
    const next=button(training.index+1===training.entries.length?'Результат →':'Следующее →',()=>{training.index++;training.checked=false;practice();},'primary');next.hidden=!training.checked;
    function answer(correct, actual) {
      if(training.checked)return;training.checked=true;for(const control of controls)control.disabled=true;
      if(correct)training.correct++;else training.wrong.push(entry);
      Learning.record(entry,correct,Date.now(),actual);
      const result=Storage.read('lastQuiz',{})||{};Storage.write('lastQuiz',{...result, mediaResult:{id:selected.id,correct:training.correct,answered:training.index+1,total:training.entries.length}});
      feedback.textContent=(correct?'Верно. ':`Ответ: ${training.mode==='gap'?entry.word:entry.translation}. `)+Learning.explain(entry);training.feedback=feedback.textContent;next.hidden=false;
    }
    if(training.mode==='meaning') {
      box.append(el('h3','training-title',entry.word),el('p','hint','Выберите перевод этой реплики или выражения.'));
      const all=tab==='songs'?Object.values(SongNotes).flatMap(n=>n.words.map(w=>w[1])):dialogues.flatMap(d=>d.turns.map(t=>t.translation));
      const distractors=shuffle([...new Set(all)].filter(t=>Learning.meaning(t)!==Learning.meaning(entry.translation))).slice(0,3);
      const answers=el('div','answers');
      for(const text of shuffle([entry.translation,...distractors])){const b=button(text,()=>answer(text===entry.translation,text),'answer');b.disabled=training.checked;controls.push(b);answers.append(b);}box.append(answers);
    }else{
      const escaped=entry.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const prompt=entry.example.replace(new RegExp('\\b'+escaped+'\\b','i'),'_____');
      box.append(el('h3','training-title',prompt),el('p','',entry.exampleTranslation),el('p','hint',`Используйте выражение из разбора: ${entry.translation}.`));
      const input=el('input','gap-input');input.setAttribute('aria-label','Пропущенное выражение');
      const check=button('Проверить',()=>{if(!input.value.trim()){feedback.textContent='Введите слово.';return;}answer(Learning.accepts(input.value,entry.word),input.value);},'primary');controls=[input,check];input.disabled=training.checked;check.disabled=training.checked;box.append(input,check);
    }
    box.append(feedback,next);
  }
  function init() {
    for(const topic of new Set(dialogues.map(d=>d.topic))){const o=el('option','',topic);o.value=topic;$('media-topic').append(o);}
    for(const [id,type] of [['media-dialogues','dialogues'],['media-songs','songs']]) $(id).addEventListener('click',()=>{tab=type;selected=null;training=null;$('media-level').hidden=tab==='songs';$('media-topic').hidden=tab==='songs';$('media-dialogues').setAttribute('aria-pressed',String(tab==='dialogues'));$('media-songs').setAttribute('aria-pressed',String(tab==='songs'));render();});
    for(const id of ['media-level','media-topic','media-search']) $(id).addEventListener(id==='media-search'?'input':'change',()=>{selected=null;training=null;render();});
  }
  return { init, render, dialogues, songs, resetAccount(){training=null;} };
})();

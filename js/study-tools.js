/* Профиль, личная коллекция и снимки занятий используют существующий lastQuiz. */
const StudyTools = (() => {
  const levels = ['A1','A2','B1','B2','C1'];
  const el = (tag, text, cls='') => { const n=document.createElement(tag);n.className=cls;n.textContent=text;return n; };
  const button = (text,fn) => { const n=el('button',text,'secondary');n.type='button';n.addEventListener('click',fn);return n; };
  const read = () => Storage.read('lastQuiz',{})?.tools || {};
  function write(value) { Storage.write('lastQuiz',{...Storage.read('lastQuiz',{}),tools:value}); }
  function session(key, value) { const data=read();if(arguments.length===1)return data.sessions?.[key] || null; data.sessions={...data.sessions,[key]:value};write(data); }
  function level() { return levels.includes(read().level) ? read().level : 'A1'; }
  const bank = [
    ['A1','She ___ my sister.','is','Она моя сестра.','С she используется is.'],
    ['A1','They ___ at home.','are','Они дома.','С they используется are.'],
    ['A2','Yesterday I ___ to school.','went','Вчера я ходил в школу.','Go → went в Past Simple.'],
    ['A2','She is ___ a book now.','reading','Она сейчас читает книгу.','В процессе: is + reading.'],
    ['B1','I have ___ seen this film. (уже)','already','Я уже видел этот фильм.','Already стоит между have и seen.'],
    ['B1','If I had more time, I ___ travel more.','would','Если бы у меня было больше времени, я бы больше путешествовал.','Условие о воображаемой ситуации: If + Past, would + глагол.'],
    ['B2','By the time we arrived, the train ___ left.','had','К нашему приезду поезд уже ушёл.','Более раннее прошлое: had + третья форма.'],
    ['B2','I wish I ___ studied harder.','had','Жаль, что я не учился усерднее.','Сожаление о прошлом: wish + had + третья форма.'],
    ['C1','Not only ___ she win, but she also broke the record.','did','Она не только победила, но и побила рекорд.','После Not only в начале — инверсия: did she win.'],
    ['C1','Had I known, I ___ have helped.','would','Если бы я знал, я бы помог.','Условие о прошлом с инверсией: Had I known, I would have helped.']
  ];
  function lesson(selected=level()) { return bank.filter(q=>q[0]===selected).map((q,i)=>({id:`level:${selected}:${i}`,prompt:q[1],answer:q[2],word:q[1].replace('___',q[2]),translation:q[3],explanation:q[4],studyTopic:`Грамматика ${selected}`})); }
  function profile() {
    const box=LearningUI.surface();box.append(el('h3','Уровень обучения','training-title'),el('p','Уровень меняет следующий дневной план. Уже начатое занятие сохраняется.','hint'));
    const select=el('select','');select.setAttribute('aria-label','Мой уровень');for(const l of levels){const o=el('option',l);o.value=l;select.append(o);}select.value=level();
    select.addEventListener('change',()=>{write({...read(),level:select.value});LearningUI.dashboard();});box.append(select,button('Входной тест · 10 вопросов',()=>placement()));
    box.append(el('p','Это короткая ориентировочная проверка грамматики, не полноценный экзамен CEFR. Уровень можно выбрать вручную.','hint'));
  }
  function placement() {
    let state=session('placement') || {index:0,answers:[]};
    function render(){const box=LearningUI.surface();if(state.index===bank.length){
      let recommendation='A1';for(const l of levels){const ids=bank.map((q,i)=>q[0]===l?i:-1).filter(i=>i>=0);if(ids.every(i=>state.answers[i]===true))recommendation=l;else break;}
      box.append(el('h3',`Рекомендация: ${recommendation}`,'training-title'),el('p',`Верно: ${state.answers.filter(Boolean).length}/10. Это ориентир для подбора практики, а не подтверждённый уровень.`));
      box.append(button('Применить уровень',()=>{write({...read(),level:recommendation});profile();}),button('Пройти заново',()=>{session('placement',null);placement();}));return;}
      const q=bank[state.index];box.append(el('p',`Вопрос ${state.index+1}/10`,'eyebrow'),el('h3',q[1],'training-title'),el('p',q[3]));const input=el('input','','gap-input');input.setAttribute('aria-label','Ответ входного теста');input.value=state.draft||'';input.addEventListener('input',()=>{state.draft=input.value;session('placement',state);});box.append(input);
      let answered=false;box.append(button('Ответить',()=>{if(answered || !input.value.trim())return;answered=true;state.answers.push(Learning.accepts(input.value,q[2]));state.index++;state.draft='';session('placement',state);render();}));
    }render();
  }
  function favoriteButton(entry) { const key=Learning.canonical(entry.word);const n=button('',()=>{const data=read(),items={...data.favorites};if(items[key])delete items[key];else items[key]=entry;write({...data,favorites:items});update();});function update(){const saved=Boolean(read().favorites?.[key]);n.textContent=saved?'★ В моём словаре':'☆ Добавить к себе';n.setAttribute('aria-pressed',String(saved));}update();return n; }
  function personal() {
    const box=LearningUI.surface(), items=Object.values(read().favorites||{});box.append(el('h3',`Мой словарь · ${items.length}`,'training-title'));
    if(items.length)box.append(button('Практика моих слов',()=>Coach.run(items.map(e=>({entry:e,stage:'Мой словарь',prompt:`Переведите: ${e.translation}`,answer:e.word,alternatives:[],hint:`Начало: ${e.word.slice(0,2)}…`})),personal)));
    else box.append(el('p','Нажмите «Добавить к себе» у слова, реплики или выражения из песни.','hint'));
    for(const entry of items){const row=el('div','','mastery-card');row.append(el('strong',entry.word),el('p',entry.translation),button('Убрать',()=>{const data=read();delete data.favorites[Learning.canonical(entry.word)];write(data);personal();}));box.append(row);}
  }
  function diagnosis(entry, actual) {
    if(!actual)return '';
    const expected=Learning.canonical(entry.word), answer=Learning.canonical(entry.exercise?.prompt?.includes('___') ? entry.exercise.prompt.replace('___',actual) : actual);
    if(/\b(she|he|it) (work|like|play|live|want|need)\b/.test(answer)&&/\b(she|he|it) (works|likes|plays|lives|wants|needs)\b/.test(expected))return 'С he/she/it в Present Simple добавьте -s к глаголу: she works, he likes. В вашем ответе стоит форма без -s.';
    if(/\b(did|does)\b/.test(expected)&&/\b(did|does)\b.*\b(went|worked|works|liked|likes|played|plays)\b/.test(answer))return 'Время и лицо уже выражены в did/does. После них нужна начальная форма: did go, does work.';
    if(/\b(can|should|must)\b/.test(expected)&&/\b(can|should|must) (to |\w+ing\b)/.test(answer))return 'После модального глагола нужна начальная форма без to и -ing: can swim, should work.';
    if(/\b(i am|she is|he is|they are|we are|you are)\b/.test(expected)&&/\b(i is|i are|she are|he are|they is|we is|you is)\b/.test(answer))return 'Форма be не согласована с подлежащим. Правильно: I am, he/she is, you/we/they are.';
    return '';
  }
  function dashboard(host){const row=el('div','','learning-actions');row.append(button(`Уровень: ${level()}`,profile),button('Мой словарь',personal));if(session('coach'))row.append(button('Продолжить письменное занятие',()=>Coach.run(null,personal,false,session('coach'))));if(session('learning'))row.append(button('Продолжить урок / повторение',()=>LearningUI.resume()));host.append(row);}
  function backup(){return {format:'speakly-progress',version:1,exportedAt:new Date().toISOString(),known:Storage.read('known',[]),lessons:Storage.read('lessons',[]),lastQuiz:Storage.read('lastQuiz',{})};}
  function exportData(){const data=backup();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='speakly-progress.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function init(){document.getElementById('export-progress').addEventListener('click',exportData);Storage.subscribe((key)=>{if(key==='pending')return;const n=document.getElementById('save-status');n.textContent=Storage.available?(Storage.accountId?'Сохранено на устройстве · ожидает синхронизации':'Сохранено на устройстве'):'Запись недоступна · экспортируйте прогресс до закрытия';});}
  return {session,level,lesson,profile,placement,personal,favoriteButton,diagnosis,dashboard,backup,init};
})();

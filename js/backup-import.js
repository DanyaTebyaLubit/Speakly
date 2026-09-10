/* JSON imports are data only. Preview never writes; apply keeps a scoped rollback. */
const BackupImport = (() => {
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const require = (ok, message) => { if (!ok) throw new Error(message); };
  function validate(text) {
    require(typeof text === 'string' && text.length <= 10000000, 'Файл слишком большой (максимум 10 МБ).');
    let data; try { data=JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON. Выберите экспорт Speakly.'); }
    let nodes=0;
    function walk(value, depth=0) {
      require(++nodes<300000 && depth<35,'Слишком сложная структура файла.');
      if(value && typeof value==='object') for(const [key,item] of Object.entries(value)) {
        require(!['__proto__','constructor','prototype'].includes(key),'Недопустимое поле в файле.');walk(item,depth+1);
      }
    }walk(data);
    require(object(data)&&data.format==='speakly-progress'&&data.version===1,'Нужен файл резервной копии Speakly версии 1.');
    const strings = v => Array.isArray(v)&&v.length<50000&&v.every(s=>typeof s==='string');
    const entry = v => object(v)&&typeof v.id==='string'&&typeof v.word==='string'&&typeof v.translation==='string';
    const map = (v, check) => { require(object(v),'Некорректная коллекция в копии.'); for(const item of Object.values(v))require(check(item),'Повреждена запись прогресса.'); };
    const integer = n => Number.isSafeInteger(n)&&n>=0;
    require(strings(data.known)&&strings(data.lessons),'Повреждены отметки слов или уроков.');
    require(data.lastQuiz===null||object(data.lastQuiz),'Повреждён прогресс занятий.');
    const q=data.lastQuiz||{}, l=q.learning||{}, t=q.tools||{};
    require(object(l)&&object(t),'Повреждены настройки обучения.');
    const task = v => object(v)&&entry(v.entry)&&typeof v.prompt==='string'&&typeof v.answer==='string'&&strings(v.alternatives);
    const responses = v => object(v)&&Object.values(v).every(r=>object(r)&&typeof r.actual==='string'&&typeof r.checked==='boolean');
    const run = v => object(v)&&Array.isArray(v.tasks)&&v.tasks.every(task)&&integer(v.index)&&v.index<=v.tasks.length&&responses(v.responses);
    for(const key of ['reviews','errors'])if(l[key])map(l[key],v=>object(v)&&entry(v.entry)&&Number.isFinite(v.due)&&(key!=='errors'||Number.isFinite(v.wrongAt)));
    if(l.mastery)map(l.mastery,v=>object(v)&&strings(v.days)&&strings(v.items)&&Number.isFinite(v.attempts)&&Number.isFinite(v.failures));
    if(l.courses)map(l.courses,v=>object(v)&&Number.isFinite(v.score));
    if(l.daily)require(run(l.daily)&&typeof l.daily.date==='string','Повреждён дневной план.');
    if(l.achievements){require(object(l.achievements),'Повреждены достижения.');map(l.achievements.days,v=>object(v)&&strings(v.ids)&&['correct','independent','replies'].every(k=>integer(v[k])));map(l.achievements.earned,v=>Number.isFinite(v));}
    if(q.notebook)map(q.notebook,v=>object(v)&&typeof v.title==='string'&&typeof v.text==='string'&&typeof (v.context||'')==='string');
    if(t.favorites)map(t.favorites,entry);
    if(t.level)require(['A1','A2','B1','B2','C1'].includes(t.level),'Неизвестный уровень.');
    if(t.sessions) {
      require(object(t.sessions),'Повреждены занятия.');
      for(const [key,v] of Object.entries(t.sessions)) {
        if(v===null)continue;
        require(object(v),'Повреждено сохранённое занятие.');
        if(key==='coach')require(run(v),'Повреждена письменная практика.');
        else if(key==='cards')require(strings(v.ids)&&integer(v.index)&&v.index<=v.ids.length,'Повреждены карточки.');
        else if(key==='placement')require(integer(v.index)&&v.index<=10&&Array.isArray(v.answers)&&v.answers.length===v.index&&v.answers.every(a=>typeof a==='boolean'),'Повреждён входной тест.');
        else if(key==='quiz')require(Array.isArray(v.questions)&&v.questions.every(x=>object(x)&&entry(x.entry)&&strings(x.options))&&integer(v.index)&&v.index<=v.questions.length&&Array.isArray(v.answers)&&v.answers.every(x=>object(x)&&entry(x.entry)&&typeof x.correct==='boolean'),'Повреждён тест.');
        else if(key.startsWith('training'))require(['gap','order','test'].includes(v.mode)&&object(v.session)&&Array.isArray(v.session.questions)&&v.session.questions.every(x=>entry(x.entry)&&strings(x.tokens)&&Array.isArray(x.picked)&&x.picked.every(i=>integer(i)&&i<x.tokens.length)&&Array.isArray(x.order)&&x.order.every(i=>integer(i)&&i<x.tokens.length)&&integer(x.gap)&&x.gap<x.tokens.length)&&integer(v.session.index)&&v.session.index<=v.session.questions.length,'Повреждена практика.');
        else if(key==='media') {
          require(['songs','dialogues'].includes(v.tab)&&(!v.selected||typeof v.selected.id==='string')&&(!v.training||(['meaning','gap'].includes(v.training.mode)&&Array.isArray(v.training.entries)&&v.training.entries.every(entry)&&Array.isArray(v.training.wrong)&&v.training.wrong.every(entry)&&integer(v.training.index)&&v.training.index<=v.training.entries.length)),'Повреждены материалы.');
          if(v.selected){const current=(v.tab==='songs'?MediaLibrary.songs:MediaLibrary.dialogues).find(item=>item.id===v.selected.id);require(Boolean(current),'Материал из копии не найден в библиотеке.');v.selected=JSON.parse(JSON.stringify(current));}
          require(!v.training||v.selected,'У занятия отсутствует материал.');
        }
        else if(key==='learning')require(['course','error','review'].includes(v.kind)&&Array.isArray(v.questions)&&v.questions.every(entry)&&integer(v.index)&&object(v.drafts)&&object(v.checked)&&Number.isFinite(v.score)&&(v.kind!=='course'||object(v.currentCourse)&&Array.isArray(v.currentCourse.questions)&&v.currentCourse.questions.every(entry)),'Повреждён урок.');
        else throw new Error('Копия содержит неизвестный тип занятия.');
      }
    }
    return {format:data.format,version:1,exportedAt:data.exportedAt,known:[...new Set(data.known)],lessons:[...new Set(data.lessons)],lastQuiz:q};
  }
  function counts(data) {return [data.known.length,data.lessons.length,Object.keys(data.lastQuiz?.tools?.favorites||{}).length,Object.keys(data.lastQuiz?.notebook||{}).length,Object.keys(data.lastQuiz?.learning?.errors||{}).length];}
  function apply(data, owner, snapshot) {
    require(owner===Storage.accountId,'Аккаунт изменился. Откройте предпросмотр заново.');
    const current=StudyTools.backup();delete current.exportedAt;
    require(JSON.stringify(current)===snapshot,'Прогресс изменился после предпросмотра. Откройте файл заново.');
    const checked=validate(JSON.stringify(data));
    Storage.write('preImport',StudyTools.backup());require(Storage.available,'Не удалось сохранить страховочную копию. Освободите место и повторите.');
    Storage.replaceProgress(checked);
    App.resetSessions();App.reloadProgress();Notebook.resetAccount();
  }
  function preview(data, name='Резервная копия') {
    const box=LearningUI.surface(), owner=Storage.accountId, before=StudyTools.backup();delete before.exportedAt;const snapshot=JSON.stringify(before);
    const add=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;box.append(n);return n;};
    add('h3','Восстановление: '+name);add('p','После подтверждения прогресс текущего аккаунта будет заменён данными файла. При входе изменения отправятся в аккаунт. Текущую копию можно будет восстановить кнопкой отмены импорта.');
    const previous=counts(before),incoming=counts(data);['Выученные слова','Прочитанные уроки','Личный словарь','Заметки','Записи ошибок'].forEach((label,i)=>add('p',`${label}: сейчас ${previous[i]} → в файле ${incoming[i]}`));
    add('p',`Уровень: ${data.lastQuiz?.tools?.level||'A1'}. Незавершённые занятия из файла тоже будут восстановлены.`);
    const message=add('p','');message.setAttribute('role','status');const confirm=add('button','Восстановить эту копию');confirm.className='primary';confirm.type='button';confirm.addEventListener('click',()=>{try{apply(data,owner,snapshot);confirm.disabled=true;message.textContent='Копия восстановлена. Вернитесь в нужный раздел, чтобы продолжить.';}catch(error){message.textContent=error.message;}});
    const cancel=add('button','Отмена');cancel.className='secondary';cancel.type='button';cancel.addEventListener('click',()=>App.navigate('dictionary'));
  }
  function init() {
    const file=document.getElementById('import-file');
    document.getElementById('import-progress-file').addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected)return;try{require(selected.size<=10000000,'Файл слишком большой (максимум 10 МБ).');preview(validate(await selected.text()),selected.name);}catch(error){document.getElementById('notice').textContent=error.message;}finally{file.value='';}});
    document.getElementById('undo-import').addEventListener('click',()=>{const previous=Storage.read('preImport',null);if(previous)preview(validate(JSON.stringify(previous)),'копия до последнего импорта');else document.getElementById('notice').textContent='Предыдущего импорта пока нет.';});
  }
  return {init,validate,preview,apply};
})();

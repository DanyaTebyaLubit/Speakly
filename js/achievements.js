/* Счётчики основаны на первых ответах на задание за местный день.
   Старую календарную историю не восстанавливаем из приблизительных данных. */
const Achievements = (() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text !== undefined) n.textContent = text; return n; };
  const button = (label, fn, cls = 'secondary') => { const n = el('button', cls, label); n.type = 'button'; n.addEventListener('click', fn); return n; };
  function shift(key, offset) { const [y,m,d] = key.split('-').map(Number); return Coach.dayKey(new Date(y,m-1,d+offset).getTime()); }
  function streak(days, now = Date.now()) {
    const today = Coach.dayKey(now);
    let key = days[today]?.ids.length ? today : shift(today,-1), length = 0;
    while (days[key]?.ids.length) { length++; key = shift(key,-1); }
    return length;
  }
  function metrics(data, now = Date.now()) {
    const days = data.achievements.days;
    return { answers: Object.values(days).reduce((n,d)=>n+d.ids.length,0),
      independent: Object.values(days).reduce((n,d)=>n+d.independent,0),
      plans: Object.values(days).filter(d=>d.plan).length,
      known: new Set(Storage.read('known',[])).size,
      lessons: new Set(Storage.read('lessons',[])).size,
      mastered: Object.values(data.mastery).filter(m=>Coach.status(m)==='Освоено').length,
      streak: streak(days,now), replies: Object.values(days).reduce((n,d)=>n+d.replies,0) };
  }
  const badges = [
    ['first','01','Первый шаг','Ответьте на первое задание','answers',1],
    ['words10','Aa','Слово за словом','Отметьте 10 выученных слов','known',10],
    ['answers50','50','В ритме','Выполните 50 заданий','answers',50],
    ['solo10','↗','Своими силами','10 верных ответов без подсказок','independent',10],
    ['streak3','III','Три дня подряд','Практикуйтесь 3 дня подряд','streak',3],
    ['streak7','VII','Неделя английского','Практикуйтесь 7 дней подряд','streak',7],
    ['plan1','✓','День с пользой','Завершите дневной план','plans',1],
    ['plans7','7×','Хорошая привычка','Завершите планы в 7 разных днях','plans',7],
    ['dialogue10','“ ”','Есть что сказать','Ответьте на 10 реплик диалогов','replies',10],
    ['rules5','≡','По правилам','Отметьте прочитанными 5 уроков','lessons',5],
    ['master1','✦','Прочные знания','Подтвердите освоение одной темы','mastered',1],
    ['words100','100','Своя коллекция','Отметьте 100 выученных слов','known',100]
  ];
  function unlock(data, now = Date.now()) {
    const values = metrics(data,now);
    for (const [id,,,,key,target] of badges) if (!data.achievements.earned[id] && values[key]>=target) data.achievements.earned[id] = now;
  }
  function reconcile() {
    const data = Learning.state(), before = Object.keys(data.achievements.earned).length;
    unlock(data);
    if (Object.keys(data.achievements.earned).length !== before) Learning.save(data);
  }
  function record(data, entry, correct, now, actual, evidence) {
    if (actual === null || actual === undefined) return; // не считаем самооценку повторным ответом
    const key = Coach.dayKey(now), store = data.achievements;
    const day = store.days[key] ||= { ids: [], correct: 0, independent: 0, replies: 0, plan: false };
    if (!day.ids.includes(entry.id)) {
      day.ids.push(entry.id); day.correct += Number(correct);
      day.independent += Number(correct && Boolean(evidence.independent));
      day.replies += Number(entry.id.startsWith('reply:'));
    }
    store.startedAt ||= now; unlock(data,now);
  }
  function completePlan(data, now = Date.now()) {
    const key = Coach.dayKey(now);
    const day = data.achievements.days[key] ||= { ids: [], correct: 0, independent: 0, replies: 0, plan: false };
    day.plan = true; unlock(data,now);
  }
  function open() { App.navigate('achievements'); }
  function render() {
    const data = Learning.state(); unlock(data); Learning.save(data);
    const values = metrics(data), days = data.achievements.days, today = Coach.dayKey();
    const box = document.getElementById('achievements'); box.replaceChildren(); box.className = 'achievements-screen';
    document.getElementById('section-title').textContent = 'Ваш прогресс';
    document.getElementById('section-kicker').textContent = 'МАЛЕНЬКИЕ ШАГИ. ЗАМЕТНЫЙ РЕЗУЛЬТАТ.';
    const hero = el('section','achievement-hero');
    const copy = el('div','achievement-hero-copy');
    copy.append(el('p','eyebrow','ВЫ СТРОИТЕ ПРИВЫЧКУ'),el('h3','',values.streak ? `${values.streak} дней в ритме` : 'Каждый день — чуть увереннее.'),el('p','', 'Ваш английский растёт с каждой попыткой. Здесь видно, сколько уже сделано.'),button('Продолжить обучение →',Coach.daily,'primary'));
    const earned = Object.keys(data.achievements.earned).length;
    const ring = el('div','achievement-ring'); ring.setAttribute('style',`--fill:${earned/badges.length*100}%`); ring.setAttribute('role','img'); ring.setAttribute('aria-label',`Открыто ${earned} из ${badges.length} достижений`);
    const inside = el('div','ring-inside'); inside.append(el('strong','',`${earned}/${badges.length}`),el('span','','достижений'));ring.append(inside);hero.append(copy,ring);box.append(hero);
    const stats = el('div','achievement-stats');
    for (const [value,label] of [[values.answers,'заданий выполнено'],[values.independent,'верно без подсказок'],[values.plans,'планов завершено'],[values.mastered,'тем освоено']]) {
      const card = el('div','achievement-stat');card.append(el('strong','',value),el('span','',label));stats.append(card);
    } box.append(stats);
    const charts = el('div','achievement-charts');
    const activity = el('section','insight-panel'); activity.append(el('p','eyebrow','ПОСЛЕДНИЕ 28 ДНЕЙ'),el('h3','','Ваш ритм'));
    const calendar = el('div','activity-grid'); const detail = el('p','hint','Нажмите на день, чтобы увидеть результат.');detail.setAttribute('role','status');
    for(let i=-27;i<=0;i++) {
      const date = shift(today,i), count = days[date]?.ids.length || 0;
      const tile = button(date.slice(-2),()=>{detail.textContent=`${date}: ${count} заданий, ${days[date]?.correct || 0} верных с первой попытки.${days[date]?.plan ? ' План завершён.' : ''}`;},'activity-day');
      tile.dataset.intensity = count>=10?'3':count>=5?'2':count?'1':'0';tile.setAttribute('aria-label',`${date}: ${count} заданий`);if(i===0)tile.setAttribute('aria-current','date');calendar.append(tile);
    }activity.append(calendar,detail);charts.append(activity);
    const week = el('section','insight-panel');week.append(el('p','eyebrow','ПОСЛЕДНИЕ 7 ДНЕЙ'),el('h3','','Практика по дням'));
    const counts = Array.from({length:7},(_,i)=>days[shift(today,i-6)]?.ids.length || 0), max = Math.max(1,...counts);
    const bars = el('div','week-bars');
    counts.forEach((n,i)=> { const col = el('div','week-column');col.append(el('span','',n));const track=el('div','week-track');const fill=el('div','week-fill');fill.setAttribute('style',`height:${n/max*100}%`);track.append(fill);col.append(track,el('small','',shift(today,i-6).slice(5).split('-').reverse().join('.')));bars.append(col); });week.append(bars);charts.append(week);box.append(charts);
    const mastery = el('section','insight-panel mastery-insight');mastery.append(el('div','eyebrow','ОТ ПРАКТИКИ К УВЕРЕННОСТИ'),el('h3','','Темы, которые растут вместе с вами'));
    const topics = Object.entries(data.mastery).sort((a,b)=>b[1].lastAt-a[1].lastAt).slice(0,4);
    for(const [name,m] of topics) {const row=el('div','topic-insight');row.append(el('strong','',name),el('span','hint',Coach.status(m)));const p=el('progress','');p.max=6;p.value=m.days.length+m.items.length;p.setAttribute('aria-label',`${name}: ${m.days.length} из 3 дней, ${m.items.length} из 3 заданий`);row.append(p);mastery.append(row);}
    if(!topics.length)mastery.append(el('p','hint','После первых заданий здесь появятся темы и их прогресс.'));
    mastery.append(button('Все темы и слабые места →',Coach.mastery));box.append(mastery);
    const heading=el('div','achievement-heading');heading.append(el('div','', 'Ваша коллекция достижений'),el('span','hint',`${earned} из ${badges.length} открыто`));box.append(heading);
    const filters=el('div','learning-actions'),grid=el('div','badge-grid');
    function renderBadges(filter) {
      grid.replaceChildren();for(const [id,symbol,name,description,key,target] of badges) {
        const unlocked = data.achievements.earned[id];if(filter==='earned'&&!unlocked||filter==='next'&&unlocked)continue;
        const card=el('article',`badge-card ${unlocked?'is-earned':'is-locked'}`);
        card.append(el('div','badge-emblem',symbol),el('span','badge-status',unlocked?'ОТКРЫТО':'ВПЕРЕДИ'),el('h4','',name),el('p','hint',description));
        const progress=el('progress','');progress.max=target;progress.value=unlocked?target:Math.min(values[key],target);progress.setAttribute('aria-label',`${name}: ${progress.value} из ${target}`);card.append(progress,el('small','hint',unlocked?`Получено ${new Date(unlocked).toLocaleDateString('ru-RU')}`:`${Math.min(values[key],target)} / ${target}`));grid.append(card);
      }
      if(!grid.children.length)grid.append(el('p','hint',filter==='earned'?'Первое достижение впереди. Начните с одного задания.':'Все достижения уже открыты!'));
    }
    for(const [key,label] of [['all','Все'],['earned','Открытые'],['next','Ближайшие']]) { const control=button(label,()=>{for(const b of filters.children)b.setAttribute('aria-pressed',String(b===control));renderBadges(key);});control.setAttribute('aria-pressed',String(key==='all'));filters.append(control); }
    box.append(filters,grid,el('p','achievement-footnote','Календарь учитывает новые ответы после добавления статистики. В каждом дне считается первая попытка на каждое задание; повторы и самооценка не увеличивают счётчик. Отметки слов и уроков учитывают прежний прогресс.'));
    renderBadges('all');
  }
  return { record, completePlan, metrics, streak, unlock, reconcile, open, render, badges };
})();

/* Немодальная панель: заметки не меняют раздел и не сбрасывают упражнение. */
const Notebook = (() => {
  const $ = id => document.getElementById(id);
  let selected = 'scratch', owner = null, sequence = 0, trigger = null;
  const notes = () => Storage.read('lastQuiz', {})?.notebook || {};
  function write(all) { Storage.write('lastQuiz', { ...Storage.read('lastQuiz', {}), notebook: all }); }
  function refreshList() {
    const all = notes(); $('notebook-select').replaceChildren();
    for (const [id, note] of Object.entries(all).sort((a,b)=>b[1].updatedAt-a[1].updatedAt)) {
      const option=document.createElement('option');option.value=id;option.textContent=note.title || 'Без названия';$('notebook-select').append(option);
    }
    $('notebook-select').value=selected;
  }
  function render() {
    const note=notes()[selected]; refreshList();
    $('notebook-title').value=note?.title || '';
    $('notebook-text').value=note?.text || '';
    $('notebook-context').textContent=note?.context || 'Общая заметка — доступна из любого раздела.';
    $('notebook-status').textContent=Storage.available ? 'Изменения сохраняются автоматически на устройстве.' : 'Хранилище недоступно. Экспортируйте прогресс до закрытия вкладки.';
  }
  function open(entry = null) {
    if (owner !== Storage.accountId) resetAccount();
    owner=Storage.accountId;
    trigger=document.activeElement;
    if(entry)selected=`error:${entry.id}`;
    const all=notes();
    if(!all[selected]) {
      all[selected]={title:entry ? entry.word : 'Мои записи',text:'',context:entry ? `${entry.word} — ${entry.translation}\n${Learning.explain(entry)}` : '',updatedAt:Date.now()};write(all);
    }
    $('notebook-panel').hidden=false;$('notebook-toggle').setAttribute('aria-expanded','true');render();$('notebook-text').focus();
  }
  function close() { $('notebook-panel').hidden=true;$('notebook-toggle').setAttribute('aria-expanded','false');if(trigger?.focus)trigger.focus(); }
  function save() {
    // Не даём открытому редактору записать текст в другой аккаунт.
    if(owner !== Storage.accountId){resetAccount();return;}
    const all=notes();
    all[selected]={...all[selected],title:$('notebook-title').value,text:$('notebook-text').value,updatedAt:Date.now()};
    write(all);refreshList();
    $('notebook-status').textContent=Storage.available ? (Storage.accountId ? 'Сохранено на устройстве · синхронизация через аккаунт' : 'Сохранено на устройстве') : 'Только в памяти вкладки. Экспортируйте прогресс до закрытия.';
  }
  function resetAccount() {owner=Storage.accountId;selected='scratch';close();$('notebook-title').value='';$('notebook-text').value='';$('notebook-context').textContent='';$('notebook-select').replaceChildren();}
  function init() {
    owner=Storage.accountId;
    close();
    $('notebook-toggle').addEventListener('click',()=>{$('notebook-panel').hidden ? open() : close();});
    $('notebook-close').addEventListener('click',close);
    $('notebook-new').addEventListener('click',()=>{selected=`note:${Date.now()}:${++sequence}`;open();});
    $('notebook-select').addEventListener('change',()=>{selected=$('notebook-select').value;render();});
    for(const id of ['notebook-title','notebook-text'])$(id).addEventListener('input',save);
    $('notebook-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  }
  return {init,open,resetAccount};
})();

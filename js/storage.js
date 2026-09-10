// Сохранение совместимо с предыдущей версией приложения.
const Storage = (() => {
  let available = true;
  let account = null;
  // Если браузер отказал в записи, продолжаем занятие в памяти текущей вкладки.
  const temporary = new Map();
  const listeners = new Set();
  const progressKeys = new Set(['known', 'lessons', 'lastQuiz', 'pending', 'preImport']);
  function storageKey(key) {
    return account && progressKeys.has(key) ? `speakly.account.${account}.${key}` : `speakly.${key}`;
  }
  function read(key, fallback) {
    const name = storageKey(key);
    if (temporary.has(name)) return JSON.parse(temporary.get(name));
    try { const raw = localStorage.getItem(name); return raw === null ? fallback : JSON.parse(raw); }
    catch { available = false; return fallback; }
  }
  function write(key, value) {
    const previous = read(key, null);
    const name = storageKey(key), serialized = JSON.stringify(value);
    try { localStorage.setItem(name, serialized); temporary.delete(name); available = temporary.size === 0; }
    catch { temporary.set(name, serialized); available = false; }
    if (!available) document.getElementById('notice').textContent = 'Хранилище браузера недоступно. Прогресс сохранится только до закрытия страницы.';
    for (const listener of listeners) listener(key, value, previous);
  }
  function replaceProgress(values) {
    const keys=['known','lessons','lastQuiz'];
    const previous=Object.fromEntries(keys.map(key=>[key,read(key,null)]));
    const raw=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(storageKey(key))]));
    try {
      for(const key of keys)localStorage.setItem(storageKey(key),JSON.stringify(values[key]));
    } catch(error) {
      // Не отправляем частичный импорт в аккаунт. Возвращаем прежние локальные значения.
      for(const key of keys)try {if(raw[key]===null)localStorage.removeItem(storageKey(key));else localStorage.setItem(storageKey(key),raw[key]);}catch{temporary.set(storageKey(key),JSON.stringify(previous[key]));available=false;}
      throw new Error('Не удалось записать копию целиком. Импорт отменён; проверьте свободное место в хранилище браузера.');
    }
    for(const key of keys)temporary.delete(storageKey(key));
    available=temporary.size===0;
    for(const key of keys)for(const listener of listeners)listener(key,values[key],previous[key]);
  }
  return { read, write, replaceProgress, subscribe(fn) { listeners.add(fn); }, setAccount(id) { account = id; }, get accountId() { return account; }, get available() { return available; } };
})();


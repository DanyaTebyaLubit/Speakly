// Сохранение совместимо с предыдущей версией приложения.
const Storage = (() => {
  let available = true;
  let account = null;
  // Если браузер отказал в записи, продолжаем занятие в памяти текущей вкладки.
  const temporary = new Map();
  const listeners = new Set();
  const progressKeys = new Set(['known', 'lessons', 'lastQuiz', 'pending']);
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
  return { read, write, subscribe(fn) { listeners.add(fn); }, setAccount(id) { account = id; }, get accountId() { return account; }, get available() { return available; } };
})();


// Сохранение совместимо с предыдущей версией приложения.
const Storage = (() => {
  let available = true;
  let account = null;
  const listeners = new Set();
  const progressKeys = new Set(['known', 'lessons', 'lastQuiz', 'pending']);
  function storageKey(key) {
    return account && progressKeys.has(key) ? `speakly.account.${account}.${key}` : `speakly.${key}`;
  }
  function read(key, fallback) {
    try { const raw = localStorage.getItem(storageKey(key)); return raw === null ? fallback : JSON.parse(raw); }
    catch { available = false; return fallback; }
  }
  function write(key, value) {
    const previous = read(key, null);
    try { localStorage.setItem(storageKey(key), JSON.stringify(value)); }
    catch { available = false; }
    if (!available) document.getElementById('notice').textContent = 'Хранилище браузера недоступно. Прогресс сохранится только до закрытия страницы.';
    for (const listener of listeners) listener(key, value, previous);
  }
  return { read, write, subscribe(fn) { listeners.add(fn); }, setAccount(id) { account = id; }, get accountId() { return account; }, get available() { return available; } };
})();


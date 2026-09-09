// Google OAuth и синхронизация отдельных отметок, без перезаписи всей коллекции.
const Account = (() => {
  const config = window.SPEAKLY_SUPABASE || {};
  const $ = id => document.getElementById(id);
  let client = null, user = null, epoch = 0, applying = false, running = false, again = false;
  let retryTimer = null;
  const tracked = new Set(['known', 'lessons', 'lastQuiz']);
  const pending = () => {
    const value = Storage.read('pending', {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  const status = text => { $('account-status').textContent = text; };
  function render() {
    $('account-name').textContent = user ? (user.email || 'Ваш аккаунт') : 'Гостевой режим';
    $('google-login').hidden = Boolean(user);
    for (const id of ['logout', 'sync-retry', 'import-progress']) $(id).hidden = !user;
  }
  function record(key, value, previous) {
    if (!user || applying || !tracked.has(key)) return;
    const queue = pending();
    if (key === 'lastQuiz') {
      queue['lastQuiz:latest'] = { kind: key, item_id: 'latest', value };
    } else {
      const before = new Set(Array.isArray(previous) ? previous : []);
      const after = new Set(Array.isArray(value) ? value : []);
      for (const id of new Set([...before, ...after])) {
        if (before.has(id) !== after.has(id)) queue[`${key}:${id}`] = { kind: key, item_id: id, value: after.has(id) };
      }
    }
    Storage.write('pending', queue);
    status('Сохраняем прогресс…');
    void sync();
  }
  function applyRows(rows) {
    const words = new Set(), lessons = new Set();
    let quiz = null;
    for (const row of rows) {
      if (row.kind === 'known' && row.value === true) words.add(row.item_id);
      if (row.kind === 'lessons' && row.value === true) lessons.add(row.item_id);
      if (row.kind === 'lastQuiz') quiz = row.value;
    }
    // Локальные несохранённые изменения имеют приоритет, включая снятые отметки.
    for (const row of Object.values(pending())) {
      const target = row.kind === 'known' ? words : row.kind === 'lessons' ? lessons : null;
      if (target) { if (row.value) target.add(row.item_id); else target.delete(row.item_id); }
      else if (row.kind === 'lastQuiz') quiz = row.value;
    }
    applying = true;
    try { Storage.write('known', [...words]); Storage.write('lessons', [...lessons]); Storage.write('lastQuiz', quiz); }
    finally { applying = false; }
    App.reloadProgress();
  }
  async function sync() {
    if (!client || !user) return;
    if (running) { again = true; return; }
    running = true;
    const version = epoch, id = user.id;
    try {
      do {
        again = false;
        const snapshot = pending();
        const entries = Object.values(snapshot);
        if (entries.length) {
          // Пакеты меньше лимита API; ключ записи — пользователь + тип + элемент.
          for (let offset = 0; offset < entries.length; offset += 200) {
            const { error } = await client.from('learning_progress').upsert(entries.slice(offset, offset + 200).map(row => ({ ...row, user_id: id })), { onConflict: 'user_id,kind,item_id' });
            if (error) throw error;
            if (epoch !== version) return;
          }
          const current = pending();
          for (const [key, row] of Object.entries(snapshot)) {
            if (JSON.stringify(current[key]) === JSON.stringify(row)) delete current[key];
          }
          Storage.write('pending', current);
        }
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await client.from('learning_progress').select('kind,item_id,value').eq('user_id', id).order('kind').order('item_id').range(offset, offset + 499);
          if (error) throw error;
          if (epoch !== version) return;
          rows.push(...data);
          if (data.length < 500) break;
        }
        applyRows(rows);
        if (Object.keys(pending()).length) again = true;
      } while (again && version === epoch);
      if (version === epoch) status('Прогресс синхронизирован с аккаунтом.');
    } catch (error) {
      if (version === epoch) {
        clearTimeout(retryTimer);
        if (error?.code === 'PGRST205' || error?.code === '42P01') {
          status('В Supabase не настроена таблица прогресса. Выполните supabase/schema.sql в SQL Editor, затем нажмите «Синхронизировать». Ваши изменения сохранены на устройстве.');
        } else if (error?.code === '42501') {
          status('Нет доступа к таблице прогресса. Проверьте политики доступа из supabase/schema.sql. Ваши изменения сохранены на устройстве.');
        } else {
          status('Не удалось синхронизировать. Изменения сохранены на устройстве; повторим при подключении.');
          retryTimer = setTimeout(() => void sync(), 30000);
        }
      }
    } finally {
      running = false;
      // При смене аккаунта старый запрос не меняет новое локальное хранилище.
      if (version !== epoch && user) void sync();
    }
  }
  async function sessionChanged(session) {
    const next = session?.user || null;
    if (user?.id === next?.id) return;
    epoch++;
    clearTimeout(retryTimer);
    user = next;
    Storage.setAccount(user?.id || null);
    App.reloadProgress(); render();
    if (user) { status('Загружаем ваш прогресс…'); await sync(); }
    else status('Прогресс сохраняется на этом устройстве.');
  }
  async function login() {
    if (!client) { status('Вход ещё не настроен. Гостевой прогресс сохраняется на устройстве.'); return; }
    if (!['http:', 'https:'].includes(location.protocol)) { status('Для входа откройте сайт через http://127.0.0.1:4173/'); return; }
    $('google-login').disabled = true;
    try {
      const response = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.publishableKey } });
      if (!response.ok) throw new Error('Auth settings unavailable');
      const settings = await response.json();
      if (!settings.external?.google) {
        status('Вход через Google ещё не включён в Supabase. Гостевой прогресс продолжает сохраняться.');
        return;
      }
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) throw error;
    } catch { status('Не удалось открыть вход Google. Попробуйте ещё раз в обычном браузере.'); }
    finally { $('google-login').disabled = false; }
  }
  async function logout() {
    if (!client) return;
    $('logout').disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      await sessionChanged(null);
    } catch { status('Не удалось выйти. Попробуйте ещё раз.'); }
    finally { $('logout').disabled = false; }
  }
  function importGuest() {
    if (!user) return;
    for (const key of ['known', 'lessons']) {
      let guest;
      try { guest = JSON.parse(localStorage.getItem(`speakly.${key}`) || '[]'); } catch { guest = []; }
      const current = Storage.read(key, []);
      if (Array.isArray(guest)) Storage.write(key, [...new Set([...(Array.isArray(current) ? current : []), ...guest.filter(id => typeof id === 'string')])]);
    }
    App.reloadProgress();
    void sync();
  }
  async function init() {
    $('google-login').addEventListener('click', login);
    $('logout').addEventListener('click', logout);
    $('sync-retry').addEventListener('click', () => void sync());
    $('import-progress').addEventListener('click', importGuest);
    Storage.subscribe(record);
    render();
    if (!config.url || !config.publishableKey) return;
    try {
      // SDK загружается только для настроенного проекта, гостевой режим независим от сети.
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
      client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
      // Не вызываем методы Supabase внутри блокирующего auth callback.
      client.auth.onAuthStateChange((_event, session) => { setTimeout(() => void sessionChanged(session), 0); });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      await sessionChanged(data.session);
      window.addEventListener('online', () => void sync());
      window.addEventListener('focus', () => void sync());
    } catch { status('Не удалось подключить аккаунт. Гостевой прогресс доступен; обновите страницу для повторного подключения.'); }
  }
  return { init };
})();
void Account.init();

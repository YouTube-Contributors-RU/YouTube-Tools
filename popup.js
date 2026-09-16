//== Copyright (C) 2026, YouTube Contributors and dmitriykotik. ==
// Released under the MIT License.
// 
// This file is part of YT Contributors Tools.
// This software is provided "AS IS", without warranty of any kind,
// express or implied, including but not limited to warranties
// of merchantability, fitness for a particular purpose and
// noninfringement.

let currentApiKey = '';
let currentViewData = null;
let searchPagination = { query: '', nextPageToken: '', prevPageToken: '' };
const memoryCache = new Map();

const YOUTUBE_CATEGORIES = {
  '1': 'Фильмы и анимация',
  '2': 'Авто и транспорт',
  '10': 'Музыка',
  '15': 'Животные',
  '17': 'Спорт',
  '19': 'Путешествия',
  '20': 'Видеоигры',
  '22': 'Люди и блоги',
  '23': 'Юмор',
  '24': 'Развлечения',
  '25': 'Новости и политика',
  '26': 'Хобби и стиль',
  '27': 'Образование',
  '28': 'Наука и технологии',
  '29': 'НКО и активизм'
};

const PATTERNS = {
  channelId: /UC[a-zA-Z0-9_-]{22}/,
  channelHandle: /@([a-zA-Z0-9._-]+)/,
  channelUrl: /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?youtube\.com\/(?:channel\/(UC[a-zA-Z0-9_-]{22})|@([a-zA-Z0-9._-]+))/,
  videoWatchUrl: /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  videoShortUrl: /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  videoIdRaw: /^[a-zA-Z0-9_-]{11}$/
};

const elWelcome = document.getElementById('view-welcome');
const elMain = document.getElementById('view-main');
const elStickyBar = document.getElementById('sticky-bar');
const elContent = document.getElementById('content-container');
const elSearchForm = document.getElementById('search-form');
const elSearchInput = document.getElementById('input-search');
const elModalSettings = document.getElementById('modal-settings');
const elInputKeyInitial = document.getElementById('input-api-key-initial');
const elInputKeyEdit = document.getElementById('input-api-key-edit');
const elToast = document.getElementById('toast-notice');
const elToastText = document.getElementById('toast-text');
const elCacheStatusText = document.getElementById('cache-status-text');
const elStatusDot = document.getElementById('status-dot');

document.addEventListener('DOMContentLoaded', async () => {
  setupRippleEffects();
  setupEventListeners();

  const stored = await getStorage(['yt_api_key', 'pendingTarget']);
  if (stored && stored.yt_api_key) {
    currentApiKey = stored.yt_api_key;
    showMainView();

    if (stored.pendingTarget) {
      const target = stored.pendingTarget;
      await removeStorage(['pendingTarget']);
      if (target.type === 'channel') {
        fetchAndRenderChannel(target.id);
      } else if (target.type === 'video') {
        fetchAndRenderVideo(target.id);
      }
      return;
    }

    await scanActiveTab();
  } else {
    showWelcomeView();
  }
});

function getStorage(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, resolve);
    } else {
      const res = {};
      keys.forEach((k) => {
        const val = localStorage.getItem(k);
        if (val) res[k] = val;
      });
      resolve(res);
    }
  });
}

function setStorage(obj) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj, resolve);
    } else {
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
      resolve();
    }
  });
}

function removeStorage(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(keys, resolve);
    } else {
      keys.forEach((k) => localStorage.removeItem(k));
      resolve();
    }
  });
}

function setupRippleEffects() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.ripple-surface');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}

function setupEventListeners() {
  document.getElementById('btn-save-initial-key')?.addEventListener('click', async () => {
    const key = elInputKeyInitial.value.trim();
    if (!key) {
      showToast('Введите корректный API ключ');
      return;
    }
    await setStorage({ yt_api_key: key });
    currentApiKey = key;
    showToast('Ключ успешно сохранен');
    showMainView();
    await scanActiveTab();
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    elInputKeyEdit.value = currentApiKey;
    elModalSettings.classList.add('open');
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    elModalSettings.classList.remove('open');
  });

  document.getElementById('btn-cancel-settings')?.addEventListener('click', () => {
    elModalSettings.classList.remove('open');
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const key = elInputKeyEdit.value.trim();
    if (!key) {
      showToast('Введите API ключ');
      return;
    }
    await setStorage({ yt_api_key: key });
    currentApiKey = key;
    memoryCache.clear();
    elModalSettings.classList.remove('open');
    showToast('Ключ обновлен');
  });

  document.getElementById('btn-reset-key')?.addEventListener('click', async () => {
    if (confirm('Сбросить сохраненный API ключ и очистить кэш?')) {
      await removeStorage(['yt_api_key', 'pendingTarget']);
      currentApiKey = '';
      memoryCache.clear();
      currentViewData = null;
      elModalSettings.classList.remove('open');
      showWelcomeView();
      showToast('Ключ удален');
    }
  });

  document.getElementById('btn-close-window')?.addEventListener('click', () => {
    window.close();
  });

  elSearchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = elSearchInput.value.trim();
    if (query) {
      handleSearch(query);
    }
  });

  document.querySelectorAll('.hint-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      elSearchInput.value = q;
      handleSearch(q);
    });
  });

  document.getElementById('btn-refresh-cache')?.addEventListener('click', () => {
    if (!currentViewData) {
      showToast('Нет активного объекта для обновления');
      return;
    }
    if (currentViewData.type === 'channel') {
      memoryCache.delete(`channel:${currentViewData.id}`);
      fetchAndRenderChannel(currentViewData.id, true);
    } else if (currentViewData.type === 'video') {
      memoryCache.delete(`video:${currentViewData.id}`);
      fetchAndRenderVideo(currentViewData.id, true);
    } else if (currentViewData.type === 'search') {
      memoryCache.delete(`search:${currentViewData.query}`);
      handleSearch(currentViewData.query, '', true);
    }
    showToast('Запрос новых данных...');
  });
}

function showWelcomeView() {
  elWelcome.style.display = 'flex';
  elMain.style.display = 'none';
  elStickyBar.style.display = 'none';
}

function showMainView() {
  elWelcome.style.display = 'none';
  elMain.style.display = 'block';
  elStickyBar.style.display = 'flex';
}

async function scanActiveTab() {
  showLoading('Сканирование активной страницы...');
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
      renderEmptySearchState();
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url?.startsWith('chrome://')) {
      renderEmptySearchState();
      return;
    }

    if (tab.url.includes('youtube.com') || tab.url.includes('youtu.be')) {
      elSearchInput.value = tab.url;
      return handleSearch(tab.url);
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const text = document.body ? document.body.innerText : '';
        const found = [];
        const seen = new Set();

        const ucMatches = text.match(/\bUC[a-zA-Z0-9_-]{22}\b/g) || [];
        ucMatches.forEach((m) => {
          if (!seen.has(m)) {
            seen.add(m);
            found.push({ type: 'channel', id: m, raw: m });
          }
        });

        const handleMatches = text.match(/(?:^|\s)@([a-zA-Z0-9._-]{3,30})\b/g) || [];
        handleMatches.forEach((m) => {
          const h = m.trim();
          if (!seen.has(h)) {
            seen.add(h);
            found.push({ type: 'handle', id: h, raw: h });
          }
        });

        const videoMatches = text.match(/(?:youtu\.be\/|watch\?v=)([a-zA-Z0-9_-]{11})/g) || [];
        videoMatches.forEach((m) => {
          const vidId = m.replace('youtu.be/', '').replace('watch?v=', '');
          if (!seen.has(vidId)) {
            seen.add(vidId);
            found.push({ type: 'video', id: vidId, raw: m });
          }
        });

        const pageUrl = window.location.href;
        if (pageUrl.includes('/watch?v=')) {
          const v = new URL(pageUrl).searchParams.get('v');
          if (v && !seen.has(v)) {
            seen.add(v);
            found.unshift({ type: 'video', id: v, raw: pageUrl });
          }
        } else if (pageUrl.includes('/channel/UC')) {
          const m = pageUrl.match(/UC[a-zA-Z0-9_-]{22}/);
          if (m && !seen.has(m[0])) {
            seen.add(m[0]);
            found.unshift({ type: 'channel', id: m[0], raw: pageUrl });
          }
        } else if (pageUrl.includes('/@')) {
          const m = pageUrl.match(/@([a-zA-Z0-9._-]+)/);
          if (m && !seen.has(m[0])) {
            seen.add(m[0]);
            found.unshift({ type: 'handle', id: m[0], raw: pageUrl });
          }
        }

        return found.slice(0, 10);
      }
    });

    const patterns = results?.[0]?.result || [];

    if (patterns.length === 1) {
      const item = patterns[0];
      if (item.type === 'channel') {
        await fetchAndRenderChannel(item.id);
      } else if (item.type === 'handle') {
        await fetchAndRenderChannelByHandle(item.id);
      } else if (item.type === 'video') {
        await fetchAndRenderVideo(item.id);
      }
    } else if (patterns.length > 1) {
      renderDiscoveredPatterns(patterns);
    } else {
      renderEmptySearchState();
    }
  } catch (err) {
    console.warn('Scan tab error:', err);
    renderEmptySearchState();
  }
}

function renderDiscoveredPatterns(patterns) {
  currentViewData = null;
  updateCacheBadge(false);

  let html = `
    <div class="results-header">
      <span class="results-title">Обнаружено на странице</span>
      <span class="results-count">${patterns.length} объектов</span>
    </div>
    <div class="cards-list">
  `;

  patterns.forEach((p, idx) => {
    const isChannel = p.type === 'channel' || p.type === 'handle';
    html += `
      <div class="yt-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: ${isChannel ? 'rgba(56, 189, 248, 0.15)' : 'rgba(244, 63, 94, 0.15)'}; color: ${isChannel ? '#38bdf8' : '#f43f5e'}; font-weight: 500;">
              ${isChannel ? 'Канал' : 'Видео'}
            </span>
            <span style="font-size: 12px; font-weight: 500; font-family: 'JetBrains Mono', monospace; color: #fff;">
              ${escapeHtml(p.id)}
            </span>
          </div>
          <button class="md-button tonal ripple-surface btn-select-discovered" data-type="${p.type}" data-id="${p.id}" style="padding: 4px 10px; font-size: 11px;">
            Выбрать
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  elContent.innerHTML = html;

  elContent.querySelectorAll('.btn-select-discovered').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      const id = btn.getAttribute('data-id');
      if (type === 'channel') {
        fetchAndRenderChannel(id);
      } else if (type === 'handle') {
        fetchAndRenderChannelByHandle(id);
      } else {
        fetchAndRenderVideo(id);
      }
    });
  });
}

function getRandomSearchState(){
  let min = 1;
  let max = 3;
  let randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
  let hint = `Вставьте в поле выше ссылку на контент (канал или видеоролик) или введите ключевые слова, чтобы начать поиск по ним.`;

  if (randomNum === 1) {
    return `${hint} <br> Что-ж, может быть начнём? :3`;
  } else if (randomNum === 2) {
    return `${hint} <br> Думаю, стоит начать :)`;
  } else if (randomNum === 3) {
    return `${hint} <br> Как на счёт печенек? ;)`;
  }
}

function renderEmptySearchState() {
  currentViewData = null;
  updateCacheBadge(false);

  elContent.innerHTML = `
    <div style="text-align: center; padding: 32px 16px; color: var(--md-sys-color-on-surface-variant);">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px auto; opacity: 0.5;">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <div style="font-size: 14px; font-weight: 500; color: #fff; margin-bottom: 4px;">Готов к поиску</div>
      <p style="font-size: 12px; line-height: 1.4; max-width: 280px; margin: 0 auto;">
        ${getRandomSearchState()}
      </p>
    </div>
  `;
}

async function handleSearch(query, pageToken = '', forceRefresh = false) {
  query = query.trim();
  if (!query) return;

  const channelUrlMatch = query.match(PATTERNS.channelUrl);
  if (channelUrlMatch) {
    if (channelUrlMatch[1]) {
      return fetchAndRenderChannel(channelUrlMatch[1], forceRefresh);
    }
    if (channelUrlMatch[2]) {
      return fetchAndRenderChannelByHandle('@' + channelUrlMatch[2], forceRefresh);
    }
  }

  if (PATTERNS.channelId.test(query)) {
    const ucId = query.match(PATTERNS.channelId)[0];
    return fetchAndRenderChannel(ucId, forceRefresh);
  }

  if (query.startsWith('@')) {
    return fetchAndRenderChannelByHandle(query, forceRefresh);
  }

  const watchMatch = query.match(PATTERNS.videoWatchUrl);
  if (watchMatch) {
    return fetchAndRenderVideo(watchMatch[1], forceRefresh);
  }

  const shortMatch = query.match(PATTERNS.videoShortUrl);
  if (shortMatch) {
    return fetchAndRenderVideo(shortMatch[1], forceRefresh);
  }

  if (PATTERNS.videoIdRaw.test(query) && !query.startsWith('UC')) {
    return fetchAndRenderVideo(query, forceRefresh);
  }

  await performKeywordSearch(query, pageToken, forceRefresh);
}

async function callYouTubeApi(endpoint, params = {}, cacheKey = null, forceRefresh = false) {
  if (!currentApiKey) {
    throw new Error('API ключ не установлен. Перейдите в настройки.');
  }

  if (!forceRefresh && cacheKey && memoryCache.has(cacheKey)) {
    updateCacheBadge(true);
    return memoryCache.get(cacheKey);
  }

  const queryParams = new URLSearchParams({
    key: currentApiKey,
    ...params
  });

  const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${queryParams.toString()}`;

  let response;
  try {
    response = await fetch(url);
  } catch (netErr) {
    throw new Error('Ошибка сети: не удалось связаться с серверами Google.');
  }

  const data = await response.json();

  if (!response.ok) {
    const errObj = data.error || {};
    const reason = errObj.errors?.[0]?.reason || '';
    const message = errObj.message || 'Ошибка API YouTube';

    if (reason === 'quotaExceeded') {
      throw new Error('Исчерпана суточная квота YouTube Data API (10 000 ед.). Попробуйте позже или используйте другой ключ.');
    } else if (reason === 'keyInvalid' || response.status === 400 || response.status === 403) {
      throw new Error(`Ошибка авторизации API: ${message}. Проверьте правильность ключа в настройках.`);
    } else {
      throw new Error(`Ошибка YouTube API (${response.status}): ${message}`);
    }
  }

  if (cacheKey) {
    memoryCache.set(cacheKey, data);
  }
  updateCacheBadge(false);
  return data;
}

function updateCacheBadge(isCached) {
  const time = new Date().toLocaleTimeString('ru-RU');

  if (isCached) {
    elStatusDot.className = 'status-dot cached';
    elCacheStatusText.textContent = 'Данные из кэша сессии';
  } else {
    elStatusDot.className = 'status-dot';
    elStatusDot.style.backgroundColor = '#22c55e';
    elCacheStatusText.textContent = `Данные обновлены (${time})`;
  }
}

async function performKeywordSearch(query, pageToken = '', forceRefresh = false) {
  showLoading(`Поиск: "${query}"...`);
  currentViewData = { type: 'search', query, pageToken };

  try {
    const cacheKey = `search:${query}:${pageToken}`;
    const params = {
      part: 'snippet',
      q: query,
      maxResults: 10,
      type: 'video,channel'
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await callYouTubeApi('search', params, cacheKey, forceRefresh);
    const items = data.items || [];

    if (items.length === 0) {
      elContent.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--md-sys-color-on-surface-variant);">
          <div style="font-size: 14px; font-weight: 500; color: #fff; margin-bottom: 4px;">Ничего не найдено</div>
          <p style="font-size: 12px;">По запросу "${escapeHtml(query)}" результаты отсутствуют.</p>
        </div>
      `;
      return;
    }

    renderSearchResults(items, query, data.prevPageToken, data.nextPageToken, data.pageInfo?.totalResults);
  } catch (err) {
    showError(err.message);
  }
}

function renderSearchResults(items, query, prevPageToken, nextPageToken, total) {
  let html = `
    <div class="results-header">
      <span class="results-title">Результаты для "${escapeHtml(query)}"</span>
      <span class="results-count">${total ? `~${Number(total).toLocaleString('ru-RU')} находок` : `${items.length} элементов`}</span>
    </div>
    <div class="cards-list">
  `;

  items.forEach((item) => {
    const idObj = item.id || {};
    const snip = item.snippet || {};

    if (idObj.kind === 'youtube#channel') {
      const channelId = idObj.channelId;
      const avatar = snip.thumbnails?.default?.url || snip.thumbnails?.medium?.url || '';
      html += `
        <div class="yt-card">
          <div class="channel-card-body">
            <img src="${avatar}" alt="Avatar" class="channel-avatar-round" onerror="this.src='logo.png'">
            <div class="channel-info-col">
              <div class="channel-title-row">
                <span>${escapeHtml(snip.title)}</span>
                <span class="brand-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">Канал</span>
              </div>
              <div class="id-badge-row">
                <span>ID: ${escapeHtml(channelId)}</span>
                <button class="copy-mini-btn" data-copy="${channelId}" title="Скопировать ID">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>
            <button class="md-button tonal ripple-surface btn-open-channel" data-id="${channelId}">
              Выбрать
            </button>
          </div>
        </div>
      `;
    } else if (idObj.kind === 'youtube#video') {
      const videoId = idObj.videoId;
      const thumb = snip.thumbnails?.medium?.url || snip.thumbnails?.default?.url || '';
      html += `
        <div class="yt-card">
          <div class="video-card-top">
            <div class="video-thumb-box">
              <img src="${thumb}" alt="Thumbnail" class="video-thumb-img" onerror="this.src='logo.png'">
            </div>
            <div class="video-meta-col">
              <div class="video-title-text" title="${escapeHtml(snip.title)}">${escapeHtml(snip.title)}</div>
              <div class="video-author-row btn-open-channel" data-id="${snip.channelId}" title="Открыть канал автора">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>${escapeHtml(snip.channelTitle)}</span>
              </div>
              <div class="id-badge-row" style="margin-top: 2px;">
                <span>ID: ${escapeHtml(videoId)}</span>
                <button class="copy-mini-btn" data-copy="${videoId}" title="Скопировать ID">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div class="card-footer-row">
            <span style="font-size: 11px; color: var(--md-sys-color-on-surface-variant);">
              ${formatPublishDate(snip.publishedAt)}
            </span>
            <button class="md-button tonal ripple-surface btn-open-video" data-id="${videoId}" style="padding: 4px 10px; font-size: 11px;">
              Выбрать видео
            </button>
          </div>
        </div>
      `;
    }
  });

  html += `</div>`;

  if (prevPageToken || nextPageToken) {
    html += `
      <div class="pagination-row">
        <button class="md-button tonal ripple-surface" id="btn-prev-page" ${!prevPageToken ? 'disabled style="opacity: 0.4;"' : ''}>
          &larr; Назад
        </button>
        <span style="font-size: 11px; color: var(--md-sys-color-on-surface-variant);">Страница</span>
        <button class="md-button tonal ripple-surface" id="btn-next-page" ${!nextPageToken ? 'disabled style="opacity: 0.4;"' : ''}>
          Вперед &rarr;
        </button>
      </div>
    `;
  }

  elContent.innerHTML = html;

  elContent.querySelectorAll('.btn-open-channel').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      fetchAndRenderChannel(btn.getAttribute('data-id'));
    });
  });

  elContent.querySelectorAll('.btn-open-video').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      fetchAndRenderVideo(btn.getAttribute('data-id'));
    });
  });

  elContent.querySelectorAll('.copy-mini-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.getAttribute('data-copy'));
    });
  });

  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (prevPageToken) handleSearch(query, prevPageToken);
  });

  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    if (nextPageToken) handleSearch(query, nextPageToken);
  });
}

async function fetchAndRenderChannelByHandle(handle, forceRefresh = false) {
  const cleanHandle = handle.replace(/^@/, '');
  showLoading(`Загрузка канала @${cleanHandle}...`);
  try {
    const cacheKey = `handle:${cleanHandle}`;
    const data = await callYouTubeApi('channels', {
      part: 'snippet,statistics,brandingSettings,contentDetails,status,topicDetails',
      forHandle: cleanHandle
    }, cacheKey, forceRefresh);

    if (!data.items || data.items.length === 0) {
      showError(`Канал с псевдонимом @${cleanHandle} не найден.`);
      return;
    }
    renderChannelDetails(data.items[0]);
  } catch (err) {
    showError(err.message);
  }
}

async function fetchAndRenderChannel(channelId, forceRefresh = false) {
  showLoading(`Загрузка канала ${channelId}...`);
  currentViewData = { type: 'channel', id: channelId };

  try {
    const cacheKey = `channel:${channelId}`;
    const data = await callYouTubeApi('channels', {
      part: 'snippet,statistics,brandingSettings,contentDetails,status,topicDetails',
      id: channelId
    }, cacheKey, forceRefresh);

    if (!data.items || data.items.length === 0) {
      showError(`Канал с идентификатором ${channelId} не найден.`);
      return;
    }

    let playlists = [];
    try {
      const plData = await callYouTubeApi('playlists', {
        part: 'snippet,contentDetails',
        channelId: channelId,
        maxResults: 6
      }, `playlists:${channelId}`, forceRefresh);
      playlists = plData.items || [];
    } catch (plErr) {
      console.warn('Playlists fetch warning:', plErr);
    }

    renderChannelDetails(data.items[0], playlists);
  } catch (err) {
    showError(err.message);
  }
}

function renderChannelDetails(channel, playlists = []) {
  const snip = channel.snippet || {};
  const stats = channel.statistics || {};
  const branding = channel.brandingSettings || {};
  const channelSettings = branding.channel || {};
  const imageSettings = branding.image || {};
  const channelId = channel.id;

  const customUrl = snip.customUrl || '';
  const channelHandle = customUrl.startsWith('@') ? customUrl : customUrl ? '@' + customUrl : '';

  const avatarDefault = snip.thumbnails?.default?.url || '';
  const avatarMedium = snip.thumbnails?.medium?.url || '';
  const avatarHigh = snip.thumbnails?.high?.url || '';
  const bannerUrl = imageSettings.bannerExternalUrl ? `${imageSettings.bannerExternalUrl}=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj` : '';

  const hiddenSubs = stats.hiddenSubscriberCount;
  const subCount = Number(stats.subscriberCount || 0);
  const isLowSubs = !hiddenSubs && subCount <= 50;

  const publishedDateFormatted = formatFullRussianDate(snip.publishedAt);

  const isVerified = channel.status?.isLinked || false;

  let html = `
    <div class="detail-view">
      <!-- Back Navigation -->
      <div class="detail-top-nav">
        <button class="back-btn" id="btn-back-to-results">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Назад к поиску
        </button>
        <span class="brand-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">Детали канала</span>
      </div>

      <div class="channel-banner-box">
        ${bannerUrl ? `<img src="${bannerUrl}" alt="Banner" class="channel-banner-img">` : `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--md-sys-color-on-surface-variant); font-size: 11px;">
            Баннер отсутствует (заглушка)
          </div>
        `}
      </div>

      <div class="channel-detail-header-card">
        <div class="channel-detail-avatar-row">
          <img src="${avatarHigh || avatarMedium || avatarDefault}" alt="Avatar" class="channel-avatar-large" onerror="this.src='logo.png'">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 700; color: #fff;">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(snip.title)}</span>
              
            </div>

            <div style="font-size: 12px; color: var(--md-sys-color-secondary); font-weight: 500;">
              ${channelHandle ? escapeHtml(channelHandle) : '—'}
            </div>

            ${hiddenSubs ? `
              <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant);">Подписчики: Скрыты</div>
            ` : isLowSubs ? `
              <div class="subscriber-warning-badge" title="Прямые трансляции могут быть недоступны.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Подписчики: ${subCount} (&le; 50)</span>
              </div>
            ` : `
              <div style="font-size: 12px; color: #fff; font-weight: 500; margin-top: 2px;">
                Подписчиков: ${subCount.toLocaleString('ru-RU')}
              </div>
            `}
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <a href="https://www.youtube.com/channel/${channelId}" target="_blank" rel="noopener noreferrer" class="md-button primary ripple-surface" style="flex: 1; text-decoration: none; font-size: 11px; padding: 6px 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Открыть в YouTube
          </a>
          <button class="md-button tonal ripple-surface" id="btn-copy-channel-link" style="flex: 1; font-size: 11px; padding: 6px 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Скопировать ссылку
          </button>
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-title">Идентификаторы канала</div>
        <div class="info-grid">
          <div class="info-item full-width">
            <span class="info-label">Идентификатор канала</span>
            <div class="info-val">
              <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px;">${channelId}</span>
              <button class="copy-mini-btn" data-copy="${channelId}" title="Скопировать идентификатор канала">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>

          ${channelHandle ? `
            <div class="info-item full-width">
              <span class="info-label">Псевдоним</span>
              <div class="info-val">
                <span style="color: var(--md-sys-color-secondary); font-family: 'JetBrains Mono', monospace; font-size: 11px;">${escapeHtml(channelHandle)}</span>
                <button class="copy-mini-btn" data-copy="${channelHandle}" title="Скопировать псевдоним">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>
          ` : ''}

          <div class="info-item">
            <span class="info-label">Страна</span>
            <span class="info-val">${snip.country || 'Не указана'}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Всего просмотров</span>
            <span class="info-val">${Number(stats.viewCount || 0).toLocaleString('ru-RU')}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Загружено видео</span>
            <span class="info-val">${Number(stats.videoCount || 0).toLocaleString('ru-RU')}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Дата создания</span>
            <span class="info-val" style="font-size: 11px;">${publishedDateFormatted}</span>
          </div>
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-title">Загрузка аватарки и баннера</div>
        <div class="downloads-list">
          ${avatarHigh ? `<a href="${avatarHigh}" target="_blank" download="avatar_high.jpg" class="download-link-btn">Аватар (High)</a>` : ''}
          ${avatarMedium ? `<a href="${avatarMedium}" target="_blank" download="avatar_medium.jpg" class="download-link-btn">Аватар (Med)</a>` : ''}
          ${avatarDefault ? `<a href="${avatarDefault}" target="_blank" download="avatar_def.jpg" class="download-link-btn">Аватар (Def)</a>` : ''}
          ${imageSettings.bannerExternalUrl ? `
            <a href="${imageSettings.bannerExternalUrl}=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" target="_blank" download="banner_tv.jpg" class="download-link-btn">Баннер TV (2120px)</a>
            <a href="${imageSettings.bannerExternalUrl}=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" target="_blank" download="banner_desktop.jpg" class="download-link-btn">Баннер PC (1060px)</a>
            <a href="${imageSettings.bannerExternalUrl}=w640-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" target="_blank" download="banner_mobile.jpg" class="download-link-btn">Баннер Mob (640px)</a>
          ` : `<span style="font-size: 11px; color: var(--md-sys-color-on-surface-variant);">Баннер не загружен</span>`}
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-title">Описание и ключевые слова</div>
        <div style="font-size: 12px; color: #d4d4d4; line-height: 1.4; max-height: 120px; overflow-y: auto; white-space: pre-wrap; background: var(--md-sys-color-surface-container-high); padding: 8px; border-radius: 4px;">
          ${snip.description ? escapeHtml(snip.description) : '<span style="color: var(--md-sys-color-on-surface-variant);">Описание отсутствует</span>'}
        </div>

        ${channelSettings.keywords ? `
          <div style="margin-top: 6px;">
            <span class="info-label" style="margin-bottom: 4px; display: block;">Ключевые слова канала</span>
            <div class="chips-row">
              ${channelSettings.keywords.split(' ').filter(Boolean).map((kw) => `<span class="md-chip">${escapeHtml(kw.replace(/"/g, ''))}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      ${channelSettings.unsubscribedTrailer ? `
        <div class="md-card">
          <div class="md-card-title">Трейлер канала</div>
          <div class="info-item full-width">
            <span class="info-label">ID трейлера</span>
            <div class="info-val">
              <span>${channelSettings.unsubscribedTrailer}</span>
              <button class="md-button tonal ripple-surface btn-open-video" data-id="${channelSettings.unsubscribedTrailer}" style="padding: 2px 8px; font-size: 10px;">
                Открыть видео
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="md-card">
        <div class="md-card-title">Плейлисты (${playlists.length})</div>
        ${playlists.length === 0 ? `
          <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant);">Плейлисты не найдены или скрыты</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${playlists.map((pl) => {
              const plThumb = pl.snippet?.thumbnails?.default?.url || 'logo.png';
              const count = pl.contentDetails?.itemCount || 0;
              return `
                <div class="playlist-item">
                  <img src="${plThumb}" alt="Playlist" class="playlist-thumb">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; font-weight: 500; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${escapeHtml(pl.snippet?.title || 'Без названия')}
                    </div>
                    <div style="font-size: 10px; color: var(--md-sys-color-on-surface-variant);">
                      Видео: ${count} &bull; <a href="https://www.youtube.com/playlist?list=${pl.id}" target="_blank" rel="noopener noreferrer" style="color: var(--md-sys-color-secondary);">Открыть в YT</a>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  elContent.innerHTML = html;

  document.getElementById('btn-back-to-results')?.addEventListener('click', () => {
    if (searchPagination.query) {
      handleSearch(searchPagination.query);
    } else {
      renderEmptySearchState();
    }
  });

  document.getElementById('btn-copy-channel-link')?.addEventListener('click', () => {
    copyToClipboard(`https://www.youtube.com/channel/${channelId}`, 'Ссылка на канал скопирована');
  });

  elContent.querySelectorAll('.copy-mini-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.getAttribute('data-copy'));
    });
  });

  elContent.querySelectorAll('.btn-open-video').forEach((btn) => {
    btn.addEventListener('click', () => {
      fetchAndRenderVideo(btn.getAttribute('data-id'));
    });
  });
}

async function fetchAndRenderVideo(videoId, forceRefresh = false) {
  showLoading(`Загрузка видео ${videoId}...`);
  currentViewData = { type: 'video', id: videoId };

  try {
    const cacheKey = `video:${videoId}`;
    const data = await callYouTubeApi('videos', {
      part: 'snippet,statistics,contentDetails,status,recordingDetails,liveStreamingDetails,localizations',
      id: videoId
    }, cacheKey, forceRefresh);

    if (!data.items || data.items.length === 0) {
      showError(`Видео с ID ${videoId} не найдено.`);
      return;
    }

    const video = data.items[0];
    const channelId = video.snippet?.channelId;

    let channelData = null;
    if (channelId) {
      try {
        const cData = await callYouTubeApi('channels', {
          part: 'snippet,statistics',
          id: channelId
        }, `channel_author:${channelId}`, forceRefresh);
        channelData = cData.items?.[0] || null;
      } catch (cErr) {
        console.warn('Channel author fetch warning:', cErr);
      }
    }

    let topComment = null;
    try {
      const commData = await callYouTubeApi('commentThreads', {
        part: 'snippet',
        videoId: videoId,
        maxResults: 1,
        order: 'relevance'
      }, `comments:${videoId}`, forceRefresh);
      topComment = commData.items?.[0]?.snippet?.topLevelComment?.snippet || null;
    } catch (commErr) {
      console.warn('Comments fetch warning (comments may be disabled):', commErr);
    }

    renderVideoDetails(video, channelData, topComment);
  } catch (err) {
    showError(err.message);
  }
}

function renderVideoDetails(video, channelData, topComment) {
  const snip = video.snippet || {};
  const stats = video.statistics || {};
  const content = video.contentDetails || {};
  const status = video.status || {};
  const recording = video.recordingDetails || {};
  const live = video.liveStreamingDetails || null;
  const localizations = video.localizations || {};
  const videoId = video.id;

  const categoryName = YOUTUBE_CATEGORIES[snip.categoryId] || `Категория ID: ${snip.categoryId || '—'}`;

  const authorAvatar = channelData?.snippet?.thumbnails?.default?.url || snip.thumbnails?.default?.url || '';
  const authorTitle = snip.channelTitle || 'Автор';
  const authorSubCount = channelData?.statistics?.hiddenSubscriberCount ? 'Подписчики скрыты' : channelData?.statistics?.subscriberCount ? `${Number(channelData.statistics.subscriberCount).toLocaleString('ru-RU')} подписчиков` : '';

  const thumbs = snip.thumbnails || {};
  const thumbResolutions = [
    { name: 'MaxRes (1280x720)', url: thumbs.maxres?.url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` },
    { name: 'Standard (640x480)', url: thumbs.standard?.url || `https://i.ytimg.com/vi/${videoId}/sddefault.jpg` },
    { name: 'High (480x360)', url: thumbs.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
    { name: 'Medium (320x180)', url: thumbs.medium?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` },
    { name: 'Default (120x90)', url: thumbs.default?.url || `https://i.ytimg.com/vi/${videoId}/default.jpg` }
  ];

  const durationFormatted = formatDuration(content.duration);

  const embedCode = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" title="${escapeHtml(snip.title || '')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;

  const langKeys = Object.keys(localizations);

  let html = `
    <div class="detail-view">
      <!-- Back Navigation -->
      <div class="detail-top-nav">
        <button class="back-btn" id="btn-back-to-results">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Назад к поиску
        </button>
        <span class="brand-badge" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">Детали видео</span>
      </div>

      <!-- Main Video Card -->
      <div class="md-card">
        <div style="position: relative; width: 100%; border-radius: 6px; overflow: hidden; background: #000;">
          <img src="${thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url}" alt="Thumbnail" style="width: 100%; height: auto; display: block;">
          <div class="video-duration-badge" style="font-size: 11px; padding: 2px 6px;">${durationFormatted}</div>
        </div>

        <div style="font-size: 15px; font-weight: 600; color: #fff; line-height: 1.3;">
          ${escapeHtml(snip.title)}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--md-sys-color-on-surface-variant);">
          <span>${formatFullRussianDate(snip.publishedAt)}</span>
        </div>

        <div class="video-author-row" id="btn-open-author-channel" style="background: var(--md-sys-color-surface-container-high); padding: 8px 10px; border-radius: 6px; cursor: pointer;" title="Открыть детальную информацию о канале автора">
          <img src="${authorAvatar}" alt="Channel Avatar" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 4px;">
              <span>${escapeHtml(authorTitle)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
            <div style="font-size: 11px; color: var(--md-sys-color-on-surface-variant);">${authorSubCount}</div>
          </div>
          <span style="font-size: 11px; color: var(--md-sys-color-secondary); font-weight: 500;">К каналу</span>
        </div>

        <div style="display: flex; gap: 8px;">
          <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener noreferrer" class="md-button primary ripple-surface" style="flex: 1; text-decoration: none; font-size: 11px; padding: 6px 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Смотреть на YT
          </a>
          <button class="md-button tonal ripple-surface" id="btn-copy-video-link" style="flex: 1; font-size: 11px; padding: 6px 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Скопировать ссылку
          </button>
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-title">Статистика и параметры</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Просмотры</span>
            <span class="info-val">${Number(stats.viewCount || 0).toLocaleString('ru-RU')}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Лайки</span>
            <span class="info-val">${Number(stats.likeCount || 0).toLocaleString('ru-RU')}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Комментарии</span>
            <span class="info-val">${Number(stats.commentCount || 0).toLocaleString('ru-RU')}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Качество</span>
            <span class="info-val">${content.definition?.toUpperCase() || 'HD'} (${content.dimension || '2D'})</span>
          </div>

          <div class="info-item">
            <span class="info-label">Субтитры</span>
            <span class="info-val">${content.caption === 'true' ? 'В наличии' : 'Отсутствуют'}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Проекция</span>
            <span class="info-val">${content.projection || 'rectangular'}</span>
          </div>

          <div class="info-item full-width">
            <span class="info-label">Категория</span>
            <span class="info-val">${categoryName}</span>
          </div>
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-title">Статус, лицензия и Content ID</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Доступ</span>
            <span class="info-val">
              ${status.privacyStatus === 'public' ? 'Публичное' : status.privacyStatus === 'unlisted' ? 'По ссылке' : 'Приватное'}
            </span>
          </div>

          <div class="info-item">
            <span class="info-label">Встраивание</span>
            <span class="info-val">${status.embeddable ? 'Разрешено' : 'Запрещено'}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Лицензия</span>
            <span class="info-val">${status.license === 'youtube' ? 'Стандартная YouTube' : status.license || 'Creative Commons'}</span>
          </div>

          <div class="info-item">
            <span class="info-label">Для детей</span>
            <span class="info-val">${status.madeForKids ? 'Да' : 'Нет'}</span>
          </div>

          <div class="info-item full-width">
            <span class="info-label">Защищенный контент</span>
            <span class="info-val">${content.licensedContent ? 'Защищено лицензией правообладателя' : 'Лицензионные метки отсутствуют'}</span>
          </div>
        </div>
      </div>

      ${live ? `
        <div class="md-card">
          <div class="md-card-title">Прямая трансляция</div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Статус стрима</span>
              <span class="info-val" style="color: #f43f5e; font-weight: bold;">
                ${snip.liveBroadcastContent === 'live' ? '🔴 В прямом эфире' : snip.liveBroadcastContent === 'upcoming' ? 'Запланирован' : 'Завершен'}
              </span>
            </div>
            ${live.concurrentViewers ? `
              <div class="info-item">
                <span class="info-label">Зрителей онлайн</span>
                <span class="info-val">${Number(live.concurrentViewers).toLocaleString('ru-RU')}</span>
              </div>
            ` : ''}
            ${live.actualStartTime ? `
              <div class="info-item full-width">
                <span class="info-label">Фактический старт</span>
                <span class="info-val" style="font-size: 11px;">${formatFullRussianDate(live.actualStartTime)}</span>
              </div>
            ` : live.scheduledStartTime ? `
              <div class="info-item full-width">
                <span class="info-label">Запланированный старт</span>
                <span class="info-val" style="font-size: 11px;">${formatFullRussianDate(live.scheduledStartTime)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      ${recording.recordingDate || recording.locationDescription ? `
        <div class="md-card">
          <div class="md-card-title">Данные о съемке</div>
          <div class="info-grid">
            ${recording.recordingDate ? `
              <div class="info-item">
                <span class="info-label">Дата съемки</span>
                <span class="info-val">${formatFullRussianDate(recording.recordingDate)}</span>
              </div>
            ` : ''}
            ${recording.locationDescription ? `
              <div class="info-item">
                <span class="info-label">Место</span>
                <span class="info-val">${escapeHtml(recording.locationDescription)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <div class="md-card">
        <div class="md-card-title">Превью</div>
        <div class="downloads-list">
          ${thumbResolutions.map((t) => `
            <a href="${t.url}" target="_blank" download="thumb_${videoId}.jpg" class="download-link-btn">
              ${t.name}
            </a>
          `).join('')}
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-title" style="justify-content: space-between;">
          <span>HTML-код для встраивания (iframe)</span>
          <button class="md-button tonal ripple-surface" id="btn-copy-embed" style="padding: 2px 8px; font-size: 10px;">
            Скопировать HTML
          </button>
        </div>
        <div class="code-box">${escapeHtml(embedCode)}</div>
      </div>

      <div class="md-card">
        <div class="md-card-title" style="justify-content: space-between;">
          <span>Теги видео (${snip.tags ? snip.tags.length : 0})</span>
          ${snip.tags ? `
            <button class="md-button tonal ripple-surface" id="btn-copy-tags" style="padding: 2px 8px; font-size: 10px;">
              Скопировать все
            </button>
          ` : ''}
        </div>
        ${snip.tags && snip.tags.length > 0 ? `
          <div class="chips-row">
            ${snip.tags.map((t) => `<span class="md-chip">${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : `
          <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant);">Теги не указаны</div>
        `}
      </div>

      ${langKeys.length > 0 ? `
        <div class="md-card">
          <div class="md-card-title">Переводы автора (${langKeys.length})</div>
          <div class="chips-row">
            ${langKeys.map((k) => `<span class="md-chip" style="color: var(--md-sys-color-secondary);">${escapeHtml(k)}: ${escapeHtml(localizations[k]?.title || '')}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="md-card">
        <div class="md-card-title">Закрепленный/популярный комментарий</div>
        ${topComment ? `
          <div class="comment-card">
            <div class="comment-header">
              <div>
                <div class="comment-author-link" data-channel-id="${topComment.authorChannelId.value}" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <img src="${topComment.authorProfileImageUrl}" alt="Avatar" style="width: 24px; height: 24px; border-radius: 50%;">
                  <span style="font-weight: 500; font-size: 13px; color: #fff;">${escapeHtml(topComment.authorDisplayName)}</span>
                </div>
                <div style="font-size: 10px; color: var(--md-sys-color-on-surface-variant);">${formatFullRussianDate(topComment.publishedAt)}</div>
              </div>
            </div>
            <div class="comment-text">${escapeHtml(topComment.textDisplay || topComment.textOriginal || '')}</div>
            <div class="comment-stats">
              <span>👍 ${Number(topComment.likeCount || 0).toLocaleString('ru-RU')}</span>
              ${topComment.viewerRating === 'like' || topComment.hasHeart ? `
                <span class="heart-badge">❤️</span>
              ` : ''}
            </div>
          </div>
        ` : `
          <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant);">Комментарии отключены или отсутствуют</div>
        `}
      </div>
    </div>
  `;

  elContent.innerHTML = html;

  document.getElementById('btn-back-to-results')?.addEventListener('click', () => {
    if (searchPagination.query) {
      handleSearch(searchPagination.query);
    } else {
      renderEmptySearchState();
    }
  });

  document.getElementById('btn-open-author-channel')?.addEventListener('click', () => {
    if (snip.channelId) {
      fetchAndRenderChannel(snip.channelId);
    }
  });

  document.getElementById('btn-copy-video-link')?.addEventListener('click', () => {
    copyToClipboard(`https://www.youtube.com/watch?v=${videoId}`, 'Ссылка на видео скопирована');
  });

  document.getElementById('btn-copy-embed')?.addEventListener('click', () => {
    copyToClipboard(embedCode, 'HTML-код встраивания скопирован');
  });

  document.getElementById('btn-copy-tags')?.addEventListener('click', () => {
    if (snip.tags) {
      copyToClipboard(snip.tags.join(', '), 'Все теги скопированы через запятую');
    }
  });

  elContent.querySelectorAll('.comment-author-link').forEach((el) => {
    el.addEventListener('click', () => {
      fetchAndRenderChannel(el.getAttribute('data-channel-id'));
    });
  });
}

function showLoading(msg = 'Загрузка данных...') {
  elContent.innerHTML = `
    <div class="loading-box">
      <div class="md-spinner"></div>
      <div style="font-size: 13px;">${escapeHtml(msg)}</div>
    </div>
  `;
}

function showError(msg) {
  currentViewData = null;
  elContent.innerHTML = `
    <div class="error-banner">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div>
        <strong>Произошла ошибка</strong>
        <div>${escapeHtml(msg)}</div>
      </div>
    </div>
  `;
}

function showToast(msg) {
  elToastText.textContent = msg;
  elToast.classList.add('show');
  setTimeout(() => elToast.classList.remove('show'), 2400);
}

function copyToClipboard(text, customMsg = 'Скопировано в буфер обмена') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(customMsg));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(customMsg);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFullRussianDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const day = d.getDate();
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const pad = (n) => String(n).padStart(2, '0');
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return `${day} ${month} ${year} г., ${hours}:${minutes}:${seconds}`;
}

function formatPublishDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU');
}

function formatDuration(iso) {
  if (!iso) return '0:00';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const sec = parseInt(m[3] || 0, 10);

  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${h}:${pad(min)}:${pad(sec)}`;
  }
  return `${min}:${pad(sec)}`;
}

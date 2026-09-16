//== Copyright (C) 2026, YouTube Contributors and dmitriykotik. ==
// Released under the MIT License.
// 
// This file is part of YT Contributors Tools.
// This software is provided "AS IS", without warranty of any kind,
// express or implied, including but not limited to warranties
// of merchantability, fitness for a particular purpose and
// noninfringement.

(() => {
  if (!window.location.hostname.includes('support.google.com')) {
    return;
  }

  const contentCache = new Map();

  const REGEX = {
    channelUc: /\b(UC[a-zA-Z0-9_-]{22})\b/g,
    channelHandle: /(?:^|\s)(@([a-zA-Z0-9._-]{3,30}))\b/g,
    channelUrl: /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?youtube\.com\/(?:channel\/(UC[a-zA-Z0-9_-]{22})|@([a-zA-Z0-9._-]+))/g,

    videoWatch: /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    videoShort: /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/g
  };

  const styleEl = document.createElement('style');
  styleEl.id = 'yt-contributors-tools-styles';
  styleEl.textContent = `
    .yt-contributor-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 6px;
      margin: 0 2px;
      border-radius: 9999px;
      font-size: 0.9em;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none !important;
      position: relative;
      transition: opacity 0.15s, transform 0.15s;
      vertical-align: baseline;
      z-index: 10;
    }
    .yt-contributor-badge:hover {
      opacity: 0.88;
      transform: translateY(-1px);
    }
    .yt-badge-channel {
      background-color: #0284c7 !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
    }
    .yt-badge-video {
      background-color: #dc2626 !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
    }
    .yt-badge-icon {
      width: 12px;
      height: 12px;
      fill: currentColor;
      flex-shrink: 0;
    }

    #yt-tooltip-portal {
      position: absolute;
      display: none;
      z-index: 9999999;
      width: 320px;
      background: #1e1e1e;
      color: #f1f1f1;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.4);
      padding: 12px;
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: auto;
      animation: yt-tooltip-fade 0.18s ease-out;
    }
    @keyframes yt-tooltip-fade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .yt-tt-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .yt-tt-avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      object-fit: cover;
      background: #333;
      border: 1px solid rgba(255,255,255,0.1);
      flex-shrink: 0;
    }
    .yt-tt-thumb {
      width: 80px;
      height: 45px;
      border-radius: 4px;
      object-fit: cover;
      background: #000;
      flex-shrink: 0;
    }
    .yt-tt-title {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .yt-tt-meta {
      font-size: 11px;
      color: #aaaaaa;
    }
    .yt-tt-id-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #141414;
      padding: 4px 8px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      color: #38bdf8;
      margin-bottom: 10px;
    }
    .yt-tt-actions {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
    }
    .yt-tt-btn {
      background: #2a2a2a;
      border: 1px solid rgba(255,255,255,0.12);
      color: #ffffff;
      padding: 5px 6px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: background 0.15s;
    }
    .yt-tt-btn:hover {
      background: #3a3a3a;
      color: #38bdf8;
    }
    .yt-tt-refresh-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 10px;
      color: #888888;
    }
    .yt-tt-refresh-btn {
      background: transparent;
      border: none;
      color: #3ea6ff;
      cursor: pointer;
      font-size: 10px;
      text-decoration: underline;
    }
    .yt-tt-refresh-btn:hover {
      color: #fff;
    }
  `;
  document.head.appendChild(styleEl);

  let tooltipPortal = document.getElementById('yt-tooltip-portal');
  if (!tooltipPortal) {
    tooltipPortal = document.createElement('div');
    tooltipPortal.id = 'yt-tooltip-portal';
    document.body.appendChild(tooltipPortal);
  }

  let hideTimeout = null;
  tooltipPortal.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
  tooltipPortal.addEventListener('mouseleave', () => hideTooltip());

  function showTooltip(x, y, contentHtml) {
    clearTimeout(hideTimeout);
    tooltipPortal.innerHTML = contentHtml;
    tooltipPortal.style.display = 'block';

    const portalWidth = 320;
    const portalHeight = 180;
    let left = x;
    let top = y + 15;

    if (left + portalWidth > window.innerWidth + window.scrollX - 20) {
      left = window.innerWidth + window.scrollX - portalWidth - 20;
    }
    if (top + portalHeight > window.innerHeight + window.scrollY - 20) {
      top = y - portalHeight - 10;
    }

    tooltipPortal.style.left = `${Math.max(10, left)}px`;
    tooltipPortal.style.top = `${Math.max(10, top)}px`;
  }

  function hideTooltip() {
    hideTimeout = setTimeout(() => {
      tooltipPortal.style.display = 'none';
    }, 200);
  }

  const processedNodes = new WeakSet();

  function processTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'textarea', 'input', 'code', 'pre', 'noscript'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('.yt-contributor-badge') || parent.closest('#yt-tooltip-portal')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodesToReplace = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!processedNodes.has(node)) {
        nodesToReplace.push(node);
      }
    }

    nodesToReplace.forEach(highlightInTextNode);
  }

  function highlightInTextNode(textNode) {
    processedNodes.add(textNode);
    const text = textNode.nodeValue;
    const parentA = textNode.parentElement.closest('a');

    if (parentA) {
      const href = parentA.getAttribute('href') || '';
      const hrefIsYoutube = href.includes('youtube.com') || href.includes('youtu.be');
      if (!hrefIsYoutube && href !== '#' && !href.startsWith('javascript:')) {
        return;
      }
    }

    const matches = [];

    let m;
    const ucRegex = /\b(UC[a-zA-Z0-9_-]{22})\b/g;
    while ((m = ucRegex.exec(text)) !== null) {
      matches.push({ index: m.index, length: m[0].length, raw: m[0], type: 'channel', id: m[1] });
    }

    const handleRegex = /(^|[^\w])(@[a-zA-Z0-9._-]{3,30})\b/g;
    while ((m = handleRegex.exec(text)) !== null) {
      const offset = m[1].length;
      matches.push({ index: m.index + offset, length: m[2].length, raw: m[2], type: 'channel', id: m[2] });
    }

    const watchRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g;
    while ((m = watchRegex.exec(text)) !== null) {
      matches.push({ index: m.index, length: m[0].length, raw: m[0], type: 'video', id: m[1] });
    }

    const shortRegex = /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/g;
    while ((m = shortRegex.exec(text)) !== null) {
      matches.push({ index: m.index, length: m[0].length, raw: m[0], type: 'video', id: m[1] });
    }

    if (matches.length === 0) return;

    matches.sort((a, b) => a.index - b.index);
    const nonOverlapping = [];
    let lastEnd = 0;
    matches.forEach((item) => {
      if (item.index >= lastEnd) {
        nonOverlapping.push(item);
        lastEnd = item.index + item.length;
      }
    });

    if (nonOverlapping.length === 0) return;

    const fragment = document.createDocumentFragment();
    let curr = 0;

    nonOverlapping.forEach((match) => {
      if (match.index > curr) {
        fragment.appendChild(document.createTextNode(text.slice(curr, match.index)));
      }

      const badge = document.createElement('span');
      const isChannel = match.type === 'channel';
      badge.className = `yt-contributor-badge ${isChannel ? 'yt-badge-channel' : 'yt-badge-video'}`;
      badge.setAttribute('data-target-type', match.type);
      badge.setAttribute('data-target-id', match.id);
      badge.setAttribute('data-raw-text', match.raw);

      badge.innerHTML = `
        <svg class="yt-badge-icon" viewBox="0 0 24 24">
          ${isChannel 
            ? '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' 
            : '<path d="M10 8.64L15.27 12 10 15.36V8.64M8 5v14l11-7L8 5z"/>'}
        </svg>
        <span>${escapeText(match.raw)}</span>
      `;

      attachBadgeHandlers(badge, match.type, match.id, match.raw);
      fragment.appendChild(badge);

      curr = match.index + match.length;
    });

    if (curr < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(curr)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function attachBadgeHandlers(badge, type, id, rawText) {
    badge.addEventListener('mouseenter', async (e) => {
      const rect = badge.getBoundingClientRect();
      const x = rect.left + window.scrollX;
      const y = rect.bottom + window.scrollY;

      const cacheKey = `${type}:${id}`;
      const cached = contentCache.get(cacheKey);

      if (cached) {
        renderTooltipHtml(x, y, type, id, cached, false);
      } else {
        showTooltip(x, y, `
          <div style="display: flex; align-items: center; gap: 8px; padding: 6px;">
            <div style="width: 14px; height: 14px; border: 2px solid #555; border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.6s linear infinite;"></div>
            <span style="font-size: 11px; color: #aaa;">Запрос данных YouTube Data API...</span>
          </div>
        `);
        fetchItemDetails(type, id, (data) => {
          contentCache.set(cacheKey, data);
          renderTooltipHtml(x, y, type, id, data, false);
        });
      }
    });

    badge.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'OPEN_POPUP_TARGET',
          targetType: type,
          targetId: id
        });
      }

      badge.style.opacity = '0.5';
      setTimeout(() => (badge.style.opacity = '1'), 300);
    });
  }

  function renderTooltipHtml(x, y, type, id, data, isRefreshing) {
    const isChannel = type === 'channel';
    let html = '';

    if (isChannel) {
      const title = data.title || id;
      const avatar = data.avatar || '';
      const subs = data.subs || 'Неизвестно';
      const handle = data.handle || id;

      html = `
        <div class="yt-tt-header">
          <img src="${avatar}" class="yt-tt-avatar" onerror="this.style.display='none'">
          <div style="flex: 1; min-width: 0;">
            <div class="yt-tt-title" title="${escapeText(title)}">${escapeText(title)}</div>
            <div class="yt-tt-meta">${escapeText(handle)} &bull; ${escapeText(subs)}</div>
          </div>
        </div>
        <div class="yt-tt-id-row">
          <span>ID: ${escapeText(id)}</span>
        </div>
        <div class="yt-tt-actions">
          <a href="https://www.youtube.com/${id.startsWith('@') ? id : 'channel/' + id}" target="_blank" class="yt-tt-btn">
            В YouTube
          </a>
          <button class="yt-tt-btn yt-btn-copy-id" data-copy="${escapeText(id)}">
            Копировать
          </button>
          <button class="yt-tt-btn yt-btn-inspect" data-type="channel" data-id="${escapeText(id)}">
            В инструмент
          </button>
        </div>
        <div class="yt-tt-refresh-row">
          <span>Кэш сессии</span>
          <button class="yt-tt-refresh-btn" id="yt-btn-tt-refresh">Обновить инфо</button>
        </div>
      `;
    } else {
      const title = data.title || 'Видео ' + id;
      const thumb = data.thumb || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      const channelTitle = data.channelTitle || '';
      const views = data.views || '';

      html = `
        <div class="yt-tt-header">
          <img src="${thumb}" class="yt-tt-thumb" onerror="this.style.display='none'">
          <div style="flex: 1; min-width: 0;">
            <div class="yt-tt-title" title="${escapeText(title)}">${escapeText(title)}</div>
            <div class="yt-tt-meta">${escapeText(channelTitle)} ${views ? '&bull; ' + escapeText(views) : ''}</div>
          </div>
        </div>
        <div class="yt-tt-id-row">
          <span>ID: ${escapeText(id)}</span>
        </div>
        <div class="yt-tt-actions">
          <a href="https://www.youtube.com/watch?v=${id}" target="_blank" class="yt-tt-btn">
            В YouTube
          </a>
          <button class="yt-tt-btn yt-btn-copy-id" data-copy="${escapeText(id)}">
            Копировать
          </button>
          <button class="yt-tt-btn yt-btn-inspect" data-type="video" data-id="${escapeText(id)}">
            В инструмент
          </button>
        </div>
        <div class="yt-tt-refresh-row">
          <span>Кэш сессии</span>
          <button class="yt-tt-refresh-btn" id="yt-btn-tt-refresh">Обновить инфо</button>
        </div>
      `;
    }

    showTooltip(x, y, html);

    tooltipPortal.querySelector('.yt-btn-copy-id')?.addEventListener('click', (e) => {
      const textToCopy = e.target.getAttribute('data-copy');
      navigator.clipboard.writeText(textToCopy);
      e.target.textContent = 'Скопировано!';
      setTimeout(() => (e.target.textContent = 'Копировать'), 1200);
    });

    tooltipPortal.querySelector('.yt-btn-inspect')?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'OPEN_POPUP_TARGET',
          targetType: type,
          targetId: id
        });
      }
      hideTooltip();
    });

    tooltipPortal.querySelector('#yt-btn-tt-refresh')?.addEventListener('click', () => {
      contentCache.delete(`${type}:${id}`);
      fetchItemDetails(type, id, (freshData) => {
        contentCache.set(`${type}:${id}`, freshData);
        renderTooltipHtml(x, y, type, id, freshData, false);
      }, true);
    });
  }

  function fetchItemDetails(type, id, callback, forceRefresh = false) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'FETCH_QUICK_PREVIEW', type, id, forceRefresh },
        (response) => {
          if (response && response.success && response.data) {
            callback(response.data);
          } else {
            callback({
              title: id,
              handle: id,
              subs: 'YouTube API',
              views: ''
            });
          }
        }
      );
    } else {
      setTimeout(() => {
        callback({
          title: id,
          handle: id,
          subs: 'YouTube API',
          views: ''
        });
      }, 300);
    }
  }

  function escapeText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('yt_api_key', (res) => {
      if (res.yt_api_key) {
        processTextNodes(document.body);

        let debounceTimeout = null;
        const observer = new MutationObserver((mutations) => {
          let hasNewNodes = false;
          for (const m of mutations) {
            if (m.addedNodes.length > 0) {
              hasNewNodes = true;
              break;
            }
          }
          if (hasNewNodes) {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
              processTextNodes(document.body);
            }, 250);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    });
  }
})();

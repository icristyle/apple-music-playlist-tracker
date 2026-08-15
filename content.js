// --- КОНФИГУРАЦИЯ СЕЛЕКТОРОВ ---
const SELECTORS = {
    row: '.songs-list-row',
    title: '[data-testid="track-title"]',
    artist: '[data-testid="track-column-secondary"], [data-testid="track-title-by-line"]',
    duration: '[data-testid="track-duration"]'
};

let masterLibrary = new Set();
let observer = null;

// Помощник для идеальной очистки текста (убирает лишние пробелы и переносы)
const cleanStr = (s) => s ? s.replace(/\s+/g, ' ').trim() : "";

// --- ИНИЦИАЛИЗАЦИЯ ---
initialize();

function initialize() {
    // 1. Загружаем библиотеку
    chrome.storage.local.get(['master_library'], (result) => {
        const data = result.master_library || [];
        // Формируем чистый Set для быстрого поиска
        masterLibrary = new Set(data.map(item => cleanStr(item)));
        
        scanAndHighlight();
        startObserver();
    });

    // 2. Слушаем обновления базы (чтобы метки менялись мгновенно)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.master_library) {
            masterLibrary = new Set(changes.master_library.newValue.map(item => cleanStr(item)));
            forceRescan();
        }
    });

    // 3. Сообщения для Popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "GET_PAGE_STATS") {
            sendResponse(getPageStatistics());
        } else if (request.action === "SCRAPE_TRACKS") {
            sendResponse({ tracks: scrapeTracksFromDOM() });
        }
        return true; // Важно для асинхронных ответов
    });
}

// --- ОСНОВНАЯ ЛОГИКА ---

function forceRescan() {
    document.querySelectorAll(SELECTORS.row).forEach(row => {
        delete row.dataset.amtProcessed;
        const oldBadge = row.querySelector('.amt-badge');
        if (oldBadge) oldBadge.remove();
        row.classList.remove('amt-saved-track', 'amt-new-track');
    });
    scanAndHighlight();
}

function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => scanAndHighlight());
    observer.observe(document.body, { childList: true, subtree: true });
}

function parseRow(row) {
    try {
        const titleContainer = row.querySelector(SELECTORS.title);
        const artistEl = row.querySelector(SELECTORS.artist);
        const durationEl = row.querySelector(SELECTORS.duration);

        if (!titleContainer) return null;

        // Извлекаем только ТЕКСТ, игнорируя наши бейджи <span>
        let titleText = "";
        titleContainer.childNodes.forEach(node => {
            if (node.nodeType === 3) { // Чистый текст
                titleText += node.textContent;
            } else if (node.nodeType === 1 && !node.classList.contains('amt-badge')) {
                titleText += node.innerText;
            }
        });

        const title = cleanStr(titleText);
        const artist = cleanStr(artistEl ? artistEl.innerText : "Unknown Artist");
        const duration = cleanStr(durationEl ? durationEl.innerText : "0:00");
        
        const key = `${title}|${artist}|${duration}`;

        return { key, titleElement: titleContainer };
    } catch (e) {
        return null;
    }
}

function scanAndHighlight() {
    const rows = document.querySelectorAll(SELECTORS.row);
    rows.forEach(row => {
        if (row.dataset.amtProcessed) return;

        const info = parseRow(row);
        if (!info) return;

        row.dataset.amtProcessed = "true";

        if (masterLibrary.has(info.key)) {
            markAsSaved(row, info.titleElement);
        } else {
            markAsNew(row, info.titleElement);
        }
    });
}

function markAsSaved(row, titleEl) {
    row.classList.remove('amt-new-track');
    row.classList.add('amt-saved-track');
    if (!titleEl.querySelector('.amt-badge-saved')) {
        const b = titleEl.querySelector('.amt-badge'); if (b) b.remove();
        const badge = document.createElement('span');
        badge.className = 'amt-badge amt-badge-saved';
        badge.innerText = 'IN LIB';
        titleEl.appendChild(badge);
    }
}

function markAsNew(row, titleEl) {
    row.classList.remove('amt-saved-track');
    row.classList.add('amt-new-track');
    if (!titleEl.querySelector('.amt-badge-new')) {
        const b = titleEl.querySelector('.amt-badge'); if (b) b.remove();
        const badge = document.createElement('span');
        badge.className = 'amt-badge amt-badge-new';
        badge.innerText = 'NEW';
        titleEl.appendChild(badge);
    }
}

function scrapeTracksFromDOM() {
    return Array.from(document.querySelectorAll(SELECTORS.row))
        .map(row => parseRow(row))
        .filter(i => i !== null)
        .map(i => i.key);
}

function getPageStatistics() {
    const rows = Array.from(document.querySelectorAll(SELECTORS.row));
    let s = 0, n = 0;
    
    rows.forEach(r => {
        const i = parseRow(r);
        if (i) {
            if (masterLibrary.has(i.key)) s++; else n++;
        }
    });
    
    return { 
        totalVisible: rows.length, 
        saved: s, 
        new: n 
    };
}
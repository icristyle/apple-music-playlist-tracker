document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scanBtn');
    const openBtn = document.getElementById('openLibraryBtn');
    const statusDiv = document.getElementById('status');
    
    // Элементы статистики
    const dbCountSpan = document.getElementById('dbCount');
    const pageTotalSpan = document.getElementById('pageTotal');
    const pageSavedSpan = document.getElementById('pageSaved');
    const pageNewSpan = document.getElementById('pageNew');
    const btnCountSpan = document.getElementById('btnCount');

    const STORAGE_KEY = 'master_library';

    // 1. Инициализация
    updateDbStats();
    checkPageStatus();

    // 2. Периодическая проверка
    setInterval(checkPageStatus, 2000);

    // 3. Логика сканирования
    scanBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes('music.apple.com')) {
            showStatus('Только для Apple Music', 'red');
            return;
        }

        showStatus('Сохранение...', '#ccc');

        chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_TRACKS" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                showStatus('Ошибка соединения', 'red');
                return;
            }
            processTracks(response.tracks);
        });
    });

    openBtn.addEventListener('click', () => chrome.tabs.create({ url: 'viewer.html' }));

    // --- ФУНКЦИИ ---

    function checkPageStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].url.includes('music.apple.com')) {
                pageTotalSpan.textContent = "Не AM";
                return;
            }
            
            chrome.tabs.sendMessage(tabs[0].id, { action: "GET_PAGE_STATS" }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    pageTotalSpan.textContent = "...";
                    return;
                }
                
                pageTotalSpan.textContent = response.totalVisible;
                pageSavedSpan.textContent = response.saved;
                pageNewSpan.textContent = response.new;
                btnCountSpan.textContent = response.new;

                if (response.new === 0) {
                    scanBtn.disabled = true;
                    scanBtn.style.opacity = "0.5";
                } else {
                    scanBtn.disabled = false;
                    scanBtn.style.opacity = "1";
                }
            });
        });
    }

    function processTracks(newTracks) {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const currentLibrary = result[STORAGE_KEY] || [];
            const librarySet = new Set(currentLibrary);
            let addedCount = 0;

            newTracks.forEach(track => {
                // Очистка от возможных меток перед сохранением
                const cleanedTrack = track.replace(/NEW$|IN LIB$/g, '').split('|').map(s => s.trim()).join('|');
                
                if (!librarySet.has(cleanedTrack)) {
                    librarySet.add(cleanedTrack);
                    addedCount++;
                }
            }); // <-- Здесь была пропущена закрывающая скобка forEach

            const updatedLibrary = Array.from(librarySet);

            chrome.storage.local.set({ [STORAGE_KEY]: updatedLibrary }, () => {
                updateDbStats();
                checkPageStatus();
                if (addedCount > 0) {
                    showStatus(`Успешно добавлено: ${addedCount}`, '#4caf50');
                } else {
                    showStatus('Все треки уже в базе', '#aaa');
                }
            });
        });
    }

    function updateDbStats() {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const count = (result[STORAGE_KEY] || []).length;
            dbCountSpan.textContent = `DB: ${count}`;
        });
    }

    function showStatus(text, color) {
        statusDiv.textContent = text;
        statusDiv.style.color = color;
        setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    }
});
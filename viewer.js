document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('content');
    const trackCountLabel = document.getElementById('trackCount');
    const deleteBtn = document.getElementById('deleteBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const themeToggle = document.getElementById('themeToggle');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox'); // Добавь этот ID в HTML

    const STORAGE_KEY = 'master_library';
    let libraryData = [];      // Весь список треков из БД
    let filteredData = [];     // Отфильтрованные поиском треки
    let selectedTracks = new Set(); // Выбранные треки (строки ключи)
    let lastClickedTrack = null;    // Для логики Shift + Click

    // --- ИНИЦИАЛИЗАЦИЯ ---
    loadLibrary();

    // --- ТЕМА ---
    chrome.storage.local.get(['pref_theme'], (res) => {
        if (res.pref_theme) document.documentElement.setAttribute('theme', res.pref_theme);
    });

    themeToggle.onclick = (e) => {
        createRipple(e);
        const current = document.documentElement.getAttribute('theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('theme', next);
        chrome.storage.local.set({ 'pref_theme': next });
    };

    // --- ЗАГРУЗКА ДАННЫХ ---
    function loadLibrary() {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            // Данные хранятся в порядке добавления, для отображения мы их перевернем
            libraryData = result[STORAGE_KEY] || [];
            trackCountLabel.textContent = `(${libraryData.length})`;
            filteredData = [...libraryData].reverse(); 
            renderList(filteredData);
        });
    }

    // --- РЕНДЕРИНГ СПИСКА ---
    function renderList(tracks) {
        container.innerHTML = '';
        selectedTracks.clear();
        updateActionButtons();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        if (tracks.length === 0) {
            container.innerHTML = '<div class="empty-state">Библиотека пуста.<br>Добавьте треки через расширение.</div>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'track-list';

        tracks.forEach((trackString, index) => {
            const [title, artist, dur] = trackString.split('|');
            
            const li = document.createElement('li');
            li.className = 'track-item';
            li.dataset.key = trackString; 
            li.dataset.index = index; // Индекс важен для Shift + Click

            li.innerHTML = `
                <div class="track-info">
                    <span class="song-title">${title}</span>
                    <span class="song-artist">${artist}</span>
                </div>
                <span class="song-duration">${dur}</span>
            `;

            // Обработка клика с поддержкой SHIFT
            li.onclick = (e) => {
                handleTrackClick(e, trackString, index);
            };

            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    // --- ЛОГИКА ВЫДЕЛЕНИЯ (SHIFT + CLICK) ---
    function handleTrackClick(e, trackKey, currentIndex) {
        const isSelected = selectedTracks.has(trackKey);

        if (e.shiftKey && lastClickedTrack !== null) {
            // Реализация выделения диапазона
            const start = Math.min(lastClickedTrack.index, currentIndex);
            const end = Math.max(lastClickedTrack.index, currentIndex);
            
            // Определяем действие (выделить или снять выделение) на основе последнего клика
            const shouldSelect = selectedTracks.has(lastClickedTrack.key);

            for (let i = start; i <= end; i++) {
                const key = filteredData[i];
                const itemEl = container.querySelectorAll('.track-item')[i];
                
                if (shouldSelect) {
                    selectedTracks.add(key);
                    itemEl.classList.add('selected');
                } else {
                    selectedTracks.delete(key);
                    itemEl.classList.remove('selected');
                }
            }
        } else {
            // Обычный одиночный клик
            if (isSelected) {
                selectedTracks.delete(trackKey);
                e.currentTarget.classList.remove('selected');
            } else {
                selectedTracks.add(trackKey);
                e.currentTarget.classList.add('selected');
            }
        }

        // Запоминаем последний кликнутый элемент для следующего Shift-клика
        lastClickedTrack = { key: trackKey, index: currentIndex };
        updateActionButtons();
    }

    // --- ВЫДЕЛИТЬ ВСЁ ---
    if (selectAllCheckbox) {
        selectAllCheckbox.onchange = (e) => {
            const items = container.querySelectorAll('.track-item');
            if (e.target.checked) {
                filteredData.forEach((key, i) => {
                    selectedTracks.add(key);
                    items[i].classList.add('selected');
                });
            } else {
                selectedTracks.clear();
                items.forEach(li => li.classList.remove('selected'));
            }
            updateActionButtons();
        };
    }

    // --- ПОИСК ---
    searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        // Фильтруем данные и сразу обновляем отображение
        filteredData = libraryData
            .filter(t => t.toLowerCase().includes(query))
            .reverse();
        renderList(filteredData);
    };

    // --- УПРАВЛЕНИЕ КНОПКАМИ ---
    function updateActionButtons() {
        if (selectedTracks.size > 0) {
            deleteBtn.style.display = 'block';
            deleteBtn.style.opacity = '1';
            deleteBtn.textContent = `Удалить (${selectedTracks.size})`;
        } else {
            deleteBtn.style.display = 'none';
            deleteBtn.style.opacity = '0';
        }
    }

    // --- УДАЛЕНИЕ ---
    deleteBtn.onclick = (e) => {
        createRipple(e);
        customConfirm(
            "Удаление",
            `Вы уверены, что хотите забыть ${selectedTracks.size} треков? Они снова будут считаться "новыми".`,
            () => {
                // Создаем новый массив, исключая выбранные ключи
                const newLibrary = libraryData.filter(t => !selectedTracks.has(t));
                
                chrome.storage.local.set({ [STORAGE_KEY]: newLibrary }, () => {
                    showToast(`Удалено: ${selectedTracks.size}`);
                    selectedTracks.clear();
                    loadLibrary(); // Полная перезагрузка из хранилища
                });
            }
        );
    };

    // --- ЭКСПОРТ ---
    exportBtn.onclick = (e) => {
        createRipple(e);
        const blob = new Blob([JSON.stringify(libraryData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `am-history-${libraryData.length}-tracks.json`;
        a.href = url;
        a.click();
        showToast("Файл экспорта готов");
    };

    // --- ИМПОРТ ---
    importBtn.onclick = (e) => {
        createRipple(e);
        fileInput.click();
    };

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const newData = JSON.parse(ev.target.result);
                if (Array.isArray(newData)) {
                    processImport(newData);
                } else {
                    showToast("Неверный формат: ожидается массив строк.");
                }
            } catch (err) {
                showToast("Ошибка при чтении файла");
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Сброс инпута для возможности повторного выбора того же файла
    };

    function processImport(importedArr) {
        customConfirm(
            "Импорт",
            `Найдено треков: ${importedArr.length}. Объединить с текущими?`,
            () => {
                // Используем Set для автоматического удаления дубликатов при слиянии
                const mergedSet = new Set([...libraryData, ...importedArr]);
                const mergedArray = Array.from(mergedSet);
                
                chrome.storage.local.set({ [STORAGE_KEY]: mergedArray }, () => {
                    showToast("Библиотека успешно объединена");
                    loadLibrary();
                });
            },
            "Импортировать"
        );
    }

    // --- UI UTILS (Toasts, Dialogs, Ripple) ---

    function showToast(msg) {
        const box = document.createElement('div');
        box.className = 'snackbar';
        box.textContent = msg;
        document.body.appendChild(box);
        setTimeout(() => {
            box.style.opacity = '0'; 
            setTimeout(() => box.remove(), 300);
        }, 3000);
    }

    function customConfirm(title, msg, onYes, btnText = "Да") {
        const dialog = document.getElementById('custom-dialog');
        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-msg').textContent = msg;
        
        const okBtn = document.getElementById('dialog-confirm');
        okBtn.textContent = btnText;
        
        dialog.style.display = 'flex';
        
        // Клонируем кнопку, чтобы удалить старые слушатели событий (предотвращает множественное выполнение)
        const newOk = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        
        newOk.onclick = () => { dialog.style.display = 'none'; onYes(); };
        document.getElementById('dialog-cancel').onclick = () => dialog.style.display = 'none';
    }

    function createRipple(event) {
        const btn = event.currentTarget;
        const circle = document.createElement("span");
        const diameter = Math.max(btn.clientWidth, btn.clientHeight);
        const radius = diameter / 2;
        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - btn.getBoundingClientRect().left - radius}px`;
        circle.style.top = `${event.clientY - btn.getBoundingClientRect().top - radius}px`;
        circle.classList.add("ripple");
        
        const existing = btn.querySelector('.ripple');
        if (existing) existing.remove();
        btn.appendChild(circle);
    }

    // Привязка Ripple ко всем кнопкам
    document.querySelectorAll('.btn').forEach(b => b.addEventListener('mousedown', createRipple));
});
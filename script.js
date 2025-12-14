let bookmarks = [];
let settings = {
    columns: 5
};

const grid = document.getElementById('bookmarks-grid');
const searchInput = document.getElementById('search-input');
const addBtn = document.getElementById('add-bookmark-btn');
const settingsBtn = document.getElementById('settings-btn');
const bookmarkModal = document.getElementById('bookmark-modal');
const settingsModal = document.getElementById('settings-modal');

const bookmarkForm = document.getElementById('bookmark-form');
const siteUrlInput = document.getElementById('site-url');
const siteTitleInput = document.getElementById('site-title');
const imageUrlInput = document.getElementById('image-url-input');
const fetchImageBtn = document.getElementById('fetch-image-btn');
const previewImg = document.getElementById('preview-img');
const previewPlaceholder = document.getElementById('preview-placeholder');
const imageWarning = document.getElementById('image-warning');
const cancelBookmarkBtn = document.getElementById('cancel-bookmark');

const settingsForm = document.getElementById('settings-form');
const columnsInput = document.getElementById('columns-count');
const cancelSettingsBtn = document.getElementById('cancel-settings');

let currentBase64Image = null;
let ignoreImageWarning = false;

async function init() {
    await loadData();
    applySettings();
    renderGrid();
    setupEventListeners();
}

async function loadData() {
    try {
        const data = await browser.storage.local.get(['bookmarks', 'settings']);
        if (data.bookmarks) {
            bookmarks = data.bookmarks;
        }
        if (data.settings) {
            settings = { ...settings, ...data.settings };
        }
    } catch (e) {
        console.error(e);
    }
}

async function saveData() {
    try {
        await browser.storage.local.set({
            bookmarks,
            settings
        });
    } catch (e) {
        console.error(e);
    }
}

function applySettings() {
    document.documentElement.style.setProperty('--grid-columns', settings.columns);
}

function renderGrid() {
    const oldAddBtn = document.getElementById('add-bookmark-btn');
    grid.innerHTML = '';

    bookmarks.forEach((bm, index) => {
        const card = document.createElement('a');
        card.className = 'bookmark-card';
        card.href = bm.url;
        card.title = bm.title;

        const imgContainer = document.createElement('div');
        imgContainer.className = 'bookmark-img-container';

        if (bm.image) {
            const fgImg = document.createElement('img');
            fgImg.src = bm.image;
            fgImg.className = 'bookmark-image';
            fgImg.loading = "lazy";

            imgContainer.appendChild(fgImg);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'bookmark-placeholder';
            placeholder.textContent = bm.title.substring(0, 2).toUpperCase();
            imgContainer.appendChild(placeholder);
        }

        card.appendChild(imgContainer);

        const titleDiv = document.createElement('div');
        titleDiv.className = 'bookmark-title';
        titleDiv.textContent = bm.title;
        card.appendChild(titleDiv);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = "Удалить";
        delBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteBookmark(index);
        };
        card.appendChild(delBtn);

        grid.appendChild(card);
    });

    if (oldAddBtn) {
        grid.appendChild(oldAddBtn);
    } else {
        const newAddBtn = document.createElement('button');
        newAddBtn.className = 'bookmark-card add-btn';
        newAddBtn.id = 'add-bookmark-btn';
        newAddBtn.title = 'Добавить закладку';
        newAddBtn.innerHTML = '<div class="plus-icon">+</div>';
        newAddBtn.addEventListener('click', openAddModal);
        grid.appendChild(newAddBtn);
    }
}

function deleteBookmark(index) {
    if (confirm("Вы уверены, что хотите удалить эту закладку?")) {
        bookmarks.splice(index, 1);
        saveData();
        renderGrid();
    }
}

function handleSearch(e) {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
            browser.search.search({
                query: query,
                tabId: null
            });
        }
    }
}

async function fetchAndResizeImage(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error();

        const blob = await response.blob();
        return await resizeImage(blob);
    } catch (e) {
        return null;
    }
}

function resizeImage(blob) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
    });
}

async function tryFetchSiteIcon(siteUrl) {
    if (!siteUrl) return null;
    try {
        const urlObj = new URL(siteUrl);
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=128`;
        return await fetchAndResizeImage(faviconUrl);
    } catch (e) {
        return null;
    }
}

async function tryFetchPageTitle(siteUrl) {
    if (!siteUrl) return null;
    try {
        const response = await fetch(siteUrl);
        const text = await response.text();
        const match = text.match(/<title>([^<]*)<\/title>/i);
        if (match && match[1]) {
            return match[1].trim();
        }
    } catch (e) {
        return null;
    }
    return null;
}

function setupEventListeners() {
    searchInput.addEventListener('keypress', handleSearch);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            grid.innerHTML = '';
        } else {
            renderGrid();
        }
    });

    addBtn.addEventListener('click', openAddModal);
    settingsBtn.addEventListener('click', () => {
        columnsInput.value = settings.columns;
        settingsModal.showModal();
    });

    cancelBookmarkBtn.addEventListener('click', () => {
        bookmarkModal.close();
        resetAddForm();
    });

    siteUrlInput.addEventListener('blur', async () => {
        const url = siteUrlInput.value.trim();
        if (!url) return;

        if (!imageUrlInput.value && !currentBase64Image) {
            setPreviewLoading(true);
            const base64 = await tryFetchSiteIcon(url);
            setPreviewLoading(false);

            if (base64) {
                setPreviewImage(base64);
            }
        }

        if (!siteTitleInput.value) {
            const title = await tryFetchPageTitle(url);
            if (title) {
                siteTitleInput.value = title;
            }
        }
    });

    fetchImageBtn.addEventListener('click', async () => {
        const urlToFetch = imageUrlInput.value.trim() || siteUrlInput.value.trim();
        if (!urlToFetch) return;

        setPreviewLoading(true);
        let base64 = null;

        if (imageUrlInput.value.trim()) {
            base64 = await fetchAndResizeImage(imageUrlInput.value.trim());
        } else {
            base64 = await tryFetchSiteIcon(siteUrlInput.value.trim());
        }

        setPreviewLoading(false);

        if (base64) {
            setPreviewImage(base64);
        } else {
            setPreviewError();
        }
    });

    bookmarkForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = siteUrlInput.value.trim();
        let title = siteTitleInput.value.trim();

        if (!title) {
            try {
                title = new URL(url).hostname;
            } catch (e) {
                title = url;
            }
        }

        if (!currentBase64Image && !ignoreImageWarning) {
            imageWarning.hidden = false;
            ignoreImageWarning = true;
            return;
        }

        bookmarks.push({
            url: url,
            title: title,
            image: currentBase64Image
        });

        saveData();
        renderGrid();
        bookmarkModal.close();
        resetAddForm();
    });

    cancelSettingsBtn.addEventListener('click', () => settingsModal.close());

    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const cols = parseInt(columnsInput.value, 10);
        if (cols >= 1 && cols <= 30) {
            settings.columns = cols;
            applySettings();
            saveData();
            settingsModal.close();
        }
    });
}

function setPreviewImage(base64) {
    currentBase64Image = base64;
    previewImg.src = base64;
    previewImg.hidden = false;

    previewPlaceholder.hidden = true;
    imageWarning.hidden = true;
    ignoreImageWarning = false;
}

function setPreviewLoading(isLoading) {
    if (isLoading) {
        previewImg.hidden = true;
        previewPlaceholder.hidden = false;
        previewPlaceholder.textContent = "Загрузка...";
        imageWarning.hidden = true;
    }
}

function setPreviewError() {
    currentBase64Image = null;
    previewImg.hidden = true;
    previewPlaceholder.hidden = false;
    previewPlaceholder.textContent = "Нет изображения";
}

function openAddModal() {
    resetAddForm();
    bookmarkModal.showModal();
}

function resetAddForm() {
    bookmarkForm.reset();
    currentBase64Image = null;
    previewImg.src = "";
    previewImg.hidden = true;
    previewPlaceholder.hidden = false;
    previewPlaceholder.textContent = "Нет изображения";
    imageWarning.hidden = true;
    ignoreImageWarning = false;
}

init();

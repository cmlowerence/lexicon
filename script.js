/**
 * Lexicon Frontend Engine
 * Connects to QubitGyan API
 */

const API_BASE = 'https://qubitgyan-api.onrender.com';

// --- DOM Elements ---
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authError = document.getElementById('auth-error');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

const navItems = document.querySelectorAll('.nav-item[data-target]');
const sections = document.querySelectorAll('.content-section');

// Section Containers
const wotdContainer = document.getElementById('wotd-container');
const practiceContainer = document.getElementById('practice-container');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultContainer = document.getElementById('search-result-container');
const trendingContainer = document.getElementById('trending-container');

// --- Global State ---
let practiceWords = [];
let currentPracticeIndex = 0;

// --- Authentication Logic ---
function checkAuth() {
    const token = localStorage.getItem('access_token');
    if (token) {
        authView.classList.add('hidden');
        appView.classList.remove('hidden');
        loadSection('wotd-section'); // Default view
    } else {
        appView.classList.add('hidden');
        authView.classList.remove('hidden');
    }
}

async function login() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    authError.textContent = '';
    
    if(!username || !password) {
        authError.textContent = 'Please enter both username and password.';
        return;
    }

    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/token/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Invalid username or password');
        }

        const data = await response.json();
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);
        
        checkAuth();
        
    } catch (error) {
        authError.textContent = error.message;
    } finally {
        loginBtn.textContent = 'Sign In';
        loginBtn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    usernameInput.value = '';
    passwordInput.value = '';
    checkAuth();
}

// --- API Fetch Wrapper (Handles JWT logic) ---
async function fetchWithAuth(endpoint) {
    let token = localStorage.getItem('access_token');
    
    let response = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    // Basic Token Refresh Handling
    if (response.status === 401) {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) { logout(); throw new Error('Session expired'); }

        const refreshRes = await fetch(`${API_BASE}/api/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh })
        });

        if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem('access_token', data.access);
            token = data.access;
            // Retry request
            response = await fetch(`${API_BASE}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } else {
            logout();
            throw new Error('Session expired');
        }
    }
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'API Request Failed');
    }
    
    return response.json();
}

// --- Navigation & Routing ---
function loadSection(sectionId) {
    // UI Update
    sections.forEach(sec => sec.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    
    navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector(`.nav-item[data-target="${sectionId}"]`)?.classList.add('active');

    // Data Loading
    if (sectionId === 'wotd-section') fetchWOTD();
    if (sectionId === 'practice-section') fetchPracticeSet();
    if (sectionId === 'trending-section') fetchTrending();
    // Search handles its own data fetching on click/enter
}

// --- Global Audio Handler ---
function playAudio(url) {
    new Audio(url).play().catch(e => console.error("Error playing audio:", e));
}

// --- UI Components ---
function generateWordCardHTML(word, context = 'default') {
    if (!word) return '<div class="error-msg">Word data unavailable.</div>';

    // 1. Process Pronunciations (Prioritize UK/British accent based on preferences, otherwise fallback to US/GEN)
    let audioControls = '';
    if (word.pronunciations && word.pronunciations.length > 0) {
        // Sort pronunciations: UK first, then US, then others
        const sortedProns = [...word.pronunciations].sort((a, b) => {
            if (a.region === 'UK') return -1;
            if (b.region === 'UK') return 1;
            if (a.region === 'US') return -1;
            return 0;
        });

        audioControls = sortedProns.map(p => `
            <button class="audio-btn" onclick="playAudio('${p.audio_url}')" title="${p.region} Pronunciation">
                <i class="ph-fill ph-speaker-high"></i> ${p.region}
            </button>
        `).join('');
    }

    // 2. Process Meanings
    const meaningsHtml = (word.meanings || []).map(m => `
        <div class="meaning-block">
            <span class="badge">${m.part_of_speech}</span>
            <p class="definition">${m.definition}</p>
            ${m.example ? `<p class="example">"${m.example}"</p>` : ''}
        </div>
    `).join('');

    // 3. Process Thesaurus
    const synonyms = (word.thesaurus_entries || []).filter(t => t.relation_type === 'SYN').slice(0, 6);
    const antonyms = (word.thesaurus_entries || []).filter(t => t.relation_type === 'ANT').slice(0, 6);
    
    let thesaurusHtml = '';
    if (synonyms.length > 0) {
        thesaurusHtml += `<span class="thesaurus-label">Synonyms</span><div class="thesaurus-grid">` + 
            synonyms.map(t => `<span class="syn-tag">${t.related_word}</span>`).join('') + `</div>`;
    }
    if (antonyms.length > 0) {
        thesaurusHtml += `<span class="thesaurus-label">Antonyms</span><div class="thesaurus-grid">` + 
            antonyms.map(t => `<span class="ant-tag">${t.related_word}</span>`).join('') + `</div>`;
    }

    // 4. Build Card
    let cardHtml = `
        <div class="word-card">
            <div class="word-header">
                <div class="word-title-row">
                    <h2 class="word-title">${word.text}</h2>
                </div>
                <div class="word-meta">
                    ${word.phonetic_text ? `<span class="phonetic">${word.phonetic_text}</span>` : ''}
                    <div class="audio-group">${audioControls}</div>
                    ${word.is_sophisticated ? `<span class="badge" style="background: #FEF3C7; color: #D97706;">Sophisticated</span>` : ''}
                </div>
            </div>
            
            <div class="word-body">
                ${meaningsHtml}
                ${thesaurusHtml}
            </div>
    `;

    // Add Practice Navigation if in Practice Context
    if (context === 'practice') {
        const isFirst = currentPracticeIndex === 0;
        const isLast = currentPracticeIndex === practiceWords.length - 1;
        cardHtml += `
            <div class="card-controls">
                <button class="secondary-btn" id="prev-btn" ${isFirst ? 'disabled' : ''} onclick="navigatePractice(-1)">Previous</button>
                <button class="secondary-btn" id="next-btn" ${isLast ? 'disabled' : ''} onclick="navigatePractice(1)">Next</button>
            </div>
            <div class="card-counter">${currentPracticeIndex + 1} of ${practiceWords.length} Words</div>
        `;
    }

    cardHtml += `</div>`;
    return cardHtml;
}

// --- Section Fetchers ---

async function fetchWOTD() {
    wotdContainer.innerHTML = '<div class="loader"><i class="ph ph-spinner ph-spin"></i> Loading...</div>';
    try {
        const data = await fetchWithAuth('/api/v2/lexicon/public/word-of-the-day/');
        if (data && data.word) {
            document.getElementById('wotd-date').textContent = new Date(data.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            wotdContainer.innerHTML = generateWordCardHTML(data.word, 'default');
        } else {
            throw new Error("Invalid WOTD data");
        }
    } catch (err) {
        wotdContainer.innerHTML = `<div class="error-msg" style="text-align:center;">Failed to load Word of the Day.</div>`;
    }
}

async function fetchPracticeSet() {
    if (practiceWords.length > 0) {
        renderPracticeCard(); // Don't refetch if already loaded
        return;
    }

    practiceContainer.innerHTML = '<div class="loader"><i class="ph ph-spinner ph-spin"></i> Loading your daily set...</div>';
    try {
        const data = await fetchWithAuth('/api/v2/lexicon/public/daily-practice/');
        if (data && data.words && data.words.length > 0) {
            practiceWords = data.words;
            currentPracticeIndex = 0;
            renderPracticeCard();
        } else {
            throw new Error("No words available today.");
        }
    } catch (err) {
        practiceContainer.innerHTML = `<div class="error-msg" style="text-align:center;">${err.message || 'Failed to load practice set.'}</div>`;
    }
}

function renderPracticeCard() {
    if (practiceWords.length === 0) return;
    const word = practiceWords[currentPracticeIndex];
    practiceContainer.innerHTML = generateWordCardHTML(word, 'practice');
}

// Global function for onclick attributes in Practice mode
window.navigatePractice = function(direction) {
    const newIndex = currentPracticeIndex + direction;
    if (newIndex >= 0 && newIndex < practiceWords.length) {
        currentPracticeIndex = newIndex;
        renderPracticeCard();
    }
};

async function executeSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchResultContainer.innerHTML = '<div class="loader"><i class="ph ph-spinner ph-spin"></i> Searching Dictionary...</div>';
    searchBtn.disabled = true;

    try {
        const data = await fetchWithAuth(`/api/v2/lexicon/public/search/?word=${encodeURIComponent(query)}&lang=en`);
        searchResultContainer.innerHTML = generateWordCardHTML(data, 'default');
    } catch (err) {
        searchResultContainer.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-warning-circle" style="color: var(--danger)"></i>
                <p style="color: var(--danger)">${err.message}</p>
            </div>
        `;
    } finally {
        searchBtn.disabled = false;
    }
}

async function fetchTrending() {
    trendingContainer.innerHTML = '<div class="loader"><i class="ph ph-spinner ph-spin"></i> Loading Trends...</div>';
    try {
        const data = await fetchWithAuth('/api/v2/lexicon/public/trending/');
        if (data && data.length > 0) {
            trendingContainer.innerHTML = data.map(word => `
                <div class="trending-card" onclick="loadTrendingWordToSearch('${word.text}')">
                    <div>
                        <h3>${word.text}</h3>
                        <p>${word.meanings?.[0]?.definition?.substring(0, 60) || 'No definition available'}...</p>
                    </div>
                    <span class="trending-stats"><i class="ph-fill ph-fire"></i> ${word.search_count} Searches</span>
                </div>
            `).join('');
        } else {
            trendingContainer.innerHTML = '<div class="empty-state">No trending words yet.</div>';
        }
    } catch (err) {
        trendingContainer.innerHTML = `<div class="error-msg">Failed to load trending words.</div>`;
    }
}

window.loadTrendingWordToSearch = function(wordText) {
    loadSection('search-section');
    searchInput.value = wordText;
    executeSearch();
};


// --- Event Listeners ---
loginBtn.addEventListener('click', login);
passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
logoutBtn.addEventListener('click', logout);

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        if (target) loadSection(target);
    });
});

searchBtn.addEventListener('click', executeSearch);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeSearch(); });

// Initialize
checkAuth();

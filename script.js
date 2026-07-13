(function() {
    // Supabase configuration
    const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';

    // Initialize Supabase client
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    // LocalStorage keys
    const STORAGE_NICKNAME_KEY = 'nobu_nickname';
    const STORAGE_USER_ID_KEY = 'nobu_user_id';

    // DOM elements
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameText = document.getElementById('nicknameText');
    const avatarInitial = document.getElementById('avatarInitial');
    const editNicknameBtn = document.getElementById('editNicknameBtn');
    const nicknameEditor = document.getElementById('nicknameEditor');
    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameBtn = document.getElementById('saveNicknameBtn');
    const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');
    const composerAvatarInitial = document.getElementById('composerAvatarInitial');
    const composerNickname = document.getElementById('composerNickname');
    const postTextarea = document.getElementById('postTextarea');
    const charCount = document.getElementById('charCount');
    const publishBtn = document.getElementById('publishBtn');
    const composerError = document.getElementById('composerError');
    const composerErrorText = document.getElementById('composerErrorText');
    const postsFeed = document.getElementById('postsFeed');
    const feedLoading = document.getElementById('feedLoading');
    const feedEmpty = document.getElementById('feedEmpty');
    const feedError = document.getElementById('feedError');
    const feedErrorText = document.getElementById('feedErrorText');
    const retryBtn = document.getElementById('retryBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    // State
    let currentNickname = '';
    let currentUserId = '';
    let isPublishing = false;
    let realtimeSubscription = null;
    let postsRefreshInterval = null;

    // Utility: escape HTML to prevent XSS
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Generate a valid UUID
    function generateUserId() {
        return crypto.randomUUID();
    }

    // Get or create a valid UUID user ID
    function getUserId() {
        let userId = localStorage.getItem(STORAGE_USER_ID_KEY);
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!userId || !uuidRegex.test(userId)) {
            userId = generateUserId();
            localStorage.setItem(STORAGE_USER_ID_KEY, userId);
        }
        return userId;
    }

    // Get saved nickname
    function getSavedNickname() {
        return localStorage.getItem(STORAGE_NICKNAME_KEY) || '';
    }

    // Save nickname
    function saveNickname(nick) {
        localStorage.setItem(STORAGE_NICKNAME_KEY, nick);
    }

    // Update UI with current nickname
    function updateNicknameUI(nick) {
        const displayNick = nick || 'Гость';
        const initial = nick ? nick.charAt(0).toUpperCase() : '?';
        
        nicknameText.textContent = displayNick;
        avatarInitial.textContent = initial;
        composerNickname.textContent = displayNick;
        composerAvatarInitial.textContent = initial;
        
        // Update publish button state
        updatePublishButtonState();
    }

    // Show nickname editor
    function showNicknameEditor() {
        nicknameDisplay.classList.add('hidden');
        nicknameEditor.classList.remove('hidden');
        nicknameInput.value = currentNickname;
        nicknameInput.focus();
    }

    // Hide nickname editor
    function hideNicknameEditor() {
        nicknameEditor.classList.add('hidden');
        nicknameDisplay.classList.remove('hidden');
    }

    // Handle saving nickname
    function handleSaveNickname() {
        const newNick = nicknameInput.value.trim();
        if (!newNick) {
            nicknameInput.style.border = '1px solid var(--danger)';
            nicknameInput.focus();
            setTimeout(() => {
                nicknameInput.style.border = '';
            }, 2000);
            return;
        }
        
        currentNickname = newNick;
        saveNickname(currentNickname);
        updateNicknameUI(currentNickname);
        hideNicknameEditor();
        showComposerError('');
    }

    // Handle cancel edit nickname
    function handleCancelNickname() {
        if (!currentNickname) {
            // If no nickname set, keep editor open
            return;
        }
        hideNicknameEditor();
        nicknameInput.style.border = '';
    }

    // Show composer error
    function showComposerError(message) {
        if (message) {
            composerError.classList.remove('hidden');
            composerErrorText.textContent = message;
        } else {
            composerError.classList.add('hidden');
        }
    }

    // Update character counter
    function updateCharCounter() {
        const len = postTextarea.value.length;
        charCount.textContent = len;
        
        charCount.classList.remove('warning', 'danger');
        if (len >= 450 && len < 500) {
            charCount.classList.add('warning');
        } else if (len >= 500) {
            charCount.classList.add('danger');
        }
        
        updatePublishButtonState();
    }

    // Check if publish button should be enabled
    function updatePublishButtonState() {
        const content = postTextarea.value.trim();
        const hasContent = content.length > 0;
        const hasNickname = currentNickname && currentNickname.length > 0;
        const notPublishing = !isPublishing;
        
        publishBtn.disabled = !(hasContent && hasNickname && notPublishing);
    }

    // Format date
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'только что';
        if (diffMin < 60) return `${diffMin} мин. назад`;
        if (diffHour < 24) return `${diffHour} ч. назад`;
        if (diffDay < 7) return `${diffDay} дн. назад`;
        
        return date.toLocaleDateString('ru-RU', { 
            day: 'numeric', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    // Create post card element
    function createPostCard(post) {
        const card = document.createElement('div');
        card.className = 'post-card';
        card.setAttribute('data-post-id', post.id);
        
        const initial = post.nickname ? post.nickname.charAt(0).toUpperCase() : '?';
        const safeContent = escapeHtml(post.content);
        const timeStr = post.created_at ? formatDate(post.created_at) : '';
        
        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">${escapeHtml(initial)}</div>
                <div class="post-author-info">
                    <span class="post-nickname">${escapeHtml(post.nickname || 'Гость')}</span>
                    <span class="post-time">${timeStr}</span>
                </div>
            </div>
            <div class="post-content">${safeContent}</div>
        `;
        
        return card;
    }

    // Render posts in feed
    function renderPosts(posts) {
        // Clear feed except loading/empty/error placeholders
        const existingCards = postsFeed.querySelectorAll('.post-card');
        existingCards.forEach(card => card.remove());
        
        if (!posts || posts.length === 0) {
            feedLoading.classList.add('hidden');
            feedError.classList.add('hidden');
            feedEmpty.classList.remove('hidden');
            return;
        }
        
        feedLoading.classList.add('hidden');
        feedError.classList.add('hidden');
        feedEmpty.classList.add('hidden');
        
        posts.forEach(post => {
            const card = createPostCard(post);
            postsFeed.appendChild(card);
        });
    }

    // Set feed status
    function setFeedStatus(status, text) {
        statusDot.className = 'status-dot';
        if (status === 'connected') {
            statusDot.classList.add('connected');
            statusText.textContent = text || 'Подключено';
        } else if (status === 'connecting') {
            statusDot.classList.add('connecting');
            statusText.textContent = text || 'Подключение...';
        } else if (status === 'error') {
            statusDot.classList.add('error');
            statusText.textContent = text || 'Ошибка';
        } else {
            statusText.textContent = text || '';
        }
    }

    // Load all posts
    async function loadPosts() {
        try {
            setFeedStatus('connecting', 'Загрузка...');
            feedLoading.classList.remove('hidden');
            feedError.classList.add('hidden');
            
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('Ошибка загрузки постов:', error);
                throw error;
            }
            
            renderPosts(data || []);
            setFeedStatus('connected', 'Активно');
        } catch (err) {
            console.error('Критическая ошибка загрузки постов:', err);
            feedLoading.classList.add('hidden');
            feedError.classList.remove('hidden');
            feedErrorText.textContent = `Не удалось загрузить посты. ${err.message || 'Проверьте соединение.'}`;
            setFeedStatus('error', 'Ошибка загрузки');
        }
    }

    // Publish a new post
    async function publishPost() {
        if (isPublishing) return;
        
        const content = postTextarea.value.trim();
        if (!content) {
            showComposerError('Пост не может быть пустым');
            return;
        }
        
        if (!currentNickname) {
            showComposerError('Сначала задайте никнейм');
            return;
        }
        
        if (content.length > 500) {
            showComposerError('Максимальная длина поста 500 символов');
            return;
        }
        
        isPublishing = true;
        updatePublishButtonState();
        showComposerError('');
        
        try {
            const { data, error } = await supabase
                .from('posts')
                .insert([
                    {
                        user_id: currentUserId,
                        nickname: currentNickname,
                        content: content,
                        likes: 0
                    }
                ])
                .select()
                .single();
            
            if (error) {
                console.error('Ошибка публикации поста (Supabase error):', error);
                throw error;
            }
            
            console.log('Пост успешно опубликован:', data);
            
            // Clear textarea
            postTextarea.value = '';
            updateCharCounter();
            
            // Optimistically add post to feed
            if (data) {
                const existingCard = postsFeed.querySelector(`[data-post-id="${data.id}"]`);
                if (!existingCard) {
                    const card = createPostCard(data);
                    const firstCard = postsFeed.querySelector('.post-card');
                    if (firstCard) {
                        postsFeed.insertBefore(card, firstCard);
                    } else {
                        postsFeed.appendChild(card);
                    }
                    feedEmpty.classList.add('hidden');
                }
            }
            
        } catch (err) {
            console.error('Критическая ошибка при публикации:', err);
            
            // Подробный разбор ошибки для пользователя
            let userMessage = 'Не удалось опубликовать пост. ';
            if (err.message) {
                userMessage += err.message;
            }
            if (err.code) {
                userMessage += ` (Код ошибки: ${err.code})`;
            }
            if (err.details) {
                userMessage += ` Детали: ${err.details}`;
            }
            if (err.hint) {
                userMessage += ` Подсказка: ${err.hint}`;
            }
            
            showComposerError(userMessage);
        } finally {
            isPublishing = false;
            updatePublishButtonState();
        }
    }

    // Setup realtime subscription
    function setupRealtime() {
        // Remove existing subscription if any
        if (realtimeSubscription) {
            supabase.removeChannel(realtimeSubscription);
        }
        
        setFeedStatus('connecting', 'Подключение realtime...');
        
        realtimeSubscription = supabase
            .channel('posts-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'posts'
                },
                (payload) => {
                    console.log('Realtime insert:', payload);
                    const newPost = payload.new;
                    
                    // Check if post already in feed
                    const existingCard = postsFeed.querySelector(`[data-post-id="${newPost.id}"]`);
                    if (!existingCard) {
                        const card = createPostCard(newPost);
                        // Insert at top
                        const firstCard = postsFeed.querySelector('.post-card');
                        if (firstCard) {
                            postsFeed.insertBefore(card, firstCard);
                        } else {
                            postsFeed.appendChild(card);
                        }
                        feedEmpty.classList.add('hidden');
                        feedLoading.classList.add('hidden');
                        feedError.classList.add('hidden');
                    }
                }
            )
            .subscribe((status) => {
                console.log('Realtime status:', status);
                if (status === 'SUBSCRIBED') {
                    setFeedStatus('connected', 'Realtime активно');
                } else if (status === 'CHANNEL_ERROR') {
                    setFeedStatus('error', 'Ошибка realtime');
                } else if (status === 'TIMED_OUT') {
                    setFeedStatus('error', 'Таймаут realtime');
                }
            });
    }

    // Start periodic refresh
    function startPeriodicRefresh() {
        if (postsRefreshInterval) {
            clearInterval(postsRefreshInterval);
        }
        postsRefreshInterval = setInterval(() => {
            loadPosts();
        }, 5000);
    }

    // Stop periodic refresh
    function stopPeriodicRefresh() {
        if (postsRefreshInterval) {
            clearInterval(postsRefreshInterval);
            postsRefreshInterval = null;
        }
    }

    // Initialize app
    async function init() {
        // Setup user ID (valid UUID)
        currentUserId = getUserId();
        
        // Setup nickname
        currentNickname = getSavedNickname();
        updateNicknameUI(currentNickname);
        
        // Show editor if no nickname
        if (!currentNickname) {
            showNicknameEditor();
        } else {
            hideNicknameEditor();
        }
        
        // Update character counter
        updateCharCounter();
        
        // Event listeners
        editNicknameBtn.addEventListener('click', showNicknameEditor);
        saveNicknameBtn.addEventListener('click', handleSaveNickname);
        cancelNicknameBtn.addEventListener('click', handleCancelNickname);
        
        nicknameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveNickname();
            } else if (e.key === 'Escape') {
                handleCancelNickname();
            }
        });
        
        postTextarea.addEventListener('input', () => {
            updateCharCounter();
            showComposerError('');
        });
        
        publishBtn.addEventListener('click', publishPost);
        
        postTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                publishPost();
            }
        });
        
        retryBtn.addEventListener('click', () => {
            loadPosts();
        });
        
        // Initial load
        await loadPosts();
        
        // Setup realtime
        setupRealtime();
        
        // Start periodic refresh
        startPeriodicRefresh();
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopPeriodicRefresh();
        if (realtimeSubscription) {
            supabase.removeChannel(realtimeSubscription);
        }
    });

    // Start app when DOM is ready
    document.addEventListener('DOMContentLoaded', init);
})();
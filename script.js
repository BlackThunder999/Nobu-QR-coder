// Инициализация Supabase
const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Состояние приложения
const state = {
    user: null,
    currentView: 'feed',
    currentTab: 'feed-all',
    activeChirpId: null,
    isSending: false
};

// Утилиты
const $ = (id) => document.getElementById(id);
const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const showToast = (message, isError = false) => {
    // Простая реализация уведомлений через alert для минимализма, 
    // в продакшене лучше использовать кастомный toast-компонент
    if (isError) alert('Ошибка: ' + message);
};

const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'только что';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч`;
    return date.toLocaleDateString('ru-RU');
};

const highlightHashtags = (text) => {
    return text.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
};

// ==================== АВТОРИЗАЦИЯ ====================
const checkAuth = async () => {
    const savedUser = localStorage.getItem('nobuchirp_user');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
        await checkUserStatus();
        if (!state.user.is_banned) {
            showScreen('main-screen');
            initRealtime();
            loadFeed();
        }
    } else {
        showScreen('auth-screen');
    }
};

const handleAuth = async (isRegister) => {
    const username = $('auth-username').value.trim();
    const password = $('auth-password').value;
    const errorEl = $('auth-error');
    
    if (!username || !password) {
        errorEl.textContent = 'Заполните все поля';
        return;
    }

    if (username.length < 3) {
        errorEl.textContent = 'Никнейм слишком короткий';
        return;
    }

    const hashedPass = await hashPassword(password);

    if (isRegister) {
        const { data: existing } = await supabase.from('users').select('id').eq('username', username).single();
        if (existing) {
            errorEl.textContent = 'Никнейм уже занят';
            return;
        }

        const { data, error } = await supabase.from('users').insert([{
            username,
            password: hashedPass,
            avatar_emoji: '👤',
            bio: 'Новый пользователь NobuChirp'
        }]).select().single();

        if (error) {
            errorEl.textContent = 'Ошибка регистрации';
            return;
        }

        state.user = data;
        localStorage.setItem('nobuchirp_user', JSON.stringify(data));
        showScreen('main-screen');
        updateUserUI();
        initRealtime();
        loadFeed();
    } else {
        const { data, error } = await supabase.from('users').select('*').eq('username', username).eq('password', hashedPass).single();
        if (error || !data) {
            errorEl.textContent = 'Неверный никнейм или пароль';
            return;
        }
        state.user = data;
        localStorage.setItem('nobuchirp_user', JSON.stringify(data));
        await checkUserStatus();
        if (!state.user.is_banned) {
            showScreen('main-screen');
            updateUserUI();
            initRealtime();
            loadFeed();
        }
    }
};

// ==================== СТАТУС ПОЛЬЗОВАТЕЛЯ (БАН/ПРЕДУПРЕЖДЕНИЕ) ====================
const checkUserStatus = async () => {
    if (!state.user) return;
    
    const { data, error } = await supabase.from('users').select('*').eq('id', state.user.id).single();
    if (error || !data) return;

    state.user = data;
    localStorage.setItem('nobuchirp_user', JSON.stringify(data));

    if (data.is_banned) {
        const now = new Date();
        const banEnd = new Date(data.ban_expires);
        
        if (data.ban_expires === null || banEnd > now) {
            showScreen('ban-screen');
            $('ban-reason').textContent = `Причина: ${data.ban_reason || 'Нарушение правил'}`;
            
            if (data.ban_expires) {
                startBanTimer(banEnd);
            } else {
                $('ban-timer').textContent = 'Срок: Навсегда';
            }
            return true;
        } else {
            // Бан истёк, снимаем
            await supabase.from('users').update({ is_banned: false, ban_reason: null, ban_expires: null }).eq('id', state.user.id);
            state.user.is_banned = false;
        }
    }

    // Проверка предупреждений
    const { data: warnings } = await supabase.from('warnings').select('*').eq('user_id', state.user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(1);
    
    if (warnings && warnings.length > 0) {
        const warning = warnings[0];
        showScreen('warning-screen');
        $('warning-reason').textContent = `Причина: ${warning.reason}`;
        
        const warnTime = new Date(warning.created_at);
        const allowTime = new Date(warnTime.getTime() + 3 * 60 * 1000); // 3 минуты
        startWarningTimer(allowTime, warning.id);
        return true;
    }

    return false;
};

const startBanTimer = (endDate) => {
    const timerEl = $('ban-timer');
    const interval = setInterval(() => {
        const now = new Date();
        const diff = endDate - now;
        if (diff <= 0) {
            clearInterval(interval);
            checkUserStatus();
        } else {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timerEl.textContent = `Осталось времени: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    }, 1000);
};

const startWarningTimer = (allowDate, warningId) => {
    const timerEl = $('warning-timer');
    const btn = $('btn-warning-ack');
    
    const interval = setInterval(() => {
        const now = new Date();
        const diff = allowDate - now;
        if (diff <= 0) {
            clearInterval(interval);
            timerEl.textContent = 'Время вышло';
            btn.disabled = false;
        } else {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timerEl.textContent = `Осталось времени: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    }, 1000);

    btn.onclick = async () => {
        await supabase.from('warnings').update({ is_read: true }).eq('id', warningId);
        showScreen('main-screen');
        loadFeed();
    };
};

// Проверка каждые 10 секунд
setInterval(() => {
    if (state.user && state.currentView !== 'auth') {
        checkUserStatus();
    }
}, 10000);

// ==================== НАВИГАЦИЯ И UI ====================
const showScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
};

const updateUserUI = () => {
    if (!state.user) return;
    $('current-user-avatar').textContent = state.user.avatar_emoji;
    $('current-user-name').textContent = state.user.username;
};

// Делегирование событий для всего приложения
document.addEventListener('click', async (e) => {
    const target = e.target.closest('button, .nav-btn, .tab-btn, .action-btn, .chirp-id, .hashtag, .back-btn, .close-modal');
    if (!target) return;

    // Авторизация
    if (target.id === 'btn-login') handleAuth(false);
    if (target.id === 'btn-register') handleAuth(true);

    // Навигация
    if (target.classList.contains('nav-btn')) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        const view = target.dataset.view;
        state.currentView = view;
        
        if (view === 'feed') {
            showScreen('main-screen');
            loadFeed();
        } else if (view === 'profile') {
            showScreen('profile-screen');
            loadProfile(state.user.username);
        } else if (view === 'rules') {
            showScreen('rules-screen');
        } else if (view === 'admin') {
            showScreen('admin-screen');
        }
    }

    if (target.classList.contains('tab-btn')) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        state.currentTab = target.dataset.tab;
        if (state.currentTab === 'trends') {
            $('feed-container').classList.add('hidden');
            $('create-chirp-area').classList.add('hidden');
            $('trends-container').classList.remove('hidden');
            loadTrends();
        } else {
            $('feed-container').classList.remove('hidden');
            $('create-chirp-area').classList.remove('hidden');
            $('trends-container').classList.add('hidden');
            loadFeed();
        }
    }

    if (target.classList.contains('back-btn')) {
        showScreen('main-screen');
        state.currentView = 'feed';
        document.querySelector('.nav-btn[data-view="feed"]').classList.add('active');
        document.querySelector('.nav-btn[data-view="profile"]').classList.remove('active');
    }

    if (target.classList.contains('close-modal')) {
        $(target.dataset.close).classList.add('hidden');
        state.activeChirpId = null;
    }

    // Действия с постами (делегирование)
    if (target.classList.contains('action-btn')) {
        const chirpId = target.dataset.chirpId;
        const action = target.dataset.action;
        handleChirpAction(chirpId, action);
    }

    // Копирование ID поста
    if (target.classList.contains('chirp-id')) {
        navigator.clipboard.writeText(target.dataset.id);
        const originalText = target.textContent;
        target.textContent = 'Скопировано!';
        setTimeout(() => target.textContent = originalText, 1500);
    }

    // Жалоба
    if (target.dataset.action === 'report') {
        const chirpId = target.dataset.chirpId;
        const reason = prompt('Причина жалобы:');
        if (reason) {
            await supabase.from('reports').insert([{
                from_user: state.user.id,
                from_username: state.user.username,
                chirp_id: chirpId,
                reason: reason
            }]);
            alert('Жалоба отправлена');
        }
    }

    // Админка
    if (target.id === 'btn-admin-login') {
        if ($('admin-password').value === 'NobuWaveAdmin2024') {
            $('admin-login-area').classList.add('hidden');
            $('admin-dashboard').classList.remove('hidden');
            loadAdminData();
        } else {
            alert('Неверный пароль');
        }
    }

    if (target.id === 'btn-admin-action') {
        handleAdminAction();
    }

    if (target.id === 'btn-admin-delete-chirp') {
        const chirpId = $('admin-delete-chirp-id').value.trim();
        if (chirpId) {
            await supabase.from('chirps').delete().eq('id', chirpId);
            alert('Пост удалён');
            loadAdminData();
        }
    }
});

// ==================== ЛЕНТА И ПОСТЫ ====================
const loadFeed = async () => {
    const container = $('feed-container');
    container.innerHTML = '<p style="text-align:center; color:var(--text-secondary)">Загрузка...</p>';

    let query = supabase.from('chirps').select('*, users!inner(is_verified, streak_count, last_post_date)').order('created_at', { ascending: false });

    if (state.currentTab === 'feed-subs') {
        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', state.user.id);
        const followingIds = follows ? follows.map(f => f.following_id) : [state.user.id];
        query = query.in('user_id', followingIds);
    }

    const { data, error } = await query.limit(50);
    if (error) {
        container.innerHTML = '<p>Ошибка загрузки</p>';
        return;
    }

    container.innerHTML = '';
    data.forEach(chirp => {
        container.appendChild(createChirpElement(chirp));
    });
};

const createChirpElement = (chirp) => {
    const div = document.createElement('div');
    div.className = 'card chirp-card';
    
    const isFire = chirp.users?.streak_count >= 2 && chirp.is_fire;
    const verifiedBadge = chirp.is_verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';
    const fireBadge = isFire ? '<i class="fa-solid fa-fire fire-badge"></i>' : '';
    
    // Проверка лайка/дизлайка
    const userLike = chirp.user_likes ? 'liked' : '';
    const userDislike = chirp.user_dislikes ? 'disliked' : '';

    div.innerHTML = `
        <div class="chirp-id" data-id="${chirp.id}">ID: ${chirp.id.slice(0,8)}</div>
        <div class="chirp-header">
            <span class="avatar">${chirp.avatar_emoji}</span>
            <div>
                <div class="username">${chirp.username} ${verifiedBadge} ${fireBadge}</div>
                <div style="font-size:12px; color:var(--text-secondary)">${formatTimeAgo(chirp.created_at)}</div>
            </div>
        </div>
        <div class="chirp-content">${highlightHashtags(chirp.content)}</div>
        ${chirp.image_url ? `<img src="${chirp.image_url}" class="chirp-image" alt="Post image">` : ''}
        <div class="chirp-actions">
            <button class="action-btn ${userLike}" data-action="like" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-heart"></i> ${chirp.likes || 0}
            </button>
            <button class="action-btn ${userDislike}" data-action="dislike" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-thumbs-down"></i> ${chirp.dislikes || 0}
            </button>
            <button class="action-btn" data-action="rechirp" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-retweet"></i> ${chirp.rechirps || 0}
            </button>
            <button class="action-btn" data-action="comment" data-chirp-id="${chirp.id}">
                <i class="fa-solid fa-comment"></i> Коммент
            </button>
            <button class="action-btn" data-action="report" data-chirp-id="${chirp.id}" style="margin-left:auto;">
                <i class="fa-solid fa-flag"></i>
            </button>
        </div>
    `;
    return div;
};

const handleChirpAction = async (chirpId, action) => {
    if (!state.user) return;

    if (action === 'comment') {
        state.activeChirpId = chirpId;
        $('comments-modal').classList.remove('hidden');
        loadComments(chirpId);
        return;
    }

    if (action === 'like') {
        const { data: existing } = await supabase.from('likes').select('id').eq('user_id', state.user.id).eq('chirp_id', chirpId).single();
        if (existing) {
            await supabase.from('likes').delete().eq('id', existing.id);
            await supabase.rpc('decrement_likes', { chirp_id: chirpId });
        } else {
            await supabase.from('likes').insert({ user_id: state.user.id, chirp_id: chirpId });
            await supabase.from('dislikes').delete().eq('user_id', state.user.id).eq('chirp_id', chirpId);
            await supabase.rpc('increment_likes', { chirp_id: chirpId });
        }
    } else if (action === 'dislike') {
        const { data: existing } = await supabase.from('dislikes').select('id').eq('user_id', state.user.id).eq('chirp_id', chirpId).single();
        if (existing) {
            await supabase.from('dislikes').delete().eq('id', existing.id);
            await supabase.rpc('decrement_dislikes', { chirp_id: chirpId });
        } else {
            await supabase.from('dislikes').insert({ user_id: state.user.id, chirp_id: chirpId });
            await supabase.from('likes').delete().eq('user_id', state.user.id).eq('chirp_id', chirpId);
            await supabase.rpc('increment_dislikes', { chirp_id: chirpId });
        }
    } else if (action === 'rechirp') {
        const { data: existing } = await supabase.from('rechirps').select('id').eq('user_id', state.user.id).eq('chirp_id', chirpId).single();
        if (!existing) {
            await supabase.from('rechirps').insert({ user_id: state.user.id, chirp_id: chirpId });
            await supabase.rpc('increment_rechirps', { chirp_id: chirpId });
        }
    }
    
    loadFeed(); // Перезагрузка для обновления UI (в продакшене лучше оптимистичное обновление)
};

// ==================== СОЗДАНИЕ ПОСТА ====================
$('chirp-content').addEventListener('input', (e) => {
    $('char-count').textContent = 280 - e.target.value.length;
});

$('chirp-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            $('image-preview').src = ev.target.result;
            $('image-preview-area').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

$('btn-remove-image').addEventListener('click', () => {
    $('chirp-image').value = '';
    $('image-preview-area').classList.add('hidden');
});

$('btn-send-chirp').addEventListener('click', async () => {
    if (state.isSending) return;
    const content = $('chirp-content').value.trim();
    if (!content && !$('chirp-image').files[0]) return;
    if (content.length > 280) return;

    state.isSending = true;
    $('btn-send-chirp').disabled = true;
    $('btn-send-chirp').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    let imageUrl = null;
    const file = $('chirp-image').files[0];
    if (file) {
        const fileName = `${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
        if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
            imageUrl = publicUrl;
        }
    }

    const hashtags = content.match(/#\w+/g) || [];
    
    // Проверка на "огненный" пост (2+ дня подряд)
    const today = new Date().toDateString();
    const lastPost = state.user.last_post_date ? new Date(state.user.last_post_date).toDateString() : null;
    let isFire = false;
    let newStreak = state.user.streak_count || 0;

    if (lastPost) {
        const diffDays = Math.floor((new Date(today) - new Date(lastPost)) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            newStreak += 1;
            if (newStreak >= 2) isFire = true;
        } else if (diffDays > 1) {
            newStreak = 1;
        }
    } else {
        newStreak = 1;
    }

    const { error } = await supabase.from('chirps').insert([{
        user_id: state.user.id,
        username: state.user.username,
        avatar_emoji: state.user.avatar_emoji,
        content: content,
        image_url: imageUrl,
        hashtags: hashtags,
        is_verified: state.user.is_verified,
        is_fire: isFire
    }]);

    if (!error) {
        await supabase.from('users').update({ 
            streak_count: newStreak, 
            last_post_date: today 
        }).eq('id', state.user.id);
        
        state.user.streak_count = newStreak;
        state.user.last_post_date = today;
        localStorage.setItem('nobuchirp_user', JSON.stringify(state.user));

        // Обновление трендов
        for (const tag of hashtags) {
            const { data: existingTag } = await supabase.from('trends').select('count').eq('hashtag', tag).single();
            if (existingTag) {
                await supabase.from('trends').update({ count: existingTag.count + 1, updated_at: new Date() }).eq('hashtag', tag);
            } else {
                await supabase.from('trends').insert({ hashtag: tag, count: 1 });
            }
        }

        $('chirp-content').value = '';
        $('char-count').textContent = '280';
        $('chirp-image').value = '';
        $('image-preview-area').classList.add('hidden');
        loadFeed();
    }

    state.isSending = false;
    $('btn-send-chirp').disabled = false;
    $('btn-send-chirp').innerHTML = '<i class="fa-solid fa-feather"></i> Чирикнуть';
});

// ==================== КОММЕНТАРИИ ====================
const loadComments = async (chirpId) => {
    const list = $('comments-list');
    list.innerHTML = 'Загрузка...';
    const { data } = await supabase.from('comments').select('*').eq('chirp_id', chirpId).order('created_at', { ascending: true });
    
    list.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `<strong>${c.username}</strong>: ${c.content} <span style="color:var(--text-secondary); font-size:12px; float:right">${formatTimeAgo(c.created_at)}</span>`;
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<p style="color:var(--text-secondary); text-align:center">Нет комментариев</p>';
    }
};

$('btn-send-comment').addEventListener('click', async () => {
    const text = $('new-comment-text').value.trim();
    if (!text || !state.activeChirpId) return;

    await supabase.from('comments').insert([{
        chirp_id: state.activeChirpId,
        user_id: state.user.id,
        username: state.user.username,
        content: text
    }]);

    $('new-comment-text').value = '';
    loadComments(state.activeChirpId);
});

// ==================== ПРОФИЛЬ ====================
const loadProfile = async (username) => {
    const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
    if (!user) return;

    const { count: postsCount } = await supabase.from('chirps').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    const { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id);
    const { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id);

    const isMe = state.user.id === user.id;
    let followBtn = '';
    if (!isMe) {
        const { data: isFollowing } = await supabase.from('follows').select('id').eq('follower_id', state.user.id).eq('following_id', user.id).single();
        followBtn = `<button class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}" id="btn-toggle-follow" data-target="${user.id}" data-following="${!!isFollowing}">
            ${isFollowing ? 'Отписаться' : 'Подписаться'}
        </button>`;
    }

    const verifiedBadge = user.is_verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';

    $('profile-content').innerHTML = `
        <div class="profile-avatar">${user.avatar_emoji}</div>
        <h2>${user.username} ${verifiedBadge}</h2>
        <p style="color:var(--text-secondary); margin-top:8px;">${user.bio || 'Нет биографии'}</p>
        <div class="profile-stats">
            <div class="stat-item"><span class="stat-value">${postsCount || 0}</span><span class="stat-label">Посты</span></div>
            <div class="stat-item"><span class="stat-value">${followersCount || 0}</span><span class="stat-label">Подписчики</span></div>
            <div class="stat-item"><span class="stat-value">${followingCount || 0}</span><span class="stat-label">Подписки</span></div>
        </div>
        ${followBtn}
        ${isMe ? `<button class="btn btn-secondary" style="margin-top:8px;" onclick="editProfile()">Редактировать</button>` : ''}
    `;

    // Загрузка постов профиля
    const { data: chirps } = await supabase.from('chirps').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const container = $('profile-chirps');
    container.innerHTML = '';
    chirps?.forEach(c => container.appendChild(createChirpElement(c)));
};

window.editProfile = () => {
    const newBio = prompt('Новая биография:', state.user.bio);
    const newEmoji = prompt('Новый эмодзи-аватар (один символ):', state.user.avatar_emoji);
    if (newBio !== null) {
        supabase.from('users').update({ bio: newBio, avatar_emoji: newEmoji || '👤' }).eq('id', state.user.id);
        state.user.bio = newBio;
        state.user.avatar_emoji = newEmoji || '👤';
        localStorage.setItem('nobuchirp_user', JSON.stringify(state.user));
        loadProfile(state.user.username);
        updateUserUI();
    }
};

document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-toggle-follow') {
        const targetId = e.target.dataset.target;
        const isFollowing = e.target.dataset.following === 'true';
        
        if (isFollowing) {
            supabase.from('follows').delete().eq('follower_id', state.user.id).eq('following_id', targetId);
            e.target.textContent = 'Подписаться';
            e.target.className = 'btn btn-primary';
            e.target.dataset.following = 'false';
        } else {
            supabase.from('follows').insert({ follower_id: state.user.id, following_id: targetId });
            e.target.textContent = 'Отписаться';
            e.target.className = 'btn btn-secondary';
            e.target.dataset.following = 'true';
        }
    }
});

// ==================== ТРЕНДЫ ====================
const loadTrends = async () => {
    const { data } = await supabase.from('trends').select('*').order('count', { ascending: false }).limit(20);
    const list = $('trends-list');
    list.innerHTML = '';
    data?.forEach(t => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;';
        li.innerHTML = `<span class="hashtag">${t.hashtag}</span> <span style="color:var(--text-secondary)">${t.count} постов</span>`;
        list.appendChild(li);
    });
};

// ==================== АДМИНКА ====================
const loadAdminData = async () => {
    const { data: reports } = await supabase.from('reports').select('*, chirps(content)').order('created_at', { ascending: false });
    const rList = $('admin-reports-list');
    rList.innerHTML = '';
    reports?.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${r.from_username}</strong> жалуется на пост: "${r.chirps?.content?.slice(0,30)}..."<br>Причина: ${r.reason}<br><small>ID поста: ${r.chirp_id}</small>`;
        rList.appendChild(li);
    });

    const { data: bans } = await supabase.from('users').select('username, ban_reason, ban_expires').eq('is_banned', true);
    const bList = $('admin-bans-list');
    bList.innerHTML = '';
    bans?.forEach(b => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${b.username}</strong><br>Причина: ${b.ban_reason}<br>До: ${b.ban_expires ? new Date(b.ban_expires).toLocaleString() : 'Навсегда'}`;
        bList.appendChild(li);
    });
};

const handleAdminAction = async () => {
    const username = $('admin-target-username').value.trim();
    const reason = $('admin-reason').value.trim();
    const action = $('admin-ban-duration').value;

    if (!username) return alert('Введите никнейм');

    const { data: user } = await supabase.from('users').select('id').eq('username', username).single();
    if (!user) return alert('Пользователь не найден');

    if (action === 'verify') {
        await supabase.from('users').update({ is_verified: true }).eq('id', user.id);
        alert('Пользователь верифицирован');
    } else if (action === 'unban') {
        await supabase.from('users').update({ is_banned: false, ban_reason: null, ban_expires: null }).eq('id', user.id);
        alert('Пользователь разбанен');
    } else if (action === 'warn') {
        await supabase.from('warnings').insert({ user_id: user.id, username: username, reason: reason });
        alert('Предупреждение отправлено');
    } else {
        let expires = null;
        const now = new Date();
        if (action === '1d') expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        if (action === '7d') expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        await supabase.from('users').update({ 
            is_banned: true, 
            ban_reason: reason, 
            ban_expires: expires 
        }).eq('id', user.id);
        alert('Действие выполнено');
    }
    
    loadAdminData();
};

// ==================== REALTIME ====================
const initRealtime = () => {
    supabase.channel('public:chirps')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, (payload) => {
            if (state.currentView === 'feed' && state.currentTab !== 'trends') {
                // Простая реализация: полная перезагрузка ленты при новом посте
                // В продакшене лучше prepend нового элемента в DOM
                loadFeed();
            }
        })
        .subscribe();
};

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', checkAuth);
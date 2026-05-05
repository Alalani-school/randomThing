import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- UPDATE THESE WITH YOUR KEYS ---
const SUPABASE_URL = 'https://qrpmswbzpxlmcewcpwjt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0kPRskl1eRhvRRZPWr4SCA_q1k-WTKU';
// -----------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentChannel = 'general';
let chatIsActive = true;

const ui = {
    auth: document.getElementById('auth-section'),
    chat: document.getElementById('chat-section'),
    email: document.getElementById('email'),
    pass: document.getElementById('password'),
    error: document.getElementById('auth-error'),
    msgList: document.getElementById('message-list'),
    msgInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn')
};

// --- AUTH & INITIALIZATION ---
async function init() {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleLogin(session.user);
    
    supabase.auth.onAuthStateChange((_e, session) => {
        session ? handleLogin(session.user) : handleLogout();
    });

    // Enter to login functionality
    ui.pass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('login-btn').click();
    });
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: ui.email.value, password: ui.pass.value });
    if (error) ui.error.textContent = error.message;
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signUp({ email: ui.email.value, password: ui.pass.value });
    if (error) ui.error.textContent = error.message; else ui.error.textContent = "Check email for confirmation!";
});

document.getElementById('logout-btn').addEventListener('click', () => supabase.auth.signOut());

async function handleLogin(user) {
    currentUser = user;
    ui.auth.classList.add('hidden');
    ui.chat.classList.remove('hidden');
    
    // Fetch profile
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    currentProfile = data;
    
    // Update UI Header
    document.getElementById('current-user-email').textContent = user.email.split('@')[0];
    document.getElementById('user-avatar').src = currentProfile.avatar_url;
    if(currentProfile.is_premium) {
        document.getElementById('premium-badge').classList.remove('hidden');
        document.getElementById('subscribe-btn').classList.add('hidden');
    }
    if(currentProfile.is_admin) document.getElementById('admin-panel').classList.remove('hidden');

    loadGlobalSettings();
    loadMessages();
    setupRealtime();
}

function handleLogout() { ui.chat.classList.add('hidden'); ui.auth.classList.remove('hidden'); }

// --- SETTINGS (AVATAR & PREMIUM) ---
document.getElementById('profile-settings-btn').addEventListener('click', async () => {
    const newUrl = prompt("Enter a direct URL for your new profile picture:");
    if (newUrl) {
        await supabase.from('profiles').update({ avatar_url: newUrl }).eq('id', currentUser.id);
        document.getElementById('user-avatar').src = newUrl;
        loadMessages(); // Refresh chat avatars
    }
});

document.getElementById('subscribe-btn').addEventListener('click', async () => {
    // MOCK PAYMENT FLOW
    const pay = confirm("Secure Stripe Checkout: Pay $4.99/mo to unlock Premium features?");
    if (pay) {
        alert("Payment Successful! Welcome to Premium.");
        await supabase.from('profiles').update({ is_premium: true }).eq('id', currentUser.id);
        location.reload(); // Quick refresh to apply premium status everywhere
    }
});

// --- ADMIN PAUSE CHAT ---
async function loadGlobalSettings() {
    const { data } = await supabase.from('app_settings').select('chat_active').eq('id', 1).single();
    updateChatUI(data.chat_active);
}

document.getElementById('toggle-chat-btn').addEventListener('click', async () => {
    await supabase.from('app_settings').update({ chat_active: !chatIsActive }).eq('id', 1);
});

function updateChatUI(isActive) {
    chatIsActive = isActive;
    document.getElementById('toggle-chat-btn').textContent = isActive ? "⏸️ Pause Chat" : "▶️ Resume Chat";
    document.getElementById('paused-banner').classList.toggle('hidden', isActive);
    ui.msgInput.disabled = !isActive;
    ui.sendBtn.disabled = !isActive;
    ui.msgInput.placeholder = isActive ? `Message #${currentChannel}...` : "Chat paused by admin";
}

// --- CHANNELS & THEMES ---
document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

document.getElementById('channels').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) {
        if(li.dataset.id === 'premium' && !currentProfile?.is_premium) {
            alert("This channel is for Premium members only!");
            return;
        }
        document.querySelector('.channel-list .active')?.classList.remove('active');
        li.classList.add('active');
        currentChannel = li.dataset.id;
        document.getElementById('current-channel-name').textContent = currentChannel;
        ui.msgInput.placeholder = `Message #${currentChannel}...`;
        loadMessages();
    }
});

// --- MESSAGES & REACTIONS ---
async function loadMessages() {
    // Fetch messages alongside user info and all reactions
    const { data } = await supabase.from('messages')
        .select(`*, profiles(email, avatar_url, is_premium), reactions(emoji, user_id)`)
        .eq('channel_id', currentChannel).order('created_at', { ascending: true });
        
    if (data) renderMessages(data);
}

function renderMessages(messages) {
    ui.msgList.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message';
        
        // Group reactions by emoji
        const reactionCounts = {};
        msg.reactions.forEach(r => {
            if(!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, hasReacted: false };
            reactionCounts[r.emoji].count++;
            if(r.user_id === currentUser.id) reactionCounts[r.emoji].hasReacted = true;
        });

        let reactionHTML = '<div class="reaction-bar">';
        for (const [emoji, data] of Object.entries(reactionCounts)) {
            reactionHTML += `<span class="reaction-badge ${data.hasReacted ? 'reacted' : ''}" onclick="toggleReaction('${msg.id}', '${emoji}')">${emoji} ${data.count}</span>`;
        }
        reactionHTML += '</div>';

        // Actions Menu
        let actions = `<div class="message-actions">
            <button class="emoji-picker-btn" onclick="toggleReaction('${msg.id}', '👍')">👍</button>
            <button class="emoji-picker-btn" onclick="toggleReaction('${msg.id}', '❤️')">❤️</button>
            <button class="emoji-picker-btn" onclick="toggleReaction('${msg.id}', '😂')">😂</button>
            ${currentProfile?.is_premium ? `<button class="emoji-picker-btn" onclick="toggleReaction('${msg.id}', '👑')">👑</button>` : ''}
        `;
        if (msg.user_id === currentUser.id || currentProfile?.is_admin) {
            actions += `<button class="action-btn" onclick="deleteMsg('${msg.id}')">🗑️</button>`;
        }
        actions += `</div>`;

        div.innerHTML = `
            <img class="message-avatar" src="${msg.profiles.avatar_url}" alt="av">
            <div class="message-content">
                <div class="message-header">
                    <span class="msg-author" style="color: ${msg.profiles.is_premium ? 'gold' : 'var(--text-primary)'}">${msg.profiles.email.split('@')[0]}</span>
                    <span class="msg-time">${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="msg-text">${msg.content} ${msg.is_edited ? '<i>(edited)</i>' : ''}</div>
                ${reactionHTML}
            </div>
            ${actions}
        `;
        ui.msgList.appendChild(div);
    });
    ui.msgList.scrollTop = ui.msgList.scrollHeight;
}

// Send Message
async function sendMessage() {
    if (!chatIsActive && !currentProfile?.is_admin) return;
    const content = ui.msgInput.value.trim();
    if (!content) return;
    ui.msgInput.value = '';
    await supabase.from('messages').insert([{ user_id: currentUser.id, content, channel_id: currentChannel }]);
}
ui.sendBtn.addEventListener('click', sendMessage);
ui.msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// Global Actions (attached to window)
window.deleteMsg = async (id) => { if(confirm("Delete message?")) await supabase.from('messages').delete().eq('id', id); };

window.toggleReaction = async (messageId, emoji) => {
    // Check if reaction exists
    const { data } = await supabase.from('reactions').select('*').eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji);
    if (data.length > 0) {
        // Remove it
        await supabase.from('reactions').delete().eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji);
    } else {
        // Add it
        await supabase.from('reactions').insert([{ message_id: messageId, user_id: currentUser.id, emoji: emoji }]);
    }
};

// --- REALTIME ---
function setupRealtime() {
    supabase.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadMessages)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, loadMessages)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, loadGlobalSettings)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadMessages)
        .subscribe();
}

init();

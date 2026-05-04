import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://qrpmswbzpxlmcewcpwjt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0kPRskl1eRhvRRZPWr4SCA_q1k-WTKU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentUser = null;
let currentProfile = null;
let chatActive = true;
let replyingToId = null;
let allMessages = [];

// DOM
const authSection = document.getElementById('auth-section');
const chatSection = document.getElementById('chat-section');
const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const adminPanel = document.getElementById('admin-panel');
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const pinnedSection = document.getElementById('pinned-section');
const pinnedContent = document.getElementById('pinned-content');
const replyIndicator = document.getElementById('reply-indicator');
const replyTarget = document.getElementById('reply-target');

async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleLoginSuccess(session.user);

    supabase.auth.onAuthStateChange((_e, session) => {
        session ? handleLoginSuccess(session.user) : handleLogoutSuccess();
    });
}

// Authentication
async function handleLoginSuccess(user) {
    currentUser = user;
    authSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    currentProfile = data;
    
    if (data.is_admin) adminPanel.classList.remove('hidden');

    await fetchSettings();
    await loadMessages();
    subscribeToRealtime();
}

function handleLogoutSuccess() {
    currentUser = null; currentProfile = null;
    authSection.classList.remove('hidden'); chatSection.classList.add('hidden');
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
    });
    if (error) document.getElementById('auth-error').textContent = error.message;
});

document.getElementById('logout-btn').addEventListener('click', () => supabase.auth.signOut());

// Core Data Fetching
async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('chat_active').eq('id', 1).single();
    if (data) updateChatState(data.chat_active);
}

async function loadMessages() {
    const { data } = await supabase
        .from('messages')
        .select(`
            *,
            profiles!inner(email, is_banned),
            reactions(emoji, user_id)
        `)
        .order('created_at', { ascending: true });
        
    if (data) {
        allMessages = data;
        renderAllMessages();
        updatePinnedMessage();
    }
}

// Rendering
function renderAllMessages() {
    messageList.innerHTML = '';
    allMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.profiles.is_banned ? 'banned-msg' : ''}`;
        
        let replyHtml = '';
        if (msg.reply_to_id) {
            const parent = allMessages.find(m => m.id === msg.reply_to_id);
            if (parent) replyHtml = `<div class="reply-ref">Replying to ${parent.profiles.email}: "${parent.content.substring(0, 20)}..."</div>`;
        }

        // Reactions grouping
        const reactionCounts = { '👍': [], '❤️': [], '😂': [] };
        msg.reactions.forEach(r => { if(reactionCounts[r.emoji]) reactionCounts[r.emoji].push(r.user_id); });
        
        let reactionsHtml = '<div class="reactions">';
        ['👍', '❤️', '😂'].forEach(emoji => {
            const users = reactionCounts[emoji];
            const hasReacted = users.includes(currentUser.id);
            if (users.length > 0 || hasReacted) {
                reactionsHtml += `<span class="reaction-badge ${hasReacted ? 'active' : ''}" onclick="toggleReaction('${msg.id}', '${emoji}', ${hasReacted})">${emoji} ${users.length}</span>`;
            }
        });
        reactionsHtml += '</div>';

        let adminHtml = '';
        if (currentProfile?.is_admin) {
            adminHtml = `
                <button class="action-btn" onclick="pinMessage('${msg.id}', ${!msg.is_pinned})">${msg.is_pinned ? 'Unpin' : 'Pin'}</button>
                <button class="action-btn" onclick="banUser('${msg.user_id}', ${!msg.profiles.is_banned})">${msg.profiles.is_banned ? 'Unban' : 'Ban'}</button>
            `;
        }

        div.innerHTML = `
            ${replyHtml}
            <div class="sender">${msg.profiles.email} ${msg.profiles.is_banned ? '(BANNED)' : ''}</div>
            <div>${msg.content}</div>
            ${reactionsHtml}
            <div class="message-actions">
                <button class="action-btn" onclick="startReply('${msg.id}', '${msg.content}')">Reply</button>
                <button class="action-btn" onclick="toggleReaction('${msg.id}', '👍', false)">👍</button>
                <button class="action-btn" onclick="toggleReaction('${msg.id}', '❤️', false)">❤️</button>
                <button class="action-btn" onclick="toggleReaction('${msg.id}', '😂', false)">😂</button>
                ${adminHtml}
            </div>
        `;
        messageList.appendChild(div);
    });
    messageList.scrollTop = messageList.scrollHeight;
}

function updatePinnedMessage() {
    const pinned = allMessages.filter(m => m.is_pinned).pop();
    if (pinned) {
        pinnedSection.classList.remove('hidden');
        pinnedContent.textContent = `${pinned.profiles.email}: ${pinned.content}`;
    } else {
        pinnedSection.classList.add('hidden');
    }
}

// User Actions
sendBtn.addEventListener('click', async () => {
    if (!chatActive || currentProfile?.is_banned) return alert("You cannot send messages right now.");
    const content = messageInput.value.trim();
    if (!content) return;

    messageInput.value = '';
    const payload = { user_id: currentUser.id, content: content };
    if (replyingToId) payload.reply_to_id = replyingToId;
    
    cancelReply();
    const { error } = await supabase.from('messages').insert([payload]);
    if (error) alert(error.message);
});

window.startReply = (id, text) => {
    replyingToId = id;
    replyIndicator.classList.remove('hidden');
    replyTarget.textContent = text.substring(0, 30) + '...';
    messageInput.focus();
};

window.cancelReply = () => {
    replyingToId = null;
    replyIndicator.classList.add('hidden');
};
document.getElementById('cancel-reply').addEventListener('click', window.cancelReply);

window.toggleReaction = async (msgId, emoji, currentlyActive) => {
    if (currentlyActive) {
        await supabase.from('reactions').delete().match({ message_id: msgId, user_id: currentUser.id, emoji: emoji });
    } else {
        await supabase.from('reactions').insert([{ message_id: msgId, user_id: currentUser.id, emoji: emoji }]);
    }
};

// Admin Actions
window.banUser = async (userId, banStatus) => {
    await supabase.from('profiles').update({ is_banned: banStatus }).eq('id', userId);
};

window.pinMessage = async (msgId, pinStatus) => {
    await supabase.from('messages').update({ is_pinned: false }).neq('id', '00000000-0000-0000-0000-000000000000'); // Unpin all
    if (pinStatus) await supabase.from('messages').update({ is_pinned: true }).eq('id', msgId);
};

toggleChatBtn.addEventListener('click', async () => {
    await supabase.from('app_settings').update({ chat_active: !chatActive }).eq('id', 1);
});

function updateChatState(isActive) {
    chatActive = isActive;
    toggleChatBtn.textContent = isActive ? "⏸️ Pause Chat" : "▶️ Resume Chat";
    messageInput.disabled = !isActive;
    sendBtn.disabled = !isActive;
    messageInput.placeholder = isActive ? "Type a message..." : "Chat is paused by an administrator.";
}

// Real-time Subscriptions
function subscribeToRealtime() {
    supabase.channel('public-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadMessages)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, loadMessages)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadMessages)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload) => {
            updateChatState(payload.new.chat_active);
        })
        .subscribe();
}

init();

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- UPDATE THESE WITH YOUR KEYS ---
const SUPABASE_URL = 'https://qrpmswbzpxlmcewcpwjt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0kPRskl1eRhvRRZPWr4SCA_q1k-WTKU';
// -----------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentChannel = 'general';
let allMessages = [];

// DOM Elements
const ui = {
    auth: document.getElementById('auth-section'),
    chat: document.getElementById('chat-section'),
    emailInput: document.getElementById('email'),
    passInput: document.getElementById('password'),
    errorMsg: document.getElementById('auth-error'),
    msgList: document.getElementById('message-list'),
    msgInput: document.getElementById('message-input'),
    channelName: document.getElementById('current-channel-name'),
    adminPanel: document.getElementById('admin-panel')
};

// --- Initialization ---
async function init() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleLogin(session.user);

    supabase.auth.onAuthStateChange((_e, session) => {
        if (session) handleLogin(session.user);
        else handleLogout();
    });
}

// --- Authentication ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({
        email: ui.emailInput.value, password: ui.passInput.value
    });
    if (error) ui.errorMsg.textContent = error.message;
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signUp({
        email: ui.emailInput.value, password: ui.passInput.value
    });
    if (error) ui.errorMsg.textContent = error.message;
    else ui.errorMsg.textContent = "Check your email for confirmation!";
});

document.getElementById('logout-btn').addEventListener('click', () => supabase.auth.signOut());

async function handleLogin(user) {
    currentUser = user;
    ui.auth.classList.add('hidden');
    ui.chat.classList.remove('hidden');
    document.getElementById('current-user-email').textContent = user.email.split('@')[0];
    
    // Fetch profile to check admin status
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    currentProfile = data;
    
    if(currentProfile?.is_admin) ui.adminPanel.classList.remove('hidden');

    loadMessages();
    setupRealtime();
}

function handleLogout() {
    currentUser = null;
    ui.chat.classList.add('hidden');
    ui.auth.classList.remove('hidden');
}

// --- Theme & Channels ---
document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

document.getElementById('channels').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) {
        document.querySelector('.channel-list .active')?.classList.remove('active');
        li.classList.add('active');
        currentChannel = li.dataset.id;
        ui.channelName.textContent = currentChannel;
        ui.msgInput.placeholder = `Message #${currentChannel}...`;
        loadMessages();
    }
});

// --- Messaging ---
async function loadMessages() {
    const { data } = await supabase
        .from('messages')
        .select(`*, profiles!inner(email)`)
        .eq('channel_id', currentChannel)
        .order('created_at', { ascending: true });
        
    if (data) {
        allMessages = data;
        renderMessages();
    }
}

function renderMessages() {
    ui.msgList.innerHTML = '';
    allMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message';
        
        const isOwner = msg.user_id === currentUser.id;
        const isAdmin = currentProfile?.is_admin;
        
        let actionHTML = '';
        if (isOwner || isAdmin) {
            actionHTML = `
                <div class="message-actions">
                    ${isOwner ? `<button class="action-btn" onclick="editMsg('${msg.id}', '${msg.content.replace(/'/g, "\\'")}')">✏️</button>` : ''}
                    <button class="action-btn" onclick="deleteMsg('${msg.id}')">🗑️</button>
                </div>
            `;
        }

        const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const editedMark = msg.is_edited ? '<span style="font-size: 0.8em; opacity: 0.5;"> (edited)</span>' : '';

        div.innerHTML = `
            <div class="message-avatar" style="background: hsl(${msg.profiles.email.length * 20}, 70%, 60%)"></div>
            <div class="message-content">
                <div class="message-header">
                    <span class="msg-author">${msg.profiles.email.split('@')[0]}</span>
                    <span class="msg-time">${time}</span>
                </div>
                <div class="msg-text">${msg.content} ${editedMark}</div>
            </div>
            ${actionHTML}
        `;
        ui.msgList.appendChild(div);
    });
    ui.msgList.scrollTop = ui.msgList.scrollHeight;
}

// Send Message
async function sendMessage() {
    const content = ui.msgInput.value.trim();
    if (!content) return;
    ui.msgInput.value = '';

    await supabase.from('messages').insert([{ 
        user_id: currentUser.id, content, channel_id: currentChannel 
    }]);
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
ui.msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// Edit/Delete globals (attached to window so onclick works)
window.deleteMsg = async (id) => {
    if(confirm("Delete message?")) await supabase.from('messages').delete().eq('id', id);
};

window.editMsg = async (id, oldContent) => {
    const newContent = prompt("Edit message:", oldContent);
    if (newContent && newContent !== oldContent) {
        await supabase.from('messages').update({ content: newContent, is_edited: true }).eq('id', id);
    }
};

// --- Realtime ---
function setupRealtime() {
    supabase.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadMessages)
        .subscribe();
}

init();

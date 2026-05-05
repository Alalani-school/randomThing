import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Re-insert your Supabase Keys here
const SUPABASE_URL = 'YOUR_URL';
const SUPABASE_ANON_KEY = 'YOUR_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentChannel = 'general'; // New: Channel State
let allMessages = [];

const chatSection = document.getElementById('chat-section');
const authSection = document.getElementById('auth-section');
const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');

// --- Initialization & Auth ---
async function init() {
    // Check local storage for theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleLoginSuccess(session.user);

    supabase.auth.onAuthStateChange((_e, session) => {
        session ? handleLoginSuccess(session.user) : handleLogoutSuccess();
    });
}

async function handleLoginSuccess(user) {
    currentUser = user;
    authSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    document.getElementById('current-user-email').textContent = user.email;
    
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    currentProfile = data;
    
    await loadMessages();
    subscribeToRealtime();
}

// --- Theme Toggle ---
document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

// --- Channels ---
document.getElementById('channels').addEventListener('click', async (e) => {
    if (e.target.tagName === 'LI') {
        document.querySelector('.active-channel').classList.remove('active-channel');
        e.target.classList.add('active-channel');
        currentChannel = e.target.dataset.id;
        document.getElementById('current-channel-name').textContent = `# ${currentChannel}`;
        await loadMessages(); // Reload messages for new channel
    }
});

// --- Core Chat Logic ---
async function loadMessages() {
    const { data } = await supabase
        .from('messages')
        .select(`*, profiles!inner(email)`)
        .eq('channel_id', currentChannel) // Filter by channel
        .order('created_at', { ascending: true });
        
    if (data) {
        allMessages = data;
        renderAllMessages();
    }
}

function renderAllMessages() {
    messageList.innerHTML = '';
    allMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message`;
        
        // Only show edit/delete to the message owner or an admin
        let ownerActions = '';
        if (msg.user_id === currentUser.id || currentProfile?.is_admin) {
            ownerActions = `
                <button onclick="deleteMessage('${msg.id}')">🗑️ Delete</button>
                <button onclick="editMessage('${msg.id}', '${msg.content}')">✏️ Edit</button>
            `;
        }

        div.innerHTML = `
            <div class="message-header">
                <strong>${msg.profiles.email}</strong>
                <span>${new Date(msg.created_at).toLocaleTimeString()} ${msg.is_edited ? '(edited)' : ''}</span>
            </div>
            <div class="message-content">${msg.content}</div>
            <div class="message-actions">
                ${ownerActions}
                <button onclick="alert('Full emoji picker coming soon!')">😀 React</button>
            </div>
        `;
        messageList.appendChild(div);
    });
    messageList.scrollTop = messageList.scrollHeight;
}

// --- Sending, Editing, Deleting ---
document.getElementById('send-btn').addEventListener('click', async () => {
    const content = messageInput.value.trim();
    if (!content) return;

    messageInput.value = '';
    
    // Check for commands (like clearing channel)
    if (content === '/clear' && currentProfile?.is_admin) {
        await supabase.from('messages').delete().eq('channel_id', currentChannel);
        return;
    }

    await supabase.from('messages').insert([{ 
        user_id: currentUser.id, 
        content: content,
        channel_id: currentChannel 
    }]);
});

window.deleteMessage = async (id) => {
    if(confirm("Are you sure you want to delete this?")) {
        await supabase.from('messages').delete().eq('id', id);
    }
};

window.editMessage = async (id, oldContent) => {
    const newContent = prompt("Edit message:", oldContent);
    if (newContent && newContent !== oldContent) {
        await supabase.from('messages').update({ content: newContent, is_edited: true }).eq('id', id);
    }
};

// --- Realtime ---
function subscribeToRealtime() {
    supabase.channel('public-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadMessages)
        .subscribe();
}

init();

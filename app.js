import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const authSection = document.getElementById('auth-section');
const chatSection = document.getElementById('chat-section');
const adminPanel = document.getElementById('admin-panel');
const messageList = document.getElementById('message-list');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const messageInput = document.getElementById('message-input');
const authError = document.getElementById('auth-error');

let currentUser = null;
let currentProfile = null;

// Initialize Application
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await handleLoginSuccess(session.user);
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
            handleLoginSuccess(session.user);
        } else {
            handleLogoutSuccess();
        }
    });
}

// Authentication Logic
async function handleLoginSuccess(user) {
    currentUser = user;
    authSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    
    // Fetch user profile to check admin status
    const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
        
    if (data && data.is_admin) {
        currentProfile = data;
        adminPanel.classList.remove('hidden');
    }

    loadMessages();
    subscribeToMessages();
}

function handleLogoutSuccess() {
    currentUser = null;
    currentProfile = null;
    authSection.classList.remove('hidden');
    chatSection.classList.add('hidden');
    adminPanel.classList.add('hidden');
    messageList.innerHTML = '';
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({
        email: emailInput.value,
        password: passwordInput.value,
    });
    if (error) authError.textContent = error.message;
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const { error } = await supabase.auth.signUp({
        email: emailInput.value,
        password: passwordInput.value,
    });
    if (error) {
        authError.textContent = error.message;
    } else {
        authError.textContent = "Check your email for the confirmation link.";
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
});

// Chat Logic
async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(email)')
        .order('created_at', { ascending: true });
        
    if (!error && data) {
        messageList.innerHTML = '';
        data.forEach(renderMessage);
        scrollToBottom();
    }
}

function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    const emailStr = msg.profiles ? msg.profiles.email : 'Unknown User';
    div.innerHTML = `<div class="sender">${emailStr}</div><div>${msg.content}</div>`;
    messageList.appendChild(div);
}

function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
}

document.getElementById('send-btn').addEventListener('click', async () => {
    const content = messageInput.value.trim();
    if (!content) return;

    messageInput.value = '';
    await supabase.from('messages').insert([
        { user_id: currentUser.id, content: content }
    ]);
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('send-btn').click();
    }
});

// Real-time Subscription
function subscribeToMessages() {
    supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            const { data } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', payload.new.user_id)
                .single();
                
            const newMsg = { ...payload.new, profiles: data };
            renderMessage(newMsg);
            scrollToBottom();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
        })
        .subscribe();
}

document.getElementById('clear-chat-btn').addEventListener('click', async () => {
    if (confirm("Are you sure you want to delete all messages?")) {
        const { error } = await supabase
            .from('messages')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        if (error) alert("Error deleting messages: " + error.message);
    }
});

init();

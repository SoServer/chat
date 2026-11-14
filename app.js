// ================= 配置区 =================
const SUPABASE_URL = 'https://djihtebfuaqjenkrmvfih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Sw6M_fWtUUOiIy_YisLw8g_IwlHyFxW';
const HCAPTCHA_SITE_KEY = '3bd4ddae-d49c-4ade-a5e6-ab2471c6a6d8';
// ==========================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
const messagesEl = $('messages-container');
const inputEl = $('chat-input');
const sendBtn = $('btn-send');

let currentUser = null;
let userRole = 'anonymous';
let channel = null;
let isSending = false;
const renderedIds = new Set();

// 1. 页面加载与 hCaptcha 初始化
window.onload = () => {
  if (window.hcaptcha) {
    hcaptcha.render('hcaptcha-container', {
      sitekey: HCAPTCHA_SITE_KEY,
      size: 'invisible',
      callback: (token) => doAnonymousLogin(token),
      'error-callback': () => showToast('人机验证失败，请刷新重试', 'error')
    });
    initAuth();
  } else {
    $('loading-text').textContent = '验证组件加载失败，请检查网络';
  }
};

// 2. 身份验证
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    onLoginSuccess();
  } else {
    $('loading-text').textContent = '正在进行安全验证...';
    hcaptcha.execute();
  }
}

async function doAnonymousLogin(captchaToken) {
  $('loading-text').textContent = '验证通过，正在连接...';
  const { data, error } = await db.auth.signInAnonymously({
    options: { captchaToken }
  });
  
  if (error) {
    $('loading-text').textContent = '登录失败：' + error.message;
    showToast('登录失败，请刷新重试', 'error');
    return;
  }
  
  currentUser = data.user;
  onLoginSuccess();
}

// 3. 登录成功后的初始化
function onLoginSuccess() {
  $('loading-overlay').style.display = 'none';
  
  // 获取用户角色（从 JWT app_metadata 中读取）
  const meta = currentUser.app_metadata || {};
  userRole = meta.role || 'anonymous';
  const quotaTier = meta.quota_tier || 'basic';
  
  // 更新 UI 头像与角色
  updateUserUI(userRole, quotaTier);
  
  // 检查昵称
  const savedName = localStorage.getItem('chat_nickname');
  if (savedName) {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.placeholder = `以 ${savedName} 的身份发言...`;
  } else {
    promptNickname();
  }
  
  loadHistory();
  subscribeRealtime();
}

// 4. UI 更新
function updateUserUI(role, quota) {
  const roleNames = {
    'anonymous': '匿名访客',
    'admin': '管理员',
    'executive': '行政员',
    'specialist': '专员'
  };
  $('user-role').textContent = roleNames[role] || '匿名访客';
  if (role === 'specialist') $('user-role').style.color = '#5f3dc4';
  if (role === 'executive') $('user-role').style.color = '#2b8a3e';
  if (role === 'admin') $('user-role').style.color = '#c92a2a';

  const name = localStorage.getItem('chat_nickname');
  if (name) {
    $('user-name').textContent = name;
    $('user-avatar').textContent = name.charAt(0).toUpperCase();
  }
}

function promptNickname() {
  let name = prompt('欢迎来到聊天室，请输入你的昵称（2-20字符）：');
  if (name && name.trim().length >= 2) {
    name = name.trim().slice(0, 20);
    localStorage.setItem('chat_nickname', name);
    updateUserUI(userRole, '');
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.placeholder = `以 ${name} 的身份发言...`;
    inputEl.focus();
  } else {
    showToast('昵称不符合要求，请刷新重试', 'error');
  }
}

// 5. 消息渲染
function appendMessage(msg) {
  if (!msg || !msg.id || renderedIds.has(msg.id)) return;
  renderedIds.add(msg.id);
  
  const isSelf = msg.username === localStorage.getItem('chat_nickname');
  const time = new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  
  const row = document.createElement('div');
  row.className = `msg-row ${isSelf ? 'self' : 'other'}`;
  
  // 解析特殊内容（图片/文件）
  let contentHtml = '';
  if (msg.content.startsWith('[IMG]') && msg.content.endsWith('[/IMG]')) {
    const url = msg.content.replace('[IMG]', '').replace('[/IMG]', '');
    contentHtml = `<img src="${url}" alt="图片" loading="lazy">`;
  } else if (msg.content.startsWith('[FILE]') && msg.content.endsWith('[/FILE]')) {
    const parts = msg.content.replace('[FILE]', '').replace('[/FILE]', '').split('|');
    const fileName = parts[0];
    const url = parts[1];
    contentHtml = `<a href="${url}" target="_blank" rel="noopener">📎 下载文件：${fileName}</a>`;
  } else {
    // 纯文本，防止 XSS
    contentHtml = escapeHTML(msg.content);
  }

  // 生成角色标签
  let roleTag = '';
  // 注意：普通用户查不到别人的角色，这里只有通过数据库联查才能实现，但目前数据库没存角色
  // 这里采用简单逻辑：如果发消息的人名字存在 localStorage 且自己不是普通用户，或者管理员发消息带标记（假设）

  row.innerHTML = `
    <div class="avatar" style="background: ${isSelf ? '#2d6cdf' : '#8b93a1'}">${(msg.username||'匿').charAt(0).toUpperCase()}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span>${msg.username || '匿名'}</span>
        <span>${time}</span>
      </div>
      <div class="bubble">${contentHtml}</div>
    </div>
  `;
  
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

// 6. 数据交互
async function loadHistory() {
  const { data, error } = await db.from('messages').select('*').eq('room', 'general').order('created_at', { ascending: true }).limit(100);
  if (!error && data) data.forEach(appendMessage);
}

function subscribeRealtime() {
  if (channel) db.removeChannel(channel);
  channel = db.channel('room-general')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room=eq.general' }, payload => {
      appendMessage(payload.new);
    })
    .subscribe((status) => {
      $('conn-status').textContent = status === 'SUBSCRIBED' ? '实时在线' : '正在重连...';
      $('conn-status').style.color = status === 'SUBSCRIBED' ? 'var(--success)' : 'var(--danger)';
    });
}

// 7. 发送消息（带后端拦截联动）
async function sendMessage() {
  const content = inputEl.value.trim();
  const username = localStorage.getItem('chat_nickname');
  if (!content || !username || isSending) return;
  
  isSending = true;
  sendBtn.disabled = true;
  inputEl.value = '';
  
  // 插入数据库
  const { error } = await db.from('messages').insert({ username, content, room: 'general' });
  
  if (error) {
    inputEl.value = content; // 恢复内容
    // 联动后端禁言触发器报错
    if (error.message.includes('你当前已被禁言')) {
      showToast('你已被禁言，无法发送消息', 'error');
    } else {
      showToast('发送失败：' + error.message, 'error');
    }
  }
  
  // 前端强制冷却（配合后端 2 秒防刷）
  setTimeout(() => {
    isSending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }, 1500);
}

// 8. 文件与图片上传（配额与格式严格校验）
async function handleFileUpload(file, type) {
  if (!file) return;
  const username = localStorage.getItem('chat_nickname');
  const isStaff = ['admin', 'executive', 'specialist'].includes(userRole);
  
  if (type === 'image') {
    // 前端预校验：大小 10MB，格式
    if (!file.type.startsWith('image/')) return showToast('只能上传图片格式', 'error');
    if (file.size > 10 * 1024 * 1024) return showToast('图片不能超过 10MB', 'error');
  } else {
    // 前端预校验：大小 50MB，禁止图片
    if (file.type.startsWith('image/')) return showToast('文件桶不允许上传图片，请使用图片按钮', 'error');
    if (file.size > 50 * 1024 * 1024) return showToast('文件不能超过 50MB', 'error');
  }

  const bucket = type === 'image' ? 'chat-images' : 'chat-files';
  const fileExt = file.name.split('.').pop();
  const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
  
  showToast('正在上传...', 'success');
  
  const { data, error } = await db.storage.from(bucket).upload(filePath, file);
  
  if (error) {
    // 联动后端 RLS 配额拦截报错
    if (error.message.includes('row-level security')) {
      showToast(isStaff ? '上传失败' : '今日上传配额已用尽 (100MB/200MB)', 'error');
    } else {
      showToast('上传失败：' + error.message, 'error');
    }
    return;
  }
  
  // 上传成功，生成消息内容
  let msgContent = '';
  if (type === 'image') {
    const { data: urlData } = db.storage.from(bucket).getPublicUrl(filePath);
    msgContent = `[IMG]${urlData.publicUrl}[/IMG]`;
  } else {
    // 文件是私有桶，生成 24 小时有效链接（或者通过 RLS 直接下载）
    const { data: signedData } = await db.storage.from(bucket).createSignedUrl(filePath, 86400);
    msgContent = `[FILE]${file.name}|${signedData.signedUrl}[/FILE]`;
  }
  
  await db.from('messages').insert({ username, content: msgContent, room: 'general' });
  showToast('发送成功', 'success');
}

// 9. 事件绑定
sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

$('btn-upload-image').addEventListener('click', () => $('file-image').click());
$('file-image').addEventListener('change', (e) => {
  if (e.target.files.length) handleFileUpload(e.target.files[0], 'image');
  e.target.value = ''; // 重置
});

$('btn-upload-file').addEventListener('click', () => $('file-doc').click());
$('file-doc').addEventListener('change', (e) => {
  if (e.target.files.length) handleFileUpload(e.target.files[0], 'file');
  e.target.value = ''; // 重置
});

// Toast 提示工具
function showToast(msg, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

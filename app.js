// =========================================
// BANGLADESH TOP EARN - Full App Logic
// =========================================
const ADMIN_EMAIL = 'mdjobayerislam2580@gmail.com';

// DEFAULT SETTINGS
const DEFAULT_SETTINGS = {
  activationFee: 20,
  referralBonus: 15,
  activationBonus: 10,
  minWithdrawal: 50,
  launchDate: '2026-04-28',
  noticeTicker: 'গিফট কোড বোনাস দেওয়া হয় — টেলিগ্রাম জয়েন করুন।',
  admin1link: 't.me/James_admin_BD',
  admin2link: 't.me/James_admin_BD',
  tgchannel: 'https://t.me/bd_unlimited_earn',
  fbpage: '',
  ytchannel: '',
  bkashNum: '01XXXXXXXXX',
  nagadNum: '01619789895',
};

const JOB_DEFAULTS = [
  { id:'facebook', name:'Facebook Sell', icon:'<i class="fa-brands fa-facebook"></i>', iconBg:'#1877f2', rate:14, password:'', locked:false, notice:'ফেসবুকের আপডেটের কারণে কাজ বন্ধ করা হলো আপডেট শেষ হলে আবার চালু করা হবে ❌' },
  { id:'gmail',    name:'Gmail Sell',    icon:'<i class="fa-brands fa-google"></i>', iconBg:'#e53e3e', rate:18, password:'@shanto@#&', locked:false, notice:'' },
  { id:'instagram',name:'Insta Sell',    icon:'<i class="fa-brands fa-instagram"></i>',iconBg:'linear-gradient(135deg,#833ab4,#e1306c)', rate:3, password:'@topearn08', locked:false, notice:'' },
  { id:'refer',    name:'রেফার',         icon:'<i class="fa-solid fa-gift"></i>', iconBg:'#8b5cf6', rate:0, locked:false, notice:'' },
  
];

// STATE
let currentUser = null;
let lastPage = 'home';
let payingMethod = '';

// STORAGE HELPERS
function getDB(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function setDB(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function getUsers() { return getDB('bte_users', []); }
function setUsers(u) { setDB('bte_users', u); }
function getSettings() { return { ...DEFAULT_SETTINGS, ...getDB('bte_settings', {}) }; }
function setSettings(s) { setDB('bte_settings', s); }
function getJobs() { return getDB('bte_jobs', JOB_DEFAULTS); }
function setJobs(j) { setDB('bte_jobs', j); }
function getSubmissions() { return getDB('bte_submissions', []); }
function setSubmissions(s) { setDB('bte_submissions', s); }
function getWithdrawals() { return getDB('bte_withdrawals', []); }
function setWithdrawals(w) { setDB('bte_withdrawals', w); }
function getGiftCodes() { return getDB('bte_giftcodes', []); }
function setGiftCodes(g) { setDB('bte_giftcodes', g); }
function getNotifications() { return getDB('bte_notifs_' + (currentUser?.id || ''), []); }
function addNotification(msg) {
  const notifs = getNotifications();
  notifs.unshift({ msg, time: Date.now() });
  setDB('bte_notifs_' + currentUser.id, notifs);
}

// TOAST
function toast(msg, dur=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// AUTH
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((b,i)=>b.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='signup')));
  document.getElementById('loginForm').classList.toggle('active', tab==='login');
  document.getElementById('signupForm').classList.toggle('active', tab==='signup');
}
function togglePass(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}
function generateId() { return Math.floor(10000 + Math.random() * 89999); }

function doRegister() {
  const refId = document.getElementById('refId').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;
  if (!name || !email || !pass) return toast('Please fill all required fields.');
  if (pass !== pass2) return toast('Passwords do not match.');
  const users = getUsers();
  if (users.find(u => u.email === email)) return toast('Email already registered.');
  const newUser = {
    id: generateId(), name, email, pass, active: false,
    balance: 0, joinDate: Date.now(), referredBy: refId || null,
    referrals: [], submissions: [], withdrawals: []
  };
  users.push(newUser);
  // Give referral credit to referrer when they activate
  setUsers(users);
  toast('Account created! Please log in.');
  switchTab('login');
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  if (!email || !pass) return toast('Enter email and password.');
  const users = getUsers();
  const user = users.find(u => u.email === email && u.pass === pass);
  if (!user) return toast('Invalid email or password.');
  currentUser = user;
  loadApp();

}

function doLogout() {
  currentUser = null;
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('authScreen').classList.add('active');
  closeMenu();
}

function loadApp() {
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  updateUserUI();
  initProjects();
  startSiteAge();
  updateNoticeBar();
  showSection('home');
  // Show welcome modal on first login of session
  setTimeout(() => { document.getElementById('welcomeModal').style.display = 'flex'; }, 800);
  // Admin menu
  const isAdmin = currentUser.email === ADMIN_EMAIL;
  document.getElementById('adminMenuItem').style.display = isAdmin ? 'block' : 'none';
}

function updateUserUI() {
  const u = currentUser;
  document.getElementById('welcomeName').textContent = u.name;
  document.getElementById('walletBal').textContent = u.balance.toFixed(2);
  document.getElementById('walletBig').textContent = u.balance.toFixed(2);
  document.getElementById('sideMenuName').textContent = u.name;
  document.getElementById('sideMenuId').textContent = 'ID: ' + u.id;
  document.getElementById('sideMenuBal').textContent = u.balance.toFixed(2);
  document.getElementById('sideMenuSince').textContent = new Date(u.joinDate).toLocaleDateString('en',{month:'short',year:'numeric'});
  const statusEl = document.getElementById('sideMenuStatus');
  if (u.active) { statusEl.textContent = '● Active'; statusEl.className = 'side-status active-status'; }
  else { statusEl.textContent = '● Inactive'; statusEl.className = 'side-status'; }
  document.getElementById('inactiveBanner').style.display = u.active ? 'none' : 'block';
  const aw = document.getElementById('activeWalletWarn');
  const ws = document.getElementById('withdrawSection');
  if (u.active) { aw.style.display='none'; ws.style.display='block'; } else { aw.style.display='block'; ws.style.display='none'; }
  document.getElementById('profileName').value = u.name;
  document.getElementById('profileEmail').value = u.email;
  // Ref link
  document.getElementById('refLinkBox').textContent = window.location.origin + '/?ref=' + u.id;
  // Team levels
  renderTeamLevels();
}

function updateNoticeBar() {
  const s = getSettings();
  document.getElementById('noticeTicker').textContent = s.noticeTicker || DEFAULT_SETTINGS.noticeTicker;
}

// PROJECTS GRID
function initProjects() {
  const jobs = getJobs();
  const grid = document.getElementById('projectsGrid');
  grid.innerHTML = '';
  jobs.forEach(job => {
    const div = document.createElement('div');
    div.className = 'project-item';
    const bgStyle = job.iconBg.includes('gradient') ? `background:${job.iconBg}` : `background:${job.iconBg}`;
    div.innerHTML = `
      <div class="proj-icon" style="${bgStyle}">
        <span>${job.icon}</span>
        ${job.locked ? '<span class="proj-locked">🔒</span>' : ''}
      </div>
      <div class="proj-label">${job.name}</div>`;
    div.onclick = () => handleProjectClick(job);
    grid.appendChild(div);
  });
}

function handleProjectClick(job) {
  if (!currentUser.active && job.id !== 'giftcode') {
    showActivate(); return;
  }
  if (job.locked) { toast('This feature is coming soon!'); return; }
  if (job.id === 'refer') { showSection('team'); return; }
  if (job.id === 'giftcode') { showGiftCodeInput(); return; }
  if (job.id === 'leadership' || job.id === 'target') { toast('Coming soon!'); return; }
  if (['facebook','gmail','instagram'].includes(job.id)) {
    showJobPage(job); return;
  }
  toast('Coming soon!');
}

function showJobPage(job) {
  // Update rate and notice
  document.getElementById('rate-' + job.id).textContent = 'Rate: ৳' + job.rate.toFixed(2);
  const noticeEl = document.getElementById('notice-' + job.id);
  if (noticeEl) {
    if (job.password) {
      noticeEl.innerHTML = `🔑 <div><strong>ব্যবহারের পাসওয়ার্ড:</strong><br/><span style="color:#b45309;font-weight:600">${job.password}</span> <button onclick="navigator.clipboard.writeText('${job.password}');toast('Copied!')" style="background:#555;color:#fff;border:none;padding:2px 8px;border-radius:6px;font-size:11px;cursor:pointer">COPY</button></div>`;
    } else if (job.notice) {
      noticeEl.textContent = job.notice;
    } else { noticeEl.innerHTML = ''; }
  }
  showSection('job-' + job.id);
}

// GIFT CODE
function showGiftCodeInput() {
  const code = prompt('Enter your gift code:');
  if (!code) return;
  const codes = getGiftCodes();
  const gc = codes.find(c => c.code.toUpperCase() === code.toUpperCase() && !c.used);
  if (!gc) { toast('Invalid or already used gift code!'); return; }
  gc.used = true;
  gc.usedBy = currentUser.id;
  gc.usedAt = Date.now();
  setGiftCodes(codes);
  currentUser.balance += gc.amount;
  saveCurrentUser();
  updateUserUI();
  toast('🎉 Gift code redeemed! +৳' + gc.amount);
}

// SITE AGE COUNTER
function startSiteAge() {
  function update() {
    const s = getSettings();
    const launch = new Date(s.launchDate || DEFAULT_SETTINGS.launchDate).getTime();
    const diff = Date.now() - launch;
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('siteAge').innerHTML =
      `<div class="age-box"><div class="age-num">${String(days).padStart(2,'0')}</div><div class="age-label">দিন</div></div>
       <div class="age-box"><div class="age-num">${String(hrs).padStart(2,'0')}</div><div class="age-label">ঘন্টা</div></div>
       <div class="age-box"><div class="age-num">${String(mins).padStart(2,'0')}</div><div class="age-label">মিনিট</div></div>
       <div class="age-box"><div class="age-num">${String(secs).padStart(2,'0')}</div><div class="age-label">সেকেন্ড</div></div>`;
  }
  update(); setInterval(update, 1000);
}

// NAVIGATION
function showSection(sec) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + sec);
  if (pg) { pg.classList.add('active'); lastPage = sec; }
  if (sec === 'admin') { renderAdminPanel(); }
  if (sec === 'wallet') { renderPaymentHistory(); }
  if (sec === 'notifications') { renderNotifications(); }
  if (sec === 'team') { renderTeamLevels(); }
  if (sec === 'help') { updateSupportLinks(); }
}
function goBack() { showSection(lastPage === 'history' ? 'home' : lastPage); }

function updateSupportLinks() {
  const s = getSettings();
  ['fbpage','tgchannel','ytchannel'].forEach(k => {
    const el = document.getElementById('link-' + k);
    if (el && s[k]) el.href = s[k];
  });
  const admin1 = document.getElementById('link-admin1');
  if (admin1 && s.admin1link) admin1.href = s.admin1link;
}

// TEAM
function renderTeamLevels() {
  if (!currentUser) return;
  const users = getUsers();
  const myRefs = users.filter(u => u.referredBy == currentUser.id);
  document.getElementById('teamSize').textContent = myRefs.length;
  // Levels (simplified - level 1 = direct, level 2 = their referrals, etc.)
  let html = '';
  for (let l = 1; l <= 5; l++) {
    let count = 0;
    if (l === 1) count = myRefs.length;
    html += `<div class="level-row"><span class="level-label">Level ${l} (${count})</span><button class="btn-view" onclick="viewLevel(${l})">View</button></div>`;
  }
  document.getElementById('teamLevels').innerHTML = html;
}

function viewLevel(l) { toast('Level ' + l + ' team members coming soon.'); }

function copyRefLink() {
  const link = document.getElementById('refLinkBox').textContent;
  navigator.clipboard.writeText(link).then(() => toast('Referral link copied! 📋'));
}

// JOB SUBMISSION
function submitJob(jobId) {
  if (!currentUser.active) { showActivate(); return; }
  const jobs = getJobs();
  const job = jobs.find(j => j.id === jobId);
  let data = {};
  if (jobId === 'facebook') {
    data = { uid: document.getElementById('fb-uid').value.trim(), email: document.getElementById('fb-email').value.trim(), pass: document.getElementById('fb-pass').value, fa2: document.getElementById('fb-2fa').value.trim() };
    if (!data.uid || !data.email || !data.pass) return toast('Please fill all fields.');
  } else if (jobId === 'gmail') {
    data = { email: document.getElementById('gm-email').value.trim(), pass: document.getElementById('gm-pass').value };
    if (!data.email || !data.pass) return toast('Please fill all fields.');
  } else if (jobId === 'instagram') {
    data = { user: document.getElementById('ig-user').value.trim(), pass: document.getElementById('ig-pass').value, fa2: document.getElementById('ig-2fa').value.trim() };
    if (!data.user || !data.pass) return toast('Please fill all fields.');
  }
  const submissions = getSubmissions();
  submissions.push({ id: Date.now(), userId: currentUser.id, userName: currentUser.name, jobId, data, rate: job?.rate || 0, status:'pending', time: Date.now() });
  setSubmissions(submissions);
  toast('✅ Submitted successfully! Awaiting approval.');
  // Clear fields
  if (jobId === 'facebook') { ['fb-uid','fb-email','fb-pass','fb-2fa'].forEach(i => document.getElementById(i).value=''); }
  if (jobId === 'gmail') { ['gm-email','gm-pass'].forEach(i => document.getElementById(i).value=''); }
  if (jobId === 'instagram') { ['ig-user','ig-pass','ig-2fa'].forEach(i => document.getElementById(i).value=''); }
}

function viewHistory(jobId) {
  const submissions = getSubmissions().filter(s => s.userId === currentUser.id && s.jobId === jobId);
  document.getElementById('historyTitle').textContent = jobId.charAt(0).toUpperCase() + jobId.slice(1) + ' History';
  let html = '';
  if (!submissions.length) html = '<p class="empty-msg">No history yet.</p>';
  else submissions.reverse().forEach(s => {
    html += `<div class="submission-row">
      <div><strong>#${s.id}</strong></div>
      <div class="sub-meta">${new Date(s.time).toLocaleString()}</div>
      <div class="sub-meta">Rate: ৳${s.rate}</div>
      <span class="sub-status sub-${s.status}">${s.status.toUpperCase()}</span>
    </div>`;
  });
  document.getElementById('historyList').innerHTML = html;
  showSection('history');
}

// WALLET
function renderPaymentHistory() {
  const wds = getWithdrawals().filter(w => w.userId === currentUser.id);
  if (!wds.length) { document.getElementById('paymentHistory').innerHTML = '<p class="empty-msg">No transactions yet.</p>'; return; }
  let html = '';
  wds.reverse().forEach(w => {
    html += `<div class="withdraw-row">
      <div><strong>৳${w.amount}</strong> via ${w.method}</div>
      <div class="sub-meta">${w.number} — ${new Date(w.time).toLocaleString()}</div>
      <span class="sub-status sub-${w.status}">${w.status.toUpperCase()}</span>
    </div>`;
  });
  document.getElementById('paymentHistory').innerHTML = html;
}

function doWithdraw() {
  const s = getSettings();
  const amt = parseFloat(document.getElementById('withdrawAmt').value);
  const num = document.getElementById('withdrawNum').value.trim();
  if (!amt || amt < s.minWithdrawal) return toast('Minimum withdrawal is ৳' + s.minWithdrawal);
  if (!num) return toast('Enter bKash/Nagad number.');
  if (currentUser.balance < amt) return toast('Insufficient balance.');
  const wds = getWithdrawals();
  wds.push({ id: Date.now(), userId: currentUser.id, userName: currentUser.name, amount: amt, number: num, method:'bKash/Nagad', status:'pending', time: Date.now() });
  setWithdrawals(wds);
  currentUser.balance -= amt;
  saveCurrentUser();
  updateUserUI();
  renderPaymentHistory();
  toast('Withdrawal request submitted!');
  document.getElementById('withdrawAmt').value = '';
  document.getElementById('withdrawNum').value = '';
}

// PROFILE
function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  const curPass = document.getElementById('currentPass').value;
  const newPass = document.getElementById('newPass').value;
  if (!name) return toast('Name required.');
  currentUser.name = name;
  if (curPass && newPass) {
    if (curPass !== currentUser.pass) return toast('Current password is incorrect.');
    currentUser.pass = newPass;
  }
  saveCurrentUser();
  updateUserUI();
  toast('Profile saved!');
}

function saveCurrentUser() {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === currentUser.id);
  if (idx >= 0) { users[idx] = currentUser; setUsers(users); }
}

// ACTIVATION
function showActivate() {
  const s = getSettings();
  document.getElementById('activeFeeDisplay').textContent = s.activationFee.toFixed(2);
  document.getElementById('activateModal').style.display = 'flex';
}
function proceedActivate() {
  const s = getSettings();
  document.getElementById('activateModal').style.display = 'none';
  document.getElementById('payableAmt').textContent = s.activationFee.toFixed(2);
  document.getElementById('paymentModal').style.display = 'flex';
}
function choosePay(method) {
  payingMethod = method;
  const s = getSettings();
  document.getElementById('paymentModal').style.display = 'none';
  document.getElementById('payMethodTitle').textContent = method === 'bkash' ? 'bKash Payment' : 'Nagad Payment';
  document.getElementById('payInstAmt').textContent = s.activationFee;
  document.getElementById('payInstNumber').textContent = method === 'bkash' ? s.bkashNum : s.nagadNum;
  document.getElementById('payInstructModal').style.display = 'flex';
}
function confirmPayment() {
  const txn = document.getElementById('txnId').value.trim();
  if (!txn) return toast('Enter Transaction ID.');
  document.getElementById('payInstructModal').style.display = 'none';
  // Record pending payment - admin must verify
  const wds = getWithdrawals();
  wds.push({ id: Date.now(), userId: currentUser.id, userName: currentUser.name, amount: getSettings().activationFee, number: txn, method:'Activation via ' + payingMethod, status:'pending-activation', time: Date.now() });
  setWithdrawals(wds);
  toast('✅ Payment submitted! Your account will be activated shortly.');
  document.getElementById('txnId').value = '';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function openLink(key) {
  const s = getSettings();
  if (s[key]) window.open(s[key], '_blank');
  else toast('Link not configured yet.');
}

// NOTIFICATIONS
function renderNotifications() {
  const notifs = getNotifications();
  if (!notifs.length) { document.getElementById('notifList').innerHTML = '<p class="empty-msg">No notifications.</p>'; return; }
  document.getElementById('notifList').innerHTML = notifs.map(n => `<div class="submission-row"><div>${n.msg}</div><div class="sub-meta">${new Date(n.time).toLocaleString()}</div></div>`).join('');
}

// MENU
function openMenu() {
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('menuOverlay').classList.add('open');
}
function closeMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('menuOverlay').classList.remove('open');
}

// ============================================
// ADMIN PANEL
// ============================================
function adminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-pane').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('admin-' + tab).classList.add('active');
  if (tab === 'users') renderAdminUsers();
  if (tab === 'jobs') renderJobSettings();
  if (tab === 'settings') loadSettingsForm();
  if (tab === 'withdrawals') renderAdminWithdrawals();
  if (tab === 'dashboard') renderAdminDashboard();
}

function renderAdminPanel() {
  if (currentUser?.email !== ADMIN_EMAIL) return;
  renderAdminDashboard();
}

function renderAdminDashboard() {
  const users = getUsers();
  const subs = getSubmissions();
  const wds = getWithdrawals().filter(w => w.status === 'pending' || w.status === 'pending-activation');
  document.getElementById('stat-users').textContent = users.length;
  document.getElementById('stat-active').textContent = users.filter(u=>u.active).length;
  document.getElementById('stat-jobs').textContent = subs.length;
  document.getElementById('stat-pending').textContent = wds.length;
  renderGiftCodes();
}

function renderAdminUsers() {
  const search = document.getElementById('searchUser')?.value.toLowerCase() || '';
  const users = getUsers().filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  if (!users.length) { document.getElementById('adminUsersList').innerHTML = '<p class="empty-msg">No users found.</p>'; return; }
  document.getElementById('adminUsersList').innerHTML = users.map(u => `
    <div class="user-row">
      <div class="user-row-top">
        <span class="user-row-name">${u.name}</span>
        <span class="user-status-badge ${u.active ? 'badge-active':'badge-inactive'}">${u.active?'Active':'Inactive'}</span>
      </div>
      <div class="user-row-meta">${u.email} | ID: ${u.id} | ৳${u.balance.toFixed(2)}</div>
      <div class="user-row-meta">Joined: ${new Date(u.joinDate).toLocaleDateString()}</div>
      <div class="user-row-actions">
        ${u.active
          ? `<button class="btn-sm-red" onclick="adminDeactivate(${u.id})">Deactivate</button>`
          : `<button class="btn-sm-green" onclick="adminActivate(${u.id})">Activate</button>`}
        <button class="btn-sm-blue" onclick="adminAddBalance(${u.id})">Add Balance</button>
        <button class="btn-sm-red" onclick="adminDeductBalance(${u.id})">Deduct</button>
      </div>
    </div>`).join('');
}

function adminActivate(userId) {
  const users = getUsers();
  const u = users.find(u => u.id === userId);
  if (!u) return;
  u.active = true;
  const s = getSettings();
  u.balance += s.activationBonus;
  // Give referral bonus to referrer
  if (u.referredBy) {
    const ref = users.find(r => r.id == u.referredBy);
    if (ref) { ref.balance += s.referralBonus; }
  }
  setUsers(users);
  if (currentUser.id === userId) { currentUser = u; updateUserUI(); }
  renderAdminUsers();
  renderAdminDashboard();
  toast('User activated! Bonus applied.');
}

function adminDeactivate(userId) {
  const users = getUsers();
  const u = users.find(u => u.id === userId);
  if (u) { u.active = false; setUsers(users); renderAdminUsers(); toast('User deactivated.'); }
}

function adminAddBalance(userId) {
  const amt = parseFloat(prompt('Add amount (৳):'));
  if (!amt || isNaN(amt)) return;
  const users = getUsers();
  const u = users.find(u => u.id === userId);
  if (u) { u.balance += amt; setUsers(users); if (currentUser.id===userId){currentUser=u;updateUserUI();} renderAdminUsers(); toast('Balance added.'); }
}

function adminDeductBalance(userId) {
  const amt = parseFloat(prompt('Deduct amount (৳):'));
  if (!amt || isNaN(amt)) return;
  const users = getUsers();
  const u = users.find(u => u.id === userId);
  if (u) { u.balance = Math.max(0, u.balance - amt); setUsers(users); if(currentUser.id===userId){currentUser=u;updateUserUI();} renderAdminUsers(); toast('Balance deducted.'); }
}

function renderJobSettings() {
  const jobs = getJobs();
  document.getElementById('jobSettingsList').innerHTML = jobs.map(j => `
    <div class="job-settings-item">
      <span style="font-weight:600">${j.name}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:#888">Rate ৳</span>
        <input type="number" value="${j.rate}" id="rate-set-${j.id}" style="width:80px"/>
        <button class="btn-sm-blue" onclick="saveJobRate('${j.id}')">Save</button>
        <button class="btn-sm-${j.locked?'green':'red'}" onclick="toggleJobLock('${j.id}')">${j.locked?'Unlock':'Lock'}</button>
      </div>
    </div>`).join('');

  // Job submissions
  const subs = getSubmissions();
  if (!subs.length) { document.getElementById('adminJobSubmissions').innerHTML = '<p class="empty-msg">No submissions yet.</p>'; return; }
  document.getElementById('adminJobSubmissions').innerHTML = subs.slice().reverse().map(s => `
    <div class="submission-row">
      <div><strong>${s.jobId.toUpperCase()}</strong> — ${s.userName} (ID:${s.userId})</div>
      <div class="sub-meta">${new Date(s.time).toLocaleString()} | Rate: ৳${s.rate}</div>
      ${s.status==='pending' ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn-sm-green" onclick="approveJob(${s.id})">Approve</button><button class="btn-sm-red" onclick="rejectJob(${s.id})">Reject</button></div>` : `<span class="sub-status sub-${s.status}">${s.status.toUpperCase()}</span>`}
    </div>`).join('');

  // Job password settings
  document.getElementById('jobPasswordSettings').innerHTML = jobs.filter(j=>['facebook','gmail','instagram'].includes(j.id)).map(j => `
    <div class="job-settings-item">
      <span style="font-weight:600">${j.name} Password</span>
      <div style="display:flex;gap:8px">
        <input type="text" value="${j.password||''}" id="pass-set-${j.id}" placeholder="Set password"/>
        <button class="btn-sm-blue" onclick="saveJobPass('${j.id}')">Save</button>
      </div>
    </div>
    <div style="margin-bottom:8px;padding:0 8px">
      <label class="field-label" style="font-size:12px">Notice Text</label>
      <textarea id="notice-set-${j.id}" rows="2" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px">${j.notice||''}</textarea>
      <button class="btn-sm-blue" style="margin-top:4px" onclick="saveJobNotice('${j.id}')">Save Notice</button>
    </div>`).join('');
}

function saveJobRate(jobId) {
  const val = parseFloat(document.getElementById('rate-set-' + jobId).value);
  if (isNaN(val)) return;
  const jobs = getJobs();
  const j = jobs.find(j => j.id === jobId);
  if (j) { j.rate = val; setJobs(jobs); initProjects(); toast('Rate saved.'); }
}

function toggleJobLock(jobId) {
  const jobs = getJobs();
  const j = jobs.find(j => j.id === jobId);
  if (j) { j.locked = !j.locked; setJobs(jobs); initProjects(); renderJobSettings(); toast(j.locked?'Job locked.':'Job unlocked.'); }
}

function saveJobPass(jobId) {
  const val = document.getElementById('pass-set-' + jobId).value;
  const jobs = getJobs();
  const j = jobs.find(j => j.id === jobId);
  if (j) { j.password = val; setJobs(jobs); toast('Password saved.'); }
}

function saveJobNotice(jobId) {
  const val = document.getElementById('notice-set-' + jobId).value;
  const jobs = getJobs();
  const j = jobs.find(j => j.id === jobId);
  if (j) { j.notice = val; setJobs(jobs); toast('Notice saved.'); }
}

function approveJob(subId) {
  const subs = getSubmissions();
  const s = subs.find(s => s.id === subId);
  if (!s) return;
  s.status = 'approved';
  setSubmissions(subs);
  const users = getUsers();
  const u = users.find(u => u.id === s.userId);
  if (u) { u.balance += s.rate; if(currentUser.id===u.id){currentUser=u;updateUserUI();} setUsers(users); }
  renderJobSettings();
  toast('Job approved! ৳' + s.rate + ' added to user.');
}

function rejectJob(subId) {
  const subs = getSubmissions();
  const s = subs.find(s => s.id === subId);
  if (s) { s.status = 'rejected'; setSubmissions(subs); renderJobSettings(); toast('Job rejected.'); }
}

function loadSettingsForm() {
  const s = getSettings();
  document.getElementById('sett-activefee').value = s.activationFee;
  document.getElementById('sett-refbonus').value = s.referralBonus;
  document.getElementById('sett-activebonus').value = s.activationBonus;
  document.getElementById('sett-minwithdraw').value = s.minWithdrawal;
  document.getElementById('sett-launchdate').value = s.launchDate;
  document.getElementById('admin1link').value = s.admin1link || '';
  document.getElementById('admin2link').value = s.admin2link || '';
  document.getElementById('tgchannel').value = s.tgchannel || '';
  document.getElementById('fbpage').value = s.fbpage || '';
  document.getElementById('ytchannel').value = s.ytchannel || '';
  document.getElementById('bkashNum').value = s.bkashNum || '';
  document.getElementById('nagadNum').value = s.nagadNum || '';
}

function saveSettings() {
  const s = getSettings();
  s.activationFee = parseFloat(document.getElementById('sett-activefee').value) || 30;
  s.referralBonus = parseFloat(document.getElementById('sett-refbonus').value) || 20;
  s.activationBonus = parseFloat(document.getElementById('sett-activebonus').value) || 20;
  s.minWithdrawal = parseFloat(document.getElementById('sett-minwithdraw').value) || 50;
  s.launchDate = document.getElementById('sett-launchdate').value;
  setSettings(s);
  toast('Settings saved!');
}

function saveContacts() {
  const s = getSettings();
  s.admin1link = document.getElementById('admin1link').value.trim();
  s.admin2link = document.getElementById('admin2link').value.trim();
  s.tgchannel = document.getElementById('tgchannel').value.trim();
  s.fbpage = document.getElementById('fbpage').value.trim();
  s.ytchannel = document.getElementById('ytchannel').value.trim();
  s.bkashNum = document.getElementById('bkashNum').value.trim();
  s.nagadNum = document.getElementById('nagadNum').value.trim();
  setSettings(s);
  toast('Contacts saved!');
}

function sendNotification() {
  const msg = document.getElementById('notifMsg').value.trim();
  if (!msg) return toast('Enter message.');
  const users = getUsers();
  users.forEach(u => {
    const notifs = getDB('bte_notifs_' + u.id, []);
    notifs.unshift({ msg, time: Date.now() });
    setDB('bte_notifs_' + u.id, notifs);
  });
  document.getElementById('notifMsg').value = '';
  toast('Notification sent to all users!');
}

function updateTicker() {
  const msg = document.getElementById('tickerMsg').value.trim();
  if (!msg) return toast('Enter notice text.');
  const s = getSettings();
  s.noticeTicker = msg;
  setSettings(s);
  updateNoticeBar();
  document.getElementById('tickerMsg').value = '';
  toast('Ticker updated!');
}

function createGiftCode() {
  const code = document.getElementById('giftCodeInput').value.trim().toUpperCase();
  const amt = parseFloat(document.getElementById('giftAmtInput').value);
  if (!code || !amt) return toast('Enter code and amount.');
  const codes = getGiftCodes();
  if (codes.find(c => c.code === code)) return toast('Code already exists!');
  codes.push({ code, amount: amt, used: false, createdAt: Date.now() });
  setGiftCodes(codes);
  document.getElementById('giftCodeInput').value = '';
  document.getElementById('giftAmtInput').value = '';
  renderGiftCodes();
  toast('Gift code created!');
}

function renderGiftCodes() {
  const codes = getGiftCodes();
  if (!codes.length) { document.getElementById('giftCodeList').innerHTML = '<p class="empty-msg">No gift codes yet.</p>'; return; }
  document.getElementById('giftCodeList').innerHTML = codes.map(c => `
    <div class="gift-code-item">
      <strong>${c.code}</strong>
      <span>৳${c.amount}</span>
      <span class="${c.used?'sub-rejected':'sub-approved'} sub-status">${c.used?'Used':'Active'}</span>
      <button class="btn-sm-red" onclick="deleteGiftCode('${c.code}')">Delete</button>
    </div>`).join('');
}

function deleteGiftCode(code) {
  const codes = getGiftCodes().filter(c => c.code !== code);
  setGiftCodes(codes);
  renderGiftCodes();
  toast('Gift code deleted.');
}

function renderAdminWithdrawals() {
  const wds = getWithdrawals();
  if (!wds.length) { document.getElementById('adminWithdrawList').innerHTML = '<p class="empty-msg">No withdrawals yet.</p>'; return; }
  document.getElementById('adminWithdrawList').innerHTML = wds.slice().reverse().map(w => `
    <div class="withdraw-row">
      <div><strong>${w.userName}</strong> (ID:${w.userId})</div>
      <div class="sub-meta">৳${w.amount} via ${w.method} — ${w.number}</div>
      <div class="sub-meta">${new Date(w.time).toLocaleString()}</div>
      ${w.status==='pending'||w.status==='pending-activation' ? `
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-sm-green" onclick="approveWithdrawal(${w.id},'${w.status}')">Approve</button>
          <button class="btn-sm-red" onclick="rejectWithdrawal(${w.id})">Reject</button>
        </div>` : `<span class="sub-status sub-${w.status==='approved'?'approved':'rejected'}">${w.status.toUpperCase()}</span>`}
    </div>`).join('');
}

function approveWithdrawal(wId, status) {
  const wds = getWithdrawals();
  const w = wds.find(x => x.id === wId);
  if (!w) return;
  w.status = 'approved';
  if (status === 'pending-activation') {
    const users = getUsers();
    const u = users.find(u => u.id === w.userId);
    if (u) {
      u.active = true;
      const s = getSettings();
      u.balance += s.activationBonus;
      if (u.referredBy) {
        const ref = users.find(r => r.id == u.referredBy);
        if (ref) ref.balance += s.referralBonus;
      }
      setUsers(users);
      if (currentUser.id === u.id) { currentUser = u; updateUserUI(); }
      toast('Activation approved! User is now active.');
    }
  } else { toast('Withdrawal approved!'); }
  setWithdrawals(wds);
  renderAdminWithdrawals();
  renderAdminDashboard();
}

function rejectWithdrawal(wId) {
  const wds = getWithdrawals();
  const w = wds.find(x => x.id === wId);
  if (!w) return;
  // Refund balance if normal withdrawal
  if (w.status === 'pending') {
    const users = getUsers();
    const u = users.find(u => u.id === w.userId);
    if (u) { u.balance += w.amount; setUsers(users); if(currentUser.id===u.id){currentUser=u;updateUserUI();} }
  }
  w.status = 'rejected';
  setWithdrawals(wds);
  renderAdminWithdrawals();
  toast('Withdrawal rejected. Balance refunded.');
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  // Check URL for ref param
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) { const refInput = document.getElementById('refId'); if(refInput) refInput.value = ref; switchTab('signup'); }
});
// এডমিন প্যানেল ট্যাব সুইচিং
function adminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-pane').forEach(p => p.classList.remove('active'));
  
  event.currentTarget.classList.add('active');
  document.getElementById('admin-' + tab).classList.add('active');
  
  if (tab === 'dashboard') renderAdminDashboard();
  if (tab === 'users') renderAdminUsers();
  if (tab === 'withdrawals') renderAdminWithdrawals();
}

// এডমিন ড্যাশবোর্ড রেন্ডারিং
function renderAdminDashboard() {
  const users = getUsers();
  const subs = getSubmissions();
  const wds = getWithdrawals();
  
  document.getElementById('stat-users').textContent = users.length;
  document.getElementById('stat-active').textContent = users.filter(u => u.active).length;
  document.getElementById('stat-jobs').textContent = subs.length;
  document.getElementById('stat-pending').textContent = wds.filter(w => w.status === 'pending').length;
}

// পেন্ডিং উইথড্রয়াল অ্যাপ্রুভ বা রিজেক্ট করা
function updateWithdrawStatus(wdId, status) {
  const wds = getWithdrawals();
  const wd = wds.find(w => w.id === wdId);
  if (wd) {
    wd.status = status;
    setWithdrawals(wds);
    toast('Withdrawal status updated!');
    renderAdminWithdrawals();
  }
}

function renderAdminWithdrawals() {
  const wds = getWithdrawals();
  const list = document.getElementById('adminWithdrawList');
  list.innerHTML = wds.filter(w => w.status === 'pending').map(w => `
    <div class="withdraw-row">
      <div><strong>${w.userName}</strong> - ৳${w.amount}</div>
      <div>Method: ${w.method} | Info: ${w.number}</div>
      <div class="admin-btns-row">
        <button class="btn-sm-green" onclick="updateWithdrawStatus(${w.id}, 'approved')">Approve</button>
        <button class="btn-sm-red" onclick="updateWithdrawStatus(${w.id}, 'rejected')">Reject</button>
      </div>
    </div>
  `).join('');
}

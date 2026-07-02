// ╔══════════════════════════════════════════╗
// ║            PERSISTENCE LAYER            ║
// ╚══════════════════════════════════════════╝

const STORAGE_PREFIX = 'nd-';

// ── localStorage 键名一览（统一前缀 nd-） ──
// nd-L-YYYY-MM-DD         → 听力打卡数据（按周）
// nd-V-{class}-{ISO周}-{type} → 复述视频记录（新课/复习课）
// nd-TPL-{class}-{ISO周}  → 复述模板追踪（提示卡/视频模板）
// nd-A-YYYY-MM-DD         → 出勤数据（按日）
// nd-leaves               → 请假/补课记录
// nd-TODO-{ISO周}         → 日历待办事项
// nd-contacts             → 提醒已联系家长记录
// nd-late-{class}-{ISO周} → 本周补交记录（纯手动添加）
// nd-report-text-{ISO周}  → 周报文本（看过程/看自己 input 内容）

// ---- Listening data: keyed by week Monday ----
function getListenKey(monday) {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return STORAGE_PREFIX + 'L-' + y + '-' + m + '-' + d;
}

const DEFAULT_MONDAY_KEY = getListenKey(new Date(2026, 4, 25)); // 2026-05-25

function loadListening(monday) {
  const key = getListenKey(monday);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  if (key === DEFAULT_MONDAY_KEY) return deepClone(DEFAULT_LISTENING);
  return null;
}

function saveListening(monday, data) {
  try {
    localStorage.setItem(getListenKey(monday), JSON.stringify(data));
  } catch (e) { console.error('Save failed:', e); }
}

function getOrCreateListening(monday) {
  let data = loadListening(monday);
  if (!data) {
    data = {};
    for (const cn of Object.keys(CLASSES)) {
      data[cn] = {};
      for (const s of getListeningStudents(cn)) {
        data[cn][s.name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
      }
    }
    saveListening(monday, data);
  }
  // Ensure all current students exist
  for (const cn of Object.keys(CLASSES)) {
    if (!data[cn]) data[cn] = {};
    for (const s of getListeningStudents(cn)) {
      if (!data[cn][s.name]) data[cn][s.name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
    }
  }
  return data;
}

// ---- Video homework data: keyed by ISO week ----
function getVideoKey(classId, dateStr, type) {
  return STORAGE_PREFIX + 'V-' + classId + '-' + dateStr + '-' + type;
}

// Lesson type helpers — support 'new', 'review'
function getLessonTypeLabel(type) {
  if (type === 'new') return '新课';
  if (type === 'review') return '复习课';
  return type;
}
function getLessonTypeIcon(type) {
  if (type === 'new') return '📘';
  if (type === 'review') return '📗';
  return '📚';
}
function getLessonTypeColor(type) {
  if (type === 'new') return '#5B8DEF';
  if (type === 'review') return '#E08B2A';
  return '#64748B';
}

function loadVideoData() {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX + 'V-')) {
      try { result[key] = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    }
  }
  return result;
}

// Video key migration: old format V-{cn}-{ISO_WEEK}-{type} → new format V-{cn}-{date}-{type}
// Called on page load and after importBackup().
// Idempotent: only migrates if old-format keys are detected.
function migrateVideoKeys() {
  // Collect old-format keys (contain a W\d+ segment)
  const keysToMigrate = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX + 'V-')) continue;
    if (key === STORAGE_PREFIX + 'V-MIGRATED-v2') continue;
    const parts = key.replace(STORAGE_PREFIX + 'V-', '').split('-');
    if (parts.some(p => /^W\d{1,2}$/.test(p))) {
      keysToMigrate.push(key);
    }
  }
  if (keysToMigrate.length === 0) return; // Nothing to migrate

  let migrated = 0;
  keysToMigrate.forEach(oldKey => {
    try {
      const raw = localStorage.getItem(oldKey);
      if (!raw) return;
      const rec = JSON.parse(raw);
      if (!rec.date || !rec.type) return;
      // Skip general_review records (feature rolled back)
      if (rec.type === 'general_review') { localStorage.removeItem(oldKey); return; }
      const newKey = getVideoKey(rec.className, rec.date, rec.type);
      // Preserve existing new-format record (don't overwrite user edits)
      if (!localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, raw);
        migrated++;
      }
      localStorage.removeItem(oldKey);
    } catch (e) {}
  });
  if (migrated > 0) console.log('Video key migration: ' + migrated + ' records moved to date-based keys');
  localStorage.setItem(STORAGE_PREFIX + 'V-MIGRATED-v2', '1');
}
migrateVideoKeys();

function getVideoRecord(className, dateStr, type) {
  const key = getVideoKey(className, dateStr, type);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const rec = JSON.parse(raw);
      let migrated = false;
      // Migrate: ensure retold & classContent exist
      if (!rec.retold) { rec.retold = {}; migrated = true; }
      if (!rec.classContent) { rec.classContent = ''; migrated = true; }
      // Ensure all current students exist in submissions
      const students = getAllStudents(className);
      students.forEach(s => {
        if (!(s.name in rec.submissions)) { rec.submissions[s.name] = false; migrated = true; }
        if (!(s.name in rec.retold)) { rec.retold[s.name] = ''; migrated = true; }
        // Migrate old boolean submissions to date strings
        const sub = rec.submissions[s.name];
        if (sub === true) { rec.submissions[s.name] = rec.date; migrated = true; }
      });
      // Persist migration so old data doesn't need re-migration on every load
      if (migrated) {
        try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e) {}
      }
      return rec;
    }
  } catch (e) {}
  return null;
}

// Scans localStorage for all video records across all classes and weeks
function getAllVideoRecords() {
  const records = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX + 'V-')) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const rec = JSON.parse(raw);
        // Migrate boolean submissions to date strings & persist
        let migrated = false;
        if (rec.submissions) {
          for (const name in rec.submissions) {
            if (rec.submissions[name] === true) { rec.submissions[name] = rec.date; migrated = true; }
          }
        }
        if (migrated) {
          try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e) {}
        }
        records.push(rec);
      }
    } catch (e) {}
  }
  return records;
}

function ensureVideoRecord(className, type, dateStr) {
  let rec = getVideoRecord(className, dateStr, type);
  if (!rec) {
    const submissions = {}, retold = {};
    getAllStudents(className).forEach(s => { submissions[s.name] = false; retold[s.name] = ''; });
    rec = { date: dateStr, type, className, submissions, retold, classContent: '' };
    const key = getVideoKey(className, dateStr, type);
    localStorage.setItem(key, JSON.stringify(rec));
  }
  return rec;
}

function saveVideoRecord(rec) {
  const key = getVideoKey(rec.className, rec.date, rec.type);
  localStorage.setItem(key, JSON.stringify(rec));
}

function deleteVideoRecord(className, dateStr, type) {
  const key = getVideoKey(className, dateStr, type);
  localStorage.removeItem(key);
}

// ---- Template tracking (复述提示卡 / 复述视频模板) ----
function getTemplateKey(className, weekKey) {
  return STORAGE_PREFIX + 'TPL-' + className + '-' + weekKey;
}

function getTemplateTracking(className, weekKey) {
  const key = getTemplateKey(className, weekKey);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : { cardPublished: null, videoRecorded: null, rvCardPublished: null, rvVideoRecorded: null };
  } catch (e) { return { cardPublished: null, videoRecorded: null, rvCardPublished: null, rvVideoRecorded: null }; }
}

function setTemplateTracking(className, weekKey, data) {
  const key = getTemplateKey(className, weekKey);
  localStorage.setItem(key, JSON.stringify(data));
}

function toggleTemplateItem(className, weekKey, field) {
  const data = getTemplateTracking(className, weekKey);
  const today = new Date();
  const dateStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  if (data[field]) {
    data[field] = null;
  } else {
    data[field] = dateStr;
  }
  setTemplateTracking(className, weekKey, data);
  if (currentTab === 'calendar') renderWeeklyBoard(); else renderVideo();
}

// ---- Attendance data ----
function getAttKey(dateStr) {
  return STORAGE_PREFIX + 'A-' + dateStr;
}

function loadAttendance(dateStr) {
  const key = getAttKey(dateStr);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveAttendance(dateStr, data) {
  try {
    localStorage.setItem(getAttKey(dateStr), JSON.stringify(data));
  } catch (e) {}
}

// ---- Leave records ----
function getLeavesKey() { return STORAGE_PREFIX + 'leaves'; }
function loadLeaves() {
  try {
    const raw = localStorage.getItem(getLeavesKey());
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}
function saveLeaves(leaves) {
  localStorage.setItem(getLeavesKey(), JSON.stringify(leaves));
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

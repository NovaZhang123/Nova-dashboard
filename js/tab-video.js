// ╔══════════════════════════════════════════╗
// ║         TAB 2: VIDEO HOMEWORK           ║
// ╚══════════════════════════════════════════╝

function renderVideo() {
  const cls = CLASSES[currentClass];
  if (!cls) return;

  // Cycle-based: resolve actual lesson dates from anchor (handles schedule changes)
  const cycle = getVideoCycleDates(currentVideoCycle, currentClass);
  const cycleNewDate = cycle.newDateStr;
  const revDate = cycle.reviewDateObj;
  const revDateStr = cycle.reviewDateStr;

  let newRecord = getVideoRecord(currentClass, cycleNewDate, 'new');
  let reviewRecord = getVideoRecord(currentClass, revDateStr, 'review');

  // No cross-week pulling — each page shows exactly one cycle

  let html = '<div class="action-bar"><span class="hint">点击学生行切换提交状态 · 输入框记录复述内容</span>'
    + '<select onchange="currentClass=this.value;currentVideoCycle=getCurrentCycleAnchor();renderHeader();renderVideo()" style="margin-left:auto;padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:.85rem;font-family:inherit">';
  for (const cn of Object.keys(CLASSES)) {
    html += '<option value="' + cn + '"' + (cn === currentClass ? ' selected' : '') + '>' + cn + '</option>';
  }
  html += '</select></div>';

  // New lesson
  const newDateObj = new Date(cycleNewDate + 'T12:00:00');
  if (newRecord) {
    html += renderVideoSession(cls, cycleNewDate, newRecord, 'new');
  } else {
    html += renderVideoAddBtn('new', newDateObj, cycleNewDate);
  }
  // Review lesson
  if (reviewRecord) {
    html += renderVideoSession(cls, revDateStr, reviewRecord, 'review');
  } else {
    html += renderVideoAddBtn('review', revDate, revDateStr);
  }

  // Orphan lessons: extra video records that fall in the gap between this cycle's
  // review date and the next cycle's new-lesson date. E.g., a one-off class on
  // 2026-06-16 between old schedule (ends 6/13) and new schedule (starts 6/20).
  const allRecords = getAllVideoRecords().filter(r => r.className === currentClass);
  const nextAnchor = new Date(currentVideoCycle + 'T12:00:00');
  nextAnchor.setDate(nextAnchor.getDate() + 7);
  const nextCycle = getVideoCycleDates(dateStr(nextAnchor), currentClass);
  const gapStart = new Date(revDateStr + 'T00:00:00').getTime();
  const gapEnd = new Date(nextCycle.newDateStr + 'T00:00:00').getTime();
  const mainKeys = new Set([cycleNewDate, revDateStr]);

  let orphanCount = 0;
  allRecords.forEach(rec => {
    if (!rec.date) return;
    const t = new Date(rec.date + 'T12:00:00').getTime();
    if (t > gapStart && t < gapEnd && !mainKeys.has(rec.date)) {
      html += renderVideoSession(cls, rec.date, rec, rec.type || 'new');
      orphanCount++;
      console.log('[Orphan] Found:', rec.className, rec.date, rec.type);
    }
  });
  if (orphanCount > 0) console.log('[Orphan] Total:', orphanCount, '| gap:', new Date(gapStart), '→', new Date(gapEnd), '| records:', allRecords.map(r=>r.date));

  // Stats (include late submissions & orphan records)
  // Exclude left students from counts
  const leftNames = new Set(getAllStudents(currentClass).filter(s => {
    const cfg = getStudentCfg(currentClass, s.name);
    return cfg && cfg.leftDate;
  }).map(s => s.name));
  let total = 0, done = 0;
  [newRecord, reviewRecord].forEach(rec => {
    if (!rec) return;
    Object.keys(rec.submissions).forEach(name => {
      if (leftNames.has(name)) return;
      total++;
      if (rec.submissions[name]) done++;
    });
  });
  // Count late subs not already covered
  const lateWeekKey2 = getISOWeekKey(cycleNewDate);
  const lateSubs2 = loadLateSubs(currentClass, lateWeekKey2);
  const lateNames = new Set(lateSubs2.map(ls => ls.name));
  lateNames.forEach(n => {
    // Check if student is already done in all records — if not fully done, add late count
    let alreadyCounted = 0;
    [newRecord, reviewRecord].forEach(rec => {
      if (rec && rec.submissions[n]) alreadyCounted++;
    });
    const lateForStudent = lateSubs2.filter(ls => ls.name === n).length;
    const unaccounted = Math.max(0, lateForStudent - alreadyCounted);
    done += unaccounted;
  });
  // Don't change total — late subs are within the existing 2-lesson framework

  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;margin-top:16px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow)">'
    + '<div style="font-size:14px;font-weight:500">📊 周期进度：<span style="color:var(--green);font-weight:700">' + done + '/' + total + '</span> 已交'
    + (total > 0 ? ' (' + Math.round(done / total * 100) + '%)' : '') + '</div>'
    + '<button class="btn btn-primary" style="font-size:13px;padding:8px 18px" onclick="downloadVideoCard()">📥 下载卡片</button></div>';

  // Late submissions section (本周补交) — use ISO week of cycle anchor
  const lateWeekKey = getISOWeekKey(cycleNewDate);
  html += renderLateSubmissionsSection(currentClass, lateWeekKey);

  // Double-done section (两次打卡小明星)
  html += renderDoubleDoneSection(currentClass, cycleNewDate, newRecord, reviewRecord);

  html += '<div style="text-align:center;margin-top:8px">'
    + '<a href="javascript:switchTab(\'calendar\')" style="font-size:12px;color:var(--accent);text-decoration:none;font-weight:600">📅 查看全部班级周待办看板 →</a></div>';

  // Contact list at the bottom
  html += buildVideoContactList(currentClass, cycleNewDate, [newRecord, reviewRecord].filter(r => r));

  document.getElementById('videoContent').innerHTML = html;
}

function renderDoubleDoneSection(className, cycleNewDate, newRecord, reviewRecord) {
  // In cycle view, both records are already loaded from their correct ISO weeks.
  // No cross-week fallback needed.

  const hasNew = !!newRecord;
  const hasReview = !!reviewRecord;
  if (!hasNew || !hasReview) return '';

  const students = getAllStudents(className);
  const doubleDone = students.filter(s => {
    const newOk = newRecord && newRecord.submissions && newRecord.submissions[s.name];
    const reviewOk = reviewRecord && reviewRecord.submissions && reviewRecord.submissions[s.name];
    return newOk && reviewOk;
  });

  if (doubleDone.length === 0) {
    return '<div class="double-done-section">'
      + '<div class="double-done-header"><div class="double-done-title">🏆 本周两次打卡</div></div>'
      + '<div class="double-done-empty">💪 还没有小朋友完成两次打卡，继续加油！</div></div>';
  }

  const cardsHTML = doubleDone.map(s => `
    <div class="double-done-card">
      <span class="coin">🪙</span>
      <div class="name-cn">${escHtml(s.name)}</div>
      ${s.en ? '<div class="name-en">' + escHtml(s.en) + '</div>' : ''}
      <span class="badge">两次打卡 ✓</span>
    </div>
  `).join('');

  return '<div class="double-done-section">'
    + '<div class="double-done-header">'
    + '<div class="double-done-title">🏆 本周两次打卡</div>'
    + '<span class="double-done-count">' + doubleDone.length + ' 位小明星</span>'
    + '</div>'
    + '<div class="double-done-cards">' + cardsHTML + '</div>'
    + '<div class="double-done-download">'
    + '<button class="double-done-download-btn" onclick="downloadDoubleDoneCard(\'' + className + '\')">'
    + '📥 下载本周打卡卡片</button></div></div>';
}

// ╔══════════════════════════════════════════╗
// ║      LATE SUBMISSIONS (本周补交)         ║
// ╚══════════════════════════════════════════╝
// 纯手动管理 — 用户显式添加才会出现在面板中，不做自动扫描。
function getLateKey(className, weekKey) {
  return STORAGE_PREFIX + 'late-' + className + '-' + weekKey;
}
function loadLateSubs(className, weekKey) {
  const raw = localStorage.getItem(getLateKey(className, weekKey));
  return raw ? JSON.parse(raw) : [];
}
function saveLateSubs(className, weekKey, items) {
  const key = getLateKey(className, weekKey);
  if (items.length === 0) { localStorage.removeItem(key); return; }
  localStorage.setItem(key, JSON.stringify(items));
}
function deleteLateSub(className, weekKey, idx) {
  const items = loadLateSubs(className, weekKey);
  items.splice(idx, 1);
  saveLateSubs(className, weekKey, items);
  renderVideo();
}

function renderLateSubmissionsSection(className, weekKey) {
  // Only show items explicitly added via "+ 添加补交" — no auto-scanning
  const lateItems = loadLateSubs(className, weekKey);

  const addBtn = '<button class="late-submit-add-btn" onclick="openLateSubmitModal()">+ 添加补交</button>';

  if (lateItems.length === 0) {
    return '<div class="late-submit-section">'
      + '<div class="late-submit-header" style="justify-content:space-between"><div class="late-submit-title">📥 本周补交</div>' + addBtn + '</div>'
      + '<div class="late-submit-empty">本周暂无补交记录</div></div>';
  }

  const listHTML = lateItems.map((item, idx) => {
    return '<div class="late-submit-item">'
      + '<div class="student">'
      + '<span class="student-name">' + escHtml(item.name) + '</span>'
      + (item.en ? '<span class="student-en">' + escHtml(item.en) + '</span>' : '')
      + '</div>'
      + '<span class="lesson-tag">' + item.lessonType + ' · ' + item.lessonDateShort + '</span>'
      + '<span class="submit-date">补交于 ' + item.submitDateShort + '</span>'
      + '<button class="late-submit-del" onclick="event.stopPropagation();deleteLateSub(\'' + className + '\',\'' + weekKey + '\',' + idx + ')" title="删除此补交记录">✕</button>'
      + '</div>';
  }).join('');

  return '<div class="late-submit-section">'
    + '<div class="late-submit-header" style="justify-content:space-between">'
    + '<div style="display:flex;align-items:center;gap:10px"><div class="late-submit-title">📥 本周补交</div>'
    + '<span class="late-submit-count">' + lateItems.length + ' 条</span></div>'
    + addBtn + '</div>'
    + '<div class="late-submit-list">' + listHTML + '</div></div>';
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return (+parts[1]) + '月' + (+parts[2]) + '日';
}

function openLateSubmitModal() {
  const cls = CLASSES[currentClass];
  if (!cls) return;
  const students = getAllStudents(currentClass);
  const select = document.getElementById('lateStudent');
  select.innerHTML = students.map(s => '<option value="' + escHtml(s.name) + '">' + escHtml(s.name) + (s.en ? ' (' + escHtml(s.en) + ')' : '') + '</option>').join('');

  // Default date: previous Monday (a likely lesson date)
  const today = new Date();
  const mon = new Date(today);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - 7); // last Monday
  document.getElementById('lateDate').value = dateStr(mon);

  document.getElementById('lateModalOverlay').classList.remove('hidden');
}

function closeLateModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('lateModalOverlay').classList.add('hidden');
}

function confirmLateSubmit() {
  const studentName = document.getElementById('lateStudent').value;
  const type = document.getElementById('lateType').value;
  const lessonDate = document.getElementById('lateDate').value;
  if (!studentName || !lessonDate) { toast('请选择学生和原课程日期'); return; }

  const todayStr = dateStr(new Date());
  let rec = getVideoRecord(currentClass, lessonDate, type);
  if (!rec) {
    // Create the record for that historical lesson
    const submissions = {}, retold = {};
    getAllStudents(currentClass).forEach(s => { submissions[s.name] = false; retold[s.name] = ''; });
    rec = { date: lessonDate, type, className: currentClass, submissions, retold, classContent: '' };
    const key = getVideoKey(currentClass, lessonDate, type);
    localStorage.setItem(key, JSON.stringify(rec));
  }

  // Mark as submitted today in the video record
  rec.submissions[studentName] = todayStr;
  saveVideoRecord(rec);

  // Also save to this week's late-submission store (use ISO week of cycle anchor)
  const videoWeekKey = getISOWeekKey(currentVideoCycle);
  const lateItems = loadLateSubs(currentClass, videoWeekKey);
  const lessonTypeLabel = getLessonTypeLabel(type);
  const student = getAllStudents(currentClass).find(s => s.name === studentName);
  lateItems.push({
    name: studentName,
    en: student ? student.en : '',
    lessonType: lessonTypeLabel,
    lessonDate: lessonDate,
    lessonDateShort: fmtDateShort(lessonDate),
    submitDate: todayStr,
    submitDateShort: fmtDateShort(todayStr)
  });
  saveLateSubs(currentClass, videoWeekKey, lateItems);

  closeLateModal();
  toast('补交记录已添加 ✅');
  renderVideo();
}

function renderVideoSession(cls, dateStr, record, type) {
  const typeName = getLessonTypeLabel(type);
  const typeIcon = getLessonTypeIcon(type);

  const [y, m, d] = record.date.split('-');
  const dayOfWeek = ['周日','周一','周二','周三','周四','周五','周六'][new Date(+y, +m - 1, +d).getDay()];

  const activeStudents = getAllStudents(currentClass).filter(s => {
    const cfg = getStudentCfg(currentClass, s.name);
    return !cfg || !cfg.leftDate;
  });
  const listHTML = activeStudents.map(s => {
    const submitted = record.submissions[s.name] || false;
    const retoldText = record.retold && record.retold[s.name] ? record.retold[s.name] : '';
    return '<div class="video-student-row' + (submitted ? ' done' : '') + '" onclick="toggleVideoSubmission(\'' + currentClass + '\',\'' + dateStr + '\',\'' + type + '\',\'' + escHtml(s.name) + '\')">'
      + '<div class="video-student-name">' + escHtml(s.name) + (s.en ? '<span class="en">' + s.en + '</span>' : '') + '</div>'
      + '<div class="video-retold-wrap"><input type="text" class="video-retold-input" placeholder="实际复述内容..."'
      + ' value="' + escHtml(retoldText) + '"'
      + ' oninput="updateRetold(\'' + currentClass + '\',\'' + dateStr + '\',\'' + type + '\',\'' + escHtml(s.name) + '\',this.value)"'
      + ' onclick="event.stopPropagation()"></div>'
      + '<div class="video-check-icon">' + (submitted ? '✅' : '⬜') + '</div></div>';
  }).join('');

  return '<div class="video-card" style="margin-bottom:16px">'
    + '<div class="video-card-header"><div class="video-card-title">'
    + '<span>📅 ' + m + '月' + d + '日 ' + dayOfWeek + '</span>'
    + '<span class="video-type-tag ' + type + '">' + typeIcon + ' ' + typeName + '</span></div>'
    + '<button class="btn-ghost" onclick="if(confirm(\'确定删除?\')){deleteVideoRecord(\'' + currentClass + '\',\'' + dateStr + '\',\'' + type + '\');renderVideo();}" style="color:#ef4444">✕ 删除</button></div>'
    + '<div class="video-class-content-area"><div class="video-class-content-label">📝 课堂内容</div>'
    + '<textarea class="video-class-content-input" rows="2" placeholder="这节课教了什么？"'
    + ' oninput="updateClassContentV(\'' + currentClass + '\',\'' + dateStr + '\',\'' + type + '\',this.value)"'
    + '>' + escHtml(record.classContent || '') + '</textarea></div>'
    + '<div class="video-student-list">' + listHTML + '</div></div>';
}

function renderVideoAddBtn(type, date, dateStr) {
  const typeName = getLessonTypeLabel(type);
  const typeIcon = getLessonTypeIcon(type);
  const dayOfWeek = ['周日','周一','周二','周三','周四','周五','周六'][date.getDay()];
  const dateLabel = (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + dayOfWeek;

  return '<div class="video-add-btn" style="margin-bottom:16px" onclick="addVideoSession(\'' + currentClass + '\',\'' + type + '\',\'' + dateStr + '\')">'
    + '<span>+ 添加课程</span>'
    + '<span style="font-size:12px;opacity:0.7">' + typeIcon + ' ' + typeName + ' · ' + dateLabel + '</span></div>';
}

function addVideoSession(className, type, dateStr) {
  ensureVideoRecord(className, type, dateStr);
  renderVideo();
}
function toggleVideoSubmission(className, dateKey, type, studentName) {
  const rec = getVideoRecord(className, dateKey, type);
  if (!rec) return;
  // Toggle: false/undefined → today's date string; truthy → false
  const wasSubmitted = !!rec.submissions[studentName];
  if (wasSubmitted) {
    rec.submissions[studentName] = false;
  } else {
    rec.submissions[studentName] = dateStr(new Date());
  }
  saveVideoRecord(rec);

  // Check if this student just completed BOTH new + review this cycle → coin celebration
  if (!wasSubmitted) {
    const otherType = type === 'new' ? 'review' : 'new';
    // Paired date lookup using rec.date
    const pairedDate = type === 'new'
      ? getPairedReviewDate(rec.date, className)
      : getPairedNewDate(rec.date, className);
    const otherRec = getVideoRecord(className, dateStr(pairedDate), otherType);
    if (otherRec && otherRec.submissions[studentName]) {
      showCoinCelebration(studentName);
    }
  }

  renderVideo();
}
function updateRetold(className, dateStr, type, studentName, text) {
  const rec = getVideoRecord(className, dateStr, type);
  if (!rec) return;
  if (!rec.retold) rec.retold = {};
  rec.retold[studentName] = text;
  saveVideoRecord(rec);
}
function updateClassContentV(className, dateStr, type, content) {
  const rec = getVideoRecord(className, dateStr, type);
  if (!rec) return;
  rec.classContent = content;
  saveVideoRecord(rec);
}

function prevWeekV() {
  if (currentTab === 'calendar') {
    const mon = getMondayOfISOWeek(currentVideoWeek);
    mon.setDate(mon.getDate() - 7);
    currentVideoWeek = getISOWeekKey(mon);
    renderWeeklyBoard();
  } else {
    const d = new Date(currentVideoCycle + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    currentVideoCycle = dateStr(d);
    renderHeader();
    renderVideo();
  }
}
function nextWeekV() {
  if (currentTab === 'calendar') {
    const mon = getMondayOfISOWeek(currentVideoWeek);
    mon.setDate(mon.getDate() + 7);
    currentVideoWeek = getISOWeekKey(mon);
    renderWeeklyBoard();
  } else {
    const d = new Date(currentVideoCycle + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    currentVideoCycle = dateStr(d);
    renderHeader();
    renderVideo();
  }
}
function goTodayV() {
  if (currentTab === 'calendar') {
    currentVideoWeek = getISOWeekKey(new Date());
    renderWeeklyBoard();
  } else {
    currentVideoCycle = getCurrentCycleAnchor();
    renderHeader();
    renderVideo();
  }
}

// ╔══════════════════════════════════════════╗

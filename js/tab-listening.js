// ╔══════════════════════════════════════════╗
// ║            GLOBAL STATE                 ║
// ╚══════════════════════════════════════════╝

let currentTab = 'listening';
let weekOffset = 0;
let rankingWeekOffset = 0; // Ranking defaults to current week
let currentClass = '1班'; // for video tab
let currentVideoCycle = getCurrentCycleAnchor(); // cycle anchor date (YYYY-MM-DD) for Video tab
let currentVideoWeek = getISOWeekKey(new Date()); // ISO week for Calendar tab (kept separate)
let currentReportSunday = getReportWeekMonday(new Date());
let currentAttDate = dateStr(new Date());
let attWeekOffset = -1; // attendance week offset
let compareMode = false; // two-week comparison mode for listening tracker

// ╔══════════════════════════════════════════╗
// ║         TAB 1: LISTENING TRACKER        ║
// ╚══════════════════════════════════════════╝

function renderListening() {
  const monday = getWeekMonday(weekOffset);
  const listenData = getOrCreateListening(monday);

  // Sync: propagate data for synced students
  for (const cn of Object.keys(CLASSES)) {
    const students = CLASSES[cn].students;
    for (const s of students) {
      if (s.syncWith && listenData[cn] && listenData[cn][s.syncWith]) {
        listenData[cn][s.name] = deepClone(listenData[cn][s.syncWith]);
      }
    }
  }

  // Previous week data for compare mode
  let prevListenData = null;
  let prevMonday = null;
  if (compareMode) {
    prevMonday = getWeekMonday(weekOffset - 1);
    prevListenData = getOrCreateListening(prevMonday);
    for (const cn of Object.keys(CLASSES)) {
      const students = CLASSES[cn].students;
      for (const s of students) {
        if (s.syncWith && prevListenData[cn] && prevListenData[cn][s.syncWith]) {
          prevListenData[cn][s.name] = deepClone(prevListenData[cn][s.syncWith]);
        }
      }
    }
  }

  const filter = document.getElementById('classFilter') ? document.getElementById('classFilter').value : 'all';
  const classes = filter === 'all' ? Object.keys(CLASSES) : [filter];

  let html = '<div class="action-bar">'
    + '<span class="hint">点击日期格修改分钟数，回车确认 · Esc 取消</span>'
    + '<button class="btn btn-green" onclick="openDailyReport()" style="margin-right:4px">📋 今日打卡报告</button>'
    + '<button class="toggle-btn ' + (compareMode ? 'active' : '') + '" onclick="toggleCompareMode()">'
    + (compareMode ? '📊 退出对比' : '📊 两周对比') + '</button></div>';

  classes.forEach(cn => {
    const students = getListeningStudents(cn).filter(s => !getStudentCfg(cn, s.name).leftDate);
    if (students.length === 0) return;
    if (!listenData[cn]) listenData[cn] = {};

    const stats = students.map(s => {
      const data = listenData[cn][s.name] || { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
      let met = 0, unmet = 0, missed = 0, total = 0;
      DAY_KEYS.forEach(k => {
        const v = data[k] || 0;
        total += v;
        if (v >= TARGET) met++; else if (v > 0) unmet++; else missed++;
      });
      return { name: s.name, data, met, unmet, missed, total };
    });

    let prevStatsMap = {};
    if (compareMode && prevListenData) {
      if (!prevListenData[cn]) prevListenData[cn] = {};
      students.forEach(s => {
        const data = prevListenData[cn][s.name] || { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
        let met = 0, unmet = 0, missed = 0, total = 0;
        DAY_KEYS.forEach(k => {
          const v = data[k] || 0;
          total += v;
          if (v >= TARGET) met++; else if (v > 0) unmet++; else missed++;
        });
        prevStatsMap[s.name] = { name: s.name, data, met, unmet, missed, total };
      });
    }

    const fullyMet = stats.filter(s => s.unmet === 0 && s.missed === 0).length;
    const passAll = fullyMet === stats.length && stats.length > 0;
    const pillCls = passAll ? 'pill-allgood' : 'pill-warn';
    const pillTxt = passAll ? '全达标' : (stats.length - fullyMet) + ' 人未全达标';
    const weekStr = formatWeekRange(monday);

    const sorted = [...stats].sort((a, b) => {
      if (a.unmet + a.missed > 0 && b.unmet + b.missed === 0) return -1;
      if (a.unmet + a.missed === 0 && b.unmet + b.missed > 0) return 1;
      return a.name.localeCompare(b.name, 'zh');
    });

    const cards = sorted.map(s => renderListeningCard(cn, s, monday, prevStatsMap[s.name] || null)).join('');

    html += '<section class="class-section"><div class="class-header">'
      + '<h2>' + cn + '<span class="count">' + stats.length + ' 人 · ' + weekStr + '</span></h2>'
      + '<span class="pill ' + pillCls + '">' + pillTxt + '</span>'
      + '<button class="class-download-btn" onclick="downloadClassCheckin(\'' + cn + '\')" title="下载班级打卡卡片">📥 下载</button>'
      + '</div><div class="student-grid">' + cards + '</div></section>';
  });

  // Contact list at the bottom
  html += buildListeningContactList(classes, listenData, monday);

  document.getElementById('listeningContent').innerHTML = html;
}

function renderListeningCard(className, s, monday, prevS) {
  const problems = s.unmet + s.missed;
  const cardCls = (problems > 0 ? 'has-unmet' : 'all-met') + (compareMode ? ' compare-mode' : '');
  const barCls = s.total >= DAY_KEYS.length * TARGET ? 'green' : 'red';
  const barPct = Math.min((s.total / (DAY_KEYS.length * TARGET)) * 100, 100);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cfg = getStudentCfg(className, s.name);
  const syncTag = cfg && cfg.syncWith ? '<span class="sync-tag">🔗' + cfg.syncWith + '</span>' : '';
  const weekStr = formatWeekRange(monday);

  function buildDaysHtml(statsData, refMonday, editable) {
    return DAY_KEYS.map((k, i) => {
      const v = statsData[k] || 0;
      const dayDate = new Date(refMonday);
      dayDate.setDate(refMonday.getDate() + i);
      dayDate.setHours(0, 0, 0, 0);
      const isToday = dayDate.getTime() === today.getTime();
      const isFuture = dayDate.getTime() > today.getTime();
      let label = DAY_LABELS[i];
      if (isToday) label = '今天';
      if (isFuture) label = '未开始';

      let cls, tag;
      if (isFuture) { cls = 'future'; tag = '--'; }
      else if (v >= TARGET) { cls = 'met'; tag = '✓'; }
      else if (isToday) { cls = 'today-pending'; tag = v > 0 ? '差' + (TARGET - v) : '待打'; }
      else { cls = 'unmet'; tag = v > 0 ? '差' + (TARGET - v) : '未打'; }

      if (!editable) {
        return '<div class="day-cell">'
          + '<div class="day-box ' + cls + '"><span class="day-label">' + label + '</span>'
          + '<span class="day-val">' + (isFuture ? '' : (v > 0 ? v : '--')) + '</span>'
          + '<span class="day-tag">' + tag + '</span></div></div>';
      }
      return '<div class="day-cell" data-class="' + className + '" data-name="' + escHtml(s.name) + '" data-day="' + k + '" onclick="startEditListening(this,event)">'
        + '<div class="day-box ' + cls + '"><span class="day-label">' + label + '</span>'
        + '<span class="day-val">' + (isFuture ? '' : (v > 0 ? v : '--')) + '</span>'
        + '<span class="day-tag">' + tag + '</span></div>'
        + '<input class="day-edit-input" type="number" min="0" max="480" value="' + v + '" data-prev="' + v + '" inputmode="numeric"'
        + ' onblur="endEditListening(this,event)" onkeydown="handleEditKey(this,event)"></div>';
    }).join('');
  }

  const daysHtml = buildDaysHtml(s.data, monday, true);

  let compareHtml = '';
  if (compareMode && prevS) {
    const prevBarCls = prevS.total >= DAY_KEYS.length * TARGET ? 'green' : 'red';
    const prevBarPct = Math.min((prevS.total / (DAY_KEYS.length * TARGET)) * 100, 100);
    const prevWeekStr = formatWeekRange(getWeekMonday(weekOffset - 1));
    const diff = s.total - prevS.total;
    const diffDays = (s.met + s.unmet + s.missed) - (prevS.met + prevS.unmet + prevS.missed);
    const diffCls = diff > 0 ? 'change-up' : (diff < 0 ? 'change-down' : 'change-eq');
    const diffIcon = diff > 0 ? '▲' : (diff < 0 ? '▼' : '—');
    const prevDaysHtml = buildDaysHtml(prevS.data, getWeekMonday(weekOffset - 1), false);

    compareHtml = '<div class="sc-days">'
      + '<div class="sc-week-row"><span class="sc-week-label">上周</span>' + prevDaysHtml + '</div>'
      + '<div class="sc-week-row"><span class="sc-week-label">本周</span>' + daysHtml + '</div>'
      + '</div>'
      + '<div class="sc-compare-summary">'
      + '<span>总分钟 <strong>' + prevS.total + '</strong> → <strong>' + s.total + '</strong></span>'
      + '<span class="' + diffCls + '">' + diffIcon + ' ' + Math.abs(diff) + ' min</span>'
      + '<span>打卡天数 <strong>' + (prevS.met + prevS.unmet + prevS.missed) + '</strong> → <strong>' + (s.met + s.unmet + s.missed) + '</strong></span>'
      + '</div>'
      + '<div class="sc-compare-bar">'
      + '<div class="bar-track"><div class="bar-fill prev" style="width:' + prevBarPct + '%"></div></div>'
      + '<span class="bar-text">' + prevS.total + ' / ' + (DAY_KEYS.length * TARGET) + ' min</span></div>'
      + '<div class="sc-compare-bar">'
      + '<div class="bar-track"><div class="bar-fill ' + barCls + '" style="width:' + barPct + '%"></div></div>'
      + '<span class="bar-text">' + s.total + ' / ' + (DAY_KEYS.length * TARGET) + ' min</span></div>';
  }

  const bodyHtml = compareMode && prevS ? compareHtml
    : '<div class="sc-days">' + daysHtml + '</div>'
      + '<div class="sc-bar"><div class="bar-track"><div class="bar-fill ' + barCls + '" style="width:' + barPct + '%"></div></div>'
      + '<span class="bar-text">' + s.total + ' / ' + (DAY_KEYS.length * TARGET) + ' min</span></div>';

  return '<div class="student-card ' + cardCls + '" id="card-' + escHtml(className) + '-' + escHtml(s.name) + '">'
    + '<div class="sc-top"><div class="sc-info">'
    + '<span class="sc-name">' + escHtml(s.name) + syncTag + '</span>'
    + '</div><div class="sc-actions">'
    + '<button class="sc-heatmap-btn" title="月度热力图" onclick="showHeatmap(\'' + className + '\',\'' + escHtml(s.name) + '\',this)">🔥</button>'
    + '<button class="sc-download-btn" title="下载卡片" onclick="downloadCard(this,\'' + escHtml(s.name) + '\',\'' + weekStr + '\')">⬇️</button>'
    + '</div></div>' + bodyHtml + '</div>';
}

function toggleCompareMode() {
  compareMode = !compareMode;
  renderListening();
}

// ─── Contact list (待联系家长) ───

function getContacts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'contacts') || '{}'); } catch(e) { return {}; }
}
function saveContacts(obj) { localStorage.setItem(STORAGE_PREFIX + 'contacts', JSON.stringify(obj)); }

// Communication records per student per week
function getCommRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'comm-records') || '{}'); } catch(e) { return {}; }
}
function saveCommRecords(obj) { localStorage.setItem(STORAGE_PREFIX + 'comm-records', JSON.stringify(obj)); }
function getCommRecord(contactKey, id) {
  const all = getCommRecords();
  return (all[contactKey] && all[contactKey][id]) || null;
}
function setCommRecord(contactKey, id, record) {
  const all = getCommRecords();
  if (!all[contactKey]) all[contactKey] = {};
  all[contactKey][id] = record;
  saveCommRecords(all);
}

function toggleContacted(key, id) {
  const c = getContacts();
  if (!c[key]) c[key] = {};
  c[key][id] = !c[key][id];
  saveContacts(c);
  // Re-render without full reload: toggle the row class
  const row = document.getElementById('contact-' + id.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-'));
  if (row) row.classList.toggle('contacted', c[key][id]);
}

// Determine alert level for a student
function getAlertLevel(missed, pct, elapsedDays) {
  if (missed >= 3 || pct < 30) return 'urgent';      // 🔴 紧急
  if (missed >= 2 || (elapsedDays >= 4 && pct < 50)) return 'attention'; // 🟡 注意
  return 'followup';                                    // 🔵 补跟
}

function buildListeningContactList(classes, listenData, monday) {
  const today = new Date(); today.setHours(0,0,0,0);
  const contactKey = 'listen-' + dateStr(monday);
  const contacts = getContacts();
  const commRecords = getCommRecords();
  const allItems = [];

  classes.forEach(cn => {
    const students = getListeningStudents(cn).filter(s => !getStudentCfg(cn, s.name).leftDate);
    if (students.length === 0) return;
    if (!listenData[cn]) listenData[cn] = {};

    // Count elapsed days this week
    let elapsedDays = 0;
    DAY_KEYS.forEach((k, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (d.getTime() <= today.getTime()) elapsedDays++;
    });

    // Need at least 3 elapsed days for meaningful assessment
    if (elapsedDays < 3) return;

    const elapsedTarget = elapsedDays * TARGET;

    students.forEach(s => {
      const cfg = getStudentCfg(cn, s.name);
      if (cfg && cfg.exemptListening) return; // skip exempt students
      if (cfg && cfg.syncWith) return; // skip synced students (handled via sync source)
      if (isConsecutiveLeave(cn, s.name, getMonday(today))) return; // skip on consecutive leave

      const data = listenData[cn][s.name] || { mon:0,tue:0,wed:0,thu:0,fri:0,sat:0,sun:0 };
      let total = 0, missed = 0;
      DAY_KEYS.forEach((k, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        if (d.getTime() > today.getTime()) return; // future day, skip
        const v = data[k] || 0;
        total += v;
        if (v === 0) missed++;
      });

      // Thresholds: missed >= 2 days OR total < 50% of elapsed target
      const pct = elapsedTarget > 0 ? total / elapsedTarget : 1;
      if (missed >= 2 || (elapsedDays >= 4 && pct < 0.5)) {
        const id = cn + '-' + s.name;
        const level = getAlertLevel(missed, Math.round(pct * 100), elapsedDays);
        const comm = commRecords[contactKey] && commRecords[contactKey][id];
        allItems.push({
          id, cn, name: s.name, total, elapsedTarget, elapsedDays, missed,
          pct: Math.round(pct * 100),
          contacted: !!(contacts[contactKey] && contacts[contactKey][id]),
          level, comm
        });
      }
    });
  });

  // Sort: by level (urgent > attention > followup), then contacted at bottom, then by worst percentage
  const levelOrder = { urgent: 0, attention: 1, followup: 2 };
  allItems.sort((a, b) => {
    if (a.contacted !== b.contacted) return a.contacted ? 1 : -1;
    if (levelOrder[a.level] !== levelOrder[b.level]) return levelOrder[a.level] - levelOrder[b.level];
    return a.pct - b.pct;
  });

  if (allItems.length === 0) {
    return '<div class="contact-section"><div class="contact-header">'
      + '<h3>🚨 需关注学生</h3></div>'
      + '<div class="contact-none">🎉 目前没有需要关注的学生</div></div>';
  }

  const pending = allItems.filter(x => !x.contacted).length;
  const urgentCount = allItems.filter(x => x.level === 'urgent' && !x.contacted).length;
  let headerExtra = pending + ' 人待联系';
  if (urgentCount > 0) headerExtra += ' · <span style="color:#dc2626">' + urgentCount + ' 人紧急</span>';

  let html = '<div class="contact-section"><div class="contact-header">'
    + '<h3>🚨 需关注学生 <span class="contact-count">' + headerExtra + '</span></h3>'
    + '</div>';

  allItems.forEach(item => {
    const levelIcon = item.level === 'urgent' ? '🔴' : (item.level === 'attention' ? '🟡' : '🔵');
    const levelText = item.level === 'urgent' ? '紧急' : (item.level === 'attention' ? '注意' : '补跟');
    const levelCls = item.level;
    const badgeCls = item.missed >= 3 ? 'danger' : 'warn';
    const badgeTxt = item.missed >= 3 ? '缺勤 ' + item.missed + ' 天' : '达标率 ' + item.pct + '%';
    const rowCls = item.contacted ? 'contact-row contacted' : 'contact-row';
    const commIcon = item.comm ? (item.comm.status === 'resolved' ? '✅' : (item.comm.status === 'following' ? '🔄' : '📞')) : '';

    html += '<div class="' + rowCls + '" id="contact-' + item.id.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-') + '"'
      + ' onclick="showCommPanel(\'' + contactKey + '\',\'' + item.id + '\',\'' + item.cn + '\',\'' + escHtml(item.name) + '\')">'
      + '<div class="contact-cb">' + (item.contacted ? '✓' : '') + '</div>'
      + '<div class="contact-info"><div class="contact-name">' + escHtml(item.name)
      + ' <span class="contact-class">' + item.cn + '</span>'
      + ' <span class="stu-card-level ' + levelCls + '">' + levelIcon + ' ' + levelText + '</span>'
      + (commIcon ? ' <span style="font-size:.8rem">' + commIcon + '</span>' : '')
      + '</div>'
      + '<div class="contact-detail">本周打卡 ' + item.total + ' min / 目标 ' + item.elapsedTarget + ' min'
      + ' · 已过 ' + item.elapsedDays + ' 天，' + item.missed + ' 天未打卡</div></div>'
      + '<span class="contact-badge ' + badgeCls + '">' + badgeTxt + '</span></div>';
  });

  html += '</div>';
  return html;
}

function buildVideoContactList(currentClass, weekKey, records) {
  const cls = CLASSES[currentClass];
  if (!cls) return '';

  const contactKey = 'video-' + weekKey + '-' + currentClass;
  const contacts = getContacts();
  const commRecords = getCommRecords();
  const students = getAllStudents(currentClass);
  if (students.length === 0) return '';

  // Count total sessions in this week
  const totalSessions = records.length;
  if (totalSessions === 0) return ''; // no sessions created yet

  const allItems = [];

  students.forEach(s => {
    let submitted = 0;
    records.forEach(rec => {
      if (rec && rec.submissions[s.name]) submitted++;
    });
    const rate = totalSessions > 0 ? submitted / totalSessions : 1;
    const pct = Math.round(rate * 100);

    // Threshold: 0 submissions OR < 50% submission rate
    if (submitted === 0 || (totalSessions >= 2 && pct < 50)) {
      const id = s.name;
      const level = submitted === 0 ? 'urgent' : 'attention';
      const comm = commRecords[contactKey] && commRecords[contactKey][id];
      allItems.push({
        id, cn: currentClass, name: s.name, submitted, totalSessions, pct,
        contacted: !!(contacts[contactKey] && contacts[contactKey][id]),
        level, comm
      });
    }
  });

  if (allItems.length === 0) {
    return '<div class="contact-section"><div class="contact-header">'
      + '<h3>🚨 需关注学生</h3></div>'
      + '<div class="contact-none">🎉 所有人都已提交视频</div></div>';
  }

  // Sort: by level, then contacted at bottom, then by worst first
  const levelOrder = { urgent: 0, attention: 1, followup: 2 };
  allItems.sort((a, b) => {
    if (a.contacted !== b.contacted) return a.contacted ? 1 : -1;
    if (levelOrder[a.level] !== levelOrder[b.level]) return levelOrder[a.level] - levelOrder[b.level];
    return a.pct - b.pct;
  });

  const pending = allItems.filter(x => !x.contacted).length;
  const urgentCount = allItems.filter(x => x.level === 'urgent' && !x.contacted).length;
  let headerExtra = pending + ' 人待联系';
  if (urgentCount > 0) headerExtra += ' · <span style="color:#dc2626">' + urgentCount + ' 人紧急</span>';

  let html = '<div class="contact-section"><div class="contact-header">'
    + '<h3>🚨 需关注学生 <span class="contact-count">' + headerExtra + '</span></h3>'
    + '</div>';

  allItems.forEach(item => {
    const levelIcon = item.level === 'urgent' ? '🔴' : '🟡';
    const levelText = item.level === 'urgent' ? '紧急' : '注意';
    const levelCls = item.level;
    const badgeCls = item.submitted === 0 ? 'danger' : 'warn';
    const badgeTxt = item.submitted === 0 ? '未提交' : '仅交 ' + item.submitted + '/' + item.totalSessions;
    const rowCls = item.contacted ? 'contact-row contacted' : 'contact-row';
    const commIcon = item.comm ? (item.comm.status === 'resolved' ? '✅' : (item.comm.status === 'following' ? '🔄' : '📞')) : '';

    html += '<div class="' + rowCls + '" id="contact-' + item.id.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-') + '"'
      + ' onclick="showCommPanel(\'' + contactKey + '\',\'' + item.id + '\',\'' + item.cn + '\',\'' + escHtml(item.name) + '\')">'
      + '<div class="contact-cb">' + (item.contacted ? '✓' : '') + '</div>'
      + '<div class="contact-info"><div class="contact-name">' + escHtml(item.name)
      + ' <span class="contact-class">' + item.cn + '</span>'
      + ' <span class="stu-card-level ' + levelCls + '">' + levelIcon + ' ' + levelText + '</span>'
      + (commIcon ? ' <span style="font-size:.8rem">' + commIcon + '</span>' : '')
      + '</div>'
      + '<div class="contact-detail">本周视频：已交 ' + item.submitted + ' / 共 ' + item.totalSessions + ' 次'
      + ' · 完成率 ' + item.pct + '%</div></div>'
      + '<span class="contact-badge ' + badgeCls + '">' + badgeTxt + '</span></div>';
  });

  html += '</div>';
  return html;
}

// ╔══════════════════════════════════════════╗
// ║    COMMUNICATION PANEL (沟通记录)        ║
// ╚══════════════════════════════════════════╝

function showCommPanel(contactKey, id, cn, name) {
  // Remove existing panel
  const existing = document.getElementById('comm-panel-overlay');
  if (existing) existing.remove();

  const comm = getCommRecord(contactKey, id);
  const contacts = getContacts();
  const isContacted = !!(contacts[contactKey] && contacts[contactKey][id]);

  const currentMethod = comm ? comm.method : '';
  const currentStatus = comm ? comm.status : '';
  const currentNote = comm ? comm.note : '';

  const html = '<div id="comm-panel-overlay" class="stu-card-overlay" onclick="if(event.target===this)this.remove()">'
    + '<div class="stu-card-modal" style="width:340px">'
    + '<div class="stu-card-body">'
    + '<div class="stu-card-header"><h2>📞 ' + escHtml(name) + ' · ' + cn + '</h2></div>'
    + '<div class="stu-card-section"><div class="stu-card-section-title">沟通方式</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    + ['微信', '电话', '面谈'].map(m =>
        '<button class="stu-card-btn ' + (currentMethod === m ? 'primary' : 'secondary') + '" style="flex:none;padding:6px 14px;font-size:.78rem" onclick="selectCommMethod(this,\'' + m + '\')">' + m + '</button>'
      ).join('')
    + '</div></div>'
    + '<div class="stu-card-section"><div class="stu-card-section-title">沟通结果</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    + [{v:'reminded',l:'已提醒'},{v:'following',l:'需跟进'},{v:'resolved',l:'已解决'}].map(s =>
        '<button class="stu-card-btn ' + (currentStatus === s.v ? 'primary' : 'secondary') + '" style="flex:none;padding:6px 14px;font-size:.78rem" onclick="selectCommStatus(this,\'' + s.v + '\')">' + s.l + '</button>'
      ).join('')
    + '</div></div>'
    + '<div class="stu-card-section"><div class="stu-card-section-title">备注</div>'
    + '<textarea id="comm-note-input" style="width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:8px 10px;font-size:.8rem;resize:none;height:50px;outline:none" placeholder="沟通内容…">' + escHtml(currentNote) + '</textarea></div>'
    + '</div>'
    + '<div class="stu-card-actions">'
    + '<button class="stu-card-btn secondary" onclick="document.getElementById(\'comm-panel-overlay\').remove()">取消</button>'
    + '<button class="stu-card-btn primary" onclick="saveCommFromPanel(\'' + contactKey + '\',\'' + id + '\',\'' + cn + '\',\'' + escHtml(name) + '\')">保存</button>'
    + '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

// Track selected method & status in the panel
var _commMethod = '';
var _commStatus = '';
function selectCommMethod(btn, method) {
  _commMethod = method;
  btn.parentElement.querySelectorAll('.stu-card-btn').forEach(b => { b.className = 'stu-card-btn secondary'; b.style.flex = 'none'; b.style.padding = '6px 14px'; b.style.fontSize = '.78rem'; });
  btn.className = 'stu-card-btn primary'; btn.style.flex = 'none'; btn.style.padding = '6px 14px'; btn.style.fontSize = '.78rem';
}
function selectCommStatus(btn, status) {
  _commStatus = status;
  btn.parentElement.querySelectorAll('.stu-card-btn').forEach(b => { b.className = 'stu-card-btn secondary'; b.style.flex = 'none'; b.style.padding = '6px 14px'; b.style.fontSize = '.78rem'; });
  btn.className = 'stu-card-btn primary'; btn.style.flex = 'none'; btn.style.padding = '6px 14px'; btn.style.fontSize = '.78rem';
}

function saveCommFromPanel(contactKey, id, cn, name) {
  const note = document.getElementById('comm-note-input').value || '';
  if (!_commMethod && !_commStatus && !note) { toast('请至少填写一项'); return; }

  // Load existing record to preserve method/status if not re-selected
  const existing = getCommRecord(contactKey, id) || {};
  const record = {
    method: _commMethod || existing.method || '',
    status: _commStatus || existing.status || '',
    note: note,
    time: new Date().toISOString()
  };
  setCommRecord(contactKey, id, record);

  // Auto-mark as contacted if resolved
  if (record.status === 'resolved') {
    const c = getContacts();
    if (!c[contactKey]) c[contactKey] = {};
    c[contactKey][id] = true;
    saveContacts(c);
  }

  document.getElementById('comm-panel-overlay').remove();
  toast('沟通记录已保存');
  // Re-render current tab
  if (currentTab === 'listening') renderListening();
  else if (currentTab === 'video') renderVideo();
}

function downloadCard(btn, studentName, weekStr) {
  if (typeof html2canvas === 'undefined') { toast('卡片库加载中，请稍后再试'); return; }
  const card = btn.closest('.student-card');
  if (!card) { toast('找不到卡片元素'); return; }

  // Create a temporary wrapper with the card + right-side date label
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;gap:16px;align-items:stretch;padding:16px;background:#f4f2ee;position:fixed;left:-9999px;top:0;z-index:-1;';
  wrapper.innerHTML = card.outerHTML;

  // Add date label on the right side
  const label = document.createElement('div');
  label.style.cssText = 'display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;'
    + 'padding:8px 6px;background:white;border-radius:10px;font-size:11px;font-weight:700;'
    + 'color:#7c3aed;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.06);min-width:28px;';
  label.textContent = weekStr;
  wrapper.appendChild(label);

  document.body.appendChild(wrapper);

  html2canvas(wrapper, { backgroundColor: '#f4f2ee', scale: 2 }).then(canvas => {
    document.body.removeChild(wrapper);
    const link = document.createElement('a');
    link.download = studentName + '-' + weekStr + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('卡片已下载: ' + studentName);
  }).catch(err => {
    document.body.removeChild(wrapper);
    toast('下载失败: ' + err.message);
    console.error('downloadCard failed:', err);
  });
}

// ╔══════════════════════════════════════════╗
// ║      STUDENT WEEKLY REPORT CARD         ║
// ╚══════════════════════════════════════════╝

// --- Teacher comments per student per week ---
function getStudentComments() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'stu-comments') || '{}'); } catch(e) { return {}; }
}
function saveStudentComments(obj) { localStorage.setItem(STORAGE_PREFIX + 'stu-comments', JSON.stringify(obj)); }
function getStudentComment(cn, name, weekKey) {
  const all = getStudentComments();
  return (all[weekKey] && all[weekKey][cn + '.' + name]) || '';
}
function setStudentComment(cn, name, weekKey, text) {
  const all = getStudentComments();
  if (!all[weekKey]) all[weekKey] = {};
  all[weekKey][cn + '.' + name] = text;
  saveStudentComments(all);
}

// Calculate weekly stats for a student (used by card & alerts)
function getStudentWeekStats(cn, name, reportSunday) {
  const sat = new Date(reportSunday); sat.setDate(sat.getDate() + 6);
  const lessonDates = getLessonDatesInReportWeek(cn, reportSunday);

  // Listening
  let listenTotal = 0, listenMet = 0, listenSumMin = 0;
  const isInactive = isStudentInactive(cn, name, reportSunday);
  const isNewBeforeJoin = isBeforeJoinWeek(cn, name, reportSunday);
  const isAfterLeft = isAfterLeftWeek(cn, name, reportSunday);
  const targetMin = getStudentTarget(cn, name, sat); // graduated target
  const exempt = getStudentCfg(cn, name).exemptListening || isConsecutiveLeave(cn, name, reportSunday) || isInactive;
  if (!exempt) {
    const d = new Date(reportSunday);
    while (d.getTime() <= sat.getTime()) {
      listenTotal++;
      const min = loadMinutesForDate(cn, name, d);
      listenSumMin += min;
      if (min >= targetMin) listenMet++;
      d.setDate(d.getDate() + 1);
    }
  }

  // 视频统计 V3 — skip for inactive weeks (before join / after left)
  let videoDone = 0, videoTotal = 0;
  if (!isInactive) {
    const toCount = getCountableVideoEntries(cn);
    toCount.forEach(rec => {
      if (isLeaveNoMakeup(cn, name, rec.date)) return;
      videoTotal++;
      if (rec.submissions[name]) videoDone++;
    });
  }
  const reportWeekKey = getISOWeekKey(sat);
  const lateSubs = loadLateSubs(cn, reportWeekKey);
  lateSubs.forEach(ls => { if (ls.name === name) videoDone++; });

  // Attendance
  let attPresent = 0, attTotal = 0;
  if (lessonDates) {
    [lessonDates.newLesson, lessonDates.review].forEach(ld => {
      const attData = loadAttendance(dateStr(ld));
      attTotal++;
      if (!attData[cn] || (attData[cn][name] || 'present') === 'present') attPresent++;
    });
    const leaves = loadLeaves();
    leaves.forEach(l => {
      if (!l.makeupScheduled || !l.makeupDate || l.className !== cn || l.student !== name) return;
      const md = new Date(l.makeupDate + 'T00:00:00');
      if (md >= reportSunday && md <= sat) {
        const isOwn = lessonDates && (l.date === dateStr(lessonDates.newLesson) || l.date === dateStr(lessonDates.review));
        if (!isOwn) { attPresent++; attTotal++; }
      }
    });
  }

  // 4-week trend data
  const trend4 = [];
  for (let w = 3; w >= 0; w--) {
    const ws = new Date(reportSunday); ws.setDate(ws.getDate() - w * 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    let met = 0, total = 0, sumMin = 0;
    const d = new Date(ws);
    while (d.getTime() <= we.getTime()) {
      total++;
      const min = loadMinutesForDate(cn, name, d);
      sumMin += min;
      if (min >= TARGET) met++;
      d.setDate(d.getDate() + 1);
    }
    trend4.push({ met, total, sumMin });
  }

  // Previous week comparison
  const prevSunday = new Date(reportSunday); prevSunday.setDate(prevSunday.getDate() - 7);
  const prevStats = trend4[2]; // index 2 = 上周 (3 weeks ago = index 0, 2 weeks = 1, last week = 2, this week = 3)

  // Streak: count consecutive days meeting target ending today (or most recent past day)
  let streak = 0;
  const today = new Date(); today.setHours(0,0,0,0);
  const sd = new Date(today);
  for (let i = 0; i < 30; i++) { // look back max 30 days
    if (sd.getTime() < reportSunday.getTime()) break;
    if (loadMinutesForDate(cn, name, sd) >= targetMin) { streak++; }
    else break;
    sd.setDate(sd.getDate() - 1);
  }

  // Class ranking: position among peers
  const students = getListeningStudents(cn);
  const allMinutes = students.map(s => {
    let m = 0;
    const d = new Date(reportSunday);
    while (d.getTime() <= sat.getTime()) { m += loadMinutesForDate(cn, s.name, d); d.setDate(d.getDate() + 1); }
    return { name: s.name, totalMin: m };
  }).sort((a, b) => b.totalMin - a.totalMin);
  const rank = allMinutes.findIndex(s => s.name === name) + 1;
  const classAvgMin = allMinutes.reduce((s, x) => s + x.totalMin, 0) / (allMinutes.length || 1);
  const classAvgMet = students.reduce((s, stu) => {
    let met = 0;
    const d = new Date(reportSunday);
    while (d.getTime() <= sat.getTime()) { if (loadMinutesForDate(cn, stu.name, d) >= TARGET) met++; d.setDate(d.getDate() + 1); }
    return s + met;
  }, 0) / (students.length || 1);

  // Pirate coins for this ranking window
  const refDate = new Date(reportSunday);
  const rw = getRankingWindow(cn, refDate);
  let pirateCoins = 0;
  if (rw) {
    const rwStudents = students.map(s => ({ name: s.name, total: sumMinutesInWindow(cn, s.name, rw.start, rw.end) })).sort((a, b) => b.total - a.total);
    let _rank = 1;
    for (let i = 0; i < rwStudents.length; i++) {
      if (i > 0 && rwStudents[i].total < rwStudents[i - 1].total) _rank = i + 1;
      rwStudents[i].rank = _rank;
    }
    const me = rwStudents.find(s => s.name === name);
    if (me) {
      const pos = rwStudents.filter(s => s.rank === me.rank).length > 1
        ? rwStudents.findIndex(s => s.rank === me.rank)
        : rwStudents.findIndex(s => s.name === name);
      const coinIdx = Math.min(pos >= 0 ? pos : 2, 2);
      pirateCoins = PIRATE_COINS[coinIdx] || 0;
    }
  }

  // Month-to-date stats
  const monthStart = new Date(reportSunday.getFullYear(), reportSunday.getMonth(), 1);
  let monthMetDays = 0, monthTotalDays = 0;
  const md = new Date(monthStart);
  while (md.getTime() <= sat.getTime()) {
    monthTotalDays++;
    if (loadMinutesForDate(cn, name, md) >= TARGET) monthMetDays++;
    md.setDate(md.getDate() + 1);
  }

  return {
    listenMet, listenTotal, listenSumMin, videoDone, videoTotal,
    attPresent, attTotal, exempt, streak, rank, totalStudents: students.length,
    classAvgMin: Math.round(classAvgMin), classAvgMet: Math.round(classAvgMet * 10) / 10,
    pirateCoins, monthMetDays, monthTotalDays, trend4,
    prevListenMet: prevStats.met, prevListenTotal: prevStats.total,
    targetMin // graduated target for new students
  };
}

// Generate achievement badges (simplified: max 2 most notable ones)
function getStudentAchievements(stats) {
  const badges = [];
  // Most important: full attendance combo
  if (stats.videoDone >= stats.videoTotal && stats.videoTotal > 0 && stats.listenMet >= 5) {
    badges.push({ icon: '🌟', text: '全勤小明星', cls: 'gold' });
  } else if (stats.videoDone >= stats.videoTotal && stats.videoTotal > 0) {
    badges.push({ icon: '🎬', text: '视频全勤', cls: 'gold' });
  } else if (stats.listenMet >= 5) {
    badges.push({ icon: '🔥', text: '5天达人', cls: 'gold' });
  }
  // Second: improvement (always highlight progress)
  if (stats.prevListenMet >= 0 && stats.listenMet > stats.prevListenMet) {
    badges.push({ icon: '📈', text: '进步+' + (stats.listenMet - stats.prevListenMet) + '天', cls: 'gold' });
  } else if (stats.streak >= 7) {
    badges.push({ icon: '⚡', text: '7天连续', cls: 'gold' });
  } else if (stats.streak >= 3) {
    badges.push({ icon: '✨', text: stats.streak + '天连续', cls: 'silver' });
  }
  return badges;
}

// Generate auto-comment HTML: 夸 + 提醒, based on student's weekly data
function getSectionComments(cn, name, stats, badges) {
  const result = {
    listening: { praise: '', remind: '' },
    video: { praise: '', remind: '' },
    attendance: { praise: '', remind: '' },
    extras: [] // { text, cls: 'praise'|'remind' }
  };

  // ---- Listening ----
  if (stats.exempt) {
    result.listening.praise = '好好休息，有空可以听一下哦~';
  } else if (stats.listenMet >= 6) {
    result.listening.praise = '坚持得超棒！';
  } else if (stats.listenMet >= 4) {
    result.listening.praise = '习惯不错，继续保持';
  } else if (stats.listenMet >= 2) {
    result.listening.praise = '有在坚持，继续加油';
  } else if (stats.listenMet >= 1) {
    result.listening.praise = '好的开始！';
  }
  if (!stats.exempt && stats.listenMet < stats.listenTotal && stats.listenTotal > 0) {
    result.listening.remind = '还有' + (stats.listenTotal - stats.listenMet) + '天可以多听一会儿哦';
  }
  // ---- Video ----
  if (stats.videoTotal > 0) {
    if (stats.videoDone >= stats.videoTotal) {
      result.video.praise = '全部提交，非常自觉！';
    } else {
      // deadline info will be set by caller per video item
      result.video.remind = '还有' + (stats.videoTotal - stats.videoDone) + '项未提交';
    }
  }

  // ---- Attendance (praise already shown as 全勤小明星 in-section) ----
  if (stats.attTotal > 0 && stats.attPresent < stats.attTotal) {
    result.attendance.remind = '记得找时间补课哦';
  }

  // ---- Extras (streak, progress — no rank) ----
  if (stats.streak >= 5) {
    result.extras.push({ text: '连续' + stats.streak + '天达标，毅力超强！', cls: 'praise' });
  }
  if (stats.prevListenMet >= 0 && stats.listenMet > stats.prevListenMet) {
    result.extras.push({ text: '比上周进步了' + (stats.listenMet - stats.prevListenMet) + '天！', cls: 'praise' });
  }

  return result;
}

function generateAutoCommentHTML(cn, name, stats, badges) {
  const sc = getSectionComments(cn, name, stats, badges);
  const lines = [];
  // Listening
  if (sc.listening.praise) lines.push(sc.listening.praise);
  if (sc.listening.remind) lines.push(sc.listening.remind);
  // Video
  if (sc.video.praise) lines.push(sc.video.praise);
  if (sc.video.remind) lines.push(sc.video.remind);
  // Extras
  sc.extras.forEach(e => lines.push(e.text));
  return lines.join('；');
}

// Show student card modal
function showStudentCard(cn, name, reportSunStr) {
  // reportSunStr is the Sunday of the report period (used by 周报 tab)
  const reportSunday = reportSunStr ? new Date(reportSunStr + 'T00:00:00') : getReportWeekMonday(new Date());
  const sat = new Date(reportSunday); sat.setDate(sat.getDate() + 6);
  const weekKey = getISOWeekKey(sat);
  const weekLabel = (reportSunday.getMonth()+1) + '月' + reportSunday.getDate() + '日 - ' + (sat.getMonth()+1) + '月' + sat.getDate() + '日';
  const stats = getStudentWeekStats(cn, name, reportSunday);
  const badges = getStudentAchievements(stats);
  const comment = getStudentComment(cn, name, weekKey);
  const today = new Date(); today.setHours(0,0,0,0);
  const isInactive = isStudentInactive(cn, name, reportSunday);
  const isNewBeforeJoin = isBeforeJoinWeek(cn, name, reportSunday);
  const isAfterLeft = isAfterLeftWeek(cn, name, reportSunday);
  const targetMin = stats.targetMin;

  // 7-day listening blocks (red/green like tracker cards)
  const dayNames = ['一','二','三','四','五','六','日'];
  let listenBlocksHtml = '<div class="stu-card-day-grid">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(reportSunday); d.setDate(d.getDate() + i);
    const isFuture = d.getTime() > today.getTime();
    const min = isFuture ? -1 : loadMinutesForDate(cn, name, d);
    let cls, icon;
    if (stats.exempt || isInactive) { cls = 'exempt'; icon = '—'; }
    else if (isFuture) { cls = 'future'; icon = '—'; }
    else if (min >= targetMin) { cls = 'met'; icon = '✓'; }
    else if (min > 0) { cls = 'partial'; icon = '△'; }
    else { cls = 'unmet'; icon = '✕'; }
    listenBlocksHtml += '<div class="stu-card-day-box ' + cls + '"><div class="day-name">周' + dayNames[i] + '</div><div class="day-icon">' + icon + '</div></div>';
  }
  listenBlocksHtml += '</div>';
  const inactiveLabel = isAfterLeft ? '已退学/停课' : (isNewBeforeJoin ? '🌱 新生未加入' : '');
  const listenSummary = isInactive ? inactiveLabel : (stats.exempt ? '免打卡' : (stats.listenMet + '/' + stats.listenTotal + '天达标' + (targetMin !== TARGET ? '(目标' + targetMin + 'min)' : '')));

  // Video blocks (新课 → 复习课)
  const lessonDates = getLessonDatesInReportWeek(cn, reportSunday);
  let studentLateItems = []; // raised outside block for use in HTML template below
  let videoBlocksHtml = '<div class="stu-card-video-grid">';
  if (lessonDates) {
    const isCrossWeek = getSchedule(cn, sat).newLessonDay > getSchedule(cn, sat).reviewDay;
    const rvRec = getVideoRecord(cn, dateStr(lessonDates.review), 'review');
    const rvDone = rvRec && rvRec.date === dateStr(lessonDates.review) && rvRec.submissions[name];
    let nlDateObj;
    if (isCrossWeek) { nlDateObj = getPairedNewDate(dateStr(lessonDates.review), cn); }
    else { nlDateObj = lessonDates.newLesson; }
    const nlRec = getVideoRecord(cn, dateStr(nlDateObj), 'new');
    const nlDone = nlRec && nlRec.date === dateStr(nlDateObj) && nlRec.submissions[name];
    const reportWeekKey = getISOWeekKey(sat);
    const lateSubs = loadLateSubs(cn, reportWeekKey);
    studentLateItems = lateSubs.filter(ls => ls.name === name);
    const hasLate = studentLateItems.length > 0;
    const finalNlDone = nlDone || hasLate;

    const fmtVD = d => (d.getMonth()+1) + '月' + d.getDate() + '日';
    // Determine video block state: done / pending (deadline not passed) / undone (deadline passed)
    // 新课 deadline = review date; 复习课 deadline = review date + 7 days
    const nlDeadlinePassed = !finalNlDone && lessonDates.review && today.getTime() > lessonDates.review.getTime();
    const rvDeadlinePassed = !rvDone && lessonDates.review && today.getTime() > lessonDates.review.getTime();
    const nlClass = finalNlDone ? 'done' : (nlDeadlinePassed ? 'undone' : 'pending');
    const rvClass = rvDone ? 'done' : (rvDeadlinePassed ? 'undone' : 'pending');
    // 新课
    videoBlocksHtml += '<div class="stu-card-video-box ' + nlClass + '">'
      + '<div class="v-icon">' + (finalNlDone ? '✅' : (nlDeadlinePassed ? '❌' : '⏳')) + '</div>'
      + '<div>🆕 新课</div>'
      + '<div class="v-date">' + fmtVD(nlDateObj) + '发布</div>'
      + '<div class="v-label">' + (finalNlDone ? '已提交' : (nlDeadlinePassed ? '未提交' : '待提交')) + '</div></div>';
    // 复习课
    videoBlocksHtml += '<div class="stu-card-video-box ' + rvClass + '">'
      + '<div class="v-icon">' + (rvDone ? '✅' : (rvDeadlinePassed ? '❌' : '⏳')) + '</div>'
      + '<div>📝 复习课</div>'
      + '<div class="v-date">' + fmtVD(lessonDates.review) + '发布</div>'
      + '<div class="v-label">' + (rvDone ? '已提交' : (rvDeadlinePassed ? '未提交' : '待提交')) + '</div></div>';
  }
  videoBlocksHtml += '</div>';

  // Attendance: show "全勤小明星" if all present, otherwise show details
  let attHtml = '';
  if (lessonDates) {
    const dayLabel = ['日','一','二','三','四','五','六'];
    const fmtShort = d => (d.getMonth()+1) + '月' + d.getDate() + '日';
    let attAllPresent = true;
    const attItems = [];
    [lessonDates.newLesson, lessonDates.review].forEach(ld => {
      const attData = loadAttendance(dateStr(ld));
      const isLeave = attData[cn] && attData[cn][name] === 'leave';
      if (isLeave) attAllPresent = false;
      attItems.push({ date: fmtShort(ld), day: '周' + dayLabel[ld.getDay()], isLeave });
    });
    if (attAllPresent) {
      attHtml = '<div style="display:flex;align-items:center;gap:6px;font-size:.82rem;color:#065f46;font-weight:700;padding:4px 0"><span style="font-size:1.1rem">🏆</span> 全勤小明星</div>';
    } else {
      attHtml = '<div class="stu-card-att-row">';
      attItems.forEach(item => {
        attHtml += '<div class="stu-card-att-item">'
          + '<div class="stu-card-att-dot ' + (item.isLeave ? 'leave' : 'present') + '"></div>'
          + item.date + '(' + item.day + ')' + (item.isLeave ? ' 请假' : ' 到校')
          + '</div>';
      });
      attHtml += '</div>';
    }
  }

  // Achievements (max 2)
  let achieveHtml = '';
  if (badges.length > 0) {
    achieveHtml = '<div class="stu-card-achievements">';
    badges.slice(0, 2).forEach(b => {
      achieveHtml += '<span class="stu-card-badge ' + b.cls + '">' + b.icon + ' ' + b.text + '</span>';
    });
    achieveHtml += '</div>';
  }

  // Section comments (夸 + 提醒, embedded inline)
  const sc = getSectionComments(cn, name, stats, badges);

  // Override video remind based on deadline status
  if (sc.video.remind) {
    let pendingCount = 0, passedCount = 0;
    if (typeof nlDeadlinePassed !== 'undefined') {
      if (!finalNlDone) { if (nlDeadlinePassed) passedCount++; else pendingCount++; }
      if (!rvDone) { if (rvDeadlinePassed) passedCount++; else pendingCount++; }
    }
    if (pendingCount > 0 && passedCount === 0) {
      sc.video.remind = '上课前还可以提交，加油~';
    } else if (passedCount > 0) {
      sc.video.remind = (pendingCount > 0 ? '有' + pendingCount + '项上课前提交，' : '') + '有' + passedCount + '项这周内还可以补交哦~';
    }
  }

  // Build inline comment HTML for a section
  function secCommentHtml(sec) {
    if (!sec.praise && !sec.remind) return '';
    let h = '<div class="stu-card-inline">';
    if (sec.praise) h += '<span class="sci-praise">' + sec.praise + '</span>';
    if (sec.praise && sec.remind) h += ' ';
    if (sec.remind) h += '<span class="sci-remind">' + sec.remind + '</span>';
    h += '</div>';
    return h;
  }

  // Extra tags (streak, progress, rank) as small chips
  let extrasHtml = '';
  if (sc.extras.length > 0) {
    extrasHtml = '<div class="stu-card-extras">';
    sc.extras.forEach(e => {
      extrasHtml += '<span class="stu-card-extra-chip ' + e.cls + '">' + e.text + '</span>';
    });
    extrasHtml += '</div>';
  }

  const html = '<div class="stu-card-overlay" onclick="if(event.target===this)closeStudentCard()">'
    + '<div class="stu-card-modal">'
    + '<div class="stu-card-body">'
    + '<div class="stu-card-header"><h2>⭐ ' + escHtml(name) + (isAfterLeft ? ' <span style="font-size:.7em;background:#fee2e2;color:#991b1b;padding:1px 8px;border-radius:10px;font-weight:600">已退学</span>' : (isNewBeforeJoin ? ' <span style="font-size:.7em;background:#fef3c7;color:#92400e;padding:1px 8px;border-radius:10px;font-weight:600">🌱 新生</span>' : '')) + '的英语周报</h2>'
    + '<div class="stu-card-week">' + cn + ' · ' + weekLabel + (isInactive ? ' · ' + inactiveLabel : '') + '</div></div>'
    + '<div class="stu-card-section"><div class="stu-card-section-title">📻 听录音</div>'
    + listenBlocksHtml
    + '<div class="stu-card-progress">' + listenSummary + '</div>'
    + secCommentHtml(sc.listening) + '</div>'
    + '<div class="stu-card-section"><div class="stu-card-section-title">📹 视频打卡</div>'
    + videoBlocksHtml
    + secCommentHtml(sc.video)
    + (studentLateItems.length > 0 ? '<div class="stu-card-late">' + studentLateItems.map(item => '<div class="stu-card-late-item">📥 ' + item.lessonType + ' · ' + item.lessonDateShort + '发布 → 补交于' + item.submitDateShort + '</div>').join('') + '</div>' : '')
    + '</div>'
    + '<div class="stu-card-section"><div class="stu-card-section-title">👥 出勤</div>'
    + attHtml
    + secCommentHtml(sc.attendance) + '</div>'
    + (achieveHtml ? '<div class="stu-card-section"><div class="stu-card-section-title">🏆 本周成就</div>' + achieveHtml + '</div>' : '')
    + (extrasHtml ? '<div class="stu-card-section" style="margin-bottom:6px">' + extrasHtml + '</div>' : '')
    + '<div class="stu-card-comment"><div class="stu-card-section-title">💬 Nova老师说</div>'
    + '<textarea id="stu-card-comment-input" placeholder="写点评语……" oninput="setStudentComment(\'' + cn + '\',\'' + escHtml(name) + '\',\'' + weekKey + '\',this.value)">' + escHtml(comment) + '</textarea></div>'
    + '</div>'
    + '<div class="stu-card-actions">'
    + '<button class="stu-card-btn secondary" onclick="closeStudentCard()">关闭</button>'
    + '<button class="stu-card-btn primary" onclick="downloadStudentCard(\'' + cn + '\',\'' + escHtml(name) + '\',\'' + dateStr(reportSunday) + '\')">📥 下载卡片</button>'
    + '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function closeStudentCard() {
  const overlay = document.querySelector('.stu-card-overlay');
  if (overlay) overlay.remove();
}

// Download student card as PNG
function downloadStudentCard(cn, name, reportSunStr) {
  if (typeof html2canvas === 'undefined') { toast('卡片库加载中，请稍后再试'); return; }

  const reportSunday = reportSunStr ? new Date(reportSunStr + 'T00:00:00') : getReportWeekMonday(new Date());
  const sat = new Date(reportSunday); sat.setDate(sat.getDate() + 6);
  const weekKey = getISOWeekKey(sat);
  const weekLabel = (reportSunday.getMonth()+1) + '月' + reportSunday.getDate() + '日 - ' + (sat.getMonth()+1) + '月' + sat.getDate() + '日';
  const stats = getStudentWeekStats(cn, name, reportSunday);
  const badges = getStudentAchievements(stats);
  const personalNote = document.getElementById('stu-card-comment-input')?.value || getStudentComment(cn, name, weekKey) || '';
  const today = new Date(); today.setHours(0,0,0,0);

  // 7-day listening blocks
  const dayNames = ['一','二','三','四','五','六','日'];
  let listenBlocksHtml = '<div style="display:flex;gap:3px;margin-top:3px">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(reportSunday); d.setDate(d.getDate() + i);
    const isFuture = d.getTime() > today.getTime();
    const min = isFuture ? -1 : loadMinutesForDate(cn, name, d);
    let bg, fg, icon;
    if (stats.exempt) { bg = '#e2e8f0'; fg = '#94a3b8'; icon = '—'; }
    else if (isFuture) { bg = '#e2e8f0'; fg = '#94a3b8'; icon = '—'; }
    else if (min >= TARGET) { bg = '#10b981'; fg = '#fff'; icon = '✓'; }
    else if (min > 0) { bg = '#f59e0b'; fg = '#fff'; icon = '△'; }
    else { bg = '#ef4444'; fg = '#fff'; icon = '✕'; }
    listenBlocksHtml += '<div style="flex:1;text-align:center;padding:5px 2px;border-radius:7px;background:' + bg + ';color:' + fg + ';font-size:.64rem;font-weight:700;min-width:28px">'
      + '<div style="font-size:.55rem;opacity:.85;margin-bottom:1px">周' + dayNames[i] + '</div>'
      + '<div style="font-size:.82rem">' + icon + '</div></div>';
  }
  listenBlocksHtml += '</div>';
  const listenSummary = stats.exempt ? '免打卡' : (stats.listenMet + '/' + stats.listenTotal + '天达标');

  // Video blocks (新课 → 复习课)
  const lessonDates = getLessonDatesInReportWeek(cn, reportSunday);
  let studentLateItemsDl = []; // raised outside block for use in HTML template below
  let videoBlocksHtml = '<div style="display:flex;gap:6px;margin-top:4px">';
  if (lessonDates) {
    const isCrossWeek = getSchedule(cn, sat).newLessonDay > getSchedule(cn, sat).reviewDay;
    const rvRec = getVideoRecord(cn, dateStr(lessonDates.review), 'review');
    const rvDone = rvRec && rvRec.date === dateStr(lessonDates.review) && rvRec.submissions[name];
    let nlDateObj;
    if (isCrossWeek) { nlDateObj = getPairedNewDate(dateStr(lessonDates.review), cn); }
    else { nlDateObj = lessonDates.newLesson; }
    const nlRec = getVideoRecord(cn, dateStr(nlDateObj), 'new');
    const nlDone = nlRec && nlRec.date === dateStr(nlDateObj) && nlRec.submissions[name];
    const reportWeekKey = getISOWeekKey(sat);
    const lateSubs = loadLateSubs(cn, reportWeekKey);
    studentLateItemsDl = lateSubs.filter(ls => ls.name === name);
    const hasLate = studentLateItemsDl.length > 0;
    const finalNlDone = nlDone || hasLate;

    const fmtVD = d => (d.getMonth()+1) + '月' + d.getDate() + '日';
    const boxStyle = 'flex:1;text-align:center;padding:7px 5px;border-radius:9px;font-size:.7rem;font-weight:700;';
    // Determine deadline status
    const nlDeadlinePassedDl = !finalNlDone && lessonDates.review && today.getTime() > lessonDates.review.getTime();
    const rvDeadlinePassedDl = !rvDone && lessonDates.review && today.getTime() > lessonDates.review.getTime();
    const nlBg = finalNlDone ? '#ecfdf5' : (nlDeadlinePassedDl ? '#fef2f2' : '#fffbeb');
    const nlFg = finalNlDone ? '#065f46' : (nlDeadlinePassedDl ? '#991b1b' : '#92400e');
    const nlBorder = finalNlDone ? '#10b981' : (nlDeadlinePassedDl ? '#ef4444' : '#f59e0b');
    const nlIcon = finalNlDone ? '✅' : (nlDeadlinePassedDl ? '❌' : '⏳');
    const nlLabel = finalNlDone ? '已提交' : (nlDeadlinePassedDl ? '未提交' : '待提交');
    const rvBg = rvDone ? '#ecfdf5' : (rvDeadlinePassedDl ? '#fef2f2' : '#fffbeb');
    const rvFg = rvDone ? '#065f46' : (rvDeadlinePassedDl ? '#991b1b' : '#92400e');
    const rvBorder = rvDone ? '#10b981' : (rvDeadlinePassedDl ? '#ef4444' : '#f59e0b');
    const rvIcon = rvDone ? '✅' : (rvDeadlinePassedDl ? '❌' : '⏳');
    const rvLabel = rvDone ? '已提交' : (rvDeadlinePassedDl ? '未提交' : '待提交');
    // 新课
    videoBlocksHtml += '<div style="' + boxStyle + 'background:' + nlBg + ';color:' + nlFg + ';border:1.5px solid ' + nlBorder + '">'
      + '<div style="font-size:.95rem;margin-bottom:1px">' + nlIcon + '</div>'
      + '<div>🆕 新课</div>'
      + '<div style="font-size:.6rem;opacity:.6;margin-bottom:1px">' + fmtVD(nlDateObj) + '发布</div>'
      + '<div style="font-size:.65rem;opacity:.8">' + nlLabel + '</div></div>';
    // 复习课
    videoBlocksHtml += '<div style="' + boxStyle + 'background:' + rvBg + ';color:' + rvFg + ';border:1.5px solid ' + rvBorder + '">'
      + '<div style="font-size:.95rem;margin-bottom:1px">' + rvIcon + '</div>'
      + '<div>📝 复习课</div>'
      + '<div style="font-size:.6rem;opacity:.6;margin-bottom:1px">' + fmtVD(lessonDates.review) + '发布</div>'
      + '<div style="font-size:.65rem;opacity:.8">' + rvLabel + '</div></div>';
  }
  videoBlocksHtml += '</div>';

  // Attendance: show "全勤小明星" if all present, otherwise show details
  let attHtml = '';
  if (lessonDates) {
    const dayLabel = ['日','一','二','三','四','五','六'];
    const fmtShort = d => (d.getMonth()+1) + '月' + d.getDate() + '日';
    let attAllPresent = true;
    const attItems = [];
    [lessonDates.newLesson, lessonDates.review].forEach(ld => {
      const attData = loadAttendance(dateStr(ld));
      const isLeave = attData[cn] && attData[cn][name] === 'leave';
      if (isLeave) attAllPresent = false;
      attItems.push({ date: fmtShort(ld), day: '周' + dayLabel[ld.getDay()], isLeave });
    });
    if (attAllPresent) {
      attHtml = '<div style="display:flex;align-items:center;gap:6px;font-size:.82rem;color:#065f46;font-weight:700;padding:4px 0"><span style="font-size:1.1rem">🏆</span> 全勤小明星</div>';
    } else {
      attHtml = '<div style="display:flex;gap:10px;margin-top:4px">';
      attItems.forEach(item => {
        attHtml += '<div style="display:flex;align-items:center;gap:5px;font-size:.76rem;color:#475569">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + (item.isLeave ? '#ef4444' : '#10b981') + '"></div>'
          + item.date + '(' + item.day + ')' + (item.isLeave ? ' 请假' : ' 到校')
          + '</div>';
      });
      attHtml += '</div>';
    }
  }

  // Achievements
  let achieveHtml = '';
  if (badges.length > 0) {
    achieveHtml = '<div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px">';
    badges.slice(0, 2).forEach(b => {
      const bg = b.cls === 'gold' ? '#fef3c7' : (b.cls === 'silver' ? '#e0e7ff' : '#fce7f3');
      const fg = b.cls === 'gold' ? '#92400e' : (b.cls === 'silver' ? '#3730a3' : '#9d174d');
      achieveHtml += '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;background:' + bg + ';color:' + fg + '">' + b.icon + ' ' + b.text + '</span>';
    });
    achieveHtml += '</div>';
  }

  // Section comments (embedded inline, same logic as modal)
  const scDl = getSectionComments(cn, name, stats, badges);

  function dlSecComment(sec) {
    if (!sec.praise && !sec.remind) return '';
    let h = '<div style="font-size:.68rem;margin-top:2px;line-height:1.5">';
    if (sec.praise) h += '<span style="color:#059669;font-weight:600">' + sec.praise + '</span>';
    if (sec.praise && sec.remind) h += ' ';
    if (sec.remind) h += '<span style="color:#b45309">' + sec.remind + '</span>';
    h += '</div>';
    return h;
  }

  // Override video remind based on deadline status
  if (scDl.video.remind) {
    let pendingCount = 0, passedCount = 0;
    if (typeof nlDeadlinePassedDl !== 'undefined') {
      if (!finalNlDone) { if (nlDeadlinePassedDl) passedCount++; else pendingCount++; }
      if (!rvDone) { if (rvDeadlinePassedDl) passedCount++; else pendingCount++; }
    }
    if (pendingCount > 0 && passedCount === 0) {
      scDl.video.remind = '上课前还可以提交，加油~';
    } else if (passedCount > 0) {
      scDl.video.remind = (pendingCount > 0 ? '有' + pendingCount + '项上课前提交，' : '') + '有' + passedCount + '项这周内还可以补交哦~';
    }
  }

  let extrasHtmlDl = '';
  if (scDl.extras.length > 0) {
    extrasHtmlDl = '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">';
    scDl.extras.forEach(e => {
      extrasHtmlDl += '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:12px;font-size:.66rem;font-weight:600;'
        + (e.cls === 'praise' ? 'background:#fef3c7;color:#92400e' : 'background:#fef2f2;color:#991b1b') + '">' + e.text + '</span>';
    });
    extrasHtmlDl += '</div>';
  }

  const cardHtml = '<div class="stu-card-png" style="width:360px;padding:18px">'
    + '<h2>⭐ ' + escHtml(name) + '的英语周报</h2>'
    + '<div class="week-label">' + cn + ' · ' + weekLabel + '</div>'
    + '<div style="font-size:.74rem;color:#94a3b8;margin-bottom:2px">📻 听录音</div>'
    + listenBlocksHtml
    + '<div style="text-align:right;font-size:.7rem;color:#64748b;margin:3px 0">' + listenSummary + '</div>'
    + dlSecComment(scDl.listening)
    + '<div style="font-size:.74rem;color:#94a3b8;margin:8px 0 2px">📹 视频打卡</div>'
    + videoBlocksHtml
    + dlSecComment(scDl.video)
    + (studentLateItemsDl.length > 0 ? '<div style="font-size:.66rem;color:#6366f1;margin-top:4px;line-height:1.6">' + studentLateItemsDl.map(item => '<div>📥 ' + item.lessonType + ' · ' + item.lessonDateShort + '发布 → 补交于' + item.submitDateShort + '</div>').join('') + '</div>' : '')
    + '<div style="font-size:.74rem;color:#94a3b8;margin:8px 0 2px">👥 出勤</div>'
    + attHtml
    + dlSecComment(scDl.attendance)
    + achieveHtml
    + extrasHtmlDl
    + (personalNote ? '<div style="margin-top:8px;padding:6px 10px;background:#fff;border-radius:10px;font-size:.72rem;color:#475569;line-height:1.5;border:1px solid #e2e8f0"><span style="font-size:.68rem;font-weight:600;color:#6366f1">💬 Nova老师说</span> ' + escHtml(personalNote) + '</div>' : '')
    + '</div>';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  wrapper.innerHTML = cardHtml;
  document.body.appendChild(wrapper);

  html2canvas(wrapper.firstElementChild, { backgroundColor: null, scale: 3 }).then(canvas => {
    document.body.removeChild(wrapper);
    const link = document.createElement('a');
    link.download = name + '_英语周报_' + weekLabel + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('卡片已下载: ' + name);
  }).catch(err => {
    document.body.removeChild(wrapper);
    toast('下载失败: ' + err.message);
  });
}

function startEditListening(cell, e) { e.stopPropagation();
  const dayIdx = DAY_KEYS.indexOf(cell.dataset.day);
  if (dayIdx >= 0) {
    const monday = getWeekMonday(weekOffset);
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + dayIdx);
    dayDate.setHours(0, 0, 0, 0);
    if (dayDate.getTime() > new Date().setHours(0,0,0,0)) { toast('未来日期不可编辑'); return; }
  }
  cell.classList.add('editing');
  const input = cell.querySelector('.day-edit-input');
  input.focus(); input.select();
}
function endEditListening(input, e) {
  const cell = input.closest('.day-cell');
  if (cell) saveEditListening(cell, input);
}
function handleEditKey(input, e) {
  if (e.key === 'Enter') { e.preventDefault(); const cell = input.closest('.day-cell'); if (cell) saveEditListening(cell, input); }
  else if (e.key === 'Escape') { e.preventDefault(); input.value = input.dataset.prev; input.closest('.day-cell').classList.remove('editing'); }
}
function saveEditListening(cell, input) {
  const className = cell.dataset.class;
  const name = cell.dataset.name;
  const day = cell.dataset.day;
  let val = parseInt(input.value, 10);
  if (isNaN(val) || val < 0) val = 0;
  if (val > 480) val = 480;

  const monday = getWeekMonday(weekOffset);
  const listenData = getOrCreateListening(monday);
  if (!listenData[className]) listenData[className] = {};
  if (!listenData[className][name]) listenData[className][name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  listenData[className][name][day] = val;

  // Sync to linked student
  const cfg = getStudentCfg(className, name);
  if (cfg && cfg.syncWith) {
    // Actually, the source is the one being edited. We need to find who syncs from this name.
  }
  // Find all students who sync from this name
  for (const cn2 of Object.keys(CLASSES)) {
    for (const s2 of CLASSES[cn2].students) {
      if (s2.syncWith === name && cn2 === className) {
        if (!listenData[cn2]) listenData[cn2] = {};
        listenData[cn2][s2.name] = deepClone(listenData[className][name]);
      }
    }
  }

  saveListening(monday, listenData);
  cell.classList.remove('editing');
  renderListening();
  const dayIdx = DAY_KEYS.indexOf(day);
  toast(name + ' ' + DAY_LABELS[dayIdx] + '：' + (val > 0 ? val + '分钟' : '清零'));
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const m = monday.getMonth() + 1, s = sunday.getMonth() + 1;
  const d1 = monday.getDate(), d2 = sunday.getDate();
  if (m === s) return m + '月' + d1 + '日 - ' + d2 + '日';
  return m + '月' + d1 + '日 - ' + s + '月' + d2 + '日';
}

function prevWeekL() { weekOffset--; renderHeader(); renderListening(); }
function nextWeekL() { weekOffset++; renderHeader(); renderListening(); }
function goTodayL() { weekOffset = 0; renderHeader(); renderListening(); }

function prevWeekR() { rankingWeekOffset--; renderHeader(); renderRanking(); }
function nextWeekR() { rankingWeekOffset++; renderHeader(); renderRanking(); }
function goTodayR() { rankingWeekOffset = 0; renderHeader(); renderRanking(); }


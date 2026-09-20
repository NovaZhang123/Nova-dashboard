// ╔══════════════════════════════════════════╗
// ║        TAB 5: ATTENDANCE & LEAVE        ║
// ╚══════════════════════════════════════════╝

function renderAttendance() {
  const leaves = loadLeaves();
  const monday = getWeekMonday(attWeekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  sunday.setHours(0, 0, 0, 0);
  const sat = new Date(monday);
  sat.setDate(monday.getDate() + 5);

  let html = '<div class="action-bar"><span class="hint">出勤周报 · 每节课记录出勤/请假</span>'
    + '<div class="week-nav"><button onclick="prevWeekA()">◀</button>'
    + '<span class="week-label">' + formatWeekRange(monday) + '</span>'
    + '<button onclick="nextWeekA()">▶</button>'
    + (attWeekOffset !== 0 ? '<button onclick="goTodayA()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周</button>' : '')
    + '</div></div>';

  for (const cn of Object.keys(CLASSES)) {
    const students = getDisplayStudents(cn);
    const sched = getSchedule(cn, sat);
    if (!sched) continue;

    // Find new lesson and review dates in this week
    const nlDate = new Date(sunday);
    nlDate.setDate(sunday.getDate() + sched.newLessonDay);
    nlDate.setHours(0, 0, 0, 0);
    const rvDate = new Date(sunday);
    rvDate.setDate(sunday.getDate() + sched.reviewDay);
    rvDate.setHours(0, 0, 0, 0);

    const nlStr = dateStr(nlDate);
    const rvStr = dateStr(rvDate);
    const nlData = loadAttendance(nlStr);
    const rvData = loadAttendance(rvStr);
    if (!nlData[cn]) nlData[cn] = {};
    if (!rvData[cn]) rvData[cn] = {};

    // Count stats
    let nlPresent = 0, nlLeave = 0;
    students.forEach(s => {
      if ((nlData[cn][s.name] || 'present') === 'present') nlPresent++; else nlLeave++;
    });
    let rvPresent = 0, rvLeave = 0;
    students.forEach(s => {
      if ((rvData[cn][s.name] || 'present') === 'present') rvPresent++; else rvLeave++;
    });

    const formatMD = (d) => (d.getMonth() + 1) + '/' + d.getDate();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    html += '<div class="att-section"><div class="class-header"><h2>' + cn + '<span class="count">' + students.length + ' 人</span></h2></div>';
    html += '<div class="att-summary">'
      + '<div class="att-summary-item">🆕 新课 (' + formatMD(nlDate) + ' 周' + dayNames[sched.newLessonDay] + ') <span class="num">' + nlPresent + '/' + students.length + '</span> 出勤</div>'
      + '<div class="att-summary-item">📝 复习课 (' + formatMD(rvDate) + ' 周' + dayNames[sched.reviewDay] + ') <span class="num">' + rvPresent + '/' + students.length + '</span> 出勤</div>'
      + '</div>';

    // Table-style layout for each class
    // Sort columns by actual date (some classes have review before new lesson in same week)
    const cols = nlDate <= rvDate
      ? [{ label: '🆕 新课', date: nlDate, str: nlStr, data: nlData },
         { label: '📝 复习课', date: rvDate, str: rvStr, data: rvData }]
      : [{ label: '📝 复习课', date: rvDate, str: rvStr, data: rvData },
         { label: '🆕 新课', date: nlDate, str: nlStr, data: nlData }];

    html += '<div style="overflow-x:auto"><table class="att-table"><thead><tr>'
      + '<th class="att-name-col">学生</th>'
      + cols.map(c => '<th class="att-lesson-col">' + c.label + '<br><span class="att-date-sub">' + formatMD(c.date) + '</span></th>').join('')
      + '</tr></thead><tbody>';

    students.forEach(s => {
      html += '<tr><td class="att-name-cell">' + escHtml(s.name) + '</td>';
      cols.forEach(c => {
        const status = c.data[cn][s.name] || 'present';
        html += '<td class="att-toggle-cell">'
          + '<button class="att-btn' + (status === 'present' ? ' active-present' : '') + '" onclick="setAttendanceDate(\'' + cn + '\',\'' + escHtml(s.name) + '\',\'' + c.str + '\',\'present\')">出勤</button>'
          + '<button class="att-btn' + (status === 'leave' ? ' active-leave' : '') + '" onclick="setAttendanceDate(\'' + cn + '\',\'' + escHtml(s.name) + '\',\'' + c.str + '\',\'leave\')">请假</button>'
          + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
  }

  // Show cross-week makeups falling in this week → boosts this week's attendance
  const weekMakeups = leaves.filter(l => {
    if (!l.makeupScheduled || !l.makeupDate) return false;
    const md = new Date(l.makeupDate + 'T00:00:00');
    return md >= monday && md <= sat;
  });
  if (weekMakeups.length > 0) {
    html += '<div class="leave-history" style="border-left:3px solid #10b981"><h3>🔁 本周补课 · 计入本周出勤</h3>';
    weekMakeups.forEach(l => {
      html += '<div class="leave-item scheduled">'
        + '<div class="leave-info"><strong>' + l.className + '</strong> · ' + l.student
        + ' · 请假' + l.date + ' → 补课' + l.makeupDate + '</div></div>';
    });
    html += '<div style="font-size:.78rem;color:var(--text-muted);padding:0 12px 8px">这些补课将计入本周报的出勤统计</div></div>';
  }

  // Leave history
  html += '<div class="leave-history"><h3>📋 请假记录 · 待补课</h3>';
  const pendingLeaves = leaves.filter(l => !l.makeupScheduled && !l.noMakeup);
  if (pendingLeaves.length === 0) {
    html += '<div style="color:var(--text-muted);font-size:.84rem;padding:8px">暂无待补课的请假记录</div>';
  } else {
    leaves.forEach((l, origIdx) => {
      if (l.makeupScheduled || l.noMakeup) return;
      html += '<div class="leave-item pending-makeup">'
        + '<div class="leave-info"><strong>' + l.className + '</strong> · ' + l.student + ' · ' + l.date
        + (l.reason ? ' · ' + l.reason : '') + '</div>'
        + '<div class="leave-actions"><input type="date" id="makeupDate-' + origIdx + '" placeholder="补课日期">'
        + '<button class="btn-sm" onclick="scheduleMakeup(' + origIdx + ',document.getElementById(\'makeupDate-' + origIdx + '\').value)">安排补课</button>'
        + '<button class="btn-sm" onclick="markNoMakeup(' + origIdx + ')" style="background:#94a3b8;margin-left:4px">不补</button></div></div>';
    });
  }
  const noMakeupLeaves = leaves.filter(l => l.noMakeup);
  if (noMakeupLeaves.length > 0) {
    html += '<h3 style="margin-top:16px;font-size:.9rem">🚫 不补课</h3>';
    noMakeupLeaves.forEach(l => {
      html += '<div class="leave-item" style="background:#f1f5f9;border-left:3px solid #94a3b8"><div class="leave-info">'
        + '<strong>' + l.className + '</strong> · ' + l.student + ' · 请假' + l.date
        + ' · 不补课</div>'
        + '<button class="btn-ghost" onclick="removeLeave(' + leaves.indexOf(l) + ')" style="color:#ef4444">删除</button></div>';
    });
  }
  const scheduledLeaves = leaves.filter(l => l.makeupScheduled);
  if (scheduledLeaves.length > 0) {
    html += '<h3 style="margin-top:16px;font-size:.9rem">✅ 已安排补课</h3>';
    scheduledLeaves.forEach(l => {
      html += '<div class="leave-item scheduled"><div class="leave-info">'
        + '<strong>' + l.className + '</strong> · ' + l.student + ' · 请假' + l.date
        + ' → 补课' + l.makeupDate + '</div>'
        + '<button class="btn-ghost" onclick="removeLeave(' + leaves.indexOf(l) + ')" style="color:#ef4444">删除</button></div>';
    });
  }
  html += '</div>';

  document.getElementById('attendanceContent').innerHTML = html;
}

function setAttendanceDate(className, student, dateStr, status) {
  const attData = loadAttendance(dateStr);
  if (!attData[className]) attData[className] = {};
  attData[className][student] = status;
  saveAttendance(dateStr, attData);

  const leaves = loadLeaves();
  if (status === 'leave') {
    const exists = leaves.find(l => l.className === className && l.student === student && l.date === dateStr);
    if (!exists) {
      leaves.push({ className, student, date: dateStr, reason: '', makeupScheduled: false, makeupDate: null });
      saveLeaves(leaves);
    }
  } else {
    // Auto-remove leave record when switching back to present
    const filtered = leaves.filter(l => !(l.className === className && l.student === student && l.date === dateStr));
    if (filtered.length !== leaves.length) saveLeaves(filtered);
  }
  renderAttendance();
}

function prevWeekA() { attWeekOffset--; renderHeader(); renderAttendance(); }
function nextWeekA() { attWeekOffset++; renderHeader(); renderAttendance(); }
function goTodayA() { attWeekOffset = 0; renderHeader(); renderAttendance(); }

function scheduleMakeup(idx, makeupDate) {
  if (!makeupDate) { toast('请选择补课日期'); return; }
  const leaves = loadLeaves();
  if (idx >= 0 && idx < leaves.length) {
    leaves[idx].makeupScheduled = true;
    leaves[idx].makeupDate = makeupDate;
    saveLeaves(leaves);
    toast('补课已安排');
    renderAttendance();
  }
}

function markNoMakeup(idx) {
  const leaves = loadLeaves();
  if (idx >= 0 && idx < leaves.length) {
    leaves[idx].noMakeup = true;
    saveLeaves(leaves);
    toast('已标记为不补课');
    renderAttendance();
  }
}

function removeLeave(idx) {
  const leaves = loadLeaves();
  if (idx >= 0 && idx < leaves.length) {
    leaves.splice(idx, 1);
    saveLeaves(leaves);
    renderAttendance();
  }
}


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

  // ─── 请假清单（统一列表）───
  html += '<div class="leave-history"><h3>📋 请假清单'
    + (leaves.length ? ' <span class="leave-count">' + leaves.length + ' 条</span>' : '') + '</h3>';
  if (leaves.length === 0) {
    html += '<div style="color:var(--text-muted);font-size:.84rem;padding:8px">暂无请假记录</div>';
  } else {
    // 按日期倒序（最近在前），保留原始索引以便删除
    leaves.map((l, idx) => ({ l: l, idx: idx }))
      .sort((a, b) => String(b.l.date || '').localeCompare(String(a.l.date || '')))
      .forEach(item => {
        const l = item.l;
        const reason = l.reason ? ' · ' + l.reason : '';
        html += '<div class="leave-item">'
          + '<div class="leave-info"><strong>' + l.className + '</strong> · ' + l.student
          + ' · 请假 ' + l.date + reason + '</div>'
          + '<button class="btn-ghost" onclick="removeLeave(' + item.idx + ')" style="color:#ef4444">删除</button></div>';
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
      leaves.push({ className, student, date: dateStr, reason: '' });
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

function removeLeave(idx) {
  const leaves = loadLeaves();
  if (idx >= 0 && idx < leaves.length) {
    leaves.splice(idx, 1);
    saveLeaves(leaves);
    renderAttendance();
  }
}


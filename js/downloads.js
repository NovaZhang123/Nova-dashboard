// ╔══════════════════════════════════════════╗
// ║    WEEKLY CALENDAR TODO BOARD           ║
// ╚══════════════════════════════════════════╝

function getCalendarTodoKey(weekKey) {
  return STORAGE_PREFIX + 'TODO-' + weekKey;
}

function getCalendarTodos(weekKey) {
  const key = getCalendarTodoKey(weekKey);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveCalendarTodos(weekKey, todos) {
  const key = getCalendarTodoKey(weekKey);
  localStorage.setItem(key, JSON.stringify(todos));
}

function toggleCalendarTodo(weekKey, index) {
  const todos = getCalendarTodos(weekKey);
  if (index >= 0 && index < todos.length) {
    todos[index].done = !todos[index].done;
    saveCalendarTodos(weekKey, todos);
    renderWeeklyBoard();
  }
}

function deleteCalendarTodo(weekKey, index) {
  const todos = getCalendarTodos(weekKey);
  if (index >= 0 && index < todos.length) {
    todos.splice(index, 1);
    saveCalendarTodos(weekKey, todos);
    renderWeeklyBoard();
  }
}

function addCalendarTodo(weekKey, day, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const text = input.value.trim();
  if (!text) { toast('请输入待办内容'); return; }
  const todos = getCalendarTodos(weekKey);
  const today = new Date();
  const dateStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  todos.push({ day, text, done: false, created: dateStr });
  saveCalendarTodos(weekKey, todos);
  renderWeeklyBoard();
  toast('已添加: ' + text);
}

function showCalendarAdd(dayColId) {
  const el = document.getElementById(dayColId);
  if (!el) return;
  const addInline = el.querySelector('.wb-add-inline');
  const addBtn = el.querySelector('.wb-add-btn');
  if (addInline) addInline.classList.add('active');
  if (addBtn) addBtn.style.display = 'none';
  const input = el.querySelector('.wb-add-inline input');
  if (input) setTimeout(function() { input.focus(); }, 50);
}

function cancelCalendarAdd(dayColId) {
  const el = document.getElementById(dayColId);
  if (!el) return;
  const addInline = el.querySelector('.wb-add-inline');
  const addBtn = el.querySelector('.wb-add-btn');
  if (addInline) { addInline.classList.remove('active'); addInline.querySelector('input').value = ''; }
  if (addBtn) addBtn.style.display = '';
}

function renderWeeklyBoard() {
  var weekKey = currentVideoWeek;
  var range = getISOWeekRange(weekKey);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var customTodos = getCalendarTodos(weekKey);
  var dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  // Build date array for the week
  var weekDates = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(range.mon);
    d.setDate(range.mon.getDate() + i);
    d.setHours(0, 0, 0, 0);
    weekDates.push(d);
  }

  // Build publish tasks for each day
  var publishTasks = {};
  for (var i2 = 0; i2 < 7; i2++) publishTasks[i2] = [];

  var classNames = Object.keys(CLASSES);
  for (var ci = 0; ci < classNames.length; ci++) {
    var cn = classNames[ci];
    var weekSat2 = new Date(range.mon);
    weekSat2.setDate(range.mon.getDate() + 5);
    var sched = getSchedule(cn, weekSat2);
    if (!sched) continue;

    var nlDate = new Date(range.mon);
    var dateOffset = sched.newLessonDay === 0 ? 6 : sched.newLessonDay - 1;
    nlDate.setDate(range.mon.getDate() + dateOffset);
    var nlDayIdx = sched.newLessonDay === 0 ? 6 : sched.newLessonDay - 1;

    var nlInWeek = false;
    for (var wi = 0; wi < 7; wi++) {
      if (weekDates[wi].getTime() === nlDate.getTime()) { nlInWeek = true; break; }
    }

    if (nlInWeek && nlDayIdx >= 0 && nlDayIdx < 7) {
      var tracking = getTemplateTracking(cn, weekKey);
      publishTasks[nlDayIdx].push({
        text: cn + ' · 新课提示卡',
        icon: '📝',
        className: cn,
        done: !!tracking.cardPublished,
        field: 'cardPublished',
        type: 'publish'
      });
      publishTasks[nlDayIdx].push({
        text: cn + ' · 新课视频',
        icon: '🎬',
        className: cn,
        done: !!tracking.videoRecorded,
        field: 'videoRecorded',
        type: 'publish'
      });
    }

    // Review lesson day
    var rvDate = new Date(range.mon);
    var rvOffset = sched.reviewDay === 0 ? 6 : sched.reviewDay - 1;
    rvDate.setDate(range.mon.getDate() + rvOffset);
    var rvDayIdx = sched.reviewDay === 0 ? 6 : sched.reviewDay - 1;

    var rvInWeek = false;
    for (var rwi = 0; rwi < 7; rwi++) {
      if (weekDates[rwi].getTime() === rvDate.getTime()) { rvInWeek = true; break; }
    }

    if (rvInWeek && rvDayIdx >= 0 && rvDayIdx < 7) {
      var tracking2 = getTemplateTracking(cn, weekKey);
      publishTasks[rvDayIdx].push({
        text: cn + ' · 复习提示卡',
        icon: '📝',
        className: cn,
        done: !!tracking2.rvCardPublished,
        field: 'rvCardPublished',
        type: 'publish'
      });
      publishTasks[rvDayIdx].push({
        text: cn + ' · 复习视频',
        icon: '🎬',
        className: cn,
        done: !!tracking2.rvVideoRecorded,
        field: 'rvVideoRecorded',
        type: 'publish'
      });
    }
  }

  // Count total and done
  var totalPublish = 0, donePublish = 0;
  for (var dk = 0; dk < 7; dk++) {
    var ptasks = publishTasks[dk] || [];
    for (var pi = 0; pi < ptasks.length; pi++) {
      totalPublish++;
      if (ptasks[pi].done) donePublish++;
    }
  }
  var totalCustom = customTodos.length;
  var doneCustom = 0;
  for (var ci2 = 0; ci2 < customTodos.length; ci2++) {
    if (customTodos[ci2].done) doneCustom++;
  }
  var allDone = totalPublish > 0 && donePublish === totalPublish && (totalCustom === 0 || doneCustom === totalCustom);
  var overallPct = (totalPublish + totalCustom) > 0
    ? Math.round((donePublish + doneCustom) / (totalPublish + totalCustom) * 100) : 0;

  // Build HTML
  var html = '';

  // Stats bar
  html += '<div class="wb-stats' + (allDone ? ' wb-all-done' : '') + '">'
    + (allDone ? '🎉 本周全部搞定！' : '📋 本周进度')
    + ' <span style="font-weight:400;font-size:12px;color:var(--text-soft)">发布 ' + donePublish + '/' + totalPublish
    + (totalCustom > 0 ? ' · 自定义 ' + doneCustom + '/' + totalCustom : '')
    + ' (' + overallPct + '%)</span>'
    + '<div class="wb-stats-bar"><div class="wb-stats-fill" style="width:' + overallPct + '%"></div></div>'
    + '</div>';

  // Calendar grid
  html += '<div class="wb-container"><div class="wb-grid">';

  // Day headers
  for (var hi = 0; hi < 7; hi++) {
    var isTodayH = weekDates[hi].getTime() === today.getTime();
    var mh = weekDates[hi].getMonth() + 1;
    var dh = weekDates[hi].getDate();
    html += '<div class="wb-day-header' + (isTodayH ? ' today' : '') + '">'
      + dayNames[hi] + '<span class="wb-date-num">' + mh + '/' + dh + '</span></div>';
  }

  html += '</div><div class="wb-grid">';

  // Day columns
  for (var di = 0; di < 7; di++) {
    var isTodayD = weekDates[di].getTime() === today.getTime();
    var isWeekend = di >= 5;
    var colId = 'wb-col-' + di;

    html += '<div class="wb-day-col' + (isTodayD ? ' today' : '') + (isWeekend ? ' weekend' : '') + '" id="' + colId + '">';

    // Publish tasks
    var tasks = publishTasks[di] || [];
    for (var ti = 0; ti < tasks.length; ti++) {
      var t = tasks[ti];
      html += '<div class="wb-task publish ' + (t.done ? 'done' : 'pending') + '"'
        + ' onclick="toggleTemplateItem(\'' + t.className + '\',\'' + weekKey + '\',\'' + t.field + '\')"'
        + ' title="点击切换状态">'
        + '<span class="wb-task-icon">' + t.icon + '</span>'
        + '<span class="wb-task-text">' + escHtml(t.text) + '</span>'
        + '</div>';
    }

    // Custom todos for this day
    for (var ct = 0; ct < customTodos.length; ct++) {
      var ctodo = customTodos[ct];
      if (ctodo.day !== dayKeys[di]) continue;
      html += '<div class="wb-task custom ' + (ctodo.done ? 'done' : 'pending') + '"'
        + ' onclick="toggleCalendarTodo(\'' + weekKey + '\',' + ct + ')" title="点击切换状态">'
        + '<span class="wb-task-icon">' + (ctodo.done ? '✅' : '📌') + '</span>'
        + '<span class="wb-task-text">' + escHtml(ctodo.text) + '</span>'
        + '<span class="wb-task-del" onclick="event.stopPropagation();deleteCalendarTodo(\'' + weekKey + '\',' + ct + ')">✕</span>'
        + '</div>';
    }

    // Add button
    var addInputId = 'wb-input-' + di;
    html += '<div class="wb-add-btn" onclick="showCalendarAdd(\'' + colId + '\')">+ 添加</div>'
      + '<div class="wb-add-inline">'
      + '<input id="' + addInputId + '" type="text" placeholder="输入待办或备忘..."'
      + ' onkeydown="if(event.key===\'Enter\')addCalendarTodo(\'' + weekKey + '\',\'' + dayKeys[di] + '\',\'' + addInputId + '\')">'
      + '<div class="wb-add-actions">'
      + '<button class="wb-add-confirm" onclick="addCalendarTodo(\'' + weekKey + '\',\'' + dayKeys[di] + '\',\'' + addInputId + '\')">确定</button>'
      + '<button class="wb-add-cancel" onclick="cancelCalendarAdd(\'' + colId + '\')">取消</button>'
      + '</div></div>';

    html += '</div>';
  }

  html += '</div>';

  // Legend
  html += '<div class="wb-legend">'
    + '<span><span class="wb-dot done"></span> 已完成</span>'
    + '<span><span class="wb-dot pending"></span> 待完成</span>'
    + '<span style="margin-left:auto">📌 点击任务切换完成状态 · ✕ 删除自定义待办</span>'
    + '</div>';

  html += '</div>';

  document.getElementById('calendarContent').innerHTML = html;
}

// ╔══════════════════════════════════════════╗
// ║             CLASS CHECKIN DOWNLOAD       ║
// ║        Canvas-native rendering           ║
// ╚══════════════════════════════════════════╝

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawRoundedBox(ctx, x, y, w, h, r, fill, stroke) {
  roundRect(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function drawText(ctx, text, x, y, font, color, maxW) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  if (maxW !== undefined && ctx.measureText(text).width > maxW) {
    while (text.length > 0 && ctx.measureText(text + '...').width > maxW) {
      text = text.slice(0, -1);
    }
    text += '...';
  }
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

function downloadClassCheckin(className) {
  var monday = getWeekMonday(weekOffset);
  var listenData = getOrCreateListening(monday);

  // Sync
  var clsKeys = Object.keys(CLASSES);
  for (var si = 0; si < clsKeys.length; si++) {
    var scn = clsKeys[si];
    var sstudents = CLASSES[scn].students;
    for (var ssi = 0; ssi < sstudents.length; ssi++) {
      var ss = sstudents[ssi];
      if (ss.syncWith && listenData[scn] && listenData[scn][ss.syncWith]) {
        listenData[scn][ss.name] = deepClone(listenData[scn][ss.syncWith]);
      }
    }
  }

  var students = getListeningStudents(className);
  if (students.length === 0) { toast('该班级无打卡学生'); return; }
  if (!listenData[className]) listenData[className] = {};

  var weekDates = [];
  for (var wdi = 0; wdi < 7; wdi++) {
    var wd = new Date(monday);
    wd.setDate(monday.getDate() + wdi);
    wd.setHours(0, 0, 0, 0);
    weekDates.push(wd);
  }

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var dayShort = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  var statsData = [];
  for (var sti = 0; sti < students.length; sti++) {
    var stu = students[sti];
    var data = listenData[className][stu.name] || { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
    var total = 0;
    for (var dki = 0; dki < DAY_KEYS.length; dki++) { total += (data[DAY_KEYS[dki]] || 0); }
    statsData.push({ name: stu.name, en: stu.en || '', data: data, total: total });
  }

  var fullyMet = 0;
  for (var fmi = 0; fmi < statsData.length; fmi++) {
    var sd = statsData[fmi];
    var allMet = true;
    for (var dki2 = 0; dki2 < DAY_KEYS.length; dki2++) {
      if ((sd.data[DAY_KEYS[dki2]] || 0) < TARGET) { allMet = false; break; }
    }
    if (allMet) fullyMet++;
  }
  var passAll = fullyMet === statsData.length && statsData.length > 0;
  var maxW = DAY_KEYS.length * TARGET;

  // ═══ Canvas layout constants ═══
  var SCALE = 2;
  var PAD    = 16;   // page padding
  var CW     = 340;  // card width
  var CIPAD  = 14;   // card internal padding
  var CGH    = 10;   // card gap horizontal
  var CGV    = 10;   // card gap vertical
  var CPR    = 2;    // cards per row
  var TW     = PAD * 2 + CW * CPR + CGH * (CPR - 1);  // total width = 722

  // Header
  var HH = 96;
  // Card height
  var CH = 170;
  // Footer
  var FH = 28;
  // Rows
  var rows = Math.ceil(statsData.length / CPR);
  var TH = PAD + HH + PAD + rows * (CH + CGV) + PAD + FH + PAD;

  var cv = document.createElement('canvas');
  cv.width  = TW * SCALE;
  cv.height = TH * SCALE;
  var ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // --- Background ---
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(0, 0, TW, TH);

  var curY = PAD;
  var headerColor = passAll ? '#10b981' : '#f59e0b';
  var headerText  = passAll ? '全部达标！' + statsData.length + ' 人' : fullyMet + '/' + statsData.length + ' 人全达标';

  // --- Header card ---
  drawRoundedBox(ctx, PAD, curY, TW - PAD * 2, HH, 12, '#fff', '#f1f5f9');
  var hx = PAD + 20, hy = curY + 18;
  drawText(ctx, className + ' · 周打卡', hx, hy, 'bold 20px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif', '#1e293b');
  hy += 28;
  drawText(ctx, formatWeekRange(monday), hx, hy, '13px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif', '#64748b');
  hy += 22;
  drawText(ctx, headerText + ' · 目标 ' + TARGET + 'min/天', hx, hy, 'bold 13px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif', headerColor);
  curY += HH + PAD;

  // --- Student cards ---
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < CPR; c++) {
      var idx = r * CPR + c;
      if (idx >= statsData.length) break;
      var sds = statsData[idx];
      var cx = PAD + c * (CW + CGH);
      var cy = curY;
      var barPct = Math.min((sds.total / maxW) * 100, 100);
      var barClr = sds.total >= maxW ? '#10b981' : '#ef4444';

      // Card background
      drawRoundedBox(ctx, cx, cy, CW, CH, 12, '#fff', '#f1f5f9');

      // Name row
      var ix = cx + CIPAD, iy = cy + CIPAD;
      drawText(ctx, sds.name, ix, iy, 'bold 14px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif', '#1e293b');

      // English name
      if (sds.en) {
        iy += 18;
        drawText(ctx, sds.en, ix, iy, '10px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif', '#94a3b8');
        iy += 14;
      } else {
        iy += 20;
      }
      iy += 4;

      // Day cells (7 across)
      var dcw = 44;  // day cell width
      for (var d = 0; d < 7; d++) {
        var dx = ix + d * dcw;
        var dy = iy;
        var k = DAY_KEYS[d];
        var v = sds.data[k] || 0;
        var isFuture = weekDates[d].getTime() > today.getTime();
        var isToday = weekDates[d].getTime() === today.getTime();
        var label = isToday ? '今天' : dayShort[d];
        var tag;
        if (isFuture) { tag = '--'; }
        else if (v >= TARGET) { tag = '✓'; }
        else if (isToday && v > 0) { tag = '差' + (TARGET - v); }
        else if (isToday) { tag = '待打'; }
        else if (v > 0) { tag = '差' + (TARGET - v); }
        else { tag = '未打'; }
        var bg = isFuture ? '#f8fafc' : v >= TARGET ? '#ecfdf5' : isToday ? '#fff7ed' : v > 0 ? '#fef2f2' : '#f1f5f9';
        var tc = isFuture ? '#cbd5e1' : v >= TARGET ? '#065f46' : isToday ? '#9a3412' : v > 0 ? '#991b1b' : '#94a3b8';
        var tgc = v >= TARGET ? '#10b981' : isToday ? '#d97706' : v > 0 ? '#ef4444' : '#94a3b8';

        // Day label
        ctx.font = '10px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, dx + dcw / 2, dy);

        // Day value box
        var bx = dx + (dcw - 36) / 2, by = dy + 16;
        drawRoundedBox(ctx, bx, by, 36, 36, 8, bg, null);
        ctx.font = 'bold 14px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = tc;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isFuture ? '--' : (v > 0 ? String(v) : '--'), bx + 18, by + 18);

        // Day tag
        ctx.font = 'bold 10px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = tgc;
        ctx.textBaseline = 'top';
        ctx.fillText(tag, dx + dcw / 2, by + 38);
      }

      // Progress bar
      var pbY = iy + 68;
      var barW = 270;
      var barH = 6;
      var numW = 50;
      // Track
      drawRoundedBox(ctx, ix, pbY, barW, barH, 3, '#f1f5f9', null);
      // Fill
      drawRoundedBox(ctx, ix, pbY, barW * barPct / 100, barH, 3, barClr, null);
      // Number
      ctx.font = 'bold 11px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = barClr;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(sds.total + '/' + maxW, ix + barW + 6, pbY - 3);
    }
    curY += CH + CGV;
  }

  // --- Footer ---
  drawText(ctx, 'Nova 英语工作看板', PAD, TH - PAD - FH, '11px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif', '#cbd5e1');

  // --- Download ---
  toast('正在生成班级打卡卡片...');
  cv.toBlob(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = className + '_周打卡_' + formatWeekRange(monday).replace(/\s/g, '') + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(className + ' 打卡卡片已下载！✅');
  }, 'image/png');
}

// ╔══════════════════════════════════════════╗
// ║    VIDEO TAB: DOWNLOAD FUNCTIONS        ║
// ╚══════════════════════════════════════════╝

function fmtDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return (+m) + '月' + (+d) + '日';
}

function getISOWeekRange(weekKey) {
  const [y, w] = weekKey.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - (jan4Day - 1));
  const mon = new Date(firstMonday);
  mon.setDate(firstMonday.getDate() + (w - 1) * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => (d.getMonth() + 1) + '.' + d.getDate();
  return { mon, sun, label: y + '年 第' + w + '周 (' + fmt(mon) + ' - ' + fmt(sun) + ')' };
}

async function downloadVideoCard() {
  const cls = CLASSES[currentClass];
  if (!cls) return;

  // Cycle-based loading — resolve actual dates from anchor (handles schedule changes)
  const cycle = getVideoCycleDates(currentVideoCycle, currentClass);
  const cycleNewDate = cycle.newDateStr;
  const revDate = cycle.reviewDateObj;
  const revDateStr = cycle.reviewDateStr;

  let newRecord = getVideoRecord(currentClass, cycleNewDate, 'new');
  let reviewRecord = getVideoRecord(currentClass, revDateStr, 'review');

  // Late submissions for current cycle
  const lateWeekKey = getISOWeekKey(cycleNewDate);
  const lateSubs = loadLateSubs(currentClass, lateWeekKey);

  const encourageTexts = [
    '太厉害了🌟', '超级棒👏', '完成啦✨', '好样的🎯', '真不错💪',
    '小天才⭐', '非常优秀🏆', '完美👍', '赞赞赞🎉'
  ];

  let blocksHTML = '';
  let lateStudentsList = []; // collect late entries for footer

  function renderCardBlock(record, type) {
    if (!record) return '';
    const typeName = getLessonTypeLabel(type);
    const typeIcon = getLessonTypeIcon(type);
    const typeColor = getLessonTypeColor(type);
    const typeLabel = getLessonTypeLabel(type);

    const classContent = record.classContent
      ? '<div class="class-content">📝 ' + escHtml(record.classContent.length > 60 ? record.classContent.slice(0, 60) + '...' : record.classContent) + '</div>'
      : '';

    const students = getAllStudents(currentClass);
    let sesDone = 0, sesTotal = 0;
    const items = students.map((s, i) => {
      const submitted = record.submissions[s.name] || false;
      // Check late submission for this student + this lesson type
      const lateMatch = lateSubs.find(ls => ls.name === s.name && ls.lessonType === typeLabel);
      const done = submitted || !!lateMatch;
      sesTotal++;
      if (done) sesDone++;
      if (lateMatch) {
        lateStudentsList.push({ name: s.name, en: s.en || '', lessonType: typeLabel, lessonDateShort: lateMatch.lessonDateShort, submitDateShort: lateMatch.submitDateShort });
      }
      const retold = record.retold && record.retold[s.name] ? record.retold[s.name] : '';
      const retoldShort = retold.length > 14 ? retold.slice(0, 14) + '...' : retold;
      const retoldLabel = retold
        ? '<span style="font-size:10px;color:#888;margin-right:6px;">「' + escHtml(retoldShort) + '」</span>'
        : '';
      const enc = lateMatch ? '📥 补交' : (done ? encourageTexts[i % encourageTexts.length] : '⏳ 加油哦~');
      const encStyle = lateMatch ? 'color:#6366f1;font-weight:700' : '';
      return '<div class="card-item ' + (done ? 'done' : 'pending') + '">'
        + '<div class="card-item-top">'
        + '<span class="student-name">' + escHtml(s.name) + (s.en ? ' <span style="font-size:10px;color:#94a3b8;font-weight:400">' + s.en + '</span>' : '') + '</span>'
        + '<span class="status-icon">' + (done ? '✅' : '⬜') + '</span>'
        + '</div>'
        + '<div class="card-item-bottom">'
        + retoldLabel
        + '<span class="encourage" style="' + encStyle + '">' + enc + '</span>'
        + '</div></div>';
    }).join('');

    return '<div class="session-block">'
      + '<div class="session-title-row" style="color:' + typeColor + '">' + typeIcon + ' ' + typeName + ' · ' + fmtDateStr(record.date)
      + '<span class="session-count" style="color:' + (sesDone === sesTotal ? '#34A853' : '#d97706') + '">' + sesDone + '/' + sesTotal + '</span></div>'
      + classContent + items + '</div>';
  }

  blocksHTML += renderCardBlock(newRecord, 'new');
  blocksHTML += renderCardBlock(reviewRecord, 'review');

  // Orphan lessons in download card — same gap logic as renderVideo
  const nextAnchorDl = new Date(currentVideoCycle + 'T12:00:00');
  nextAnchorDl.setDate(nextAnchorDl.getDate() + 7);
  const nextCycleDl = getVideoCycleDates(dateStr(nextAnchorDl), currentClass);
  const gapStartDl = new Date(revDateStr + 'T00:00:00').getTime();
  const gapEndDl = new Date(nextCycleDl.newDateStr + 'T00:00:00').getTime();
  const mainKeysDl = new Set([cycleNewDate, revDateStr]);
  const exportRecords = [newRecord, reviewRecord];
  const orphanRecords = getAllVideoRecords().filter(r => {
    if (r.className !== currentClass || !r.date) return false;
    const t = new Date(r.date + 'T12:00:00').getTime();
    return t > gapStartDl && t < gapEndDl && !mainKeysDl.has(r.date);
  });
  orphanRecords.forEach(rec => {
    blocksHTML += renderCardBlock(rec, rec.type || 'new');
    exportRecords.push(rec);
  });

  // Ensure ALL late subs are captured (even if video records are missing for some types)
  const capturedNames = new Set(lateStudentsList.map(ls => ls.name + '|' + ls.lessonType));
  lateSubs.forEach(ls => {
    if (!capturedNames.has(ls.name + '|' + ls.lessonType)) {
      lateStudentsList.push(ls);
    }
  });

  // Stats (include late submissions)
  let total = 0, dd = 0;
  exportRecords.forEach(rec => {
    if (!rec) return;
    Object.values(rec.submissions).forEach(v => { total++; if (v) dd++; });
  });
  // Late submissions already reflected in dd (confirmLateSubmit updates original record)
  const lateCount = lateStudentsList.length;
  const pct = total > 0 ? Math.round(dd / total * 100) : 0;
  const barColor = pct === 100 ? '#34A853' : pct >= 60 ? '#FBBC04' : '#EA4335';

  let footerHTML = '<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>';
  if (pct === 100) {
    footerHTML += '🎉 全部完成！' + currentClass + '太棒了！🏆';
  } else if (pct >= 60) {
    footerHTML += '🌟 ' + dd + '/' + total + ' 已完成 (' + pct + '%) · 还有 ' + (total - dd) + ' 位在努力 💪';
  } else {
    footerHTML += '📢 ' + dd + '/' + total + ' 已完成 · 复述视频作业，越练越棒！';
  }

  // Late submissions summary
  const lateHTML = '<div style="margin:8px 0;padding:8px 12px;background:#f5f3ff;border-radius:10px;border:1px solid #e0e7ff">'
    + '<div style="font-size:.72rem;font-weight:700;color:#6366f1;margin-bottom:4px">📥 本周补交' + (lateStudentsList.length > 0 ? ' (' + lateStudentsList.length + '条)' : '') + '</div>'
    + (lateStudentsList.length > 0
      ? lateStudentsList.map(ls => '<div style="font-size:.66rem;color:#6366f1;line-height:1.6">' + escHtml(ls.name) + ' · ' + ls.lessonType + ' · ' + ls.lessonDateShort + '发布 → ' + ls.submitDateShort + '补交</div>').join('')
      : '<div style="font-size:.66rem;color:#a5b4fc;line-height:1.6">暂无补交记录</div>')
    + '</div>';

  const preview = document.getElementById('cardPreview');
  preview.style.width = '420px';
  preview.innerHTML = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'PingFang SC\', \'Microsoft YaHei\', sans-serif;padding:16px;">'
    + '<div class="card-header">'
    + '<div class="hw-badge">📹 复述视频作业</div>'
    + '<div class="card-title">' + currentClass + ' · 完成追踪</div>'
    + '<div class="card-week">' + fmtCycleRange(cycleNewDate, currentClass) + '</div></div>'
    + '<div class="card-divider"></div>'
    + blocksHTML
    + lateHTML
    + '<div class="card-footer">' + footerHTML + '</div></div>';

  toast('正在生成卡片...');

  if (typeof html2canvas === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  try {
    const canvas = await html2canvas(preview, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentClass + '_复述视频作业_' + cycleNewDate + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('卡片已下载！✅');
    }, 'image/png');
  } catch (e) {
    toast('生成失败，请重试');
    console.error(e);
  }
}

// ╔══════════════════════════════════════════╗
// ║         DAILY CHECK-IN REPORT           ║
// ╚══════════════════════════════════════════╝

let reportCurrentClass = null;
let currentReportMet = [], currentReportClose = [], currentReportMissed = [];

function getTodayDayKey() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon...
  const map = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
  return map[day];
}

function getTodayDayLabel() {
  const today = new Date();
  const day = today.getDay();
  const map = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' };
  return map[day];
}

function formatTodayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function openDailyReport() {
  const todayKey = getTodayDayKey();

  // Always use current week (today) regardless of weekOffset
  const currentMonday = getWeekMonday(0);
  const listenData = getOrCreateListening(currentMonday);

  // Sync data
  for (const cn of Object.keys(CLASSES)) {
    const students = CLASSES[cn].students;
    for (const s of students) {
      if (s.syncWith && listenData[cn] && listenData[cn][s.syncWith]) {
        listenData[cn][s.name] = deepClone(listenData[cn][s.syncWith]);
      }
    }
  }

  const filter = document.getElementById('classFilter') ? document.getElementById('classFilter').value : 'all';
  const classes = filter === 'all' ? Object.keys(CLASSES) : [filter];
  const validClasses = classes.filter(cn => {
    const students = getListeningStudents(cn);
    return students.length > 0 && listenData[cn];
  });

  if (validClasses.length === 0) {
    toast('没有可生成报告的班级数据');
    return;
  }

  reportCurrentClass = validClasses[0];
  renderReportModal(validClasses, listenData, todayKey);
  document.getElementById('reportModal').classList.remove('hidden');
}

function closeReportModal() {
  document.getElementById('reportModal').classList.add('hidden');
}

function renderReportModal(classes, listenData, todayKey) {
  // Class tabs
  const tabsEl = document.getElementById('reportClassTabs');
  tabsEl.innerHTML = classes.map(cn =>
    '<button class="report-class-tab ' + (cn === reportCurrentClass ? 'active' : '') + '" onclick="switchReportClass(\'' + cn + '\')">' + cn + '</button>'
  ).join('');

  updateReportContent(classes, listenData, todayKey);
}

function switchReportClass(cn) {
  reportCurrentClass = cn;
  document.querySelectorAll('.report-class-tab').forEach(b => b.classList.toggle('active', b.textContent === cn));

  const currentMonday = getWeekMonday(0);
  const listenData = getOrCreateListening(currentMonday);
  // Re-sync
  for (const c of Object.keys(CLASSES)) {
    const students = CLASSES[c].students;
    for (const s of students) {
      if (s.syncWith && listenData[c] && listenData[c][s.syncWith]) {
        listenData[c][s.name] = deepClone(listenData[c][s.syncWith]);
      }
    }
  }
  updateReportContent(Object.keys(CLASSES).filter(c => CLASSES[c] && getListeningStudents(c).length > 0), listenData, getTodayDayKey());
}

function updateReportContent(classes, listenData, todayKey) {
  const cn = reportCurrentClass;
  const students = getListeningStudents(cn);
  const dateStr = formatTodayDate();
  const dayLabel = getTodayDayLabel();

  const met = [];
  const close = []; // listened but not met (within close range)
  const missed = []; // not listened at all

  students.forEach(s => {
    const data = listenData[cn][s.name] || { mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0 };
    const v = data[todayKey] || 0;
    if (v >= TARGET) {
      met.push({ name: s.name, min: v });
    } else if (v > 0) {
      close.push({ name: s.name, min: v, diff: TARGET - v });
    } else {
      missed.push({ name: s.name, min: 0 });
    }
  });

  // Sort: met by minutes desc, close by diff asc (closest first)
  met.sort((a, b) => b.min - a.min);
  close.sort((a, b) => a.diff - b.diff);

  // Store for card download
  currentReportMet = met;
  currentReportClose = close;
  currentReportMissed = missed;

  // Build text — compact reminder, details in card
  const dayMap = { '周一':'一','周二':'二','周三':'三','周四':'四','周五':'五','周六':'六','周日':'日' };
  const shortDay = dayMap[dayLabel] || dayLabel;
  let text = '🎵 ' + cn + '今日打卡 · 周' + shortDay + '\n';

  if (met.length > 0) {
    text += '🌟 已达标 ' + met.length + '人：' + met.map(s => s.name + ' ' + s.min + 'min').join(' · ') + '\n';
  }
  if (close.length > 0) {
    text += '💪 还差一点 ' + close.length + '人：' + close.map(s => s.name + ' 差' + s.diff + 'min').join(' · ') + '\n';
  }
  if (missed.length > 0) {
    text += '⏰ 记得打卡 ' + missed.length + '人：' + missed.map(s => s.name).join(' · ') + '\n';
  }

  if (met.length > 0 && (close.length + missed.length) > 0) {
    text += '\n👏 达标宝贝棒棒哒！还没完成的今晚记得打卡哦～\n';
  } else if (met.length > 0) {
    text += '\n👏 全部达标，太厉害了！\n';
  } else if (missed.length > 0) {
    text += '\n🎧 今晚记得听满' + TARGET + '分钟哦，加油！\n';
  }
  text += '📸 详情见卡片 →';

  document.getElementById('reportTextarea').value = text;

  // Summary
  const summaryEl = document.getElementById('reportSummary');
  summaryEl.innerHTML =
    '<span class="report-summary-item">✅ 达标 <strong>' + met.length + '</strong> 人</span>' +
    '<span class="report-summary-item">💪 差一点 <strong>' + close.length + '</strong> 人</span>' +
    '<span class="report-summary-item">⏰ 未打卡 <strong>' + missed.length + '</strong> 人</span>' +
    '<span class="report-summary-item">📅 ' + dayLabel + '</span>';
}

function copyReportText() {
  const textarea = document.getElementById('reportTextarea');
  textarea.select();
  textarea.setSelectionRange(0, 999999);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textarea.value).then(() => toast('文案已复制到剪贴板！✅'));
  } else {
    document.execCommand('copy');
    toast('文案已复制到剪贴板！✅');
  }
}

function closeCardPreview() {
  document.getElementById('cardPreviewOverlay').classList.add('hidden');
}

function buildReportCardHTML() {
  const cn = reportCurrentClass;
  const met = currentReportMet;
  const close = currentReportClose;
  const missed = currentReportMissed;
  const totalStudents = met.length + close.length + missed.length;
  const completionRate = totalStudents > 0 ? Math.round(met.length / totalStudents * 100) : 0;
  const dateDisplay = formatTodayDate();
  const dayLabel = getTodayDayLabel();
  const target = TARGET;

  // Progress bar color
  const barColor = completionRate >= 85 ? '#22c55e' : completionRate >= 60 ? '#f59e0b' : '#ef4444';

  // Motivation
  let motivation = '';
  if (completionRate >= 85) motivation = '🎉 太棒了！今天大家表现非常出色，继续保持！';
  else if (completionRate >= 60) motivation = '💪 大部分宝贝都达标了，差一点的同学晚上加把劲！';
  else if (completionRate > 0) motivation = '⏰ 还有很多宝贝没打卡哦，今晚一起加油吧！';
  else motivation = '📢 今天大家都还没开始呢，快快行动起来！';

  // Build student rows
  let rows = '';

  // Met students
  met.forEach(function(s) {
    rows += '<div class="dr-student-row met">'
      + '<span class="dr-student-name">🌟 ' + escHtml(s.name) + '</span>'
      + '<span class="dr-student-min">' + s.min + '<span style="font-size:11px;font-weight:400;">min</span></span>'
      + '<span class="dr-student-status">✅ 达标</span>'
      + '</div>';
  });

  // Close students
  close.forEach(function(s) {
    rows += '<div class="dr-student-row close">'
      + '<span class="dr-student-name">💪 ' + escHtml(s.name) + '</span>'
      + '<span class="dr-student-min">' + s.min + '<span style="font-size:11px;font-weight:400;">min</span></span>'
      + '<span class="dr-student-status">差' + s.diff + 'min</span>'
      + '</div>';
  });

  // Missed students
  missed.forEach(function(s) {
    rows += '<div class="dr-student-row missed">'
      + '<span class="dr-student-name">⏰ ' + escHtml(s.name) + '</span>'
      + '<span class="dr-student-min">0<span style="font-size:11px;font-weight:400;">min</span></span>'
      + '<span class="dr-student-status">未打卡</span>'
      + '</div>';
  });

  if (totalStudents === 0) {
    rows = '<div style="text-align:center;padding:20px;color:#94a3b8;">暂无数据</div>';
  }

  return '<div class="dr-card">'
    // Header
    + '<div class="dr-card-header">'
    + '<div class="dr-class">' + escHtml(cn) + '</div>'
    + '<div class="dr-date">' + dateDisplay + ' · ' + dayLabel + '</div>'
    + '<div class="dr-target">目标 ' + target + ' min/天</div>'
    + '</div>'
    // Stats bar
    + '<div class="dr-stats-bar">'
    + '<div class="dr-stat met"><div class="dr-stat-num">' + met.length + '</div><div class="dr-stat-label">✅ 达标</div></div>'
    + '<div class="dr-stat close"><div class="dr-stat-num">' + close.length + '</div><div class="dr-stat-label">💪 差一点</div></div>'
    + '<div class="dr-stat missed"><div class="dr-stat-num">' + missed.length + '</div><div class="dr-stat-label">⏰ 未打卡</div></div>'
    + '</div>'
    // Progress bar
    + '<div class="dr-progress-section">'
    + '<div class="dr-progress-bar-wrap"><div class="dr-progress-bar-fill" style="width:' + completionRate + '%;background:' + barColor + ';"></div></div>'
    + '<div class="dr-progress-text">达标率 <strong>' + completionRate + '%</strong> · ' + met.length + '/' + totalStudents + ' 人</div>'
    + '</div>'
    // Student rows
    + '<div class="dr-body">' + rows + '</div>'
    // Footer
    + '<div class="dr-footer">'
    + '<div class="dr-motivation">' + motivation + '</div>'
    + '<div class="dr-watermark">Nova Dashboard · ' + dateDisplay + '</div>'
    + '</div>'
    + '</div>';
}

function previewReportCard() {
  const cardHTML = buildReportCardHTML();

  // Populate preview body
  document.getElementById('cardPreviewBody').innerHTML = cardHTML;
  document.getElementById('cardPreviewOverlay').classList.remove('hidden');

  // Also populate hidden cardPreview for html2canvas
  const preview = document.getElementById('cardPreview');
  preview.style.width = '440px';
  preview.style.padding = '0';
  preview.innerHTML = cardHTML;
}

async function doDownloadReportCard() {
  if (typeof html2canvas === 'undefined') {
    await new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  var cn = reportCurrentClass;
  var preview = document.getElementById('cardPreview');
  toast('正在生成卡片...');

  try {
    var canvas = await html2canvas(preview, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    canvas.toBlob(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = escHtml(cn) + '_今日打卡报告_' + todayYYYYMMDD() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('打卡卡片已下载！📸');
    }, 'image/png');
  } catch (e) {
    toast('生成失败，请重试');
    console.error(e);
  }
}

function todayYYYYMMDD() {
  var today = new Date();
  return today.getFullYear() + String(today.getMonth()+1).padStart(2,'0') + String(today.getDate()).padStart(2,'0');
}


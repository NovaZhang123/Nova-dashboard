// ╔══════════════════════════════════════════════════════════╗
// ║      TAB 7: 数据体检 (DATA HEALTH CHECK)                ║
// ║  全量扫描 localStorage，找出「会让周报/排名算错」或       ║
// ║  「数据静默丢失」的地方，能自动修的一键修掉。            ║
// ╚══════════════════════════════════════════════════════════╝

// 严重度分级
// danger  🔴 会算错数字 —— 直接影响周报/排名/出勤的口径
// warn    🟡 数据可能丢失 —— 学生名对不上，数据变成孤儿
// info    ⚪ 只是提醒 —— 漏录、可疑日期，需要你自己判断

const HEALTH_SEVERITY = {
  danger: { cls: 'health-danger', icon: '🔴', label: '会算错数字' },
  warn:   { cls: 'health-warn',   icon: '🟡', label: '数据可能丢失' },
  info:   { cls: 'health-info',   icon: '⚪', label: '待确认' }
};

// ── 体检页隐藏开关 ──
function isHealthTabHidden() {
  return localStorage.getItem(STORAGE_PREFIX + 'health-hidden') === '1';
}
function setHealthTabHidden(hidden) {
  localStorage.setItem(STORAGE_PREFIX + 'health-hidden', hidden ? '1' : '0');
}

// ── 工具：判断某个日期是不是该班的上课日 ──
function getLessonDowSet(className) {
  const cls = CLASSES[className];
  if (!cls) return null;
  return { newLessonDay: cls.newLessonDay, reviewDay: cls.reviewDay };
}
// 该日期在指定班级是否为一节课（考虑 2 班课表切换）
function isLessonDate(className, dateString) {
  const sched = getSchedule(className, new Date(dateString + 'T12:00:00'));
  if (!sched) return false;
  const dow = new Date(dateString + 'T12:00:00').getDay();
  return dow === sched.newLessonDay || dow === sched.reviewDay;
}
// 该日期属于哪个课程类型
function getLessonTypeOfDate(className, dateString) {
  const sched = getSchedule(className, new Date(dateString + 'T12:00:00'));
  if (!sched) return null;
  const dow = new Date(dateString + 'T12:00:00').getDay();
  if (dow === sched.newLessonDay) return 'new';
  if (dow === sched.reviewDay) return 'review';
  return null;
}

// 收集该班所有「应有数据」的学生名（含已停课，用于识别孤儿）
function getAllKnownNames(className) {
  const set = new Set();
  const cls = CLASSES[className];
  if (cls) cls.students.forEach(s => set.add(s.name));
  return set;
}
// 全项目所有已知学生名（跨班，用于孤儿识别）
function isKnownStudentName(className, name) {
  const cls = CLASSES[className];
  if (!cls) return false;
  return cls.students.some(s => s.name === name);
}

// ── 扫描 localStorage 的各类键 ──
function scanStorageKeys() {
  const out = { listen: [], video: [], att: [], tpl: [], late: [], todo: [], reportText: [], other: [] };
  const P = STORAGE_PREFIX;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(P)) continue;
    const rest = key.substring(P.length);
    if (rest.startsWith('L-')) out.listen.push({ key: key, date: rest.substring(2) });
    else if (rest.startsWith('V-')) {
      // V-{class}-{date}-{type}  ; 跳过 V-MIGRATED-v2 标记位
      if (rest.startsWith('V-MIGRATED')) continue;
      out.video.push({ key: key, body: rest.substring(2) });
    }
    else if (rest.startsWith('A-')) out.att.push({ key: key, date: rest.substring(2) });
    else if (rest.startsWith('TPL-')) out.tpl.push({ key: key, body: rest.substring(4) });
    else if (rest.startsWith('late-')) out.late.push({ key: key, body: rest.substring(5) });
    else if (rest.startsWith('TODO-')) out.todo.push({ key: key, body: rest.substring(5) });
    else if (rest.startsWith('report-text-')) out.reportText.push({ key: key, body: rest.substring(12) });
    else out.other.push(key);
  }
  return out;
}

// ── 体检主函数：返回按严重度分组的问题对象 ──
function runHealthCheck() {
  const issues = [];
  const keys = scanStorageKeys();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayString = dateStr(today);

  // ══════════════════════════════════════════════
  // 检查 1：出勤表标记请假 vs 请假清单
  // ══════════════════════════════════════════════
  const leaves = loadLeaves();
  const leaveSigs = new Set(
    (Array.isArray(leaves) ? leaves : []).map(l => (l.className || '') + '|' + (l.student || '') + '|' + (l.date || ''))
  );
  const missingLeaves = [];
  keys.att.forEach(k => {
    let attData;
    try { attData = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
    if (!attData || typeof attData !== 'object') return;
    for (const cn in attData) {
      const students = attData[cn];
      if (!students || typeof students !== 'object') continue;
      for (const name in students) {
        if (students[name] === 'leave') {
          const sig = cn + '|' + name + '|' + k.date;
          if (!leaveSigs.has(sig)) {
            missingLeaves.push({ className: cn, student: name, date: k.date });
          }
        }
      }
    }
  });
  if (missingLeaves.length > 0) {
    issues.push({
      id: 'leave-reconcile',
      severity: 'danger',
      title: '出勤表标了请假，但请假清单里没有',
      detail: '出勤记录（nd-A-*）里标记为「请假」的记录，在请假清单（nd-leaves）中缺失。'
        + '这会让「请假次数」和连续请假判断失真，进而影响听录音豁免与周报口径。',
      count: missingLeaves.length,
      items: missingLeaves.slice(0, 40).map(m => m.className + ' · ' + m.student + ' · ' + m.date),
      moreCount: Math.max(0, missingLeaves.length - 40),
      fixable: true,
      fixLabel: '补齐请假清单',
      fix: function() {
        const added = reconcileLeaves();
        return '已补齐 ' + added + ' 条请假记录';
      }
    });
  }

  // ══════════════════════════════════════════════
  // 检查 2：请假清单里存在「出勤表并未标请假」的反向孤儿
  //         以及请假日期不是上课日
  // ══════════════════════════════════════════════
  const notLessonLeaves = [];
  if (Array.isArray(leaves)) {
    leaves.forEach(l => {
      if (!l.className || !l.date) return;
      if (!CLASSES[l.className]) return;
      if (!isLessonDate(l.className, l.date)) {
        notLessonLeaves.push({ className: l.className, student: l.student, date: l.date });
      }
    });
  }
  if (notLessonLeaves.length > 0) {
    issues.push({
      id: 'leave-not-lesson-day',
      severity: 'info',
      title: '请假记录落在非上课日',
      detail: '这条请假记录的日期不是该班的新课日或复习课日。可能是补填时选错了日期，'
        + '也可能是排课调整前的历史记录。历史遗留可以忽略；如果是最近填的，建议核对一下。',
      count: notLessonLeaves.length,
      items: notLessonLeaves.slice(0, 30).map(m => m.className + ' · ' + m.student + ' · ' + m.date),
      moreCount: Math.max(0, notLessonLeaves.length - 30),
      fixable: false
    });
  }

  // ══════════════════════════════════════════════
  // 检查 3：视频记录里的学生名不在 config（孤儿 = 改名/转班遗留）
  // ══════════════════════════════════════════════
  const orphanVideoStudents = {}; // name|class -> {count, dates:[], classNames:Set}
  keys.video.forEach(k => {
    let rec;
    try { rec = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
    if (!rec || !rec.className || !rec.date) return;
    const cn = rec.className;
    if (!CLASSES[cn]) {
      // 整个班级都不存在了
      const id = '班级:' + cn;
      if (!orphanVideoStudents[id]) orphanVideoStudents[id] = { name: cn, className: cn, count: 0, dates: [], isClass: true };
      orphanVideoStudents[id].count++;
      orphanVideoStudents[id].dates.push(rec.date);
      return;
    }
    if (!rec.submissions) return;
    for (const name in rec.submissions) {
      if (!isKnownStudentName(cn, name)) {
        const id = cn + '|' + name;
        if (!orphanVideoStudents[id]) orphanVideoStudents[id] = { name: name, className: cn, count: 0, dates: [], isClass: false };
        orphanVideoStudents[id].count++;
        orphanVideoStudents[id].dates.push(rec.date);
      }
    }
  });
  const orphanVideoList = Object.keys(orphanVideoStudents).map(id => {
    const o = orphanVideoStudents[id];
    const uniqDates = Array.from(new Set(o.dates)).sort();
    return {
      className: o.className,
      name: o.name,
      isClass: o.isClass,
      recordCount: o.count,
      dateRange: uniqDates.length ? (uniqDates[0] + ' ~ ' + uniqDates[uniqDates.length - 1]) : '—'
    };
  });
  if (orphanVideoList.length > 0) {
    issues.push({
      id: 'orphan-video-students',
      severity: 'warn',
      title: '视频记录里出现「config 里没有的学生名」',
      detail: '这些名字存在于视频记录（nd-V-*）中，但当前班级名单里找不到对应学生。'
        + '通常是改名或转班后遗留的旧名字。这些数据现在不会被任何页面统计到——'
        + '如果那是学生的旧名，可以用「改名」功能把名字替换过去；确认是废弃数据的话可以直接清理。',
      count: orphanVideoList.length,
      items: orphanVideoList.map(o => o.className + ' · ' + o.name + '（' + o.recordCount + ' 条记录，' + o.dateRange + '）'),
      fixable: true,
      fixLabel: '清理孤儿学生数据',
      fixHint: '⚠️ 清理会从视频记录中删除这些名字的提交记录（不可撤销，建议先备份）',
      fix: function() {
        let cleaned = 0;
        keys.video.forEach(k => {
          let rec;
          try { rec = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
          if (!rec || !rec.className || !CLASSES[rec.className]) return;
          let changed = false;
          if (rec.submissions) {
            for (const name in rec.submissions) {
              if (!isKnownStudentName(rec.className, name)) { delete rec.submissions[name]; changed = true; }
            }
          }
          if (rec.retold) {
            for (const name in rec.retold) {
              if (!isKnownStudentName(rec.className, name)) { delete rec.retold[name]; changed = true; }
            }
          }
          if (changed) { localStorage.setItem(k.key, JSON.stringify(rec)); cleaned++; }
        });
        return '清理了 ' + cleaned + ' 条视频记录中的孤儿学生数据';
      }
    });
  }

  // ══════════════════════════════════════════════
  // 检查 4：打卡数据里的学生名不在 config（孤儿）
  // ══════════════════════════════════════════════
  const orphanListenNames = {};
  keys.listen.forEach(k => {
    let data;
    try { data = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;
    for (const cn in data) {
      if (!CLASSES[cn]) {
        const id = '班级:' + cn;
        if (!orphanListenNames[id]) orphanListenNames[id] = { className: cn, name: cn, weeks: [], isClass: true };
        orphanListenNames[id].weeks.push(k.date);
        continue;
      }
      for (const name in data[cn]) {
        if (!isKnownStudentName(cn, name)) {
          const id = cn + '|' + name;
          if (!orphanListenNames[id]) orphanListenNames[id] = { className: cn, name: name, weeks: [], isClass: false };
          orphanListenNames[id].weeks.push(k.date);
        }
      }
    }
  });
  const orphanListenList = Object.keys(orphanListenNames).map(id => {
    const o = orphanListenNames[id];
    const uniq = Array.from(new Set(o.weeks)).sort();
    return {
      className: o.className, name: o.name, isClass: o.isClass,
      weekCount: uniq.length,
      weekRange: uniq.length ? (uniq[0] + ' ~ ' + uniq[uniq.length - 1]) : '—'
    };
  });
  if (orphanListenList.length > 0) {
    issues.push({
      id: 'orphan-listen-names',
      severity: 'warn',
      title: '打卡数据里出现「config 里没有的学生名」',
      detail: '这些名字存在于打卡数据（nd-L-*）中，但当前班级名单里找不到对应学生。'
        + '改名或转班后，旧名字的打卡分钟数就留在了数据里，不会再被统计。'
        + '如果是改名遗留，建议用「改名」功能把名字替换过去（保留数据）；确认为废弃的可清理。',
      count: orphanListenList.length,
      items: orphanListenList.map(o => o.className + ' · ' + o.name + '（' + o.weekCount + ' 周数据，' + o.weekRange + '）'),
      fixable: true,
      fixLabel: '清理孤儿打卡数据',
      fixHint: '⚠️ 清理会删除这些名字的打卡分钟数（不可撤销，建议先备份）',
      fix: function() {
        let cleaned = 0, removedNames = 0;
        keys.listen.forEach(k => {
          let data;
          try { data = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
          if (!data || typeof data !== 'object') return;
          let changed = false;
          for (const cn in data) {
            if (!CLASSES[cn]) continue;
            for (const name in data[cn]) {
              if (!isKnownStudentName(cn, name)) { delete data[cn][name]; removedNames++; changed = true; }
            }
          }
          if (changed) { localStorage.setItem(k.key, JSON.stringify(data)); cleaned++; }
        });
        return '清理了 ' + cleaned + ' 周的打卡数据（共 ' + removedNames + ' 条学生记录）';
      }
    });
  }

  // ══════════════════════════════════════════════
  // 检查 5：打卡数据缺少当前在读学生的数据项
  // ══════════════════════════════════════════════
  const missingListenStudents = [];
  keys.listen.forEach(k => {
    let data;
    try { data = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;
    for (const cn in CLASSES) {
      if (!getSchedule(cn, new Date(k.date + 'T12:00:00'))) continue;
      const listStudents = getListeningStudents(cn);
      if (!data[cn]) continue; // 整班缺失由检查 6 处理
      listStudents.forEach(s => {
        if (!(s.name in data[cn])) {
          missingListenStudents.push({ className: cn, student: s.name, week: k.date });
        }
      });
    }
  });
  if (missingListenStudents.length > 0) {
    issues.push({
      id: 'missing-listen-students',
      severity: 'warn',
      title: '打卡数据缺少部分学生的记录项',
      detail: '这些周次的打卡数据里，没有当前在读学生的数据槽位。'
        + '通常发生在「数据导入不全」或「学生是在那周之后才加进 config」的情况下。'
        + '补齐后会以 0 分钟开始，不影响已有数据。',
      count: missingListenStudents.length,
      items: missingListenStudents.slice(0, 30).map(m => m.className + ' · ' + m.student + ' · ' + m.week + ' 那周'),
      moreCount: Math.max(0, missingListenStudents.length - 30),
      fixable: true,
      fixLabel: '补齐缺失的数据项',
      fix: function() {
        let fixed = 0;
        keys.listen.forEach(k => {
          let data;
          try { data = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
          if (!data || typeof data !== 'object') return;
          let changed = false;
          for (const cn in CLASSES) {
            if (!data[cn]) continue;
            getListeningStudents(cn).forEach(s => {
              if (!(s.name in data[cn])) {
                data[cn][s.name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
                fixed++; changed = true;
              }
            });
          }
          if (changed) { localStorage.setItem(k.key, JSON.stringify(data)); }
        });
        return '补齐了 ' + fixed + ' 条学生数据项';
      }
    });
  }

  // ══════════════════════════════════════════════
  // 检查 6：有排课但完全没打卡记录的日子（漏录提醒，仅最近 6 周）
  // ══════════════════════════════════════════════
  const sixWeeksAgo = new Date(today); sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const hadListenWeeks = new Set(keys.listen.map(k => k.date));
  const missingListenWeeks = [];
  // 遍历最近 6 周内每个班的每个上课日，看那天所在周有没有任何打卡数据
  for (let cn in CLASSES) {
    const cls = CLASSES[cn];
    if (cls.countFrom && new Date(cls.countFrom + 'T00:00:00') > today) continue;
    for (let d = new Date(sixWeeksAgo); d.getTime() <= today.getTime(); d.setDate(d.getDate() + 1)) {
      const ds = dateStr(d);
      if (!isLessonDate(cn, ds)) continue;
      const mon = getMonday(d);
      const monKey = dateStr(mon);
      if (!hadListenWeeks.has(monKey)) {
        missingListenWeeks.push({ className: cn, date: ds });
      }
    }
  }
  if (missingListenWeeks.length > 0) {
    // 按「周」聚合展示，避免刷屏
    const byWeek = {};
    missingListenWeeks.forEach(m => {
      const mon = getMonday(new Date(m.date + 'T12:00:00'));
      const mk = dateStr(mon);
      if (!byWeek[mk]) byWeek[mk] = { week: mk, classes: new Set() };
      byWeek[mk].classes.add(m.className);
    });
    const weekList = Object.keys(byWeek).sort().reverse();
    issues.push({
      id: 'missing-listen-weeks',
      severity: 'info',
      title: '最近 6 周内，有排课但整周没有打卡记录',
      detail: '这些周次在 localStorage 里完全没有打卡数据（nd-L-*）。'
        + '如果那周确实没布置打卡，可以忽略；如果是漏录，建议去「打卡追踪」页把那周的数据补上。',
      count: weekList.length,
      items: weekList.slice(0, 20).map(w => '第 ' + formatWeekRange(new Date(w + 'T12:00:00')) + ' 周（' + Array.from(byWeek[w].classes).join('、') + '）'),
      moreCount: Math.max(0, weekList.length - 20),
      fixable: false
    });
  }

  // ══════════════════════════════════════════════
  // 检查 7：视频记录日期不是上课日 / 类型与排课不符
  // ══════════════════════════════════════════════
  const badVideoDates = [];
  keys.video.forEach(k => {
    let rec;
    try { rec = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
    if (!rec || !rec.className || !rec.date) return;
    const cn = rec.className;
    if (!CLASSES[cn]) return; // 已在检查 3 报过
    const actualType = getLessonTypeOfDate(cn, rec.date);
    if (!actualType) {
      badVideoDates.push({ className: cn, date: rec.date, type: rec.type, issue: '不是上课日' });
    } else if (actualType !== rec.type) {
      badVideoDates.push({ className: cn, date: rec.date, type: rec.type, issue: '类型不符（该日是' + getLessonTypeLabel(actualType) + '）' });
    }
  });
  if (badVideoDates.length > 0) {
    issues.push({
      id: 'bad-video-dates',
      severity: 'info',
      title: '视频记录日期与排课对不上',
      detail: '这些视频记录（nd-V-*）的日期不是该班的上课日，或者课程类型和排课不符。'
        + '可能原因：手动建记录时选错日期；排课调整（如 2 班 6/20 切换）前的历史记录。'
        + '历史遗留可以忽略，最近新建的建议去「复述作业」页核对。',
      count: badVideoDates.length,
      items: badVideoDates.slice(0, 30).map(m => m.className + ' · ' + m.date + ' · 记录为' + getLessonTypeLabel(m.type) + ' · ' + m.issue),
      moreCount: Math.max(0, badVideoDates.length - 30),
      fixable: false
    });
  }

  // ══════════════════════════════════════════════
  // 检查 8：补交记录里的学生名不在 config
  // ══════════════════════════════════════════════
  const orphanLate = [];
  keys.late.forEach(k => {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(k.key)); } catch (e) { return; }
    if (!Array.isArray(arr)) return;
    // key 格式：late-{class}-{weekKey}
    const parts = k.body.split('-');
    const cn = parts[0];
    if (!CLASSES[cn]) return;
    arr.forEach((item, idx) => {
      if (item && item.name && !isKnownStudentName(cn, item.name)) {
        orphanLate.push({ className: cn, student: item.name, key: k.body });
      }
    });
  });
  if (orphanLate.length > 0) {
    issues.push({
      id: 'orphan-late-names',
      severity: 'warn',
      title: '补交记录里的学生名不在当前名单',
      detail: '这些补交记录（nd-late-*）指向的学生名在 config 里找不到。同上，多为改名/转班遗留。',
      count: orphanLate.length,
      items: orphanLate.slice(0, 30).map(m => m.className + ' · ' + m.student + '（' + m.key + '）'),
      moreCount: Math.max(0, orphanLate.length - 30),
      fixable: false
    });
  }

  // ══════════════════════════════════════════════
  // 检查 9：localStorage 容量
  // ══════════════════════════════════════════════
  // 口径：按「字符数」计（Chrome / Edge / Firefox 的配额就是 5M 字符）。
  // 不用 ×2 的字节口径——那会把 Safari 的字节算法套到所有浏览器上，占用虚报一倍。
  let totalChars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const val = localStorage.getItem(key) || '';
    totalChars += key.length + val.length;
  }
  const quotaChars = 5 * 1024 * 1024; // 5M 字符（主流浏览器）
  const usedPct = Math.round(totalChars / quotaChars * 100);
  if (usedPct >= 60) {
    issues.push({
      id: 'storage-size',
      severity: usedPct >= 90 ? 'danger' : 'info',
      title: '本地存储占用偏高',
      detail: '浏览器 localStorage 配额约 500 万字符，超出后写入会静默失败——'
        + '数据看起来录进去了，刷新就没了。建议导出备份后，清理不再需要的历史周次数据。'
        + '（口径：Chrome/Edge/Firefox 按字符计；若你用的是 Safari，实际占用约为此处数值的 2 倍）',
      count: usedPct,
      items: ['已用约 ' + totalChars.toLocaleString() + ' 字符 / 约 5,242,880 字符（' + usedPct + '%）'],
      fixable: false
    });
  }

  // 严重度排序
  const order = { danger: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return issues;
}

// ── 渲染体检页 ──
let _healthLastResult = null;

function renderHealth() {
  const issues = runHealthCheck();
  _healthLastResult = issues;
  const wrap = document.getElementById('healthContent');
  if (!wrap) return;

  const counts = { danger: 0, warn: 0, info: 0 };
  issues.forEach(i => counts[i.severity]++);

  const totalItems = issues.reduce((s, i) => s + i.count, 0);

  let html = '<div class="action-bar">'
    + '<span class="hint">全量扫描本地数据 · 帮你找出会让统计失真的地方</span>'
    + '<button class="btn btn-outline" onclick="renderHealth()">🔄 重新扫描</button>'
    + '<button class="btn btn-outline" onclick="exportAllBackup()">↓ 先备份</button>'
    + '<button class="btn-ghost" onclick="hideHealthTab()" title="隐藏体检页（可在周待办页恢复）">🙈 隐藏此页</button>'
    + '</div>';

  if (issues.length === 0) {
    html += '<div class="health-allgood">'
      + '<div class="health-allgood-icon">✨</div>'
      + '<div class="health-allgood-title">全部检查通过</div>'
      + '<div class="health-allgood-sub">本地数据一致性良好，没有发现会影响统计的问题。</div>'
      + '</div>';
    wrap.innerHTML = html;
    return;
  }

  // 汇总条
  html += '<div class="health-summary">';
  if (counts.danger > 0) html += '<div class="health-sum-item is-danger"><span class="n">' + counts.danger + '</span><span class="t">项会算错数字</span></div>';
  if (counts.warn > 0) html += '<div class="health-sum-item is-warn"><span class="n">' + counts.warn + '</span><span class="t">项数据可能丢失</span></div>';
  if (counts.info > 0) html += '<div class="health-sum-item is-info"><span class="n">' + counts.info + '</span><span class="t">项待确认</span></div>';
  html += '<div class="health-sum-item is-total"><span class="n">' + totalItems + '</span><span class="t">条记录受影响</span></div>';
  html += '</div>';

  // 分组渲染
  ['danger', 'warn', 'info'].forEach(sev => {
    const group = issues.filter(i => i.severity === sev);
    if (group.length === 0) return;
    const meta = HEALTH_SEVERITY[sev];
    html += '<div class="health-group ' + meta.cls + '">'
      + '<div class="health-group-head"><span class="health-group-icon">' + meta.icon + '</span>'
      + '<span class="health-group-title">' + meta.label + '</span></div>';

    group.forEach(issue => {
      html += '<div class="health-issue">'
        + '<div class="health-issue-head">'
        + '<span class="health-issue-title">' + escHtml(issue.title) + '</span>'
        + '<span class="health-issue-count">' + issue.count + '</span>'
        + '</div>'
        + '<div class="health-issue-detail">' + escHtml(issue.detail) + '</div>'
        + '<div class="health-issue-items"><ul>';
      issue.items.forEach(it => { html += '<li>' + escHtml(String(it)) + '</li>'; });
      if (issue.moreCount > 0) html += '<li class="more">… 还有 ' + issue.moreCount + ' 条</li>';
      html += '</ul></div>';

      if (issue.fixable) {
        if (issue.fixHint) html += '<div class="health-fix-hint">' + escHtml(issue.fixHint) + '</div>';
        html += '<div class="health-issue-actions">'
          + '<button class="btn btn-primary" onclick="applyHealthFix(\'' + issue.id + '\')">🔧 ' + escHtml(issue.fixLabel) + '</button>'
          + '</div>';
      } else {
        html += '<div class="health-issue-actions"><span class="health-no-auto">此项需你手动判断，未提供自动修复</span></div>';
      }
      html += '</div>';
    });
    html += '</div>';
  });

  wrap.innerHTML = html;
}

// 执行一键修复
function applyHealthFix(issueId) {
  if (!_healthLastResult) return;
  const issue = _healthLastResult.find(i => i.id === issueId);
  if (!issue || !issue.fixable || !issue.fix) return;

  // 危险操作二次确认
  const isDestructive = /清理/.test(issue.fixLabel || '');
  if (isDestructive) {
    if (!confirm('⚠️ 此操作会删除数据且不可撤销。\n\n确定要「' + issue.fixLabel + '」吗？\n建议先点「↓ 先备份」导出备份。')) return;
  }

  const msg = issue.fix();
  toast('✅ ' + msg);
  renderHealth();
}

// 隐藏体检页
function hideHealthTab() {
  if (!confirm('隐藏「数据体检」页？\n\n页面入口会从标签栏移除，之后可以在「周待办」页底部重新显示。')) return;
  setHealthTabHidden(true);
  applyHealthTabVisibility();
  switchTab('listening');
  toast('已隐藏体检页，可在周待办页底部恢复');
}

// 显示体检页
function showHealthTab() {
  setHealthTabHidden(false);
  applyHealthTabVisibility();
  switchTab('health');
  toast('体检页已恢复显示');
}

// 根据开关状态控制标签栏上体检按钮的显隐
function applyHealthTabVisibility() {
  const btn = document.getElementById('tabBtnHealth');
  if (btn) btn.style.display = isHealthTabHidden() ? 'none' : '';
}

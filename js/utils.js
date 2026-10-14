// ╔══════════════════════════════════════════╗
// ║             DATE UTILITIES              ║
// ╚══════════════════════════════════════════╝

function getMonday(d) {
  const d2 = new Date(d);
  const day = d2.getDay();
  const diff = d2.getDate() - day + (day === 0 ? -6 : 1);
  d2.setDate(diff); d2.setHours(0, 0, 0, 0);
  return d2;
}
function getSunday(d) {
  const mon = getMonday(d);
  mon.setDate(mon.getDate() + 6);
  return mon;
}
function getCurrentMonday() { return getMonday(new Date()); }
function getWeekMonday(offset) {
  const m = getCurrentMonday();
  m.setDate(m.getDate() + offset * 7);
  return m;
}
function dateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

// ISO week
function getISOWeekKey(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
}
function getMondayOfISOWeek(weekKey) {
  const [y, w] = weekKey.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - (jan4Day - 1));
  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + (w - 1) * 7);
  return monday;
}

function getPrevWeekKey(weekKey) {
  const mon = getMondayOfISOWeek(weekKey);
  mon.setDate(mon.getDate() - 7);
  return getISOWeekKey(mon);
}
function getNextWeekKey(weekKey) {
  const mon = getMondayOfISOWeek(weekKey);
  mon.setDate(mon.getDate() + 7);
  return getISOWeekKey(mon);
}

// ╔══════════════════════════════════════════╗
// ║    TEACHING CYCLE HELPERS (VIDEO TAB)   ║
// ╚══════════════════════════════════════════╝
// A cycle = new lesson date (anchor) + its paired review lesson.
function getPairedReviewDate(newDateStr, className) {
  const cls = getSchedule(className, newDateStr);
  const diff = (cls.reviewDay - cls.newLessonDay + 7) % 7;
  const d = new Date(newDateStr + 'T12:00:00');
  d.setDate(d.getDate() + diff);
  return d;
}
function getPairedNewDate(reviewDateStr, className) {
  const cls = getSchedule(className, reviewDateStr);
  const diff = (cls.reviewDay - cls.newLessonDay + 7) % 7;
  const d = new Date(reviewDateStr + 'T12:00:00');
  d.setDate(d.getDate() - diff);
  return d;
}
// Given an anchor date, find the ACTUAL new-lesson date and paired review date for a video cycle.
// This handles schedule changes (e.g. 2班 flipped on 2026-06-20) by using getSchedule()
// to determine which lesson-day mapping applies at the anchor's point in time.
function getVideoCycleDates(anchorDateStr, className) {
  const sched = getSchedule(className, new Date(anchorDateStr + 'T12:00:00'));
  const anchorDow = new Date(anchorDateStr + 'T12:00:00').getDay();
  // Walk backwards from anchor to find the nearest new-lesson day-of-week
  const daysToNew = (anchorDow - sched.newLessonDay + 7) % 7;
  const newDateObj = new Date(anchorDateStr + 'T12:00:00');
  newDateObj.setDate(newDateObj.getDate() - daysToNew);
  const newDateStr = dateStr(newDateObj);
  const reviewDateObj = getPairedReviewDate(newDateStr, className);
  return { newDateStr, newDateObj, reviewDateStr: dateStr(reviewDateObj), reviewDateObj };
}

function getCurrentCycleAnchor() {
  const today = new Date();
  const todayDow = today.getDay();
  const cls = getSchedule(currentClass, today);
  const daysSinceNew = (todayDow - cls.newLessonDay + 7) % 7;
  today.setDate(today.getDate() - daysSinceNew);
  return dateStr(today);
}
function fmtCycleRange(anchorDateStr, className) {
  // Resolve actual lesson dates from anchor (handles schedule changes like 2班 flip)
  const cycle = getVideoCycleDates(anchorDateStr, className);
  const fmt = function(d) { return (d.getMonth()+1) + '月' + d.getDate() + '日'; };
  return fmt(cycle.newDateObj) + ' — ' + fmt(cycle.reviewDateObj);
}

// ╔══════════════════════════════════════════════════════════╗
// ║  报告周 = 月内自然周（周一 → 周日，按当月天数裁切）        ║
// ║  例：2026-09 → 9/1–9/6(6天)、9/7–9/13、9/14–9/20、        ║
// ║                9/21–9/27、9/28–9/30(3天)  ＝ 30 天         ║
// ║  规则：周结束时落在周日；跨月的周被月份边界切开（不跨月） ║
// ╚══════════════════════════════════════════════════════════╝

// 含 date 的那个「月内自然周」的起始日（周一；若跨到上个月则取当月 1 号）
function getReportWeekStart(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const mon = getMonday(d);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  return mon.getTime() < monthStart.getTime() ? monthStart : mon;
}
// 对应周的结束日（周日；若跨到下个月则取当月最后一天）。返回 00:00:00
function getReportWeekEnd(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  const sun = getSunday(ws);
  const monthEnd = new Date(ws.getFullYear(), ws.getMonth() + 1, 0);
  return sun.getTime() > monthEnd.getTime() ? monthEnd : sun;
}
// 该周的天数（1~7）
function getReportWeekDays(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  return Math.round((getReportWeekEnd(ws).getTime() - ws.getTime()) / 86400000) + 1;
}
// 上一个 / 下一个报告周（自动跨月）
function getPrevReportWeekStart(weekStart) {
  const d = new Date(weekStart); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
  return getReportWeekStart(d);
}
function getNextReportWeekStart(weekStart) {
  const d = getReportWeekEnd(weekStart); d.setDate(d.getDate() + 1);
  return getReportWeekStart(d);
}
// 该周在当月是第几周（1-based）
function getReportWeekIndex(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  let cur = new Date(ws.getFullYear(), ws.getMonth(), 1), idx = 1;
  while (cur.getTime() < ws.getTime()) { cur = getNextReportWeekStart(cur); idx++; }
  return idx;
}
// 「9月第1周」
function getReportWeekMonthLabel(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  return (ws.getMonth() + 1) + '月第' + getReportWeekIndex(ws) + '周';
}
// 区间文本「9月1日 - 6日」
function formatReportWeek(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  const we = getReportWeekEnd(ws);
  return (ws.getMonth() + 1) + '月' + ws.getDate() + '日 - ' + we.getDate() + '日';
}
// 报告周存储键（周报文本 / 补交）：用周起始日，避免 ISO 周在跨月拆周时重复
function getReportWeekKey(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  return dateStr(ws);
}
// 兼容旧数据：老的 ISO 周键（旧口径是「周日~周六」）
function getLegacyReportWeekKeys(weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  const we = getReportWeekEnd(ws);
  const nextSat = new Date(we); nextSat.setDate(nextSat.getDate() + 6);
  const keys = [getISOWeekKey(ws), getISOWeekKey(we), getISOWeekKey(nextSat)];
  return keys.filter(function(v, i, a) { return v && a.indexOf(v) === i; });
}
// 某个月的全部「月内自然周」（[{start, end}]）
function getMonthReportWeeks(year, month0) {
  const weeks = [];
  const monthEnd = new Date(year, month0 + 1, 0); monthEnd.setHours(0, 0, 0, 0);
  let cur = new Date(year, month0, 1); cur.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cur.getTime() <= monthEnd.getTime() && guard++ < 8) {
    weeks.push({ start: new Date(cur), end: getReportWeekEnd(cur) });
    const nx = getNextReportWeekStart(cur);
    if (nx.getTime() <= cur.getTime()) break;
    cur = nx;
  }
  return weeks;
}

// Schedule date helpers
function getScheduleDate(weekKey, dayOfWeek) {
  const [y, w] = weekKey.split('-W').map(Number);
  const mon = getMondayOfISOWeek(weekKey);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // JS: 0=Sun, convert to offset from Mon
  const target = new Date(mon);
  target.setDate(mon.getDate() + offset);
  return target;
}

function dateToDayKey(d) {
  const keys = ['sun','mon','tue','wed','thu','fri','sat'];
  return keys[d.getDay()];
}

// 报告周内该班的上课日。周到日不是 7 天时可能缺其中一个（返回 null），
// null 表示「本周没有这节课」——调用方需自行过滤，勿直接 dateStr()。
function getLessonDatesInReportWeek(className, weekStart) {
  const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
  const we = getReportWeekEnd(ws);
  const sched = getSchedule(className, we);
  if (!sched) return null;
  const findByDow = function(dow) {
    const d = new Date(ws);
    while (d.getTime() <= we.getTime() && d.getDay() !== dow) d.setDate(d.getDate() + 1);
    return d.getTime() <= we.getTime() ? d : null;
  };
  const nl = findByDow(sched.newLessonDay);
  const rv = findByDow(sched.reviewDay);
  if (!nl && !rv) return null;
  return { newLesson: nl, review: rv, lessons: [nl, rv].filter(Boolean) };
}

// 判断学生在本报告周是否存在「连续 2 次以上请假」：
//   ① 本周两节课都请假；② 上周最后一节课 + 本周第一节课都请假
function isConsecutiveLeave(className, student, weekStart) {
  const ld = getLessonDatesInReportWeek(className, weekStart);
  if (!ld || ld.lessons.length === 0) return false;

  var getStatus = function(k) {
    var attData = loadAttendance(k);
    return attData[className] ? (attData[className][student] || 'present') : 'present';
  };

  // 本周课程按时间升序
  const thisLessons = ld.lessons.slice().sort(function(a, b) { return a - b; });

  // ① 本周两节都请假
  if (thisLessons.length >= 2 && thisLessons.every(function(d) { return getStatus(dateStr(d)) === 'leave'; })) return true;

  // ② 上周最后一节 + 本周第一节都请假
  if (getStatus(dateStr(thisLessons[0])) !== 'leave') return false;
  const prevStart = getPrevReportWeekStart(weekStart);
  const pld = getLessonDatesInReportWeek(className, prevStart);
  if (!pld || pld.lessons.length === 0) return false;
  const prevLast = pld.lessons.slice().sort(function(a, b) { return a - b; }).pop();
  return getStatus(dateStr(prevLast)) === 'leave';
}

// Ranking window: newLessonDay ~ day before reviewDay
function getRankingWindow(className, refDate) {
  const cls = getSchedule(className, refDate);
  if (!cls) return null;
  // Find the new lesson date that starts the course week containing refDate
  const dayOfWeek = refDate.getDay();
  const daysSinceNewLesson = (dayOfWeek - cls.newLessonDay + 7) % 7;
  const nlDate = new Date(refDate);
  nlDate.setDate(refDate.getDate() - daysSinceNewLesson);
  nlDate.setHours(0, 0, 0, 0);
  // Review day offset from new lesson day
  const reviewOffset = (cls.reviewDay - cls.newLessonDay + 7) % 7;
  let revDate = new Date(nlDate);
  revDate.setDate(nlDate.getDate() + reviewOffset);
  revDate.setHours(0, 0, 0, 0);
  if (revDate.getTime() <= nlDate.getTime()) revDate.setDate(revDate.getDate() + 7);
  const end = new Date(revDate);
  end.setDate(end.getDate() - 1);
  return { start: nlDate, end };
}

function getFullAttendanceWindow(className, refDate) {
  const cls = getSchedule(className, refDate);
  if (!cls) return null;
  // Find the new lesson date that starts the course week containing refDate
  const dayOfWeek = refDate.getDay();
  const daysSinceNewLesson = (dayOfWeek - cls.newLessonDay + 7) % 7;
  const nlDate = new Date(refDate);
  nlDate.setDate(refDate.getDate() - daysSinceNewLesson);
  nlDate.setHours(0, 0, 0, 0);
  const end = new Date(nlDate);
  end.setDate(end.getDate() + 6);
  return { start: nlDate, end };
}

function sumMinutesInWindow(className, name, start, end, listenData) {
  let sum = 0;
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    sum += loadMinutesForDate(className, name, d, listenData);
    d.setDate(d.getDate() + 1);
  }
  return sum;
}

function isFullAttendance(className, name, start, end, listenData) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    if (d.getTime() <= today.getTime()) {
      if (loadMinutesForDate(className, name, d, listenData) < TARGET) return false;
    }
    d.setDate(d.getDate() + 1);
  }
  return true;
}

function countFullAttendanceDays(className, name, start, end, listenData) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cnt = 0;
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    if (d.getTime() <= today.getTime()) {
      if (loadMinutesForDate(className, name, d, listenData) >= TARGET) cnt++;
    }
    d.setDate(d.getDate() + 1);
  }
  return cnt;
}

function getDayCountInWindow(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatRankingWeekLabel(offset) {
  if (offset === 0) return '本周';
  if (offset === -1) return '上周';
  if (offset === 1) return '下周';
  if (offset < 0) return Math.abs(offset) + '周前';
  return offset + '周后';
}

// Load minutes for a specific date (cross-week lookup)
function loadMinutesForDate(className, name, date, listenData) {
  const srcName = resolveListenName(className, name);
  const mon = getMonday(date);
  const key = getListenKey(mon);

  // First check passed-in listenData if available
  if (listenData) {
    if (listenData[className] && listenData[className][srcName] !== undefined) {
      const dk = dateToDayKey(date);
      return listenData[className][srcName][dk] || 0;
    }
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const weekData = JSON.parse(raw);
      if (weekData[className] && weekData[className][srcName] !== undefined) {
        const dk = dateToDayKey(date);
        return weekData[className][srcName][dk] || 0;
      }
    }
  } catch (e) {}

  // Fall back to DEFAULT_LISTENING
  if (key === DEFAULT_MONDAY_KEY && DEFAULT_LISTENING[className] && DEFAULT_LISTENING[className][srcName]) {
    const dk = dateToDayKey(date);
    return DEFAULT_LISTENING[className][srcName][dk] || 0;
  }
  return 0;
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

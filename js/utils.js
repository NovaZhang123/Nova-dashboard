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

// Report week: Sun ~ Sat (most recently completed Saturday → go back to its Sunday)
function getReportWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Find the most recently completed Saturday
  const daysSinceSaturday = day === 6 ? 0 : day + 1;
  const lastSat = new Date(d);
  lastSat.setDate(d.getDate() - daysSinceSaturday);
  // Go back to the Sunday before that Saturday
  lastSat.setDate(lastSat.getDate() - 6);
  lastSat.setHours(0, 0, 0, 0);
  return lastSat; // returns Sunday
}
function getReportWeekEnd(sunday) {
  const end = new Date(sunday);
  end.setDate(sunday.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);
  return end;
}
function formatReportWeek(sunday) {
  const sat = new Date(sunday);
  sat.setDate(sunday.getDate() + 6);
  const sm = sunday.getMonth() + 1, sd = sunday.getDate();
  const em = sat.getMonth() + 1, ed = sat.getDate();
  if (sm === em) return sm + '月' + sd + '日 - ' + ed + '日';
  return sm + '月' + sd + '日 - ' + em + '月' + ed + '日';
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

// Get new lesson and review dates for a class within a report week (Sun ~ Sat)
function getLessonDatesInReportWeek(className, reportSunday) {
  const sat = new Date(reportSunday);
  sat.setDate(reportSunday.getDate() + 6);
  const sched = getSchedule(className, sat);
  if (!sched) return null;
  const nl = new Date(reportSunday);
  nl.setDate(reportSunday.getDate() + sched.newLessonDay);
  nl.setHours(0, 0, 0, 0);
  const rv = new Date(reportSunday);
  rv.setDate(reportSunday.getDate() + sched.reviewDay);
  rv.setHours(0, 0, 0, 0);
  return { newLesson: nl, review: rv };
}

// Check if a student has 2+ consecutive lesson absences that overlap with this report week
// Covers: (1) both lessons this week are leave, (2) last lesson of prev week + first lesson of this week are leave
function isConsecutiveLeave(className, student, reportSunday) {
  const lessonDates = getLessonDatesInReportWeek(className, reportSunday);
  if (!lessonDates) return false;

  // Sort this week's lessons chronologically
  const thisWeekLessons = [
    { date: lessonDates.newLesson, key: dateStr(lessonDates.newLesson) },
    { date: lessonDates.review, key: dateStr(lessonDates.review) }
  ].sort((a, b) => a.date - b.date);

  var getStatus = function(dateKey) {
    var attData = loadAttendance(dateKey);
    return attData[className] ? (attData[className][student] || 'present') : 'present';
  };

  var s1 = getStatus(thisWeekLessons[0].key);
  var s2 = getStatus(thisWeekLessons[1].key);

  // Case 1: both lessons this week are leave
  if (s1 === 'leave' && s2 === 'leave') return true;

  // Case 2: last lesson of previous week + first lesson of this week are both leave
  // (e.g., review of cycle N absent → new lesson of cycle N+1 absent)
  var prevSunday = new Date(reportSunday);
  prevSunday.setDate(prevSunday.getDate() - 7);
  var prevLessonDates = getLessonDatesInReportWeek(className, prevSunday);
  if (prevLessonDates) {
    var prevLessons = [
      { date: prevLessonDates.newLesson, key: dateStr(prevLessonDates.newLesson) },
      { date: prevLessonDates.review, key: dateStr(prevLessonDates.review) }
    ].sort((a, b) => b.date - a.date); // descending → first = latest
    var prevStatus = getStatus(prevLessons[0].key);
    if (prevStatus === 'leave' && s1 === 'leave') return true;
  }

  return false;
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

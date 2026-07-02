// ╔══════════════════════════════════════════╗
// ║          DATA MODEL & CONFIG            ║
// ╚══════════════════════════════════════════╝

const TARGET = 40;
const DAY_LABELS = ['周一','周二','周三','周四','周五','周六','周日'];
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_SHORT = ['一','二','三','四','五','六','日'];

const PIRATE_COINS = [8, 6, 4];

// Unified class & student definitions
const CLASSES = {
  '1班': {
    newLessonDay: 0, reviewDay: 5, // Sun new, Fri review
    students: [
      { name: '董彭芃', en: 'Mark', syncWith: null },
      { name: '彭恰恰', en: 'Mike', syncWith: '董彭芃' },
      { name: '郭知瑶', en: 'Lumi', syncWith: null },
      { name: '王娜',   en: 'Emma', syncWith: null },
      { name: '李明泽', en: 'Yolanda', syncWith: null },
      { name: '刘翼梦', en: 'Iris', exemptListening: true },
    ]
  },
  '2班': {
    newLessonDay: 6, reviewDay: 2, // Sat new, Tue review
    students: [
      { name: '赵千祎', en: 'Anna', syncWith: null },
      { name: '孙晓霖', en: 'Amy', syncWith: null },
      { name: '徐提珈', en: 'Lucas', syncWith: null },
      { name: '陈宗楷', en: 'Alex', syncWith: null },
      { name: '陈熙',   en: 'Ada', syncWith: null },
      { name: '尹续菲', en: 'Molly', syncWith: null, leftDate: '2026-06-20' },
    ]
  },
  '6班': {
    newLessonDay: 6, reviewDay: 3, // Sat new, Wed review
    students: [
      { name: '王俊朔', en: 'Edward', syncWith: null, transferredDate: '2026-05-13' },
      { name: '李艺明', en: 'Eva', syncWith: null, transferredDate: '2026-05-13' },
      { name: '张宸滋', en: 'Daisy', syncWith: null, transferredDate: '2026-05-13' },
      { name: '张毓君', en: 'Hannah', syncWith: null, transferredDate: '2026-05-13' },
      { name: '杨栩',   en: 'Willian', syncWith: null },
      { name: '刘敬斌', en: 'Daniel', syncWith: null },
      { name: '陈文楷', en: 'Leo', syncWith: null },
      { name: '田俊杰', en: 'Matt', syncWith: null },
      { name: '朱昱颖', en: 'Luna', syncWith: null },
      { name: '刘秋昀', en: 'Samson', syncWith: null, joinedDate: '2026-05-06' },
      { name: '李元祁', en: 'Rex',    syncWith: null, joinedDate: '2026-06-21' },
      { name: '朱传柠', en: null,    syncWith: null, leftDate: '2026-04-08' },
      { name: '罗浠潼', en: null,    syncWith: null, leftDate: '2026-04-15' },
    ]
  }
};

// 2班课表切分：2026-06-20 之前旧课表（周二新课、周六复习），之后新课表（周六新课、周二复习）
const SCHEDULE_CUTOVER_2BAN = new Date('2026-06-20T00:00:00');
function getSchedule(className, dateInput) {
  if (className !== '2班') return CLASSES[className];
  const sched = CLASSES[className];
  if (!sched) return sched;
  let d;
  if (dateInput instanceof Date) { d = dateInput; }
  else { d = new Date(dateInput + 'T00:00:00'); }
  if (d < SCHEDULE_CUTOVER_2BAN) {
    return { newLessonDay: 2, reviewDay: 6, students: sched.students };
  }
  return { newLessonDay: 6, reviewDay: 2, students: sched.students };
}

// Helper: get student config by name
function getStudentCfg(className, name) {
  const cls = CLASSES[className];
  if (!cls) return null;
  return cls.students.find(s => s.name === name) || null;
}

// New student helpers: graduated listening targets & join-date exemption
// Returns true if a report week is before this student's join/transfer date
function isBeforeJoinWeek(cn, name, reportSunday) {
  const cfg = getStudentCfg(cn, name);
  if (!cfg) return false;
  const cutoffDate = cfg.joinedDate || cfg.transferredDate;
  if (!cutoffDate) return false;
  const cutoff = new Date(cutoffDate + 'T00:00:00');
  return reportSunday.getTime() < cutoff.getTime();
}

// Returns true if a report week is after this student's left date (退学/停课)
// Rule: if the week's Saturday >= leftDate, the student is exempt for that week
function isAfterLeftWeek(cn, name, reportSunday) {
  const cfg = getStudentCfg(cn, name);
  if (!cfg || !cfg.leftDate) return false;
  const left = new Date(cfg.leftDate + 'T00:00:00');
  const sat = new Date(reportSunday);
  sat.setDate(sat.getDate() + 6);
  return sat.getTime() >= left.getTime();
}

// Combined check: student is exempt if before join OR after left
function isStudentInactive(cn, name, reportSunday) {
  return isBeforeJoinWeek(cn, name, reportSunday) || isAfterLeftWeek(cn, name, reportSunday);
}

// Returns graduated listening target (minutes) based on how long student has been enrolled
// Month 1 (0-30 days): 20 min | Month 2 (31-60 days): 30 min | Month 3+ (>60 days): 40 min
function getStudentTarget(cn, name, refDate) {
  const cfg = getStudentCfg(cn, name);
  if (!cfg || !cfg.joinedDate) return TARGET; // normal target
  const joined = new Date(cfg.joinedDate + 'T00:00:00');
  const daysSinceJoin = Math.floor((refDate.getTime() - joined.getTime()) / 86400000);
  if (daysSinceJoin < 31) return 20;
  if (daysSinceJoin < 61) return 30;
  return TARGET; // month 3+: same as everyone
}

// Get listening-eligible students for a class (exclude exempt)
function getListeningStudents(className) {
  const cls = CLASSES[className];
  if (!cls) return [];
  return cls.students.filter(s => !s.exemptListening);
}

// Get display students for a class — excludes left students (退学/停课)
// Used in UI tabs: 打卡追踪, 排名奖励, 周报, 出勤
function getDisplayStudents(className) {
  const cls = CLASSES[className];
  if (!cls) return [];
  return cls.students.filter(s => {
    const cfg = s;
    return !cfg.leftDate;
  });
}

// Get all students for a class
function getAllStudents(className) {
  return (CLASSES[className] || {}).students || [];
}

// Resolve sync: if student has syncWith, return the source name
function resolveListenName(className, name) {
  const cfg = getStudentCfg(className, name);
  if (cfg && cfg.syncWith) return cfg.syncWith;
  return name;
}

// Default listening data (one example week)
const DEFAULT_LISTENING = {
  '1班': {
    '董彭芃': { mon: 78, tue: 65, wed: 38, thu: 57, fri: 91, sat: 99, sun: 36 },
    '郭知瑶': { mon: 120, tue: 46, wed: 30, thu: 74, fri: 79, sat: 51, sun: 40 },
    '王娜':   { mon: 44, tue: 46, wed: 51, thu: 92, fri: 2, sat: 65, sun: 50 },
    '李明泽': { mon: 17, tue: 23, wed: 0, thu: 0, fri: 38, sat: 93, sun: 37 },
  },
  '2班': {
    '赵千祎': { mon: 50, tue: 102, wed: 43, thu: 41, fri: 49, sat: 73, sun: 38 },
    '孙晓霖': { mon: 89, tue: 51, wed: 94, thu: 92, fri: 92, sat: 115, sun: 97 },
    '徐提珈': { mon: 0, tue: 0, wed: 0, thu: 80, fri: 0, sat: 0, sun: 0 },
    '陈宗楷': { mon: 42, tue: 43, wed: 43, thu: 49, fri: 43, sat: 49, sun: 0 },
    '陈熙':   { mon: 176, tue: 88, wed: 172, thu: 163, fri: 105, sat: 82, sun: 154 },
    '尹续菲': { mon: 55, tue: 45, wed: 71, thu: 52, fri: 46, sat: 40, sun: 48 },
  },
  '6班': {
    '王俊朔': { mon: 119, tue: 95, wed: 62, thu: 88, fri: 74, sat: 14, sun: 44 },
    '李艺明': { mon: 187, tue: 52, wed: 47, thu: 104, fri: 35, sat: 20, sun: 108 },
    '张宸滋': { mon: 175, tue: 45, wed: 54, thu: 61, fri: 67, sat: 0, sun: 46 },
    '张毓君': { mon: 0, tue: 21, wed: 0, thu: 44, fri: 45, sat: 72, sun: 89 },
    '杨栩':   { mon: 0, tue: 41, wed: 42, thu: 43, fri: 44, sat: 130, sun: 481 },
    '刘敬斌': { mon: 19, tue: 27, wed: 36, thu: 32, fri: 9, sat: 9, sun: 0 },
    '陈文楷': { mon: 96, tue: 97, wed: 38, thu: 130, fri: 134, sat: 13, sun: 87 },
    '田俊杰': { mon: 48, tue: 43, wed: 0, thu: 54, fri: 46, sat: 93, sun: 98 },
    '朱昱颖': { mon: 47, tue: 49, wed: 49, thu: 44, fri: 22, sat: 46, sun: 45 },
    '刘秋昀': { mon: 70, tue: 40, wed: 88, thu: 51, fri: 0, sat: 52, sun: 42 },
    '李元祁': { mon: 0,  tue: 0,  wed: 0,  thu: 0,  fri: 0, sat: 0,  sun: 0  },
  }
};

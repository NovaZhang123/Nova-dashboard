// ╔══════════════════════════════════════════╗
// ║          TAB 4: WEEKLY REPORT           ║
// ╚══════════════════════════════════════════╝

// ╔══════════════════════════════════════════╗
// ║     REPORT TEXT INPUTS STORAGE           ║
// ╚══════════════════════════════════════════╝

function getReportTextKey() {
  const sat = new Date(currentReportSunday);
  sat.setDate(currentReportSunday.getDate() + 6);
  return STORAGE_PREFIX + 'report-text-' + getISOWeekKey(sat);
}
function loadReportTexts() {
  try { return JSON.parse(localStorage.getItem(getReportTextKey()) || '{}'); } catch(e) { return {}; }
}
function saveReportTexts(data) {
  const key = getReportTextKey();
  if (Object.keys(data).every(k => !data[k])) { localStorage.removeItem(key); return; }
  localStorage.setItem(key, JSON.stringify(data));
}

// ⭐ 综合评星：两月周期数据（支持月份导航 + 复制绩效文案）
window.starMonthOffset = 0; // 0 = current pair, -2 = prev pair, etc.

function renderReport() {
  const sun = currentReportSunday;
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  const weekLabel = formatReportWeek(sun);

  let html = '<div class="action-bar"><span class="hint">周报区间：上周日 ~ 本周六</span>'
    + '<div class="week-nav"><button onclick="prevWeekRp()">◀</button>'
    + '<span class="week-label">' + weekLabel + '</span>'
    + '<button onclick="nextWeekRp()">▶</button>'
    + '<button onclick="goTodayRp()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周报</button></div>'
    + '<button class="btn btn-outline" onclick="downloadReportExcel()">📊 导出 Excel</button>'
    + '<button class="btn btn-outline" onclick="downloadReportPPTX()" style="background:#4F46E5;color:#fff;border-color:#4F46E5">📑 导出 PPTX</button></div>';

  // Accumulate global totals
  let globalListenTotal = 0, globalListenMet = 0;
  let globalVideoTotal = 0, globalVideoDone = 0, globalVideoLate = 0;
  let globalAttTotal = 0, globalAttPresent = 0, globalAttBaseTotal = 0;

  // For each class
  for (const cn of Object.keys(CLASSES)) {
    const students = getDisplayStudents(cn);

    // Calculate listening stats for report week
    const listenRows = students.map(s => {
      if (getStudentCfg(cn, s.name).exemptListening) {
        return { name: s.name, listening: '免打卡', listeningRate: null };
      }
      if (isAfterLeftWeek(cn, s.name, sun)) {
        return { name: s.name, listening: '已退学', listeningRate: null, exemptReason: '已退学/停课' };
      }
      if (isBeforeJoinWeek(cn, s.name, sun)) {
        return { name: s.name, listening: '未加入', listeningRate: null, exemptReason: '新生未加入' };
      }
      // Consecutive leave exemption: both lessons in this week were missed
      if (isConsecutiveLeave(cn, s.name, sun)) {
        return { name: s.name, listening: '请假中', listeningRate: null, exemptReason: '连续请假' };
      }
      let totalDays = 0, metDays = 0;
      const d = new Date(sun);
      while (d.getTime() <= sat.getTime()) {
        totalDays++;
        if (loadMinutesForDate(cn, s.name, d) >= TARGET) metDays++;
        d.setDate(d.getDate() + 1);
      }
      return { name: s.name, listening: metDays + '/' + totalDays, listeningRate: totalDays > 0 ? metDays / totalDays : 0 };
    });

    // 视频统计 V2：只统计截止日期已过的作业
    // 使用理论配对日期（而非已创建记录）作为截止日，确保排课切换后不误判
    const lessonDates = getLessonDatesInReportWeek(cn, sun);
    const videoByName = {};
    let videoTotal = 0, videoDone = 0, videoLateTotal = 0;
    students.forEach(s => { videoByName[s.name] = { total: 0, done: 0, lateCount: 0 }; });

    {
      const todayStr = dateStr(new Date());
      const toCount = getReportWeekVideoEntries(cn, sun, todayStr);
      const leaves = loadLeaves();
      toCount.forEach(rec => {
        students.forEach(s => {
          if (isLeaveNoMakeup(cn, s.name, rec.date)) return;
          if (isStudentInactive(cn, s.name, sun)) return;
          videoByName[s.name].total++;
          videoTotal++;
          if (rec.submissions[s.name]) { videoByName[s.name].done++; videoDone++; }
        });
      });
    }

    // Attendance stats
    const attByName = {};
    let attTotal = 0, attPresent = 0;
    students.forEach(s => { attByName[s.name] = { total: 2, present: 0, makeupCount: 0 }; });

    if (lessonDates) {
      [lessonDates.newLesson, lessonDates.review].forEach(ld => {
        const attData = loadAttendance(dateStr(ld));
        if (attData[cn]) {
          students.forEach(s => {
            if (isStudentInactive(cn, s.name, sun)) return;
            const status = attData[cn][s.name] || 'present';
            attTotal++;
            if (status === 'present') { attByName[s.name].present++; attPresent++; }
          });
        } else {
          students.forEach(s => {
            if (isStudentInactive(cn, s.name, sun)) return;
            attTotal++;
            attByName[s.name].present++; attPresent++;
          });
        }
      });
    }

    // Add makeup attendance from other weeks — cross-week makeups boost current week's attendance
    const leaves = loadLeaves();
    leaves.forEach(l => {
      if (!l.makeupScheduled || !l.makeupDate) return;
      if (l.className !== cn) return;
      const md = new Date(l.makeupDate + 'T00:00:00');
      if (md >= sun && md <= sat) {
        // Skip if this is just a regular attendance for current week's own lesson
        const isOwnLesson = lessonDates && (
          l.date === dateStr(lessonDates.newLesson) ||
          l.date === dateStr(lessonDates.review)
        );
        if (!isOwnLesson) {
          if (!attByName[l.student]) attByName[l.student] = { total: 2, present: 0, makeupCount: 0 };
          attByName[l.student].total++;
          attByName[l.student].present++;
          attByName[l.student].makeupCount++;
          attTotal++;
          attPresent++;
        }
      }
    });

    // Count manually-added late video submissions for this report week
    // Track separately from normal done — display as "+N 补交"
    const toCountLen = getReportWeekVideoEntries(cn, sun, dateStr(new Date())).length;
    const reportWeekKey = getISOWeekKey(sat);
    const reportLateSubs = loadLateSubs(cn, reportWeekKey);
    reportLateSubs.forEach(ls => {
      const vs = videoByName[ls.name];
      if (vs) {
        vs.lateCount++;
        videoLateTotal++;
      } else {
        videoByName[ls.name] = { total: toCountLen, done: 0, lateCount: 1 };
        videoLateTotal++;
      }
    });

    // Build table
    var videoPeriodDesc = getReportWeekVideoPeriodInfo(cn, sun).desc;
    html += '<div class="report-table-wrap"><table class="report-table"><thead><tr>'
      + '<th>学生</th><th>听录音</th><th>录音达标率</th><th>视频打卡</th><th>视频达标率</th><th>出勤</th><th>出勤率</th><th></th></tr>'
      + '<tr class="video-period-hint"><td colspan="3"></td><td colspan="2" style="font-size:.68rem;color:#64748B;font-weight:400;padding:2px 8px 6px;text-align:center">' + videoPeriodDesc + '</td><td colspan="3"></td></tr>'
      + '</thead><tbody>';

    students.forEach(s => {
      const lr = listenRows.find(r => r.name === s.name);
      const va = videoByName[s.name];
      const aa = attByName[s.name];

      const lRate = lr.listeningRate !== null ? (lr.listeningRate >= 0.7 ? 'rate-good' : 'rate-bad') : 'rate-na';
      const lRateText = lr.listeningRate !== null ? (lr.listeningRate * 100).toFixed(0) + '%' : '—';
      const vRate = va.total > 0 ? ((va.done + va.lateCount) / va.total >= 0.5 ? 'rate-good' : 'rate-bad') : 'rate-na';
      const vRateText = va.total > 0 ? ((va.done + va.lateCount) / va.total * 100).toFixed(0) + '%' : '—';
      const aRate = aa.total > 0 ? ((aa.present / aa.total) >= 0.8 ? 'rate-good' : 'rate-bad') : 'rate-na';
      const aRateText = aa.total > 0 ? (aa.present / aa.total * 100).toFixed(0) + '%' : '—';
      const aDisplay = (aa.makeupCount || 0) > 0 ? aa.present + '/' + aa.total + ' ⚡' : aa.present + '/' + aa.total;

      const vDisplay = va.done + '/' + va.total + (va.lateCount > 0 ? ' ⚡+' + va.lateCount : '');
      const rowClass = lr.exemptReason ? ' style="opacity:0.4"' : '';

      html += '<tr' + rowClass + '>'
        + '<td class="name-col">' + escHtml(s.name) + (lr.exemptReason ? ' <span style="font-size:.7em;color:#94a3b8">(' + lr.exemptReason + ')</span>' : '') + '</td>'
        + '<td>' + lr.listening + '</td>'
        + '<td class="' + lRate + '">' + lRateText + '</td>'
        + '<td>' + vDisplay + '</td>'
        + '<td class="' + vRate + '">' + vRateText + '</td>'
        + '<td>' + aDisplay + '</td>'
        + '<td class="' + aRate + '">' + aRateText + '</td>'
        + '<td><button class="sc-heatmap-btn" title="个人周报卡" onclick="showStudentCard(\'' + cn + '\',\'' + escHtml(s.name) + '\',\'' + dateStr(sun) + '\')" style="font-size:.85rem">📋</button></td>'
        + '</tr>';
    });

    // Accumulate global totals
    const lMet = listenRows.filter(r => r.listeningRate !== null).reduce((s, r) => s + r.listening * 1, 0) || 0;
    const lTotal = listenRows.filter(r => r.listeningRate !== null).length * 7;
    globalListenTotal += lTotal;
    // Count actual met days
    let lMetActual = 0, lTotalActual = 0;
    listenRows.forEach(r => {
      if (r.listeningRate !== null) {
        const parts = r.listening.split('/');
        lMetActual += parseInt(parts[0]) || 0;
        lTotalActual += parseInt(parts[1]) || 7;
      }
    });
    globalListenMet += lMetActual;

    globalVideoTotal += videoTotal;
    globalVideoDone += (videoDone + videoLateTotal);
    globalVideoLate += videoLateTotal;
    globalAttTotal += attTotal;
    globalAttPresent += attPresent;

    // Class summary — use base expected attendance as denominator (active students only)
    const activeStudentCount = students.filter(s => !isStudentInactive(cn, s.name, sun)).length;
    const attBase = activeStudentCount * 2;
    globalAttBaseTotal += attBase;
    const lAvg = listenRows.filter(r => r.listeningRate !== null).reduce((sum, r, _, arr) => sum + r.listeningRate / arr.length, 0);
    const vSumDisplay = videoDone + (videoLateTotal > 0 ? '+' + videoLateTotal : '');
    const vAvg = videoTotal > 0 ? (videoDone + videoLateTotal) / videoTotal : 0;
    const aAvg = attBase > 0 ? attPresent / attBase : 0;

    html += '<tr class="section-header"><td><strong>' + cn + ' 汇总</strong></td>'
      + '<td>' + lMetActual + '/' + lTotalActual + '</td><td class="' + (lAvg >= 0.7 ? 'rate-good' : 'rate-bad') + '">' + (isNaN(lAvg) ? '—' : (lAvg * 100).toFixed(0) + '%') + '</td>'
      + '<td>' + vSumDisplay + '/' + videoTotal + '</td><td class="' + (vAvg >= 0.5 ? 'rate-good' : 'rate-bad') + '">' + (vAvg * 100).toFixed(0) + '%</td>'
      + '<td>' + attPresent + '/' + attBase + '</td><td class="' + (aAvg >= 0.8 ? 'rate-good' : 'rate-bad') + '">' + (aAvg * 100).toFixed(0) + '%</td>'
      + '<td></td></tr>';

    html += '</tbody></table></div>';
  }

  // ═══ Global Summary ═══
  const glAvg = globalListenTotal > 0 ? globalListenMet / globalListenTotal : 0;
  const gvAvg = globalVideoTotal > 0 ? globalVideoDone / globalVideoTotal : 0;
  const gaAvg = globalAttBaseTotal > 0 ? globalAttPresent / globalAttBaseTotal : 0;
  const gOverall = (glAvg + gvAvg + gaAvg) / 3;

  html += '<div class="report-table-wrap" style="margin-top:20px"><table class="report-table summary-table"><thead><tr>'
    + '<th colspan="8" style="text-align:center;font-size:.95rem;background:#1e293b;color:#fff">📊 综合汇总</th></tr></thead><tbody>';

  html += '<tr class="section-header">'
    + '<td>📻 录音综合达标率</td>'
    + '<td>' + globalListenMet + '/' + globalListenTotal + '</td>'
    + '<td class="' + (glAvg >= 0.7 ? 'rate-good' : 'rate-bad') + '">' + (glAvg * 100).toFixed(1) + '%</td>'
    + '<td colspan="5"></td></tr>';

  const gvSumDisplay = globalVideoDone + (globalVideoLate > 0 ? '+' + globalVideoLate : '');
  html += '<tr class="section-header">'
    + '<td>📹 视频综合达标率</td>'
    + '<td>' + gvSumDisplay + '/' + globalVideoTotal + '</td>'
    + '<td class="' + (gvAvg >= 0.5 ? 'rate-good' : 'rate-bad') + '">' + (gvAvg * 100).toFixed(1) + '%</td>'
    + '<td colspan="5"></td></tr>';

  html += '<tr class="section-header">'
    + '<td>👥 总出勤率</td>'
    + '<td>' + globalAttPresent + '/' + globalAttBaseTotal + '</td>'
    + '<td class="' + (gaAvg >= 0.8 ? 'rate-good' : 'rate-bad') + '">' + (gaAvg * 100).toFixed(1) + '%</td>'
    + '<td colspan="5"></td></tr>';

  html += '<tr class="section-header" style="border-top:2px solid var(--accent)">'
    + '<td><strong>🎯 综合 KPI</strong></td>'
    + '<td></td>'
    + '<td class="' + (gOverall >= 0.7 ? 'rate-good' : 'rate-bad') + '" style="font-size:1.1rem;font-weight:800">' + (gOverall * 100).toFixed(1) + '%</td>'
    + '<td colspan="5"></td></tr>';

  html += '</tbody></table></div>';

  // ════════════════════════════════════
  //  📅 月报 — 按月查看，三班合计按周拆分（第N周）
  // ════════════════════════════════════
  {
    const today = new Date(); today.setHours(0,0,0,0);

    // Determine which month to show (default: last complete month or current)
    if (typeof window.monthReportOffset === 'undefined') window.monthReportOffset = 0;
    const reportDate = new Date(today.getFullYear(), today.getMonth() - window.monthReportOffset, 1);
    const monthLabel = (reportDate.getMonth() + 1) + '月';
    const yearStr = reportDate.getFullYear();

    // Split the month into natural weeks (Sun-Sat), covering entire month range
    var weeksInfo = [];
    var monthStart = new Date(reportDate);
    monthStart.setDate(1);  // 1st of target month
    var monthEnd = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0); // last day of month

    // Find Sunday on/before the 1st of this month → first week start
    var scanSun = new Date(monthStart);
    scanSun.setDate(scanSun.getDate() - ((scanSun.getDay() + 7) % 7));  // adjust to previous Sunday

    while (scanSun.getTime() <= monthEnd.getTime()) {
      var ws = new Date(scanSun); ws.setDate(ws.getDate() + 6);
      var actualSat = ws;
      if (ws.getTime() > today.getTime()) actualSat = new Date(today);

      var weekNum = weeksInfo.length + 1;
      var wLabel = '第' + ['一', '二', '三', '四', '五', '六'][Math.min(weekNum - 1, 5)] + '周';

      // Count how many days of this week fall within the target month
      var daysInMonth = 0;
      var ddCheck = new Date(scanSun);
      while (ddCheck.getTime() <= actualSat.getTime()) {
        if (ddCheck.getTime() >= monthStart.getTime() && ddCheck.getTime() <= Math.min(monthEnd.getTime(), today.getTime())) {
          daysInMonth++;
        }
        ddCheck.setDate(ddCheck.getDate() + 1);
      }
      // Short tail: last week doesn't reach Saturday OR has fewer than 4 days in-month
      var isShortTail = (actualSat.getTime() < ws.getTime()) || (daysInMonth < 4) || (actualSat.getDay() !== 6);
      if (!isShortTail && actualSat.getTime() >= monthEnd.getTime() && ws.getDay() !== 6) {
        isShortTail = true;
      }

      weeksInfo.push({ sun: new Date(scanSun), sat: actualSat, label: wLabel, isShortTail: isShortTail, daysInMonth: daysInMonth });

      // Stop after covering the full month
      if (ws.getTime() >= monthEnd.getTime()) break;

      scanSun.setDate(scanSun.getDate() + 7);

      // Safety cap: max 6 weeks per month
      if (weeksInfo.length >= 6) break;
    }

    // Per-week totals across all classes (same logic as 综合汇总)
    var weekListen = [];   // [{met, total}]
    var weekVideo = [];    // [{done, expected}]
    var weekAtt = [];      // [{present, base}]
    var gLMet = 0, gLTotal = 0, gVDone = 0, gVExp = 0;
    var gAPresent = 0, gABase = 0;

    weeksInfo.forEach(function(week) {
      var wLMet = 0, wLTotal = 0;
      var wVDone = 0, wVExp = 0;
      var wAPresent = 0, wABase = 0;

      Object.keys(CLASSES).forEach(function(cn) {
        var students = getDisplayStudents(cn);

        // Listening: count from week.sun (include pre-month days like 5/31) to min(week.sat, monthEnd, today)
        // First week includes days before the 1st (e.g., 5/31 counts for June)
        // Last week stops at monthEnd (e.g., 6/30, not 7/1)
        students.forEach(function(s) {
          var cfg = getStudentCfg(cn, s.name);
          if (cfg.exemptListening) return;
          if (isConsecutiveLeave(cn, s.name, week.sun)) return;
          if (isStudentInactive(cn, s.name, week.sun)) return;

          var dd = new Date(week.sun);
          var dayEnd = Math.min(week.sat.getTime(), monthEnd.getTime(), today.getTime());
          while (dd.getTime() <= dayEnd) {
            wLTotal++;
            if (loadMinutesForDate(cn, s.name, dd) >= TARGET) wLMet++;
            dd.setDate(dd.getDate() + 1);
          }
        });

        // Video: SKIP for short-tail weeks (incomplete last week < 4 days or not reaching Saturday)
        if (!week.isShortTail) {
          var wcutoff = dateStr(new Date(Math.min(week.sat.getTime(), today.getTime())));
          var toCount = getReportWeekVideoEntries(cn, week.sun, wcutoff);
          toCount.forEach(function(rec) {
            students.forEach(function(s) {
              if (isLeaveNoMakeup(cn, s.name, rec.date)) return;
              if (isStudentInactive(cn, s.name, week.sun)) return;
              wVExp++;
              if (rec.submissions[s.name]) wVDone++;
            });
          });
        } // end if (!week.isShortTail)

        // Attendance: only count if this week has lessons (not short-tail)
        // Use same logic as weekly report: attBase = active students × 2
        if (!week.isShortTail) {
          var lessonDatesW = getLessonDatesInReportWeek(cn, week.sun);
          if (lessonDatesW) {
            var activeCount = students.filter(function(s) {
              return !isStudentInactive(cn, s.name, week.sun);
            }).length;
            wABase += activeCount * 2;

            [lessonDatesW.newLesson, lessonDatesW.review].forEach(function(ld) {
              var attData = loadAttendance(dateStr(ld));
              if (attData[cn]) {
                students.forEach(function(s) {
                  if (isStudentInactive(cn, s.name, week.sun)) return;
                  var status = attData[cn][s.name] || 'present';
                  if (status === 'present') wAPresent++;
                });
              } else {
                // No attendance record → count as present
                students.forEach(function(s) {
                  if (isStudentInactive(cn, s.name, week.sun)) return;
                  wAPresent++;
                });
              }
            });
          }
        }
      });

      weekListen.push({ met: wLMet, total: wLTotal });
      weekVideo.push({ done: wVDone, expected: wVExp });
      weekAtt.push({ present: wAPresent, base: wABase });
      gLMet += wLMet; gLTotal += wLTotal;
      gVDone += wVDone; gVExp += wVExp;
      gAPresent += wAPresent; gABase += wABase;
    });

    // Build header row with navigation and week labels
    var weekHdrs = weeksInfo.map(function(w) {
      var extra = w.isShortTail ? '<br><span style="font-size:.6rem;color:#a78bfa">尾段</span>' : '';
      return '<th style="text-align:center;font-size:.82rem;min-width:60px;padding:4px 2px">' + w.label + extra + '</th>';
    }).join('');

    html += '<div class="report-table-wrap" style="margin-top:20px"><table class="report-table" style="font-size:.85rem"><thead><tr>'
      + '<th rowspan="2" style="background:#7C3AED;color:#fff;text-align:center;font-size:.9rem;vertical-align:middle;min-width:100px">'
      + '<button onclick="window.monthReportOffset=(window.monthReportOffset||0)+1;renderReport();" style="font-size:.8rem;background:none;border:none;color:#fff;cursor:pointer;padding:2px 8px;margin-right:4px">◀</button>'
      + '📅 ' + yearStr + '年' + monthLabel
      + '<button onclick="window.monthReportOffset=Math.max(0,(window.monthReportOffset||0)-1);renderReport();" style="font-size:.8rem;background:none;border:none;color:#fff;cursor:pointer;padding:2px 8px;margin-left:4px">▶</button>'
      + '</th>'
      + weekHdrs
      + '<th rowspan="2" style="text-align:center;font-size:.85rem;background:#ede9fe;width:72px;vertical-align:middle;color:#5B21B6">合计</th>'
      + '</tr><tr>';

    for (var i = 0; i < weeksInfo.length; i++) {
      html += '<th style="background:#ede9fe;font-size:.68rem;text-align:center;color:#5B21B6">' + (weeksInfo[i].isShortTail ? '仅录音' : '听/视/勤') + '</th>';
    }
    html += '<th style="background:#ede9fe"></th></tr></thead><tbody>';

    // Listening row
    html += '<tr><td><span style="font-size:.78rem;color:#64748B">📻 录音达标</span></td>';
    weekListen.forEach(function(w, i) {
      var style = weeksInfo[i].isShortTail ? ';color:#7C3AED;font-style:italic' : '';
      html += '<td style="text-align:center' + style + '">' + w.met + '/' + w.total + '</td>';
    });
    html += '<td style="text-align:center;font-weight:700;' + (gLTotal > 0 && gLMet / gLTotal >= 0.7 ? 'color:#059669' : 'color:#ef4444') + '">' + gLMet + '/' + gLTotal + '</td></tr>';

    // Video row
    html += '<tr><td><span style="font-size:.78rem;color:#64748B">📹 视频完成</span></td>';
    weekVideo.forEach(function(w, i) {
      if (weeksInfo[i].isShortTail) {
        html += '<td style="text-align:center;color:#94a3b8;font-style:italic">—</td>';
      } else {
        html += '<td style="text-align:center">' + w.done + '/' + w.expected + '</td>';
      }
    });
    html += '<td style="text-align:center;font-weight:700;' + (gVExp > 0 && gVDone / gVExp >= 0.5 ? 'color:#059669' : 'color:#ef4444') + '">' + gVDone + '/' + gVExp + '</td></tr>';

    // Attendance row
    html += '<tr><td><span style="font-size:.78rem;color:#64748B">👥 出勤</span></td>';
    weekAtt.forEach(function(w, i) {
      if (weeksInfo[i].isShortTail) {
        html += '<td style="text-align:center;color:#94a3b8;font-style:italic">—</td>';
      } else {
        html += '<td style="text-align:center">' + w.present + '/' + w.base + '</td>';
      }
    });
    html += '<td style="text-align:center;font-weight:700;' + (gABase > 0 && gAPresent / gABase >= 0.8 ? 'color:#059669' : 'color:#ef4444') + '">' + gAPresent + '/' + gABase + '</td></tr>';

    html += '</tbody></table></div>';
  }

  // ⭐ 综合评星面板（两月周期）— 支持月份导航 + 复制绩效文案
  {
    const star = computeStarRatings(window.starMonthOffset);
    const STAR_TARGET = 0.85; // 目标 85%
    const overallRate = (star.listenMet + star.videoDone) / (star.listenTotal + star.videoExpected);

    function buildBar(rate, label, emoji) {
      const pct = Math.round(rate * 100);
      const stars = rate >= STAR_TARGET ? '⭐'.repeat(5) : '⭐'.repeat(Math.max(1, Math.min(5, Math.ceil(rate / STAR_TARGET * 5))));
      const barColor = rate >= STAR_TARGET ? '#22c55e' : (rate >= STAR_TARGET * 0.7 ? '#f59e0b' : '#ef4444');
      const barW = Math.min(100, Math.max(0, rate * 100));
      return '<div style="margin-bottom:12px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
        + '<span>' + emoji + ' ' + label + '</span>'
        + '<span style="font-weight:700;color:#1e293b;">' + pct + '%</span></div>'
        + '<div style="background:#e2e8f0;border-radius:6px;height:20px;position:relative;overflow:hidden;">'
        + '<div style="width:' + barW + '%;height:100%;background:' + barColor + ';border-radius:6px;transition:width .3s;"></div>'
        + '<div style="position:absolute;left:85%;top:-2px;bottom:-2px;width:2px;background:#64748b;z-index:1;"></div>'
        + '<span style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:.7rem;color:#64748b;font-weight:600;">目标85%</span>'
        + '</div>'
        + '<div style="text-align:right;margin-top:2px;font-size:1rem;letter-spacing:2px;">' + stars + '</div>'
        + '</div>';
    }

    // Performance text is generated on-demand by copyPerformanceText()

    html += '<div class="star-panel" style="margin-top:20px;padding:16px 20px;background:#f0f9ff;border-radius:10px;border:1px solid #e0f0ff;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
      + '<h3 style="margin:0;font-size:1rem;color:#1e293b;">⭐ 综合评星（' + star.label + '）</h3>'
      + '<div style="display:flex;align-items:center;gap:6px;">'
      + '<button onclick="window.starMonthOffset-=2;renderReport()" style="font-size:.8rem;padding:4px 10px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);cursor:pointer;font-weight:600">◀</button>'
      + '<button onclick="window.starMonthOffset=0;renderReport()" style="font-size:.72rem;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);cursor:pointer;font-weight:600;color:var(--accent)">本期</button>'
      + '<button onclick="window.starMonthOffset+=2;renderReport()" style="font-size:.8rem;padding:4px 10px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);cursor:pointer;font-weight:600">▶</button>'
      + '</div></div>'
      + buildBar(star.listenRate, '平均听录音达标率', '📻')
      + buildBar(star.videoRate,  '平均视频达标率',   '📹')
      + buildBar(overallRate,       '综合平均率',         '🏆')
      + '<div style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;">'
      + '<div style="font-size:.78rem;color:#64748B;line-height:1.5;">'
      + '<div>📊 录音：' + star.listenMet + '/' + star.listenTotal + '达标</div>'
      + '<div>🎬 视频：' + star.videoDone + '/' + star.videoExpected + '完成</div>'
      + '</div>'
      + '<button id="copyPerfBtn" onclick="copyPerformanceText(\'' + star.label + '\')" style="font-size:.78rem;padding:8px 16px;border-radius:8px;border:1.5px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;font-weight:600;white-space:nowrap;">📋 复制绩效文案</button>'
      + '</div></div>';
  }

  // Performance text copy function
  window.copyPerformanceText = function(monthLabel) {
    var star = computeStarRatings(window.starMonthOffset);
    var md = star.monthlyData;
    var keys = Object.keys(md).sort();

    function getStudentCount(monthKey) {
      return md[monthKey] ? md[monthKey].students.size : 0;
    }

    // Find the two month keys that match our label range
    var m1Label = monthLabel.split('+')[0]; // e.g., "6月"
    var m2Label = monthLabel.split('+')[1]; // e.g., "7月"
    var mNum1 = parseInt(m1Label), mNum2 = parseInt(m2Label);
    var year = new Date().getFullYear();
    var mk1 = year + '-' + String(mNum1).padStart(2,'0');
    var mk2 = year + '-' + String(mNum2).padStart(2,'0');
    var s1 = getStudentCount(mk1), s2 = getStudentCount(mk2);

    var lMet = star.listenMet, lTotal = star.listenTotal;
    var vDone = star.videoDone, vExp = star.videoExpected;
    var overallPct = ((lMet + vDone) / (lTotal + vExp)) * 100;
    var overallPctRounded = Math.round(overallPct);

    // Format matching template:
    // "张雨2月+3月听录音和视频打卡完成率,学生2月16人、3月17人,录音打卡应完成次数751,实际完成527;视频打卡应完成次数200,实际完成166。综合平均率77%"
    var m1Num = parseInt(monthLabel.split('+')[0]); // e.g., 2
    var m2Num = parseInt(monthLabel.split('+')[1]); // e.g., 3
    var text = monthLabel + '听录音和视频打卡完成率';
    text += '，学生' + m1Num + '月' + s1 + '人、' + m2Num + '月' + s2 + '人';
    text += '，录音打卡应完成次数' + lTotal + '，实际完成' + lMet;
    text += '；视频打卡应完成次数' + vExp + '，实际完成' + vDone;
    text += '。综合平均率' + overallPctRounded + '%';

    navigator.clipboard.writeText(text).then(function() {
      var btn = document.getElementById('copyPerfBtn');
      if (btn) { btn.textContent = '✅ 已复制！'; btn.style.background='#22c55e'; setTimeout(function() { btn.textContent = '📋 复制绩效文案'; btn.style.background=''; }, 2000); }
      toast('已复制到剪贴板');
    }).catch(function() {
      // Fallback: use textarea
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制到剪贴板（兼容模式）');
    });
  };

  // ═══ Text Input Cards: 看过程 & 看自己 ═══
  const texts = loadReportTexts();
  const escAttr = (s) => (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  html += '<div class="rpt-input-cards">';

  // Card 1: 看过程
  html += '<div class="rpt-input-card">'
    + '<h3><span class="card-icon process">📋</span>看过程</h3>'
    + '<div class="rpt-input-group">'
    + '<label><span class="phase-tag start">开始</span><span class="phase-tag mid">中间</span><span class="phase-tag end">结束</span> 过程看法</label>'
    + '<textarea id="rpt-proc-start" placeholder="开始阶段…" oninput="saveReportTextsOnInput()">' + escAttr(texts.processStart) + '</textarea>'
    + '<textarea id="rpt-proc-mid" placeholder="中间阶段…" oninput="saveReportTextsOnInput()" style="margin-top:6px">' + escAttr(texts.processMid) + '</textarea>'
    + '<textarea id="rpt-proc-end" placeholder="结束阶段…" oninput="saveReportTextsOnInput()" style="margin-top:6px">' + escAttr(texts.processEnd) + '</textarea>'
    + '</div>'
    + '<div class="rpt-input-group">'
    + '<label>可复制动作</label>'
    + '<textarea id="rpt-proc-action" placeholder="本周有哪些做法值得保留/复制到下周…" oninput="saveReportTextsOnInput()">' + escAttr(texts.processAction) + '</textarea>'
    + '</div>'
    + '</div>';

  // Card 2: 看自己
  html += '<div class="rpt-input-card">'
    + '<h3><span class="card-icon self">🧘</span>看自己</h3>'
    + '<div class="rpt-input-group">'
    + '<label>整体心态</label>'
    + '<textarea id="rpt-self-mood" placeholder="本周整体心态如何…" oninput="saveReportTextsOnInput()">' + escAttr(texts.selfMood) + '</textarea>'
    + '</div>'
    + '<div class="rpt-input-group">'
    + '<label>三个优点</label>'
    + '<div class="rpt-strength-row">'
    + '<input type="text" id="rpt-self-s1" placeholder="1. …" value="' + escAttr(texts.selfS1) + '" oninput="saveReportTextsOnInput()">'
    + '<input type="text" id="rpt-self-s2" placeholder="2. …" value="' + escAttr(texts.selfS2) + '" oninput="saveReportTextsOnInput()">'
    + '<input type="text" id="rpt-self-s3" placeholder="3. …" value="' + escAttr(texts.selfS3) + '" oninput="saveReportTextsOnInput()">'
    + '</div>'
    + '</div>'
    + '<div class="rpt-input-group">'
    + '<label>一改进</label>'
    + '<textarea id="rpt-self-imp" placeholder="下周最需要改进的一项…" oninput="saveReportTextsOnInput()">' + escAttr(texts.selfImprove) + '</textarea>'
    + '</div>'
    + '</div>';

  html += '</div>'; // close rpt-input-cards

  document.getElementById('reportContent').innerHTML = html;
}

// Auto-save: debounced collection from all input fields
let _rptSaveTimer = null;
function saveReportTextsOnInput() {
  clearTimeout(_rptSaveTimer);
  _rptSaveTimer = setTimeout(function() {
    const data = {
      processStart: document.getElementById('rpt-proc-start')?.value || '',
      processMid: document.getElementById('rpt-proc-mid')?.value || '',
      processEnd: document.getElementById('rpt-proc-end')?.value || '',
      processAction: document.getElementById('rpt-proc-action')?.value || '',
      selfMood: document.getElementById('rpt-self-mood')?.value || '',
      selfS1: document.getElementById('rpt-self-s1')?.value || '',
      selfS2: document.getElementById('rpt-self-s2')?.value || '',
      selfS3: document.getElementById('rpt-self-s3')?.value || '',
      selfImprove: document.getElementById('rpt-self-imp')?.value || ''
    };
    saveReportTexts(data);
  }, 400);
}

function prevWeekRp() {
  currentReportSunday.setDate(currentReportSunday.getDate() - 7);
  renderReport();
}
function nextWeekRp() {
  currentReportSunday.setDate(currentReportSunday.getDate() + 7);
  renderReport();
}
function goTodayRp() {
  currentReportSunday = getReportWeekMonday(new Date());
  renderReport();
}

function downloadReportExcel() {
  if (typeof XLSX === 'undefined') { toast('Excel库加载失败'); return; }
  const wb = XLSX.utils.book_new();
  const sun = currentReportSunday;
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  const allRecords = getAllVideoRecords();

  let globalListenTotal = 0, globalListenMet = 0;
  let globalVideoDone = 0, globalVideoExpected = 0;
  let globalAttTotal = 0, globalAttPresent = 0, globalAttBaseTotal = 0;

  for (const cn of Object.keys(CLASSES)) {
    const students = getAllStudents(cn);
    const rows = [['学生', '听录音达标', '录音达标率', '视频打卡', '视频达标率', '出勤', '出勤率']];
    const lessonDates = getLessonDatesInReportWeek(cn, sun);

    let clsListenTotal = 0, clsListenMet = 0;
    let clsVideoDone = 0, clsAttTotal = 0, clsAttPresent = 0;
    const leaves = loadLeaves();

    students.forEach(s => {
      const exempt = getStudentCfg(cn, s.name).exemptListening;
      const consecutiveLeave = isConsecutiveLeave(cn, s.name, sun);
      let lTotal = 0, lMet = 0;
      if (!exempt && !consecutiveLeave) {
        const dd = new Date(sun);
        while (dd.getTime() <= sat.getTime()) {
          lTotal++;
          if (loadMinutesForDate(cn, s.name, dd) >= TARGET) lMet++;
          dd.setDate(dd.getDate() + 1);
        }
        clsListenTotal += lTotal;
        clsListenMet += lMet;
      }

      // Video: count current + late submissions in report week
      let vDone = 0;
      if (lessonDates) {
        const nlRec = getVideoRecord(cn, dateStr(lessonDates.newLesson), 'new');
        if (nlRec && nlRec.date === dateStr(lessonDates.newLesson) && nlRec.submissions[s.name]) vDone++;
        const rvRec = getVideoRecord(cn, dateStr(lessonDates.review), 'review');
        if (rvRec && rvRec.date === dateStr(lessonDates.review) && rvRec.submissions[s.name]) vDone++;
        // Late submissions from previous cycles
        allRecords.forEach(rec => {
          if (rec.className !== cn) return;
          if (rec.date === dateStr(lessonDates.newLesson) || rec.date === dateStr(lessonDates.review)) return;
          const sub = rec.submissions[s.name];
          if (!sub) return;
          const subDate = typeof sub === 'string' ? sub : rec.date;
          const subD = new Date(subDate + 'T00:00:00');
          if (subD >= sun && subD <= sat) vDone++;
        });
      }
      clsVideoDone += vDone;

      // Attendance
      let aPresent = 0, aTotal = 2;
      if (lessonDates) {
        [lessonDates.newLesson, lessonDates.review].forEach(ld => {
          const attData = loadAttendance(dateStr(ld));
          const status = attData[cn] ? (attData[cn][s.name] || 'present') : 'present';
          if (status === 'present') aPresent++;
          clsAttTotal++;
        });
        // Add makeup attendance from other weeks
        leaves.forEach(l => {
          if (!l.makeupScheduled || !l.makeupDate) return;
          if (l.className !== cn || l.student !== s.name) return;
          const md = new Date(l.makeupDate + 'T00:00:00');
          if (md >= sun && md <= sat) {
            const isOwn = l.date === dateStr(lessonDates.newLesson) || l.date === dateStr(lessonDates.review);
            if (!isOwn) { aPresent++; aTotal++; clsAttTotal++; }
          }
        });
      }
      clsAttPresent += aPresent;

      const vDisplay = vDone > 2 ? vDone + '/2' : vDone + '/2';

      rows.push([
        s.name,
        exempt ? '免打卡' : (consecutiveLeave ? '请假中' : lMet + '/' + lTotal),
        exempt ? '—' : (consecutiveLeave ? '—' : (lTotal > 0 ? (lMet / lTotal * 100).toFixed(0) + '%' : '—')),
        vDisplay,
        (vDone / 2 * 100).toFixed(0) + '%',
        aPresent + '/' + aTotal,
        (aPresent / aTotal * 100).toFixed(0) + '%',
      ]);
    });

    // Class summary row
    if (students.length > 0) {
      const lRate = clsListenTotal > 0 ? (clsListenMet / clsListenTotal * 100).toFixed(0) + '%' : '—';
      rows.push([
        cn + ' 汇总',
        clsListenMet + '/' + clsListenTotal,
        lRate,
        clsVideoDone + '/' + (students.length * 2),
        (clsVideoDone / (students.length * 2) * 100).toFixed(0) + '%',
        clsAttPresent + '/' + (students.length * 2),
        (clsAttPresent / (students.length * 2) * 100).toFixed(0) + '%',
      ]);
    }

    globalListenTotal += clsListenTotal;
    globalListenMet += clsListenMet;
    globalVideoDone += clsVideoDone;
    globalVideoExpected += students.length * 2;
    globalAttTotal += clsAttTotal;
    globalAttPresent += clsAttPresent;
    globalAttBaseTotal += students.length * 2;

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch: 10}, {wch: 14}, {wch: 10}, {wch: 14}, {wch: 10}, {wch: 10}, {wch: 10}];
    XLSX.utils.book_append_sheet(wb, ws, cn);
  }

  // Global summary sheet
  const summaryRows = [['指标', '应完成', '实际完成', '达标率']];
  summaryRows.push(['📻 录音综合', globalListenTotal, globalListenMet, globalListenTotal > 0 ? (globalListenMet / globalListenTotal * 100).toFixed(1) + '%' : '—']);
  summaryRows.push(['📹 视频综合', globalVideoExpected, globalVideoDone, globalVideoExpected > 0 ? (globalVideoDone / globalVideoExpected * 100).toFixed(1) + '%' : '—']);
  summaryRows.push(['👥 出勤综合', globalAttBaseTotal, globalAttPresent, globalAttBaseTotal > 0 ? (globalAttPresent / globalAttBaseTotal * 100).toFixed(1) + '%' : '—']);
  const gOverall = (globalListenTotal + globalVideoExpected + globalAttBaseTotal) > 0
    ? ((globalListenMet + globalVideoDone + globalAttPresent) / (globalListenTotal + globalVideoExpected + globalAttBaseTotal) * 100).toFixed(1) + '%'
    : '—';
  summaryRows.push(['🎯 综合 KPI', '', '', gOverall]);

  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws2['!cols'] = [{wch: 16}, {wch: 12}, {wch: 12}, {wch: 10}];
  XLSX.utils.book_append_sheet(wb, ws2, '综合汇总');

  XLSX.writeFile(wb, '周报-' + formatReportWeek(sun).replace(/[月日\s-]/g, '') + '.xlsx');
  toast('周报已导出');
}

// 辅助：判断学生是否请假且不补交（视频分母 -1）
function isLeaveNoMakeup(className, studentName, dateStr) {
  var leaves = loadLeaves();
  for (var i = 0; i < leaves.length; i++) {
    var l = leaves[i];
    if (l.className === className && l.student === studentName && l.date === dateStr && !l.makeupScheduled) return true;
  }
  return false;
}

// ╔══════════════════════════════════════════╗
// ║  视频统计 V3 共享辅助函数                    ║
// ╚══════════════════════════════════════════╝
// 截止逻辑：新课视频 → 复习课当天截止；复习课视频 → 下周新课当天截止
// 算法：从所有历史作业中筛选截止日期≤cutoffDate的，取最近最多2条
// cutoffDate: 可选，传入则用该日期作截止判断；不传则用今天
function getCountableVideoEntries(className, cutoffDate) {
  var cutoff = cutoffDate || dateStr(new Date());
  // 收集该班级所有视频记录
  var entries = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf('nd-V-' + className + '-') >= 0) {
      try {
        var rec = JSON.parse(localStorage.getItem(key));
        if (rec && rec.date && rec.submissions) entries.push(rec);
      } catch (e) {}
    }
  }
  if (entries.length === 0) return [];
  // 按日期升序
  entries.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  // 为每条记录计算截止日 = 下一条 opposite-type 的日期
  var pastDeadline = [];
  for (var i = 0; i < entries.length; i++) {
    var deadline = null;
    for (var j = i + 1; j < entries.length; j++) {
      if (entries[j].type !== entries[i].type) { deadline = entries[j].date; break; }
    }
    if (deadline !== null && deadline <= cutoff) pastDeadline.push(entries[i]);
  }
  // 取最近最多2条
  return pastDeadline.slice(-2);
}

// ══════════════════════════════════════════
// 周报专用视频统计：使用理论配对日期判断截止
// ══════════════════════════════════════════
// 与 getCountableVideoEntries 的区别：
// - 后者用「下一条已创建的 opposite-type 记录」作截止 → 提前创建记录会误判
// - 本函数用 getPairedReviewDate/getPairedNewDate 算出理论配对日期 → 反映真实截止时间
//
// 规则：一条视频作业在它的配对课程日（含）当天及之后才算"截止"
//   - 新课 → 截止日 = 配对复习课日期（getPairedReviewDate）
//   - 复习课 → 截止日 = 配对新课日期（getPairedNewDate）
//
// 截止边界 = min(今天, 报告周周六)
//   - 这样保证历史周报结果不随时间变化（时间不变量）
//   - 同时本周内查看时不会把未来的课算进去
// 返回：所有已截止的视频记录，取最近 2 条（一个完整周期）

function getReportWeekVideoEntries(className, reportSunday, todayStr) {
  var entries = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf('nd-V-' + className + '-') >= 0) {
      try {
        var rec = JSON.parse(localStorage.getItem(key));
        if (rec && rec.date && rec.submissions) entries.push(rec);
      } catch (e) {}
    }
  }
  if (entries.length === 0) return [];
  entries.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

  // 截止边界 = min(今天, 报告周周六)
  // 保证历史周报结果不随时间变化（时间不变量）
  var sat = new Date(reportSunday);
  sat.setDate(sat.getDate() + 6);
  var satStr = dateStr(sat);
  var cutoff = todayStr < satStr ? todayStr : satStr;

  // 用理论配对日期计算每条记录的截止日
  var countable = [];
  for (var i = 0; i < entries.length; i++) {
    var rec = entries[i];
    var pairedDate;
    try {
      if (rec.type === 'new') {
        pairedDate = getPairedReviewDate(rec.date, className);
      } else if (rec.type === 'review') {
        pairedDate = getPairedNewDate(rec.date, className);
      } else {
        continue; // 未知类型跳过
      }
    } catch(e) { continue; }

    var deadlineStr = dateStr(pairedDate);
    // 两个条件都满足才算入：
    // 1. 截止日 ≤ cutoff（配对课程已发生，学生已有机会提交）
    // 2. 课程日期 ≤ cutoff（本节课程已经上了，不能统计未来的课）
    if (deadlineStr <= cutoff && rec.date <= cutoff) {
      countable.push(rec);
    }
  }

  // 取最近最多2条（一个完整周期 = 新课 + 复习课）
  return countable.slice(-2);
}

// 周报专用的视频周期描述文本生成
function getReportWeekVideoPeriodInfo(className, reportSunday) {
  var todayStr = dateStr(new Date());
  var entries = getReportWeekVideoEntries(className, reportSunday, todayStr);

  if (entries.length === 0) {
    return { desc: '统计0次(无已截止作业)', counted: [] };
  }

  var descParts = entries.map(function(r) {
    return r.date + ' ' + getLessonTypeLabel(r.type);
  });
  return {
    desc: '统计' + entries.length + '次(' + descParts.join(', ') + ')',
    counted: entries
  };
}

// 生成视频统计周期的描述文本（用于UI标注）
// cutoffDate: 可选，传入则用该日期作截止判断；不传则用今天
function getVideoPeriodInfo(className, cutoffDate) {
  var cutoff = cutoffDate || dateStr(new Date());
  var entries = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf('nd-V-' + className + '-') >= 0) {
      try {
        var rec = JSON.parse(localStorage.getItem(key));
        if (rec && rec.date && rec.submissions) entries.push(rec);
      } catch (e) {}
    }
  }
  if (entries.length === 0) return { desc: '无数据', counted: [], skipped: [] };
  entries.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

  var counted = [], skipped = [];
  for (var i = 0; i < entries.length; i++) {
    var deadline = null;
    for (var j = i + 1; j < entries.length; j++) {
      if (entries[j].type !== entries[i].type) { deadline = entries[j].date; break; }
    }
    if (deadline === null) { skipped.push(entries[i]); continue; } // 没有后续课→永远不截止
    if (deadline <= cutoff) counted.push(entries[i]);
    else skipped.push(entries[i]);
  }

  // 实际被纳入统计的是 pastDeadline.slice(-2)
  var actualCounted = counted.slice(-2);
  var actualSkipped = entries.filter(function(e) {
    return actualCounted.indexOf(e) < 0;
  });

  // 构建描述文本
  var parts = [];
  if (actualCounted.length > 0) {
    var countedDesc = actualCounted.map(function(r) {
      return r.date + ' ' + getLessonTypeLabel(r.type);
    }).join(', ');
    parts.push('统计' + actualCounted.length + '次(' + countedDesc + ')');
  } else {
    parts.push('统计0次(无已截止作业)');
  }
  // 被跳过且未截止的
  var pendingSkip = skipped.filter(function(e) { return actualCounted.indexOf(e) < 0; });
  if (pendingSkip.length > 0 && actualSkipped.length > 0) {
    // 只标注最近的未截止作业
    var latestSkipped = entries[entries.length - 1];
    var latestDeadline = null;
    for (var jj = entries.length - 1; jj >= 0; jj--) {
      if (entries[jj].date === latestSkipped.date && entries[jj].type === latestSkipped.type) {
        for (var kk = jj + 1; kk < entries.length; kk++) {
          if (entries[kk].type !== latestSkipped.type) { latestDeadline = entries[kk].date; break; }
        }
        break;
      }
    }
    if (latestDeadline) {
      parts.push(latestSkipped.date + ' ' + getLessonTypeLabel(latestSkipped.type) + '(截止' + latestDeadline + ')未截止→跳过');
    }
    parts.push('往前取已截止的' + actualCounted.length + '条');
  }
  return { desc: parts.join('; '), counted: actualCounted, skipped: actualSkipped };
}

// ╔══════════════════════════════════════════╗
// ║  评星面板：两月平均达标率                    ║
// ╚══════════════════════════════════════════╝
// 计算当前两月周期（6月+7月）的平均听录音和视频数据

function getTwoMonthRange(offset) {
  // Each unit of offset = 1 month; we show two consecutive months
  // Pairs always start on even-numbered months: 2+3, 4+5, 6+7, 8+9...
  const today = new Date(); today.setHours(0,0,0,0);
  const base = new Date(today.getFullYear(), today.getMonth(), 1); // 1st of current month
  base.setMonth(base.getMonth() + offset);
  // Align to even months (2,4,6,8,10,12): if 1-indexed month is odd, shift back one
  if ((base.getMonth() + 1) % 2 === 1) { base.setMonth(base.getMonth() - 1); }
  const m1 = new Date(base);
  const m2 = new Date(base); m2.setMonth(m2.getMonth() + 1);
  return {
    m1Start: new Date(m1.getFullYear(), m1.getMonth(), 1),
    m1End:   new Date(m2.getFullYear(), m2.getMonth(), 1), // last day of m1
    m2End:   new Date(m2.getFullYear(), m2.getMonth() + 1, 0), // last day of m2
    label:   (m1.getMonth() + 1) + '月+' + (m2.getMonth() + 1) + '月',
    labelCn: [m1, m2].map(d => (d.getMonth()+1)+'月')
  };
}

function computeStarRatings(monthOffset) {
  const range = getTwoMonthRange(monthOffset || 0);
  var today = new Date();
  today.setHours(0,0,0,0);

  var totalListenMet = 0, totalListenTotal = 0;
  var totalVideoDone = 0, totalVideoExpected = 0;
  // Per-month & per-class breakdown for performance report text
  var monthlyData = {}; // key: "2026-06" → { listenMet, listenTotal, videoDone, videoExpected, students: Set }
  var classes = Object.keys(CLASSES);

  // Scan every report week that overlaps our 2-month range
  // Start from first Sunday on/before m1 start, end at last Sunday after m2 end
  var scanSun = new Date(range.m1Start);
  scanSun.setDate(scanSun.getDate() - ((scanSun.getDay() + 7) % 7)); // back to Sunday
  var scanEnd = range.m2End;
  // Advance to next Sunday past m2 end
  var lastScanSat = new Date(scanEnd);
  while (lastScanSat.getDay() !== 6) lastScanSat.setDate(lastScanSat.getDate() + 1);

  while (scanSun.getTime() <= lastScanSat.getTime()) {
    var sat = new Date(scanSun); sat.setDate(sat.getDate() + 6);
    var satStr = dateStr(sat);

    // Determine which month(s) this week belongs to
    var weekMonths = [];
    var d = new Date(scanSun);
    while (d.getTime() <= sat.getTime()) {
      var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!weekMonths.includes(mk)) weekMonths.push(mk);
      d.setDate(d.getDate() + 1);
    }

    for (var ci = 0; ci < classes.length; ci++) {
      var cn = classes[ci];
      var students = getAllStudents(cn);

      // Ensure month buckets exist
      weekMonths.forEach(function(mk) {
        if (!monthlyData[mk]) monthlyData[mk] = { listenMet: 0, listenTotal: 0, videoDone: 0, videoExpected: 0, students: new Set() };
      });

      // Listening — only up to today
      students.forEach(function(s) {
        if (getStudentCfg(cn, s.name).exemptListening) return;
        if (isConsecutiveLeave(cn, s.name, scanSun)) return;
        if (isStudentInactive(cn, s.name, scanSun)) return;
        var dd = new Date(scanSun);
        while (dd.getTime() <= sat.getTime()) {
          if (dd.getTime() > today.getTime()) break;
          totalListenTotal++;
          // Bucket by month
          var lk = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
          if (monthlyData[lk]) { monthlyData[lk].listenTotal++; }
          if (loadMinutesForDate(cn, s.name, dd) >= TARGET) {
            totalListenMet++;
            if (monthlyData[lk]) monthlyData[lk].listenMet++;
          }
          dd.setDate(dd.getDate() + 1);
        }
        // Track student presence in each month
        weekMonths.forEach(function(mk) {
          if (monthlyData[mk] && !isStudentInactive(cn, s.name, scanSun)) {
            monthlyData[mk].students.add(cn + ':' + s.name);
          }
        });
      });

      // Video
      var toCount = getCountableVideoEntries(cn, satStr);
      toCount.forEach(function(rec) {
        students.forEach(function(s) {
          if (isLeaveNoMakeup(cn, s.name, rec.date)) return;
          if (isStudentInactive(cn, s.name, scanSun)) return;
          totalVideoExpected++;
          if (rec.submissions[s.name]) totalVideoDone++;
          // Bucket by record date's month
          var vk = rec.date.substring(0, 7); // "YYYY-MM"
          if (monthlyData[vk]) {
            monthlyData[vk].videoExpected++;
            if (rec.submissions[s.name]) monthlyData[vk].videoDone++;
          }
        });
      });
    }

    scanSun.setDate(scanSun.getDate() + 7);
  }

  return {
    listenRate: totalListenTotal > 0 ? totalListenMet / totalListenTotal : 0,
    videoRate: totalVideoExpected > 0 ? totalVideoDone / totalVideoExpected : 0,
    listenMet: totalListenMet,
    listenTotal: totalListenTotal,
    videoDone: totalVideoDone,
    videoExpected: totalVideoExpected,
    monthlyData: monthlyData,
    label: range.label,
    labelCn: range.labelCn
  };
}

// ╔══════════════════════════════════════════╗
// ║      WEEKLY REPORT PPTX GENERATION      ║
// ╚══════════════════════════════════════════╝

function computeReportSummary() {
  const sun = currentReportSunday;
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  const weekLabel = formatReportWeek(sun);
  const weekFileName = (sun.getMonth()+1)+'月'+(sun.getDate())+'-'+(sat.getMonth()+1)+'月'+(sat.getDate())+'日';

  const classes = [];
  let gListenTotal = 0, gListenMet = 0;
  let gVideoTotal = 0, gVideoDone = 0, gVideoLate = 0;
  let gAttTotal = 0, gAttPresent = 0, gAttBaseTotal = 0;

  for (const cn of Object.keys(CLASSES)) {
    const students = getAllStudents(cn);
    const lessonDates = getLessonDatesInReportWeek(cn, sun);
    const isCrossWeek = getSchedule(cn, sat).newLessonDay > getSchedule(cn, sat).reviewDay;
    const reportWeekKey = getISOWeekKey(sat);
    let listenTotal = 0, listenMet = 0;
    students.forEach(s => {
      if (getStudentCfg(cn, s.name).exemptListening) return;
      if (isConsecutiveLeave(cn, s.name, sun)) return; // exempt from listening KPI
      if (isStudentInactive(cn, s.name, sun)) return; // inactive (before join / after left)
      let totalDays = 0, metDays = 0;
      const d = new Date(sun);
      while (d.getTime() <= sat.getTime()) { totalDays++; if (loadMinutesForDate(cn, s.name, d) >= TARGET) metDays++; d.setDate(d.getDate() + 1); }
      listenTotal += totalDays; listenMet += metDays;
    });

    // 视频统计 V3：只统计截止日期已过的作业，请假不补的学生不计入分母
    let videoExpected = 0, videoDoneCount = 0, lateCount = 0;
    {
      const todayStr = dateStr(new Date());
      const toCount = getReportWeekVideoEntries(cn, sun, todayStr);
      const leaves = loadLeaves();
      toCount.forEach(rec => {
        students.forEach(s => {
          if (isLeaveNoMakeup(cn, s.name, rec.date)) return;
          if (isStudentInactive(cn, s.name, sun)) return; // inactive (before join / after left)
          videoExpected++;
          if (rec.submissions[s.name]) videoDoneCount++;
        });
      });
    }

    const reportLateSubs = loadLateSubs(cn, reportWeekKey);
    reportLateSubs.forEach(ls => { lateCount++; });

    let attTotal = 0, attPresent = 0;
    if (lessonDates) {
      [lessonDates.newLesson, lessonDates.review].forEach(ld => {
        const attData = loadAttendance(dateStr(ld));
        students.forEach(s => {
          if (isStudentInactive(cn, s.name, sun)) return; // inactive (before join / after left)
          attTotal++;
          if (!attData[cn] || (attData[cn][s.name] || 'present') === 'present') attPresent++;
        });
      });
      const leaves = loadLeaves();
      leaves.forEach(l => {
        if (!l.makeupScheduled || !l.makeupDate || l.className !== cn) return;
        const md = new Date(l.makeupDate + 'T00:00:00');
        if (md >= sun && md <= sat) {
          const isOwn = lessonDates && (l.date === dateStr(lessonDates.newLesson) || l.date === dateStr(lessonDates.review));
          if (!isOwn) { attPresent++; attTotal++; }
        }
      });
    }

    const activeStudentCount2 = students.filter(s => !isStudentInactive(cn, s.name, sun)).length;
    const attBase = activeStudentCount2 * 2;
    const attRate = attBase > 0 ? attPresent / attBase : 0;
    const listenRate = listenTotal > 0 ? listenMet / listenTotal : 0;
    const videoRate = videoExpected > 0 ? videoDoneCount / videoExpected : 0;

    classes.push({ cn, listenTotal, listenMet, listenRate, videoExpected, videoDoneCount, lateCount, videoRate, attTotal, attPresent, attBase, attRate });
    gListenTotal += listenTotal; gListenMet += listenMet;
    gVideoTotal += videoExpected; gVideoDone += (videoDoneCount + lateCount); gVideoLate += lateCount;
    gAttTotal += attTotal; gAttPresent += attPresent; gAttBaseTotal += attBase;
  }

  const gListenRate = gListenTotal > 0 ? gListenMet / gListenTotal : 0;
  const gVideoRate = gVideoTotal > 0 ? gVideoDone / gVideoTotal : 0;
  const gAttRate = gAttBaseTotal > 0 ? gAttPresent / gAttBaseTotal : 0;
  const gOverall = (gListenRate + gVideoRate + gAttRate) / 3;

  return { weekLabel, weekFileName, sun, sat, classes, gListenTotal, gListenMet, gListenRate, gVideoTotal, gVideoDone, gVideoLate, gVideoRate, gAttTotal, gAttPresent, gAttBaseTotal, gAttRate, gOverall };
}

function downloadReportPPTX() {
  if (typeof PptxGenJS === 'undefined') { toast('PPT库加载中，请稍后重试'); return; }
  try {
  const P = new PptxGenJS();
  P.layout = 'LAYOUT_16x9';
  P.author = 'Nova';
  P.title = '周报复盘';
  const D = computeReportSummary();
  const TX = loadReportTexts(); // 用户填写的周报文本

  const C = { dark:'1E293B', primary:'4F46E5', accent:'0EA5E9', warm:'F59E0B', success:'10B981', bg:'F8FAFC', white:'FFFFFF', text:'1E293B', mute:'64748B', border:'CBD5E1', lightBorder:'E2E8F0' };

  // ── Slide 1: Cover ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.dark };
    s.addShape(P.shapes.RECTANGLE, { x:0, y:0, w:10, h:5.625, fill:{color:C.dark} });
    s.addShape(P.shapes.RECTANGLE, { x:1.2, y:2.1, w:0.08, h:0.55, fill:{color:C.accent} });
    s.addText('炫舞艺术 · 班级运营修炼', { x:1.5, y:1.6, w:7, h:0.6, fontSize:16, fontFace:'Microsoft YaHei', color:C.mute, align:'left', margin:0 });
    s.addText('周 报 复 盘', { x:1.5, y:2.0, w:7, h:0.75, fontSize:38, fontFace:'Microsoft YaHei', color:C.white, bold:true, align:'left', margin:0 });
    s.addText('主题周「' + D.weekLabel + '」', { x:1.5, y:2.9, w:7, h:0.5, fontSize:14, fontFace:'Microsoft YaHei', color:C.accent, align:'left', margin:0 });
    s.addShape(P.shapes.RECTANGLE, { x:0, y:5.3, w:10, h:0.04, fill:{color:C.primary, transparency:60} });
  })();

  // ── Slide 2: TOC ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.bg };
    s.addText('每周复盘', { x:0.8, y:0.5, w:8, h:0.6, fontSize:26, fontFace:'Microsoft YaHei', color:C.dark, bold:true, margin:0 });
    s.addShape(P.shapes.RECTANGLE, { x:0.8, y:1.15, w:2.8, h:0.03, fill:{color:C.primary} });

    const steps = [
      { num:'01', title:'看目标', sub:'设定本周 KPI 指标' },
      { num:'02', title:'看过程', sub:'回顾执行中的亮点与问题' },
      { num:'03', title:'看结果', sub:'数据化呈现班级达成情况' },
      { num:'04', title:'看自己', sub:'心态反思与能力成长' },
      { num:'05', title:'看下周', sub:'明确下周目标与行动' }
    ];
    steps.forEach((st, i) => {
      const y = 1.6 + i * 0.75;
      s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:0.8, y:y, w:8.4, h:0.6, fill:{color:C.white}, rectRadius:0.06, shadow:{type:'outer', blur:4, offset:1, angle:135, color:'000000', opacity:0.06} });
      s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:0.9, y:y+0.1, w:0.8, h:0.4, fill:{color:C.primary}, rectRadius:0.04 });
      s.addText(st.num, { x:0.9, y:y+0.1, w:0.8, h:0.4, fontSize:14, fontFace:'Arial', color:C.white, bold:true, align:'center', valign:'middle', margin:0 });
      s.addText(st.title, { x:1.9, y:y+0.02, w:3, h:0.35, fontSize:15, fontFace:'Microsoft YaHei', color:C.text, bold:true, valign:'bottom', margin:0 });
      s.addText(st.sub, { x:1.9, y:y+0.32, w:5, h:0.25, fontSize:11, fontFace:'Microsoft YaHei', color:C.mute, valign:'top', margin:0 });
    });
  })();

  // ── Slide 3: 看目标 ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.bg };
    s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:0.5, y:0.35, w:1.1, h:0.45, fill:{color:C.primary}, rectRadius:0.06 });
    s.addText('01', { x:0.5, y:0.35, w:1.1, h:0.45, fontSize:16, fontFace:'Arial', color:C.white, bold:true, align:'center', valign:'middle', margin:0 });
    s.addText('看目标', { x:1.8, y:0.35, w:6, h:0.45, fontSize:22, fontFace:'Microsoft YaHei', color:C.dark, bold:true, valign:'middle', margin:0 });

    const kpis = [
      { icon:'📻', label:'录音打卡', target:'100%', sub:'每日40分钟听力练习' },
      { icon:'📹', label:'视频打卡', target:'100%', sub:'新课+复习课复述视频' },
      { icon:'👥', label:'出勤率', target:'100%', sub:'确保每节课全员出席' }
    ];
    kpis.forEach((k, i) => {
      const x = 0.8 + i * 3.0;
      s.addShape(P.shapes.RECTANGLE, { x:x, y:1.35, w:2.6, h:3.4, fill:{color:C.white}, shadow:{type:'outer', blur:6, offset:2, angle:135, color:'000000', opacity:0.08} });
      s.addShape(P.shapes.RECTANGLE, { x:x, y:1.35, w:2.6, h:0.08, fill:{color: i===0?C.primary:(i===1?C.accent:C.warm)} });
      s.addText(k.icon, { x:x, y:1.8, w:2.6, h:0.7, fontSize:36, align:'center', valign:'middle', margin:0 });
      s.addText(k.label, { x:x, y:2.5, w:2.6, h:0.35, fontSize:16, fontFace:'Microsoft YaHei', color:C.text, bold:true, align:'center', valign:'middle', margin:0 });
      s.addText(k.target, { x:x, y:3.0, w:2.6, h:0.6, fontSize:40, fontFace:'Arial', color:C.primary, bold:true, align:'center', valign:'middle', margin:0 });
      s.addText(k.sub, { x:x+0.2, y:3.75, w:2.2, h:0.35, fontSize:10, fontFace:'Microsoft YaHei', color:C.mute, align:'center', valign:'middle', margin:0 });
      s.addShape(P.shapes.RECTANGLE, { x:x+0.3, y:4.25, w:2.0, h:0.02, fill:{color:C.lightBorder} });
      s.addText('每周目标', { x:x, y:4.35, w:2.6, h:0.3, fontSize:9, fontFace:'Microsoft YaHei', color:C.mute, align:'center', valign:'middle', margin:0 });
    });
  })();

  // ── Slide 4: 看结果 (DATA) ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.bg };
    s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:0.5, y:0.35, w:1.1, h:0.45, fill:{color:C.warm}, rectRadius:0.06 });
    s.addText('03', { x:0.5, y:0.35, w:1.1, h:0.45, fontSize:16, fontFace:'Arial', color:C.white, bold:true, align:'center', valign:'middle', margin:0 });
    s.addText('看结果', { x:1.8, y:0.35, w:6, h:0.45, fontSize:22, fontFace:'Microsoft YaHei', color:C.dark, bold:true, valign:'middle', margin:0 });

    // Summary table
    const hdrOpt = { fill:{color:C.dark}, color:C.white, bold:true, fontSize:10, fontFace:'Microsoft YaHei', align:'center', valign:'middle' };
    const cellOpt = { fontSize:10, fontFace:'Microsoft YaHei', color:C.text, align:'center', valign:'middle', border:{pt:0.5, color:C.lightBorder} };
    const pct = (v) => (v * 100).toFixed(1) + '%';

    const summaryRows = [
      [{ text:'指标', options:hdrOpt}, { text:'应完成', options:hdrOpt}, { text:'实际完成', options:hdrOpt}, { text:'达成率', options:{...hdrOpt, fill:{color:C.success}}}],
      [{ text:'📻 录音打卡', options:{...cellOpt, bold:true, align:'left'}},
       { text: D.gListenTotal + '天', options:cellOpt },
       { text: D.gListenMet + '天', options:cellOpt },
       { text: pct(D.gListenRate), options:{...cellOpt, bold:true, color:D.gListenRate>=0.7?C.success:'EF4444'} }],
      [{ text:'📹 视频打卡', options:{...cellOpt, bold:true, align:'left'}},
       { text: D.gVideoTotal + '次', options:cellOpt },
       { text: (D.gVideoDone) + (D.gVideoLate>0?'(+'+D.gVideoLate+'补)':'') + '次', options:cellOpt },
       { text: pct(D.gVideoRate), options:{...cellOpt, bold:true, color:D.gVideoRate>=0.5?C.success:'EF4444'} }],
      [{ text:'👥 出勤率', options:{...cellOpt, bold:true, align:'left'}},
       { text: D.gAttBaseTotal + '次', options:cellOpt },
       { text: D.gAttPresent + '次', options:cellOpt },
       { text: pct(D.gAttRate), options:{...cellOpt, bold:true, color:D.gAttRate>=0.8?C.success:'EF4444'} }]
    ];
    s.addTable(summaryRows, { x:0.5, y:1.1, w:9.0, colW:[2.5, 2.0, 2.5, 2.0], rowH:[0.4, 0.38, 0.38, 0.38],
      border:{pt:0.5, color:C.lightBorder}, autoPage:false });

    // Detail table header
    const dhdr = { fill:{color:C.primary}, color:C.white, bold:true, fontSize:9, fontFace:'Microsoft YaHei', align:'center', valign:'middle' };
    const dcell = { fontSize:9, fontFace:'Microsoft YaHei', color:C.text, align:'center', valign:'middle', border:{pt:0.5, color:C.lightBorder} };
    const dpct = (v) => pct(v);

    const detailRows = [[
      { text:'班级', options:dhdr },
      { text:'录音\n应完成', options:dhdr }, { text:'录音\n实际', options:dhdr }, { text:'录音\n达成率', options:{...dhdr, fill:{color:C.success}} },
      { text:'视频\n应完成', options:dhdr }, { text:'视频\n实际', options:dhdr }, { text:'视频\n达成率', options:{...dhdr, fill:{color:C.success}} },
      { text:'出勤\n应到', options:dhdr }, { text:'出勤\n实到', options:dhdr }, { text:'出勤率', options:{...dhdr, fill:{color:C.success}} }
    ]];

    D.classes.forEach(cls => {
      const vDisplay = cls.videoDoneCount + (cls.lateCount > 0 ? '+' + cls.lateCount : '');
      detailRows.push([
        { text: cls.cn, options:{...dcell, bold:true, fill:{color:'F1F5F9'}} },
        { text: String(cls.listenTotal+'天'), options:{...dcell, fill:{color:'F1F5F9'}} },
        { text: String(cls.listenMet+'天'), options:{...dcell, fill:{color:'F1F5F9'}} },
        { text: dpct(cls.listenRate), options:{...dcell, bold:true, fill:{color:'F1F5F9'}, color:cls.listenRate>=0.7?C.success:'EF4444'} },
        { text: String(cls.videoExpected+'次'), options:{...dcell, fill:{color:'F1F5F9'}} },
        { text: String(vDisplay+'次'), options:{...dcell, fill:{color:'F1F5F9'}} },
        { text: dpct(cls.videoRate), options:{...dcell, bold:true, fill:{color:'F1F5F9'}, color:cls.videoRate>=0.5?C.success:'EF4444'} },
        { text: String(cls.attBase+'次'), options:{...dcell, fill:{color:'F1F5F9'}} },
        { text: String(cls.attPresent+'次'), options:{...dcell, fill:{color:'F1F5F9'}} },
        { text: dpct(cls.attRate), options:{...dcell, bold:true, fill:{color:'F1F5F9'}, color:cls.attRate>=0.8?C.success:'EF4444'} }
      ]);
    });

    // Overall row
    detailRows.push([
      { text:'🎯 综合 KPI', options:{...dcell, bold:true, fill:{color:C.dark}, color:C.white} },
      { text:'', options:{...dcell, fill:{color:C.dark}} },
      { text:'', options:{...dcell, fill:{color:C.dark}} },
      { text: dpct(D.gListenRate), options:{...dcell, bold:true, fill:{color:C.dark}, color:'FCD34D'} },
      { text:'', options:{...dcell, fill:{color:C.dark}} },
      { text:'', options:{...dcell, fill:{color:C.dark}} },
      { text: dpct(D.gVideoRate), options:{...dcell, bold:true, fill:{color:C.dark}, color:'FCD34D'} },
      { text:'', options:{...dcell, fill:{color:C.dark}} },
      { text:'', options:{...dcell, fill:{color:C.dark}} },
      { text: dpct(D.gOverall), options:{...dcell, bold:true, fill:{color:C.dark}, color:'FCD34D', fontSize:13} }
    ]);

    s.addTable(detailRows, { x:0.5, y:2.95, w:9.0, colW:[1.1,0.85,0.85,0.85,0.85,0.85,0.85,0.85,0.85,0.85], rowH:[0.55,0.38,0.38,0.38,0.42],
      border:{pt:0.5, color:C.lightBorder}, autoPage:false });
  })();

  // ── Slide 5: 看过程 ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.bg };
    s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:0.5, y:0.35, w:1.1, h:0.45, fill:{color:C.accent}, rectRadius:0.06 });
    s.addText('02', { x:0.5, y:0.35, w:1.1, h:0.45, fontSize:16, fontFace:'Arial', color:C.white, bold:true, align:'center', valign:'middle', margin:0 });
    s.addText('看过程', { x:1.8, y:0.35, w:6, h:0.45, fontSize:22, fontFace:'Microsoft YaHei', color:C.dark, bold:true, valign:'middle', margin:0 });

    // A. 过程看法 — 三阶段
    const procText = [
      (TX.processStart||'') ? '▸ 开始：' + TX.processStart : '',
      (TX.processMid||'')   ? '▸ 中间：' + TX.processMid   : '',
      (TX.processEnd||'')   ? '▸ 结束：' + TX.processEnd   : ''
    ].filter(Boolean).join('\n') || '在此处填写内容...';
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:1.2, w:9.0, h:1.85, fill:{color:C.white}, shadow:{type:'outer', blur:4, offset:1, angle:135, color:'000000', opacity:0.06} });
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:1.2, w:0.07, h:1.85, fill:{color:C.accent} });
    s.addText('A. 过程看法', { x:0.8, y:1.3, w:8, h:0.3, fontSize:14, fontFace:'Microsoft YaHei', color:C.dark, bold:true, margin:0 });
    s.addText(procText, { x:0.8, y:1.7, w:8.3, h:1.2, fontSize:11, fontFace:'Microsoft YaHei', color: TX.processStart||TX.processMid||TX.processEnd ? C.text : C.mute, margin:0 });

    // B. 可复制动作
    const actText = TX.processAction || '在此处填写内容...';
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:3.3, w:9.0, h:1.85, fill:{color:C.white}, shadow:{type:'outer', blur:4, offset:1, angle:135, color:'000000', opacity:0.06} });
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:3.3, w:0.07, h:1.85, fill:{color:C.accent} });
    s.addText('B. 可复制动作', { x:0.8, y:3.4, w:8, h:0.3, fontSize:14, fontFace:'Microsoft YaHei', color:C.dark, bold:true, margin:0 });
    s.addText(actText, { x:0.8, y:3.8, w:8.3, h:1.2, fontSize:11, fontFace:'Microsoft YaHei', color: TX.processAction ? C.text : C.mute, margin:0 });
  })();

  // ── Slide 6: 看自己 ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.bg };
    s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:0.5, y:0.35, w:1.1, h:0.45, fill:{color:'8B5CF6'}, rectRadius:0.06 });
    s.addText('04', { x:0.5, y:0.35, w:1.1, h:0.45, fontSize:16, fontFace:'Arial', color:C.white, bold:true, align:'center', valign:'middle', margin:0 });
    s.addText('看自己', { x:1.8, y:0.35, w:6, h:0.45, fontSize:22, fontFace:'Microsoft YaHei', color:C.dark, bold:true, valign:'middle', margin:0 });

    // A. 整体心态 — left half
    const moodText = TX.selfMood || '在此处填写内容...';
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:1.2, w:4.3, h:2.0, fill:{color:C.white}, shadow:{type:'outer', blur:4, offset:1, angle:135, color:'000000', opacity:0.06} });
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:1.2, w:0.07, h:2.0, fill:{color:'8B5CF6'} });
    s.addText('A. 整体心态', { x:0.8, y:1.3, w:3.5, h:0.3, fontSize:14, fontFace:'Microsoft YaHei', color:C.dark, bold:true, margin:0 });
    s.addText(moodText, { x:0.8, y:1.7, w:3.7, h:1.3, fontSize:11, fontFace:'Microsoft YaHei', color: TX.selfMood ? C.text : C.mute, margin:0 });

    // B. 三个优点 — right half top
    const s1 = TX.selfS1 || '① —', s2 = TX.selfS2 || '② —', s3 = TX.selfS3 || '③ —';
    const hasStrengths = TX.selfS1 || TX.selfS2 || TX.selfS3;
    s.addShape(P.shapes.RECTANGLE, { x:5.2, y:1.2, w:4.3, h:2.0, fill:{color:C.white}, shadow:{type:'outer', blur:4, offset:1, angle:135, color:'000000', opacity:0.06} });
    s.addShape(P.shapes.RECTANGLE, { x:5.2, y:1.2, w:0.07, h:2.0, fill:{color:'A78BFA'} });
    s.addText('B. 三个优点', { x:5.5, y:1.3, w:3.5, h:0.3, fontSize:14, fontFace:'Microsoft YaHei', color:C.dark, bold:true, margin:0 });
    s.addText(s1 + '\n' + s2 + '\n' + s3, { x:5.5, y:1.7, w:3.7, h:1.3, fontSize:11, fontFace:'Microsoft YaHei', color: hasStrengths ? C.text : C.mute, margin:0, lineSpacing:20 });

    // C. 一改进 — bottom full width
    const impText = TX.selfImprove || '在此处填写内容...';
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:3.5, w:9.0, h:1.55, fill:{color:C.white}, shadow:{type:'outer', blur:4, offset:1, angle:135, color:'000000', opacity:0.06} });
    s.addShape(P.shapes.RECTANGLE, { x:0.5, y:3.5, w:0.07, h:1.55, fill:{color:'C4B5FD'} });
    s.addText('C. 一改进', { x:0.8, y:3.6, w:8, h:0.3, fontSize:14, fontFace:'Microsoft YaHei', color:C.dark, bold:true, margin:0 });
    s.addText(impText, { x:0.8, y:3.95, w:8.3, h:1.0, fontSize:11, fontFace:'Microsoft YaHei', color: TX.selfImprove ? C.text : C.mute, margin:0 });
  })();

  // ── Slide 7: 看下周 ──
  (function(){
    const s = P.addSlide();
    s.background = { color: C.dark };
    s.addShape(P.shapes.RECTANGLE, { x:0, y:0, w:10, h:5.625, fill:{color:C.dark} });
    s.addShape(P.shapes.ROUNDED_RECTANGLE, { x:4.0, y:0.5, w:2.0, h:0.45, fill:{color:C.success, transparency:20}, rectRadius:0.06 });
    s.addText('05 · 看下周', { x:4.0, y:0.5, w:2.0, h:0.45, fontSize:13, fontFace:'Microsoft YaHei', color:C.success, bold:true, align:'center', valign:'middle', margin:0 });
    s.addText('下周目标', { x:0, y:1.2, w:10, h:0.6, fontSize:26, fontFace:'Microsoft YaHei', color:C.white, bold:true, align:'center', margin:0 });

    const goals = [
      { icon:'📻', label:'录音打卡', target:'100%', sub:'每日40分钟听力' },
      { icon:'📹', label:'视频打卡', target:'100%', sub:'新课+复习课视频' },
      { icon:'👥', label:'出勤率', target:'100%', sub:'全员出席每节课' }
    ];
    goals.forEach((g, i) => {
      const x = 1.2 + i * 2.7;
      s.addShape(P.shapes.RECTANGLE, { x:x, y:2.1, w:2.2, h:2.0, fill:{color:'FFFFFF', transparency:92} });
      s.addText(g.icon, { x:x, y:2.2, w:2.2, h:0.5, fontSize:28, align:'center', valign:'middle', margin:0 });
      s.addText(g.label, { x:x, y:2.7, w:2.2, h:0.3, fontSize:13, fontFace:'Microsoft YaHei', color:C.white, align:'center', valign:'middle', margin:0 });
      s.addText(g.target, { x:x, y:3.1, w:2.2, h:0.5, fontSize:32, fontFace:'Arial', color:C.success, bold:true, align:'center', valign:'middle', margin:0 });
      s.addText(g.sub, { x:x, y:3.65, w:2.2, h:0.25, fontSize:9, fontFace:'Microsoft YaHei', color:C.mute, align:'center', valign:'middle', margin:0 });
    });

    s.addShape(P.shapes.RECTANGLE, { x:3.5, y:4.5, w:3.0, h:0.02, fill:{color:C.accent, transparency:40} });
    s.addText('保持节奏 · 持续精进', { x:0, y:4.7, w:10, h:0.4, fontSize:12, fontFace:'Microsoft YaHei', color:C.mute, align:'center', margin:0 });
  })();

  P.writeFile({ fileName: '周报_' + D.weekFileName + '.pptx' }).then(() => toast('✅ 周报PPTX已生成'));
  } catch (err) {
    console.error('PPTX导出失败:', err);
    toast('❌ 导出失败: ' + err.message);
  }
}


// ╔══════════════════════════════════════════╗
// ║          TAB 4: WEEKLY REPORT           ║
// ╚══════════════════════════════════════════╝

// ╔══════════════════════════════════════════╗
// ║     REPORT TEXT INPUTS STORAGE           ║
// ╚══════════════════════════════════════════╝

function getReportTextKey() {
  return STORAGE_PREFIX + 'report-text-' + getReportWeekKey(currentReportSunday);
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

// ╔══════════════════════════════════════════════════════════╗
// ║  共享统计：某个「月内自然周」内某班的班级数据              ║
// ║  周报主体 / 月报 / Excel / PPTX 全部走这里 → 口径一致      ║
// ║                                                            ║
// ║  听录音：按天统计（周一~周日，首尾周按当月天数），          ║
// ║          截止 = min(周末, 今天)，未来天数不计入分母         ║
// ║  视频  ：只统计「已截止的作业」；不足 7 天的周与作业周期    ║
// ║          不对齐，不计入（避免跨月重复计同一周期）           ║
// ║  出勤  ：按该周实际排课节数（0~2 节；不足 7 天的周可能 0/1）║
// ╚══════════════════════════════════════════════════════════╝
function computeWeekClassStats(cn, weekStart, todayStr) {
  const ws = getReportWeekStart(weekStart);
  const weekEnd = getReportWeekEnd(ws);
  const days = getReportWeekDays(ws);
  const isFullWeek = (days === 7);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = weekEnd.getTime() < today.getTime() ? weekEnd : today;
  const tStr = todayStr || dateStr(new Date());

  const students = getDisplayStudents(cn);
  const ld = getLessonDatesInReportWeek(cn, ws);
  const lessons = ld ? ld.lessons : [];
  const attDataByKey = {};
  lessons.forEach(function(d) { attDataByKey[dateStr(d)] = loadAttendance(dateStr(d)); });

  const videoEntries = isFullWeek ? getReportWeekVideoEntries(cn, ws, tStr) : [];
  const lateSubs = isFullWeek ? loadReportLateSubs(cn, ws) : [];

  const rows = [];
  let listenMet = 0, listenTotal = 0;
  let videoDone = 0, videoExpected = 0, videoLate = 0;
  let attPresent = 0, attScheduled = 0;
  let activeCount = 0;

  students.forEach(function(s) {
    const cfg = getStudentCfg(cn, s.name) || {};
    const row = { name: s.name, exemptReason: '', listening: '', listeningRate: null,
                  videoDone: 0, videoTotal: 0, videoLate: 0, attPresent: 0, attTotal: lessons.length };

    if (isStudentInactive(cn, s.name, ws)) {
      const classGate = isBeforeCountStart(cn, ws);
      const afterLeft = isAfterLeftWeek(cn, s.name, ws);
      row.listening = afterLeft ? '已退学' : (classGate ? '未计入' : '未加入');
      row.exemptReason = afterLeft ? '已退学/停课' : (classGate ? '本班下周起计入' : '新生未加入');
      rows.push(row);
      return;
    }
    activeCount++;

    // 听录音
    if (cfg.exemptListening) {
      row.listening = '免打卡';
    } else if (isConsecutiveLeave(cn, s.name, ws)) {
      row.listening = '请假中';
      row.exemptReason = '连续请假';
    } else {
      let met = 0, tot = 0;
      const d = new Date(ws);
      while (d.getTime() <= cutoff.getTime()) {
        tot++;
        if (loadMinutesForDate(cn, s.name, d) >= TARGET) met++;
        d.setDate(d.getDate() + 1);
      }
      row.listening = met + '/' + tot;
      row.listeningRate = tot > 0 ? met / tot : 0;
      listenMet += met; listenTotal += tot;
    }

    // 视频
    if (isFullWeek) {
      videoEntries.forEach(function(rec) {
        if (isLeaveNoMakeup(cn, s.name, rec.date)) return;
        row.videoTotal++;
        videoExpected++;
        if (rec.submissions[s.name]) { row.videoDone++; videoDone++; }
      });
    }

    // 出勤
    lessons.forEach(function(d) {
      const key = dateStr(d);
      const ad = attDataByKey[key] || {};
      const status = ad[cn] ? (ad[cn][s.name] || 'present') : 'present';
      attScheduled++;
      if (status === 'present') { row.attPresent++; attPresent++; }
    });

    rows.push(row);
  });

  // 手工补交（视频）
  if (isFullWeek) {
    lateSubs.forEach(function(ls) {
      const r = rows.filter(function(x) { return x.name === ls.name; })[0];
      if (r) r.videoLate++;
      videoLate++;
    });
  }

  return {
    rows: rows, days: days, isFullWeek: isFullWeek, lessons: lessons,
    listenMet: listenMet, listenTotal: listenTotal,
    videoDone: videoDone, videoExpected: videoExpected, videoLate: videoLate,
    attPresent: attPresent, attScheduled: attScheduled, attBase: activeCount * lessons.length,
    activeCount: activeCount
  };
}

// 某个报告周、全部班级的合计（月报用）
function computeGlobalWeekTotals(weekStart, todayStr) {
  let lMet = 0, lTot = 0, vDone = 0, vExp = 0, vLate = 0, aPre = 0, aBase = 0;
  Object.keys(CLASSES).forEach(function(cn) {
    const st = computeWeekClassStats(cn, weekStart, todayStr);
    lMet += st.listenMet; lTot += st.listenTotal;
    vDone += st.videoDone + st.videoLate; vExp += st.videoExpected; vLate += st.videoLate;
    aPre += st.attPresent; aBase += st.attBase;
  });
  return { lMet: lMet, lTot: lTot, vDone: vDone, vExp: vExp, vLate: vLate, aPre: aPre, aBase: aBase };
}

// 读取某报告周的「补交」记录：优先新键（周起始日），否则兼容旧的 ISO 周键
function loadReportLateSubs(cn, weekStart) {
  const primary = loadLateSubs(cn, getReportWeekKey(weekStart));
  if (primary && primary.length) return primary;
  const legacyKeys = getLegacyReportWeekKeys(weekStart);
  for (let i = 0; i < legacyKeys.length; i++) {
    const arr = loadLateSubs(cn, legacyKeys[i]);
    if (arr && arr.length) return arr;
  }
  return [];
}

// 某个日期区间内、已截止的视频作业（按作业日期排序）——评星面板用
function getVideoEntriesInRange(className, startStr, endStr) {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.indexOf(STORAGE_PREFIX + 'V-' + className + '-') >= 0) {
      try {
        const rec = JSON.parse(localStorage.getItem(key));
        if (rec && rec.date && rec.submissions) entries.push(rec);
      } catch (e) {}
    }
  }
  entries.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  const out = [];
  entries.forEach(function(rec) {
    if (rec.date < startStr || rec.date > endStr) return;
    let pairedDate;
    try {
      if (rec.type === 'new') pairedDate = getPairedReviewDate(rec.date, className);
      else if (rec.type === 'review') pairedDate = getPairedNewDate(rec.date, className);
      else return;
    } catch (e) { return; }
    if (dateStr(pairedDate) <= endStr) out.push(rec);
  });
  return out;
}

function renderReport() {
  const sun = getReportWeekStart(currentReportSunday);   // 报告周起始日（周一 / 当月 1 号）
  const sat = getReportWeekEnd(sun);                      // 报告周结束日（周日 / 月末）
  const weekDays = getReportWeekDays(sun);
  const todayStr = dateStr(new Date());
  const weekLabel = getReportWeekMonthLabel(sun) + '（' + formatReportWeek(sun) + ' · ' + weekDays + '天）';

  let html = '<div class="action-bar"><span class="hint">周报口径：月内自然周（周一~周日，首尾周按当月天数）；视频打卡按本周排课次数统计</span>'
    + '<div class="week-nav"><button onclick="prevWeekRp()">◀</button>'
    + '<span class="week-label">' + weekLabel + '</span>'
    + '<button onclick="nextWeekRp()">▶</button>'
    + '<button onclick="goTodayRp()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周</button></div>'
    + '<button class="btn btn-outline" onclick="downloadReportExcel()">📊 导出 Excel</button>'
    + '<button class="btn btn-outline" onclick="downloadReportPPTX()" style="background:#4F46E5;color:#fff;border-color:#4F46E5">📑 导出 PPTX</button></div>';

  // 全局合计
  let globalListenTotal = 0, globalListenMet = 0;
  let globalVideoTotal = 0, globalVideoDone = 0, globalVideoLate = 0;
  let globalAttBaseTotal = 0, globalAttPresent = 0;

  for (const cn of Object.keys(CLASSES)) {
    const st = computeWeekClassStats(cn, sun, todayStr);

    // 视频统计周期描述（不足 7 天的周与作业周期不对齐，不计入）
    const videoPeriodDesc = st.isFullWeek ? getReportWeekVideoPeriodInfo(cn, sun).desc : '本周不足 7 天，视频不计入统计';

    html += '<div class="report-table-wrap"><table class="report-table"><thead><tr>'
      + '<th>学生</th><th>听录音</th><th>录音达标率</th><th>视频打卡</th><th>视频达标率</th><th>出勤</th><th>出勤率</th><th></th></tr>'
      + '<tr class="video-period-hint"><td colspan="3"></td><td colspan="2" style="font-size:.68rem;color:#64748B;font-weight:400;padding:2px 8px 6px;text-align:center">' + videoPeriodDesc + '</td><td colspan="3"></td></tr>'
      + '</thead><tbody>';

    st.rows.forEach(function(r) {
      const lRate = r.listeningRate !== null ? (r.listeningRate >= 0.7 ? 'rate-good' : 'rate-bad') : 'rate-na';
      const lRateText = r.listeningRate !== null ? (r.listeningRate * 100).toFixed(0) + '%' : '—';

      let vDisplay = '—', vRate = 'rate-na', vRateText = '—';
      if (st.isFullWeek) {
        vDisplay = r.videoDone + '/' + r.videoTotal + (r.videoLate > 0 ? ' ⚡+' + r.videoLate : '');
        if (r.videoTotal > 0) {
          vRateText = ((r.videoDone + r.videoLate) / r.videoTotal * 100).toFixed(0) + '%';
          vRate = ((r.videoDone + r.videoLate) / r.videoTotal >= 0.5) ? 'rate-good' : 'rate-bad';
        }
      }

      let aDisplay = '—', aRate = 'rate-na', aRateText = '—';
      if (r.attTotal > 0) {
        aDisplay = r.attPresent + '/' + r.attTotal + (r.attPresent > r.attTotal ? ' ⚡' : '');
        aRateText = (r.attPresent / r.attTotal * 100).toFixed(0) + '%';
        aRate = (r.attPresent / r.attTotal >= 0.8) ? 'rate-good' : 'rate-bad';
      }

      const rowClass = r.exemptReason ? ' style="opacity:0.4"' : '';
      html += '<tr' + rowClass + '>'
        + '<td class="name-col">' + escHtml(r.name) + (r.exemptReason ? ' <span style="font-size:.7em;color:#94a3b8">(' + r.exemptReason + ')</span>' : '') + '</td>'
        + '<td>' + r.listening + '</td>'
        + '<td class="' + lRate + '">' + lRateText + '</td>'
        + '<td>' + vDisplay + '</td>'
        + '<td class="' + vRate + '">' + vRateText + '</td>'
        + '<td>' + aDisplay + '</td>'
        + '<td class="' + aRate + '">' + aRateText + '</td>'
        + '<td><button class="sc-heatmap-btn" title="个人周报卡" onclick="showStudentCard(\'' + cn + '\',\'' + escHtml(r.name) + '\',\'' + dateStr(sun) + '\')" style="font-size:.85rem">📋</button></td>'
        + '</tr>';
    });

    // 班级汇总
    const lAvg = st.listenTotal > 0 ? st.listenMet / st.listenTotal : 0;
    const vAvg = st.videoExpected > 0 ? (st.videoDone + st.videoLate) / st.videoExpected : 0;
    const aAvg = st.attBase > 0 ? st.attPresent / st.attBase : 0;
    const vSumDisplay = st.isFullWeek ? (st.videoDone + (st.videoLate > 0 ? '+' + st.videoLate : '') + '/' + st.videoExpected) : '—';

    html += '<tr class="section-header"><td><strong>' + cn + ' 汇总</strong></td>'
      + '<td>' + st.listenMet + '/' + st.listenTotal + '</td>'
      + '<td class="' + (st.listenTotal > 0 ? (lAvg >= 0.7 ? 'rate-good' : 'rate-bad') : 'rate-na') + '">' + (st.listenTotal > 0 ? (lAvg * 100).toFixed(0) + '%' : '—') + '</td>'
      + '<td>' + vSumDisplay + '</td>'
      + '<td class="' + (st.isFullWeek && st.videoExpected > 0 ? (vAvg >= 0.5 ? 'rate-good' : 'rate-bad') : 'rate-na') + '">' + (st.isFullWeek && st.videoExpected > 0 ? (vAvg * 100).toFixed(0) + '%' : '—') + '</td>'
      + '<td>' + (st.attBase > 0 ? st.attPresent + '/' + st.attBase : '—') + '</td>'
      + '<td class="' + (st.attBase > 0 ? (aAvg >= 0.8 ? 'rate-good' : 'rate-bad') : 'rate-na') + '">' + (st.attBase > 0 ? (aAvg * 100).toFixed(0) + '%' : '—') + '</td>'
      + '<td></td></tr>';

    html += '</tbody></table></div>';

    globalListenMet += st.listenMet; globalListenTotal += st.listenTotal;
    globalVideoDone += st.videoDone + st.videoLate; globalVideoTotal += st.videoExpected; globalVideoLate += st.videoLate;
    globalAttPresent += st.attPresent; globalAttBaseTotal += st.attBase;
  }

  // ═══ 综合汇总 ═══
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
  //  📅 月报 — 按月查看，按月内自然周拆分（第N周）
  //  与上方周报共用 computeWeekClassStats，保证口径完全一致
  // ════════════════════════════════════
  {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (typeof window.monthReportOffset === 'undefined') window.monthReportOffset = 0;
    const ref = new Date(today.getFullYear(), today.getMonth() - window.monthReportOffset, 1);
    const yearStr = ref.getFullYear();
    const monthLabel = (ref.getMonth() + 1) + '月';
    const mWeeks = getMonthReportWeeks(yearStr, ref.getMonth());

    const weekTotals = mWeeks.map(function(w) { return computeGlobalWeekTotals(w.start, todayStr); });

    let tLMet = 0, tLTot = 0, tVDone = 0, tVExp = 0, tAPre = 0, tABase = 0;
    weekTotals.forEach(function(t) {
      tLMet += t.lMet; tLTot += t.lTot; tVDone += t.vDone; tVExp += t.vExp; tAPre += t.aPre; tABase += t.aBase;
    });

    const weekHdrs = mWeeks.map(function(w, i) {
      const d = getReportWeekDays(w.start);
      const sub = (w.start.getMonth() + 1) + '/' + w.start.getDate() + '-' + w.end.getDate();
      const tag = d < 7 ? '<br><span style="font-size:.58rem;color:#a78bfa">仅 ' + d + ' 天</span>' : '';
      return '<th style="text-align:center;font-size:.78rem;min-width:66px;padding:4px 2px">第' + (i + 1) + '周' + tag
        + '<br><span style="font-size:.6rem;color:#7C3AED;font-weight:400">' + sub + '</span></th>';
    }).join('');

    html += '<div class="report-table-wrap" style="margin-top:20px"><table class="report-table" style="font-size:.85rem"><thead><tr>'
      + '<th rowspan="2" style="background:#7C3AED;color:#fff;text-align:center;font-size:.9rem;vertical-align:middle;min-width:112px">'
      + '<button onclick="window.monthReportOffset=(window.monthReportOffset||0)+1;renderReport();" style="font-size:.8rem;background:none;border:none;color:#fff;cursor:pointer;padding:2px 8px;margin-right:2px">◀</button>'
      + '📅 ' + yearStr + '年' + monthLabel
      + '<button onclick="window.monthReportOffset=Math.max(0,(window.monthReportOffset||0)-1);renderReport();" style="font-size:.8rem;background:none;border:none;color:#fff;cursor:pointer;padding:2px 8px;margin-left:2px">▶</button>'
      + '</th>'
      + weekHdrs
      + '<th rowspan="2" style="text-align:center;font-size:.85rem;background:#ede9fe;width:78px;vertical-align:middle;color:#5B21B6">合计</th>'
      + '</tr><tr>';

    for (let i = 0; i < mWeeks.length; i++) {
      html += '<th style="background:#ede9fe;font-size:.66rem;text-align:center;color:#5B21B6">' + (getReportWeekDays(mWeeks[i].start) < 7 ? '仅录音' : '听/视/勤') + '</th>';
    }
    html += '<th style="background:#ede9fe"></th></tr></thead><tbody>';

    // 录音（按天，全部周都统计）
    html += '<tr><td><span style="font-size:.78rem;color:#64748B">📻 录音达标</span></td>';
    weekTotals.forEach(function(t) {
      html += '<td style="text-align:center">' + t.lMet + '/' + t.lTot + '</td>';
    });
    html += '<td style="text-align:center;font-weight:700;' + (tLTot > 0 && tLMet / tLTot >= 0.7 ? 'color:#059669' : 'color:#ef4444') + '">' + tLMet + '/' + tLTot + '</td></tr>';

    // 视频（仅完整 7 天周统计，避免跨月边界重复计周期）
    html += '<tr><td><span style="font-size:.78rem;color:#64748B">📹 视频完成</span></td>';
    weekTotals.forEach(function(t, i) {
      if (getReportWeekDays(mWeeks[i].start) < 7) {
        html += '<td style="text-align:center;color:#94a3b8;font-style:italic">—</td>';
      } else {
        html += '<td style="text-align:center">' + t.vDone + '/' + t.vExp + '</td>';
      }
    });
    html += '<td style="text-align:center;font-weight:700;' + (tVExp > 0 && tVDone / tVExp >= 0.5 ? 'color:#059669' : 'color:#ef4444') + '">' + tVDone + '/' + tVExp + '</td></tr>';

    // 出勤（按该周实际排课节数）
    html += '<tr><td><span style="font-size:.78rem;color:#64748B">👥 出勤</span></td>';
    weekTotals.forEach(function(t) {
      html += '<td style="text-align:center">' + (t.aBase > 0 ? t.aPre + '/' + t.aBase : '—') + '</td>';
    });
    html += '<td style="text-align:center;font-weight:700;' + (tABase > 0 && tAPre / tABase >= 0.8 ? 'color:#059669' : 'color:#ef4444') + '">' + (tABase > 0 ? tAPre + '/' + tABase : '—') + '</td></tr>';

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
  currentReportSunday = getPrevReportWeekStart(currentReportSunday);
  renderReport();
}
function nextWeekRp() {
  currentReportSunday = getNextReportWeekStart(currentReportSunday);
  renderReport();
}
function goTodayRp() {
  currentReportSunday = getReportWeekStart(new Date());
  renderReport();
}

function downloadReportExcel() {
  if (typeof XLSX === 'undefined') { toast('Excel库加载失败'); return; }
  const wb = XLSX.utils.book_new();
  const sun = getReportWeekStart(currentReportSunday);
  const todayStr = dateStr(new Date());

  let gLMet = 0, gLTotal = 0, gVDone = 0, gVExp = 0, gAPre = 0, gABase = 0;

  for (const cn of Object.keys(CLASSES)) {
    const st = computeWeekClassStats(cn, sun, todayStr);
    const rows = [['学生', '听录音达标', '录音达标率', '视频打卡', '视频达标率', '出勤', '出勤率']];

    st.rows.forEach(function(r) {
      const lRate = r.listeningRate !== null ? (r.listeningRate * 100).toFixed(0) + '%' : '—';
      const vDisplay = st.isFullWeek ? (r.videoDone + '/' + r.videoTotal) : '—';
      const vRate = (st.isFullWeek && r.videoTotal > 0) ? ((r.videoDone + r.videoLate) / r.videoTotal * 100).toFixed(0) + '%' : '—';
      const aRate = r.attTotal > 0 ? (r.attPresent / r.attTotal * 100).toFixed(0) + '%' : '—';
      rows.push([
        r.name,
        r.listening,
        r.listeningRate !== null ? lRate : '—',
        vDisplay,
        vRate,
        r.attTotal > 0 ? (r.attPresent + '/' + r.attTotal) : '—',
        aRate,
      ]);
    });

    if (st.rows.length > 0) {
      const lRate = st.listenTotal > 0 ? (st.listenMet / st.listenTotal * 100).toFixed(0) + '%' : '—';
      const vRate = (st.isFullWeek && st.videoExpected > 0) ? ((st.videoDone + st.videoLate) / st.videoExpected * 100).toFixed(0) + '%' : '—';
      const aRate = st.attBase > 0 ? (st.attPresent / st.attBase * 100).toFixed(0) + '%' : '—';
      rows.push([
        cn + ' 汇总',
        st.listenMet + '/' + st.listenTotal,
        lRate,
        st.isFullWeek ? ((st.videoDone + st.videoLate) + '/' + st.videoExpected) : '—',
        vRate,
        st.attBase > 0 ? (st.attPresent + '/' + st.attBase) : '—',
        aRate,
      ]);
    }

    gLMet += st.listenMet; gLTotal += st.listenTotal;
    gVDone += st.videoDone + st.videoLate; gVExp += st.videoExpected;
    gAPre += st.attPresent; gABase += st.attBase;

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{wch: 10}, {wch: 14}, {wch: 10}, {wch: 14}, {wch: 10}, {wch: 10}, {wch: 10}];
    XLSX.utils.book_append_sheet(wb, sheet, cn);
  }

  const summaryRows = [['指标', '应完成', '实际完成', '达标率']];
  summaryRows.push(['📻 录音综合', gLTotal, gLMet, gLTotal > 0 ? (gLMet / gLTotal * 100).toFixed(1) + '%' : '—']);
  summaryRows.push(['📹 视频综合', gVExp, gVDone, gVExp > 0 ? (gVDone / gVExp * 100).toFixed(1) + '%' : '—']);
  summaryRows.push(['👥 出勤综合', gABase, gAPre, gABase > 0 ? (gAPre / gABase * 100).toFixed(1) + '%' : '—']);
  const gOverall = (gLTotal + gVExp + gABase) > 0
    ? ((gLMet + gVDone + gAPre) / (gLTotal + gVExp + gABase) * 100).toFixed(1) + '%'
    : '—';
  summaryRows.push(['🎯 综合 KPI', '', '', gOverall]);

  const sSheet = XLSX.utils.aoa_to_sheet(summaryRows);
  sSheet['!cols'] = [{wch: 16}, {wch: 12}, {wch: 12}, {wch: 10}];
  XLSX.utils.book_append_sheet(wb, sSheet, '综合汇总');

  XLSX.writeFile(wb, '周报-' + getReportWeekMonthLabel(sun) + '-' + dateStr(sun).replace(/-/g, '') + '.xlsx');
  toast('周报已导出');
}

// 辅助：判断学生该节课是否请假（请假则视频分母 -1）
function isLeaveNoMakeup(className, studentName, dateStr) {
  var leaves = loadLeaves();
  for (var i = 0; i < leaves.length; i++) {
    var l = leaves[i];
    if (l.className === className && l.student === studentName && l.date === dateStr) return true;
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
// 周报专用视频统计：锚定「本报告周的排课」
// ══════════════════════════════════════════
// 口径（2026-10-10 改）：视频次数 = 本周排课节数（新课 1 次 + 复习课 1 次），与「出勤」列对齐
//   - 每节课按「日期 + 类型」精确取 nd-V-{班}-{日期}-{类型}，不做任何跨周推断
//   - 该节课没有记录 → 仍然占 1 次（分子 0），并标注「未建记录」
//   - 未来课（日期 > min(今天, 周结束日)）不计入；保证历史周报结果不随时间变化
//   ⚠️ 旧实现取「该班历史上最近 2 条已截止记录」，某周没有记录时会静默回退到
//      两个月前的旧周期（例：9月第3周表头显示 7/31 + 8/02），已废弃
function getReportWeekVideoEntries(className, reportSunday, todayStr) {
  var ld = getLessonDatesInReportWeek(className, reportSunday);
  if (!ld || !ld.lessons || ld.lessons.length === 0) return [];

  var weStr = dateStr(getReportWeekEnd(reportSunday));
  var cutoff = todayStr < weStr ? todayStr : weStr;
  var nlStr = ld.newLesson ? dateStr(ld.newLesson) : '';

  var out = [];
  ld.lessons.forEach(function(d) {
    var ds = dateStr(d);
    if (ds > cutoff) return; // 不统计未来的课
    var type = (ds === nlStr) ? 'new' : 'review';
    var rec = null;
    try {
      var raw = localStorage.getItem(getVideoKey(className, ds, type));
      if (raw) rec = JSON.parse(raw);
    } catch (e) {}
    if (rec && rec.submissions) {
      out.push(rec);
    } else {
      // 这节课还没建记录：仍然占 1 次，分子记为 0
      out.push({ date: ds, type: type, className: className,
                 submissions: {}, retold: {}, classContent: '', __missing: true });
    }
  });
  out.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return out;
}

// 周报表格里的视频统计口径描述文本
function getReportWeekVideoPeriodInfo(className, reportSunday) {
  var todayStr = dateStr(new Date());
  var entries = getReportWeekVideoEntries(className, reportSunday, todayStr);

  if (entries.length === 0) {
    return { desc: '本周无排课，视频不计入', counted: [] };
  }

  var descParts = entries.map(function(r) {
    return r.date + ' ' + getLessonTypeLabel(r.type) + (r.__missing ? '(未建记录)' : '');
  });
  return {
    desc: '统计本周 ' + entries.length + ' 次：' + descParts.join('、'),
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
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = range.m2End.getTime() < today.getTime() ? range.m2End : today;
  const cutoffStr = dateStr(cutoff);
  const classes = Object.keys(CLASSES);

  let totalListenMet = 0, totalListenTotal = 0;
  let totalVideoDone = 0, totalVideoExpected = 0;
  var monthlyData = {};

  function ensureMonth(mk) {
    if (!monthlyData[mk]) monthlyData[mk] = { listenMet: 0, listenTotal: 0, videoDone: 0, videoExpected: 0, students: new Set() };
    return monthlyData[mk];
  }

  // 范围内覆盖到的「月内自然周」
  var weeks = [];
  (function() {
    var cur = getReportWeekStart(range.m1Start);
    var lastWS = getReportWeekStart(cutoff);
    var guard = 0;
    while (cur.getTime() <= lastWS.getTime() && guard++ < 14) {
      weeks.push(new Date(cur));
      var nx = getNextReportWeekStart(cur);
      if (nx.getTime() <= cur.getTime()) break;
      cur = nx;
    }
  })();

  // 录音：按天扫描；连续请假 / 未加入 / 已退学 按「周」判定
  weeks.forEach(function(weekStart) {
    var we = getReportWeekEnd(weekStart);
    var dayEnd = we.getTime() < cutoff.getTime() ? we : cutoff;
    classes.forEach(function(cn) {
      getAllStudents(cn).forEach(function(s) {
        if (getStudentCfg(cn, s.name).exemptListening) return;
        if (isConsecutiveLeave(cn, s.name, weekStart)) return;
        if (isStudentInactive(cn, s.name, weekStart)) return;
        var d = new Date(weekStart);
        while (d.getTime() <= dayEnd.getTime()) {
          var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          var m = ensureMonth(mk);
          totalListenTotal++; m.listenTotal++;
          if (loadMinutesForDate(cn, s.name, d) >= TARGET) { totalListenMet++; m.listenMet++; }
          m.students.add(cn + ':' + s.name);
          d.setDate(d.getDate() + 1);
        }
      });
    });
  });

  // 视频：范围内「已截止的作业」，按作业日期所在月分桶（同一周期只计一次）
  classes.forEach(function(cn) {
    var entries = getVideoEntriesInRange(cn, dateStr(range.m1Start), cutoffStr);
    entries.forEach(function(rec) {
      var mk = rec.date.substring(0, 7);
      var m = ensureMonth(mk);
      var recWeekStart = getReportWeekStart(new Date(rec.date + 'T00:00:00'));
      getAllStudents(cn).forEach(function(s) {
        if (isLeaveNoMakeup(cn, s.name, rec.date)) return;
        if (isStudentInactive(cn, s.name, recWeekStart)) return;
        totalVideoExpected++; m.videoExpected++;
        if (rec.submissions[s.name]) { totalVideoDone++; m.videoDone++; }
      });
    });
  });

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
  const sun = getReportWeekStart(currentReportSunday);
  const sat = getReportWeekEnd(sun);
  const todayStr = dateStr(new Date());
  const weekLabel = getReportWeekMonthLabel(sun) + '（' + formatReportWeek(sun) + ' · ' + getReportWeekDays(sun) + '天）';
  const weekFileName = getReportWeekMonthLabel(sun) + '_' + dateStr(sun);

  const classes = [];
  let gListenTotal = 0, gListenMet = 0;
  let gVideoTotal = 0, gVideoDone = 0, gVideoLate = 0;
  let gAttBaseTotal = 0, gAttPresent = 0;

  for (const cn of Object.keys(CLASSES)) {
    const st = computeWeekClassStats(cn, sun, todayStr);
    const listenRate = st.listenTotal > 0 ? st.listenMet / st.listenTotal : 0;
    const videoRate = st.videoExpected > 0 ? (st.videoDone + st.videoLate) / st.videoExpected : 0;
    const attRate = st.attBase > 0 ? st.attPresent / st.attBase : 0;

    classes.push({ cn: cn, listenTotal: st.listenTotal, listenMet: st.listenMet, listenRate: listenRate,
      videoExpected: st.videoExpected, videoDoneCount: st.videoDone, lateCount: st.videoLate, videoRate: videoRate,
      attTotal: st.attScheduled, attPresent: st.attPresent, attBase: st.attBase, attRate: attRate });

    gListenTotal += st.listenTotal; gListenMet += st.listenMet;
    gVideoTotal += st.videoExpected; gVideoDone += st.videoDone + st.videoLate; gVideoLate += st.videoLate;
    gAttBaseTotal += st.attBase; gAttPresent += st.attPresent;
  }

  const gListenRate = gListenTotal > 0 ? gListenMet / gListenTotal : 0;
  const gVideoRate = gVideoTotal > 0 ? gVideoDone / gVideoTotal : 0;
  const gAttRate = gAttBaseTotal > 0 ? gAttPresent / gAttBaseTotal : 0;
  const gOverall = (gListenRate + gVideoRate + gAttRate) / 3;

  return { weekLabel, weekFileName, sun, sat, classes,
    gListenTotal, gListenMet, gListenRate,
    gVideoTotal, gVideoDone, gVideoLate, gVideoRate,
    gAttTotal: gAttBaseTotal, gAttPresent, gAttBaseTotal, gAttRate, gOverall };
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


// ║         TAB 3: RANKING & REWARDS        ║
// ╚══════════════════════════════════════════╝

function renderRanking() {
  const refDate = new Date();
  refDate.setDate(refDate.getDate() + rankingWeekOffset * 7);
  const weekLabel = formatRankingWeekLabel(rankingWeekOffset);
  const classes = Object.keys(CLASSES);
  let html = '<div class="action-bar"><span class="hint">课程周排名与奖励 · ' + weekLabel + '</span></div>';

  classes.forEach(cn => {
    const cls = getSchedule(cn, refDate);
    if (!cls) return;
    const rw = getRankingWindow(cn, refDate);
    const fw = getFullAttendanceWindow(cn, refDate);
    if (!rw || !fw) return;

    const dayCountRank = getDayCountInWindow(rw.start, rw.end);
    const students = getListeningStudents(cn).filter(s => !getStudentCfg(cn, s.name).leftDate);

    // Ranking
    const ranking = students.map(s => ({
      name: s.name,
      total: sumMinutesInWindow(cn, s.name, rw.start, rw.end)
    })).sort((a, b) => b.total - a.total);

    // Tie-aware rank assignment: same total = same rank
    let _rank = 1;
    for (let i = 0; i < ranking.length; i++) {
      if (i > 0 && ranking[i].total < ranking[i - 1].total) { _rank = i + 1; }
      ranking[i].rank = _rank;
    }

    // Full attendance
    const fa = students.map(s => ({
      name: s.name,
      days: countFullAttendanceDays(cn, s.name, fw.start, fw.end),
      passed: isFullAttendance(cn, s.name, fw.start, fw.end)
    }));
    const faPass = fa.filter(f => f.passed);
    const faFail = fa.filter(f => !f.passed);
    const sortedFA = [...faPass, ...faFail];

    const nlLabel = ['周日','周一','周二','周三','周四','周五','周六'][cls.newLessonDay];
    const rvLabel = ['周日','周一','周二','周三','周四','周五','周六'][cls.reviewDay];
    const dayLabel = ['日','一','二','三','四','五','六'];
    const fmt = d => (d.getMonth() + 1) + '/' + d.getDate();
    const fmtDist = d => ((d.getMonth() + 1) + '月' + d.getDate() + '日（周' + dayLabel[d.getDay()] + '）');

    // Pirate distribution date = review day (day after ranking window ends)
    const pirateDist = new Date(rw.end);
    pirateDist.setDate(pirateDist.getDate() + 1);

    // Full attendance distribution date = day after full attendance window ends
    const faDist = new Date(fw.end);
    faDist.setDate(faDist.getDate() + 1);

    // Pirate coins section
    html += '<div class="ranking-section"><div class="ranking-section-header">'
      + '<h2>' + cn + ' · ' + nlLabel + '新课 <span class="badge badge-pirate">🏆 海盗币</span></h2></div>'
      + '<div class="ranking-meta">' + rvLabel + '复习课后 ~ ' + nlLabel + '新课前 · ' + dayCountRank + '天</div>'
      + '<div class="ranking-meta" style="color:var(--accent);font-weight:600">📅 发放日期：' + fmtDist(pirateDist) + '</div>';

    const medals = ['🥇', '🥈', '🥉'];
    // Group students by rank for tie-aware cards
    var rankGroups = [];
    var _lastRk = -1;
    for (var i = 0; i < ranking.length; i++) {
      var r = ranking[i];
      if (r.rank !== _lastRk) {
        rankGroups.push({ rank: r.rank, students: [r] });
        _lastRk = r.rank;
      } else {
        rankGroups[rankGroups.length - 1].students.push(r);
      }
    }

    // Top 3 rank groups → one card per rank
    var topGroups = rankGroups.slice(0, 3);
    html += '<div class="pirate-cards">';
    topGroups.forEach(function(g, pos) {
      var coinIdx = pos; // use CARD POSITION (0,1,2) not rank number for medals & coins
      var displayRank = pos + 1; // visual rank for card styling (1st card=gold, 2nd=silver, 3rd=bronze)
      var title = g.students.length > 1
        ? g.students.map(function(s) { return escHtml(s.name); }).join(' · ')
        : escHtml(g.students[0].name);
      html += '<div class="pirate-card rank-' + displayRank + '"><div class="medal">' + medals[coinIdx] + '</div>'
        + '<div class="name">' + title + '</div><div class="minutes">' + g.students[0].total + ' 分钟</div>'
        + '<div class="coins">🏆 × ' + PIRATE_COINS[coinIdx] + '</div><div class="coin-label">海盗币</div></div>';
    });
    html += '</div>';

    // Rest collapsed (rank > 3)
    var restGroups = rankGroups.slice(3);
    if (restGroups.length > 0) {
      html += '<button class="pirate-rest-toggle" onclick="togglePirateRest(this)" data-class="' + cn + '">查看全部排名 <span class="arrow">▼</span></button>';
      html += '<div class="pirate-rest" id="pirate-rest-' + cn + '"><table class="pirate-rest-table"><thead><tr><th>排名</th><th>姓名</th><th>累计</th><th style="text-align:center">🏆</th></tr></thead><tbody>';
      restGroups.forEach(function(g) {
        var isFirst = true;
        g.students.forEach(function(s) {
          html += '<tr><td style="color:var(--text-muted);font-weight:600">' + (isFirst ? g.rank : '') + '</td>'
            + '<td><strong>' + escHtml(s.name) + '</strong></td><td>' + s.total + ' min</td>'
            + '<td style="text-align:center">—</td></tr>';
          isFirst = false;
        });
      });
      html += '</tbody></table></div>';
    }

    // Download buttons for this class
    html += '<div class="download-card-row">'
      + '<button class="download-card-btn" onclick="downloadPirateCard(\'' + cn + '\')">📷 下载海盗币卡片</button>'
      + '<button class="download-card-btn" onclick="downloadFullAttendanceCard(\'' + cn + '\')">📷 下载全勤卡片</button>'
      + '</div>';

    // Full attendance section
    html += '<h3 style="margin-top:20px;margin-bottom:8px;font-size:.95rem">🪙 小金币 · 全勤打卡 <span class="badge badge-coin">7天达标</span></h3>';
    html += '<div class="ranking-meta">' + fmt(fw.start) + ' ~ ' + fmt(fw.end) + ' · 连续7天</div>';
    html += '<div class="ranking-meta" style="color:var(--accent);font-weight:600">📅 发放日期：' + fmtDist(faDist) + '</div>';
    html += '<div class="fa-grid">';
    sortedFA.forEach(f => {
      const clsRow = f.passed ? '' : ' fail';
      html += '<div class="fa-row' + clsRow + '">'
        + '<div class="fa-name">' + escHtml(f.name) + '</div>'
        + '<div class="fa-visual"><div class="fa-dates">';
      // Date labels
      const d = new Date(fw.start);
      for (let i = 0; i < 7; i++) {
        html += '<div class="fa-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</div>';
        d.setDate(d.getDate() + 1);
      }
      html += '</div><div class="fa-blocks">';
      // Blocks
      const d2 = new Date(fw.start);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        let bc;
        if (d2.getTime() > today.getTime()) {
          bc = 'future';
        } else {
          const mins = loadMinutesForDate(cn, f.name, d2);
          if (d2.getTime() === today.getTime() && mins < TARGET) {
            bc = 'today-pending';
          } else {
            bc = mins >= TARGET ? 'pass' : 'fail';
          }
        }
        html += '<div class="fa-block ' + bc + '">' + (bc === 'future' ? '' : (bc === 'pass' ? '✓' : (bc === 'today-pending' ? '○' : '✗'))) + '</div>';
        d2.setDate(d2.getDate() + 1);
      }
      html += '</div></div>'
        + '<div class="fa-summary' + (f.passed ? ' pass' : ' fail') + '">' + f.days + '/7天</div></div>';
    });
    html += '</div></div>';
  });

  document.getElementById('rankingContent').innerHTML = html;
}

function togglePirateRest(btn) {
  const cn = btn.dataset.class;
  const rest = document.getElementById('pirate-rest-' + cn);
  if (!rest) return;
  const isOpen = rest.classList.contains('open');
  rest.classList.toggle('open');
  btn.classList.toggle('open');
  btn.querySelector('.arrow').textContent = isOpen ? '▼' : '▲';
}

// ╔══════════════════════════════════════════╗
// ║    DOWNLOAD CARD FUNCTIONS (RANKING)     ║
// ╚══════════════════════════════════════════╝
function downloadPirateCard(className) {
  if (typeof html2canvas === 'undefined') { toast('卡片库加载中，请稍后再试'); return; }
  // Find the pirate cards section for this class
  const sections = document.querySelectorAll('.ranking-section');
  let target = null;
  sections.forEach(sec => {
    const h2 = sec.querySelector('h2');
    if (h2 && h2.textContent.includes(className)) target = sec;
  });
  if (!target) { toast('未找到 ' + className + ' 的卡片'); return; }

  // Clone the pirate cards into a clean canvas
  const canvas = document.createElement('div');
  canvas.className = 'card-canvas-hidden';
  canvas.style.width = '480px';
  canvas.style.padding = '24px';
  canvas.style.background = '#ffffff';
  canvas.style.borderRadius = '16px';
  canvas.style.fontFamily = 'system-ui, sans-serif';

  // Copy the pirate cards as they appear
  const pirateCards = target.querySelector('.pirate-cards');
  if (!pirateCards) { toast('未找到海盗币卡片'); return; }

  const clone = pirateCards.cloneNode(true);
  clone.style.display = 'grid';
  canvas.appendChild(clone);

  // Add title
  const title = document.createElement('div');
  title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:16px;color:#1e293b;text-align:center';
  title.textContent = className + ' · 🏆 海盗币排名';
  canvas.insertBefore(title, canvas.firstChild);

  document.body.appendChild(canvas);

  html2canvas(canvas, { backgroundColor: '#ffffff', scale: 2 }).then(imgCanvas => {
    document.body.removeChild(canvas);
    const link = document.createElement('a');
    link.download = '海盗币-' + className + '.png';
    link.href = imgCanvas.toDataURL('image/png');
    link.click();
    toast('海盗币卡片已下载');
  }).catch(() => {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    toast('下载失败，请重试');
  });
}

function downloadFullAttendanceCard(className) {
  if (typeof html2canvas === 'undefined') { toast('卡片库加载中，请稍后再试'); return; }

  const sections = document.querySelectorAll('.ranking-section');
  let target = null;
  sections.forEach(sec => {
    const h2 = sec.querySelector('h2');
    if (h2 && h2.textContent.includes(className)) target = sec;
  });
  if (!target) { toast('未找到 ' + className + ' 的卡片'); return; }

  const faGrid = target.querySelector('.fa-grid');
  if (!faGrid) { toast('未找到全勤数据'); return; }

  const canvas = document.createElement('div');
  canvas.className = 'card-canvas-hidden';
  canvas.style.width = '560px';
  canvas.style.padding = '20px 24px';
  canvas.style.background = '#ffffff';
  canvas.style.borderRadius = '16px';
  canvas.style.fontFamily = 'system-ui, sans-serif';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:8px;color:#1e293b;text-align:center';
  title.textContent = className + ' · 🪙 小金币 · 全勤打卡';
  canvas.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:12px;color:#94a3b8;margin-bottom:14px;text-align:center';
  const metaEl = target.querySelector('.ranking-meta');
  subtitle.textContent = metaEl ? metaEl.textContent : '连续7天';
  canvas.appendChild(subtitle);

  const clone = faGrid.cloneNode(true);
  canvas.appendChild(clone);

  document.body.appendChild(canvas);

  html2canvas(canvas, { backgroundColor: '#ffffff', scale: 2 }).then(imgCanvas => {
    document.body.removeChild(canvas);
    const link = document.createElement('a');
    link.download = '全勤奖励-' + className + '.png';
    link.href = imgCanvas.toDataURL('image/png');
    link.click();
    toast('全勤卡片已下载');
  }).catch(() => {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    toast('下载失败，请重试');
  });
}

async function downloadDoubleDoneCard(className) {
  const cls = CLASSES[className];
  if (!cls) return;

  // Cycle-based loading — resolve actual dates from anchor (handles schedule changes)
  const cycle = getVideoCycleDates(currentVideoCycle, className);
  const cycleNewDate = cycle.newDateStr;
  const revDate = cycle.reviewDateObj;
  const revDateStr = cycle.reviewDateStr;

  let newRecord = getVideoRecord(className, cycleNewDate, 'new');
  let reviewRecord = getVideoRecord(className, revDateStr, 'review');

  // No cross-week pulling in cycle view

  const students = getAllStudents(className);
  const doubleDone = students.filter(s => {
    const newOk = newRecord && newRecord.submissions && newRecord.submissions[s.name];
    const reviewOk = reviewRecord && reviewRecord.submissions && reviewRecord.submissions[s.name];
    return newOk && reviewOk;
  });

  if (doubleDone.length === 0) {
    toast('还没有小朋友完成两次打卡哦~');
    return;
  }

  const itemsHTML = doubleDone.map((s, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:12px 16px;margin-bottom:8px;border-radius:12px;
      background:${idx % 2 === 0 ? '#FFFDE7' : '#FFF8E1'};
      border:1px solid #FFE082;">
      <span style="font-size:28px;">🪙</span>
      <div style="flex:1;margin-left:12px;">
        <div style="font-size:17px;font-weight:700;color:#2d2d2d;">${escHtml(s.name)}</div>
        ${s.en ? '<div style="font-size:12px;color:#5f6368;">' + escHtml(s.en) + '</div>' : ''}
      </div>
      <span style="font-size:20px;">🌟</span>
    </div>
  `).join('');

  const preview = document.getElementById('cardPreview');
  preview.style.width = '420px';
  preview.innerHTML = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;">
      <div style="text-align:center;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:700;color:#E8A400;letter-spacing:2px;">🏆 本周两次打卡小明星</div>
        <div style="font-size:20px;font-weight:700;color:#5B8DEF;margin-top:4px;">${className} · 完成追踪</div>
        <div style="font-size:13px;color:#5f6368;margin-top:2px;">${fmtCycleRange(cycleNewDate, className)}</div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,#FFD54F,#FFB300,#FFD54F);border-radius:2px;margin-bottom:16px;"></div>
      ${itemsHTML}
      <div style="text-align:center;margin-top:14px;padding-top:14px;border-top:1px dashed #FFE082;">
        <div style="font-size:16px;font-weight:700;color:#E8A400;">
          🎉 两次课都完成，太厉害了！
        </div>
        <div style="font-size:12px;color:#999;margin-top:6px;">
          新课 + 复习课 · 复述视频双打卡 · 共 ${doubleDone.length} 位小明星
        </div>
      </div>
    </div>
  `;

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
      a.download = className + '_两次打卡小明星_' + cycleNewDate + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('打卡卡片已下载！🪙');
    }, 'image/png');
  } catch (e) {
    toast('生成失败，请重试');
    console.error(e);
  }
}


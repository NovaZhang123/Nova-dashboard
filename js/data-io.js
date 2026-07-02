// ╔══════════════════════════════════════════╗
// ║        EXPORT / IMPORT / BACKUP         ║
// ╚══════════════════════════════════════════╝

function exportAllBackup() {
  const backup = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX)) {
      try { backup[key] = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    }
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.download = 'Nova看板数据备份-' + dateStr(new Date()) + '.json';
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
  toast('数据备份已下载');
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const backup = JSON.parse(ev.target.result);
        let count = 0;
        for (const [key, value] of Object.entries(backup)) {
          if (key.startsWith(STORAGE_PREFIX) && typeof value === 'object') {
            localStorage.setItem(key, JSON.stringify(value));
            count++;
          }
        }
        // Clear migration flag so old-format video keys get re-migrated
        localStorage.removeItem(STORAGE_PREFIX + 'V-MIGRATED-v2');
        migrateVideoKeys();
        renderAll();
        toast('已恢复 ' + count + ' 条数据（视频记录已自动迁移）');
      } catch (err) { toast('备份文件格式错误'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetListeningWeek() {
  if (!confirm('确定重置本周听录音数据？')) return;
  const monday = getWeekMonday(weekOffset);
  const data = {};
  for (const cn of Object.keys(CLASSES)) {
    data[cn] = {};
    for (const s of getListeningStudents(cn)) {
      data[cn][s.name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
    }
  }
  saveListening(monday, data);
  renderAll();
  toast('本周数据已重置');
}

// ╔══════════════════════════════════════════╗
// ║           EXCEL IMPORT                 ║
// ╚══════════════════════════════════════════╝

function triggerImportExcel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('accept', '.xls,.xlsx,.html');
  input.setAttribute('multiple', '');
  input.style.display = 'none';
  input.onchange = async function(e) {
    await handleExcelImport(e);
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}

async function handleExcelImport(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  let totalImported = 0;
  let allDates = [];
  let changes = {};
  const errors = [];
  const fileResults = [];

  toast('正在导入 ' + files.length + ' 个文件...');

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await processSingleFile(files[i]);
      fileResults.push(files[i].name + ': ' + result.count + '条');
      totalImported += result.count;
      allDates = allDates.concat(result.dates || []);
      // Deep merge changes to avoid overwriting same-week data from different files
      if (result.changes) deepMergeChanges(changes, result.changes);
    } catch (err) {
      fileResults.push(files[i].name + ': ❌' + err.message);
      errors.push(files[i].name + ': ' + err.message);
    }
  }

  if (totalImported > 0) {
    if (allDates.length > 0) {
      autoNavigateToWeek(allDates, changes);
    } else {
      mergeImportChanges(changes);
      saveCurrentListeningWeek();
    }
    renderListening();
    renderHeader();
    const msg = '已从 ' + files.length + ' 个文件导入 ' + totalImported + ' 条记录';
    toast(errors.length > 0 ? msg + '（' + errors.length + ' 个失败）' : msg);
  } else if (errors.length === files.length) {
    toast('所有文件均导入失败: ' + fileResults.join('; '));
  } else {
    toast('0条记录。文件详情: ' + fileResults.join('; '));
  }
}

function processSingleFile(file) {
  return new Promise(function(resolve, reject) {
    // try XLSX binary first; fallback to text for HTML
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'html' || ext === 'htm' || ext === 'xml') {
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const rawText = ev.target.result || '';
          console.log('🌐 HTML file:', file.name, 'length:', rawText.length);
          const result = parseHtmlTable(rawText);
          console.log('  → count:', result.count);
          resolve({ count: result.count, dates: result.dates || [], changes: result.changes || {} });
        } catch (err) {
          console.error('💥 HTML parse error', file.name, ':', err);
          reject(err);
        }
      };
      reader.onerror = function() { reject(new Error('读取失败')); };
      reader.readAsText(file);
      return;
    }

    // XLSX read — readAsArrayBuffer is the reliable modern approach
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        if (typeof XLSX === 'undefined') {
          reject(new Error('Excel库加载失败'));
          return;
        }
        const buf = ev.target.result;
        console.log('📄 File:', file.name, 'size:', file.size, 'buffer length:', buf && buf.byteLength);
        if (!buf || !buf.byteLength) {
          reject(new Error('文件内容为空'));
          return;
        }
        const data = new Uint8Array(buf);
        const wb = XLSX.read(data, { cellDates: true });
        console.log('📊 Format detected:', wb.SheetNames.join(', '));
        let count = 0, dates = [], changes = {};
        wb.SheetNames.forEach(function(sn) {
          const result = parseSheet(wb.Sheets[sn]);
          console.log('  Sheet', sn, '→ count:', result.count);
          count += result.count;
          dates = dates.concat(result.dates || []);
          if (result.changes) deepMergeChanges(changes, result.changes);
        });
        resolve({ count: count, dates: dates, changes: changes });
      } catch (err) {
        console.error('💥 Error parsing', file.name, ':', err);
        reject(err);
      }
    };
    reader.onerror = function() { reject(new Error('读取失败')); };
    reader.readAsArrayBuffer(file);
  });
}

function parseHtmlTable(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const allRows = doc.querySelectorAll('tr');
  if (allRows.length < 3) return { count: 0, dates: [] };

  let headerRowCount = 0;
  for (let r = 0; r < allRows.length; r++) {
    if (allRows[r].querySelector('th')) { headerRowCount++; }
    else { break; }
  }
  if (headerRowCount === 0) return { count: 0, dates: [] };

  const grid = [];
  for (let r = 0; r < headerRowCount; r++) {
    grid[r] = [];
    const cells = allRows[r].querySelectorAll('th, td');
    let c = 0;
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i];
      while (grid[r][c]) c++;
      const cs = parseInt(el.getAttribute('colspan')) || 1;
      const rs = parseInt(el.getAttribute('rowspan')) || 1;
      const txt = (el.textContent || '').trim();
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          const rr = r + dr, cc = c + dc;
          if (!grid[rr]) grid[rr] = [];
          grid[rr][cc] = txt;
        }
      }
      c += cs;
    }
  }

  const colCount = Math.max(...grid.map(row => row.length));
  let nameCol = -1;
  const dateCols = {};
  const seenDateCols = new Set(); // avoid duplicates from colspan expansion

  for (let c = 0; c < colCount; c++) {
    const top = (grid[0] && grid[0][c]) || '';
    const sub = (grid[1] && grid[1][c]) || '';
    if (top.indexOf('姓名') >= 0) { nameCol = c; }
    const dateMatch = top.match(/^(\d{4}-\d{1,2}-\d{1,2})$/);
    if (dateMatch) {
      // Only add the first column for each date (skip colspan duplicates)
      // Also prefer columns where sub-header says '打卡' (not '批复')
      const dateKey = dateMatch[1];
      if (!seenDateCols.has(dateKey)) {
        seenDateCols.add(dateKey);
        dateCols[c] = dateKey;
      } else if (sub.indexOf('打卡') >= 0) {
        // Replace previous entry with the explicit 打卡 column
        for (const k in dateCols) { if (dateCols[k] === dateKey) { delete dateCols[k]; break; } }
        dateCols[c] = dateKey;
      }
    }
  }

  if (nameCol < 0) nameCol = 2;
  if (Object.keys(dateCols).length === 0) return { count: 0, dates: [] };

  let count = 0;
  const importDates = [];
  // changes structure: { mondayISO: { cls: { name: { dk: minutes } } } }
  const changes = {};
  for (let r = headerRowCount; r < allRows.length; r++) {
    const tds = allRows[r].querySelectorAll('td');
    if (tds.length <= nameCol) continue;
    const name = (tds[nameCol].textContent || '').trim();
    if (!name) continue;

    let cls = '';
    if (nameCol > 0 && (nameCol - 1) < tds.length) {
      const cc = (tds[nameCol - 1].textContent || '').trim();
      const cm = cc.match(/(\d+)班/);
      if (cm) cls = cm[1] + '班';
    }
    if (!cls) cls = findClassForStudent(name);
    if (!cls) continue;

    for (const colStr in dateCols) {
      const col = parseInt(colStr);
      if (col >= tds.length) continue;
      let cellText = (tds[col].textContent || '').trim();
      if (!cellText) cellText = (tds[col].getAttribute('title') || '').trim();
      if (!cellText || cellText === 'NaN') continue;
      const mm = cellText.match(/(\d+)/);
      if (!mm) continue;
      const minutes = parseInt(mm[1]);
      if (minutes > 0) {
        const dk = dateStrToDayKey(dateCols[colStr]);
        if (dk) {
          const mondayKey = getMondayKeyFromDateStr(dateCols[colStr]);
          if (!changes[mondayKey]) changes[mondayKey] = {};
          if (!changes[mondayKey][cls]) changes[mondayKey][cls] = {};
          if (!changes[mondayKey][cls][name]) changes[mondayKey][cls][name] = {};
          changes[mondayKey][cls][name][dk] = minutes;
          importDates.push(dateCols[colStr]);
          count++;
        }
      }
    }
  }
  return { count, dates: importDates, changes };
}

function normalizeCell(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
  }
  return String(v || '').trim();
}

function parseSheet(ws) {
  var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 3) return { count: 0, dates: [] };
  var isA = false, isB = false;
  for (var r = 0; r < Math.min(6, rows.length); r++) {
    var row = rows[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = normalizeCell(row[c]);
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cell)) isA = true;
      if (/^\d{1,2}月\d{1,2}日$/.test(cell)) isB = true;
    }
  }
  if (isA) return parseFormatA(rows);
  if (isB) return parseFormatB(rows);
  return { count: 0, dates: [], changes: {} };
}

function parseFormatA(rows) {
  var dateCols = {};
  var nameCol = -1;
  for (var r = 0; r < Math.min(6, rows.length); r++) {
    var row = rows[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = normalizeCell(row[c]);
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cell)) { dateCols[c] = cell; }
      if (cell.indexOf('姓名') >= 0) nameCol = c;
    }
  }
  if (Object.keys(dateCols).length === 0) return { count: 0, dates: [] };
  if (nameCol < 0) nameCol = 2;
  return parseDataRows(rows, nameCol, dateCols, true);
}

function parseFormatB(rows) {
  var now = new Date();
  var dateCols = {};
  var nameCol = -1;
  for (var r = 0; r < Math.min(6, rows.length); r++) {
    var row = rows[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = normalizeCell(row[c]);
      var m = cell.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (m) {
        var mo = parseInt(m[1]), dy = parseInt(m[2]);
        // If the month is ahead of current month by more than 1, it's likely last year
        var y = (mo > now.getMonth() + 2) ? now.getFullYear() - 1 : now.getFullYear();
        dateCols[c] = y + '-' + String(mo).padStart(2,'0') + '-' + String(dy).padStart(2,'0');
      }
      if (cell.indexOf('姓名') >= 0) nameCol = c;
    }
  }
  if (Object.keys(dateCols).length === 0) return { count: 0, dates: [] };
  if (nameCol < 0) nameCol = 2;
  return parseDataRows(rows, nameCol, dateCols, false);
}

function parseDataRows(rows, nameCol, dateCols, stripMinSuffix) {
  var classCol = nameCol > 0 ? nameCol - 1 : -1;
  var dataStart = -1;
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r] || [];
    if (row.length <= nameCol) continue;
    var nm = String(row[nameCol] || '').trim();
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(nm)) { dataStart = r; break; }
  }
  if (dataStart < 0) return { count: 0, dates: [] };

  var importDates = [];
  var count = 0;
  // changes structure: { mondayISO: { cls: { name: { dk: minutes } } } }
  var changes = {};
  for (var r = dataStart; r < rows.length; r++) {
    var row = rows[r] || [];
    var name = String(row[nameCol] || '').trim();
    if (!name || !/^[\u4e00-\u9fa5]{2,4}$/.test(name)) continue;

    var cls = '';
    if (classCol >= 0) {
      var cc = String(row[classCol] || '');
      var cm = cc.match(/(\d+)班/);
      if (cm) cls = cm[1] + '班';
    }
    if (!cls) cls = findClassForStudent(name);
    if (!cls) continue;

    for (var colStr in dateCols) {
      var col = parseInt(colStr);
      var val = row[col];
      if (val === '' || val == null || String(val) === 'NaN') continue;
      var minutes = 0;
      if (typeof val === 'number') { minutes = Math.round(val); }
      else { var s = String(val); var mm = s.match(/(\d+)/); if (mm) minutes = parseInt(mm[1]); }
      if (minutes > 0) {
        var dk = dateStrToDayKey(dateCols[colStr]);
        if (dk) {
          var mondayKey = getMondayKeyFromDateStr(dateCols[colStr]);
          if (!changes[mondayKey]) changes[mondayKey] = {};
          if (!changes[mondayKey][cls]) changes[mondayKey][cls] = {};
          if (!changes[mondayKey][cls][name]) changes[mondayKey][cls][name] = {};
          changes[mondayKey][cls][name][dk] = minutes;
          importDates.push(dateCols[colStr]);
          count++;
        }
      }
    }
  }
  return { count: count, dates: importDates, changes: changes };
}

function dateStrToDayKey(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var keys = ['sun','mon','tue','wed','thu','fri','sat'];
  return keys[d.getDay()] || null;
}

function getMondayKeyFromDateStr(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  var mon = getMonday(d);
  return mon.getFullYear() + '-' + String(mon.getMonth()+1).padStart(2,'0') + '-' + String(mon.getDate()).padStart(2,'0');
}

function findClassForStudent(name) {
  for (const cn of Object.keys(CLASSES)) {
    for (const s of getListeningStudents(cn)) {
      if (s.name === name) return cn;
    }
  }
  return '';
}

// Deep merge changes: { mondayKey: { cls: { name: { dk: minutes } } } }
// Avoids Object.assign overwriting same-week data from different files
function deepMergeChanges(target, source) {
  for (var mk in source) {
    if (!target[mk]) target[mk] = {};
    for (var cls in source[mk]) {
      if (!target[mk][cls]) target[mk][cls] = {};
      for (var name in source[mk][cls]) {
        if (!target[mk][cls][name]) target[mk][cls][name] = {};
        for (var dk in source[mk][cls][name]) {
          target[mk][cls][name][dk] = source[mk][cls][name][dk];
        }
      }
    }
  }
}

function saveCurrentListeningWeek() {
  const monday = getWeekMonday(weekOffset);
  saveListening(monday, getOrCreateListening(monday));
}

function mergeImportChanges(changes) {
  // changes: { mondayISO: { cls: { name: { dk: minutes } } } }
  for (var mondayKey in changes) {
    var mon = new Date(mondayKey + 'T00:00:00');
    if (isNaN(mon.getTime())) continue;
    var data = getOrCreateListening(mon);
    for (var cls in changes[mondayKey]) {
      if (!data[cls]) data[cls] = {};
      for (var name in changes[mondayKey][cls]) {
        if (!data[cls][name]) data[cls][name] = { mon:0,tue:0,wed:0,thu:0,fri:0,sat:0,sun:0 };
        for (var dk in changes[mondayKey][cls][name]) {
          data[cls][name][dk] = Math.max(data[cls][name][dk] || 0, changes[mondayKey][cls][name][dk]);
        }
      }
    }
    saveListening(mon, data);
  }
}

function autoNavigateToWeek(dateStrs, changes) {
  // Save ALL weeks present in changes
  mergeImportChanges(changes);

  // Navigate to the week with the MOST records (not earliest date)
  // because a file spanning Sun-Mon would have Sun in prev week but most data in current week
  var weekCounts = {};
  for (var mk in changes) {
    var total = 0;
    for (var cls in changes[mk]) for (var nm in changes[mk][cls]) for (var dk in changes[mk][cls][nm]) total++;
    weekCounts[mk] = total;
  }
  var bestMonday = null;
  var bestCount = 0;
  for (var mk in weekCounts) {
    if (weekCounts[mk] > bestCount) {
      bestCount = weekCounts[mk];
      bestMonday = mk;
    }
  }
  if (!bestMonday) return;

  var targetMon = new Date(bestMonday + 'T00:00:00');
  if (isNaN(targetMon.getTime())) return;

  var curMonday = getWeekMonday(weekOffset);
  if (targetMon.getTime() === curMonday.getTime()) return;

  var curWeekMonday = getWeekMonday(0);
  var diffDays = (targetMon.getTime() - curWeekMonday.getTime()) / 86400000;
  weekOffset = Math.round(diffDays / 7);

  var weeksCount = Object.keys(changes).length;
  var msg = weeksCount > 1
    ? '已导入 ' + weeksCount + ' 周数据，定位到数据最多的一周 ' + formatWeekRange(targetMon)
    : '已自动定位到 ' + formatWeekRange(targetMon);
  toast(msg);
}

// ╔══════════════════════════════════════════╗
// ║       DEBUG UTILITIES                   ║
// ╚══════════════════════════════════════════╝

// Debug: dump listening data for a specific student
// Usage in console: debugStudent('杨栩')
window.debugStudent = function(name) {
  const weeks = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX + 'L-')) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        for (const cls in data) {
          if (data[cls][name]) {
            weeks.push({ week: k, cls, data: data[cls][name] });
          }
        }
      } catch(e) {}
    }
  }
  if (weeks.length === 0) { console.log('No data found for:', name); return; }
  weeks.forEach(w => console.log(w.week, w.cls, JSON.stringify(w.data)));
};

// Debug: dump all listening keys
window.debugListeningKeys = function() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX + 'L-')) keys.push(k);
  }
  console.log('All listening keys:', keys.sort());
};

// ╔══════════════════════════════════════════╗
// ║       TOAST & UI UTILITIES              ║
// ╚══════════════════════════════════════════╝

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function showCoinCelebration(studentName) {
  // Remove any existing celebration
  const old = document.getElementById('coinCelebration');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'coinCelebration';
  overlay.className = 'coin-celebration-overlay';

  // Particles
  const particles = document.createElement('div');
  particles.className = 'coin-particles';
  const emojis = ['🪙','⭐','✨','🎉','🌟','💛'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('span');
    p.className = 'coin-particle';
    p.textContent = emojis[i % emojis.length];
    const angle = (i / 12) * 360;
    const dist = 120 + Math.random() * 80;
    const rad = angle * Math.PI / 180;
    p.style.setProperty('--tx', Math.cos(rad) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(rad) * dist - 60 + 'px');
    p.style.left = '50%';
    p.style.top = '50%';
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    particles.appendChild(p);
  }
  overlay.appendChild(particles);

  // Card
  const card = document.createElement('div');
  card.className = 'coin-celebration-card';
  card.innerHTML = '<div class="coin-big">🪙</div>'
    + '<div class="coin-title">小金币 GET！</div>'
    + '<div class="coin-sub">' + escHtml(studentName) + ' 两节课视频全部提交 ✅<br>连续完成 · 超级棒 🌟</div>';
  overlay.appendChild(card);

  // Click to dismiss
  overlay.addEventListener('click', () => {
    card.style.animation = 'coinCardOut .3s ease forwards';
    setTimeout(() => overlay.remove(), 300);
  });

  document.body.appendChild(overlay);

  // Auto dismiss after 2.8s
  clearTimeout(window._coinTimer);
  window._coinTimer = setTimeout(() => {
    if (overlay.parentNode) {
      card.style.animation = 'coinCardOut .3s ease forwards';
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300);
    }
  }, 2800);
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', false));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', false));

  const tabMap = ['listening', 'video', 'ranking', 'report', 'attendance', 'calendar'];
  const idx = tabMap.indexOf(tab);
  if (idx >= 0) document.querySelectorAll('.tab-btn')[idx].classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');

  renderHeader();
  if (tab === 'listening') renderListening();
  else if (tab === 'video') renderVideo();
  else if (tab === 'ranking') renderRanking();
  else if (tab === 'report') renderReport();
  else if (tab === 'attendance') renderAttendance();
  else if (tab === 'calendar') renderWeeklyBoard();
}

function renderHeader() {
  const hc = document.getElementById('headerControls');
  if (currentTab === 'listening') {
    const monday = getWeekMonday(weekOffset);
    hc.innerHTML = '<div class="week-nav"><button onclick="prevWeekL()">◀</button>'
      + '<span class="week-label">' + formatWeekRange(monday) + '</span>'
      + '<button onclick="nextWeekL()">▶</button>'
      + (weekOffset !== 0 ? '<button onclick="goTodayL()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周</button>' : '')
      + '</div>'
      + '<select id="classFilter" onchange="renderListening()"><option value="all">全部班级</option>'
      + Object.keys(CLASSES).map(c => '<option value="' + c + '">' + c + '</option>').join('') + '</select>'
      + '<button class="btn btn-outline" onclick="triggerImportExcel()">📂 导入 Excel</button>'
      + '<button class="btn btn-outline" onclick="exportAllBackup()">↓ 备份</button>'
      + '<button class="btn btn-outline" onclick="importBackup()">↑ 恢复</button>'
      + '<button class="btn-ghost" onclick="resetListeningWeek()">↺ 重置</button>';
  } else if (currentTab === 'video') {
    const todayCycleAnchor = getCurrentCycleAnchor();
    hc.innerHTML = '<div class="week-nav"><button onclick="prevWeekV()">◀</button>'
      + '<span class="week-label">' + fmtCycleRange(currentVideoCycle, currentClass) + '</span>'
      + '<button onclick="nextWeekV()">▶</button>'
      + (currentVideoCycle !== todayCycleAnchor ? '<button onclick="goTodayV()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本期</button>' : '')
      + '</div>';
  } else if (currentTab === 'ranking') {
    hc.innerHTML = '<div class="week-nav"><button onclick="prevWeekR()">◀</button>'
      + '<span class="week-label">' + formatRankingWeekLabel(rankingWeekOffset) + '</span>'
      + '<button onclick="nextWeekR()">▶</button>'
      + (rankingWeekOffset !== 0 ? '<button onclick="goTodayR()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周</button>' : '')
      + '</div>';
  } else if (currentTab === 'report') {
    hc.innerHTML = '<span style="font-size:.82rem;color:var(--text-soft)">周报: 上周日 ~ 本周六</span>';
  } else if (currentTab === 'calendar') {
    const range = getISOWeekRange(currentVideoWeek);
    const todayWeek = getISOWeekKey(new Date());
    hc.innerHTML = '<div class="week-nav"><button onclick="prevWeekV()">◀</button>'
      + '<span class="week-label">' + range.label + '</span>'
      + '<button onclick="nextWeekV()">▶</button>'
      + (currentVideoWeek !== todayWeek ? '<button onclick="goTodayV()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周</button>' : '')
      + '</div>';
  } else {
    const mondayA = getWeekMonday(attWeekOffset);
    hc.innerHTML = '<div class="week-nav"><button onclick="prevWeekA()">◀</button>'
      + '<span class="week-label">' + formatWeekRange(mondayA) + '</span>'
      + '<button onclick="nextWeekA()">▶</button>'
      + (attWeekOffset !== 0 ? '<button onclick="goTodayA()" style="font-size:.72rem;width:auto;padding:0 10px;font-weight:600">本周</button>' : '')
      + '</div>';
  }
}

function renderAll() {
  renderHeader();
  if (currentTab === 'listening') renderListening();
  else if (currentTab === 'video') renderVideo();
  else if (currentTab === 'ranking') renderRanking();
  else if (currentTab === 'report') renderReport();
  else if (currentTab === 'attendance') renderAttendance();
  else if (currentTab === 'calendar') renderWeeklyBoard();
}

// ─── Monthly Heatmap ───

function showHeatmap(className, studentName, btn) {
  const today = new Date(); today.setHours(0,0,0,0);
  const cfg = getStudentCfg(className, studentName);
  const sourceName = (cfg && cfg.syncWith) ? cfg.syncWith : studentName;

  // Build 4 weeks: W-3, W-2, 上周, 本周
  const weekLabels = ['W-3', 'W-2', '上周', '本周'];
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const mon = getWeekMonday(-w);
    const data = getOrCreateListening(mon);
    weeks.push({ label: weekLabels[3 - w], mon: dateStr(mon), data });
  }

  const DAY_LABELS_SHORT = ['周一','周二','周三','周四','周五','周六','周日'];

  let totalMin = 0, totalDays = 0, totalMetDays = 0, maxStreak = 0, currStreak = 0;
  let rowsHtml = '';

  weeks.forEach(function(wk) {
    const refMonday = new Date(wk.mon + 'T00:00:00');
    let cellsHtml = '';
    DAY_KEYS.forEach(function(k, di) {
      const dayDate = new Date(refMonday);
      dayDate.setDate(refMonday.getDate() + di);
      dayDate.setHours(0,0,0,0);
      const isFuture = dayDate.getTime() > today.getTime();
      const isToday = dayDate.getTime() === today.getTime();

      const v = (wk.data[className] && wk.data[className][sourceName])
        ? (wk.data[className][sourceName][k] || 0) : 0;

      let label = isToday ? '今天' : DAY_LABELS_SHORT[di];
      let cls, tag;
      if (isFuture) { cls = 'future'; tag = ''; }
      else if (isToday && v < TARGET) { cls = 'today-pending'; tag = v > 0 ? '差' + (TARGET - v) : '待打'; }
      else if (v >= TARGET) { cls = 'met'; tag = '✓'; }
      else if (v > 0) { cls = 'unmet'; tag = '差' + (TARGET - v); }
      else { cls = 'unmet'; tag = '未打'; }

      if (!isFuture) {
        totalMin += v;
        if (v > 0) { totalDays++; currStreak++; maxStreak = Math.max(maxStreak, currStreak); }
        else currStreak = 0;
        if (v >= TARGET) totalMetDays++;
      }

      cellsHtml += '<div class="day-cell"><div class="day-box ' + cls + '">'
        + '<span class="day-label">' + label + '</span>'
        + '<span class="day-val">' + (isFuture ? '--' : (v > 0 ? v : '--')) + '</span>'
        + '<span class="day-tag">' + tag + '</span></div></div>';
    });
    rowsHtml += '<div class="hm-week-row">'
      + '<span class="hm-week-label">' + wk.label + '</span>'
      + '<div class="hm-week-cells">' + cellsHtml + '</div></div>';
  });

  const cardHtml = '<div class="hm-header"><div class="hm-title">🔥 ' + escHtml(studentName)
    + '<span class="hm-class">' + className + '</span></div>'
    + '<div style="display:flex;align-items:center;gap:4px">'
    + '<button class="hm-download-btn" title="下载" onclick="downloadHeatmap()">⬇️</button>'
    + '<button class="hm-close" onclick="closeHeatmap()">✕</button></div></div>'
    + '<div class="hm-body">'
    + rowsHtml
    + '<div class="hm-stats">'
    + '<div class="hm-stat"><div class="hm-stat-val">' + totalMin + '<span class="unit"> min</span></div><div class="hm-stat-lbl">总分钟</div></div>'
    + '<div class="hm-stat"><div class="hm-stat-val">' + totalDays + '<span class="unit"> 天</span></div><div class="hm-stat-lbl">打卡天数</div></div>'
    + '<div class="hm-stat"><div class="hm-stat-val">' + totalMetDays + '<span class="unit"> 天</span></div><div class="hm-stat-lbl">达标天数</div></div>'
    + '<div class="hm-stat"><div class="hm-stat-val">' + maxStreak + '<span class="unit"> 天</span></div><div class="hm-stat-lbl">最长连续</div></div>'
    + '</div></div>';

  document.getElementById('heatmapCard').innerHTML = cardHtml;
  document.getElementById('heatmapOverlay').classList.remove('hidden');
}

function closeHeatmap(e) {
  if (e && e.target !== document.getElementById('heatmapOverlay')) return;
  document.getElementById('heatmapOverlay').classList.add('hidden');
}

function downloadHeatmap() {
  const card = document.getElementById('heatmapCard');
  const overlay = document.getElementById('heatmapOverlay');
  overlay.style.background = 'white';
  overlay.style.backdropFilter = 'none';
  html2canvas(card, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
    overlay.style.background = '';
    overlay.style.backdropFilter = '';
    const link = document.createElement('a');
    link.download = 'heatmap-' + new Date().toISOString().slice(0,10) + '.png';
    link.href = canvas.toDataURL();
    link.click();
  }).catch(() => {
    overlay.style.background = '';
    overlay.style.backdropFilter = '';
  });
}

// ╔══════════════════════════════════════════╗
// ║  VIDEO TAB: TEMPLATE TRACKING          ║
// ╚══════════════════════════════════════════╝

function renderTemplateTracking(className, weekKey) {
  const data = getTemplateTracking(className, weekKey);
  const nlCardDone = !!data.cardPublished;
  const nlVideoDone = !!data.videoRecorded;
  const rvCardDone = !!data.rvCardPublished;
  const rvVideoDone = !!data.rvVideoRecorded;
  const allDone = nlCardDone && nlVideoDone && rvCardDone && rvVideoDone;

  const range = getISOWeekRange(weekKey);
  const weekSat = new Date(range.mon);
  weekSat.setDate(range.mon.getDate() + 5);
  const cls = getSchedule(className, weekSat);
  const nlLabel = ['周日','周一','周二','周三','周四','周五','周六'][cls.newLessonDay];
  const rvLabel = ['周日','周一','周二','周三','周四','周五','周六'][cls.reviewDay];

  const fmtPublished = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return (+m) + '月' + (+d) + '日';
  };

  let html = '<div class="tpl-tracker">'
    + '<div class="tpl-tracker-title">📋 发布追踪</div>';

  // ── New Lesson group ──
  html += '<div class="tpl-group-label">🆕 新课（' + nlLabel + '）</div>';

  html += '<div class="tpl-row ' + (nlCardDone ? 'done' : 'pending') + '">'
    + '<span class="tpl-icon">📝</span>'
    + '<span class="tpl-label">复述提示卡</span>'
    + (nlCardDone
      ? '<span class="tpl-status">✅ 已发布</span><span class="tpl-date">' + fmtPublished(data.cardPublished) + '</span>'
        + '<button class="tpl-btn undo" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'cardPublished\')">撤销</button>'
      : '<span class="tpl-status">⏳ 待发布</span>'
        + '<button class="tpl-btn mark" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'cardPublished\')">标记已发</button>')
    + '</div>';

  html += '<div class="tpl-row ' + (nlVideoDone ? 'done' : 'pending') + '">'
    + '<span class="tpl-icon">🎬</span>'
    + '<span class="tpl-label">复述视频模板</span>'
    + (nlVideoDone
      ? '<span class="tpl-status">✅ 已录制</span><span class="tpl-date">' + fmtPublished(data.videoRecorded) + '</span>'
        + '<button class="tpl-btn undo" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'videoRecorded\')">撤销</button>'
      : '<span class="tpl-status">⏳ 待录制</span>'
        + '<button class="tpl-btn mark" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'videoRecorded\')">标记已录</button>')
    + '</div>';

  // ── Review Lesson group ──
  html += '<div class="tpl-group-label">📝 复习课（' + rvLabel + '）</div>';

  html += '<div class="tpl-row ' + (rvCardDone ? 'done' : 'pending') + '">'
    + '<span class="tpl-icon">📝</span>'
    + '<span class="tpl-label">复述提示卡</span>'
    + (rvCardDone
      ? '<span class="tpl-status">✅ 已发布</span><span class="tpl-date">' + fmtPublished(data.rvCardPublished) + '</span>'
        + '<button class="tpl-btn undo" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'rvCardPublished\')">撤销</button>'
      : '<span class="tpl-status">⏳ 待发布</span>'
        + '<button class="tpl-btn mark" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'rvCardPublished\')">标记已发</button>')
    + '</div>';

  html += '<div class="tpl-row ' + (rvVideoDone ? 'done' : 'pending') + '">'
    + '<span class="tpl-icon">🎬</span>'
    + '<span class="tpl-label">复述视频模板</span>'
    + (rvVideoDone
      ? '<span class="tpl-status">✅ 已录制</span><span class="tpl-date">' + fmtPublished(data.rvVideoRecorded) + '</span>'
        + '<button class="tpl-btn undo" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'rvVideoRecorded\')">撤销</button>'
      : '<span class="tpl-status">⏳ 待录制</span>'
        + '<button class="tpl-btn mark" onclick="toggleTemplateItem(\'' + className + '\',\'' + weekKey + '\',\'rvVideoRecorded\')">标记已录</button>')
    + '</div>';

  // All done celebration
  if (allDone) {
    html += '<div class="tpl-tracker-all-done">🎉 本周发布全部完成！可以安心准备新课啦~</div>';
  }

  html += '</div>';
  return html;
}


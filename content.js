// HANU TKB Preview - Content Script
const TABLE_SELECTOR = 'table.table-dk';
const OBSERVER_TIMEOUT = 10000;

// Source of truth: in-memory Map of course objects
let selectedCourses = new Map();
let tableObserver = null;
let debounce = null;

const SESSION_RE = /Thứ\s*(\d|Chủ\s*nhật)\s*,\s*tiết\s*(\d+)\s*->\s*(\d+)\s*,\s*(.+?)(?:\s*\(TH\))?\s*$/;

function parseDay(s) {
  if (s.includes('Chủ') || s.includes('nhật')) return 0;
  return parseInt(s.trim());
}

function parseSessions(html) {
  const parts = html.split(/<hr\s*\/?>/i);
  const out = [];
  for (const p of parts) {
    const tmp = document.createElement('div');
    tmp.innerHTML = p;
    const text = tmp.textContent.trim();
    if (!text) continue;
    const m = text.match(SESSION_RE);
    if (m) {
      out.push({
        day: parseDay(m[1]),
        start: parseInt(m[2]),
        end: parseInt(m[3]),
        dateRange: m[4].trim(),
        isTheory: !text.includes('(TH)')
      });
    }
  }
  return out;
}

function parseRow(row) {
  const scheduleCell = row.querySelector('td.tkb, td.col_400');
  if (!scheduleCell) return null;
  const cells = row.querySelectorAll('td');
  const courseCode = (cells[2]?.textContent || '').trim();
  const courseName = (cells[3]?.textContent || '').trim();
  const group      = (cells[4]?.textContent || '').trim();
  const to         = (cells[5]?.textContent || '').trim();
  const credits    = parseInt((cells[6]?.textContent || '').trim()) || 0;
  const sessions   = parseSessions(scheduleCell.innerHTML);
  const id = `${courseCode}_${group}_${to}`;
  return { id, courseCode, courseName, group, to, credits, sessions };
}

function getSelectedCourses() {
  return [...selectedCourses.values()];
}

function checkConflict(course) {
  const c = [];
  for (const e of selectedCourses.values()) {
    for (const ns of course.sessions) {
      for (const es of e.sessions) {
        if (ns.day === es.day && ns.start <= es.end && ns.end >= es.start) {
          c.push(`${e.courseCode} - ${e.courseName} (N${e.group}): Thứ ${ns.day}, Tiết ${Math.max(ns.start, es.start)}-${Math.min(ns.end, es.end)}`);
        }
      }
    }
  }
  return [...new Set(c)].join('\n') || null;
}

function syncToStorage() {
  const courses = [...selectedCourses.values()];
  chrome.storage.local.set({ selectedCourses: courses, lastUpdated: Date.now() });
  updateBadge(courses.length);
}

function updateBadge(count) {
  chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count }).catch(() => {});
}

// ---- Injection ----

function injectHeaderColumn(thead) {
  if (thead.querySelector('.hanu-hdr')) return;
  const rows = thead.querySelectorAll('tr');
  if (rows.length >= 2) {
    const th1 = document.createElement('th');
    th1.className = 'hanu-hdr';
    th1.style.cssText = 'position:sticky;top:0;z-index:2;background:#fff;width:3%;text-align:center;vertical-align:middle;';
    th1.textContent = 'Chọn';
    rows[0].prepend(th1);
    const th2 = document.createElement('th');
    th2.className = 'hanu-hdr';
    th2.style.cssText = 'position:sticky;top:34px;z-index:1;background:#fff;width:3%;';
    rows[1].prepend(th2);
  } else if (rows.length === 1) {
    const th = document.createElement('th');
    th.className = 'hanu-hdr';
    th.style.cssText = 'position:sticky;top:0;z-index:2;background:#fff;width:3%;text-align:center;vertical-align:middle;';
    th.textContent = 'Chọn';
    rows[0].prepend(th);
  }
}

function injectRowButton(row) {
  if (row.querySelector('.hanu-btn')) return;
  const td = document.createElement('td');
  td.style.cssText = 'text-align:center;vertical-align:middle;';
  const btn = document.createElement('button');
  btn.textContent = 'Chọn';
  btn.className = 'hanu-btn';
  btn.style.cssText = 'cursor:pointer;padding:2px 6px;font-size:11px;border:1px solid #07689F;border-radius:3px;background:#fff;color:#07689F;white-space:nowrap;';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isSel = row.getAttribute('data-hanu-selected') === 'true';
    const course = parseRow(row);
    if (isSel) {
      row.removeAttribute('data-hanu-selected');
      row.style.backgroundColor = '';
      btn.textContent = 'Chọn';
      btn.classList.remove('selected');
      if (course) selectedCourses.delete(course.id);
    } else {
      if (course) {
        const conflict = checkConflict(course);
        if (conflict) {
          if (!confirm(`Môn ${course.courseCode} - ${course.courseName} (Nhóm ${course.group}) bị trùng lịch với:\n\n${conflict}\n\nVẫn chọn?`)) return;
        }
        selectedCourses.set(course.id, course);
      }
      row.setAttribute('data-hanu-selected', 'true');
      row.style.backgroundColor = '#e8f4fd';
      btn.textContent = 'Bỏ';
      btn.classList.add('selected');
    }
    syncToStorage();
  });
  td.appendChild(btn);
  row.prepend(td);
}

function injectAllRows(table) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(r => injectRowButton(r));
  restoreVisualSelection(table);
}

// Restore visual state on visible rows only — does NOT touch storage
function restoreVisualSelection(table) {
  if (selectedCourses.size === 0) return;
  table.querySelectorAll('tbody tr').forEach(row => {
    const p = parseRow(row);
    if (p && selectedCourses.has(p.id)) {
      row.setAttribute('data-hanu-selected', 'true');
      row.style.backgroundColor = '#e8f4fd';
      const btn = row.querySelector('.hanu-btn');
      if (btn) { btn.textContent = 'Bỏ'; btn.classList.add('selected'); }
    }
  });
}

function observeTable(table) {
  if (tableObserver) tableObserver.disconnect();
  clearTimeout(debounce);

  const thead = table.querySelector('thead');
  if (thead) injectHeaderColumn(thead);
  injectAllRows(table);

  const wrapper = table.closest('.table-responsive-lg') || table.parentElement;
  tableObserver = new MutationObserver(() => {
    tableObserver.disconnect();
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      injectAllRows(table);
      tableObserver.observe(wrapper, { childList: true, subtree: true });
    }, 150);
  });
  tableObserver.observe(wrapper, { childList: true, subtree: true });
}

async function loadFromStorage() {
  const data = await chrome.storage.local.get(['selectedCourses']);
  if (data.selectedCourses) {
    selectedCourses = new Map(data.selectedCourses.map(c => [c.id, c]));
    console.log('[HANU] Loaded ' + selectedCourses.size + ' courses from storage');
  }
}

function init() {
  loadFromStorage().then(() => {
    const table = document.querySelector(TABLE_SELECTOR);
    if (table && table.querySelector('tbody tr')) {
      observeTable(table);
      return;
    }
    let timeout;
    const obs = new MutationObserver(() => {
      const t = document.querySelector(TABLE_SELECTOR);
      if (t && t.querySelector('tbody tr')) {
        observeTable(t);
        obs.disconnect();
        clearTimeout(timeout);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    timeout = setTimeout(() => {
      obs.disconnect();
      const t = document.querySelector(TABLE_SELECTOR);
      if (t) observeTable(t);
    }, OBSERVER_TIMEOUT);
  });
}

// SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(init, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });

// Messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SELECTED_COURSES') {
    sendResponse({ courses: [...selectedCourses.values()] });
  } else if (msg.type === 'REMOVE_COURSE') {
    selectedCourses.delete(msg.courseId);
    document.querySelectorAll('tr[data-hanu-selected="true"]').forEach(row => {
      const p = parseRow(row);
      if (p && p.id === msg.courseId) {
        row.removeAttribute('data-hanu-selected');
        row.style.backgroundColor = '';
        const btn = row.querySelector('.hanu-btn');
        if (btn) { btn.textContent = 'Chọn'; btn.classList.remove('selected'); }
      }
    });
    syncToStorage();
    sendResponse({ ok: true });
  } else if (msg.type === 'CLEAR_ALL') {
    selectedCourses.clear();
    document.querySelectorAll('tr[data-hanu-selected="true"]').forEach(row => {
      row.removeAttribute('data-hanu-selected');
      row.style.backgroundColor = '';
      const btn = row.querySelector('.hanu-btn');
      if (btn) { btn.textContent = 'Chọn'; btn.classList.remove('selected'); }
    });
    syncToStorage();
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: 0 }).catch(() => {});
    sendResponse({ ok: true });
  }
  return true;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

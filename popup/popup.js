// HANU TKB Preview - Schedule tab
const DAY_HEADERS = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const PERIOD_TIMES = [
  '5:30','6:20',  // Tiết 1-2 (Ca 1: 5:30-7:10)
  '7:10','7:55',  // Tiết 3-4
  '8:40',         // Tiết 5 (Ca 2: 7:10-9:15)
  '9:30','10:15', // Tiết 6-7
  '11:00',        // Tiết 8 (Ca 3: 9:30-11:35)
  '12:20','13:05',// Tiết 9-10
  '13:50',        // Tiết 11 (Ca 4: 12:20-14:25)
  '14:40','15:25',// Tiết 12-13 (Ca 5: 14:40-16:45)
];
const PERIODS = PERIOD_TIMES.length;
const COURSE_COLORS = [
  '#e3f2fd','#fce4ec','#e8f5e9','#fff3e0','#f3e5f5',
  '#e0f7fa','#fff8e1','#f1f8e9','#ede7f6','#ffebee',
  '#e1f5fe','#f9fbe7','#efebe9','#e8eaf6','#fbe9e7'
];

let courses = [];
let colorMap = {};
let weekOffset = 0;

function parseDate(s) { const [d,m,y]=s.split('/').map(Number); return new Date(2000+y,m-1,d); }
function getMonday(d) { d=new Date(d); const day=d.getDay(); d.setDate(d.getDate()+(day===0?-6:1-day)); d.setHours(0,0,0,0); return d; }
function fmt(d) { return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function dayToIdx(day) { return day===0?0:day-1; }

function sessionDates(dateRange) {
  const m = dateRange.match(/(\d{2}\/\d{2}\/\d{2})/g);
  if (!m) return null;
  return { start: parseDate(m[0]), end: m.length>=2 ? parseDate(m[1]) : parseDate(m[0]) };
}

function inWeek(session, monday) {
  const sun = new Date(monday); sun.setDate(sun.getDate()+6); sun.setHours(23,59,59,999);
  const d = sessionDates(session.dateRange);
  if (!d) return true;
  return d.start <= sun && d.end >= monday;
}

function weekLabel(m) { return `${fmt(m)} - ${fmt(new Date(+m+6*86400000))}`; }

function getColor(id) {
  if (!colorMap[id]) colorMap[id] = COURSE_COLORS[Object.keys(colorMap).length % COURSE_COLORS.length];
  return colorMap[id];
}

function buildGrid() {
  const mon = getMonday(new Date()); mon.setDate(mon.getDate()+weekOffset*7);
  const grid = Array.from({length:PERIODS}, () => Array.from({length:7}, () => []));
  for (const c of courses) {
    for (const s of c.sessions) {
      if (!inWeek(s, mon)) continue;
      const di = dayToIdx(s.day);
      for (let p = s.start; p <= s.end; p++) {
        const pi = p-1;
        if (pi>=0 && pi<PERIODS && di>=0 && di<7) grid[pi][di].push({course:c, session:s});
      }
    }
  }
  return grid;
}

function conflicts(grid) {
  const c = [];
  for (let p=0;p<PERIODS;p++) for (let d=0;d<7;d++) {
    const ids = new Set(grid[p][d].map(e=>e.course.id));
    if (ids.size>1) for (const id of ids) c.push({day:d,period:p+1,courseId:id});
  }
  return c;
}

function renderHeader() {
  const mon = getMonday(new Date()); mon.setDate(mon.getDate()+weekOffset*7);
  const thead = document.querySelector('#schedule-grid thead');
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  const th0 = document.createElement('th'); th0.innerHTML = 'Tiết<br><small>Giờ</small>'; tr.appendChild(th0);
  for (let d=0;d<7;d++) {
    const th = document.createElement('th');
    const dt = new Date(+mon + d*86400000);
    th.innerHTML = `${DAY_HEADERS[d]}<br><small>${fmt(dt)}</small>`;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
}

function renderGrid(grid, confl) {
  const cs = new Set(confl.map(c=>`${c.day}:${c.period}`));
  const tbody = document.querySelector('#schedule-grid tbody');
  tbody.innerHTML = '';
  for (let p=0;p<PERIODS;p++) {
    const tr = document.createElement('tr');
    const td0 = document.createElement('td');
    td0.innerHTML = `<b>${p+1}</b><br><small>${PERIOD_TIMES[p]}</small>`;
    tr.appendChild(td0);
    for (let d=0;d<7;d++) {
      const td = document.createElement('td');
      if (cs.has(`${d}:${p+1}`)) td.classList.add('tkb-trung');
      for (const e of grid[p][d]) td.appendChild(card(e.course, e.session));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function card(course, session) {
  const div = document.createElement('div');
  div.className = `course-card ${session.isTheory?'theory':'practice'}`;
  div.style.backgroundColor = getColor(course.id);
  div.title = `${course.courseName}\n${session.isTheory?'Lý thuyết':'Thực hành'}\n${session.dateRange}`;
  const a=document.createElement('div');a.className='code';a.textContent=course.courseCode;
  const b=document.createElement('div');b.className='name';b.textContent=course.courseName.length>15?course.courseName.slice(0,13)+'..':course.courseName;
  const c=document.createElement('div');c.className='meta';c.textContent=`N${course.group}`;
  const x=document.createElement('button');x.className='remove-btn';x.textContent='✕';
  x.addEventListener('click',e=>{e.stopPropagation();removeCourse(course.id);});
  div.appendChild(a);div.appendChild(b);div.appendChild(c);div.appendChild(x);
  return div;
}

function updateUI() {
  const gc = document.getElementById('grid-container');
  const es = document.getElementById('empty-state');
  const wn = document.getElementById('week-nav');
  const cl = document.getElementById('course-list-section');
  if (!courses.length) {
    gc.classList.add('hidden');wn.classList.add('hidden');es.classList.remove('hidden');cl.classList.add('hidden');
    document.getElementById('total-credits').textContent='0 TC';
    const bar=document.getElementById('conflict-bar');if(bar)bar.classList.add('hidden');
    return;
  }
  gc.classList.remove('hidden');wn.classList.remove('hidden');es.classList.add('hidden');cl.classList.remove('hidden');
  const g=buildGrid();const cf=conflicts(g);
  renderHeader();renderGrid(g,cf);
  renderCourseList();
  const tc=courses.reduce((s,c)=>s+c.credits,0);
  document.getElementById('total-credits').textContent=`${tc} TC`;
  const mon=getMonday(new Date());mon.setDate(mon.getDate()+weekOffset*7);
  document.getElementById('week-label').textContent=weekLabel(mon);
  let bar=document.getElementById('conflict-bar');
  if(!cf.length){if(bar)bar.classList.add('hidden');}
  else{
    if(!bar){bar=document.createElement('div');bar.id='conflict-bar';document.getElementById('week-nav').after(bar);}
    bar.classList.remove('hidden');
    bar.innerHTML=`<strong>⚠ Trùng lịch</strong> ${cf.length} vị trí — ${[...new Set(cf.map(c=>c.courseId))].join(', ')}`;
  }
}

function renderCourseList() {
  const tbody = document.querySelector('#course-list tbody');
  tbody.innerHTML = '';
  document.getElementById('course-count').textContent = courses.length;

  const sorted = [...courses].sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  sorted.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${i + 1}</td>` +
      `<td><strong>${c.courseCode}</strong></td>` +
      `<td>${c.courseName}</td>` +
      `<td>${c.group}</td>` +
      `<td>${c.to || '-'}</td>` +
      `<td>${c.credits}</td>` +
      `<td>${c.sessions.map(s =>
        `<span class="sched-item${s.isTheory?'':' th'}">Thứ ${s.day===0?'CN':s.day} T${s.start}-${s.end}</span>`
      ).join('')}</td>` +
      `<td><button class="remove-btn" data-id="${c.id}">Bỏ</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeCourse(btn.dataset.id));
  });
}

async function loadFromStorage() {
  const d=await chrome.storage.local.get(['selectedCourses','lastUpdated']);
  if(d.selectedCourses){courses=d.selectedCourses;console.log('[HANU Tab] Loaded '+courses.length+' courses');}
  updateUI();
}

async function sync() {
  try {
    const tabs=await chrome.tabs.query({url:'*://qldt.hanu.edu.vn/*'});
    if(!tabs.length)return;
    const resp=await chrome.tabs.sendMessage(tabs[0].id,{type:'GET_SELECTED_COURSES'});
    if(resp&&Array.isArray(resp.courses)){courses=resp.courses;colorMap={};updateUI();}
  }catch(e){console.log('[HANU Tab] Sync err:',e.message);}
}

async function removeCourse(id) {
  courses=courses.filter(c=>c.id!==id);
  await chrome.storage.local.set({selectedCourses:courses,lastUpdated:Date.now()});
  try{const tabs=await chrome.tabs.query({url:'*://qldt.hanu.edu.vn/*'});if(tabs.length)await chrome.tabs.sendMessage(tabs[0].id,{type:'REMOVE_COURSE',courseId:id});}catch(e){}
  updateUI();
}

async function clearAll() {
  courses=[];
  await chrome.storage.local.set({selectedCourses:[],lastUpdated:Date.now()});
  try{const tabs=await chrome.tabs.query({url:'*://qldt.hanu.edu.vn/*'});if(tabs.length)await chrome.tabs.sendMessage(tabs[0].id,{type:'CLEAR_ALL'});}catch(e){}
  colorMap={};updateUI();
}

// Real-time: listen for storage changes from content script
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.selectedCourses) return;
  courses = changes.selectedCourses.newValue || [];
  colorMap = {};
  updateUI();
});

document.addEventListener('DOMContentLoaded', async () => {
  renderHeader();
  await loadFromStorage();
  await sync();
  document.getElementById('refresh-btn').addEventListener('click',async()=>{colorMap={};await sync();});
  document.getElementById('clear-btn').addEventListener('click',clearAll);
  document.getElementById('prev-week').addEventListener('click',()=>{weekOffset--;updateUI();});
  document.getElementById('next-week').addEventListener('click',()=>{weekOffset++;updateUI();});
  document.getElementById('today-week').addEventListener('click',()=>{weekOffset=0;updateUI();});
});

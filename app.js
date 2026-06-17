import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

/*
  Firebase 콘솔에서 받은 설정값으로 바꾸세요.
*/
const firebaseConfig = {
  apiKey: "AIzaSyCW6yPDqLBO2LlwaKiFqyIWaI-1kJE7KLo",
  authDomain: "dept-calendar-46b13.firebaseapp.com",
  projectId: "dept-calendar-46b13",
  storageBucket: "dept-calendar-46b13.firebasestorage.app",
  messagingSenderId: "699179778789",
  appId: "1:699179778789:web:cb97b527a1a1f743db4a0c"
};

/*
  만년형 설정
*/
const MIN_YEAR = 2026;
const MAX_YEAR = 2100;

const savedYear = Number(localStorage.getItem("selectedYear"));
let selectedYear =
  savedYear && savedYear >= MIN_YEAR && savedYear <= MAX_YEAR
    ? savedYear
    : Math.min(MAX_YEAR, Math.max(MIN_YEAR, new Date().getFullYear()));

/*
  부서 일정표 ID입니다.
  나중에 여러 부서용으로 만들고 싶으면 이 값을 부서별로 다르게 쓰면 됩니다.
*/
const DEPT_ID = "monthly-inspection-plan";

let HOLIDAYS = {};

const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentView = "year";
let events = [];
let memos = {};
let selectedDate = null;
let editingEventId = null;

let unsubscribeEvents = null;
let unsubscribeMemos = null;

const appEl = document.getElementById("app");
const tabsEl = document.getElementById("tabs");

const dayDialog = document.getElementById("dayDialog");
const dialogTitle = document.getElementById("dialogTitle");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const cancelDialogBtn = document.getElementById("cancelDialogBtn");
const resetEventBtn = document.getElementById("resetEventBtn");
const saveEventBtn = document.getElementById("saveEventBtn");
const eventTitleEl = document.getElementById("eventTitle");
const eventMemoEl = document.getElementById("eventMemo");
const dayEventListEl = document.getElementById("dayEventList");

closeDialogBtn.addEventListener("click", closeDayDialog);
cancelDialogBtn.addEventListener("click", closeDayDialog);
resetEventBtn.addEventListener("click", resetEventForm);

saveEventBtn.addEventListener("click", async () => {
  if (!selectedDate) return;

  const title = eventTitleEl.value.trim();
  const memo = eventMemoEl.value.trim();

  if (!title) {
    alert("일정 내용을 입력하세요.");
    return;
  }

  const data = {
    date: selectedDate,
    title,
    memo
  };

  if (editingEventId) {
    await updateDoc(
      doc(db, "departments", DEPT_ID, "events", editingEventId),
      data
    );
  } else {
    await addDoc(collection(db, "departments", DEPT_ID, "events"), data);
  }

  resetEventForm();
});

init();

async function init() {
  await loadHolidays();
  renderTabs();
  startRealtimeListeners();
}

function getExtraMarkDays(year) {
  return {
    [`${year}-05-01`]: "근로자의 날",
    [`${year}-07-17`]: "제헌절"

    /*
      회사 자체 표시일이 있으면 아래처럼 추가하세요.

      [`${year}-11-15`]: "회사 창립기념일",
      [`${year}-12-31`]: "종무식"
    */
  };
}

async function loadHolidays() {
  try {
    const res = await fetch(`./holidays-${selectedYear}.json?ts=${Date.now()}`);

    if (!res.ok) {
      throw new Error(`${selectedYear}년 공휴일 JSON 파일을 불러오지 못했습니다.`);
    }

    HOLIDAYS = await res.json();

    HOLIDAYS = {
      ...HOLIDAYS,
      ...getExtraMarkDays(selectedYear)
    };
  } catch (error) {
    console.error(error);

    HOLIDAYS = {
      ...getExtraMarkDays(selectedYear)
    };
  }
}

function startRealtimeListeners() {
  stopRealtimeListeners();

  const eventQuery = query(
    collection(db, "departments", DEPT_ID, "events"),
    where("date", ">=", `${selectedYear}-01-01`),
    where("date", "<=", `${selectedYear}-12-31`),
    orderBy("date")
  );

  unsubscribeEvents = onSnapshot(eventQuery, snapshot => {
    events = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    render();

    if (selectedDate) {
      renderDayDialogContent();
    }
  });

  unsubscribeMemos = onSnapshot(
    collection(db, "departments", DEPT_ID, "memos"),
    snapshot => {
      memos = {};

      snapshot.docs.forEach(docSnap => {
        memos[docSnap.id] = docSnap.data().text || "";
      });

      render();
    }
  );
}

function stopRealtimeListeners() {
  if (unsubscribeEvents) unsubscribeEvents();
  if (unsubscribeMemos) unsubscribeMemos();

  unsubscribeEvents = null;
  unsubscribeMemos = null;
  events = [];
  memos = {};
}

function renderTabs() {
  let html = `
    <button id="prevYearBtn" class="year-btn">◀ 이전년</button>
    <button class="year-label">${selectedYear}년</button>
    <button id="nextYearBtn" class="year-btn">다음년 ▶</button>
    <button data-view="year">연간보기</button>
  `;

  for (let m = 1; m <= 12; m++) {
    html += `<button data-view="${m}">${m}월</button>`;
  }

  tabsEl.innerHTML = html;

  document.getElementById("prevYearBtn").addEventListener("click", async () => {
    if (selectedYear <= MIN_YEAR) {
      alert(`${MIN_YEAR}년 이전은 사용하지 않도록 설정되어 있습니다.`);
      return;
    }

    selectedYear--;
    await changeYear();
  });

  document.getElementById("nextYearBtn").addEventListener("click", async () => {
    if (selectedYear >= MAX_YEAR) {
      alert(`${MAX_YEAR}년 이후는 사용하지 않도록 설정되어 있습니다.`);
      return;
    }

    selectedYear++;
    await changeYear();
  });

  tabsEl.querySelectorAll("button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.view;
      currentView = value === "year" ? "year" : Number(value);
      render();
    });
  });

  markActiveTab();
}

async function changeYear() {
  localStorage.setItem("selectedYear", String(selectedYear));

  selectedDate = null;
  editingEventId = null;

  await loadHolidays();
  renderTabs();
  startRealtimeListeners();
}

function markActiveTab() {
  tabsEl.querySelectorAll("button[data-view]").forEach(btn => {
    const value = btn.dataset.view;
    const isActive =
      currentView === "year"
        ? value === "year"
        : Number(value) === currentView;

    btn.classList.toggle("active", isActive);
  });
}

function render() {
  markActiveTab();

  if (currentView === "year") {
    renderYearView();
  } else {
    renderMonthView(currentView);
  }
}

function renderYearView() {
  let html = `
    <section class="month-title">
      <div>
        <h2>${selectedYear}년 연간보기</h2>
        <small>각 월을 클릭하면 월별 달력으로 이동합니다.</small>
      </div>
    </section>

    <section class="year-grid">
  `;

  for (let m = 1; m <= 12; m++) {
    html += renderMiniMonth(m);
  }

  html += `</section>`;

  appEl.innerHTML = html;

  appEl.querySelectorAll(".mini-month").forEach(el => {
    el.addEventListener("click", () => {
      currentView = Number(el.dataset.month);
      render();
    });
  });
}

function renderMiniMonth(month) {
  const startDate = getCalendarStartDate(selectedYear, month);
  let d = new Date(startDate);

  let html = `
    <article class="mini-month" data-month="${month}">
      <h3>${month}월</h3>
      <div class="mini-calendar">
  `;

  ["일", "월", "화", "수", "목", "금", "토"].forEach(w => {
    html += `<div class="mini-weekday">${w}</div>`;
  });

  for (let i = 0; i < 42; i++) {
    const dateKey = formatDate(d);
    const outside = d.getMonth() !== month - 1;
    const hasEvent = getEventsByDate(dateKey).length > 0;
    const hasHoliday = Boolean(HOLIDAYS[dateKey]);

    const classes = [
      "mini-day",
      outside ? "outside" : "",
      hasEvent ? "has-event" : "",
      hasHoliday ? "holiday-day" : ""
    ].join(" ");

    html += `<div class="${classes}">${d.getDate()}</div>`;
    d.setDate(d.getDate() + 1);
  }

  html += `
      </div>
    </article>
  `;

  return html;
}

function renderMonthView(month) {
  const memoKey = `${selectedYear}-${pad(month)}`;
  const memoText = memos[memoKey] || "";

  let html = `
    <section class="month-title">
      <div>
        <h2>${selectedYear}년 ${month}월</h2>
        <small>일요일 시작 · 6주 표시 · 앞뒤 달 날짜 포함</small>
      </div>
    </section>

    <section class="calendar">
  `;

  WEEKDAYS.forEach((weekday, index) => {
    const cls = index === 0 ? "sun" : index === 6 ? "sat" : "";
    html += `<div class="weekday ${cls}">${weekday}</div>`;
  });

  const startDate = getCalendarStartDate(selectedYear, month);
  let d = new Date(startDate);

  for (let i = 0; i < 42; i++) {
    const dateKey = formatDate(d);
    const day = d.getDay();
    const outside = d.getMonth() !== month - 1;
    const dayEvents = getEventsByDate(dateKey);
    const holiday = HOLIDAYS[dateKey];

    const cls = [
      "day",
      outside ? "outside" : "",
      day === 0 ? "sun" : "",
      day === 6 ? "sat" : ""
    ].join(" ");

    html += `
      <div class="${cls}" data-date="${dateKey}">
        <div class="date-number">${d.getDate()}</div>
        ${holiday ? `<span class="holiday">${escapeHtml(holiday)}</span>` : ""}
        ${dayEvents.map(ev => `
          <span class="event">${escapeHtml(ev.title)}</span>
        `).join("")}
      </div>
    `;

    d.setDate(d.getDate() + 1);
  }

  html += `
    </section>

    <section class="memo-box">
      <h3>${month}월 메모</h3>
      <textarea id="monthMemo">${escapeHtml(memoText)}</textarea>
      <div class="memo-actions">
        <button id="saveMemoBtn">메모 저장</button>
      </div>
    </section>
  `;

  appEl.innerHTML = html;

  appEl.querySelectorAll(".day").forEach(dayEl => {
    dayEl.addEventListener("click", () => {
      openDayDialog(dayEl.dataset.date);
    });
  });

  document.getElementById("saveMemoBtn").addEventListener("click", async () => {
    const text = document.getElementById("monthMemo").value;

    await setDoc(
      doc(db, "departments", DEPT_ID, "memos", memoKey),
      { text },
      { merge: true }
    );

    alert("메모가 저장되었습니다.");
  });
}

function openDayDialog(dateKey) {
  selectedDate = dateKey;
  resetEventForm();
  renderDayDialogContent();
  dayDialog.showModal();
}

function closeDayDialog() {
  selectedDate = null;
  resetEventForm();
  dayDialog.close();
}

function resetEventForm() {
  editingEventId = null;
  eventTitleEl.value = "";
  eventMemoEl.value = "";
  saveEventBtn.textContent = "일정 저장";
}

function renderDayDialogContent() {
  if (!selectedDate) return;

  dialogTitle.textContent = `${selectedDate} 일정`;

  const dayEvents = getEventsByDate(selectedDate);
  const holiday = HOLIDAYS[selectedDate];

  let html = "";

  if (holiday) {
    html += `
      <div class="day-event-item">
        <div class="day-event-item-title">공휴일/기념일: ${escapeHtml(holiday)}</div>
      </div>
    `;
  }

  if (dayEvents.length === 0) {
    html += `<p class="subtitle">등록된 부서 일정이 없습니다.</p>`;
  } else {
    dayEvents.forEach(ev => {
      html += `
        <div class="day-event-item">
          <div class="day-event-item-title">${escapeHtml(ev.title)}</div>
          ${ev.memo ? `<div class="day-event-item-memo">${escapeHtml(ev.memo)}</div>` : ""}
          <div class="day-event-item-actions">
            <button class="edit edit-event-btn" data-id="${ev.id}">수정</button>
            <button class="danger delete-event-btn" data-id="${ev.id}">삭제</button>
          </div>
        </div>
      `;
    });
  }

  dayEventListEl.innerHTML = html;

  dayEventListEl.querySelectorAll(".edit-event-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = events.find(ev => ev.id === btn.dataset.id);

      if (!target) return;

      editingEventId = target.id;
      eventTitleEl.value = target.title || "";
      eventMemoEl.value = target.memo || "";
      saveEventBtn.textContent = "일정 수정";
    });
  });

  dayEventListEl.querySelectorAll(".delete-event-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = confirm("이 일정을 삭제할까요?");
      if (!ok) return;

      await deleteDoc(doc(db, "departments", DEPT_ID, "events", btn.dataset.id));

      if (editingEventId === btn.dataset.id) {
        resetEventForm();
      }
    });
  });
}

function getCalendarStartDate(year, month) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return start;
}

function getEventsByDate(dateKey) {
  return events.filter(ev => ev.date === dateKey);
}

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

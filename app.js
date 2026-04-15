// ---------- config ----------
const API_BASE = location.hostname === "localhost" ? "http://localhost:3000/api" : "/api";
const FALLBACK_STORAGE_KEY = "civicease_local_appointments";
let queueData = [];

// ---------- theme ----------
const themeBtn = document.getElementById("themeToggle");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    themeBtn.textContent = document.body.classList.contains("light") ? "🌙" : "☀️";
  });
}

// ---------- booking ----------
const form = document.getElementById("bookingForm");
const resultDiv = document.getElementById("result");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      service: document.getElementById("service").value,
      date: document.getElementById("date").value,
      time: document.getElementById("time").value
    };

    if (!payload.name || !payload.phone || !payload.service || !payload.date || !payload.time) {
      showResult("Please fill all fields", true);
      return;
    }

    try {
      const res = await fetch(API_BASE + "/book", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("server error");

      const data = await res.json();
      showResult(`Booked! Your queue number: ${data.queueNumber}. Confirmation SMS sent (or queued).`);
      form.reset();
      refreshQueue();
    } catch (err) {
      fallbackStore(payload);
      showResult("Saved locally (offline). The appointment will be synced when backend is available.", false);
    }
  });
}

function showResult(msg, isError = false) {
  if (!resultDiv) {
    alert(msg);
    return;
  }

  resultDiv.classList.remove("hidden");
  resultDiv.style.borderLeft = isError ? "4px solid #ff6b6b" : "4px solid var(--accent-2)";
  resultDiv.innerText = msg;
  setTimeout(() => resultDiv.classList.add("hidden"), 10000);
}

function fallbackStore(appt) {
  const arr = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
  appt.createdAt = new Date().toISOString();
  arr.push(appt);
  localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(arr));
}

// ---------- search ----------
const searchInput = document.getElementById("search");
const queueList = document.getElementById("queueList");
const refreshBtn = document.getElementById("refreshQueue");
const callNextBtn = document.getElementById("callNext");

if (searchInput) {
  searchInput.addEventListener("input", async () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!queueList) return;
    if (!q) {
      renderQueue(queueData);
      return;
    }

    try {
      const res = await fetch(API_BASE + "/search?q=" + encodeURIComponent(q));
      const data = await res.json();
      renderQueue(data);
    } catch (err) {
      const filtered = queueData.filter(item =>
        Object.values(item)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
      renderQueue(filtered);
    }
  });
}

function renderQueue(list) {
  if (!queueList) return;

  queueList.innerHTML = "";
  if (!list || !list.length) {
    queueList.innerHTML = "<li>No appointments</li>";
    return;
  }

  list.forEach((a, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<div>
      <strong>#${a.queueNumber || idx + 1}</strong> ${a.name} — ${a.service}<br>
      ${a.date} ${a.time} • ${a.phone}
    </div>
    <div>
      <button onclick="markServed('${a.id || ""}')">Mark Served</button>
    </div>`;
    queueList.appendChild(li);
  });
}

if (refreshBtn) refreshBtn.addEventListener("click", refreshQueue);
if (callNextBtn) callNextBtn.addEventListener("click", callNext);

async function refreshQueue() {
  if (!queueList) return;

  try {
    const res = await fetch(API_BASE + "/queue");
    const data = await res.json();
    queueData = data;
    renderQueue(queueData);
  } catch (err) {
    queueData = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
    renderQueue(queueData);
  }
}

async function callNext() {
  if (!queueList) return;

  try {
    const res = await fetch(API_BASE + "/callNext", { method: "POST" });
    const json = await res.json();
    alert(json.message || "Called next.");
    refreshQueue();
  } catch (err) {
    alert("Cannot reach server. In offline mode, just use the queue list.");
  }
}

async function markServed(id) {
  try {
    await fetch(API_BASE + "/served", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    refreshQueue();
  } catch (err) {
    alert("Server unreachable.");
  }
}

if (queueList) refreshQueue();

// ---------- config ----------
const API_BASE = location.hostname === "localhost" ? "http://localhost:3000/api" : "/api";
const FALLBACK_STORAGE_KEY = "civicease_local_appointments";

// ---------- theme ----------
const themeBtn = document.getElementById("themeToggle");
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light");
  themeBtn.textContent = document.body.classList.contains("light") ? "🌙" : "☀️";
});

// ---------- booking ----------
const form = document.getElementById("bookingForm");
const resultDiv = document.getElementById("result");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("name").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    service: document.getElementById("service").value,
    date: document.getElementById("date").value,
    time: document.getElementById("time").value
  };

  // Basic validation
  if (!payload.name || !payload.phone || !payload.service || !payload.date || !payload.time) {
    showResult("Please fill all fields", true);
    return;
  }

  // Try backend
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
    // fallback: store in localStorage
    fallbackStore(payload);
    showResult("Saved locally (offline). The appointment will be synced when backend is available.", false);
  }
});

function showResult(msg, isError=false){
  resultDiv.classList.remove("hidden");
  resultDiv.style.borderLeft = isError ? "4px solid #ff6b6b" : "4px solid var(--accent-2)";
  resultDiv.innerText = msg;
  setTimeout(()=> resultDiv.classList.add("hidden"), 10000);
}

// ---------- fallback local storage ----------
function fallbackStore(appt){
  const arr = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
  appt.createdAt = new Date().toISOString();
  arr.push(appt);
  localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(arr));
}

// ---------- search ----------
const searchInput = document.getElementById("search");
const resultsList = document.getElementById("resultsList");

searchInput.addEventListener("input", async () => {
  const q = searchInput.value.trim();
  if (!q) { resultsList.innerHTML = ""; return; }
  try {
    const res = await fetch(API_BASE + "/search?q=" + encodeURIComponent(q));
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    // fallback: search localStorage (offline)
    const arr = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
    const filtered = arr.filter(a => Object.values(a).join(" ").toLowerCase().includes(q.toLowerCase()));
    renderResults(filtered);
  }
});

function renderResults(items){
  resultsList.innerHTML = "";
  if (!items.length) { resultsList.innerHTML = "<li>No matches</li>"; return; }
  items.forEach(it => {
    const li = document.createElement("li");
    li.innerHTML = `<div>
      <strong>${it.name}</strong> — ${it.service}<br>
      ${it.date} ${it.time} • ${it.phone} • Queue: ${it.queueNumber || "—"}
    </div>`;
    resultsList.appendChild(li);
  });
}

// ---------- admin / queue ----------
const queueList = document.getElementById("queueList");
document.getElementById("refreshQueue").addEventListener("click", refreshQueue);
document.getElementById("callNext").addEventListener("click", callNext);

async function refreshQueue(){
  try {
    const res = await fetch(API_BASE + "/queue");
    const data = await res.json();
    renderQueue(data);
  } catch (err) {
    // fallback show local
    const arr = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
    renderQueue(arr);
  }
}

function renderQueue(list){
  queueList.innerHTML = "";
  if (!list.length) { queueList.innerHTML = "<li>No appointments</li>"; return; }
  list.forEach((a, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<div>
      <strong>#${a.queueNumber || (idx+1)}</strong> ${a.name} — ${a.service}<br>
      ${a.date} ${a.time} • ${a.phone}
    </div>
    <div>
      <button onclick="markServed('${a.id || ''}')">Mark Served</button>
    </div>`;
    queueList.appendChild(li);
  });
}

async function callNext(){
  try {
    const res = await fetch(API_BASE + "/callNext", { method:"POST" });
    const json = await res.json();
    alert(json.message || "Called next.");
    refreshQueue();
  } catch (err) {
    alert("Cannot reach server. In offline mode, just use the queue list.");
  }
}

async function markServed(id){
  try {
    await fetch(API_BASE + "/served", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id }) });
    refreshQueue();
  } catch (err) {
    alert("Server unreachable.");
  }
}

// initial load
refreshQueue();

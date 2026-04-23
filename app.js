const API_BASE = location.hostname === "localhost" ? "http://localhost:3000/api" : "/api";
const FALLBACK_STORAGE_KEY = "civicease_local_appointments";
const THEME_STORAGE_KEY = "civicease_theme";
const PROFILE_STORAGE_KEY = "civicease_profile";
const DEFAULT_VIEW = "home";
const SERVICE_DETAILS = [
  { name: "NIN Enrollment", eta: "8 min check-in" },
  { name: "Passport", eta: "Bring old ID" },
  { name: "Driver's License", eta: "Biometric capture" },
  { name: "Hospital OPD", eta: "Same-day slots" },
  { name: "Local Govt. Certificate", eta: "Approval required" },
  { name: "Certificate of Origin (Local Government)", eta: "Ward validation" },
  { name: "Birth Certificate (NPC)", eta: "NPC registry match" },
  { name: "Permanent Voter's Card (PVC)", eta: "BVN or slip check" }
];

const DEFAULT_PROFILE = {
  name: "Amara Okafor",
  email: "amara.okafor@civicease.app",
  phone: "+234 812 345 6789",
  ward: "Ikeja Central",
  status: "Verified Resident",
  address: ""
};

let queueData = [];
let currentView = DEFAULT_VIEW;

const body = document.body;
const themeBtn = document.getElementById("themeToggle");
const form = document.getElementById("bookingForm");
const resultDiv = document.getElementById("result");
const serviceSelect = document.getElementById("service");
const searchInput = document.getElementById("search");
const queueList = document.getElementById("queueList");
const refreshBtn = document.getElementById("refreshQueue");
const callNextBtn = document.getElementById("callNext");
const profileToggle = document.getElementById("profileToggle");
const closeSidebarBtn = document.getElementById("closeSidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const profileSidebar = document.getElementById("profileSidebar");
const sidebarServiceList = document.getElementById("sidebarServiceList");
const viewAllServicesBtn = document.getElementById("viewAllServices");
const servicesPanel = document.getElementById("servicesPanel");
const closeServicesPanelBtn = document.getElementById("closeServicesPanel");
const allServicesList = document.getElementById("allServicesList");
const navButtons = document.querySelectorAll("[data-view-target]");
const views = document.querySelectorAll(".app-view");
const heroExploreBtn = document.getElementById("heroExplore");
const profileForm = document.getElementById("profileForm");
const profileResult = document.getElementById("profileResult");
const profileNameInput = document.getElementById("profileName");
const profileEmailInput = document.getElementById("profileEmail");
const profilePhoneInput = document.getElementById("profilePhone");
const profileWardInput = document.getElementById("profileWard");
const profileStatusInput = document.getElementById("profileStatus");
const profileAddressInput = document.getElementById("profileAddress");

initializeTheme();
renderSidebarServices();
renderAllServices();
loadProfile();
setActiveView(DEFAULT_VIEW);

if (themeBtn) {
  themeBtn.addEventListener("click", toggleTheme);
}

if (profileToggle) {
  profileToggle.addEventListener("click", () => setSidebar(true));
}

if (closeSidebarBtn) {
  closeSidebarBtn.addEventListener("click", () => setSidebar(false));
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", () => {
    setSidebar(false);
    setServicesPanel(false);
  });
}

if (viewAllServicesBtn) {
  viewAllServicesBtn.addEventListener("click", () => setServicesPanel(true));
}

if (heroExploreBtn) {
  heroExploreBtn.addEventListener("click", () => setServicesPanel(true));
}

if (closeServicesPanelBtn) {
  closeServicesPanelBtn.addEventListener("click", () => setServicesPanel(false));
}

navButtons.forEach(button => {
  button.addEventListener("click", () => setActiveView(button.dataset.viewTarget || DEFAULT_VIEW));
});

document.querySelectorAll(".nav-action").forEach(button => {
  button.addEventListener("click", () => {
    setActiveView(button.dataset.targetView || DEFAULT_VIEW);
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    setSidebar(false);
    setServicesPanel(false);
  }
});

document.querySelectorAll(".category-card").forEach(card => {
  card.addEventListener("click", () => {
    openBookWithService(card.dataset.service || "");
  });
});

if (profileForm) {
  profileForm.addEventListener("submit", event => {
    event.preventDefault();
    const profile = {
      name: profileNameInput.value.trim(),
      email: profileEmailInput.value.trim(),
      phone: profilePhoneInput.value.trim(),
      ward: profileWardInput.value.trim(),
      status: profileStatusInput.value,
      address: profileAddressInput.value.trim()
    };

    if (!profile.name || !profile.email || !profile.phone || !profile.ward || !profile.status) {
      showPanelResult(profileResult, "Please complete all required profile fields.", true);
      return;
    }

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    applyProfile(profile);
    showPanelResult(profileResult, "Your details have been saved.");
  });
}

if (form) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = {
      name: document.getElementById("name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      service: serviceSelect.value,
      date: document.getElementById("date").value,
      time: document.getElementById("time").value
    };

    if (!payload.name || !payload.phone || !payload.service || !payload.date || !payload.time) {
      showPanelResult(resultDiv, "Please fill all fields", true);
      return;
    }

    try {
      const res = await fetch(API_BASE + "/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("server error");

      const data = await res.json();
      showPanelResult(resultDiv, `Booked! Your queue number: ${data.queueNumber}. Confirmation SMS sent or queued.`);
      form.reset();
      refreshQueue();
      setActiveView("queue");
    } catch (error) {
      fallbackStore(payload);
      showPanelResult(resultDiv, "Saved locally for offline mode. The appointment will sync when the backend is available.");
      form.reset();
      refreshQueue();
      setActiveView("queue");
    }
  });
}

if (searchInput) {
  searchInput.addEventListener("input", async () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!queueList) return;

    if (!query) {
      renderQueue(queueData);
      return;
    }

    try {
      const res = await fetch(API_BASE + "/search?q=" + encodeURIComponent(query));
      const data = await res.json();
      renderQueue(data);
    } catch (error) {
      const filtered = queueData.filter(item =>
        Object.values(item).join(" ").toLowerCase().includes(query)
      );
      renderQueue(filtered);
    }
  });
}

if (refreshBtn) refreshBtn.addEventListener("click", refreshQueue);
if (callNextBtn) callNextBtn.addEventListener("click", callNext);
if (queueList) refreshQueue();

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "light";
  body.classList.remove("light", "dark");
  body.classList.add(savedTheme);
  updateThemeButton(savedTheme);
}

function toggleTheme() {
  const nextTheme = body.classList.contains("dark") ? "light" : "dark";
  body.classList.remove("light", "dark");
  body.classList.add(nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  updateThemeButton(nextTheme);
}

function updateThemeButton(theme) {
  if (!themeBtn) return;
  const nextMode = theme === "dark" ? "light" : "dark";
  themeBtn.textContent = theme === "dark" ? "Dark" : "Light";
  themeBtn.dataset.mode = theme;
  themeBtn.setAttribute("aria-label", `Switch to ${nextMode} mode`);
}

function setActiveView(viewName) {
  currentView = viewName;
  views.forEach(view => {
    view.classList.toggle("active-view", view.dataset.view === viewName);
  });

  navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.viewTarget === viewName);
  });

  setSidebar(false);
  setServicesPanel(false);
}

function setSidebar(isOpen) {
  body.classList.toggle("sidebar-open", isOpen);
  if (profileSidebar) {
    profileSidebar.setAttribute("aria-hidden", String(!isOpen));
  }
}

function setServicesPanel(isOpen) {
  if (!servicesPanel) return;
  servicesPanel.classList.toggle("hidden", !isOpen);
  servicesPanel.setAttribute("aria-hidden", String(!isOpen));
}

function openBookWithService(serviceName) {
  if (serviceSelect) {
    serviceSelect.value = serviceName;
  }
  setServicesPanel(false);
  setSidebar(false);
  setActiveView("book");
}

function renderSidebarServices() {
  if (!sidebarServiceList) return;
  sidebarServiceList.innerHTML = "";

  SERVICE_DETAILS.forEach(service => {
    const item = document.createElement("li");
    item.className = "sidebar-service-item";
    item.innerHTML = `
      <div class="sidebar-service-copy">
        <strong>${service.name}</strong>
        <span>${service.eta}</span>
      </div>
      <span class="sidebar-service-arrow">Open</span>
    `;

    item.addEventListener("click", () => openBookWithService(service.name));
    sidebarServiceList.appendChild(item);
  });
}

function renderAllServices() {
  if (!allServicesList) return;
  allServicesList.innerHTML = "";

  SERVICE_DETAILS.forEach(service => {
    const card = document.createElement("article");
    card.className = "all-service-card";
    card.innerHTML = `
      <div class="all-service-copy">
        <strong>${service.name}</strong>
        <span>${service.eta}</span>
      </div>
      <button type="button">Book</button>
    `;

    card.querySelector("button")?.addEventListener("click", () => openBookWithService(service.name));
    allServicesList.appendChild(card);
  });
}

function showPanelResult(target, message, isError = false) {
  if (!target) {
    alert(message);
    return;
  }

  target.classList.remove("hidden");
  target.style.borderLeft = isError ? "4px solid var(--danger)" : "4px solid var(--success)";
  target.textContent = message;
  setTimeout(() => target.classList.add("hidden"), 10000);
}

function fallbackStore(appointment) {
  const appointments = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
  appointments.push({
    ...appointment,
    createdAt: new Date().toISOString(),
    queueNumber: appointments.length + 1
  });
  localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(appointments));
}

function renderQueue(list) {
  if (!queueList) return;

  queueList.innerHTML = "";
  if (!list || !list.length) {
    queueList.innerHTML = "<li>No appointments</li>";
    return;
  }

  list.forEach((appointment, index) => {
    const li = document.createElement("li");
    const queueNumber = appointment.queueNumber || index + 1;
    const appointmentId = appointment.id || "";
    const displayDate = appointment.date || "Pending date";
    const displayTime = appointment.time || "Pending time";
    const displayPhone = appointment.phone || "No phone";
    const displayService = appointment.service || "Appointment";
    const displayName = appointment.name || "Guest";

    li.innerHTML = `<div>
      <strong>#${queueNumber}</strong> ${displayName} - ${displayService}<br>
      ${displayDate} ${displayTime} | ${displayPhone}
    </div>
    <div>
      <button onclick="markServed('${appointmentId}')">Mark Served</button>
    </div>`;
    queueList.appendChild(li);
  });
}

async function refreshQueue() {
  if (!queueList) return;

  try {
    const res = await fetch(API_BASE + "/queue");
    const data = await res.json();
    queueData = data;
    renderQueue(queueData);
  } catch (error) {
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
  } catch (error) {
    alert("Cannot reach server. In offline mode, use the queue list below.");
  }
}

async function markServed(id) {
  if (!id) {
    alert("This local entry does not have a server ID yet.");
    return;
  }

  try {
    await fetch(API_BASE + "/served", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    refreshQueue();
  } catch (error) {
    alert("Server unreachable.");
  }
}

function loadProfile() {
  const storedProfile = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
  const profile = storedProfile || DEFAULT_PROFILE;
  applyProfile(profile);

  if (profileNameInput) profileNameInput.value = profile.name;
  if (profileEmailInput) profileEmailInput.value = profile.email;
  if (profilePhoneInput) profilePhoneInput.value = profile.phone;
  if (profileWardInput) profileWardInput.value = profile.ward;
  if (profileStatusInput) profileStatusInput.value = profile.status;
  if (profileAddressInput) profileAddressInput.value = profile.address || "";
}

function applyProfile(profile) {
  setText("sidebarUserName", profile.name);
  setText("sidebarSummaryName", profile.name);
  setText("sidebarSummaryRole", profile.status);
  setText("sidebarEmail", profile.email);
  setText("sidebarPhone", profile.phone);
  setText("sidebarWard", profile.ward);
  setText("sidebarStatus", profile.status);
  setText("sidebarAvatar", initialsFor(profile.name));
  if (profileToggle) {
    profileToggle.textContent = initialsFor(profile.name);
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function initialsFor(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "CE";
}

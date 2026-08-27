/**
 * GPS Tracking | JavaScript محلي بلا خدمات خلفية أو شعار.
 * تدار بيانات المركبات والسائقين والحركة في localStorage، بينما تعرض Leaflet خريطة OpenStreetMap الفعلية.
 */
(function () {
  "use strict";

  const STORE = { session: "gps-session", cars: "gps-cars", drivers: "gps-drivers" };
  const routes = {
    central: { label: "الملك فهد · العليا", points: [[24.7118,46.6743],[24.7160,46.6766],[24.7212,46.6761],[24.7260,46.6731],[24.7310,46.6704],[24.7283,46.6644]] },
    east: { label: "الروضة · شرق الرياض", points: [[24.7022,46.7482],[24.7065,46.7417],[24.7115,46.7357],[24.7176,46.7274],[24.7221,46.7192],[24.7181,46.7098]] },
    north: { label: "الصحافة · شمال الرياض", points: [[24.7854,46.6354],[24.7780,46.6444],[24.7705,46.6524],[24.7590,46.6598],[24.7500,46.6635],[24.7429,46.6603]] },
    airport: { label: "المطار · طريق الثمامة", points: [[24.8955,46.7190],[24.8766,46.7130],[24.8545,46.7056],[24.8369,46.6990],[24.8212,46.6924],[24.8047,46.6848]] }
  };
  const originalDrivers = [
    { id:"D-101", name:"Test1", phone:"050 312 8841", role:"سائق توصيل", license:"خصوصي · 2028", available:false },
    { id:"D-102", name:"Test2", phone:"055 487 2015", role:"سائق ميداني", license:"عمومي · 2027", available:false },
    { id:"D-103", name:"Test3", phone:"054 113 7940", role:"مشرفة تشغيل", license:"خصوصي · 2029", available:true },
    { id:"D-104", name:"Test4", phone:"056 920 6433", role:"سائق خدمات", license:"عمومي · 2028", available:false },
    { id:"D-105", name:"Test5", phone:"050 764 3302", role:"منسقة مسارات", license:"خصوصي · 2027", available:true }
  ];
  const originalCars = [
    makeCar("GPS-021","تويوتا هايلكس 2023","مركبة خدمات","د ب س 2841","D-101","فهد السبيعي","moving",56,73,41280,74.6,"central",1,18),
    makeCar("GPS-034","هيونداي H1 2022","نقل خفيف","ن هـ ج 7329","D-102","ناصر القحطاني","moving",42,61,38512,58.2,"east",3,289),
    makeCar("GPS-008","فورد ترانزيت 2024","مركبة توصيل","ر ي ض 4410","D-104","عبدالله المطيري","moving",68,84,17440,101.8,"north",4,156),
    makeCar("GPS-017","تويوتا كورولا 2023","مركبة ميدانية","ل س ن 8025","D-103","سارة الحربي","idle",0,47,29300,31.4,"airport",2,210),
    makeCar("GPS-041","نيسان أورفان 2021","نقل موظفين","ط ع ب 6139","D-102","ناصر القحطاني","disabled",0,28,62910,0,"central",5,44)
  ];
  function makeCar(id,name,type,plate,driverId,driverName,status,speed,fuel,mileage,distance,route,index,heading) {
    const point = routes[route].points[index];
    return { id,name,type,plate,driverId,driverName,status,speed,fuel,mileage,distance,route,index,heading,lat:point[0],lng:point[1],lastSeen:status === "disabled" ? "متوقفة" : "الآن" };
  }
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const load = (key, fallback) => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : copy(fallback); } catch { return copy(fallback); } };
  let cars = load(STORE.cars, originalCars);
  let drivers = load(STORE.drivers, originalDrivers);
  let currentTab = "fleet";
  let selectedId = cars[0] ? cars[0].id : null;
  let map, markerLayer, routeLayer;
  let simulation = true;
  let documentEventsBound = false;

  function save() { localStorage.setItem(STORE.cars, JSON.stringify(cars)); localStorage.setItem(STORE.drivers, JSON.stringify(drivers)); }
  function selected() { return cars.find((car) => car.id === selectedId) || cars[0]; }
  function statusLabel(status) { return ({moving:"تتحرك", idle:"في انتظار", disabled:"معطّلة"})[status]; }
  function initials(name) { return name.split(" ").slice(0,2).map((word) => word[0]).join(""); }
  function esc(value) { return String(value || "").replace(/[&<>'"]/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]); }
  function distanceNumber() { return cars.reduce((sum, car) => sum + car.distance, 0).toFixed(0); }

  function renderLogin() {
    document.getElementById("app").innerHTML = `
      <main class="login-screen">
        <section class="login-card"><h1 class="brand-name">GPS Tracking</h1><p>نسخة تجريبية محلية لإدارة وتتبع الأسطول.</p><form id="login-form"><div class="field"><label for="username">اسم المستخدم</label><input id="username" name="username" type="text" placeholder="اكتب أي اسم" autocomplete="username" autofocus /></div><div class="field"><label for="password">رمز الدخول</label><input id="password" name="password" type="password" placeholder="اكتب أي رمز" autocomplete="current-password" /></div><button class="btn btn-primary btn-wide" type="submit">دخول</button></form><small>هذه نسخة عرض: يقبل النظام أي اسم وأي رمز دخول.</small></section>
      </main>`;
    document.getElementById("login-form").addEventListener("submit", (event) => {
      event.preventDefault();
      localStorage.setItem(STORE.session, "active"); renderApp(); notify("تم الدخول إلى مساحة العرض المحلية.");
    });
  }

  function renderApp() {
    document.getElementById("app").innerHTML = `
      <div class="app-shell">
        <aside class="control-panel">
          <header class="panel-head"><h1 class="brand-name">GPS Tracking</h1><p>إدارة أسطول المركبات · الرياض</p><span class="live-label"><i></i>LOCAL SIMULATION ACTIVE</span></header>
          <nav class="panel-nav" aria-label="أقسام لوحة التحكم"><button data-tab="fleet" class="${currentTab === "fleet" ? "active" : ""}">الأسطول</button><button data-tab="drivers" class="${currentTab === "drivers" ? "active" : ""}">السائقون</button><button data-tab="reports" class="${currentTab === "reports" ? "active" : ""}">التقارير</button><button data-tab="settings" class="${currentTab === "settings" ? "active" : ""}">الإعدادات</button></nav>
          <div class="panel-scroll" id="panel-content"></div>
        </aside>
        <main class="map-stage"><header class="map-header"><div><h1>GPS Tracking</h1><p>خريطة تشغيلية مباشرة · الرياض، السعودية</p></div><div class="map-controls"><span class="map-status">LIVE</span><button id="focus-selected">تحديد المركبة</button><button id="toggle-simulation" class="${simulation ? "is-on" : ""}">${simulation ? "إيقاف الحركة" : "تشغيل الحركة"}</button><button id="logout">خروج</button></div></header><div id="map" class="map-area"></div><section class="map-readout" id="map-readout"></section><section class="map-stats" id="map-stats"></section></main>
      </div>`;
    setupMap(); renderPanel(); renderMap(); bindAppEvents();
  }

  function renderPanel() {
    const content = document.getElementById("panel-content"); if (!content) return;
    const renderers = { fleet: fleetPanel, drivers: driversPanel, reports: reportsPanel, settings: settingsPanel };
    content.innerHTML = renderers[currentTab]();
  }
  function fleetPanel() {
    const moving = cars.filter((car) => car.status === "moving").length;
    return `<div class="view-title"><div><h2>إدارة المركبات</h2><p>LOCAL FLEET / ${cars.length}</p></div></div>
      <form id="add-car-form" class="form-section"><h3>إضافة مركبة</h3><div class="form-grid"><div class="field full"><label>اسم / طراز المركبة</label><input required name="name" placeholder="مثال: تويوتا يارس 2024" /></div><div class="field"><label>رقم اللوحة</label><input required name="plate" placeholder="أ ب ج 1234" /></div><div class="field"><label>نوع المركبة</label><select name="type"><option>مركبة خدمات</option><option>مركبة توصيل</option><option>نقل خفيف</option><option>مركبة ميدانية</option></select></div><div class="field"><label>السائق</label><select name="driverId">${driverOptions()}</select></div><div class="field"><label>المسار</label><select name="route">${routeOptions()}</select></div><div class="field full"><label>الحالة</label><select name="status"><option value="moving">تتحرك</option><option value="idle">في انتظار</option><option value="disabled">معطّلة</option></select></div></div><button class="btn btn-primary btn-wide" style="margin-top:11px" type="submit">إضافة إلى الأسطول</button></form>
      <div class="fleet-summary"><div><b>${cars.length}</b><span>إجمالي</span></div><div><b>${moving}</b><span>تتحرك</span></div><div><b>${cars.filter((car) => car.status === "disabled").length}</b><span>معطّلة</span></div></div>
      <div class="fleet-list">${cars.length ? cars.map(carCard).join("") : `<div class="empty">لا توجد مركبات بعد.</div>`}</div>`;
  }
  function carCard(car) {
    return `<article class="fleet-item ${car.status} ${selectedId === car.id ? "selected" : ""}" data-select="${car.id}"><i class="fleet-icon">${car.status === "disabled" ? "■" : "↗"}</i><div class="fleet-info"><b>${esc(car.name)}</b><span>${esc(car.driverName)} · ${esc(car.id)} · ${car.speed} كم/س</span><div class="item-actions"><button class="small-btn" title="تعديل" data-edit-car="${car.id}">✎</button><button class="small-btn" title="${car.status === "disabled" ? "تشغيل" : "تعطيل"}" data-toggle-car="${car.id}">${car.status === "disabled" ? "▶" : "Ⅱ"}</button><button class="small-btn" title="حذف" data-delete-car="${car.id}">×</button></div></div><span class="status ${car.status}">${statusLabel(car.status)}</span></article>`;
  }
  function driversPanel() {
    return `<div class="view-title"><div><h2>إدارة السائقين</h2><p>LOCAL DRIVERS / ${drivers.length}</p></div></div><form id="add-driver-form" class="form-section"><h3>إضافة سائق</h3><div class="field"><label>الاسم الكامل</label><input required name="name" placeholder="مثال: محمد العتيبي" /></div><div class="field"><label>رقم التواصل</label><input required name="phone" placeholder="05X XXX XXXX" /></div><div class="form-grid"><div class="field"><label>الدور</label><select name="role"><option>سائق ميداني</option><option>سائق توصيل</option><option>سائق خدمات</option><option>مشرف تشغيل</option></select></div><div class="field"><label>الرخصة</label><input required name="license" value="خصوصي · 2029" /></div></div><button class="btn btn-primary btn-wide" style="margin-top:11px" type="submit">إضافة السائق</button></form><div>${drivers.map(driverCard).join("")}</div>`;
  }
  function driverCard(driver) {
    const assignment = cars.find((car) => car.driverId === driver.id);
    return `<article class="driver-card"><i class="initials">${initials(driver.name)}</i><div><b>${esc(driver.name)}</b><p>${esc(driver.role)} · ${esc(driver.phone)}<br>${assignment ? `مكلّف بـ ${esc(assignment.name)}` : "غير مكلّف حاليًا"}</p></div><div><span class="driver-state ${driver.available ? "available" : ""}">${driver.available ? "متاح" : "في مهمة"}</span><div class="item-actions"><button class="small-btn" data-edit-driver="${driver.id}" title="تعديل">✎</button><button class="small-btn" data-delete-driver="${driver.id}" title="حذف">×</button></div></div></article>`;
  }
  function reportsPanel() {
    const data = [{label:"المركبة GPS-008", value:91},{label:"المركبة GPS-021", value:72},{label:"المركبة GPS-034", value:64},{label:"المركبة GPS-017", value:38}];
    return `<div class="view-title"><div><h2>تقرير الحركة</h2><p>LOCAL SNAPSHOT</p></div></div><div class="form-section"><h3>مسافة اليوم</h3><div style="font:700 31px/1 'Space Mono',monospace;direction:ltr">${distanceNumber()} <small style="font:10px 'IBM Plex Sans Arabic';direction:rtl">كم</small></div><p style="color:#666;font-size:9px;line-height:1.7">محصلة المسافات المعروضة للمركبات ضمن المحاكاة المحلية.</p></div>${data.map((row) => `<div class="report-row"><b><span>${row.label}</span><span>${row.value}%</span></b><div class="report-track"><i style="width:${row.value}%"></i></div></div>`).join("")}<div class="small-note">لا يتضمن هذا التقرير بيانات حقيقية أو تصديرًا خارجيًا؛ صُمم لإظهار تجربة واجهة التقارير في GitHub.</div>`;
  }
  function settingsPanel() {
    return `<div class="view-title"><div><h2>إعدادات العرض</h2><p>LOCAL ONLY</p></div></div><div class="form-section"><h3>محاكاة المركبات</h3><p style="margin:0 0 12px;color:#666;font-size:10px;line-height:1.8">${simulation ? "الحركة التلقائية تعمل كل 3 ثوانٍ." : "الحركة التلقائية متوقفة حاليًا."}</p><button id="toggle-simulation-panel" class="btn btn-wide">${simulation ? "إيقاف المحاكاة" : "تشغيل المحاكاة"}</button></div><div class="form-section"><h3>بيانات العرض</h3><p style="margin:0 0 12px;color:#666;font-size:10px;line-height:1.8">تُحفظ المركبات والسائقون والتعديلات محليًا داخل المتصفح.</p><button id="reset-demo" class="btn btn-danger btn-wide">استعادة بيانات العرض الأصلية</button></div><div class="small-note">الخريطة تستخدم Leaflet وطبقة OpenStreetMap المفتوحة. لا توجد واجهات API أو نظام تسجيل دخول خارجي.</div>`;
  }
  function driverOptions(selectedDriverId) { return drivers.map((driver) => `<option value="${driver.id}" ${driver.id === selectedDriverId ? "selected" : ""}>${esc(driver.name)}</option>`).join(""); }
  function routeOptions(selectedRoute) { return Object.entries(routes).map(([id, route]) => `<option value="${id}" ${id === selectedRoute ? "selected" : ""}>${route.label}</option>`).join(""); }

  function setupMap() {
    if (map) { map.remove(); map = null; }
    map = L.map("map", { zoomControl:false, attributionControl:true }).setView([24.754,46.68], 11);
    L.control.zoom({ position:"bottomleft" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap contributors" }).addTo(map);
    markerLayer = L.layerGroup().addTo(map); routeLayer = L.layerGroup().addTo(map);
  }
  function markerIcon(car, active) {
    const arrow = car.status === "disabled" ? "■" : "➤";
    return L.divIcon({ className:"marker-wrap", iconSize:[26,26], iconAnchor:[13,13], html:`<div class="car-marker ${car.status} ${active ? "selected" : ""}"><span style="transform:rotate(${car.heading}deg)">${arrow}</span></div>` });
  }
  function renderMap() {
    if (!map) return;
    markerLayer.clearLayers(); routeLayer.clearLayers();
    const active = selected();
    if (active) {
      const line = L.polyline(routes[active.route].points, { color:"#000", weight:3, opacity:.78, dashArray:"3 8", className:"route-path" }).addTo(routeLayer);
      line.bindTooltip(`مسار ${routes[active.route].label}`, { direction:"top" });
      routes[active.route].points.forEach((point, index) => L.marker(point, { interactive:false, icon:L.divIcon({ className:"route-point-wrap", iconSize:[17,17], iconAnchor:[8,8], html:`<i class="route-point">${index + 1}</i>` }) }).addTo(routeLayer));
    }
    cars.forEach((car) => {
      const marker = L.marker([car.lat, car.lng], { icon:markerIcon(car, car.id === selectedId), keyboard:true }).addTo(markerLayer);
      marker.on("click", () => { selectedId = car.id; renderPanel(); renderMap(); });
      marker.bindPopup(`<div class="popup-name">${esc(car.name)}</div><div class="popup-meta">${esc(car.driverName)} · ${car.speed} كم/س · ${statusLabel(car.status)}</div>`);
    });
    renderMapReadout();
  }
  function renderMapReadout() {
    const readout = document.getElementById("map-readout"), stats = document.getElementById("map-stats"); const car = selected();
    if (!readout || !stats) return;
    if (!car) { readout.innerHTML = `<div class="empty">أضف مركبة للبدء.</div>`; return; }
    readout.innerHTML = `<div class="map-readout-head"><div><h2>${esc(car.name)}</h2><p>${car.id} · ${statusLabel(car.status)}</p></div><span class="status ${car.status}">${statusLabel(car.status)}</span></div><div class="readout-grid"><div><span>السائق</span><b>${esc(car.driverName)}</b></div><div><span>السرعة</span><b>${car.speed} كم/س</b></div><div><span>الوقود</span><b>${Math.round(car.fuel)}%</b></div><div><span>الموقع</span><b>${routes[car.route].label.split("·")[0]}</b></div></div><div class="readout-actions"><button class="btn" data-edit-car="${car.id}">تعديل</button><button class="btn ${car.status === "disabled" ? "btn-primary" : "btn-danger"}" data-toggle-car="${car.id}">${car.status === "disabled" ? "تشغيل" : "تعطيل"}</button></div>`;
    stats.innerHTML = `<div class="map-stat"><b>${cars.length}</b><span>مركبات الأسطول</span></div><div class="map-stat"><b>${cars.filter(c => c.status === "moving").length}</b><span>في حركة الآن</span></div><div class="map-stat"><b>${distanceNumber()} km</b><span>المسافة اليوم</span></div>`;
  }
  function bindAppEvents() {
    if (!documentEventsBound) { document.addEventListener("click", appClickHandler); documentEventsBound = true; }
    document.getElementById("focus-selected").addEventListener("click", () => { const car = selected(); if (car) map.flyTo([car.lat,car.lng], 14, { duration:.7 }); });
    document.getElementById("toggle-simulation").addEventListener("click", toggleSimulation);
    document.getElementById("logout").addEventListener("click", () => { localStorage.removeItem(STORE.session); location.reload(); });
    bindForms();
  }
  function appClickHandler(event) {
    const target = event.target.closest("button"); if (!target) return;
    if (target.dataset.tab) { currentTab = target.dataset.tab; renderApp(); return; }
    if (target.dataset.select) { selectedId = target.dataset.select; renderPanel(); renderMap(); return; }
    if (target.dataset.editCar) openCarModal(target.dataset.editCar);
    if (target.dataset.deleteCar) deleteCar(target.dataset.deleteCar);
    if (target.dataset.toggleCar) toggleCar(target.dataset.toggleCar);
    if (target.dataset.editDriver) openDriverModal(target.dataset.editDriver);
    if (target.dataset.deleteDriver) deleteDriver(target.dataset.deleteDriver);
    if (target.id === "toggle-simulation-panel") toggleSimulation();
    if (target.id === "reset-demo") resetDemo();
    if (target.dataset.closeModal) closeModal();
  }
  function bindForms() {
    const carForm = document.getElementById("add-car-form"), driverForm = document.getElementById("add-driver-form");
    if (carForm) carForm.addEventListener("submit", addCar);
    if (driverForm) driverForm.addEventListener("submit", addDriver);
  }
  function addCar(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const route = String(form.get("route")); const driver = drivers.find((item) => item.id === form.get("driverId")) || drivers[0]; const index = 0; const point = routes[route].points[index];
    const car = { id:`GPS-${Math.floor(100 + Math.random()*800)}`, name:String(form.get("name")).trim(), type:String(form.get("type")), plate:String(form.get("plate")).trim(), driverId:driver.id, driverName:driver.name, status:String(form.get("status")), speed:form.get("status") === "moving" ? 43 : 0, fuel:88, mileage:120, distance:0, route, index, heading:40, lat:point[0], lng:point[1], lastSeen:"الآن" };
    cars.unshift(car); selectedId = car.id; save(); renderApp(); notify("أُضيفت المركبة إلى بيانات العرض.");
  }
  function addDriver(event) { event.preventDefault(); const form = new FormData(event.currentTarget); drivers.unshift({ id:`D-${Math.floor(106+Math.random()*800)}`, name:String(form.get("name")).trim(), phone:String(form.get("phone")).trim(), role:String(form.get("role")), license:String(form.get("license")), available:true }); save(); renderPanel(); notify("أُضيف السائق محليًا."); }
  function toggleCar(id) { const car = cars.find((item) => item.id === id); if (!car) return; const enable = car.status === "disabled"; car.status = enable ? "moving" : "disabled"; car.speed = enable ? 40 : 0; car.lastSeen = enable ? "الآن" : "متوقفة"; save(); renderPanel(); renderMap(); notify(enable ? "عادت المركبة إلى الحركة." : "تم تعطيل المركبة وإيقافها."); }
  function deleteCar(id) { const car = cars.find((item) => item.id === id); if (!car || !confirm(`حذف ${car.name} من العرض المحلي؟`)) return; cars = cars.filter((item) => item.id !== id); selectedId = cars[0] ? cars[0].id : null; save(); renderPanel(); renderMap(); notify("حُذفت المركبة من بيانات العرض."); }
  function deleteDriver(id) { const driver = drivers.find((item) => item.id === id); if (!driver || cars.some((car) => car.driverId === id)) return notify("لا يمكن حذف سائق مرتبط بمركبة. عدّل المركبة أولًا."); if (!confirm(`حذف ${driver.name} من العرض المحلي؟`)) return; drivers = drivers.filter((item) => item.id !== id); save(); renderPanel(); notify("حُذف السائق من بيانات العرض."); }
  function toggleSimulation() { simulation = !simulation; const button = document.getElementById("toggle-simulation"); if (button) { button.textContent = simulation ? "إيقاف الحركة" : "تشغيل الحركة"; button.classList.toggle("is-on",simulation); } renderPanel(); notify(simulation ? "تم تشغيل المحاكاة." : "تم إيقاف المحاكاة."); }
  function resetDemo() { if (!confirm("استعادة المركبات والسائقين الأساسيين؟")) return; cars = copy(originalCars); drivers = copy(originalDrivers); selectedId = cars[0].id; save(); renderApp(); notify("استعيدت بيانات العرض الأساسية."); }
  function openCarModal(id) {
    const car = cars.find((item) => item.id === id); if (!car) return;
    openModal("تعديل المركبة", "تنعكس التعديلات على الخريطة وبيانات العرض محليًا.", `<form id="edit-car-form" class="modal-form"><input type="hidden" name="id" value="${car.id}"><div class="modal-body"><div class="form-grid"><div class="field full"><label>اسم / طراز المركبة</label><input required name="name" value="${esc(car.name)}"></div><div class="field"><label>رقم اللوحة</label><input required name="plate" value="${esc(car.plate)}"></div><div class="field"><label>النوع</label><input required name="type" value="${esc(car.type)}"></div><div class="field"><label>السائق</label><select name="driverId">${driverOptions(car.driverId)}</select></div><div class="field"><label>المسار</label><select name="route">${routeOptions(car.route)}</select></div><div class="field full"><label>الحالة</label><select name="status"><option value="moving" ${car.status === "moving" ? "selected" : ""}>تتحرك</option><option value="idle" ${car.status === "idle" ? "selected" : ""}>في انتظار</option><option value="disabled" ${car.status === "disabled" ? "selected" : ""}>معطّلة</option></select></div></div></div><div class="modal-actions"><button type="button" class="btn" data-close-modal>إلغاء</button><button type="submit" class="btn btn-primary">حفظ التعديل</button></div></form>`);
    document.getElementById("edit-car-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const item = cars.find((entry) => entry.id === form.get("id")); const driver = drivers.find((entry) => entry.id === form.get("driverId")); const route = String(form.get("route")); Object.assign(item,{ name:String(form.get("name")).trim(), plate:String(form.get("plate")).trim(), type:String(form.get("type")).trim(), driverId:driver.id, driverName:driver.name, route, status:String(form.get("status")) }); if (item.status !== "moving") item.speed=0; else if (item.speed===0) item.speed=43; const point=routes[route].points[item.index % routes[route].points.length]; item.lat=point[0]; item.lng=point[1]; save(); closeModal(); renderPanel(); renderMap(); notify("حُدّثت بيانات المركبة."); });
  }
  function openDriverModal(id) {
    const driver = drivers.find((item) => item.id === id); if (!driver) return;
    openModal("تعديل السائق", "تتحدّث المركبات المرتبطة بالاسم الجديد محليًا.", `<form id="edit-driver-form"><input type="hidden" name="id" value="${driver.id}"><div class="modal-body"><div class="field"><label>الاسم الكامل</label><input required name="name" value="${esc(driver.name)}"></div><div class="field"><label>رقم التواصل</label><input required name="phone" value="${esc(driver.phone)}"></div><div class="form-grid"><div class="field"><label>الدور</label><input required name="role" value="${esc(driver.role)}"></div><div class="field"><label>الرخصة</label><input required name="license" value="${esc(driver.license)}"></div></div></div><div class="modal-actions"><button type="button" class="btn" data-close-modal>إلغاء</button><button type="submit" class="btn btn-primary">حفظ التعديل</button></div></form>`);
    document.getElementById("edit-driver-form").addEventListener("submit", (event) => { event.preventDefault(); const form=new FormData(event.currentTarget); const item=drivers.find((entry)=>entry.id===form.get("id")); const name=String(form.get("name")).trim(); Object.assign(item,{name,phone:String(form.get("phone")).trim(),role:String(form.get("role")).trim(),license:String(form.get("license")).trim()}); cars.forEach((car)=>{if(car.driverId===item.id) car.driverName=name;}); save(); closeModal(); renderPanel(); renderMap(); notify("حُدّث ملف السائق."); });
  }
  function openModal(title, subtitle, body) { document.body.insertAdjacentHTML("beforeend", `<div class="modal-layer" id="modal-layer"><section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><div><h3>${title}</h3><p>${subtitle}</p></div><button class="modal-close" data-close-modal aria-label="إغلاق">×</button></header>${body}</section></div>`); }
  function closeModal() { document.getElementById("modal-layer")?.remove(); }
  function notify(message) { document.querySelector(".toast")?.remove(); document.body.insertAdjacentHTML("beforeend", `<div class="toast">${esc(message)}</div>`); window.setTimeout(() => document.querySelector(".toast")?.remove(), 2900); }
  function moveCars() {
    if (!simulation || !cars.length) return;
    cars.forEach((car) => { if (car.status !== "moving") return; const path = routes[car.route].points; const previous = path[car.index]; car.index = (car.index + 1) % path.length; const next = path[car.index]; car.lat=next[0]; car.lng=next[1]; car.heading=Math.atan2(next[1]-previous[1],next[0]-previous[0]) * 180 / Math.PI + 90; car.speed=Math.max(35,Math.min(79,car.speed+Math.floor(Math.random()*13)-6)); car.fuel=Math.max(8,car.fuel-.2); car.distance=Number((car.distance+.32).toFixed(1)); car.lastSeen="الآن"; }); save(); renderPanel(); renderMap(); }

  if (localStorage.getItem(STORE.session) === "active" || new URLSearchParams(location.search).get("demo") === "1") renderApp(); else renderLogin();
  window.setInterval(moveCars, 3200);
})();

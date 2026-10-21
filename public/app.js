const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("sharebit_token") || "";
let currentUser = JSON.parse(localStorage.getItem("sharebit_user") || "null");
let authMode = "login";
const foodEmojis = ["🍲","🥗","🍱","🥖","🍛","🥪"];
const dateFormat = (value) => value ? new Date(value).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }) : "Not provided";
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3000); }
function api(path, options={}) {
  const headers = { "Content-Type":"application/json", ...(options.headers||{}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, { ...options, headers }).then(async r => {
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.message || "Something went wrong.");
    return data;
  });
}
function openModal(id) { $(id).classList.add("open"); document.body.style.overflow="hidden"; }
function closeModal(id) { $(id).classList.remove("open"); document.body.style.overflow=""; }
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m.id)}));
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal-backdrop.open").forEach(m=>closeModal(m.id))});
$("menuToggle").addEventListener("click",()=>$("navLinks").classList.toggle("open"));
document.querySelectorAll("#navLinks a").forEach(a=>a.addEventListener("click",()=>$("navLinks").classList.remove("open")));

function showAuth(mode="login") {
  authMode=mode; $("authForm").reset(); $("authMessage").textContent="";
  $("authTitle").textContent=mode==="login"?"Welcome back!":"Join the community";
  $("authSubtitle").textContent=mode==="login"?"Log in to continue sharing kindness.":"Create an account to start making a difference.";
  $("nameWrap").classList.toggle("hidden",mode==="login");
  $("phoneWrap").classList.toggle("hidden",mode==="login");
  $("roleWrap").classList.toggle("hidden",mode==="login");
  $("authPassword").autocomplete=mode==="login"?"current-password":"new-password";
  $("authSubmit").textContent=mode==="login"?"Log in":"Create account";
  document.querySelectorAll("[data-authmode]").forEach(b=>b.classList.toggle("active",b.dataset.authmode===mode));
  openModal("authModal");
}
document.querySelectorAll("[data-authmode]").forEach(b=>b.addEventListener("click",()=>showAuth(b.dataset.authmode)));
$("loginNav").addEventListener("click",()=>currentUser?logout():showAuth("login"));
["donateNav","heroDonate","ctaDonate"].forEach(id=>$(id).addEventListener("click",startDonation));
function logout(){token="";currentUser=null;localStorage.removeItem("sharebit_token");localStorage.removeItem("sharebit_user");updateNav();toast("You have logged out.");}
function updateNav(){
  $("loginNav").textContent=currentUser?"Log out":"Log in";
  $("donateNav").textContent=currentUser&&currentUser.role==="receiver"?"Find food ↗":"Donate food ↗";
  $("dashboardNav").classList.toggle("hidden",!currentUser);
}
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authMessage").textContent="";
  const payload={email:$("authEmail").value.trim(),password:$("authPassword").value};
  if(authMode==="register")Object.assign(payload,{name:$("authName").value.trim(),phone:$("authPhone").value.trim(),role:$("authRole").value});
  $("authSubmit").disabled=true;
  try{
    const data=await api(`/api/auth/${authMode==="login"?"login":"register"}`,{method:"POST",body:JSON.stringify(payload)});
    token=data.token;currentUser=data.user;localStorage.setItem("sharebit_token",token);localStorage.setItem("sharebit_user",JSON.stringify(currentUser));
    updateNav();closeModal("authModal");toast(`Welcome${currentUser.name?`, ${currentUser.name.split(" ")[0]}`:""}!`);await loadDonations();
  }catch(err){$("authMessage").textContent=err.message;}
  finally{$("authSubmit").disabled=false;}
});
function startDonation(){
  if(!currentUser){showAuth("login");$("authMessage").textContent="Log in or create an account before posting a donation.";return;}
  if(currentUser.role==="receiver"){toast("Your account is set up to receive food. Create a donor account to post food.");return;}
  $("donationForm").reset();$("donationMessage").textContent="";
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  $("preparedAt").value=now.toISOString().slice(0,16);
  const later=new Date(now.getTime()+3*60*60*1000);
  $("pickupUntil").value=later.toISOString().slice(0,16);
  $("contactPhone").value=currentUser.phone||"";
  openModal("donationModal");
}
$("donationForm").addEventListener("submit",async e=>{
  e.preventDefault();$("donationMessage").textContent="";
  const payload={foodName:$("foodName").value.trim(),foodType:$("foodType").value,quantity:Number($("quantity").value),unit:$("unit").value,location:$("foodLocation").value.trim(),preparedAt:new Date($("preparedAt").value).toISOString(),pickupUntil:new Date($("pickupUntil").value).toISOString(),contactPhone:$("contactPhone").value.trim(),description:$("foodDescription").value.trim()};
  if(new Date(payload.pickupUntil)<=new Date()){ $("donationMessage").textContent="Pickup deadline must be in the future.";return; }
  try{const data=await api("/api/donations",{method:"POST",body:JSON.stringify(payload)});closeModal("donationModal");toast(data.message);await loadDonations();await loadStats();}
  catch(err){$("donationMessage").textContent=err.message;}
});
async function loadStats(){
  try{const d=await api("/api/dashboard");$("statMeals").textContent=Number(d.totalMeals).toLocaleString();$("statDonations").textContent=Number(d.totalDonations).toLocaleString();$("statCollected").textContent=Number(d.collected).toLocaleString();}
  catch{$("statMeals").textContent="—";$("statDonations").textContent="—";$("statCollected").textContent="—";}
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function card(d,i){
  const status=d.status||"Available";
  const canRequest=currentUser&&currentUser.role==="receiver"&&status==="Available";
  const own=currentUser&&currentUser.id===String(d.donor?._id||d.donor);
  const artClass=`art-${i%6+1}`;
  return `<article class="donation-card"><div class="card-art ${artClass}"><span class="food-tag">${escapeHtml(d.foodType)}</span>${foodEmojis[i%foodEmojis.length]}</div><div class="donation-content"><h3>${escapeHtml(d.foodName)}</h3><p>${escapeHtml(d.description||"A community food donation, shared with care.")}</p><div class="meta-line">📍 ${escapeHtml(d.location)}</div><div class="meta-line">🕒 Pickup before ${escapeHtml(dateFormat(d.pickupUntil))}</div><div class="meta-line">👤 Shared by ${escapeHtml(d.donorName||"Community donor")}</div><div class="card-bottom"><span class="quantity">${escapeHtml(d.quantity)} ${escapeHtml(d.unit||"meals")}</span>${canRequest?`<button class="btn btn-primary" data-request="${d._id}">Request food ↗</button>`:own?`<span class="status-pill">${escapeHtml(status)}</span>`:`<span class="status-pill ${status==="Requested"?"requested":""}">${escapeHtml(status)}</span>`}</div></div></article>`;
}
async function loadDonations(){
  const q=$("searchInput").value.trim();
  $("donationGrid").innerHTML='<div class="loading">Finding food to share…</div>';
  try{
    const data=await api(`/api/donations${q?"?search="+encodeURIComponent(q):""}`);
    const donations=data.donations||[];
    $("donationGrid").innerHTML=donations.length?donations.map(card).join(""):'<div class="empty-state">🍃<br><br>No food listings found yet. Be the first to share a meal!</div>';
    document.querySelectorAll("[data-request]").forEach(b=>b.addEventListener("click",()=>requestFood(b.dataset.request,b)));
  }catch(err){$("donationGrid").innerHTML=`<div class="empty-state">We couldn't load the listings. Please refresh and try again.<br><small>${escapeHtml(err.message)}</small></div>`;}
}
async function requestFood(id,button){
  if(!currentUser){showAuth("login");return;}
  if(currentUser.role!=="receiver"){toast("Create or log in to a receiver account to request food.");return;}
  const message=prompt("Optional message to the donor (e.g. pickup plan):")||"";
  button.disabled=true;
  try{const d=await api(`/api/donations/${id}/request`,{method:"POST",body:JSON.stringify({message})});toast(d.message);await loadDonations();await loadStats();}
  catch(err){toast(err.message);button.disabled=false;}
}
$("searchBtn").addEventListener("click",loadDonations);
$("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")loadDonations()});
$("refreshBtn").addEventListener("click",()=>{loadDonations();loadStats();});
$("dashboardNav").addEventListener("click",showDashboard);
async function showDashboard(){
  if(!currentUser){showAuth("login");return;}
  $("dashboardTitle").textContent=currentUser.role==="admin"?"Admin dashboard":currentUser.role==="receiver"?"Receiver dashboard":"Donor dashboard";
  $("dashboardSubtitle").textContent=currentUser.role==="admin"?"Monitor community users, donations and requests.":currentUser.role==="receiver"?"Follow the food requests you have sent.":"Manage your donations and respond to requests.";
  $("dashboardContent").innerHTML='<div class="loading">Loading your dashboard…</div>';
  openModal("dashboardModal");
  try{
    const data=await api("/api/my-activity");
    const donations=data.donations||[];
    const users=data.users||[];
    const rows=donations.map(d=>{
      const requester=d.requestedBy&&typeof d.requestedBy==="object"?d.requestedBy.name:"—";
      const donor=d.donor&&typeof d.donor==="object"?d.donor.name:(d.donorName||"—");
      let actions="";
      if(currentUser.role==="donor"||currentUser.role==="admin"){
        if(d.status==="Requested") actions+=`<button class="mini-action" data-status-id="${d._id}" data-status="Accepted">Accept</button>`;
        if(d.status==="Accepted") actions+=`<button class="mini-action" data-status-id="${d._id}" data-status="Collected">Mark collected</button>`;
        if(["Available","Requested","Accepted"].includes(d.status)) actions+=`<button class="mini-action secondary" data-status-id="${d._id}" data-status="Cancelled">Cancel</button>`;
      }
      return `<tr><td><strong>${escapeHtml(d.foodName)}</strong><small>${escapeHtml(d.foodType)} · ${escapeHtml(d.quantity)} ${escapeHtml(d.unit||"meals")}</small></td><td>${escapeHtml(donor)}</td><td>${escapeHtml(requester)}</td><td><span class="status-pill ${d.status==="Requested"?"requested":""}">${escapeHtml(d.status)}</span></td><td>${actions||"—"}</td></tr>`;
    }).join("");
    const table=donations.length?`<div class="dashboard-table-wrap"><table class="dashboard-table"><thead><tr><th>Food</th><th>Donor</th><th>Requested by</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-state">No activity to show yet.</div>';
    const adminSummary=currentUser.role==="admin"?`<div class="dashboard-metrics"><div><strong>${users.length}</strong><small>Registered users</small></div><div><strong>${donations.length}</strong><small>Total donations</small></div><div><strong>${donations.filter(d=>d.status==="Collected").length}</strong><small>Collected</small></div></div><h3>Community activity</h3>`:"";
    const usersTable=currentUser.role==="admin"?`<h3>Registered users</h3><div class="dashboard-table-wrap"><table class="dashboard-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.phone)}</td><td>${escapeHtml(u.role)}</td></tr>`).join("")}</tbody></table></div>`:"";
    $("dashboardContent").innerHTML=adminSummary+table+usersTable;
    document.querySelectorAll("[data-status-id]").forEach(btn=>btn.addEventListener("click",async()=>{
      btn.disabled=true;
      try{const result=await api(`/api/donations/${btn.dataset.statusId}/status`,{method:"PATCH",body:JSON.stringify({status:btn.dataset.status})});toast(result.message);await showDashboard();await loadDonations();await loadStats();}
      catch(err){toast(err.message);btn.disabled=false;}
    }));
  }catch(err){$("dashboardContent").innerHTML=`<div class="empty-state">${escapeHtml(err.message)}</div>`;}
}
$("year").textContent=new Date().getFullYear();
updateNav();loadDonations();loadStats();

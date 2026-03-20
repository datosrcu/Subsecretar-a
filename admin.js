import { app, auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, getDocs, doc, getDoc } from './firebase-config.js';
import { addDoc, updateDoc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- DOM Elements ---
const loader = document.getElementById('auth-loader');
const userInfo = document.getElementById('user-info');
const adminAvatar = document.getElementById('admin-avatar');
const adminName = document.getElementById('admin-name');
const logoutBtn = document.getElementById('logout-btn');

const adminContent = document.getElementById('admin-content');
const errorScreen = document.getElementById('error-screen');
const errorMsg = document.getElementById('error-message');
const errorLoginBtn = document.getElementById('error-login-btn');

// Tabs
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');

// Tableros
const boardsTbody = document.getElementById('boards-tbody');
const addBoardBtn = document.getElementById('add-board-btn');

// Categorías
const catTbody = document.getElementById('categories-tbody');
const addCatBtn = document.getElementById('add-cat-btn');

// Usuarios
const usersTbody = document.getElementById('users-tbody');
const filterUserSearch = document.getElementById('filter-user-search');

// Solicitudes
const requestsTbody = document.getElementById('requests-tbody');
const requestsBadge = document.getElementById('requests-badge');

// Modal Elements
const boardModal = document.getElementById('board-modal');
const catModal = document.getElementById('cat-modal');

// --- Forms & Inputs ---
// Board Form
const boardForm = document.getElementById('board-form');
const boardModalTitle = document.getElementById('board-modal-title');
const fieldBoardId = document.getElementById('board-id');
const fieldBoardEnabled = document.getElementById('field-board-enabled');
const fieldBoardTitle = document.getElementById('field-board-title');
const categoriesChecklist = document.getElementById('categories-checklist');
let currentlySelectedCategories = [];

const fieldBoardReqLogin = document.getElementById('field-board-req-login');
const fieldBoardUrl = document.getElementById('field-board-url');
const fieldBoardIcon = document.getElementById('field-board-icon');
const fieldBoardNewTab = document.getElementById('field-board-new-tab');

// User Multi-select inside Board Form
const userSearchInput = document.getElementById('user-search');
const usersChecklist = document.getElementById('users-checklist');
let allUsersFetched = [];
let currentlySelectedUsers = [];

// Cat Form
const catForm = document.getElementById('cat-form');
const catModalTitle = document.getElementById('cat-modal-title');
const fieldCatId = document.getElementById('cat-id');
const fieldCatName = document.getElementById('field-cat-name');
const fieldCatDesc = document.getElementById('field-cat-desc');
const fieldCatIcon = document.getElementById('field-cat-icon');
const fieldCatType = document.getElementById('field-cat-type');
const fieldCatColorPicker = document.getElementById('field-cat-color-picker');
const fieldCatColorText = document.getElementById('field-cat-color');

// Search & Filter Listeners for Requests

// --- State ---
let isSubmitting = false;
let globalCategories = []; // to populate dropdowns
let allRequestsFetched = []; // Cache for filtering
let currentCatFilter = "Categorías";
let allBoardsFetched = [];
let currentBoardFilter = 'all';

const ADMIN_EMAILS = [
    'datos@riocuarto.gov.ar'
];

// --- Initialization & Auth ---
onAuthStateChanged(auth, async (user) => {
    loader.classList.add('hidden');
    if (user) {
        const userEmail = user.email.toLowerCase();
        const isAdminExact = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail);
        const isDomain = userEmail.endsWith('@riocuarto.gov.ar');
        
        if (isDomain || isAdminExact) { // For MVP
            showAdminUI(user);
            
            // Auto-register/update admin user in the directory
            try {
                await setDoc(doc(db, "users", userEmail), {
                    email: userEmail,
                    name: user.displayName || user.email.split('@')[0],
                    photoURL: user.photoURL || '',
                    lastLogin: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.warn("Could not auto-register admin user", e);
            }

            await loadData();
            await loadRequests(); // Load requests on init
        } else {
            showError("No tienes privilegios de administrador para ver o editar.");
            await signOut(auth);
        }
    } else {
        showError("Inicia sesión para acceder al panel de administración.");
    }
});

errorLoginBtn.addEventListener('click', () => signInWithPopup(auth, provider));
logoutBtn.addEventListener('click', () => signOut(auth));

function showAdminUI(user) {
    adminContent.classList.remove('hidden');
    errorScreen.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userInfo.classList.add('flex');
    adminAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName||user.email)}&background=212529&color=fff`;
    adminName.textContent = user.displayName || user.email;
}

function showError(msg) {
    adminContent.classList.add('hidden');
    userInfo.classList.add('hidden');
    userInfo.classList.remove('flex');
    errorScreen.classList.remove('hidden');
    errorMsg.textContent = msg;
}

// --- Tabs Logic ---
navTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        const target = tab.getAttribute('data-target');
        navTabs.forEach(t => {
            t.classList.remove('border-obelisco-blue', 'text-obelisco-blue');
            t.classList.add('border-transparent', 'text-gray-500');
        });
        tabPanes.forEach(pane => pane.classList.add('hidden'));
        
        tab.classList.remove('border-transparent', 'text-gray-500');
        tab.classList.add('border-obelisco-blue', 'text-obelisco-blue');
        
        const targetPane = document.getElementById(target);
        if (targetPane) targetPane.classList.remove('hidden');

        // Reload data for specific tabs
        if (target === 'tab-tableros') loadBoards();
        if (target === 'tab-categorias') loadCategories();
        if (target === 'tab-usuarios') loadUsers();
        if (target === 'tab-solicitudes') loadRequests();
    });
});

// --- LOAD MASTER DATA ---
async function loadData() {
    await Promise.all([
        loadUsers(),
        loadCategories(),
        loadBoards(),
        loadRequests()
    ]);
}// --- USERS LISTING & SELECTOR ---
filterUserSearch?.addEventListener('input', () => {
    filterAndRenderUsers();
});

function filterAndRenderUsers() {
    const filterText = filterUserSearch.value.toLowerCase().trim();
    const filtered = allUsersFetched.filter(u => {
        const name = (u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const orgName = (u.orgName || '').toLowerCase();
        const orgType = (u.orgType || '').toLowerCase();
        return name.includes(filterText) || 
               email.includes(filterText) || 
               orgName.includes(filterText) || 
               orgType.includes(filterText);
    });
    renderUsersTable(filtered);
}

async function loadUsers() {
    console.log("Admin JS v1.2.1 - Loading users...");
    try {
        const snapshot = await getDocs(collection(db, "users"));
        allUsersFetched = [];
        snapshot.forEach(userDoc => {
            allUsersFetched.push({ id: userDoc.id, ...userDoc.data() });
        });
        filterAndRenderUsers();
        renderUserChecklist();
    } catch (error) {
        console.error(error);
        usersTbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-red-500">Error cargando usuarios.</td></tr>`;
    }
}

function renderUsersTable(users) {
    if (!usersTbody) return;
    usersTbody.innerHTML = '';
    
    if (users.length === 0) {
        usersTbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-obelisco-gray">No se encontraron usuarios.</td></tr>`;
        return;
    }

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition";
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'N/A';
        const registered = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A';
        const role = u.role || 'usuario';
        
        tr.innerHTML = `
            <td class="py-3 px-4 flex items-center space-x-3">
                <img src="${u.photoURL || `https://ui-avatars.com/api/?name=${u.name}&background=random`}" class="w-8 h-8 rounded-full border border-gray-200">
                <div class="flex flex-col">
                    <span class="font-medium">${u.name}</span>
                    <span class="text-xs text-obelisco-gray">${u.email}</span>
                </div>
            </td>
            <td class="py-3 px-4">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-obelisco-blue uppercase">${u.orgType || 'N/A'}</span>
                    <span class="text-sm font-medium">${u.orgName || '-'}</span>
                    <span class="text-[10px] text-obelisco-gray uppercase">${u.orgRole || '-'}</span>
                </div>
            </td>
            <td class="py-3 px-4">
                <div class="flex flex-col text-[10px] text-obelisco-gray uppercase">
                    <span>Reg: ${registered}</span>
                    <span>Acc: ${lastLogin}</span>
                </div>
            </td>
            <td class="py-3 px-4">
                <div class="flex items-center space-x-2">
                    <select class="role-select text-xs border border-gray-300 rounded px-2 py-1 bg-white outline-none focus:border-obelisco-blue" data-id="${u.id}" data-original="${role}">
                        <option value="usuario" ${role === 'usuario' ? 'selected' : ''}>Usuario del Observatorio</option>
                        <option value="lector" ${role === 'lector' ? 'selected' : ''}>Lector</option>
                    </select>
                    <button class="btn-save-role hidden bg-green-500 hover:bg-green-600 text-white p-1 rounded transition-opacity" title="Guardar Cambio de Rol">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-3 px-4 text-right">
                <button class="text-red-500 hover:text-red-700 font-medium btn-del-user" data-id="${u.id}">Eliminar</button>
            </td>
        `;
        usersTbody.appendChild(tr);

        // Role change logic with save button
        const roleSelect = tr.querySelector('.role-select');
        const saveBtn = tr.querySelector('.btn-save-role');

        roleSelect.addEventListener('change', (e) => {
            const currentRole = e.target.value;
            const originalRole = e.target.getAttribute('data-original');
            if (currentRole !== originalRole) {
                saveBtn.classList.remove('hidden');
            } else {
                saveBtn.classList.add('hidden');
            }
        });

        saveBtn.addEventListener('click', async () => {
            const newRole = roleSelect.value;
            try {
                saveBtn.disabled = true;
                saveBtn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
                await updateDoc(doc(db, "users", u.id), { role: newRole });
                alert("Rol actualizado correctamente.");
                await loadUsers(); // Refresh the table
            } catch (err) {
                console.error("Error updating role:", err);
                alert("No se pudo actualizar el rol.");
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
            }
        });

        // Delete user listener
        tr.querySelector('.btn-del-user').addEventListener('click', () => deleteUser(u.id));
    });
}

async function deleteUser(id) {
    if (confirm("¿Estás seguro que querés eliminar este usuario?")) {
        try {
            // 1. Get user details before deleting to have the email
            const userDoc = await getDoc(doc(db, "users", id));
            if (userDoc.exists()) {
                const userEmail = userDoc.data().email.toLowerCase();
                
                // 2. Remove user from all buttons/boards permissions
                const buttonsSnapshot = await getDocs(collection(db, "buttons"));
                const updatePromises = [];
                
                buttonsSnapshot.forEach(buttonDoc => {
                    const data = buttonDoc.data();
                    const allowedUsers = data.allowedUsers || [];
                    if (allowedUsers.map(e => e.toLowerCase()).includes(userEmail)) {
                        const newAllowedUsers = allowedUsers.filter(e => e.toLowerCase() !== userEmail);
                        updatePromises.push(updateDoc(buttonDoc.ref, { allowedUsers: newAllowedUsers }));
                    }
                });
                
                if (updatePromises.length > 0) {
                    await Promise.all(updatePromises);
                    console.log(`User ${userEmail} removed from ${updatePromises.length} boards.`);
                }
            }

            // 3. Delete the user document
            await deleteDoc(doc(db, "users", id));
            loadUsers();
        } catch (error) {
            console.error("Error deleting user:", error);
            alert("No se pudo eliminar el usuario completamente.");
        }
    }
}

// --- REQUESTS LOGIC ---
async function loadRequests() {
    try {
        const querySnapshot = await getDocs(collection(db, "requests"));
        allRequestsFetched = [];
        querySnapshot.forEach((doc) => {
            allRequestsFetched.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by date desc
        allRequestsFetched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const pendingCount = allRequestsFetched.filter(r => r.status === 'pending').length;
        if (pendingCount > 0) {
            requestsBadge.textContent = pendingCount;
            requestsBadge.classList.remove('hidden');
        } else {
            requestsBadge.classList.add('hidden');
        }

        filterAndRenderRequests();
    } catch (error) {
        console.error("Error loading requests:", error);
    }
}

function filterAndRenderRequests() {
    const userSearch = document.getElementById('filter-request-user').value.toLowerCase();
    const statusFilter = document.getElementById('filter-request-status').value;

    const filtered = allRequestsFetched.filter(req => {
        const matchesUser = req.userEmail.toLowerCase().includes(userSearch);
        const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
        return matchesUser && matchesStatus;
    });

    renderRequests(filtered);
}

// Filter listeners
document.getElementById('filter-request-user')?.addEventListener('input', filterAndRenderRequests);
document.getElementById('filter-request-status')?.addEventListener('change', filterAndRenderRequests);


function renderRequests(requests) {
    if (!requestsTbody) return;
    if (requests.length === 0) {
        requestsTbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-obelisco-gray">No se encontraron solicitudes con esos filtros.</td></tr>';
        return;
    }

    requestsTbody.innerHTML = '';
    requests.forEach(req => {
        const date = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-';
        const status = req.status || 'pending';
        
        let statusBadge = '';
        switch(status) {
            case 'approved': statusBadge = '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-[10px] uppercase">Aprobada</span>'; break;
            case 'rejected': statusBadge = '<span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold text-[10px] uppercase">Rechazada</span>'; break;
            case 'restricted': statusBadge = '<span class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-bold text-[10px] uppercase">Restringida</span>'; break;
            default: statusBadge = '<span class="px-2 py-0.5 bg-obelisco-light text-obelisco-blue rounded-full font-bold text-[10px] uppercase">Pendiente</span>';
        }

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition-colors";
        tr.innerHTML = `
            <td class="py-4 px-4 whitespace-nowrap text-xs text-gray-500">${date}</td>
            <td class="py-4 px-4 font-medium flex flex-col">
                <span>${req.userEmail}</span>
                ${statusBadge}
            </td>
            <td class="py-4 px-4 text-xs font-semibold">${req.buttonName || 'ID: ' + req.buttonId}</td>
            <td class="py-4 px-4 italic text-obelisco-gray text-xs">"${req.reason}"</td>
            <td class="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                ${(status === 'pending' || status === 'rejected' || status === 'restricted') ? `
                <button class="btn-approve text-green-600 hover:bg-green-100 p-2 rounded" data-id="${req.id}" data-email="${req.userEmail}" data-button="${req.buttonId}" title="Aprobar Acceso">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                </button>
                ` : ''}
                
                ${status === 'pending' ? `
                <button class="btn-reject text-orange-500 hover:bg-orange-50 p-2 rounded" data-id="${req.id}" title="Rechazar">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                ` : ''}

                <button class="btn-del-req text-red-400 hover:text-red-600 p-2" data-id="${req.id}" title="Eliminar del historial">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </td>
        `;
        
        if (status === 'pending' || status === 'rejected' || status === 'restricted') {
            tr.querySelector('.btn-approve').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';
                await approveRequest(req.id, req.userEmail, req.buttonId);
            });
        }
        if (status === 'pending') {
            tr.querySelector('.btn-reject').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';
                await updateRequestStatus(req.id, 'rejected');
            });
        }
        tr.querySelector('.btn-del-req').addEventListener('click', () => deleteDocReq("requests", req.id));
        
        requestsTbody.appendChild(tr);
    });
}

async function updateRequestStatus(requestId, newStatus) {
    try {
        await updateDoc(doc(db, "requests", requestId), { status: newStatus });
        await loadRequests();
    } catch (e) { console.error(e); }
}

async function approveRequest(requestId, email, buttonId) {
    try {
        // 1. Get the button doc
        const buttonRef = doc(db, "buttons", buttonId);
        const buttonSnap = await getDoc(buttonRef);
        
        if (buttonSnap.exists()) {
            const data = buttonSnap.data();
            const allowedUsers = data.allowedUsers || [];
            
            // Add email if not already there
            if (!allowedUsers.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
                allowedUsers.push(email);
                await updateDoc(buttonRef, { allowedUsers });
            }
            
            // 2. Mark request as approved
            await updateDoc(doc(db, "requests", requestId), { status: 'approved' });
            await loadRequests();
        } else {
            // Board no longer exists — just delete the request
            await deleteDoc(doc(db, "requests", requestId));
            await loadRequests();
        }
    } catch (error) {
        console.error("Error approving request:", error);
    }
}

function renderUserChecklist(filterText = '') {
    usersChecklist.innerHTML = '';
    const filtered = allUsersFetched.filter(u => u.email.toLowerCase().includes(filterText.toLowerCase()) || u.name.toLowerCase().includes(filterText.toLowerCase()));
    if (filtered.length === 0) {
        usersChecklist.innerHTML = `<p class="text-xs text-center text-gray-500 py-4">No se encontraron usuarios.</p>`;
        return;
    }
    filtered.forEach(u => {
        const userEmail = u.email.toLowerCase();
        const isAdmin = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail);
        const isLector = u.role === 'lector';
        
        const isChecked = isAdmin || isLector || currentlySelectedUsers.includes(userEmail) ? 'checked' : '';
        const disabledAttr = (isAdmin || isLector) ? 'disabled' : '';
        
        let badgeHtml = '';
        if (isAdmin) badgeHtml = '<span class="ml-auto text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold uppercase">Admin (Acceso Total)</span>';
        else if (isLector) badgeHtml = '<span class="ml-auto text-[9px] bg-green-100 text-green-700 px-1 rounded font-bold uppercase">Lector (Acceso Total)</span>';
        
        const div = document.createElement('div');
        div.className = `flex items-center space-x-2 p-2 hover:bg-gray-50 rounded border border-transparent hover:border-gray-200 cursor-pointer transition ${(isAdmin || isLector) ? 'opacity-70' : ''}`;
        div.innerHTML = `
            <input type="checkbox" id="user-${u.email}" value="${u.email}" class="user-checkbox w-4 h-4 text-obelisco-blue rounded border-gray-300 pointer-events-none" ${isChecked} ${disabledAttr}>
            <label for="user-${u.email}" class="text-sm font-medium cursor-pointer flex-grow pointer-events-none flex items-center">
                <span class="block truncate max-w-[150px]">${u.name}</span> 
                <span class="text-[10px] text-gray-400 font-normal block truncate ml-2">(${u.email})</span>
                ${badgeHtml}
            </label>
        `;
        div.addEventListener('click', () => {
            if (isAdmin || isLector) return;
            const cb = div.querySelector('input');
            cb.checked = !cb.checked;
            const email = u.email.toLowerCase();
            if (cb.checked) {
                if (!currentlySelectedUsers.includes(email)) currentlySelectedUsers.push(email);
            } else {
                currentlySelectedUsers = currentlySelectedUsers.filter(e => e.toLowerCase() !== email);
            }
        });
        usersChecklist.appendChild(div);
    });

    // Option to add manually if filterText looks like an email and not in the list
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const lowerFilter = filterText.toLowerCase().trim();
    const alreadyInList = allUsersFetched.some(u => u.email.toLowerCase() === lowerFilter) || 
                         currentlySelectedUsers.some(e => e.toLowerCase() === lowerFilter);

    if (emailRegex.test(lowerFilter) && !alreadyInList) {
        const divManual = document.createElement('div');
        divManual.className = "mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between cursor-pointer hover:bg-blue-100 transition";
        divManual.innerHTML = `
            <div class="flex flex-col">
                <span class="text-xs font-bold text-obelisco-blue uppercase">Email no registrado</span>
                <span class="text-sm font-medium truncate max-w-[200px]">${lowerFilter}</span>
            </div>
            <button type="button" class="bg-obelisco-blue text-white text-xs px-3 py-1.5 rounded font-bold hover:bg-blue-700">
                Autorizar
            </button>
        `;
        divManual.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!currentlySelectedUsers.map(u=>u.toLowerCase()).includes(lowerFilter)) {
                currentlySelectedUsers.push(lowerFilter);
                userSearchInput.value = '';
                renderUserChecklist();
            }
        });
        usersChecklist.appendChild(divManual);
    }
}
userSearchInput.addEventListener('input', (e) => renderUserChecklist(e.target.value));

// --- CATEGORIES LISTING & SELECTOR ---
function renderCategoryChecklist() {
    categoriesChecklist.innerHTML = '';
    // Virtual option: assign board directly to Gestores Externos (no real category needed)
    const vIsChecked = currentlySelectedCategories.includes('_ge_direct');
    const vDiv = document.createElement('div');
    vDiv.className = `flex items-center space-x-2 p-2 rounded border cursor-pointer transition mb-1 ${vIsChecked ? 'border-blue-300 bg-blue-50' : 'border-dashed border-blue-200 hover:bg-blue-50'}`;
    vDiv.innerHTML = `
        <input type="checkbox" class="w-4 h-4 text-obelisco-blue rounded border-gray-300 pointer-events-none" ${vIsChecked ? 'checked' : ''}>
        <span class="pointer-events-none">🌐</span>
        <span class="text-sm font-semibold pointer-events-none text-obelisco-blue">Gestores Externos <span class="text-xs text-gray-400 font-normal">· sin categoría específica</span></span>
    `;
    vDiv.addEventListener('click', () => {
        const cb = vDiv.querySelector('input');
        cb.checked = !cb.checked;
        vDiv.className = `flex items-center space-x-2 p-2 rounded border cursor-pointer transition mb-1 ${cb.checked ? 'border-blue-300 bg-blue-50' : 'border-dashed border-blue-200 hover:bg-blue-50'}`;
        if (cb.checked) { if (!currentlySelectedCategories.includes('_ge_direct')) currentlySelectedCategories.push('_ge_direct'); }
        else { currentlySelectedCategories = currentlySelectedCategories.filter(id => id !== '_ge_direct'); }
    });
    categoriesChecklist.appendChild(vDiv);
    if (globalCategories.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-xs text-center text-gray-500 py-4';
        p.textContent = 'No hay categorías creadas aún.';
        categoriesChecklist.appendChild(p);
        return;
    }
    globalCategories.forEach(c => {
        const isChecked = currentlySelectedCategories.includes(c.id) ? 'checked' : '';
        const div = document.createElement('div');
        div.className = "flex items-center space-x-2 p-2 hover:bg-gray-50 rounded border border-transparent hover:border-gray-200 cursor-pointer transition";
        div.innerHTML = `
            <input type="checkbox" id="cat-${c.id}" value="${c.id}" class="cat-checkbox w-4 h-4 text-obelisco-blue rounded border-gray-300 pointer-events-none" ${isChecked}>
            <span class="w-3 h-3 rounded-full border border-gray-300 inline-block pointer-events-none" style="background-color: ${c.color}"></span>
            <span class="text-sm font-medium pointer-events-none" style="margin-left: 0.25rem;">${c.icon ? c.icon + ' ' : ''}${c.name}</span>
            <span class="text-xs text-obelisco-gray ml-auto pointer-events-none">(${c.type || 'Categorías'})</span>
        `;
        div.addEventListener('click', () => {
            const cb = div.querySelector('input');
            cb.checked = !cb.checked;
            if (cb.checked) {
                if (!currentlySelectedCategories.includes(c.id)) currentlySelectedCategories.push(c.id);
            } else currentlySelectedCategories = currentlySelectedCategories.filter(id => id !== c.id);
        });
        categoriesChecklist.appendChild(div);
    });
}

// --- CATEGORIES CRUD ---
fieldCatColorPicker.addEventListener('input', e => fieldCatColorText.value = e.target.value.toUpperCase());
fieldCatColorText.addEventListener('input', e => { if(/^#[0-9A-F]{6}$/i.test(e.target.value)) fieldCatColorPicker.value = e.target.value; });

async function loadCategories() {
    try {
        const snapshot = await getDocs(collection(db, "categories"));
        globalCategories = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            globalCategories.push({id, ...data});
        });
        
        renderCategories();
        renderCategoryChecklist();
    } catch (error) { console.error(error); }
}

function renderCategories() {
    catTbody.innerHTML = '';
    
    // Sort all by order FIRST to maintain global ordering
    globalCategories.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const filtered = globalCategories.filter(cat => (cat.type || 'Categorías') === currentCatFilter);

    if (filtered.length === 0) {
        catTbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-obelisco-gray">No hay elementos en esta sección.</td></tr>`;
        return;
    }

    filtered.forEach(cat => {
        const data = cat;
        const id = cat.id;
        const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition";
            tr.innerHTML = `
                <td class="py-3 px-4 font-medium text-xl text-center">${data.icon || '📌'}</td>
                <td class="py-3 px-4 font-medium">${data.name}</td>
                <td class="py-3 px-4 text-obelisco-gray text-xs truncate" title="${data.type || 'Categorías'}">
                    <span class="bg-gray-100 border border-gray-200 px-2 py-1 rounded inline-block">${data.type || 'Categorías'}</span>
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center space-x-2">
                        <span class="w-4 h-4 rounded-full border border-gray-300" style="background-color: ${data.color}"></span>
                        <span class="font-mono text-xs">${data.color}</span>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <input type="number" class="w-16 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-obelisco-blue cat-order-input" value="${data.order || 0}" data-id="${id}">
                </td>
                <td class="py-3 px-4 text-right space-x-2">
                    <button class="text-obelisco-blue hover:text-blue-800 font-medium btn-edit-cat" data-id="${id}">Editar</button>
                    <button class="text-red-500 hover:text-red-700 font-medium btn-del-cat" data-id="${id}">Eliminar</button>
                </td>
            `;
            catTbody.appendChild(tr);
            tr.querySelector('.btn-edit-cat').addEventListener('click', () => {
                fieldCatId.value = id;
                fieldCatName.value = data.name;
                fieldCatDesc.value = data.description || '';
                fieldCatIcon.value = data.icon || '';
                fieldCatType.value = data.type || 'Categorías';
                fieldCatColorText.value = data.color;
                fieldCatColorPicker.value = data.color;
                catModalTitle.textContent = "Editar Categoría";
                catModal.classList.remove('hidden');
                catModal.classList.add('flex');
            });
            tr.querySelector('.btn-del-cat').addEventListener('click', () => deleteDocReq("categories", id));
            
            // Auto-save order on change
            tr.querySelector('.cat-order-input').addEventListener('change', async (e) => {
                const newOrder = parseInt(e.target.value) || 0;
                try {
                    await updateDoc(doc(db, "categories", id), { order: newOrder });
                    // Optionally alert or just refresh
                    await loadCategories(); 
                } catch (err) {
                    console.error("Error updating order:", err);
                    alert("No se pudo actualizar el orden.");
                }
            });
        });
        
        renderCategoryChecklist();
}

// Cat filter listeners
document.querySelectorAll('.cat-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        currentCatFilter = e.target.dataset.type;
        
        // Update UI styles
        document.querySelectorAll('.cat-filter-btn').forEach(b => {
            b.classList.remove('active-cat-filter', 'bg-white', 'text-obelisco-blue', 'shadow-sm');
            b.classList.add('text-gray-600', 'hover:bg-gray-200');
        });
        btn.classList.add('active-cat-filter', 'bg-white', 'text-obelisco-blue', 'shadow-sm');
        btn.classList.remove('text-gray-600', 'hover:bg-gray-200');
        
        renderCategories();
    });
});

addCatBtn.addEventListener('click', () => {
    catForm.reset();
    fieldCatId.value = '';
    fieldCatDesc.value = '';
    fieldCatColorPicker.value = '#009DE0';
    fieldCatColorText.value = '#009DE0';
    catModalTitle.textContent = "Nueva Categoría";
    catModal.classList.remove('hidden');
    catModal.classList.add('flex');
});

catForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    try {
        const docId = fieldCatId.value;
        const data = {
            name: fieldCatName.value.trim(),
            description: fieldCatDesc.value.trim(),
            icon: fieldCatIcon.value.trim(),
            type: fieldCatType.value,
            color: fieldCatColorText.value.trim().toUpperCase()
        };
        if (docId) await updateDoc(doc(db, "categories", docId), data);
        else {
            // New categories default to end of list
            const maxOrder = globalCategories.length > 0 ? Math.max(...globalCategories.map(c => c.order || 0)) : 0;
            data.order = maxOrder + 1;
            await addDoc(collection(db, "categories"), data);
        }
        closeAllModals();
        await loadCategories(); 
    } catch (e) { 
        console.error("Error saving category:", e);
        const errorDetails = `CÓDIGO: ${e.code || 'N/A'}\nMENSAJE: ${e.message || 'Error desconocido'}`;
        alert("🚨 ERROR AL GUARDAR CATEGORÍA 🚨\n\n" + errorDetails + "\n\nPor favor, enviame estos datos para solucionarlo."); 
    } finally { isSubmitting = false; }
});

// --- BOARDS CRUD ---
function boardMatchesFilter(data, filterType) {
    if (filterType === 'all') return true;
    if (data.categories && data.categories.length > 0) {
        return data.categories.some(catId => {
            const cat = globalCategories.find(c => c.id === catId);
            return cat && (cat.type || 'Categorías') === filterType;
        });
    }
    return (data.category || '') === filterType;
}

async function loadBoards() {
    try {
        const snapshot = await getDocs(collection(db, "buttons"));
        allBoardsFetched = [];
        snapshot.forEach((docSnap) => allBoardsFetched.push({ id: docSnap.id, ...docSnap.data() }));
        filterAndRenderBoards();
    } catch (error) { console.error(error); }
}

function filterAndRenderBoards() {
    boardsTbody.innerHTML = '';
    const filtered = allBoardsFetched.filter(b => boardMatchesFilter(b, currentBoardFilter));
    if (filtered.length === 0) {
        boardsTbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-obelisco-gray bg-gray-50">No hay tableros en esta sección.</td></tr>`;
        return;
    }
    // Sort by order field
    filtered.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    filtered.forEach((data) => {
        const id = data.id;
        const allowedCount = (data.allowedUsers || []).length;
        const accessBadge = allowedCount === 0 && data.requireLogin
            ? `<span class="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-xs">Público bloq.</span>`
            : (data.requireLogin
                ? `<span class="bg-blue-50 text-obelisco-blue border border-blue-200 px-2 py-0.5 rounded text-xs">${allowedCount} autorizados</span>`
                : `<span class="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-xs">Público abierto</span>`);
        const catNames = (data.categories || []).map(catId => {
            const c = globalCategories.find(gc => gc.id === catId);
            return c ? c.name : 'Desc.';
        }).join(', ') || data.category || 'Sin Categoría';
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition";
        tr.innerHTML = `
            <td class="py-3 px-4 cursor-pointer text-center" title="Click para alternar estado" data-toggle="${id}">
                ${data.enabled ? '<span class="w-3 h-3 bg-green-500 rounded-full inline-block shadow-sm"></span>' : '<span class="w-3 h-3 bg-red-500 rounded-full inline-block shadow-sm"></span>'}
            </td>
            <td class="py-3 px-4 font-medium"><span class="mr-2">${data.icon || '📌'}</span>${data.title}</td>
            <td class="py-3 px-4 text-obelisco-gray text-xs truncate max-w-[200px]" title="${catNames}">${catNames}</td>
            <td class="py-3 px-4">${accessBadge}</td>
            <td class="py-3 px-4">
                <input type="number" class="w-16 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-obelisco-blue board-order-input" value="${data.order || 0}" data-id="${id}">
            </td>
            <td class="py-3 px-4 text-right space-x-2">
                <button class="text-obelisco-blue hover:text-blue-800 font-medium btn-edit-board" data-id="${id}">Editar</button>
                <button class="text-red-500 hover:text-red-700 font-medium btn-del-board" data-id="${id}">Eliminar</button>
            </td>
        `;
        boardsTbody.appendChild(tr);
        tr.querySelector(`[data-toggle="${id}"]`).addEventListener('click', async () => {
            try { await updateDoc(doc(db, "buttons", id), { enabled: !data.enabled }); loadBoards(); }
            catch(e){ console.error(e); }
        });
        // Auto-save order on change
        tr.querySelector('.board-order-input').addEventListener('change', async (e) => {
            const newOrder = parseInt(e.target.value) || 0;
            try {
                await updateDoc(doc(db, "buttons", id), { order: newOrder });
                await loadBoards();
            } catch (err) { console.error("Error updating board order:", err); }
        });
        tr.querySelector('.btn-edit-board').addEventListener('click', () => {
            boardModalTitle.textContent = 'Editar Tablero';
            fieldBoardId.value = id;
            fieldBoardEnabled.checked = data.enabled !== false;
            fieldBoardTitle.value = data.title || '';
            fieldBoardUrl.value = data.iframeUrl || '';
            fieldBoardIcon.value = data.icon || '';
            fieldBoardReqLogin.value = data.requireLogin !== false ? 'true' : 'false';
            fieldBoardNewTab.checked = data.openInNewTab === true;
            currentlySelectedUsers = (data.allowedUsers || []).map(u => u.toLowerCase()).filter(email =>
                allUsersFetched.some(u => u.email.toLowerCase() === email) ||
                ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)
            );
            userSearchInput.value = '';
            renderUserChecklist();
            // Handle categories including virtual GE direct
            currentlySelectedCategories = data.categories || [];
            if (currentlySelectedCategories.length === 0 && data.category) {
                if (data.category === 'Gestores Externos') {
                    currentlySelectedCategories = ['_ge_direct'];
                } else {
                    const matchedCat = globalCategories.find(c => c.name === data.category);
                    if (matchedCat) currentlySelectedCategories.push(matchedCat.id);
                }
            }
            renderCategoryChecklist();
            boardModal.classList.remove('hidden');
            boardModal.classList.add('flex');
        });
        tr.querySelector('.btn-del-board').addEventListener('click', () => deleteDocReq("buttons", id));
    });
}

// Board group filter buttons
document.querySelectorAll('.board-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        currentBoardFilter = targetBtn.dataset.filter;
        document.querySelectorAll('.board-filter-btn').forEach(b => {
            b.classList.remove('active-board-filter', 'bg-white', 'text-obelisco-blue', 'shadow-sm');
            b.classList.add('text-gray-600', 'hover:bg-gray-200');
        });
        targetBtn.classList.add('active-board-filter', 'bg-white', 'text-obelisco-blue', 'shadow-sm');
        targetBtn.classList.remove('text-gray-600', 'hover:bg-gray-200');
        filterAndRenderBoards();
    });
});

addBoardBtn.addEventListener('click', () => {
    boardForm.reset();
    fieldBoardId.value = '';
    fieldBoardReqLogin.value = 'true';
    fieldBoardNewTab.checked = false;
    currentlySelectedUsers = []; 
    userSearchInput.value = '';
    renderUserChecklist();
    
    currentlySelectedCategories = [];
    renderCategoryChecklist();
    
    boardModalTitle.textContent = 'Nuevo Tablero';
    boardModal.classList.remove('hidden');
    boardModal.classList.add('flex');
});

boardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    try {
        const docId = fieldBoardId.value;
        // Handle virtual 'Gestores Externos directo' sentinel
        const hasGEDirect = currentlySelectedCategories.includes('_ge_direct');
        const finalCategories = currentlySelectedCategories.filter(id => id !== '_ge_direct');
        const boardData = {
            enabled: fieldBoardEnabled.checked,
            title: fieldBoardTitle.value.trim(),
            icon: fieldBoardIcon.value.trim(),
            categories: finalCategories,
            category: hasGEDirect ? 'Gestores Externos' : '',
            requireLogin: fieldBoardReqLogin.value === 'true',
            iframeUrl: fieldBoardUrl.value.trim(),
            openInNewTab: fieldBoardNewTab.checked,
            allowedUsers: currentlySelectedUsers.filter(email =>
                allUsersFetched.some(u => u.email.toLowerCase() === email.toLowerCase()) ||
                ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase())
            ),
            updatedAt: new Date().toISOString()
        };

        // Logic to detect removed users and mark requests as "restricted"
        if (docId) {
            const oldDoc = await getDoc(doc(db, "buttons", docId));
            if (oldDoc.exists()) {
                const oldUsers = (oldDoc.data().allowedUsers || []).map(u => u.toLowerCase());
                const currentUsersLower = currentlySelectedUsers.map(u => u.toLowerCase());
                
                const removedUsers = oldUsers.filter(u => !currentUsersLower.includes(u));
                
                if (removedUsers.length > 0) {
                    // Update related requests by querying Firestore — use Promise.all so awaits are respected
                    const reqSnap = await getDocs(collection(db, "requests"));
                    const restrictUpdates = [];
                    reqSnap.forEach((rDoc) => {
                        const rData = rDoc.data();
                        if (rData.buttonId === docId && 
                            removedUsers.includes((rData.userEmail || '').toLowerCase()) && 
                            rData.status === 'approved') {
                            restrictUpdates.push(updateDoc(doc(db, "requests", rDoc.id), { status: 'restricted' }));
                        }
                    });
                    if (restrictUpdates.length > 0) await Promise.all(restrictUpdates);
                }
            }
            await updateDoc(doc(db, "buttons", docId), boardData);
        } else {
            boardData.createdAt = new Date().toISOString();
            await addDoc(collection(db, "buttons"), boardData);
        }
        
        closeAllModals();
        await loadBoards(); 
        await loadRequests(); // Reload to see status changes
    } catch (error) { 
        console.error("Error saving board:", error);
        alert("Error al guardar tablero: " + (error.code || error.message || "Error desconocido")); 
    } finally { isSubmitting = false; }
});

// --- UTILITIES ---
function closeAllModals() {
    boardModal.classList.add('hidden');
    boardModal.classList.remove('flex');
    catModal.classList.add('hidden');
    catModal.classList.remove('flex');
}
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeAllModals));

async function deleteDocReq(collectionName, id) {
    if (confirm("¿Estás seguro que querés eliminar esto permanentemente?")) {
        try {
            await deleteDoc(doc(db, collectionName, id));
            if(collectionName === 'buttons') await loadBoards();
            if(collectionName === 'categories') await loadCategories();
            if(collectionName === 'requests') await loadRequests();
        } catch (error) { console.error(error); alert("No se pudo eliminar."); }
    }
}

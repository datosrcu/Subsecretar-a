import { app, auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, getDocs, doc, getDoc } from './firebase-config.js';
import { setDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const authSection = document.getElementById('auth-section');

// Filter UI Elements
const filterButtons = document.querySelectorAll('.filter-btn');
const filtersContainer = document.getElementById('dashboard-filters');
let currentFilterGroup = 'Gestores Internos';
let allAccessibleBoards = [];
let allCategories = [];
let currentUserRole = 'usuario';
let currentUserRequests = [];

// Registration Modal Elements
const registrationModal = document.getElementById('registration-modal');
const registrationForm = document.getElementById('registration-form');

const ADMIN_EMAILS = [
    'datos@riocuarto.gov.ar'
];
console.log("Auth JS v1.2 - Loaded");

// Navigation State
let currentViewLevel = 'categories'; // 'categories' or 'boards'
let currentSelectedCategory = null; // ID of the category being viewed

// Modal Elements
const modal = document.getElementById('ogb-modal');
const modalHeading = document.getElementById('ogb-heading');
const modalIframeWrap = document.getElementById('ogb-iframe-wrap');
const modalIframe = document.getElementById('ogb-iframe');
const modalLoader = document.getElementById('iframe-loader');
const fullScreenBtn = document.getElementById('ogb-full');
const ogbDirectLink = document.getElementById('ogb-direct-link');
const iframeFallback = document.getElementById('iframe-fallback');
const ogbFallbackBtn = document.getElementById('ogb-fallback-btn');
const unauthOverlay = document.getElementById('unauth-overlay');

// Allowed Domain
const ALLOWED_DOMAIN = "@riocuarto.gov.ar";

// Current User State
let currentUser = null;

// Listen for auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        const userEmail = user.email.toLowerCase();
        const isAdmin = ['datos@riocuarto.gov.ar', 'pfabbroni@riocuarto.gov.ar'].includes(userEmail);

        if (!user.email.endsWith(ALLOWED_DOMAIN) && !isAdmin) {
            // User is not from allowed domain nor an admin, sign them out
            await signOut(auth);
            alert(`Acceso denegado. Solo se permiten correos institucionales terminados en ${ALLOWED_DOMAIN}`);
            showLoginUI();
        } else {
            // User is allowed (domain matches or is admin)
            showUserUI(user);
            await loadUserPermissions(user);
        }
    } else {
        // User is signed out
        showLoginUI();
    }
});

// Login function
async function handleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const userEmail = user.email.toLowerCase();
        const isAdmin = ['datos@riocuarto.gov.ar', 'pfabbroni@riocuarto.gov.ar'].includes(userEmail);

        // Check domain immediately after login popup succeeds
        if (!user.email.endsWith(ALLOWED_DOMAIN) && !isAdmin) {
            await signOut(auth);
            alert(`Acceso denegado. Solo se permiten correos institucionales terminados en ${ALLOWED_DOMAIN}`);
        } else {
            // Register user in the database for the admin panel to see
            try {
                await setDoc(doc(db, "users", user.email.toLowerCase()), {
                    email: user.email.toLowerCase(),
                    name: user.displayName || user.email.split('@')[0],
                    photoURL: user.photoURL || '',
                    lastLogin: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.warn("Could not register user to DB, might lack permissions", e);
            }
        }
    } catch (error) {
        console.error("Error during login:", error);
        alert("Ocurrió un error al intentar iniciar sesión. Por favor, intente nuevamente.");
    }
}

// Logout function
async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error during logout:", error);
    }
}

// UI State Management
function showLoginUI() {
    loginBtn.classList.remove('hidden');
    userAvatar.classList.add('hidden');
    userName.classList.add('hidden');
    logoutBtn.classList.add('hidden');

    // Show overlay & hide filters
    if (unauthOverlay) unauthOverlay.style.display = 'flex';
    if (filtersContainer) filtersContainer.classList.add('hidden');

    // Clear grid
    const gridContainer = document.getElementById('tableros-grid');
    if (gridContainer) gridContainer.innerHTML = '';
}

function showUserUI(user) {
    loginBtn.classList.add('hidden');
    userAvatar.classList.remove('hidden');
    userName.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=009DE0&color=fff`;
    userName.textContent = user.displayName || user.email.split('@')[0];

    // Hide overlay & show filters
    if (unauthOverlay) unauthOverlay.style.display = 'none';
    if (filtersContainer) filtersContainer.classList.remove('hidden');
}

async function loadUserPermissions(user) {
    const userEmail = user.email.toLowerCase();
    console.log("Loading permissions for user:", userEmail);

    try {
        const [buttonsSnapshot, catSnapshot, userDoc, reqSnapshot] = await Promise.all([
            getDocs(collection(db, "buttons")),
            getDocs(collection(db, "categories")),
            getDoc(doc(db, "users", userEmail)),
            getDocs(collection(db, "requests")) // We fetch all for now, filter in memory for efficiency or query if large
        ]);

        // Cache role
        let hasProfileInfo = false;
        if (userDoc.exists()) {
            const userData = userDoc.data();
            currentUserRole = userData.role || 'usuario';
            hasProfileInfo = !!(userData.orgType && userData.orgName && userData.orgRole);
        } else {
            currentUserRole = 'usuario';
        }

        // Show registration modal if missing info
        if (!hasProfileInfo && registrationModal) {
            registrationModal.classList.remove('hidden');
            registrationModal.classList.add('flex');
        }

        // Cache user requests (filtered by email)
        currentUserRequests = [];
        reqSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.userEmail && data.userEmail.toLowerCase() === userEmail) {
                currentUserRequests.push({ id: doc.id, ...data });
            }
        });

        // Cache categories and sort by order
        allCategories = [];
        catSnapshot.forEach(doc => allCategories.push({ id: doc.id, ...doc.data() }));
        allCategories.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

        // Cache all enabled boards and flag those with access
        allAccessibleBoards = [];
        buttonsSnapshot.forEach((doc) => {
            const data = doc.data();
            const buttonId = doc.id;

            if (data.enabled) {
                const hasAccess = checkUserAccess(user, data);
                allAccessibleBoards.push({ id: buttonId, ...data, hasAccess });
            }
        });

        renderDashboard();

    } catch (error) {
        console.error("Error loading user permissions:", error);
    }
}

function checkUserAccess(user, buttonData) {
    if (!buttonData.requireLogin) return true;
    if (!user) return false;

    const userEmail = user.email.toLowerCase();

    // Role status check (Full access for Lectors)
    if (currentUserRole === 'lector') return true;

    // Check if user is an admin by default
    if (ADMIN_EMAILS.includes(userEmail)) {
        console.log("Access granted: Admin user");
        return true;
    }

    const allowedUsers = buttonData.allowedUsers || [];
    return allowedUsers.map(email => email.toLowerCase()).includes(userEmail);
}

// Filter Listeners
filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;

        // UI reset
        filterButtons.forEach(b => {
            b.classList.remove('bg-white', 'text-obelisco-blue', 'border-gray-200', 'shadow-sm', 'active-filter');
            b.classList.add('bg-transparent', 'text-gray-600', 'border-transparent');
            const icon = b.querySelector('span.text-2xl');
            if (icon) icon.classList.add('opacity-80');
        });

        // Set active
        targetBtn.classList.remove('bg-transparent', 'text-gray-600', 'border-transparent');
        targetBtn.classList.add('bg-white', 'text-obelisco-blue', 'border-gray-200', 'shadow-sm', 'active-filter');
        const icon = targetBtn.querySelector('span.text-2xl');
        if (icon) icon.classList.remove('opacity-80');

        currentFilterGroup = targetBtn.getAttribute('data-group');
        currentViewLevel = 'categories';
        currentSelectedCategory = null;
        renderDashboard();
    });
});

function renderDashboard() {
    const gridContainer = document.getElementById('tableros-grid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    // Add breadcrumb if in boards view
    let headerHtml = '';
    if (currentViewLevel === 'boards' && currentSelectedCategory) {
        const cat = allCategories.find(c => c.id === currentSelectedCategory);
        const catName = cat ? cat.name : 'Categoría';

        headerHtml = `
            <div class="col-span-full mb-4 flex items-center">
                <button id="btn-back-categories" class="text-obelisco-blue hover:text-blue-800 font-medium flex items-center transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                    Volver a ${currentFilterGroup}
                </button>
                <span class="mx-3 text-gray-300">|</span>
                <h3 class="text-xl font-bold text-obelisco-dark">${catName}</h3>
            </div>
        `;
        gridContainer.innerHTML = headerHtml;

        document.getElementById('btn-back-categories')?.addEventListener('click', () => {
            currentViewLevel = 'categories';
            currentSelectedCategory = null;
            renderDashboard();
        });

        // Render boards for this category
        const boardsToRender = allAccessibleBoards.filter(b => b.categories && b.categories.includes(currentSelectedCategory));
        let renderedCount = 0;
        boardsToRender.forEach(board => {
            renderButton(gridContainer, board.id, board);
            renderedCount++;
        });

        if (renderedCount === 0) {
            gridContainer.insertAdjacentHTML('beforeend', getEmptyStateHtml(`No hay tableros públicos o no tenés permisos en "${catName}".`));
        }

    } else {
        // Render Categories for this Group
        const catsToRender = allCategories.filter(c => (c.type || 'Categorías') === currentFilterGroup && c.visible !== false);
        // Also figure out if we have old boards that match this group but have no category, to show them directly? No, enforce category.

        let renderedCount = 0;
        catsToRender.forEach(cat => {
            // Count accessible boards in this category
            const accessibleInCat = allAccessibleBoards.filter(b => b.categories && b.categories.includes(cat.id)).length;
            renderCategoryCard(gridContainer, cat, accessibleInCat);
            renderedCount++;
        });

        if (renderedCount === 0) {
            // Fallback for old boards that don't have categories IDs but have string group name? 
            // Better to show boards matching group directly if they have no category array
            const boardsWithoutCatInGroup = allAccessibleBoards.filter(b =>
                (!b.categories || b.categories.length === 0) && (b.category === currentFilterGroup)
            );

            if (boardsWithoutCatInGroup.length > 0) {
                boardsWithoutCatInGroup.forEach(board => renderButton(gridContainer, board.id, board));
                renderedCount = boardsWithoutCatInGroup.length;
            } else {
                gridContainer.insertAdjacentHTML('beforeend', getEmptyStateHtml(`No hay categorías creadas bajo el grupo "${currentFilterGroup}".`));
            }
        }
    }
}

function getEmptyStateHtml(msg) {
    return `
        <div class="col-span-full py-12 text-center text-obelisco-gray bg-white border border-obelisco-border rounded-xl">
            <svg class="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <h3 class="text-lg font-medium text-obelisco-dark">Nada por aquí</h3>
            <p class="mt-2 text-sm">${msg}</p>
        </div>
    `;
}

function renderCategoryCard(container, category, boardCount) {
    let hexColor = category.color || '#009DE0';
    let iconStr = category.icon || '';
    let desc = category.description || ''; // Empty if not provided

    if (!iconStr) {
        iconStr = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" style="color: ${hexColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>`;
    } else {
        iconStr = `<span style="color: ${hexColor}; font-size: 1.5rem; display: flex; align-items: center; justify-content: center;" class="w-full h-full">${iconStr}</span>`;
    }

    const html = `
        <div data-cat-id="${category.id}"
            class="obelisco-card category-card bg-white border border-obelisco-border rounded-xl p-6 flex flex-col h-full hover:bg-gray-50 transition drop-shadow-sm cursor-pointer border-t-4" style="border-top-color: ${hexColor}">
            <div class="flex items-center mb-4 w-full">
                <div class="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    ${iconStr}
                </div>
                <h3 class="text-base font-bold text-obelisco-dark ml-4 leading-snug break-words flex-grow">${category.name}</h3>
            </div>
            ${desc ? `<p class="text-obelisco-gray text-sm flex-grow mb-6 line-clamp-3" title="${desc}">${desc}</p>` : '<div class="flex-grow"></div>'}
            <div class="flex justify-between items-center w-full">
                <span class="text-xs font-medium px-2 py-1 bg-gray-100 rounded text-gray-600">${boardCount} Tableros</span>
                <span class="text-obelisco-blue font-bold text-sm flex items-center">
                    Ver tableros
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                </span>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    // Add event listener to jump into category
    const insertedEl = container.lastElementChild;
    insertedEl.addEventListener('click', (e) => {
        e.preventDefault();
        currentViewLevel = 'boards';
        currentSelectedCategory = category.id;
        renderDashboard();
    });
}

async function handleAccessRequest(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;

    const userEmail = auth.currentUser ? auth.currentUser.email : 'Anónimo';
    const buttonId = document.getElementById('ogb-form-button-id')?.value;
    const buttonName = document.getElementById('ogb-form-button-name')?.value;
    const motivo = document.getElementById('ogb-form-motivo')?.value;

    if (!motivo) {
        alert("Por favor, explica el motivo de tu solicitud.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";

    try {
        const { addDoc: addDocLocal } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await addDocLocal(collection(db, "requests"), {
            userEmail: userEmail,
            buttonId: buttonId,
            buttonName: buttonName,
            reason: motivo,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        document.getElementById('ogb-form-ok').classList.remove('hidden');

        // Refresh local state to show "En revisión" immediately
        await loadUserPermissions(auth.currentUser);

        setTimeout(() => {
            document.getElementById('ogb-form-ok').classList.add('hidden');
            document.getElementById('ogb-form').reset();
            closeModal();
            submitBtn.disabled = false;
            submitBtn.textContent = "Solicitar Aprobación";
        }, 2500);
    } catch (error) {
        console.error("Error sending request:", error);
        alert("Error al enviar la solicitud: " + (error.code || error.message));
        submitBtn.disabled = false;
        submitBtn.textContent = "Solicitar Aprobación";
    }
}

function renderButton(container, id, data) {
    // If the board doesn't have an explicit icon string, guess color from categories
    let hexColor = '#009DE0';
    let iconStr = data.icon || '';
    let categoryNames = '';

    if (data.categories && data.categories.length > 0) {
        const primaryCat = allCategories.find(c => c.id === data.categories[0]);
        if (primaryCat) {
            hexColor = primaryCat.color || hexColor;
            if (!iconStr) iconStr = primaryCat.icon || '';

            // Generate list of names
            categoryNames = data.categories.map(cId => {
                const c = allCategories.find(cat => cat.id === cId);
                return c ? c.name : '';
            }).filter(Boolean).join(', ');
        }
    } else {
        // Fallback or old data
        categoryNames = data.category || 'Sin Categoría';
    }

    // If STILL no icon, use default SVG
    if (!iconStr) {
        iconStr = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" style="color: ${hexColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>`;
    } else {
        // Assume it could be an emoji or SVG text
        // Wrap it in a span with the category color to ensure text color inherits if it's text/SVG
        iconStr = `<span style="color: ${hexColor}; font-size: 1.5rem; display: flex; align-items: center; justify-content: center;" class="w-full h-full">${iconStr}</span>`;
    }

    const hasAccess = data.hasAccess !== false; // handle old data
    const restrictedClass = !hasAccess ? 'opacity-75 grayscale-[0.5] border-dashed border-red-200' : '';

    // Check pending request
    const pendingRequest = currentUserRequests.find(r => r.buttonId === id && r.status === 'pending');
    const isUnderReview = !!pendingRequest;

    const lockIcon = !hasAccess
        ? (isUnderReview
            ? '<div class="absolute top-2 right-2 text-obelisco-blue bg-blue-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-200 shadow-sm">En revisión</div>'
            : '<div class="absolute top-2 right-2 text-red-500 bg-red-50 p-1.5 rounded-full border border-red-100"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg></div>')
        : '<div class="absolute top-2 right-2 text-green-600 bg-green-50 p-1.5 rounded-full border border-green-100 shadow-sm" title="Acceso concedido"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg></div>';

    const html = `
        <a href="#" data-button-id="${id}" data-iframe="${data.iframeUrl || ''}" data-heading="${data.title}" data-access="${hasAccess}" data-new-tab="${data.openInNewTab === true}"
            class="obelisco-card dashboard-btn bg-white border border-obelisco-border rounded-xl p-6 flex flex-col h-full hover:bg-gray-50 transition drop-shadow-sm relative ${restrictedClass}">
            ${lockIcon}
            <div class="flex items-center mb-4 w-full">
                <div class="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    ${iconStr}
                </div>
                <h3 class="text-sm font-bold text-obelisco-dark ml-4 leading-snug break-words flex-grow">${data.title}</h3>
            </div>
            <p class="text-obelisco-gray text-xs flex-grow mb-6 italic" title="${categoryNames}">${categoryNames}</p>
            <span class="text-obelisco-blue font-bold text-sm flex items-center">
                ${hasAccess ? 'Ver tablero' : (isUnderReview ? 'Pendiente' : 'Solicitar acceso')}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
            </span>
        </a>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

// Modal and Iframe Utility Functions
function openModal(title, url) {
    if (!url) {
        alert("El enlace para este tablero no está disponible.");
        return;
    }

    modalHeading.textContent = title;

    // Reset iframe state
    modalIframe.style.opacity = '0';
    modalLoader.style.display = 'flex';

    // Apply URL formatting fixes
    let finalSrc = ogbFixSheetUrl(url);
    finalSrc = ogbFixLookerUrl(finalSrc);
    finalSrc = ogbEnsurePBIToolbar(finalSrc);

    // Adjust security based on source
    modalIframe.setAttribute('referrerpolicy', 'no-referrer');
    modalIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms');

    if (finalSrc.includes('lookerstudio.google.com')) {
        modalIframe.removeAttribute('referrerpolicy');
    }

    // Load iframe content
    modalIframe.src = finalSrc;

    // Direct links update
    if (ogbDirectLink) ogbDirectLink.href = finalSrc;
    if (ogbFallbackBtn) ogbFallbackBtn.href = finalSrc;

    // Reset fallback visibility
    if (iframeFallback) iframeFallback.classList.add('hidden');

    // Show fallback if it takes too long (might be blocked)
    const fallbackTimeout = setTimeout(() => {
        if (modalLoader.style.display !== 'none' || modalIframe.style.opacity === '0') {
            if (iframeFallback) iframeFallback.classList.remove('hidden');
        }
    }, 6000);

    // Listen for iframe load
    modalIframe.onload = () => {
        clearTimeout(fallbackTimeout);
        modalLoader.style.display = 'none';
        modalIframe.style.opacity = '1';
        // Even if it loads, we hide fallback just in case it was showing
        if (iframeFallback) iframeFallback.classList.add('hidden');
    };

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Reset contents
    modalIframeWrap.classList.remove('hidden');
    if (iframeFallback) iframeFallback.classList.add('hidden');
    const formWrap = document.getElementById('ogb-form-wrap');
    if (formWrap) {
        formWrap.classList.add('hidden');
        formWrap.classList.remove('flex');
    }

    // Reset form
    const form = document.getElementById('ogb-form');
    if (form) form.reset();
    const submitBtn = document.getElementById('ogb-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // Reset iframe
    modalIframe.src = 'about:blank';
    modalHeading.textContent = '...';

    const card = document.getElementById('ogb-modal-card');
    if (card) {
        card.classList.remove('w-full', 'h-full', 'rounded-none');
        card.classList.add('w-[min(96vw,1100px)]', 'h-[min(94vh,820px)]', 'rounded-xl');
    }
}

// URL Formatters (Migrated from original PHP snippet)
function ogbEnsurePBIToolbar(url) {
    try {
        var host = new URL(url, window.location.origin).hostname;
        if (!/(\.|^)powerbi\.com$/.test(host)) return url;

        var u = new URL(url, window.location.origin);
        u.searchParams.set('navContentPaneEnabled', 'true');
        u.searchParams.set('filterPaneEnabled', 'true');
        u.searchParams.delete('chromeless');
        u.searchParams.set('displayMode', 'fitToPage');
        return u.toString();
    } catch (e) {
        return url;
    }
}

function openAccessRequestForm(title, buttonId) {
    modalHeading.textContent = "Solicitar Acceso";
    modalIframeWrap.classList.add('hidden');
    const formWrap = document.getElementById('ogb-form-wrap');
    if (formWrap) {
        formWrap.classList.remove('hidden');
        formWrap.classList.add('flex');
    }

    // Fill fields
    const userField = document.getElementById('ogb-form-user');
    const buttonNameField = document.getElementById('ogb-form-button-name');
    const buttonIdField = document.createElement('input');
    buttonIdField.type = 'hidden';
    buttonIdField.id = 'ogb-form-button-id';
    buttonIdField.value = buttonId;

    // Check if hidden field already exists to update or add
    const existingHidden = document.getElementById('ogb-form-button-id');
    if (existingHidden) existingHidden.value = buttonId;
    else document.getElementById('ogb-form').appendChild(buttonIdField);

    if (userField) userField.value = auth.currentUser ? auth.currentUser.email : 'No identificado';
    if (buttonNameField) buttonNameField.value = title;

    // Terms reset
    const termsCheck = document.getElementById('ogb-form-terms');
    if (termsCheck) termsCheck.checked = false;
    const submitBtn = document.getElementById('ogb-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function ogbFixLookerUrl(url) {
    try {
        var u = new URL(url, window.location.origin);
        if (u.hostname.includes('lookerstudio.google.com')) {
            if (!/\/embed\//.test(u.pathname)) {
                u.pathname = u.pathname.replace('/reporting/', '/embed/reporting/');
            }
        }
        return u.toString();
    } catch (e) {
        return url.replace('/reporting/', '/embed/reporting/');
    }
}

function ogbFixSheetUrl(url) {
    try {
        var u = new URL(url, window.location.origin);
        var h = u.hostname;

        // Google Sheets
        if (h.includes('docs.google.com') && u.pathname.includes('/spreadsheets/')) {
            if (!u.pathname.includes('/pubhtml')) {
                var m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
                var id = m ? m[1] : null;
                var gid = u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1] || '0';
                if (id) {
                    u.pathname = '/spreadsheets/d/' + id + '/pubhtml';
                    u.search = '';
                    u.hash = '';
                    u.searchParams.set('gid', gid);
                    u.searchParams.set('single', 'true');
                    u.searchParams.set('widget', 'true');
                    u.searchParams.set('headers', 'false');
                }
            }
            return u.toString();
        }
        return url;
    } catch (e) {
        return url;
    }
}

// Event Listeners
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

// Modal Event Listeners
document.addEventListener('click', (e) => {
    // Click on dashboard button
    const btn = e.target.closest('.dashboard-btn');
    if (btn) {
        e.preventDefault();
        const hasAccess = btn.getAttribute('data-access') !== 'false';
        const title = btn.getAttribute('data-heading');
        const id = btn.getAttribute('data-button-id');

        if (hasAccess) {
            const url = btn.getAttribute('data-iframe');
            const openInNewTab = btn.getAttribute('data-new-tab') === 'true';

            recordUserActivity(title, true);

            if (openInNewTab) {
                window.open(url, '_blank');
            } else {
                openModal(title, url);
            }
        } else {
            recordUserActivity(title, false);
            openAccessRequestForm(title, id);
        }
        return;
    }

    // Click to close modal
    if (e.target.closest('[data-ogb-close]')) {
        closeModal();
    }
});

// Fullscreen toggle via button
fullScreenBtn.addEventListener('click', () => {
    const card = document.getElementById('ogb-modal-card');
    if (card) {
        const isFull = card.classList.contains('w-full');
        if (isFull) {
            // Revert back
            card.classList.remove('w-full', 'h-full', 'rounded-none');
            card.classList.add('w-[min(96vw,1100px)]', 'h-[min(94vh,820px)]', 'rounded-xl');
            fullScreenBtn.classList.remove('bg-gray-200');
        } else {
            // Expand to full screen
            card.classList.add('w-full', 'h-full', 'rounded-none');
            card.classList.remove('w-[min(96vw,1100px)]', 'h-[min(94vh,820px)]', 'rounded-xl');
            fullScreenBtn.classList.add('bg-gray-200');
        }
    }
});

// Esc to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
    }
});

// Form Listener
document.getElementById('ogb-form')?.addEventListener('submit', handleAccessRequest);

// Terms Checkbox Listener
document.getElementById('ogb-form-terms')?.addEventListener('change', (e) => {
    const submitBtn = document.getElementById('ogb-submit-btn');
    if (submitBtn) submitBtn.disabled = !e.target.checked;
});

// Terms Modal Logic
const termsModal = document.getElementById('terms-modal');
const openTermsBtn = document.getElementById('open-terms-modal');
const closeTermsBtn = document.getElementById('close-terms-btn');
const closeTermsOverlay = document.getElementById('close-terms-overlay');

function openTermsModal() {
    termsModal?.classList.remove('hidden');
    termsModal?.classList.add('flex');
}

function closeTermsModal() {
    termsModal?.classList.add('hidden');
    termsModal?.classList.remove('flex');
}

openTermsBtn?.addEventListener('click', openTermsModal);
closeTermsBtn?.addEventListener('click', closeTermsModal);
closeTermsOverlay?.addEventListener('click', closeTermsModal);
// --- Registration Form Submission ---
if (registrationForm) {
    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const orgType = document.getElementById('reg-org-type').value;
        const orgName = document.getElementById('reg-org-name').value;
        const orgRole = document.getElementById('reg-org-role').value;

        try {
            const userEmail = user.email.toLowerCase();
            const userRef = doc(db, "users", userEmail);
            console.log("Saving profile for:", userEmail);

            await setDoc(userRef, {
                email: user.email.toLowerCase(),
                name: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL || '',
                orgType,
                orgName,
                orgRole,
                profileCompleted: true,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            registrationModal.classList.add('hidden');
            registrationModal.classList.remove('flex');
            alert("¡Perfil completado con éxito!");
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Hubo un error al guardar tu información: " + (error.code || error.message));
        }
    });
}

// --- Tracking Activity ---
async function recordUserActivity(buttonName, hasAccess) {
    if (!auth.currentUser) return;
    try {
        await addDoc(collection(db, "user_tracking"), {
            userEmail: auth.currentUser.email,
            userName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
            buttonName: buttonName,
            hasAccess: hasAccess,
            timestamp: new Date().toISOString()
        });
        console.log("Activity recorded:", buttonName, hasAccess);
    } catch (e) {
        console.warn("Failed to record activity:", e);
    }
}

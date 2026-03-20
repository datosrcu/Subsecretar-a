import { db, collection, addDoc, serverTimestamp, auth, onAuthStateChanged } from "./firebase-config.js";

// DOM Elements
const requestModal = document.getElementById('request-modal');
const openRequestBtn = document.getElementById('open-request-modal');
const closeRequestBtn = document.getElementById('close-request-btn');
const closeRequestBg = document.getElementById('close-request-bg');
const requestForm = document.getElementById('statistical-request-form');

const steps = document.querySelectorAll('.request-step');
const progressBar = document.getElementById('request-progress');
const btnPrev = document.getElementById('prev-step');
const btnNext = document.getElementById('next-step');
const btnSubmit = document.getElementById('submit-request');

let currentStep = 1;
const totalSteps = steps.length;
let currentUser = null;

// Track Auth State
onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

// Modal Logic
function openModal() {
    requestModal.classList.remove('hidden');
    requestModal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    resetForm();
}

function closeModal() {
    requestModal.classList.add('hidden');
    requestModal.classList.remove('flex');
    document.body.style.overflow = 'auto';
}

function resetForm() {
    requestForm.reset();
    currentStep = 1;
    updateStepVisibility();
}

// Navigation Logic
function updateStepVisibility() {
    steps.forEach((step, index) => {
        if (index + 1 === currentStep) {
            step.classList.remove('hidden');
        } else {
            step.classList.add('hidden');
        }
    });

    // Update Progress Bar
    const progress = (currentStep / totalSteps) * 100;
    progressBar.style.width = `${progress}%`;

    // Update Buttons
    btnPrev.classList.toggle('hidden', currentStep === 1);
    
    if (currentStep === totalSteps) {
        btnNext.classList.add('hidden');
        btnSubmit.classList.remove('hidden');
    } else {
        btnNext.classList.remove('hidden');
        btnSubmit.classList.add('hidden');
    }

    // Scroll top of the form
    requestForm.scrollTop = 0;
}

function nextStep() {
    if (validateStep(currentStep)) {
        currentStep++;
        updateStepVisibility();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepVisibility();
    }
}

function validateStep(step) {
    const currentStepEl = document.getElementById(`step-${step}`);
    const inputs = currentStepEl.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;

    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('border-red-500');
            isValid = false;
        } else {
            input.classList.remove('border-red-500');
        }
    });

    // Check checkboxes (jurisdiction and productType)
    if (step === 1) {
        const checkedJurisdiction = currentStepEl.querySelectorAll('input[name="jurisdiction"]:checked');
        if (checkedJurisdiction.length === 0) {
            alert('Por favor, seleccioná al menos una Jurisdicción.');
            isValid = false;
        }
    }
    
    if (step === 2) {
        const checkedProducts = currentStepEl.querySelectorAll('input[name="productType"]:checked');
        if (checkedProducts.length === 0) {
            alert('Por favor, seleccioná al menos un tipo de producto.');
            isValid = false;
        }
    }

    if (!isValid && !inputs.length === 0) {
        alert('Por favor, completá todos los campos obligatorios (*)');
    }

    return isValid;
}

// Submit Logic
async function handleSubmit(e) {
    e.preventDefault();

    if (!validateStep(currentStep)) return;

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> Enviando...`;

        const formData = new FormData(requestForm);
        const data = {};
        
        // Arrays to hold multi-select values
        const jurisdictions = [];
        const productTypes = [];
        const formats = [];

        // Manual extraction for better control
        formData.forEach((value, key) => {
            // Handle Jurisdictions
            if (key === 'jurisdiction') {
                jurisdictions.push(value);
            }
            // Handle Product Types
            else if (key === 'productType') {
                productTypes.push(value);
            }
            // Handle Formats
            else if (key === 'format') {
                formats.push(value);
            }
            // Ignore files for Firestore (they would crash addDoc)
            else if (value instanceof File) {
                if (value.name && value.size > 0) {
                    if (!data.attachments) data.attachments = [];
                    data.attachments.push(value.name); // Just record the name
                }
            }
            // Regular fields
            else {
                data[key] = value;
            }
        });

        // Consolidate arrays
        data.jurisdictions = jurisdictions;
        data.productTypes = productTypes;
        data.formats = formats;

        // Conditional Tech Contact cleanup
        if (data.hasTechContact === 'no') {
            delete data.techContactName;
            delete data.techContactEmail;
            delete data.techContactPhone;
        }

        // Add metadata
        data.status = 'Pendiente';
        data.createdAt = serverTimestamp();
        data.createdBy = currentUser ? currentUser.email : 'Anónimo - Web';
        data.userId = currentUser ? currentUser.uid : 'guest';

        console.log("Datos a enviar:", data);

        const docRef = await addDoc(collection(db, 'statistical_requests'), data);
        console.log("Documento enviado con ID:", docRef.id);

        alert('¡Solicitud enviada con éxito! El equipo técnico se pondrá en contacto pronto.');
        closeModal();
        
    } catch (error) {
        console.error("Error detallado al enviar solicitud:", error);
        const errorMsgEl = document.getElementById('request-error-msg');
        if (errorMsgEl) {
            errorMsgEl.innerHTML = `<strong>Error de envío:</strong> Hubo un problema al contactar con la base de datos (Posible falta de permisos). Por favor, contacte temporalmente al administrador directo.<br><span class="text-[10px] text-red-500 opacity-80">${error.message}</span>`;
            errorMsgEl.classList.remove('hidden');
            // Hide after 10 seconds
            setTimeout(() => {
                 errorMsgEl.classList.add('hidden');
            }, 10000);
        } else {
            alert('Hubo un error al enviar la solicitud. Por favor, reintentá luego. Error: ' + error.message);
        }
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enviar Solicitud';
    }
}


// Event Listeners
openRequestBtn.addEventListener('click', openModal);
closeRequestBtn.addEventListener('click', closeModal);
closeRequestBg.addEventListener('click', closeModal);

btnNext.addEventListener('click', nextStep);
btnPrev.addEventListener('click', prevStep);
requestForm.addEventListener('submit', handleSubmit);
btnSubmit.addEventListener('click', (e) => {
    // Manually trigger form submit if it's the last step
    if (currentStep === totalSteps) {
        requestForm.requestSubmit();
    }
});

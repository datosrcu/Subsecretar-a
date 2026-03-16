import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAidGT2L17aLE529cWjisko24FZT8_kkBA",
  authDomain: "web-subse.firebaseapp.com",
  projectId: "web-subse",
  storageBucket: "web-subse.firebasestorage.app",
  messagingSenderId: "1054370535841",
  appId: "1:1054370535841:web:feb9959fda7bc8f70293e0",
  measurementId: "G-4G4KQS525S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { app, auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, getDocs, doc, getDoc };

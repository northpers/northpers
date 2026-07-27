import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBzlqsP3XvmMYdDAwPMOb2oUfCx1U5K3rs",
    authDomain: "hostinesia-3a427.firebaseapp.com",
    projectId: "hostinesia-3a427",
    storageBucket: "hostinesia-3a427.firebasestorage.app",
    messagingSenderId: "250828889711",
    appId: "1:250828889711:web:11f0dc4771db39ab2ff79a",
    measurementId: "G-X3Y1TJQYZ3"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider();

export {
    auth,
    provider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged
};
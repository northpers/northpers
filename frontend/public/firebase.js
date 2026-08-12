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
    apiKey: "AIzaSyBxx6XQ0yvtRfqaqxjvLmL_sLURZWpCZ7w",
    authDomain: "auth.hostinesia.my.id",
    projectId: "hostinesia-72662",
    storageBucket: "hostinesia-72662.firebasestorage.app",
    messagingSenderId: "746228981526",
    appId: "1:746228981526:web:b641ece55b7ae5bd157a37",
    measurementId: "G-PMG0GHLCZN"
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
import { getFunctions } from 'firebase/functions';
   


import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCyfqH0ylc3Cl4n-J3ABF5BCG5DS1gwgvM",
  authDomain: "findit-e14e3.firebaseapp.com",
  projectId: "findit-e14e3",
  storageBucket: "findit-e14e3.firebasestorage.app",
  messagingSenderId: "615997669555",
  appId: "1:615997669555:web:a360cfbd17b9a40d9fb0c6",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app;


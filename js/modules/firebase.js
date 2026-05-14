import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config.js';

// Firebaseの初期化
let app;
let auth;
let db;
let provider;

try {
  // YOUR_API_KEY のままの場合は初期化しない（エラー回避）
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
  } else {
    console.warn("Firebase configuration is not set. Please update js/firebase-config.js");
  }
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

/**
 * Googleログインを実行
 */
export async function loginWithGoogle() {
  if (!auth) return;
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

/**
 * ログアウトを実行
 */
export async function logout() {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
    throw error;
  }
}

/**
 * 認証状態の変更を監視
 */
export function onAuthChange(callback) {
  if (!auth) return;
  return onAuthStateChanged(auth, callback);
}

/**
 * データをFirestoreに保存
 * @param {string} userId 
 * @param {object} data 
 */
export async function saveUserData(userId, data) {
  if (!db) return;
  try {
    const userDoc = doc(db, 'users', userId);
    await setDoc(userDoc, {
      data: JSON.stringify(data),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Firestore save failed:", error);
  }
}

/**
 * データをFirestoreから読み込み
 * @param {string} userId 
 */
export async function loadUserData(userId) {
  if (!db) return null;
  try {
    const userDoc = doc(db, 'users', userId);
    const docSnap = await getDoc(userDoc);
    if (docSnap.exists()) {
      const payload = docSnap.data();
      return payload.data ? JSON.parse(payload.data) : null;
    }
    return null;
  } catch (error) {
    console.error("Firestore load failed:", error);
    return null;
  }
}

export { auth, db };

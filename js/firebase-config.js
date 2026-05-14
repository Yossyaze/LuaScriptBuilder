/**
 * Firebaseの設定ファイル
 *
 * Firebaseコンソール (https://console.firebase.google.com/) でプロジェクトを作成し、
 * 「ウェブアプリ」を追加して取得した設定値を以下のオブジェクトに貼り付けてください。
 *
 * 注意: このファイルは本来 gitignore に含めるべき機密情報を含みます。
 * 公開リポジトリにプッシュする場合は注意してください。
 */

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

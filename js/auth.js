// js/auth.js — helper autentikasi, dipakai semua halaman

import { db } from './supabase.js';

// Cek apakah user sudah login, kalau belum redirect ke index.html
async function requireAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
  return session.user;
}

// Ambil user yang sedang login
async function getUser() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

// Login dengan Google
async function loginWithGoogle() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/dashboard.html' }
  });
  if (error) console.error('Login error:', error.message);
}

// Login dengan email & password
async function loginWithEmail(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Register dengan email & password
async function registerWithEmail(email, password, nama) {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { nama } }
  });
  if (error) throw error;
  return data;
}

// Logout
async function logout() {
  await db.auth.signOut();
  window.location.href = '/index.html';
}

export { requireAuth, getUser, loginWithGoogle, loginWithEmail, registerWithEmail, logout };

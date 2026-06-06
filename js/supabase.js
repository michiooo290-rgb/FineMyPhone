// js/supabase.js — inisialisasi Supabase client (dipakai semua halaman)

const SUPABASE_URL = 'https://slljvmlwdnyyaowcioso.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGp2bWx3ZG55eWFvd2Npb3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTE5NTQsImV4cCI6MjA5NjIyNzk1NH0.xMUpbkBZeVZWpMxBM1vifSzekScNJvmhaxAJrQEyG9kk';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { db };

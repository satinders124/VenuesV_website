/*
 * Supabase's project URL and anon key are intentionally public browser values.
 * Security comes from the Row Level Security policies in supabase/migrations,
 * never from hiding this anon key. Do not put the service-role key in this file.
 */
(() => {
  const SUPABASE_URL = 'https://nzicfhnnrbiilijmichh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56aWNmaG5ucmJpaWxpam1pY2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MDM0MjcsImV4cCI6MjA5OTM3OTQyN30.kDjReVKRCTPTwWxxyJrmMkimhyjI1ZZGGRH26kZwkQg';

  if (!window.supabase?.createClient) {
    throw new Error('The Supabase browser library did not load.');
  }

  window.venuesvSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
})();

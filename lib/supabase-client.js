'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabaseUrl, supabaseAnonKey } from './supabase-config';

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
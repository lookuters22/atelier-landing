import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

/** Baked in at build time from `VITE_*` — must match the project where Edge functions run. See `.env.example` + `docs/GMAIL_ROLLOUT_RUNBOOK.md` §0. */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "https://placeholder.supabase.co";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "placeholder";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

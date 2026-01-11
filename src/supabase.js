import { createClient } from "@supabase/supabase-js";

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const supabase = createClient(
  mustGetEnv("SUPABASE_URL"),
  mustGetEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

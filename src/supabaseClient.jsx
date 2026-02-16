import { createClient } from "@supabase/supabase-js";

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrl = "https://ofbuxpqgucbxdbfzbrar.supabase.co";
const supabaseAnonKey = "sb_publishable_VaqBSrOEsvWUEQQ-IWb_fw_B-bTcv9m";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://oeibxtnltxxcaiwvpldi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qlJxPHqUnCD1xhuXCJ--kg_nMg44rCn";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  console.log("Testing explicit chat_messages query...");
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, profiles!chat_messages_user_id_fkey(username, display_name, avatar_url, is_premium, avatar_frame, level, xp)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error("QUERY FAILED:", error);
  } else {
    console.log("QUERY SUCCEEDED! Rows retrieved:", data.length);
    if (data.length > 0) {
      console.log("Sample row profiles key name:", Object.keys(data[0].profiles));
    }
  }
}

main();

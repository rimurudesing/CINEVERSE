import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const tables = [
      'profiles',
      'chat_messages',
      'message_reactions',
      'chat_polls',
      'chat_poll_votes',
      'chat_reports',
      'groups',
      'group_members',
      'group_messages',
      'notifications'
    ];

    console.log("Checking tables existence and row counts:");
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT COUNT(*) FROM public.${table};`);
        console.log(`✅ Table '${table}' EXISTS. Rows: ${res.rows[0].count}`);
      } catch (err) {
        console.log(`❌ Table '${table}' DOES NOT EXIST or has error: ${err.message}`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

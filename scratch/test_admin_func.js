import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'is_admin';");
    if (res.rows.length > 0) {
      console.log("FUNCTION is_admin EXISTS!");
    } else {
      console.log("FUNCTION is_admin DOES NOT EXIST!");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

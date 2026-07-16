import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

async function test() {
  const client = new pg.Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log("SUCCESSFULLY CONNECTED!");
    const res = await client.query("SELECT version();");
    console.log("DB Version:", res.rows[0].version);
    await client.end();
  } catch (err) {
    console.error("CONNECTION FAILED:", err);
  }
}

test();

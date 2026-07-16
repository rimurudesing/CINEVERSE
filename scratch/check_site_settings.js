import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query("SELECT * FROM public.site_settings LIMIT 1;");
    console.log("Site settings:");
    console.dir(res.rows, { depth: null });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

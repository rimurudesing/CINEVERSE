import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log("Profiles table columns:");
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles';
    `);
    console.dir(res.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log("Checking RLS status and policies for chat_messages & profiles:");
    const res = await client.query(`
      SELECT schemaname, tablename, rowsecurity 
      FROM pg_tables 
      WHERE tablename IN ('chat_messages', 'profiles');
    `);
    console.dir(res.rows);

    const resPolicies = await client.query(`
      SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename IN ('chat_messages', 'profiles');
    `);
    console.dir(resPolicies.rows, { depth: null });

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

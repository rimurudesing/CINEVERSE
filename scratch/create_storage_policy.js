import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log("Creating Storage RLS Policies for 'voice-messages'...");

    // Crear política para INSERT
    await client.query(`
      CREATE POLICY "Allow authenticated uploads to voice-messages" 
      ON storage.objects 
      FOR INSERT 
      TO authenticated 
      WITH CHECK (bucket_id = 'voice-messages');
    `).catch(err => {
      console.log("INSERT policy might already exist or error:", err.message);
    });

    // Crear política para SELECT (Lectura)
    await client.query(`
      CREATE POLICY "Allow public select on voice-messages" 
      ON storage.objects 
      FOR SELECT 
      TO public 
      USING (bucket_id = 'voice-messages');
    `).catch(err => {
      console.log("SELECT policy might already exist or error:", err.message);
    });

    console.log("Policies updated successfully!");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

import pg from 'pg';

const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const newConfig = {
      latest_version: "1.3.2",
      latest_changelog: "- Arreglo de clics y gestos táctiles en reproductor y menús\n- Mensajes de voz (audios) habilitados en el chat\n- Rediseño responsivo de estadísticas e historial en perfil\n- Optimización de tamaño de APK de 768MB a 15MB",
      global_ads_enabled: true,
      latest_download_url: "https://www.mediafire.com/file/1xhsh8vi2qo9ve8/Cineverse.apk/file"
    };

    const query = "UPDATE public.site_settings SET value = $1 WHERE key = 'global_config' RETURNING *;";
    const res = await client.query(query, [JSON.stringify(newConfig)]);
    
    console.log("Updated config successfully:");
    console.dir(res.rows, { depth: null });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

import pg from 'pg';

const prefixes = ["aws-0", "aws-1", "aws-2", "aws-3"];

async function testPrefix(prefix) {
  const host = `${prefix}.us-east-1.pooler.supabase.com`;
  const connectionString = `postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@${host}:6543/postgres`;
  console.log(`Probando conexión a ${host}...`);
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    console.log(`\n🎉 ¡CONEXIÓN EXITOSA con: ${host}!`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ Falló con ${host}: ${err.message}`);
    return false;
  }
}

async function main() {
  for (const prefix of prefixes) {
    const success = await testPrefix(prefix);
    if (success) {
      break;
    }
  }
}

main();

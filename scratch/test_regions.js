import pg from 'pg';

const host = "aws-0-us-east-1.pooler.supabase.com";
const ports = [5432, 6543];

async function testPort(port) {
  const connectionString = `postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@${host}:${port}/postgres`;
  console.log(`Probando conexión a ${host}:${port}...`);
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    console.log(`\n🎉 ¡CONEXIÓN EXITOSA con puerto: ${port}!`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ Falló en puerto ${port}: ${err.message}`);
    return false;
  }
}

async function main() {
  for (const port of ports) {
    const success = await testPort(port);
    if (success) {
      console.log("\nEncontrado el puerto correcto.");
      break;
    }
  }
}

main();

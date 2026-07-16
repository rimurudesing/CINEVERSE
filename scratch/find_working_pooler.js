import pg from 'pg';

const regions = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "sa-east-1", "eu-west-1", "eu-west-2",
  "eu-west-3", "eu-central-1", "eu-north-1", "me-central-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2",
  "ap-northeast-1", "ap-northeast-2", "ap-northeast-3"
];

const prefixes = ["aws-0", "aws-1", "aws-2", "aws-3"];

async function test(prefix, region) {
  const host = `${prefix}-${region}.pooler.supabase.com`;
  const connectionString = `postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@${host}:6543/postgres`;
  
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 3000
  });

  try {
    await client.connect();
    console.log(`\n🎉 🎉 🎉 CONEXIÓN EXITOSA CON: ${host} 🎉 🎉 🎉`);
    await client.end();
    return true;
  } catch (err) {
    if (err.message.includes("ENOTFOUND")) {
      // Host no existe
    } else if (err.message.includes("timeout")) {
      // Timeout
      console.log(`⏱️  ${host}: Timeout`);
    } else {
      // Respuesta del servidor (autenticación fallida o tenant no encontrado)
      console.log(`👉 ${host}: ${err.message}`);
    }
    return false;
  }
}

async function main() {
  console.log("Escaneando todos los servidores pooler...");
  for (const region of regions) {
    for (const prefix of prefixes) {
      const success = await test(prefix, region);
      if (success) {
        process.exit(0);
      }
    }
  }
  console.log("Escaneo completado sin éxito.");
}

main();

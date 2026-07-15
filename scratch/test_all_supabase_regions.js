import pg from 'pg';

const regions = [
  "aws-0-us-east-1.pooler.supabase.com",
  "aws-0-us-east-2.pooler.supabase.com",
  "aws-0-us-west-1.pooler.supabase.com",
  "aws-0-us-west-2.pooler.supabase.com",
  "aws-0-ca-central-1.pooler.supabase.com",
  "aws-0-sa-east-1.pooler.supabase.com",
  "aws-0-eu-west-1.pooler.supabase.com",
  "aws-0-eu-west-2.pooler.supabase.com",
  "aws-0-eu-west-3.pooler.supabase.com",
  "aws-0-eu-central-1.pooler.supabase.com",
  "aws-0-eu-north-1.pooler.supabase.com",
  "aws-0-me-central-1.pooler.supabase.com",
  "aws-0-ap-south-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-2.pooler.supabase.com",
  "aws-0-ap-northeast-1.pooler.supabase.com",
  "aws-0-ap-northeast-2.pooler.supabase.com",
  "aws-0-ap-northeast-3.pooler.supabase.com"
];

async function testRegion(host) {
  const connectionString = `postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@${host}:6543/postgres`;
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000
  });

  try {
    await client.connect();
    console.log(`\n🎉 ¡CONEXIÓN EXITOSA con host: ${host}!`);
    await client.end();
    return true;
  } catch (err) {
    if (err.message.includes("tenant/user")) {
      // Ignorar este error ya que significa que el host respondió pero el proyecto no está en esta región
    } else {
      console.log(`❓ Host ${host} respondió con: ${err.message}`);
    }
    return false;
  }
}

async function main() {
  console.log("Probando todas las regiones posibles de Supabase...");
  for (const host of regions) {
    const success = await testRegion(host);
    if (success) {
      console.log("\n¡Encontrado!");
      break;
    }
  }
}

main();

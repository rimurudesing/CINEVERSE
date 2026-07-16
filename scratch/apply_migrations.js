import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usamos el pooler IPv4 de Supabase ya que la conexión directa IPv6 no está disponible en este entorno local.
const connectionString = "postgresql://postgres.oeibxtnltxxcaiwvpldi:cineverse2126@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log("Conectando al pooler IPv4 de Supabase...");
    await client.connect();
    console.log("Conectado con éxito.");

    const sqlPath = "/home/lorenzobuten/Documentos/CineVerse/supabase/social_and_features_schema.sql";
    console.log(`Leyendo archivo SQL: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Ejecutando consultas de base de datos...");
    await client.query(sql);
    console.log("¡Migración e inicio de base de datos aplicados con éxito! 🎉");

  } catch (err) {
    console.error("Error al aplicar las migraciones a Supabase:", err);
  } finally {
    await client.end();
  }
}

main();

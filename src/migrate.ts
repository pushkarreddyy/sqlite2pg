/**
 * Direct Live Migration to PostgreSQL / Supabase
 */

import { Client } from 'pg';
import { ConversionResult, ConversionOptions } from './types.js';

export async function executeLiveMigration(
  connectionString: string,
  conversionResult: ConversionResult,
  options: ConversionOptions = {}
): Promise<{ success: boolean; error?: Error }> {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('supabase') || connectionString.includes('neon') || connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await client.connect();
    if (options.verbose) {
      console.log('Connected to PostgreSQL server.');
    }

    await client.query(conversionResult.sql);

    if (options.verbose) {
      console.log('Migration executed successfully.');
    }

    await client.end();
    return { success: true };
  } catch (err) {
    try {
      await client.end();
    } catch {
      // Ignore disconnect error
    }
    return { success: false, error: err as Error };
  }
}

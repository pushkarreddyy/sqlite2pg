/**
 * Value serialization & transformation from SQLite rows to PostgreSQL SQL literals
 */

export function transformValue(value: unknown, targetPgType: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const upperType = targetPgType.toUpperCase();

  // Boolean handling
  if (upperType === 'BOOLEAN') {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value === 0 ? 'FALSE' : 'TRUE';
    }
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === '1' || trimmed === 'true' || trimmed === 't' || trimmed === 'yes' || trimmed === 'y') {
        return 'TRUE';
      }
      if (trimmed === '0' || trimmed === 'false' || trimmed === 'f' || trimmed === 'no' || trimmed === 'n') {
        return 'FALSE';
      }
      return Boolean(trimmed) ? 'TRUE' : 'FALSE';
    }
    return Boolean(value) ? 'TRUE' : 'FALSE';
  }

  // Integer types
  if (upperType.startsWith('INT') || upperType.startsWith('BIGINT') || upperType.startsWith('SMALLINT')) {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        return Math.floor(value).toString();
      }
      return 'NULL';
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+$/.test(trimmed)) {
        return trimmed;
      }
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        return parsed.toString();
      }
    }
  }

  // Floating point / Numeric
  if (upperType.startsWith('DOUBLE PRECISION') || upperType.startsWith('REAL') || upperType.startsWith('FLOAT')) {
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return `'NaN'::double precision`;
      if (value === Infinity) return `'Infinity'::double precision`;
      if (value === -Infinity) return `'-Infinity'::double precision`;
      return value.toString();
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed.toString();
      }
    }
  }

  if (upperType.startsWith('NUMERIC') || upperType.startsWith('DECIMAL')) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
        return trimmed;
      }
    }
  }

  // BLOB / Bytea handling
  if (upperType === 'BYTEA' || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    if (Buffer.isBuffer(value)) {
      return `'\\x${value.toString('hex')}'::bytea`;
    }
    if (value instanceof Uint8Array) {
      return `'\\x${Buffer.from(value).toString('hex')}'::bytea`;
    }
    if (typeof value === 'string') {
      // Check if it's already SQLite hex blob format X'0102'
      const hexMatch = value.match(/^X'([0-9a-fA-F]*)'$/i);
      if (hexMatch) {
        return `'\\x${hexMatch[1]}'::bytea`;
      }
      return `'\\x${Buffer.from(value, 'utf-8').toString('hex')}'::bytea`;
    }
  }

  // Date / Timestamp / Timestamptz
  if (upperType.includes('TIMESTAMP') || upperType.includes('DATE') || upperType.includes('TIME')) {
    if (value instanceof Date) {
      return `'${value.toISOString()}'::${upperType.toLowerCase()}`;
    }
    if (typeof value === 'number') {
      // Check if unix seconds vs milliseconds
      const date = value > 1e11 ? new Date(value) : new Date(value * 1000);
      if (!Number.isNaN(date.getTime())) {
        return `'${date.toISOString()}'::${upperType.toLowerCase()}`;
      }
    }
    if (typeof value === 'string') {
      let str = value.trim();
      // If integer string (unix timestamp)
      if (/^\d{10,13}$/.test(str)) {
        const num = Number(str);
        const date = num > 1e11 ? new Date(num) : new Date(num * 1000);
        if (!Number.isNaN(date.getTime())) {
          return `'${date.toISOString()}'::${upperType.toLowerCase()}`;
        }
      }
      // If SQLite format: YYYY-MM-DD HH:MM:SS
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
        str = str.replace(' ', 'T') + 'Z';
      }
      return `'${escapeSqlString(str)}'::${upperType.toLowerCase()}`;
    }
  }

  // JSON / JSONB
  if (upperType === 'JSONB' || upperType === 'JSON') {
    if (typeof value === 'object') {
      try {
        const jsonStr = JSON.stringify(value);
        return `'${escapeSqlString(jsonStr)}'::${upperType.toLowerCase()}`;
      } catch {
        return `'{}'::${upperType.toLowerCase()}`;
      }
    }
    if (typeof value === 'string') {
      try {
        // Validate it is valid JSON
        JSON.parse(value);
        return `'${escapeSqlString(value)}'::${upperType.toLowerCase()}`;
      } catch {
        // Wrap as JSON string
        return `'${escapeSqlString(JSON.stringify(value))}'::${upperType.toLowerCase()}`;
      }
    }
  }

  // Default string handling (TEXT, VARCHAR, etc.)
  let strValue: string;
  if (typeof value === 'object') {
    try {
      strValue = JSON.stringify(value);
    } catch {
      strValue = String(value);
    }
  } else {
    strValue = String(value);
  }

  // Sanitize null bytes (\0) which PostgreSQL rejects in text fields
  strValue = strValue.replace(/\0/g, '');

  return `'${escapeSqlString(strValue)}'`;
}

/**
 * Escapes single quotes for SQL string literals
 */
export function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

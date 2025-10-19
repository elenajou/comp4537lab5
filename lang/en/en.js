// ChatGPT was used to generate these user facing strings
export const MESSAGES = {
  // Console Logs
  LOG_DB_INIT_ATTEMPT: (dbName) => `[DB] Attempting to initialize DB: ${dbName}`,
  LOG_DB_ERROR_CREATE: (error) => `[DB] Error creating database: ${error.message}`,
  LOG_DB_ENSURED: (dbName) => `[DB] Database ${dbName} ensured.`,
  LOG_TABLE_ERROR_CREATE: (tableName, error) => `[DB] Error creating table ${tableName}: ${error.message}`,
  LOG_TABLE_ENSURED: (tableName) => `[DB] Table ${tableName} ensured with ENGINE=innoDB and date_of_record column.`,
  LOG_SECURITY_BLOCKED: (command) => `[SECURITY] Blocked query attempt: ${command}`,
  LOG_BULK_INSERT_RECEIVE: (count) => `[SERVER] Received Bulk Insert Request for ${count} records.`,
  LOG_SERVER_RUNNING: (host, port) => `Node.js Database Server (Origin 2) running at http://${host}:${port}/`,
  LOG_CORS_NOTE: 'NOTE: The client must be served from Origin 1 (e.g., http://localhost:8000).',

  // HTTP Error Responses
  ERR_TYPE_SERVER: 'SERVER ERROR',
  ERR_TYPE_DB: 'DB ERROR',
  ERR_TYPE_SECURITY: 'SECURITY ERROR',
  ERR_TYPE_METHOD: 'METHOD ERROR',
  ERR_TYPE_INPUT: 'INPUT ERROR',
  ERR_TYPE_JSON: 'JSON ERROR',
  
  ERR_INVALID_JSON: 'Invalid JSON body.',
  ERR_JSON_BULK_INSERT: (error) => `Invalid data format or content: ${error.message}`,
  ERR_MISSING_BULK_ARRAY: 'Expected a non-empty array of patient records.',
  ERR_MISSING_BULK_FIELDS: "Each record must contain 'name' and 'dateOfBirth'.",
  ERR_SQL_MISSING: 'SQL query is missing.',
  ERR_SQL_FORBIDDEN: 'Forbidden: Only SELECT and INSERT queries are allowed.',
  ERR_ENDPOINT_NOT_FOUND: 'Endpoint not found.',
  ERR_DB_GENERIC: (error) => `Database Error: ${error.message}`,
  ERR_METHOD_MISMATCH: (command, expected) => `Method Not Allowed. '${command}' must use ${expected}.`,

  // HTTP Success Responses
  SUCCESS_SELECT: (count) => `Successfully executed SELECT query. Found ${count} rows.`,
  SUCCESS_INSERT_RAW: (rows) => `Successfully executed INSERT query. Rows affected: ${rows}.`,
  SUCCESS_INSERT_BULK: (count) => `Successfully inserted ${count} patient records.`,
};
export default MESSAGES;
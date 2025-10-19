const http = require('http');
const mysql = require('mysql2');
require('dotenv').config();

const HOST = 'localhost';
const PORT = 8001;
const DB_NAME = 'node_patient_db';
const TABLE_NAME = 'patients';

const dbConfig = {
    host: process.env.VITE_HOST,
    user: process.env.VITE_USERNAME,
    password: process.env.VITE_PASSWORD,
    database: DB_NAME,
};

/**
 * Executes a query against the MySQL database.
 * Uses prepared statements if values array is provided (safer).
 */
function executeQuery(sql, callback, values = null, useSetupConfig = false) {
  const config = useSetupConfig ? { host: dbConfig.host, user: dbConfig.user, password: dbConfig.password, port: dbConfig.port } : dbConfig;
  const con = mysql.createConnection(config);

  con.connect(err => {
      if (err) return callback(err);

      con.query(sql, values, (err, result) => {
          con.end();
          callback(err, result);
      });
  });
}

/**
 * Initializes the database: creates the database if it doesn't exist,
 * and creates the patients table if it doesn't exist (using InnoDB engine).
 */
function initializeDatabase() {
    console.log(`[DB] Attempting to create database: ${DB_NAME}`);
    executeQuery(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`, (err) => {
        if (err) {
            console.error("[DB] Error creating database:", err.message);
            return;
        }
        console.log(`[DB] Database ${DB_NAME} ensured.`);

        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                patientid INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                dateOfBirth DATETIME
            ) ENGINE=innoDB;
        `;
        executeQuery(createTableSQL, (err) => {
            if (err) {
                console.error(`[DB] Error creating table ${TABLE_NAME}:`, err.message);
                return;
            }
            console.log(`[DB] Table ${TABLE_NAME} ensured with ENGINE=innoDB.`);
        });
    }, true);
}

initializeDatabase();

/**
 * Sanitizes and validates the incoming SQL query.
 * Only allows SELECT and INSERT statements. Blocks UPDATE, DELETE, DROP, etc.
 * @param {string} query The raw SQL query string.
 * @returns {string|null} The validated query (uppercase command) or null if invalid.
 */
function validateAndExtractCommand(query) {
    if (!query) return null;
    const trimmedQuery = query.trim();

    const match = trimmedQuery.match(/^(\s*(SELECT|INSERT)\s+)/i);

    if (match) {
        return match[2].toUpperCase();
    }

    const blockedCommands = ['UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE'];
    const uppercaseQuery = trimmedQuery.toUpperCase();

    for (const command of blockedCommands) {
        if (uppercaseQuery.startsWith(command + ' ')) {
            console.warn(`[SECURITY] Blocked query attempt: ${command}`);
            return 'BLOCKED';
        }
    }

    return null;
}

/**
 * Executes the validated RAW SQL query string (for /execute-query) and handles the response.
 */
function processRawQuery(sql, res, type) {
  executeQuery(sql, (err, results) => {
      if (err) {
          console.error("[DB ERROR]:", err.message);
          sendError(res, 500, `Database Error: ${err.message}`, 'DB ERROR');
          return;
      }

      let response = { success: true };
      if (type === 'SELECT') {
          response.data = results;
          response.message = `Successfully executed SELECT query. Found ${results.length} rows.`;
      } else {
          response.message = `Successfully executed INSERT query. Rows affected: ${results.affectedRows}.`;
          response.insertId = results.insertId;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
  });
}

/**
 * Executes a structured INSERT using prepared statements (for /insert-data).
 */
function processStructuredInsert(res, name, dateOfBirth) {
  const insertSQL = `INSERT INTO ${TABLE_NAME} (name, dateOfBirth) VALUES ("${name}", CAST("${dateOfBirth}" AS DATETIME))`;
  const values = [name, dateOfBirth];

  executeQuery(insertSQL, (err, results) => {
      if (err) {
          console.error("[DB ERROR]:", err.message);
          sendError(res, 500, `Database Error: ${err.message}`, 'DB ERROR');
          return;
      }
      console.log("no error");
      const response = { 
          success: true, 
          message: `Successfully inserted patient '${name}' with date '${dateOfBirth}'. Rows affected: ${results.affectedRows}.`,
          insertId: results.insertId
      };
      console.log(response);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
  }, values);
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
      const url = req.url;

      if (url === '/insert-data' && req.method === 'POST') {
          try {
              const data = JSON.parse(body);
              const name = data.name;
              const date = data.dateOfBirth; 

              if (!name || !date) {
                  sendError(res, 400, "Missing name or date.", 'INPUT ERROR');
                  return;
              }

              processStructuredInsert(res, name, date);
              
          } catch (e) {
              sendError(res, 400, "Invalid JSON body for structured insert.", 'JSON ERROR');
          }
          return;
      }
      
      if (url.startsWith('/execute-query')) {
        let sqlQuery = '';

        if (req.method === 'POST') {
            try {
                sqlQuery = JSON.parse(body).query;
            } catch (e) {
                sendError(res, 400, "Invalid JSON body.", 'JSON ERROR');
                return;
            }
        } else if (req.method === 'GET') {
            const urlParts = new URL(req.url, `http://${HOST}:${PORT}`);
            sqlQuery = urlParts.searchParams.get('query');
        }

        if (!sqlQuery) {
            sendError(res, 400, "SQL query is missing.", 'INPUT ERROR');
            return;
        }

        const command = validateAndExtractCommand(sqlQuery);

        if (command === 'BLOCKED') {
            sendError(res, 403, "Forbidden: Only SELECT and INSERT queries are allowed.", 'SECURITY ERROR');
        } else if (command === 'SELECT' && req.method === 'GET') {
            processRawQuery(sqlQuery, res, 'SELECT');
        } else if (command === 'INSERT' && req.method === 'POST') {
            processRawQuery(sqlQuery, res, 'INSERT');
        } else {
            sendError(res, 405, `Method Not Allowed. '${command}' must use ${command === 'SELECT' ? 'GET' : 'POST'}.`, 'METHOD ERROR');
        }
        return;
      }

      sendError(res, 404, 'Endpoint not found.');
    });
});

/**
 * Executes the validated SQL query and handles the response.
 */
function processQuery(sql, res, type = 'INSERT') {
    executeQuery(sql, (err, results) => {
        if (err) {
            console.error("[DB ERROR]:", err.message);
            sendError(res, 500, `Database Error: ${err.message}`, 'DB ERROR');
            return;
        }

        let response = { success: true };
        if (type === 'SELECT') {
            response.data = results;
            response.message = `Successfully executed SELECT query. Found ${results.length} rows.`;
        } else {
            response.message = `Successfully executed INSERT query. Rows affected: ${results.affectedRows}.`;
            response.insertId = results.insertId;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    });
}

/**
 * Helper to send a consistent JSON error response.
 */
function sendError(res, statusCode, message, type = 'SERVER ERROR') {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, errorType: type, message: message }));
}


server.listen(PORT, HOST, () => {
    console.log(`Node.js Database Server (Origin 2) running at http://${HOST}:${PORT}/`);
    console.log(`Ensure your client (Origin 1) is accessing this from a different host/port for proper CORS testing.`);
});


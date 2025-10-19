const http = require('http');
const { MESSAGES } = require('./lang/en/en.js');
const mysql = require('mysql2');
require('dotenv').config();

const HOST = process.env.VITE_BACKEND;
const PORT = process.env.VITE_PORT || 8000;
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
    console.log(MESSAGES.LOG_DB_INIT_ATTEMPT(DB_NAME));
    executeQuery(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`, (err) => {
        if (err) {
            console.error(MESSAGES.LOG_DB_ERROR_CREATE(err));
            return;
        }

        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                patientid INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                dateOfBirth DATETIME
            ) ENGINE=innoDB;
        `;
        executeQuery(createTableSQL, (err) => {
            if (err) {
                console.error(MESSAGES.LOG_TABLE_ERROR_CREATE(TABLE_NAME, err));
                return;
            }
            console.log(MESSAGES.LOG_TABLE_ENSURED(TABLE_NAME));
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
            console.warn(MESSAGES.LOG_SECURITY_BLOCKED(command));
            return 'BLOCKED';
        }
    }

    return null;
}

/**
 * Executes the validated RAW SQL query string (for /execute-query) and handles the response.
 */
function processRawQuery(sql, res, type = MESSAGES.ERR_TYPE_SERVER) {
    executeQuery(sql, (err, results) => {
        if (err) {
            console.error(MESSAGES.ERR_DB_GENERIC(err));
            sendError(res, 500,  MESSAGES.ERR_DB_GENERIC(err), MESSAGES.ERR_TYPE_DB);
            return;
        }

        let response = { success: true };
        if (type === 'SELECT') {
            response.data = results;
            response.message = MESSAGES.SUCCESS_SELECT(results.length);
        } else {
            response.message = MESSAGES.SUCCESS_INSERT_RAW(results.affectedRows);
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
                console.error(MESSAGES.ERR_DB_GENERIC(err));
                sendError(res, 500, MESSAGES.ERR_DB_GENERIC(err), MESSAGES.ERR_TYPE_DB);
                return;
        }
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
                const incomingData = JSON.parse(body);
                
                if (!Array.isArray(incomingData) || incomingData.length === 0) {
                    sendError(res, 400, MESSAGES.ERR_MISSING_BULK_ARRAY, MESSAGES.ERR_TYPE_INPUT);
                    return;
                }
                
                const patientRecords = incomingData.map(record => {
                    const name = record.name;
                    const date = record.dateOfBirth; // Use dateOfBirth from client JSON

                    if (!name || !date) {
                        throw new Error(MESSAGES.ERR_MISSING_BULK_FIELDS);
                    }
                    processStructuredInsert(res, name, date);
                    return { name, date }; 
                });
                
                const response = { 
                    success: true, 
                    message: MESSAGES.SUCCESS_INSERT_BULK(incomingData.length)
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
            } catch (e) {
                sendError(res, 400, MESSAGES.ERR_INVALID_JSON, MESSAGES.ERR_TYPE_JSON);
            }
            return;
        }

        if (url.startsWith('/execute-query')) {
            let sqlQuery = '';

            if (req.method === 'POST') {
                try {
                    sqlQuery = JSON.parse(body).query;
                } catch (e) {
                    sendError(res, 400, MESSAGES.ERR_INVALID_JSON, MESSAGES.ERR_TYPE_JSON);
                    return;
                }
            } else if (req.method === 'GET') {
                const urlParts = new URL(req.url, `http://${HOST}`);
                sqlQuery = urlParts.searchParams.get('query');
            }

            if (!sqlQuery) {
                sendError(res, 400, MESSAGES.ERR_SQL_MISSING, MESSAGES.ERR_TYPE_INPUT);
                return;
            }

            const command = validateAndExtractCommand(sqlQuery);

            if (command === 'BLOCKED') {
                sendError(res, 403, MESSAGES.ERR_SQL_FORBIDDEN, MESSAGES.ERR_TYPE_SECURITY);
            } else if (command === 'SELECT' && req.method === 'GET') {
                processRawQuery(sqlQuery, res, 'SELECT');
            } else if (command === 'INSERT' && req.method === 'POST') {
                processRawQuery(sqlQuery, res, 'INSERT');
            } else {
                const expectedMethod = command === 'SELECT' ? 'GET' : 'POST';
                sendError(res, 405, MESSAGES.ERR_METHOD_MISMATCH(command, expectedMethod), MESSAGES.ERR_TYPE_METHOD);
            }
            return;
        }

        sendError(res, 404, MESSAGES.ERR_ENDPOINT_NOT_FOUND);
    });
});

/**
 * Helper to send a consistent JSON error response.
 */
function sendError(res, statusCode, message, type = 'SERVER ERROR') {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, errorType: type, message: message }));
}


server.listen(PORT, () => {
    console.log(`Node.js Database Server (Origin 2) running at http://${HOST}/`);
    console.log(`Ensure your client (Origin 1) is accessing this from a different host/port for proper CORS testing.`);
});


#!/usr/bin/env node
/**
 * MCP Stdio-to-Streamable-HTTP Bridge for whatsapp-mcp
 * Bridges Antigravity's standard JSON-RPC stdio into Sealjay's HTTP MCP endpoint (http://127.0.0.1:8765/mcp)
 */

const http = require('http');
const readline = require('readline');

const TARGET_URL = process.env.WHATSAPP_MCP_URL || 'http://127.0.0.1:8765/mcp';
const url = new URL(TARGET_URL);

let sessionId = null;

function sendToHttp(msgObj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(msgObj);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Rate-Limit-Override': 'true'
    };

    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: headers
    }, (res) => {
      // Capture session id if returned
      const newSid = res.headers['mcp-session-id'];
      if (newSid) {
        sessionId = newSid;
      }

      let resBody = '';
      res.on('data', chunk => {
        resBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // If response contains SSE framing, unwrap it
          let clean = resBody.trim();
          if (clean.startsWith('data: ')) {
            clean = clean.replace(/^data:\s*/, '');
          }
          try {
            const parsed = JSON.parse(clean);
            resolve(parsed);
          } catch (e) {
            resolve(null);
          }
        } else {
          // Send JSON-RPC error if target returned HTTP error
          if (msgObj.id !== undefined) {
            resolve({
              jsonrpc: '2.0',
              id: msgObj.id,
              error: {
                code: -32603,
                message: `HTTP error ${res.statusCode}: ${resBody}`
              }
            });
          } else {
            resolve(null);
          }
        }
      });
    });

    req.on('error', (err) => {
      if (msgObj.id !== undefined) {
        resolve({
          jsonrpc: '2.0',
          id: msgObj.id,
          error: {
            code: -32603,
            message: `Connection error to WhatsApp daemon: ${err.message}`
          }
        });
      } else {
        resolve(null);
      }
    });

    req.write(data);
    req.end();
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);
    const resp = await sendToHttp(msg);
    if (resp) {
      process.stdout.write(JSON.stringify(resp) + '\n');
    }
  } catch (err) {
    // Ignore invalid JSON or send parse error if possible
  }
});

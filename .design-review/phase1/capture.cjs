// Uses the installed Chrome and Node's built-in WebSocket; no dependencies.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-phase1-capture-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
(async () => {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    chrome.stderr.on('data', chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.on('error', reject);
    chrome.on('exit', code => reject(new Error('Chrome exited: ' + code)));
  });
  const port = new URL(endpoint).port;
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  let load;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.loadEventFired' && load) { load(); load = null; }
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  for (const [stage, port] of [['before', 3101], ['after', 3000]]) {
    for (const [name, route] of [['home', '/'], ['login', '/login'], ['register', '/register']]) {
      for (const [device, width] of [['desktop', 1440], ['mobile', 390]]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        const loaded = new Promise(resolve => { load = resolve; });
        await send('Page.navigate', { url: 'http://localhost:' + port + route });
        await loaded;
        await send('Runtime.evaluate', { expression: `Promise.all([document.fonts.ready, ...Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))]).then(() => new Promise(resolve => setTimeout(resolve, 1000)))`, awaitPromise: true });
        const { result } = await send('Runtime.evaluate', { expression: 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)', returnByValue: true });
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: result.value, scale: 1 } });
        const file = path.join(__dirname, stage, name + '-' + device + '.png');
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(stage + '/' + name + '-' + device + ': ' + width + 'x' + result.value);
      }
    }
  }
  socket.close();
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => chrome.kill());

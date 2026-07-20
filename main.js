'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const APP_NAME = '해우소 3D';
const EXT = 'haeuso';
const ROOT = __dirname;
const OPEN_FILTERS = [
  { name: '해우소 3D', extensions: [EXT] },
  { name: '이전 형식', extensions: ['hws', 'json'] },
];

let win = null;
let pendingOpen = null;    // 창이 만들어지기 전에 열라고 요청된 파일
let rendererReady = false; // 렌더러가 ipc 수신 준비를 마쳤는지
let queuedOpen = null;     // 렌더러가 준비되기 전에 도착한 파일

/* file:// 로 ES 모듈을 로드하면 origin 이 opaque 라 CORS 로 막힌다.
   전용 스킴을 만들어 앱 폴더만 서빙한다. */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const isDoc = p => typeof p === 'string' && /\.(haeuso|hws|json)$/i.test(p);
const docFromArgv = argv => (argv || []).slice(1).find(isDoc);

/* ---------------- 단일 인스턴스 ---------------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = docFromArgv(argv);
    if (f) openPath(f);
  });
}

/* macOS: 파일을 더블클릭하거나 독 아이콘에 떨궜을 때 */
app.on('open-file', (e, p) => {
  e.preventDefault();
  if (win) openPath(p); else pendingOpen = p;
});

/* ---------------- 파일 열기 ---------------- */
async function openPath(p) {
  if (!win) { pendingOpen = p; return; }
  if (!rendererReady) { queuedOpen = p; return; }   // 아직 리스너가 없으면 메시지가 유실된다
  try {
    const text = await fs.readFile(p, 'utf8');
    win.webContents.send('file:opened', { path: p, text });
  } catch (err) {
    dialog.showErrorBox('열기 실패', `${p}\n\n${err.message || err}`);
  }
}

ipcMain.on('renderer:ready', () => {
  rendererReady = true;
  if (queuedOpen) { const p = queuedOpen; queuedOpen = null; openPath(p); }
});

/* ---------------- 창 ---------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1080, minHeight: 660,
    title: APP_NAME,
    backgroundColor: '#F2F4F6',
    show: false,
    icon: process.platform === 'linux' ? path.join(ROOT, 'build', 'icon.png') : undefined,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadURL(`app://haeuso/index.html`);
  win.once('ready-to-show', () => {
    win.show();
    const first = pendingOpen || docFromArgv(process.argv);
    if (first) { openPath(first); pendingOpen = null; }
  });

  // 저장 안 한 변경이 있으면 닫기 전에 물어본다
  let forceClose = false;
  win.on('close', async (e) => {
    if (forceClose || !win.isDocumentEdited()) return;
    e.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['저장하고 닫기', '저장 안 함', '취소'],
      defaultId: 0, cancelId: 2,
      message: '저장하지 않은 변경이 있습니다.',
      detail: '닫기 전에 저장할까요?',
    });
    if (response === 2) return;
    if (response === 0) {
      const ok = await new Promise(res => {
        ipcMain.once('file:saveResult', (_e, r) => res(r));
        win.webContents.send('menu:action', 'save');
      });
      if (!ok) return;             // 저장 취소하면 닫지 않는다
    }
    forceClose = true;
    win.close();
  });

  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  win.on('closed', () => { win = null; rendererReady = false; });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

/* ---------------- 메뉴 ---------------- */
function send(action) { if (win) win.webContents.send('menu:action', action); }

function buildMenu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{
      label: APP_NAME,
      submenu: [{ role: 'about', label: `${APP_NAME} 정보` }, { type: 'separator' },
        { role: 'hide', label: '가리기' }, { role: 'hideOthers', label: '다른 항목 가리기' },
        { role: 'unhide', label: '모두 보기' }, { type: 'separator' },
        { role: 'quit', label: '종료' }],
    }] : []),
    {
      label: '파일',
      submenu: [
        { label: '새로 만들기', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: '열기…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: '저장', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: '다른 이름으로 저장…', accelerator: 'Shift+CmdOrCtrl+S', click: () => send('saveAs') },
        { type: 'separator' },
        { label: 'STL 내보내기… (3D 프린팅)', accelerator: 'CmdOrCtrl+E', click: () => send('stl') },
        { label: 'PNG로 내보내기… (배경 투명)', accelerator: 'Shift+CmdOrCtrl+E', click: () => send('png') },
        ...(mac ? [] : [{ type: 'separator' }, { role: 'quit', label: '종료' }]),
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '되돌리기', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: '다시 실행', accelerator: 'Shift+CmdOrCtrl+Z', click: () => send('redo') },
        { type: 'separator' },
        { label: '복제', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: '삭제', click: () => send('delete') },   // 단축키는 렌더러가 처리 (입력창에 타이핑 중일 땐 무시해야 해서)
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '선택 포커스', click: () => send('frame') },   // 위와 같은 이유로 단축키는 렌더러가 담당
        { type: 'separator' },
        { role: 'resetZoom', label: '실제 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { role: 'reload', label: '새로고침' },
      ],
    },
    ...(mac ? [{ role: 'windowMenu', label: '윈도우' }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC ---------------- */
async function askSavePath(defName) {
  const r = await dialog.showSaveDialog(win, {
    title: '저장',
    defaultPath: defName || `무제.${EXT}`,
    filters: [{ name: '해우소 3D', extensions: [EXT] }],
  });
  return r.canceled ? null : r.filePath;
}

ipcMain.handle('file:save', async (_e, { text, filePath, asNew }) => {
  try {
    let p = asNew ? null : filePath;
    if (!p) p = await askSavePath(filePath ? path.basename(filePath) : null);
    if (!p) return { canceled: true };
    await fs.writeFile(p, text, 'utf8');
    return { canceled: false, path: p };
  } catch (err) {
    dialog.showErrorBox('저장 실패', String(err.message || err));
    return { canceled: true, error: true };
  }
});

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: OPEN_FILTERS });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const p = r.filePaths[0];
  try {
    return { canceled: false, path: p, text: await fs.readFile(p, 'utf8') };
  } catch (err) {
    dialog.showErrorBox('열기 실패', String(err.message || err));
    return { canceled: true, error: true };
  }
});

ipcMain.handle('file:exportSTL', async (_e, { text, name }) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'STL 내보내기', defaultPath: name || 'model.stl',
    filters: [{ name: 'STL (3D 프린팅)', extensions: ['stl'] }],
  });
  if (r.canceled) return { canceled: true };
  try {
    await fs.writeFile(r.filePath, text, 'utf8');
    return { canceled: false, path: r.filePath };
  } catch (err) {
    dialog.showErrorBox('내보내기 실패', String(err.message || err));
    return { canceled: true, error: true };
  }
});

ipcMain.handle('file:exportPNG', async (_e, { dataUrl, name }) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'PNG로 내보내기', defaultPath: name || 'model.png',
    filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
  });
  if (r.canceled) return { canceled: true };
  try {
    const base64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
    await fs.writeFile(r.filePath, Buffer.from(base64, 'base64'));
    return { canceled: false, path: r.filePath };
  } catch (err) {
    dialog.showErrorBox('내보내기 실패', String(err.message || err));
    return { canceled: true, error: true };
  }
});

ipcMain.on('title:set', (_e, { filePath, dirty }) => {
  if (!win) return;
  const base = filePath ? path.basename(filePath) : '무제';
  win.setTitle(`${dirty ? '• ' : ''}${base} — ${APP_NAME}`);
  win.setDocumentEdited(!!dirty);
  if (process.platform === 'darwin') win.setRepresentedFilename(filePath || '');
});

/* 저장하지 않고 새로 만들기/열기 직전 확인 */
ipcMain.handle('confirm:discard', async () => {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['계속', '취소'], defaultId: 1, cancelId: 1,
    message: '저장하지 않은 변경이 있습니다.',
    detail: '변경 내용이 사라집니다. 계속할까요?',
  });
  return response === 0;
});

/* ---------------- 시작 ---------------- */
/* asar 안의 파일은 file:// 로 못 읽는다 (net.fetch 가 아카이브를 들여다보지 못함).
   Electron 이 패치해 둔 fs 로 직접 읽어야 개발/패키징 양쪽에서 동일하게 동작한다.
   ES 모듈은 Content-Type 이 JS 계열이 아니면 실행 자체를 거부하므로 MIME 을 반드시 붙인다. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const abs = path.normalize(path.join(ROOT, rel));
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {      // 경로 탈출 차단
      return new Response('forbidden', { status: 403 });
    }
    try {
      const buf = await fs.readFile(abs);
      return new Response(buf, {
        headers: { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
  buildMenu();
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

import { defineConfig } from 'vite';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  plugins: [
    {
      name: 'running-apps-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/running-apps') {
            const tempFile = path.join('/tmp', `apps_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.swift`);
            const swiftCode = `import AppKit
import Foundation

let workspace = NSWorkspace.shared
let apps = workspace.runningApplications

var resultList: [[String: String]] = []

for app in apps {
    guard app.activationPolicy == .regular else { continue }
    guard let bundleId = app.bundleIdentifier else { continue }
    
    // localizedName（「カレンダー」等の表示名）を最優先で取得
    var name = app.localizedName ?? ""
    
    // 取得できなかった場合のフォールバックとして plist のパースを行う
    if name.isEmpty {
        if let bundleURL = app.bundleURL,
           let bundle = Bundle(url: bundleURL) {
            let info = bundle.localizedInfoDictionary ?? bundle.infoDictionary ?? [:]
            if let displayName = info["CFBundleDisplayName"] as? String {
                name = displayName
            } else if let bundleName = info["CFBundleName"] as? String {
                name = bundleName
            }
        }
    }
    
    resultList.append(["name": name, "id": bundleId])
}

if let jsonData = try? JSONSerialization.data(withJSONObject: resultList, options: []),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
}
`;
            try {
              fs.writeFileSync(tempFile, swiftCode);
              exec(`swift "${tempFile}" < /dev/null`, (err, stdout, stderr) => {
                try { fs.unlinkSync(tempFile); } catch (e) {}
                
                if (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message }));
                  return;
                }
                
                let parsedApps = [];
                try {
                  parsedApps = JSON.parse(stdout.trim());
                } catch (e) {
                  console.error("Failed to parse swift output:", e);
                }

                const apps = parsedApps
                  .filter(app => app.name.length > 0)
                  .filter((app, index, self) => 
                    self.findIndex(a => a.name === app.name) === index
                  )
                  .sort((a, b) => a.name.localeCompare(b.name));
                
                res.writeHead(200, { 
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache'
                });
                res.end(JSON.stringify({ apps }));
              });
            } catch (e) {
              console.error("Failed to run running apps swift script:", e);
              res.writeHead(500);
              res.end();
            }
          } else if (req.url.startsWith('/api/app-icon')) {
            const urlParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const bundleId = urlParams.searchParams.get('bundleId');
            if (!bundleId) {
              res.writeHead(400);
              res.end();
              return;
            }
            
            // 一時ファイルを作成して実行（対話モードに入りゴミ文字が混ざるのを防止）
            const tempFile = path.join('/tmp', `icon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.swift`);
            const swiftCode = `import AppKit
import Foundation

let bundleId = "${bundleId}"
let originalImage: NSImage

if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
    originalImage = NSWorkspace.shared.icon(forFile: url.path)
} else {
    if let img = NSImage(named: NSImage.applicationIconName) {
        originalImage = img
    } else {
        originalImage = NSImage(size: NSSize(width: 64, height: 64))
    }
}

if let bitmapRep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: 64,
    pixelsHigh: 64,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) {
    bitmapRep.size = NSSize(width: 64, height: 64)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmapRep)
    originalImage.draw(
        in: NSRect(x: 0, y: 0, width: 64, height: 64),
        from: NSRect(origin: .zero, size: originalImage.size),
        operation: .copy,
        fraction: 1.0
    )
    NSGraphicsContext.restoreGraphicsState()
    if let pngData = bitmapRep.representation(using: .png, properties: [:]) {
        print(pngData.base64EncodedString())
    }
}
`;
            
            try {
              fs.writeFileSync(tempFile, swiftCode);
              
              exec(`swift "${tempFile}" < /dev/null`, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                // 一時ファイルを削除
                try { fs.unlinkSync(tempFile); } catch (e) {}
                
                if (err) {
                  console.error(`[API Error] Swift execution failed for bundleId: ${bundleId}`, err.message, stderr);
                  res.writeHead(404);
                  res.end();
                  return;
                }
                
                if (!stdout.trim()) {
                  console.warn(`[API Warn] Swift executed successfully but returned empty output for bundleId: ${bundleId}`);
                  res.writeHead(404);
                  res.end();
                  return;
                }
                
                const buffer = Buffer.from(stdout.trim(), 'base64');
                res.writeHead(200, {
                  'Content-Type': 'image/png',
                  'Cache-Control': 'public, max-age=86400'
                });
                res.end(buffer);
              });
            } catch (e) {
              console.error(`[API Error] Failed to write temp swift file`, e);
              try { fs.unlinkSync(tempFile); } catch (err) {}
              res.writeHead(500);
              res.end();
            }
          } else if (req.url === '/api/update' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const homeDir = process.env.HOME || process.env.USERPROFILE;
                const initPath = path.join(homeDir, '.hammerspoon', 'init.lua');
                const parentDir = path.dirname(initPath);
                if (!fs.existsSync(parentDir)) {
                  fs.mkdirSync(parentDir, { recursive: true });
                }
                fs.writeFileSync(initPath, body, 'utf8');
                
                // Hammerspoon が起動している場合は AppleScript で hs.reload() を実行
                exec(`osascript -e 'tell application "Hammerspoon" to execute "hs.reload()"'`, (err) => {});
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else if (req.url === '/api/update-js' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const projName = decodeURIComponent(req.headers['x-project-name'] || 'lsb_macro')
                  .replace(/[\s/\\?%*:|"<>\s]/g, '_');
                const homeDir = process.env.HOME || process.env.USERPROFILE;
                const mkDir = path.join(homeDir, '.config', 'MultiKeyBoard', 'scripts');
                if (!fs.existsSync(mkDir)) {
                  fs.mkdirSync(mkDir, { recursive: true });
                }
                const jsPath = path.join(mkDir, `${projName}.js`);
                fs.writeFileSync(jsPath, body, 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
  }
});

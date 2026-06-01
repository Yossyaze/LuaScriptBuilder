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
            const script = `osascript -e '
            set resultList to {}
            tell application "System Events"
                set processList to every process whose background only is false
                repeat with p in processList
                    try
                        set procName to name of p
                        set procId to bundle identifier of p
                        if procId is missing value then
                            set end of resultList to procName & ":"
                        else
                            set end of resultList to procName & ":" & procId
                        end if
                    on error
                        -- ignore
                    end try
                end repeat
            end tell
            return resultList
            '`;
            exec(script, (err, stdout, stderr) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
              const apps = stdout
                .trim()
                .split(',')
                .map(item => {
                  const parts = item.split(':');
                  const name = parts[0] ? parts[0].trim() : '';
                  const id = parts[1] ? parts[1].trim() : '';
                  return { name, id };
                })
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

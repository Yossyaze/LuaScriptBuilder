import AppKit
if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari"),
   let rep = NSWorkspace.shared.icon(forFile: url.path).tiffRepresentation,
   let bitmap = NSBitmapImageRep(data: rep),
   let png = bitmap.representation(using: .png, properties: [:]) {
    print(png.base64EncodedString())
}

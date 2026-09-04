// Renders the Snimok app icon into an .iconset folder. Usage: make-icon <outdir>
import AppKit

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ctx
    let s = CGFloat(px)
    let inset = s * 0.06
    let bg = NSBezierPath(roundedRect: NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset),
                          xRadius: s * 0.22, yRadius: s * 0.22)
    // Darkroom amber (#E6A53F) with near-black marks (#1A1205).
    NSColor(calibratedRed: 0.902, green: 0.647, blue: 0.247, alpha: 1).setFill()
    bg.fill()

    let ink = NSColor(calibratedRed: 0.102, green: 0.071, blue: 0.020, alpha: 1)
    ink.setStroke()
    let stroke = NSBezierPath()
    stroke.lineWidth = s * 0.065
    stroke.lineCapStyle = .round
    stroke.lineJoinStyle = .round
    let m = s * 0.28, l = s * 0.1
    // corner brackets
    stroke.move(to: NSPoint(x: m, y: s - m - l)); stroke.line(to: NSPoint(x: m, y: s - m)); stroke.line(to: NSPoint(x: m + l, y: s - m))
    stroke.move(to: NSPoint(x: s - m - l, y: s - m)); stroke.line(to: NSPoint(x: s - m, y: s - m)); stroke.line(to: NSPoint(x: s - m, y: s - m - l))
    stroke.move(to: NSPoint(x: m, y: m + l)); stroke.line(to: NSPoint(x: m, y: m)); stroke.line(to: NSPoint(x: m + l, y: m))
    stroke.move(to: NSPoint(x: s - m - l, y: m)); stroke.line(to: NSPoint(x: s - m, y: m)); stroke.line(to: NSPoint(x: s - m, y: m + l))
    stroke.stroke()

    ink.setFill()
    NSBezierPath(ovalIn: NSRect(x: s / 2 - s * 0.09, y: s / 2 - s * 0.09, width: s * 0.18, height: s * 0.18)).fill()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    try! render(base).write(to: URL(fileURLWithPath: "\(out)/icon_\(base)x\(base).png"))
    try! render(base * 2).write(to: URL(fileURLWithPath: "\(out)/icon_\(base)x\(base)@2x.png"))
}
print("icons written to \(out)")

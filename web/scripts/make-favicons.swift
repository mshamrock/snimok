// Renders the Snimok mark (the same geometry as src/app/icon.svg and
// components/Logo.tsx) into every raster icon the site needs:
//
//   swift scripts/make-favicons.swift          (run from web/)
//
//   src/app/favicon.ico        16 / 32 / 48 px, PNG-in-ICO (tabs, bookmarks, Google results)
//   src/app/apple-icon.png     180 px, opaque full-bleed (iOS adds its own rounded mask)
//   public/icon-192.png        PWA manifest
//   public/icon-512.png        PWA manifest
//   public/icon-maskable-512.png  Android adaptive icon (mark inside the 80 % safe zone)
//
// Small sizes use a full-bleed tile and slightly heavier strokes so the
// viewfinder corners survive at 16 px.

import AppKit
import ImageIO
import UniformTypeIdentifiers

let amber = CGColor(srgbRed: 0xe6 / 255, green: 0xa5 / 255, blue: 0x3f / 255, alpha: 1)
let ink = CGColor(srgbRed: 0x1a / 255, green: 0x12 / 255, blue: 0x05 / 255, alpha: 1)

enum Style {
    case tile(inset: CGFloat, radius: CGFloat, stroke: CGFloat) // rounded amber tile on transparency
    case square(stroke: CGFloat)                                // opaque full-bleed amber
    case pixel16                                                // hand-fitted to the 16 px grid
}

/// 16 px is too small for the vector mark: corners and lens are snapped to
/// whole pixels instead (1 unit = ¼ px; lines sit on pixel centres).
func drawPixel16(_ ctx: CGContext) {
    ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 64, height: 64), cornerWidth: 12, cornerHeight: 12, transform: nil))
    ctx.setFillColor(amber)
    ctx.fillPath()
    ctx.setShouldAntialias(false)
    ctx.setFillColor(ink)
    // Each corner: a 1 px wide, 3 px long arm in both directions from the outer pixel.
    for (x, y, dx, dy) in [(12, 12, 1, 1), (48, 12, -1, 1), (12, 48, 1, -1), (48, 48, -1, -1)] as [(CGFloat, CGFloat, CGFloat, CGFloat)] {
        ctx.fill(CGRect(x: dx > 0 ? x : x - 8, y: y, width: 12, height: 4))           // horizontal arm
        ctx.fill(CGRect(x: x, y: dy > 0 ? y : y - 8, width: 4, height: 12))           // vertical arm
    }
    // The lens: a 4 px dot with its corner pixels knocked off.
    ctx.fill(CGRect(x: 28, y: 24, width: 8, height: 16))
    ctx.fill(CGRect(x: 24, y: 28, width: 16, height: 8))
}

/// Draws in the SVG's 64×64 coordinate space (y down), scaled to `px`.
func render(px: Int, style: Style) -> CGImage {
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let s = CGFloat(px) / 64
    ctx.translateBy(x: 0, y: CGFloat(px))
    ctx.scaleBy(x: s, y: -s)
    ctx.setShouldAntialias(true)
    ctx.interpolationQuality = .high

    if case .pixel16 = style {
        drawPixel16(ctx)
        return ctx.makeImage()!
    }

    let stroke: CGFloat
    switch style {
    case .tile(let inset, let radius, let w):
        let r = CGRect(x: inset, y: inset, width: 64 - inset * 2, height: 64 - inset * 2)
        ctx.addPath(CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil))
        ctx.setFillColor(amber)
        ctx.fillPath()
        stroke = w
    case .square(let w):
        ctx.setFillColor(amber)
        ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        stroke = w
    case .pixel16:
        return ctx.makeImage()!
    }

    // The four viewfinder corners: M18 26v-6a2 2 0 0 1 2-2h6 … mirrored.
    let corners: [(start: CGPoint, corner: CGPoint, end: CGPoint)] = [
        (CGPoint(x: 18, y: 26), CGPoint(x: 18, y: 18), CGPoint(x: 26, y: 18)),
        (CGPoint(x: 46, y: 26), CGPoint(x: 46, y: 18), CGPoint(x: 38, y: 18)),
        (CGPoint(x: 18, y: 38), CGPoint(x: 18, y: 46), CGPoint(x: 26, y: 46)),
        (CGPoint(x: 46, y: 38), CGPoint(x: 46, y: 46), CGPoint(x: 38, y: 46)),
    ]
    let path = CGMutablePath()
    for c in corners {
        path.move(to: c.start)
        path.addArc(tangent1End: c.corner, tangent2End: c.end, radius: 2)
        path.addLine(to: c.end)
    }
    ctx.addPath(path)
    ctx.setStrokeColor(ink)
    ctx.setLineWidth(stroke)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.strokePath()

    // The lens: circle r 6 at the centre.
    ctx.setFillColor(ink)
    ctx.fillEllipse(in: CGRect(x: 26, y: 26, width: 12, height: 12))
    return ctx.makeImage()!
}

func pngData(_ image: CGImage) -> Data {
    let data = NSMutableData()
    let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
    return data as Data
}

func write(_ data: Data, _ path: String) {
    try! data.write(to: URL(fileURLWithPath: path))
    print("✓ \(path) (\(data.count) bytes)")
}

/// ICO container with PNG payloads (supported by every current browser).
func ico(_ images: [(px: Int, png: Data)]) -> Data {
    var out = Data()
    func u16(_ v: Int) { var x = UInt16(v).littleEndian; out.append(Data(bytes: &x, count: 2)) }
    func u32(_ v: Int) { var x = UInt32(v).littleEndian; out.append(Data(bytes: &x, count: 4)) }
    u16(0); u16(1); u16(images.count)
    var offset = 6 + 16 * images.count
    for i in images {
        out.append(UInt8(i.px >= 256 ? 0 : i.px)) // width
        out.append(UInt8(i.px >= 256 ? 0 : i.px)) // height
        out.append(0); out.append(0)               // palette, reserved
        u16(1); u16(32)                            // planes, bits per pixel
        u32(i.png.count); u32(offset)
        offset += i.png.count
    }
    for i in images { out.append(i.png) }
    return out
}

// Small sizes: fill the canvas and thicken the strokes so they stay crisp.
let favicon = ico([
    (16, pngData(render(px: 16, style: .pixel16))),
    (32, pngData(render(px: 32, style: .tile(inset: 1, radius: 12, stroke: 5.2)))),
    (48, pngData(render(px: 48, style: .tile(inset: 2, radius: 12, stroke: 4.8)))),
])
write(favicon, "src/app/favicon.ico")
write(pngData(render(px: 180, style: .square(stroke: 4.5))), "src/app/apple-icon.png")
write(pngData(render(px: 192, style: .tile(inset: 4, radius: 12, stroke: 4.5))), "public/icon-192.png")
write(pngData(render(px: 512, style: .tile(inset: 4, radius: 12, stroke: 4.5))), "public/icon-512.png")
write(pngData(render(px: 512, style: .square(stroke: 4.5))), "public/icon-maskable-512.png")

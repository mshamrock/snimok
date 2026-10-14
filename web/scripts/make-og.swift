// Renders public/og.png (1200×630), the link-preview image for the public
// pages, in the Darkroom style: warm near-black, one amber accent, mono for
// data, viewfinder corners as the only ornament.
//
//   swift scripts/make-og.swift          (run from web/)

import AppKit
import CoreText
import ImageIO
import UniformTypeIdentifiers

let W = 1200, H = 630
let bg = CGColor(srgbRed: 0x0f / 255, green: 0x0e / 255, blue: 0x0c / 255, alpha: 1)
let fg = NSColor(srgbRed: 0xf1 / 255, green: 0xe9 / 255, blue: 0xda / 255, alpha: 1)
let muted = NSColor(srgbRed: 0x9c / 255, green: 0x92 / 255, blue: 0x83 / 255, alpha: 1)
let amber = CGColor(srgbRed: 0xe6 / 255, green: 0xa5 / 255, blue: 0x3f / 255, alpha: 1)
let ink = CGColor(srgbRed: 0x1a / 255, green: 0x12 / 255, blue: 0x05 / 255, alpha: 1)

let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(bg)
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

// Viewfinder corners framing the whole card (CG origin is bottom-left).
func corners(_ r: CGRect, arm: CGFloat, width: CGFloat) {
    ctx.setStrokeColor(amber)
    ctx.setLineWidth(width)
    ctx.setLineCap(.square)
    let p = CGMutablePath()
    p.move(to: CGPoint(x: r.minX, y: r.maxY - arm)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX + arm, y: r.maxY))
    p.move(to: CGPoint(x: r.maxX - arm, y: r.maxY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - arm))
    p.move(to: CGPoint(x: r.minX, y: r.minY + arm)); p.addLine(to: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.minX + arm, y: r.minY))
    p.move(to: CGPoint(x: r.maxX - arm, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY + arm))
    ctx.addPath(p)
    ctx.strokePath()
}
corners(CGRect(x: 48, y: 48, width: W - 96, height: H - 96), arm: 44, width: 4)

// The logo tile, drawn from the same geometry as src/app/icon.svg (64-unit space).
func logo(at origin: CGPoint, size: CGFloat) {
    ctx.saveGState()
    ctx.translateBy(x: origin.x, y: origin.y + size)
    ctx.scaleBy(x: size / 64, y: -size / 64)
    ctx.addPath(CGPath(roundedRect: CGRect(x: 4, y: 4, width: 56, height: 56), cornerWidth: 12, cornerHeight: 12, transform: nil))
    ctx.setFillColor(amber); ctx.fillPath()
    let path = CGMutablePath()
    for (s, c, e) in [((18, 26), (18, 18), (26, 18)), ((46, 26), (46, 18), (38, 18)), ((18, 38), (18, 46), (26, 46)), ((46, 38), (46, 46), (38, 46))] {
        path.move(to: CGPoint(x: s.0, y: s.1))
        path.addArc(tangent1End: CGPoint(x: c.0, y: c.1), tangent2End: CGPoint(x: e.0, y: e.1), radius: 2)
        path.addLine(to: CGPoint(x: e.0, y: e.1))
    }
    ctx.addPath(path)
    ctx.setStrokeColor(ink); ctx.setLineWidth(4.5); ctx.setLineCap(.round); ctx.setLineJoin(.round); ctx.strokePath()
    ctx.setFillColor(ink); ctx.fillEllipse(in: CGRect(x: 26, y: 26, width: 12, height: 12))
    ctx.restoreGState()
}

/// Draws one line of text with its baseline at `y`; returns its width.
@discardableResult
func text(_ s: String, font: NSFont, color: NSColor, x: CGFloat, y: CGFloat, kern: CGFloat = 0) -> CGFloat {
    let attr = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .kern: kern])
    let line = CTLineCreateWithAttributedString(attr)
    ctx.textPosition = CGPoint(x: x, y: y)
    CTLineDraw(line, ctx)
    return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
}

let left: CGFloat = 112
logo(at: CGPoint(x: left - 6, y: 420), size: 96)
text("Snimok", font: .systemFont(ofSize: 52, weight: .semibold), color: fg, x: left + 106, y: 450, kern: -1)

let headline = NSFont.systemFont(ofSize: 88, weight: .semibold)
text("Screenshot. Link. Done.", font: headline, color: fg, x: left, y: 288, kern: -2.5)

let mono = NSFont.monospacedSystemFont(ofSize: 26, weight: .medium)
let w1 = text("FREE SCREENSHOT TOOL FOR MAC", font: mono, color: muted, x: left, y: 196, kern: 2)
ctx.setFillColor(amber)
ctx.fill(CGRect(x: left + w1 + 22, y: 202, width: 10, height: 10))
text("SNIMOK.XYZ", font: mono, color: NSColor(cgColor: amber)!, x: left + w1 + 50, y: 196, kern: 2)

text("Area · Window · GIF  —  annotate, tag, search by the text on it", font: .systemFont(ofSize: 26, weight: .regular),
     color: muted, x: left, y: 140)

let url = URL(fileURLWithPath: "public/og.png")
let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)
print("✓ public/og.png")

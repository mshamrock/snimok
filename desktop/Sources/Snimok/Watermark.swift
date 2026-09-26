import AppKit
import CoreText
import ImageIO
import UniformTypeIdentifiers

/// "snimok.xyz" stamped into the bottom-left corner of a capture, like a
/// camera's date stamp. The ink follows the background under it: dark text on
/// light pixels, light text on dark ones. Off by default (Settings.watermark).
enum Watermark {
    static let text = "snimok.xyz"

    enum Ink {
        case light, dark

        /// Darkroom tokens: foreground-on-paper and foreground-on-dark.
        var color: CGColor {
            switch self {
            case .dark: return CGColor(srgbRed: 0x1b / 255, green: 0x17 / 255, blue: 0x12 / 255, alpha: 0.82)
            case .light: return CGColor(srgbRed: 0xf1 / 255, green: 0xe9 / 255, blue: 0xda / 255, alpha: 0.88)
            }
        }

        /// A soft halo in the opposite tone keeps the text readable on busy pixels.
        var halo: CGColor {
            switch self {
            case .dark: return CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.45)
            case .light: return CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.55)
            }
        }
    }

    /// Text size, margin and the laid-out line for an image of `width` × `height` px.
    private struct Layout {
        let line: CTLine
        let size: CGFloat
        let margin: CGFloat
        let width: CGFloat
        let ascent: CGFloat
        let descent: CGFloat

        /// Where the text sits, in top-left-origin pixel coordinates (for sampling).
        func rectTopLeft(imageHeight: Int) -> CGRect {
            let h = ascent + descent
            return CGRect(x: margin, y: CGFloat(imageHeight) - margin - h, width: width, height: h)
        }
    }

    private static func layout(width: Int, height: Int) -> Layout? {
        // ~3.5 % of the short side: a quiet stamp, never shouting over the capture.
        let size = min(40, max(12, CGFloat(min(width, height)) * 0.035)).rounded()
        let font = NSFont.monospacedSystemFont(ofSize: size, weight: .medium)
        // Without "colour from context" Core Text would draw black whatever the fill colour is.
        let fromContext = NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String)
        let attributed = NSAttributedString(string: text, attributes: [.font: font, fromContext: true])
        let line = CTLineCreateWithAttributedString(attributed)
        var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
        let w = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))
        let margin = (size * 0.6).rounded()
        // Too small to carry a stamp without covering the content: leave it clean.
        if w + margin * 2 > CGFloat(width) * 0.6 || (ascent + descent) * 2.5 > CGFloat(height) { return nil }
        return Layout(line: line, size: size, margin: margin, width: w, ascent: ascent, descent: descent)
    }

    /// Average luminance (Rec. 709) of `rect` decides the ink.
    static func ink(for image: CGImage, in rect: CGRect) -> Ink {
        let bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        let r = rect.insetBy(dx: -4, dy: -4).intersection(bounds).integral
        guard !r.isEmpty, let crop = image.cropping(to: r) else { return .light }
        // Downsample the region to a small bitmap and average it.
        let w = 24, h = 8
        var px = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return .light }
        ctx.interpolationQuality = .medium
        ctx.draw(crop, in: CGRect(x: 0, y: 0, width: w, height: h))
        var sum = 0.0
        for i in stride(from: 0, to: px.count, by: 4) {
            sum += 0.2126 * Double(px[i]) + 0.7152 * Double(px[i + 1]) + 0.0722 * Double(px[i + 2])
        }
        let luminance = sum / Double(w * h) / 255
        return luminance > 0.55 ? .dark : .light
    }

    /// The ink a given image would get (used to keep one colour across a GIF).
    static func ink(for image: CGImage) -> Ink? {
        guard let l = layout(width: image.width, height: image.height) else { return nil }
        return ink(for: image, in: l.rectTopLeft(imageHeight: image.height))
    }

    /// A copy of `image` with the stamp; `ink` fixes the colour (GIF frames), otherwise it is sampled.
    static func apply(to image: CGImage, ink fixed: Ink? = nil) -> CGImage {
        guard let l = layout(width: image.width, height: image.height) else { return image }
        let ink = fixed ?? ink(for: image, in: l.rectTopLeft(imageHeight: image.height))
        let space = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!
        guard let ctx = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: space.model == .rgb ? space : CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return image }
        let full = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        ctx.draw(image, in: full)
        // Core Graphics' origin is bottom-left, which is exactly the corner we want.
        ctx.textPosition = CGPoint(x: l.margin, y: l.margin + l.descent)
        ctx.setShadow(offset: .zero, blur: max(2, l.size / 6), color: ink.halo)
        ctx.setFillColor(ink.color)
        CTLineDraw(l.line, ctx)
        return ctx.makeImage() ?? image
    }

    /// Stamps a PNG file in place. Leaves the file untouched and returns false on any failure.
    @discardableResult
    static func stamp(pngAt url: URL) -> Bool {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return false }
        let stamped = apply(to: image)
        if stamped === image { return false } // too small, nothing drawn
        let tmp = url.deletingLastPathComponent().appendingPathComponent("wm-\(UUID().uuidString).png")
        guard let dest = CGImageDestinationCreateWithURL(tmp as CFURL, UTType.png.identifier as CFString, 1, nil) else { return false }
        CGImageDestinationAddImage(dest, stamped, nil)
        guard CGImageDestinationFinalize(dest) else { return false }
        do {
            _ = try FileManager.default.replaceItemAt(url, withItemAt: tmp)
            return true
        } catch {
            try? FileManager.default.removeItem(at: tmp)
            return false
        }
    }
}

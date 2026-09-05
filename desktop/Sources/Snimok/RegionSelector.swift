import AppKit

/// Full-screen overlay where the user drags a rectangle. Draws the selection
/// with the viewfinder corners of the brand and reports the rect in global
/// screen coordinates (Cocoa: origin bottom-left) plus the screen it is on.
final class RegionSelector {
    static let shared = RegionSelector()
    private var windows: [OverlayWindow] = []
    private var completion: ((CGRect, NSScreen)?) -> Void = { _ in }
    private var previousApp: NSRunningApplication?

    func pick(completion: @escaping ((CGRect, NSScreen)?) -> Void) {
        guard windows.isEmpty else { return }
        self.completion = completion
        previousApp = NSWorkspace.shared.frontmostApplication
        for screen in NSScreen.screens {
            let w = OverlayWindow(screen: screen) { [weak self] result in self?.finish(result) }
            windows.append(w)
            w.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
        NSCursor.crosshair.push()
    }

    private func finish(_ result: (CGRect, NSScreen)?) {
        guard !windows.isEmpty else { return }
        NSCursor.pop()
        for w in windows { w.orderOut(nil) }
        windows.removeAll()
        // Give focus back so the recorded app keeps its state (menus, hover…).
        if let previousApp, previousApp.bundleIdentifier != Bundle.main.bundleIdentifier {
            previousApp.activate()
        }
        let cb = completion
        completion = { _ in }
        cb(result)
    }
}

private final class OverlayWindow: NSWindow {
    init(screen: NSScreen, onDone: @escaping ((CGRect, NSScreen)?) -> Void) {
        super.init(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .screenSaver
        ignoresMouseEvents = false
        acceptsMouseMovedEvents = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        let view = SelectionView(frame: NSRect(origin: .zero, size: screen.frame.size))
        view.onDone = { [weak self] localRect in
            guard let self else { return }
            guard let localRect else { onDone(nil); return }
            let global = self.convertToScreen(localRect)
            onDone((global, screen))
        }
        contentView = view
        setFrame(screen.frame, display: false)
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

private final class SelectionView: NSView {
    var onDone: ((NSRect?) -> Void)?
    private var start: NSPoint?
    private var current: NSPoint?

    override var acceptsFirstResponder: Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }

    private var selection: NSRect? {
        guard let s = start, let c = current else { return nil }
        return NSRect(x: min(s.x, c.x), y: min(s.y, c.y), width: abs(c.x - s.x), height: abs(c.y - s.y))
    }

    override func mouseDown(with event: NSEvent) {
        start = convert(event.locationInWindow, from: nil)
        current = start
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        current = convert(event.locationInWindow, from: nil)
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        current = convert(event.locationInWindow, from: nil)
        let rect = selection
        start = nil
        current = nil
        if let rect, rect.width >= 8, rect.height >= 8 {
            onDone?(rect.integral)
        } else {
            onDone?(nil)
        }
    }

    override func rightMouseDown(with event: NSEvent) { onDone?(nil) }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { onDone?(nil) } // Esc
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedWhite: 0, alpha: 0.35).setFill()
        let dim = NSBezierPath(rect: bounds)
        if let sel = selection {
            dim.appendRect(sel)
            dim.windingRule = .evenOdd
        }
        dim.fill()
        guard let sel = selection else {
            drawHint()
            return
        }
        let amber = NSColor(calibratedRed: 0.90, green: 0.65, blue: 0.25, alpha: 1)
        amber.setStroke()
        let path = NSBezierPath()
        path.lineWidth = 2
        let l: CGFloat = 16
        let r = sel.insetBy(dx: -3, dy: -3)
        path.move(to: NSPoint(x: r.minX, y: r.minY + l)); path.line(to: NSPoint(x: r.minX, y: r.minY)); path.line(to: NSPoint(x: r.minX + l, y: r.minY))
        path.move(to: NSPoint(x: r.maxX - l, y: r.minY)); path.line(to: NSPoint(x: r.maxX, y: r.minY)); path.line(to: NSPoint(x: r.maxX, y: r.minY + l))
        path.move(to: NSPoint(x: r.minX, y: r.maxY - l)); path.line(to: NSPoint(x: r.minX, y: r.maxY)); path.line(to: NSPoint(x: r.minX + l, y: r.maxY))
        path.move(to: NSPoint(x: r.maxX - l, y: r.maxY)); path.line(to: NSPoint(x: r.maxX, y: r.maxY)); path.line(to: NSPoint(x: r.maxX, y: r.maxY - l))
        path.stroke()
        NSColor.white.withAlphaComponent(0.6).setStroke()
        let thin = NSBezierPath(rect: sel)
        thin.lineWidth = 1
        thin.stroke()
        let label = "\(Int(sel.width)) × \(Int(sel.height))" as NSString
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium),
            .foregroundColor: NSColor.white,
        ]
        let size = label.size(withAttributes: attrs)
        var origin = NSPoint(x: sel.minX, y: sel.maxY + 8)
        if origin.y + size.height + 8 > bounds.maxY { origin.y = sel.minY - size.height - 12 }
        let box = NSRect(x: origin.x, y: origin.y, width: size.width + 12, height: size.height + 6)
        NSColor(calibratedWhite: 0, alpha: 0.75).setFill()
        NSBezierPath(roundedRect: box, xRadius: 4, yRadius: 4).fill()
        label.draw(at: NSPoint(x: box.minX + 6, y: box.minY + 3), withAttributes: attrs)
    }

    private func drawHint() {
        let hint = "Drag to select the area to record · Esc to cancel" as NSString
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 14, weight: .medium),
            .foregroundColor: NSColor.white,
        ]
        let size = hint.size(withAttributes: attrs)
        let box = NSRect(x: bounds.midX - size.width / 2 - 14, y: bounds.maxY - 120, width: size.width + 28, height: size.height + 14)
        NSColor(calibratedWhite: 0, alpha: 0.7).setFill()
        NSBezierPath(roundedRect: box, xRadius: 8, yRadius: 8).fill()
        hint.draw(at: NSPoint(x: box.minX + 14, y: box.minY + 7), withAttributes: attrs)
    }
}

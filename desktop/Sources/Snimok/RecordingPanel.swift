import AppKit

/// Small floating controller shown while a GIF is being recorded: red dot,
/// elapsed / limit, Stop and Cancel. Placed just outside the recorded area so
/// it never ends up in the GIF (and it is excluded from capture anyway).
final class RecordingPanel {
    private var panel: NSPanel?
    private var timeLabel: NSTextField?
    private var dot: NSView?
    private var blink: Timer?
    private var limit: Double = 15
    var onStop: (() -> Void)?
    var onCancel: (() -> Void)?

    func show(near rect: CGRect, on screen: NSScreen, limit: Double) {
        self.limit = limit
        let width: CGFloat = 250, height: CGFloat = 44
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .screenSaver
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isMovableByWindowBackground = true

        let root = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        root.material = .hudWindow
        root.state = .active
        root.wantsLayer = true
        root.layer?.cornerRadius = 10
        root.layer?.masksToBounds = true

        let dot = NSView(frame: NSRect(x: 14, y: 17, width: 10, height: 10))
        dot.wantsLayer = true
        dot.layer?.backgroundColor = NSColor.systemRed.cgColor
        dot.layer?.cornerRadius = 5
        root.addSubview(dot)

        let label = NSTextField(labelWithString: "0:00 / \(format(limit))")
        label.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium)
        label.textColor = .white
        label.frame = NSRect(x: 32, y: 13, width: 100, height: 18)
        root.addSubview(label)

        let stop = NSButton(title: "Stop", target: self, action: #selector(stopPressed))
        stop.bezelStyle = .rounded
        stop.controlSize = .small
        stop.font = .systemFont(ofSize: 12, weight: .semibold)
        stop.frame = NSRect(x: width - 138, y: 9, width: 66, height: 26)
        stop.contentTintColor = NSColor(calibratedRed: 0.90, green: 0.65, blue: 0.25, alpha: 1)
        stop.keyEquivalent = "\r"
        root.addSubview(stop)

        let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelPressed))
        cancel.bezelStyle = .rounded
        cancel.controlSize = .small
        cancel.font = .systemFont(ofSize: 12)
        cancel.frame = NSRect(x: width - 70, y: 9, width: 62, height: 26)
        root.addSubview(cancel)

        panel.contentView = root
        panel.setFrameOrigin(origin(for: rect, on: screen, size: NSSize(width: width, height: height)))
        panel.orderFrontRegardless()
        self.panel = panel
        self.timeLabel = label
        self.dot = dot

        blink = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { [weak self] _ in
            guard let dot = self?.dot else { return }
            dot.alphaValue = dot.alphaValue < 1 ? 1 : 0.25
        }
    }

    func update(elapsed: Double) {
        timeLabel?.stringValue = "\(format(elapsed)) / \(format(limit))"
    }

    func hide() {
        blink?.invalidate()
        blink = nil
        panel?.orderOut(nil)
        panel = nil
    }

    @objc private func stopPressed() { onStop?() }
    @objc private func cancelPressed() { onCancel?() }

    private func format(_ s: Double) -> String {
        let t = Int(s.rounded(.down))
        return String(format: "%d:%02d", t / 60, t % 60)
    }

    /// Below the selection when there is room, otherwise above, otherwise inside the top edge.
    private func origin(for rect: CGRect, on screen: NSScreen, size: NSSize) -> NSPoint {
        let visible = screen.visibleFrame
        var x = rect.midX - size.width / 2
        x = min(max(x, visible.minX + 8), visible.maxX - size.width - 8)
        if rect.minY - size.height - 12 >= visible.minY {
            return NSPoint(x: x, y: rect.minY - size.height - 12)
        }
        if rect.maxY + 12 + size.height <= visible.maxY {
            return NSPoint(x: x, y: rect.maxY + 12)
        }
        return NSPoint(x: x, y: visible.maxY - size.height - 12)
    }
}

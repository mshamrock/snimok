import AppKit
import Vision

/// What the user was looking at when the capture was taken. Mirrors the
/// metadata Gyazo records: application, window title and, for browsers, the
/// URL of the active tab.
struct CaptureContext {
    var appName: String?
    var bundleId: String?
    var windowTitle: String?
    var url: String?
    var capturedAt = Date()

    var formFields: [String: String] {
        var f: [String: String] = [:]
        if let appName { f["app"] = appName }
        if let windowTitle { f["source_title"] = windowTitle }
        if let url { f["referer_url"] = url }
        f["created_at"] = ISO8601DateFormatter().string(from: capturedAt)
        return f
    }

    /// The last app the user was in that is not Snimok. When Snimok shows a
    /// Dock icon, clicking it makes Snimok frontmost, so we remember the
    /// previous app instead.
    private static var lastOtherApp: NSRunningApplication?
    private static var observing = false

    static func startTracking() {
        guard !observing else { return }
        observing = true
        if let app = NSWorkspace.shared.frontmostApplication, app.bundleIdentifier != Bundle.main.bundleIdentifier {
            lastOtherApp = app
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier != Bundle.main.bundleIdentifier else { return }
            lastOtherApp = app
        }
    }

    /// Snapshot of the app the user is looking at. Taken *before* the
    /// crosshair appears.
    static func current() -> CaptureContext {
        var ctx = CaptureContext()
        var candidate = NSWorkspace.shared.frontmostApplication
        if candidate?.bundleIdentifier == Bundle.main.bundleIdentifier { candidate = lastOtherApp }
        guard let app = candidate, app.bundleIdentifier != Bundle.main.bundleIdentifier else { return ctx }
        ctx.appName = app.localizedName
        ctx.bundleId = app.bundleIdentifier
        ctx.windowTitle = frontWindowTitle(pid: app.processIdentifier)
        if let bundleId = app.bundleIdentifier {
            ctx.url = browserURL(bundleId: bundleId)
        }
        return ctx
    }

    /// Title of the app's frontmost window (needs Screen Recording, which we have).
    private static func frontWindowTitle(pid: pid_t) -> String? {
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] else { return nil }
        for info in list {
            guard (info[kCGWindowOwnerPID as String] as? pid_t) == pid,
                  (info[kCGWindowLayer as String] as? Int) == 0,
                  let name = info[kCGWindowName as String] as? String,
                  !name.isEmpty else { continue }
            return name
        }
        return nil
    }

    /// URL of the active tab for the common browsers (AppleScript; macOS asks
    /// once per browser for Automation permission).
    private static func browserURL(bundleId: String) -> String? {
        let script: String
        switch bundleId {
        case "com.apple.Safari", "com.apple.SafariTechnologyPreview":
            script = "tell application id \"\(bundleId)\" to get URL of current tab of front window"
        case "com.google.Chrome", "com.google.Chrome.canary", "com.brave.Browser", "com.microsoft.edgemac",
             "com.vivaldi.Vivaldi", "com.operasoftware.Opera", "company.thebrowser.Browser", "org.chromium.Chromium",
             "com.yandex.desktop.yandex-browser":
            script = "tell application id \"\(bundleId)\" to get URL of active tab of front window"
        default:
            return nil
        }
        var error: NSDictionary?
        let result = NSAppleScript(source: script)?.executeAndReturnError(&error)
        guard error == nil, let s = result?.stringValue, s.hasPrefix("http") else { return nil }
        return s
    }
}

/// On-device text recognition (Apple Vision) so captures are searchable by
/// their contents, like Gyazo's OCR.
enum OCR {
    static func recognize(imageAt url: URL, completion: @escaping (String?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let image = NSImage(contentsOf: url),
                  let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                DispatchQueue.main.async { completion(nil) }; return
            }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["ru-RU", "en-US"]
            let handler = VNImageRequestHandler(cgImage: cg, options: [:])
            do {
                try handler.perform([request])
                let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                let text = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                DispatchQueue.main.async { completion(text.isEmpty ? nil : text) }
            } catch {
                DispatchQueue.main.async { completion(nil) }
            }
        }
    }
}

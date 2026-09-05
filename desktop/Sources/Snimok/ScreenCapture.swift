import Foundation

/// Wraps the system `screencapture -i` tool: the cursor turns into a crosshair
/// and the user drags over the region to capture (Space toggles window mode,
/// Esc cancels). The result is written as PNG to a temporary file.
final class ScreenCapture {
    enum Mode {
        case area   // drag a rectangle (Space toggles to window mode)
        case window // start in window-picking mode, no shadow
    }

    private(set) var isRunning = false

    func selectArea(mode: Mode = .area, silent: Bool = false, completion: @escaping (URL?) -> Void) {
        guard !isRunning else { return }
        isRunning = true
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("snimok-\(UUID().uuidString).png")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        // -i interactive, -r no DPI metadata, -t png format,
        // -x suppresses the system shutter sound, -W start in window mode,
        // -o omit the window shadow
        var args = ["-i", "-r", "-t", "png"]
        if silent { args.append("-x") }
        if mode == .window { args += ["-W", "-o"] }
        process.arguments = args + [file.path]
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isRunning = false
                let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? 0
                completion(size > 0 ? file : nil)
            }
        }
        do {
            try process.run()
        } catch {
            isRunning = false
            completion(nil)
        }
    }
}

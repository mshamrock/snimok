import AVFoundation
import AppKit
import ImageIO
import UniformTypeIdentifiers

/// Records a screen region with the system recorder (`screencapture -v -i`):
/// the user draws the region and starts recording in the macOS toolbar, stops
/// with the stop button in the menu bar (or when the time limit is reached).
final class ScreenRecorder {
    private(set) var isRunning = false
    private var process: Process?

    func record(maxSeconds: Int, completion: @escaping (URL?) -> Void) {
        guard !isRunning else { return }
        isRunning = true
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("snimok-\(UUID().uuidString).mov")
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        // -v video, -i interactive, -J video: start in region-recording mode,
        // -U show the toolbar (Record / options), -x no system sounds,
        // -V hard limit in seconds
        p.arguments = ["-v", "-i", "-J", "video", "-U", "-x", "-V", "\(maxSeconds)", file.path]
        p.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isRunning = false
                self?.process = nil
                let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? 0
                completion(size > 0 ? file : nil)
            }
        }
        do {
            try p.run()
            process = p
        } catch {
            isRunning = false
            completion(nil)
        }
    }

    /// Ends a running recording early; screencapture finalises the file on SIGINT.
    func stop() {
        process?.interrupt()
    }
}

/// Turns the recorded movie into an animated GIF small enough for the upload
/// limit, lowering frame rate and size step by step if needed.
enum GIFEncoder {
    struct Preset {
        let fps: Int
        let maxWidth: CGFloat
    }

    static let presets = [
        Preset(fps: 10, maxWidth: 720),
        Preset(fps: 8, maxWidth: 600),
        Preset(fps: 6, maxWidth: 480),
        Preset(fps: 5, maxWidth: 400),
    ]

    static func convert(movie: URL, maxBytes: Int, completion: @escaping (URL?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let gif = movie.deletingPathExtension().appendingPathExtension("gif")
            var result: URL?
            for preset in presets {
                do {
                    try encode(movie: movie, to: gif, preset: preset)
                    let size = (try FileManager.default.attributesOfItem(atPath: gif.path)[.size] as? NSNumber)?.intValue ?? 0
                    NSLog("[Snimok] gif %d fps / %.0f px -> %d bytes", preset.fps, preset.maxWidth, size)
                    if size > 0 && size <= maxBytes {
                        result = gif
                        break
                    }
                } catch {
                    NSLog("[Snimok] gif encode failed: %@", "\(error)")
                }
            }
            if result == nil, FileManager.default.fileExists(atPath: gif.path) { result = gif } // best effort
            DispatchQueue.main.async { completion(result) }
        }
    }

    private static func fail(_ msg: String) -> NSError {
        NSError(domain: "Snimok.GIF", code: 1, userInfo: [NSLocalizedDescriptionKey: msg])
    }

    private static func encode(movie: URL, to gif: URL, preset: Preset) throws {
        let asset = AVURLAsset(url: movie)
        let seconds = CMTimeGetSeconds(asset.duration)
        guard seconds > 0, let track = asset.tracks(withMediaType: .video).first else {
            throw fail("recording has no video track")
        }
        let natural = track.naturalSize.applying(track.preferredTransform)
        let width = max(abs(natural.width), 1)
        let height = max(abs(natural.height), 1)
        let scale = min(1, preset.maxWidth / width)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 30)
        generator.maximumSize = CGSize(width: width * scale, height: height * scale)

        let frameCount = max(1, Int(seconds * Double(preset.fps)))
        try? FileManager.default.removeItem(at: gif)
        guard let destination = CGImageDestinationCreateWithURL(gif as CFURL, UTType.gif.identifier as CFString, frameCount, nil) else {
            throw fail("cannot create gif file")
        }
        let fileProperties: [CFString: Any] = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]]
        CGImageDestinationSetProperties(destination, fileProperties as CFDictionary)
        let delay = 1.0 / Double(preset.fps)
        let frameProperties: [CFString: Any] = [
            kCGImagePropertyGIFDictionary: [
                kCGImagePropertyGIFDelayTime: delay,
                kCGImagePropertyGIFUnclampedDelayTime: delay,
            ],
        ]
        for i in 0..<frameCount {
            let time = CMTime(seconds: Double(i) * delay, preferredTimescale: 600)
            let image = try generator.copyCGImage(at: time, actualTime: nil)
            CGImageDestinationAddImage(destination, image, frameProperties as CFDictionary)
        }
        guard CGImageDestinationFinalize(destination) else { throw fail("gif finalize failed") }
    }
}

import AppKit
import CoreImage
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

/// Records a screen region with ScreenCaptureKit straight into GIF frames.
/// Frames arrive only when the content changes, so each frame keeps its real
/// duration; the GIF is encoded at stop time and shrunk until it fits.
final class GifRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
    private(set) var isRecording = false
    private var stream: SCStream?
    private var frames: [(image: CGImage, time: Double)] = []
    private var firstTime: Double?
    private var lastTime: Double?
    private var startedAt: Date?
    private var maxSeconds: Double = 15
    private var timer: Timer?
    private var cancelled = false
    private var completion: ((URL?) -> Void)?
    private var onTick: ((Double) -> Void)?
    private let queue = DispatchQueue(label: "snimok.gif.frames")
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    var elapsed: Double { startedAt.map { Date().timeIntervalSince($0) } ?? 0 }

    /// `rect` in global Cocoa coordinates, on `screen`.
    func start(rect: CGRect, screen: NSScreen, maxSeconds: Double, fps: Int = 10, maxWidth: CGFloat = 720,
               onTick: @escaping (Double) -> Void, completion: @escaping (URL?) -> Void) {
        guard !isRecording else { return }
        isRecording = true
        cancelled = false
        frames = []
        firstTime = nil
        lastTime = nil
        self.maxSeconds = maxSeconds
        self.completion = completion
        self.onTick = onTick

        guard let displayID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID else {
            fail("no display id"); return
        }
        // Display space: points, origin top-left.
        let f = screen.frame
        let source = CGRect(x: rect.minX - f.minX, y: f.maxY - rect.maxY, width: rect.width, height: rect.height)
        let scale = screen.backingScaleFactor
        let outScale = min(1, maxWidth / max(rect.width * scale, 1))
        let outW = max(2, Int(rect.width * scale * outScale)) & ~1
        let outH = max(2, Int(rect.height * scale * outScale)) & ~1

        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self else { return }
            guard let content, let display = content.displays.first(where: { $0.displayID == displayID }) else {
                self.fail("display not available: \(error?.localizedDescription ?? "")"); return
            }
            // Keep our own windows (the recording panel) out of the recording.
            let ours = content.windows.filter { $0.owningApplication?.bundleIdentifier == Bundle.main.bundleIdentifier }
            let filter = SCContentFilter(display: display, excludingWindows: ours)
            let cfg = SCStreamConfiguration()
            cfg.sourceRect = source
            cfg.width = outW
            cfg.height = outH
            cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
            cfg.showsCursor = true
            cfg.pixelFormat = kCVPixelFormatType_32BGRA
            cfg.queueDepth = 6
            let stream = SCStream(filter: filter, configuration: cfg, delegate: self)
            do {
                try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: self.queue)
            } catch {
                self.fail("stream output: \(error.localizedDescription)"); return
            }
            self.stream = stream
            stream.startCapture { [weak self] error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if let error { self.fail("start: \(error.localizedDescription)"); return }
                    self.startedAt = Date()
                    self.timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                        guard let self else { return }
                        self.onTick?(self.elapsed)
                        if self.elapsed >= self.maxSeconds { self.stop() }
                    }
                }
            }
        }
    }

    /// Stops and encodes; the completion receives the GIF (or nil when cancelled / failed).
    func stop() {
        guard isRecording, let stream else { return }
        isRecording = false
        timer?.invalidate()
        timer = nil
        stream.stopCapture { [weak self] _ in
            guard let self else { return }
            self.stream = nil
            self.queue.async {
                let frames = self.frames
                let last = self.lastTime
                self.frames = []
                if self.cancelled || frames.isEmpty {
                    DispatchQueue.main.async { self.finish(nil) }
                    return
                }
                let url = GIFEncoder.encode(frames: frames, endTime: last ?? frames.last!.time + 0.1, maxBytes: 4_000_000)
                DispatchQueue.main.async { self.finish(url) }
            }
        }
    }

    func cancel() {
        cancelled = true
        stop()
    }

    private func fail(_ message: String) {
        NSLog("[Snimok] gif recorder: %@", message)
        isRecording = false
        finish(nil)
    }

    private func finish(_ url: URL?) {
        startedAt = nil
        let cb = completion
        completion = nil
        onTick = nil
        cb?(url)
    }

    // MARK: SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid else { return }
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let time = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        let ci = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cg = ciContext.createCGImage(ci, from: ci.extent) else { return }
        if firstTime == nil { firstTime = time }
        frames.append((cg, time - (firstTime ?? time)))
        lastTime = time - (firstTime ?? time)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        NSLog("[Snimok] gif stream stopped: %@", error.localizedDescription)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isRecording else { return }
            self.stop()
        }
    }
}

enum GIFEncoder {
    /// Encodes frames with their real durations; shrinks / drops frames until the file fits.
    static func encode(frames: [(image: CGImage, time: Double)], endTime: Double, maxBytes: Int) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("snimok-\(UUID().uuidString).gif")
        let attempts: [(scale: CGFloat, stride: Int)] = [(1, 1), (0.8, 1), (0.8, 2), (0.6, 2), (0.5, 3), (0.4, 4)]
        for a in attempts {
            do {
                try write(frames: frames, endTime: endTime, to: url, scale: a.scale, stride: a.stride)
                let size = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
                NSLog("[Snimok] gif scale %.1f stride %d -> %d bytes (%d frames)", a.scale, a.stride, size, frames.count / a.stride)
                if size > 0 && size <= maxBytes { return url }
            } catch {
                NSLog("[Snimok] gif write failed: %@", "\(error)")
            }
        }
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static func write(frames: [(image: CGImage, time: Double)], endTime: Double, to url: URL, scale: CGFloat, stride: Int) throws {
        let picked = Swift.stride(from: 0, to: frames.count, by: stride).map { frames[$0] }
        guard !picked.isEmpty else { throw NSError(domain: "Snimok.GIF", code: 1) }
        try? FileManager.default.removeItem(at: url)
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.gif.identifier as CFString, picked.count, nil) else {
            throw NSError(domain: "Snimok.GIF", code: 2)
        }
        CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
        for (i, frame) in picked.enumerated() {
            let next = i + 1 < picked.count ? picked[i + 1].time : max(endTime, frame.time + 0.1)
            // GIF delays are hundredths of a second; keep every frame visible for at least 20 ms.
            let delay = min(10, max(0.02, next - frame.time))
            let image = scale < 1 ? resized(frame.image, by: scale) : frame.image
            let props: [CFString: Any] = [kCGImagePropertyGIFDictionary: [
                kCGImagePropertyGIFDelayTime: delay,
                kCGImagePropertyGIFUnclampedDelayTime: delay,
            ]]
            CGImageDestinationAddImage(dest, image, props as CFDictionary)
        }
        guard CGImageDestinationFinalize(dest) else { throw NSError(domain: "Snimok.GIF", code: 3) }
    }

    private static func resized(_ image: CGImage, by scale: CGFloat) -> CGImage {
        let w = max(1, Int(CGFloat(image.width) * scale))
        let h = max(1, Int(CGFloat(image.height) * scale))
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return image }
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage() ?? image
    }
}

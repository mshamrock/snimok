import Foundation

/// Persistent app settings. The server URL is baked into Info.plist at build
/// time (see build.sh) but can be overridden from the menu.
enum Settings {
    private static let defaults = UserDefaults.standard
    private static let serverKey = "serverURL"
    private static let tokenKey = "apiToken"
    private static let deviceKey = "deviceId"

    static var defaultServerURL: URL {
        if let s = Bundle.main.object(forInfoDictionaryKey: "SnimokServerURL") as? String,
           !s.isEmpty, !s.hasPrefix("__"), let u = URL(string: s) {
            return u
        }
        return URL(string: "http://localhost:3000")!
    }

    static var serverURL: URL {
        get {
            if let s = defaults.string(forKey: serverKey), let u = URL(string: s) { return u }
            return defaultServerURL
        }
        set { defaults.set(newValue.absoluteString, forKey: serverKey) }
    }

    /// Stable anonymous identity of this install. Anonymous uploads belong to
    /// it until the user signs in, which links them to the account.
    static var deviceId: String {
        if let id = defaults.string(forKey: deviceKey), !id.isEmpty { return id }
        let id = UUID().uuidString.lowercased()
        defaults.set(id, forKey: deviceKey)
        return id
    }

    static var shortcutId: String {
        get { defaults.string(forKey: "shortcut") ?? Shortcut.defaultArea.id }
        set { defaults.set(newValue, forKey: "shortcut") }
    }

    /// Play the system shutter sound when a capture is taken (default on).
    static var shutterSound: Bool {
        get { defaults.object(forKey: "shutterSound") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "shutterSound") }
    }

    /// Stamp "snimok.xyz" into the bottom-left corner of every capture (default off).
    /// For an install linked to an account this mirrors the account setting on
    /// snimok.xyz (last known value, refreshed before each capture); otherwise
    /// it is the app's own menu toggle.
    static var watermark: Bool {
        get { defaults.object(forKey: "watermark") as? Bool ?? false }
        set { defaults.set(newValue, forKey: "watermark") }
    }

    /// Watermark size as a fraction of the automatic size (account setting, 0.25–2).
    static var watermarkScale: Double {
        get {
            let v = defaults.object(forKey: "watermarkScale") as? Double ?? 1
            return min(2, max(0.25, v))
        }
        set { defaults.set(min(2, max(0.25, newValue)), forKey: "watermarkScale") }
    }

    /// Keep an icon in the Dock while running (its context menu mirrors the
    /// menu-bar menu; useful when the menu bar is full and hides our item).
    static var showInDock: Bool {
        get { defaults.object(forKey: "showInDock") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "showInDock") }
    }

    static var apiToken: String? {
        get { defaults.string(forKey: tokenKey) }
        set {
            if let v = newValue { defaults.set(v, forKey: tokenKey) }
            else { defaults.removeObject(forKey: tokenKey) }
        }
    }
}

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

    static var apiToken: String? {
        get { defaults.string(forKey: tokenKey) }
        set {
            if let v = newValue { defaults.set(v, forKey: tokenKey) }
            else { defaults.removeObject(forKey: tokenKey) }
        }
    }
}

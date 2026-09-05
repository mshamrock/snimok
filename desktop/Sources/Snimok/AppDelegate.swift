import AppKit
import Carbon

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private let capture = ScreenCapture()
    private let api = API()
    private var connecting = false

    private var captureItem: NSMenuItem!
    private var windowItem: NSMenuItem!
    private var accountItem: NSMenuItem!
    private var statusLine: NSMenuItem!
    private var soundItem: NSMenuItem!
    private var dockItem: NSMenuItem!
    private var shortcutMenu: NSMenu!
    private var shortcutOK = true

    // MARK: Lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        CaptureContext.startTracking()
        applyActivationPolicy()
        setupStatusItem()
        applyShortcut(Shortcut.byId(Settings.shortcutId) ?? Shortcut.defaultArea)
        // Gyazo behaviour: launching the app *is* the capture gesture.
        // `--no-capture` (e.g. for a login item) just puts the icon in the menu bar.
        if !CommandLine.arguments.contains("--no-capture") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.captureArea()
            }
        }
    }

    /// Clicking the app icon while it is already running triggers a new capture.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        captureArea()
        return false
    }

    /// Right-click menu on the Dock icon: same actions as the menu-bar menu.
    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        func add(_ title: String, _ action: Selector, state: NSControl.StateValue = .off) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            item.state = state
            menu.addItem(item)
        }
        add("Capture Area", #selector(captureAreaAction))
        add("Capture Window", #selector(captureWindowAction))
        add("My Captures", #selector(openCaptures))
        menu.addItem(.separator())
        add(Settings.apiToken != nil ? "Sign Out" : "Sign In…", #selector(accountAction))
        add("Shutter Sound", #selector(toggleSound), state: Settings.shutterSound ? .on : .off)
        add("Show in Dock", #selector(toggleDock), state: Settings.showInDock ? .on : .off)
        add("Server URL…", #selector(changeServer))
        return menu
    }

    private func applyActivationPolicy() {
        NSApp.setActivationPolicy(Settings.showInDock ? .regular : .accessory)
    }

    @objc private func toggleDock() {
        Settings.showInDock.toggle()
        applyActivationPolicy()
    }

    // MARK: Status bar

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.autosaveName = "SnimokStatusItem"
        statusItem.isVisible = true
        if let button = statusItem.button {
            let img = NSImage(systemSymbolName: "camera.viewfinder", accessibilityDescription: "Snimok")
            img?.isTemplate = true
            button.image = img
            button.toolTip = "Snimok – click to capture"
        }

        let menu = NSMenu()
        menu.delegate = self

        captureItem = NSMenuItem(title: "Capture Area", action: #selector(captureAreaAction), keyEquivalent: "")
        captureItem.target = self
        menu.addItem(captureItem)

        windowItem = NSMenuItem(title: "Capture Window", action: #selector(captureWindowAction), keyEquivalent: "")
        windowItem.target = self
        menu.addItem(windowItem)

        let shortcutItem = NSMenuItem(title: "Shortcut", action: nil, keyEquivalent: "")
        shortcutMenu = NSMenu(title: "Shortcut")
        for sc in Shortcut.all {
            let item = NSMenuItem(title: sc.title, action: #selector(pickShortcut(_:)), keyEquivalent: "")
            item.representedObject = sc.id
            item.target = self
            shortcutMenu.addItem(item)
        }
        shortcutItem.submenu = shortcutMenu
        menu.addItem(shortcutItem)

        let open = NSMenuItem(title: "My Captures", action: #selector(openCaptures), keyEquivalent: "")
        open.target = self
        menu.addItem(open)

        menu.addItem(.separator())

        statusLine = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        statusLine.isEnabled = false
        menu.addItem(statusLine)

        accountItem = NSMenuItem(title: "Sign In…", action: #selector(accountAction), keyEquivalent: "")
        accountItem.target = self
        menu.addItem(accountItem)

        soundItem = NSMenuItem(title: "Shutter Sound", action: #selector(toggleSound), keyEquivalent: "")
        soundItem.target = self
        menu.addItem(soundItem)

        dockItem = NSMenuItem(title: "Show in Dock", action: #selector(toggleDock), keyEquivalent: "")
        dockItem.target = self
        menu.addItem(dockItem)

        let server = NSMenuItem(title: "Server URL…", action: #selector(changeServer), keyEquivalent: "")
        server.target = self
        menu.addItem(server)

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Snimok", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)

        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        let signedIn = Settings.apiToken != nil
        accountItem.title = signedIn ? "Sign Out" : "Sign In…"
        let host = Settings.serverURL.host ?? ""
        var status = signedIn ? "Signed in · \(host)" : "Not signed in · \(host)"
        if !shortcutOK { status += " · shortcut unavailable" }
        statusLine.title = status
        captureItem.isEnabled = !capture.isRunning
        soundItem.state = Settings.shutterSound ? .on : .off
        dockItem.state = Settings.showInDock ? .on : .off
        windowItem.isEnabled = !capture.isRunning
        let current = Settings.shortcutId
        for item in shortcutMenu.items {
            item.state = (item.representedObject as? String) == current ? .on : .off
        }
    }

    /// Registers the global shortcuts for the chosen combination (area) and its window variant.
    private func applyShortcut(_ sc: Shortcut) {
        HotKeys.shared.unregisterAll()
        var ok = HotKeys.shared.register(keyCode: sc.keyCode, modifiers: sc.carbonModifiers) { [weak self] in
            self?.captureArea()
        }
        captureItem.keyEquivalent = sc.keyEquivalent
        captureItem.keyEquivalentModifierMask = sc.nsModifiers
        if let w = sc.windowVariant {
            ok = HotKeys.shared.register(keyCode: w.keyCode, modifiers: w.carbonModifiers) { [weak self] in
                self?.captureWindow()
            } && ok
            windowItem.keyEquivalent = w.keyEquivalent
            windowItem.keyEquivalentModifierMask = w.nsModifiers
        } else {
            windowItem.keyEquivalent = ""
        }
        shortcutOK = ok
        NSLog("[Snimok] shortcut %@ registered: %@", sc.title, ok ? "yes" : "NO")
    }

    @objc private func pickShortcut(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String, let sc = Shortcut.byId(id) else { return }
        Settings.shortcutId = id
        applyShortcut(sc)
    }

    // MARK: Actions

    @objc private func captureAreaAction() { captureArea() }
    @objc private func captureWindowAction() { captureWindow() }

    func captureArea() { startCapture(mode: .area) }
    func captureWindow() { startCapture(mode: .window) }

    private func startCapture(mode: ScreenCapture.Mode) {
        guard !capture.isRunning else { return }
        // Record what the user is looking at before the crosshair takes over.
        let context = CaptureContext.current()
        capture.selectArea(mode: mode, silent: true) { [weak self] file in
            guard let self, let file else { return }
            if Settings.shutterSound { Shutter.play() }
            var fields = context.formFields
            // Recognise text on-device so the capture is searchable, then upload.
            OCR.recognize(imageAt: file) { text in
                if let text { fields["ocr"] = text }
                self.upload(file, token: Settings.apiToken, fields: fields)
            }
        }
    }

    @objc private func openCaptures() {
        NSWorkspace.shared.open(api.claimURL(next: "/captures"))
    }

    @objc private func accountAction() {
        if Settings.apiToken != nil {
            Settings.apiToken = nil
        } else {
            signIn()
        }
    }

    @objc private func toggleSound() {
        Settings.shutterSound.toggle()
    }

    @objc private func changeServer() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Snimok server URL"
        alert.informativeText = "Address of your Snimok web app (the Vercel deployment). Changing it signs you out."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = Settings.serverURL.absoluteString
        alert.accessoryView = field
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        var text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.hasPrefix("http") { text = "https://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), url.host != nil else {
            showError("That doesn't look like a valid URL.")
            return
        }
        if url != Settings.serverURL {
            Settings.serverURL = url
            Settings.apiToken = nil
        }
    }

    // MARK: Upload

    /// Uploads with the account token when signed in, anonymously (device id) otherwise.
    private func upload(_ file: URL, token: String?, fields: [String: String] = [:]) {
        api.upload(file: file, token: token, fields: fields) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let r):
                try? FileManager.default.removeItem(at: file)
                let pb = NSPasteboard.general
                pb.clearContents()
                pb.setString(r.permalink_url, forType: .string)
                // Go through /claim so this browser is tied to the device and can
                // edit the capture (and adopt it if the user later signs in).
                NSWorkspace.shared.open(self.api.claimURL(next: "/i/\(r.id)"))
            case .failure(.unauthorized) where token != nil:
                // Token revoked on the server: forget it and fall back to anonymous.
                Settings.apiToken = nil
                self.upload(file, token: nil, fields: fields)
            case .failure(let e):
                self.showError("Upload failed. \(e.localizedDescription)\n\nThe screenshot is kept at:\n\(file.path)")
            }
        }
    }

    // MARK: Optional sign-in (device-code flow)

    private func signIn() {
        guard !connecting else { return }
        connecting = true
        api.requestDeviceCode { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let e):
                self.connecting = false
                self.showError("Could not reach \(Settings.serverURL.absoluteString).\n\(e.localizedDescription)")
            case .success(let dc):
                if let url = URL(string: dc.verify_url) { NSWorkspace.shared.open(url) }
                let deadline = Date().addingTimeInterval(dc.expires_in)
                self.pollForToken(code: dc.code, interval: max(1, dc.interval), deadline: deadline)
            }
        }
    }

    private func pollForToken(code: String, interval: Double, deadline: Date) {
        guard Date() < deadline else {
            connecting = false
            return
        }
        api.poll(code: code) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(.pending), .failure:
                DispatchQueue.main.asyncAfter(deadline: .now() + interval) {
                    self.pollForToken(code: code, interval: interval, deadline: deadline)
                }
            case .success(.ok(let token)):
                self.connecting = false
                Settings.apiToken = token
            case .success(.expired):
                self.connecting = false
            }
        }
    }

    // MARK: Helpers

    private func showError(_ message: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Snimok"
        alert.informativeText = message
        alert.runModal()
    }
}

/// The classic macOS shutter click, played once per capture.
enum Shutter {
    private static let sound: NSSound? = {
        let candidates = [
            "/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/Grab.aif",
            "/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/Shutter.aif",
        ]
        for path in candidates {
            if FileManager.default.fileExists(atPath: path), let s = NSSound(contentsOfFile: path, byReference: true) {
                return s
            }
        }
        return NSSound(named: "Pop")
    }()

    static func play() {
        sound?.stop()
        sound?.play()
    }
}

import AppKit
import Carbon

/// A global shortcut choice. Key codes are layout-independent (Carbon virtual keys).
struct Shortcut: Equatable {
    let id: String          // stored in UserDefaults
    let title: String       // menu label, e.g. "⌘⇧7"
    let keyCode: UInt32
    let carbonModifiers: UInt32
    let keyEquivalent: String
    let nsModifiers: NSEvent.ModifierFlags

    static let all: [Shortcut] = [
        Shortcut(id: "cmd-shift-7", title: "⌘⇧7", keyCode: UInt32(kVK_ANSI_7), carbonModifiers: UInt32(cmdKey | shiftKey), keyEquivalent: "7", nsModifiers: [.command, .shift]),
        Shortcut(id: "cmd-shift-9", title: "⌘⇧9", keyCode: UInt32(kVK_ANSI_9), carbonModifiers: UInt32(cmdKey | shiftKey), keyEquivalent: "9", nsModifiers: [.command, .shift]),
        Shortcut(id: "ctrl-shift-s", title: "⌃⇧S", keyCode: UInt32(kVK_ANSI_S), carbonModifiers: UInt32(controlKey | shiftKey), keyEquivalent: "s", nsModifiers: [.control, .shift]),
        Shortcut(id: "ctrl-alt-s", title: "⌃⌥S", keyCode: UInt32(kVK_ANSI_S), carbonModifiers: UInt32(controlKey | optionKey), keyEquivalent: "s", nsModifiers: [.control, .option]),
        Shortcut(id: "alt-space", title: "⌥Space", keyCode: UInt32(kVK_Space), carbonModifiers: UInt32(optionKey), keyEquivalent: " ", nsModifiers: [.option]),
        Shortcut(id: "f13", title: "F13", keyCode: UInt32(kVK_F13), carbonModifiers: 0, keyEquivalent: "", nsModifiers: []),
    ]

    static let defaultArea = all[0]

    static func byId(_ id: String?) -> Shortcut? { all.first { $0.id == id } }

    /// Window capture uses the same modifiers with the next digit / letter when it exists.
    var windowVariant: Shortcut? {
        switch id {
        case "cmd-shift-7": return Shortcut(id: "cmd-shift-8", title: "⌘⇧8", keyCode: UInt32(kVK_ANSI_8), carbonModifiers: carbonModifiers, keyEquivalent: "8", nsModifiers: nsModifiers)
        case "cmd-shift-9": return Shortcut(id: "cmd-shift-0", title: "⌘⇧0", keyCode: UInt32(kVK_ANSI_0), carbonModifiers: carbonModifiers, keyEquivalent: "0", nsModifiers: nsModifiers)
        case "ctrl-shift-s": return Shortcut(id: "ctrl-shift-w", title: "⌃⇧W", keyCode: UInt32(kVK_ANSI_W), carbonModifiers: carbonModifiers, keyEquivalent: "w", nsModifiers: nsModifiers)
        case "ctrl-alt-s": return Shortcut(id: "ctrl-alt-w", title: "⌃⌥W", keyCode: UInt32(kVK_ANSI_W), carbonModifiers: carbonModifiers, keyEquivalent: "w", nsModifiers: nsModifiers)
        case "alt-space": return nil
        case "f13": return Shortcut(id: "f14", title: "F14", keyCode: UInt32(kVK_F14), carbonModifiers: 0, keyEquivalent: "", nsModifiers: [])
        default: return nil
        }
    }
}

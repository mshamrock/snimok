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

    private func variant(_ id: String, _ title: String, _ keyCode: Int, _ keyEquivalent: String) -> Shortcut {
        Shortcut(id: id, title: title, keyCode: UInt32(keyCode), carbonModifiers: carbonModifiers, keyEquivalent: keyEquivalent, nsModifiers: nsModifiers)
    }

    /// GIF recording: same modifiers, next key (Gyazo uses ⌘⇧7 / ⌘⇧8 the same way).
    var gifVariant: Shortcut? {
        switch id {
        case "cmd-shift-7": return variant("cmd-shift-8", "⌘⇧8", kVK_ANSI_8, "8")
        case "cmd-shift-9": return variant("cmd-shift-0", "⌘⇧0", kVK_ANSI_0, "0")
        case "ctrl-shift-s": return variant("ctrl-shift-g", "⌃⇧G", kVK_ANSI_G, "g")
        case "ctrl-alt-s": return variant("ctrl-alt-g", "⌃⌥G", kVK_ANSI_G, "g")
        case "f13": return Shortcut(id: "f14", title: "F14", keyCode: UInt32(kVK_F14), carbonModifiers: 0, keyEquivalent: "", nsModifiers: [])
        default: return nil
        }
    }

    /// Window capture: one more key along.
    var windowVariant: Shortcut? {
        switch id {
        case "cmd-shift-7": return variant("cmd-shift-9", "⌘⇧9", kVK_ANSI_9, "9")
        case "ctrl-shift-s": return variant("ctrl-shift-w", "⌃⇧W", kVK_ANSI_W, "w")
        case "ctrl-alt-s": return variant("ctrl-alt-w", "⌃⌥W", kVK_ANSI_W, "w")
        case "f13": return Shortcut(id: "f15", title: "F15", keyCode: UInt32(kVK_F15), carbonModifiers: 0, keyEquivalent: "", nsModifiers: [])
        default: return nil
        }
    }
}

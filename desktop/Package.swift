// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Snimok",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Snimok",
            path: "Sources/Snimok",
            swiftSettings: [.unsafeFlags(["-swift-version", "5"])]
        )
    ]
)

// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "MacOSAppManagement",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .executable(name: "MacOSAppInventory", targets: ["MacOSAppInventory"]),
        .library(
            name: "MacOSAppRuntimeCore",
            targets: ["MacOSAppRuntimeCore"]
        ),
        .executable(
            name: "MacOSAppRuntimeAgent",
            targets: ["MacOSAppRuntimeAgent"]
        ),
    ],
    targets: [
        .executableTarget(name: "MacOSAppInventory", dependencies: ["MacOSAppRuntimeCore"]),
        .target(
            name: "MacOSAppRuntimeCore"
        ),
        .executableTarget(
            name: "MacOSAppRuntimeAgent",
            dependencies: ["MacOSAppRuntimeCore"]
        ),
        .testTarget(
            name: "MacOSAppRuntimeCoreTests",
            dependencies: ["MacOSAppRuntimeCore"]
        ),
    ]
)

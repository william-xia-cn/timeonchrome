// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "MacOSAppManagement",
    platforms: [
        .macOS(.v13),
    ],
    products: [
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

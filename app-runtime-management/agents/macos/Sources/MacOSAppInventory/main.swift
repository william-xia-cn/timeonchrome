import Foundation
import MacOSAppRuntimeCore

#if os(macOS)
guard Array(CommandLine.arguments.dropFirst()) == ["--scan-only"] else {
    FileHandle.standardError.write(Data("显式本地只读验证：MacOSAppInventory --scan-only；不上传、不注册后台启动。\n".utf8))
    exit(2)
}
let inventory = MacOSApplicationDiscovery.scan()
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(inventory))
#else
exit(2)
#endif

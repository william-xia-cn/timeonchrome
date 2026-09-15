import Foundation
#if os(macOS)
import Security
import CryptoKit

public struct VerifiedBundleSignature { public let teamIdentifier: String }
public struct MacOSApplicationInventory: Codable {
    public let applications: [AppEvidence]
    public let failedSources: [String]
}

/// 显式只读扫描常规 Applications。无注册、持久化、上传或使用落账副作用。
public enum MacOSApplicationDiscovery {
    public static var standardRoots: [URL] {
        [URL(fileURLWithPath: "/Applications", isDirectory: true),
         URL(fileURLWithPath: "/System/Applications", isDirectory: true),
         FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications", isDirectory: true)]
    }
    public static func scan(roots: [URL] = standardRoots,
                            verify: (URL) -> VerifiedBundleSignature? = verifiedSignature) -> MacOSApplicationInventory {
        let manager = FileManager.default
        var applications: [AppEvidence] = [], failures: [String] = []
        for (index, root) in roots.enumerated() {
            guard manager.fileExists(atPath: root.path) else { continue }
            do {
                var candidates = try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
                // Only conventional utility subdirectories, never a whole-volume recursive scan.
                for folder in candidates where folder.lastPathComponent == "Utilities" {
                    candidates += (try? manager.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
                }
                for candidate in candidates where candidate.pathExtension.lowercased() == "app" {
                    let bundleURL = candidate.resolvingSymlinksInPath()
                    guard bundleURL.path.hasPrefix(root.resolvingSymlinksInPath().path + "/") else { continue }
                    if let evidence = observe(bundleURL, verify: verify) { applications.append(evidence) }
                    else { failures.append("bundle-metadata-unavailable") }
                }
            } catch { failures.append("applications-source-\(index)-unavailable") }
        }
        var unique: [String: AppEvidence] = [:]
        for application in applications { unique[application.runtimeIdentity] = application }
        return MacOSApplicationInventory(applications: unique.values.sorted { $0.runtimeIdentity < $1.runtimeIdentity },
                                         failedSources: Array(Set(failures)).sorted())
    }
    private static func hash(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }
    private static func observe(_ url: URL, verify: (URL) -> VerifiedBundleSignature?) -> AppEvidence? {
        guard let bundle = Bundle(url: url), let bundleID = bundle.bundleIdentifier else { return nil }
        let name = bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
            ?? bundle.object(forInfoDictionaryKey: "CFBundleName") as? String ?? url.deletingPathExtension().lastPathComponent
        var values: [String: String] = ["productName": name], verified: [String] = []
        let initialSignature = verify(url)
        if let executable = bundle.executableURL?.resolvingSymlinksInPath(), executable.path.hasPrefix(url.path + "/"),
           let stream = try? FileHandle(forReadingFrom: executable) {
            defer { try? stream.close() }
            do {
                var digest = SHA256()
                while let chunk = try stream.read(upToCount: 1024 * 1024), !chunk.isEmpty { digest.update(data: chunk) }
                values["binaryHash"] = digest.finalize().map { String(format: "%02x", $0) }.joined()
                verified.append("binaryHash")
            } catch { /* Failure cannot establish an identity or infer an uninstall. */ }
        }
        // Verify after hashing as well; signature metadata alone is not identity proof.
        if let signature = initialSignature, let confirmed = verify(url), signature.teamIdentifier == confirmed.teamIdentifier {
            values["packageId"] = "macos:package:" + hash(signature.teamIdentifier + ":" + bundleID)
            values["signerKey"] = hash("apple-team:" + signature.teamIdentifier)
            verified += ["packageId", "signerKey"]
        }
        let source = values["packageId"] ?? values["binaryHash"] ?? "candidate:" + bundleID
        return AppEvidence(platform: "macos", runtimeIdentity: "macos:" + hash(source), displayName: name,
                           values: values, verifiedFields: verified)
    }
    public static func verifiedSignature(_ url: URL) -> VerifiedBundleSignature? {
        var code: SecStaticCode?, requirement: SecRequirement?
        guard SecStaticCodeCreateWithPath(url as CFURL, SecCSFlags(rawValue: 0), &code) == errSecSuccess,
              let code = code,
              SecRequirementCreateWithString("anchor apple generic" as CFString, SecCSFlags(rawValue: 0), &requirement) == errSecSuccess,
              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSCheckAllArchitectures), requirement) == errSecSuccess else { return nil }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let dictionary = info as? [String: Any],
              let team = dictionary[kSecCodeInfoTeamIdentifier as String] as? String, !team.isEmpty else { return nil }
        return VerifiedBundleSignature(teamIdentifier: team)
    }
}
#endif

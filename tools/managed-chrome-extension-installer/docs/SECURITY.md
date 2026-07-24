# Security Model

This module treats `managedDeviceToken` as a device credential.

Rules:

- Do not commit `private-config.plist`.
- Do not print token values in logs, documentation, screenshots, or chat.
- Store real config only on the deployment machine or in an approved private secret store.
- Use `private-config.example.plist` for Git and examples.
- The installer validates token shape but does not disclose the token.
- The keeper restores policy files and MCX state; it is not intended to bypass an administrator or organization that has denied this local policy mechanism.

The `managedProfileEmail` field is an identity anchor for the extension runtime. It does not prevent Chrome from installing the extension into other profiles; the extension must enforce inactive behavior when the current Chrome profile email does not match.

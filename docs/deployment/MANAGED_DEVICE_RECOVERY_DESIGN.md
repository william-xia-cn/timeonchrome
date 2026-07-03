# Managed Device Recovery Design

## 1. Scope

This document is Task E for the managed internal channel.

It designs a future recovery flow:

```text
tenantId + devicePolicyId -> profileId/deviceId
```

No Worker, D1, extension, or Pages code is implemented in this task.

## 2. Problem

The current public-channel recovery uses Chrome profile identity as a weak signal. That helps for user-installed Chrome profiles, but managed internal deployments can provide a stronger admin-controlled anchor:

```text
tenantId
devicePolicyId
```

This anchor should allow a force-installed extension to recover the intended cloud device binding after local extension data is cleared or the extension is reinstalled.

## 3. Principles

- Managed policy can identify the deployment slot, not authenticate a user.
- Managed policy must not contain `device_token`.
- Managed policy must not contain account token, refresh token, password, or raw Chrome identity.
- Recovery must be authorized by the server.
- A failed recovery must not silently create duplicate child devices.
- Explicit cloud unbind remains final and blocks recovery.
- Website rules, quota, and time windows continue to come from cloud config.

## 4. Managed Policy Inputs

Expected managed storage:

```json
{
  "enabled": true,
  "deploymentMode": "managed",
  "tenantId": "internal-family-001",
  "devicePolicyId": "macbook-child-001",
  "cloudEndpoint": "https://guardian-api.william-xia-cn.workers.dev",
  "allowIdentityRecovery": true
}
```

Only these fields are considered for managed recovery:

- `tenantId`
- `devicePolicyId`
- `deploymentMode`
- `enabled`
- `cloudEndpoint`

`allowIdentityRecovery` is for the existing Chrome identity recovery path and is not a server identity.

## 5. Server Mapping

Future D1 mapping table shape:

```text
managed_device_bindings_v1
  id
  tenant_id
  device_policy_id
  profile_id
  device_id
  status
  created_at
  updated_at
  unbound_at
  last_recovered_at
```

Unique constraint:

```text
tenant_id + device_policy_id
```

The mapping points to one intended cloud device record.

## 6. Recovery State Machine

```text
no_local_token
  -> read managed policy
  -> POST /device/managed-recover/bootstrap
  -> recovered | pending_cloud_confirmation | no_mapping | unbound | failed
```

States:

- `recovered`: server returns a new device token for the mapped device.
- `pending_cloud_confirmation`: mapping exists but server detects conflict or policy mismatch.
- `no_mapping`: no cloud mapping exists for `tenantId + devicePolicyId`.
- `unbound`: mapped device was explicitly unbound and cannot recover.
- `failed`: schema, payload, or server error.

## 7. API Shape

Future endpoint:

```http
POST /device/managed-recover/bootstrap
Content-Type: application/json
```

Request:

```json
{
  "tenantId": "internal-family-001",
  "devicePolicyId": "macbook-child-001",
  "platform": "macos",
  "browser": "Chrome",
  "extensionVersion": "1.7.8"
}
```

Success:

```json
{
  "status": "RECOVERED",
  "deviceId": "...",
  "profileId": "...",
  "profileName": "...",
  "deviceToken": "..."
}
```

No mapping:

```json
{
  "status": "NO_MAPPING",
  "message": "No managed device binding exists for this tenant/device policy id."
}
```

Unbound:

```json
{
  "status": "DEVICE_UNBOUND",
  "message": "This managed device was explicitly unbound in the cloud console."
}
```

## 8. Security Constraints

The server must:

- validate `tenantId` and `devicePolicyId` against an owned profile/device mapping;
- never trust managed policy as proof of account ownership;
- never accept a client-provided `profileId` or `deviceId` as authority;
- issue a fresh device token only after mapping validation;
- record recovery in device access audit;
- rate-limit recovery attempts;
- avoid logging tokens or raw sensitive payload.

The client must:

- not create a new device automatically when managed recovery fails;
- keep retrying recoverable failures;
- show local status in Admin;
- keep existing explicit unbound behavior.

## 9. Conflict Handling

Pending confirmation is required when:

- multiple active mappings exist unexpectedly;
- the mapped profile is deleted or inaccessible;
- the mapped device is unbound;
- the server sees platform/browser mismatch that should be reviewed;
- the request comes from a tenant/devicePolicyId pair marked suspended.

The cloud console should expose:

- restore to mapped device;
- ignore;
- mark as new device only when explicitly chosen by the parent/admin.

## 10. Relationship To Existing Recovery

Priority order:

```text
1. Existing local device_token
2. Managed policy recovery: tenantId + devicePolicyId
3. Chrome identity weak recovery, if allowed
4. Cloud confirmation / manual bind
```

Managed policy recovery should not remove the existing Chrome identity path. It provides a stronger path for controlled internal deployments.

## 11. Test Plan For Future Implementation

Worker:

- unique `tenantId + devicePolicyId` mapping returns `RECOVERED`;
- unbound mapping returns `DEVICE_UNBOUND`;
- no mapping returns `NO_MAPPING`;
- client-provided profile/device ids are ignored;
- recovery writes device access audit;
- token is never logged.

Extension:

- no local token plus managed mapping recovers device token;
- failed managed recovery does not create duplicate device;
- explicit unbound stops retrying the mapped device;
- Chrome identity fallback only runs when managed recovery cannot recover and policy allows it.

Pages:

- managed mapping visible in device details;
- managed recovery history visible;
- parent/admin can resolve conflicts.

## 12. Open Questions

- Whether `tenantId` should be globally unique or account-scoped.
- Whether `devicePolicyId` should be human-readable or random.
- Whether managed mapping creation belongs in cloud console or a separate admin import file.
- Whether update host and Worker endpoint should share a tenant namespace.

/** Current browser source key: preserve the authenticated account/device byte derivation. */
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');

/** Only call with server-authenticated owner/device identity, never a request-selected device. */
export const sharedWebSourceKey = async(accountId:string,deviceId:string) => `web:${await sha(`${accountId}\n${deviceId}`)}`;

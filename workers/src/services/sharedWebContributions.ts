/** Captured DeviceBearer identity. Never constructed from upload fields. */
export interface SharedWebAuthenticatedScope { accountId: string; childId: string; deviceId: string; deviceToken: string }

export async function readSharedWebJson(request: Pick<Request,'body'>, limit = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_WEB_CONTRIBUTION');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) { await reader.cancel(); throw Error('WEB_CONTRIBUTION_BODY_TOO_LARGE'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
    catch { throw Error('INVALID_WEB_CONTRIBUTION'); }
  } finally { reader.releaseLock(); }
}

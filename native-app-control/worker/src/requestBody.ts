function parseJsonObject(text: string): Record<string, unknown> {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_santa_request_body');
  }
  return value as Record<string, unknown>;
}

function contentEncoding(request: Request): 'identity' | 'deflate' | 'gzip' {
  const value = (request.headers.get('content-encoding') || 'identity').trim().toLowerCase();
  if (value === 'identity' || value === 'deflate' || value === 'gzip') return value;
  throw new Error('unsupported_santa_content_encoding');
}

async function decompress(bytes: ArrayBuffer, encoding: 'deflate' | 'gzip'): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(encoding));
  return new Response(stream).text();
}

export async function readSantaJsonObject(request: Request): Promise<Record<string, unknown>> {
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return {};

  const encoding = contentEncoding(request);
  const plainText = new TextDecoder().decode(bytes);

  // Cloudflare may expose already-decoded bytes while preserving the original header.
  try {
    return parseJsonObject(plainText);
  } catch (error) {
    if (encoding === 'identity') throw error;
  }

  try {
    return parseJsonObject(await decompress(bytes, encoding));
  } catch {
    throw new Error('invalid_santa_request_body');
  }
}

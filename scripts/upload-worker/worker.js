// Temporary multipart upload proxy for R2 bucket `local-models`.
// Protected by a shared secret in the X-Auth-Token header.
//
// Endpoints (all require X-Auth-Token):
//   POST /init     { key }                  -> { uploadId }
//   PUT  /part     ?uploadId=..&key=..&partNumber=..   body=bytes  -> { partNumber, etag }
//   POST /complete { key, uploadId, parts } -> { ok: true, key }
//   POST /abort    { key, uploadId }        -> { ok: true }

export default {
  async fetch(request, env) {
    const auth = request.headers.get("x-auth-token");
    if (!auth || auth !== env.AUTH_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const method = request.method;

    try {
      if (method === "POST" && url.pathname === "/init") {
        const { key } = await request.json();
        if (!key) return json({ error: "missing key" }, 400);
        const mpu = await env.BUCKET.createMultipartUpload(key);
        return json({ uploadId: mpu.uploadId, key: mpu.key });
      }

      if (method === "PUT" && url.pathname === "/part") {
        const key = url.searchParams.get("key");
        const uploadId = url.searchParams.get("uploadId");
        const partNumber = Number(url.searchParams.get("partNumber"));
        if (!key || !uploadId || !partNumber) {
          return json({ error: "missing key/uploadId/partNumber" }, 400);
        }
        const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
        const part = await mpu.uploadPart(partNumber, request.body);
        return json({ partNumber: part.partNumber, etag: part.etag });
      }

      if (method === "POST" && url.pathname === "/complete") {
        const { key, uploadId, parts } = await request.json();
        if (!key || !uploadId || !Array.isArray(parts)) {
          return json({ error: "missing key/uploadId/parts" }, 400);
        }
        const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
        await mpu.complete(parts);
        return json({ ok: true, key });
      }

      if (method === "POST" && url.pathname === "/abort") {
        const { key, uploadId } = await request.json();
        const mpu = env.BUCKET.resumeMultipartUpload(key, uploadId);
        await mpu.abort();
        return json({ ok: true });
      }

      if (method === "GET" && url.pathname === "/") {
        return json({ ok: true, service: "r2-upload-proxy" });
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: err?.message ?? String(err) }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

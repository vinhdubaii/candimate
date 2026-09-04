/**
 * POST /api/verify-turnstile
 * Nhận { token } từ widget Turnstile phía client, verify THẬT với Cloudflare
 * bằng Secret Key (chỉ nằm ở server qua biến môi trường, không lộ ra client).
 *
 * Yêu cầu biến môi trường trong Cloudflare Pages → Settings → Environment variables:
 *   TURNSTILE_SECRET_KEY
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('Thiếu biến môi trường TURNSTILE_SECRET_KEY trong Cloudflare Pages settings');
    return Response.json({ success: false, error: 'server-misconfigured' }, { status: 500 });
  }

  let token;
  try {
    const body = await request.json();
    token = body?.token;
  } catch {
    return Response.json({ success: false, error: 'invalid-body' }, { status: 400 });
  }

  if (!token || typeof token !== 'string') {
    return Response.json({ success: false, error: 'missing-token' }, { status: 400 });
  }

  const verifyBody = new URLSearchParams();
  verifyBody.append('secret', env.TURNSTILE_SECRET_KEY);
  verifyBody.append('response', token);

  // Gửi kèm IP người dùng nếu có, giúp Cloudflare đánh giá chính xác hơn (không bắt buộc).
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) verifyBody.append('remoteip', ip);

  try {
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyBody,
    });
    const outcome = await cfRes.json();

    if (outcome.success) {
      return Response.json({ success: true });
    }
    return Response.json({ success: false, errors: outcome['error-codes'] || [] }, { status: 401 });
  } catch (err) {
    console.error('Lỗi gọi Cloudflare siteverify:', err);
    return Response.json({ success: false, error: 'verify-request-failed' }, { status: 502 });
  }
}

// Chặn các method khác (GET, PUT...) để tránh nhầm lẫn / dò quét.
export async function onRequestGet() {
  return Response.json({ success: false, error: 'method-not-allowed' }, { status: 405 });
}

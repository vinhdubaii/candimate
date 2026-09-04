/**
 * Cloudflare Pages Function — chạy trước MỌI request tới site.
 * Xác thực bằng Supabase (verify token thật với Supabase Auth API,
 * không chỉ tin vào cookie có tồn tại hay không).
 *
 * Yêu cầu 2 biến môi trường trong Cloudflare Pages → Settings → Environment variables:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 */

// Những đường dẫn luôn được phép truy cập kể cả khi chưa đăng nhập
// (để màn hình welcome/login còn load được).
const PUBLIC_EXACT = new Set([
  '/welcome.html',
  '/policies.html',
  '/manifest.json',
  '/favicon.png',
  '/darkmode-icon.png',
  '/lightmode-icon.png',
  '/sw.js',
  '/robots.txt',
  '/sitemap.xml',
  '/api/verify-turnstile', // gọi từ welcome.html lúc CHƯA đăng nhập -> phải public
]);

const PUBLIC_PREFIXES = [
  '/icons/',
];

function isPublicPath(pathname) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function verifyToken(accessToken, supabaseUrl, anonKey) {
  if (!accessToken) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const { pathname } = url;

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    // Chưa cấu hình env var — không chặn để tránh khoá cứng site,
    // nhưng log lỗi rõ ràng để dev biết mà sửa.
    console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars in Pages settings');
    return next();
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  const accessToken = getCookie(cookieHeader, 'sb-access-token');
  const isAuthed = await verifyToken(accessToken, env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  // Đã đăng nhập mà cố vào lại welcome.html -> đưa thẳng về trang chính
  if (isAuthed && pathname === '/welcome.html') {
    return Response.redirect(url.origin + '/', 302);
  }

  // Chưa đăng nhập mà vào bất cứ đâu ngoài các path public -> đá về welcome.html
  if (!isAuthed && !isPublicPath(pathname)) {
    return Response.redirect(url.origin + '/welcome.html', 302);
  }

  return next();
}

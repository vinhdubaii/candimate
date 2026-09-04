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

function withNoStore(res) {
  const newRes = new Response(res.body, res);
  newRes.headers.set('Cache-Control', 'private, no-store, must-revalidate');
  return newRes;
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

  // Chưa đăng nhập mà vào trang gốc "/" -> phục vụ TRỰC TIẾP nội dung welcome.html
  // (status 200, không redirect) để Googlebot/Search Console thấy nội dung + thẻ
  // verification ngay tại domain gốc, đồng thời URL hiển thị trên trình duyệt vẫn
  // giữ nguyên "/" (không nhảy sang /welcome.html).
  if (!isAuthed && pathname === '/') {
    const res = await next(new Request(url.origin + '/welcome.html', request));
    return withNoStore(res); // nội dung phụ thuộc trạng thái đăng nhập -> KHÔNG cho CDN cache chung
  }

  // Chưa đăng nhập mà vào bất cứ đâu khác ngoài các path public -> đá về welcome.html
  if (!isAuthed && !isPublicPath(pathname)) {
    return Response.redirect(url.origin + '/welcome.html', 302);
  }

  const res = await next();

  // Mọi trang KHÔNG nằm trong danh sách public (tức là chỉ phục vụ khi đã xác thực,
  // ví dụ index.html, dữ liệu album...) tuyệt đối không được để Cloudflare cache theo
  // URL — nếu không, một request đã đăng nhập có thể bị cache và trả về công khai cho
  // người dùng/bot khác sau đó, làm lộ ảnh học sinh, giáo viên.
  if (!isPublicPath(pathname)) {
    return withNoStore(res);
  }

  return res;
}

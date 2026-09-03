/* ════════════════════════════════════
   CANDIMATE — auth.js
   Dùng chung cho welcome.html và index.html.
   Yêu cầu đã include supabase-js trước file này:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ════════════════════════════════════ */

// Anon/publishable key vốn public, an toàn khi để lộ ở client.
const SUPABASE_URL = 'https://ozhdztltphgrgqygklpq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tpeYSmMt9C91XtNN75PmRQ_tKIXlnvB';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

function cm_setCookie(name, value, maxAgeSeconds) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; Secure`;
}
function cm_deleteCookie(name) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

// Ghi access token vào cookie để Cloudflare Pages Function (edge) verify được.
// (Middleware chỉ cần sb-access-token; refresh token vẫn để supabase-js tự quản lý qua localStorage.)
function cm_syncSessionToCookie(session) {
  if (session && session.access_token) {
    const maxAge = session.expires_in ? Number(session.expires_in) : 3600;
    cm_setCookie('sb-access-token', session.access_token, maxAge);
  } else {
    cm_deleteCookie('sb-access-token');
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    cm_syncSessionToCookie(session);
  } else if (event === 'SIGNED_OUT') {
    cm_syncSessionToCookie(null);
  }
});

// Gọi ở đầu mỗi trang để đảm bảo cookie khớp với session hiện tại
// (ví dụ user vừa được auto-refresh token trong lúc tab đang mở).
async function cm_ensureCookieSynced() {
  const { data } = await supabaseClient.auth.getSession();
  cm_syncSessionToCookie(data.session);
  return data.session;
}

async function cm_signOut() {
  await supabaseClient.auth.signOut();
  cm_deleteCookie('sb-access-token');
  window.location.href = '/welcome.html';
}

// Lấy avatar/tên/email từ tài khoản Google đã đăng nhập qua Supabase.
async function cm_getUserInfo() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data?.user) return null;
  const meta = data.user.user_metadata || {};
  return {
    avatarUrl: meta.avatar_url || meta.picture || null,
    name: meta.full_name || meta.name || (data.user.email ? data.user.email.split('@')[0] : 'Người dùng'),
    email: data.user.email || '',
  };
}

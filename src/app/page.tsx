"use client";

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="overflow-hidden w-[220px] h-12 mx-auto mb-6">
            <img src="/logo.jpg" alt="Assemblyreels Logo" className="w-full h-full object-contain scale-[3.5] mix-blend-multiply" />
          </div>
          <h1 className="heading-2">Welcome Back</h1>
          <p className="text-muted">Sign in to your media factory</p>
        </div>

        <form 
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            document.cookie = "demo_auth=true; path=/";
            window.location.href = '/workspaces';
          }}
        >
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email Address</label>
            <input type="email" className="input-field" placeholder="you@example.com" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Password</label>
            <input type="password" className="input-field" placeholder="••••••••" />
          </div>
          <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl shadow-md transition-all" style={{ width: '100%', marginTop: '0.5rem' }}>
            Sign In
          </button>
        </form>

        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
          Need an account? <span style={{ color: 'var(--accent-primary)', cursor: 'pointer' }}>Sign up</span>
        </div>
      </div>
    </div>
  );
}

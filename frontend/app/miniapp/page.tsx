'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── SVG / CSS Provider Logos matching the Video ────────────────────────────────

function ProviderLogo({ code, size = 48 }: { code: string; size?: number }) {
  switch (code.toUpperCase()) {
    case 'PG':
      return (
        <div style={{
          width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#000', borderRadius: '25%', border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', lineHeight: 1 }}>PG</span>
          <span style={{ fontSize: '0.45rem', color: '#ffb703', fontWeight: 'bold', letterSpacing: '0.5px' }}>SOFT</span>
        </div>
      );
    case 'JILI':
      return (
        <div style={{
          width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000', borderRadius: '25%', border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b', fontStyle: 'italic', letterSpacing: '-0.5px' }}>JILI</span>
        </div>
      );
    case 'PRAGMATIC':
    case 'PRAGMATIC PLAY':
      return (
        <div style={{
          width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#1a0b2e', borderRadius: '25%', border: '1px solid #ef4444'
        }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ff7a00', lineHeight: 1 }}>PP</span>
          <span style={{ fontSize: '0.4rem', color: '#fff', textTransform: 'uppercase' }}>Pragmatic</span>
        </div>
      );
    case 'JOKER':
    case 'JOKER GAMING':
      return (
        <div style={{
          width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#1e0505', borderRadius: '25%', border: '1px solid #dc2626'
        }}>
          <span style={{ fontSize: '1rem', color: '#dc2626' }}>👑</span>
          <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>JOKER</span>
        </div>
      );
    case 'SPADE':
    case 'SPADE GAMING':
      return (
        <div style={{
          width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#111', borderRadius: '25%', border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span style={{ fontSize: '1.4rem', color: '#ef4444' }}>♠️</span>
        </div>
      );
    case 'RICH88':
      return (
        <div style={{
          width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #4c1d95, #1e1b4b)', borderRadius: '25%', border: '1px solid #c084fc'
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#e9d5ff', lineHeight: 1 }}>R88</span>
          <span style={{ fontSize: '0.4rem', color: '#c084fc' }}>RICH</span>
        </div>
      );
    default:
      return (
        <div style={{
          width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-tertiary)', borderRadius: '25%', border: '1px solid var(--border)'
        }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{code.slice(0, 3).toUpperCase()}</span>
        </div>
      );
  }
}

// ─── Game Image Fallbacks ──────────────────────────────────────────────────────

const GAME_COVERS: Record<string, string> = {
  'speed-winner': 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=500&q=80',
  'pinata-wins': 'https://images.unsplash.com/photo-1561564943-2677d2427a15?w=500&q=80',
  'fortune-tiger': 'https://images.unsplash.com/photo-1508817628294-5a453fa0b8fb?w=500&q=80',
  'mahjong-ways': 'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?w=500&q=80',
  'gem-saviour': 'https://images.unsplash.com/photo-1535320903710-d993d3d77d29?w=500&q=80',
  'boxing-king': 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=500&q=80',
  'golden-empire': 'https://images.unsplash.com/photo-1599733589046-9b8308b5b50d?w=500&q=80',
  'super-ace': 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=500&q=80',
  'gates-of-olympus': 'https://images.unsplash.com/photo-1503152394-c571994fd383?w=500&q=80',
  'sweet-bonanza': 'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=500&q=80',
  'starlight-princess': 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80',
  'roma-joker': 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=500&q=80',
  'lucky-god-joker': 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500&q=80',
};

// ─── Main Component ────────────────────────────────────────────────────────────

function MiniAppContent() {
  const searchParams = useSearchParams();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [adminUsername, setAdminUsername] = useState('YOUR_ADMIN_USERNAME');
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize and Fetch Tenant & Providers
  useEffect(() => {
    async function init() {
      try {
        let tid = searchParams.get('tenantId') || searchParams.get('t');
        
        // Fallback to fetch default tenant if none in URL
        if (!tid) {
          const tRes = await fetch(`${API}/internal/slot/tenant`);
          const tData = await tRes.json();
          if (tData.success && tData.data?.id) {
            tid = tData.data.id;
          }
        }
        
        if (tid) {
          setTenantId(tid);
          
          // Get providers list
          const pRes = await fetch(`${API}/internal/slot/providers?tenantId=${tid}`);
          const pData = await pRes.json();
          if (pData.success) {
            setProviders(pData.data || []);
          }
        }
      } catch (err) {
        console.error('Failed to initialize miniapp:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [searchParams]);

  // Load Games when Provider is Selected
  const selectProvider = async (provider: any) => {
    setSelectedProvider(provider);
    setGamesLoading(true);
    setActiveCardIndex(0);
    try {
      const gRes = await fetch(`${API}/internal/slot/providers/${provider.code}/games?tenantId=${tenantId}`);
      const gData = await gRes.json();
      if (gData.success) {
        setGames(gData.data || []);
      }
      
      // Log event
      await fetch(`${API}/internal/slot/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          eventType: 'VIEW_PROVIDER',
          providerId: provider.id,
          metadata: JSON.stringify({ providerCode: provider.code })
        })
      });
    } catch (err) {
      console.error('Failed to load games:', err);
    } finally {
      setGamesLoading(false);
    }
  };

  // Log game clicks
  const logGameClick = async (game: any, type: 'VIEW_GAME' | 'CLICK_CONTACT_ADMIN') => {
    try {
      await fetch(`${API}/internal/slot/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          eventType: type,
          gameId: game.id,
          providerId: game.providerId,
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Back to providers list
  const handleBack = () => {
    setSelectedProvider(null);
    setGames([]);
  };

  // Horizontal scroll tracking to update indicator dots
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const index = Math.round(scrollLeft / clientWidth);
    setActiveCardIndex(index);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#070913', color: 'var(--text-secondary)', gap: 16
      }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <div style={{ fontSize: '0.85rem' }}>กำลังโหลดระบบ AI Winrate...</div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 480, margin: '0 auto', minHeight: '100vh',
      background: '#070913', color: '#fff', position: 'relative',
      fontFamily: "'Kanit', sans-serif", paddingBottom: 24,
      boxShadow: '0 0 40px rgba(0,0,0,0.8)'
    }}>
      
      {/* ─── HEADER ─── */}
      <header style={{
        padding: '20px 20px 12px 20px',
        background: 'linear-gradient(to bottom, rgba(13,17,34,0.9), transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          {selectedProvider && (
            <button onClick={handleBack} style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff',
              padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem', marginRight: 10,
              cursor: 'pointer'
            }}>
              ⬅️ กลับ
            </button>
          )}
          <span style={{
            fontSize: '1.25rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #ffd700, #ffa500)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: '0 0 10px rgba(255,215,0,0.2)',
            letterSpacing: '1px'
          }}>
            ⚡ BONUS TIME ⚡
          </span>
          <div style={{ fontSize: '0.65rem', color: '#a0aec0', letterSpacing: '0.5px', marginTop: 2 }}>
            AI WINRATE SYSTEM
          </div>
        </div>
        
        {/* Pulsing Live Dot */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(6,214,160,0.1)', border: '1px solid rgba(6,214,160,0.2)',
          padding: '4px 10px', borderRadius: 20
        }}>
          <span className="live-dot" style={{
            width: 7, height: 7, borderRadius: '50%', background: '#06D6A0',
            boxShadow: '0 0 8px #06D6A0', display: 'inline-block'
          }} />
          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#06D6A0' }}>
            LIVE
          </span>
        </div>
      </header>

      {/* ─── VIEW 1: PROVIDER LIST ─── */}
      {!selectedProvider ? (
        <div style={{ padding: 20 }}>
          <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 16, textAlign: 'center' }}>
            🎯 เลือกค่ายเกมเพื่อรับสูตรแฮกสถิติอัตราชนะแบบเรียลไทม์
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12
          }}>
            {providers.map((prov) => (
              <div
                key={prov.id}
                onClick={() => selectProvider(prov)}
                style={{
                  background: 'rgba(13,17,34,0.75)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14, padding: '16px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--teal)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <ProviderLogo code={prov.code} size={50} />
                <span style={{
                  fontSize: '0.75rem', fontWeight: 'bold', color: '#cbd5e1',
                  textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  width: '100%'
                }}>
                  {prov.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ─── VIEW 2: SWIPEABLE GAME CARDS ─── */
        <div style={{ marginTop: 16 }}>
          {gamesLoading ? (
            <div style={{ textAlign: 'center', padding: 100, color: '#cbd5e1' }}>
              <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
              <div style={{ fontSize: '0.8rem' }}>กำลังคำนวณอัตราชนะ...</div>
            </div>
          ) : games.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
              📭 ยังไม่มีเกมอัปเดตในค่ายนี้
            </div>
          ) : (
            <div>
              {/* Swipeable Container */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                  display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory',
                  scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                  paddingLeft: 24, paddingRight: 24, gap: 16
                }}
              >
                {games.map((game) => {
                  const fallbackCover = GAME_COVERS[game.slug] || 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=500&q=80';
                  const coverUrl = game.imageUrl || fallbackCover;

                  return (
                    <div
                      key={game.id}
                      style={{
                        flex: '0 0 calc(100vw - 48px)', maxWidth: 432,
                        scrollSnapAlign: 'center',
                        background: 'linear-gradient(to bottom, #0e1227, #070913)',
                        borderRadius: 20, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                        display: 'flex', flexDirection: 'column'
                      }}
                    >
                      {/* Game Image Background Banner */}
                      <div style={{
                        height: 220, width: '100%', position: 'relative',
                        backgroundImage: `url(${coverUrl})`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                      }}>
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'linear-gradient(to bottom, transparent 40%, #0e1227)'
                        }} />
                        
                        {/* Status Label Overlay */}
                        <div style={{
                          position: 'absolute', top: 12, left: 12,
                          background: 'rgba(0, 229, 255, 0.25)', border: '1px solid var(--teal)',
                          padding: '3px 8px', borderRadius: 8, fontSize: '0.62rem',
                          fontWeight: 'bold', color: 'var(--teal)', backdropFilter: 'blur(4px)'
                        }}>
                          LIVE STATS
                        </div>
                      </div>

                      {/* Card Content Body */}
                      <div style={{ padding: '0px 20px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {/* Titles */}
                        <div style={{ textAlign: 'center' }}>
                          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                            {game.name}
                          </h3>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>
                            สูตรมาจากสถิติลูกค้าเล่นจริง
                          </div>
                        </div>

                        {/* Win Rate Progress Bar */}
                        <div style={{
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 14, padding: 12
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                              🎯 อัตราชนะ
                            </span>
                            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffd700' }}>
                              {game.bonusScore}%
                            </span>
                          </div>
                          
                          {/* Striped Yellow/Black Bar */}
                          <div style={{
                            width: '100%', height: 16, background: '#1e293b', borderRadius: 8, overflow: 'hidden',
                            position: 'relative', border: '1px solid rgba(255,255,255,0.05)'
                          }}>
                            <div style={{
                              width: `${game.bonusScore}%`, height: '100%',
                              backgroundImage: 'linear-gradient(45deg, #ffd700 25%, #000 25%, #000 50%, #ffd700 50%, #ffd700 75%, #000 75%, #000)',
                              backgroundSize: '24px 24px',
                              borderRadius: 8,
                              animation: 'stripedBar 1.2s linear infinite'
                            }} />
                          </div>
                        </div>

                        {/* Three detailed statistics */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {[
                            { label: 'โอกาสชนะ', val: `${game.bonusScore}%`, color: '#ef4444' },
                            { label: 'เข้าฟรีสปิน', val: `${game.popularityScore}%`, color: '#3b82f6' },
                            { label: 'WILD', val: `${game.featureScore}%`, color: '#22c55e' }
                          ].map((stat, sIdx) => (
                            <div key={sIdx} style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.04)',
                              borderRadius: 10, padding: '10px 4px', textAlign: 'center'
                            }}>
                              <div style={{ fontSize: '0.95rem', fontWeight: 850, color: stat.color }}>{stat.val}</div>
                              <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 2 }}>{stat.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Dynamic Card Footer (License, brand, language info) */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12, marginTop: 4
                        }}>
                          {/* Left: Provider license */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ProviderLogo code={selectedProvider.code} size={24} />
                            <div style={{ fontSize: '0.58rem', color: '#94a3b8', lineHeight: 1.2 }}>
                              <div>ใบอนุญาต</div>
                              <div style={{ fontWeight: 'bold', color: '#cbd5e1' }}>{selectedProvider.code}</div>
                            </div>
                          </div>

                          {/* Center: Brand badge */}
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: 'bold', color: '#000',
                            boxShadow: '0 0 10px rgba(255,215,0,0.3)'
                          }}>
                            👑
                          </div>

                          {/* Right: Thai flag & language support */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '1rem' }}>🇹🇭</span>
                            <div style={{ fontSize: '0.58rem', color: '#94a3b8', lineHeight: 1.2 }}>
                              <div>ภาษาที่รองรับ</div>
                              <div style={{ fontWeight: 'bold', color: '#cbd5e1' }}>ภาษาไทย</div>
                            </div>
                          </div>
                        </div>

                        {/* CTA Button: Contact / Play */}
                        <a
                          href={`https://t.me/${adminUsername}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => logGameClick(game, 'CLICK_CONTACT_ADMIN')}
                          style={{
                            background: 'linear-gradient(135deg, #00ff87 0%, #60efff 100%)',
                            color: '#000', fontWeight: 'bold', textAlign: 'center',
                            padding: '12px', borderRadius: 12, fontSize: '0.88rem',
                            display: 'block', textDecoration: 'none', marginTop: 4,
                            boxShadow: '0 4px 15px rgba(0,255,135,0.2)'
                          }}
                        >
                          สอบถาม24hr. ✅
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Indicator Dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
                {games.map((_, idx) => (
                  <span
                    key={idx}
                    style={{
                      width: activeCardIndex === idx ? 18 : 6,
                      height: 6, borderRadius: 3,
                      background: activeCardIndex === idx ? 'var(--teal)' : 'rgba(255,255,255,0.2)',
                      transition: 'all 0.25s'
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global CSS Inject for striped progress animation */}
      <style jsx global>{`
        @keyframes stripedBar {
          0% { background-position: 0 0; }
          100% { background-position: 24px 0; }
        }
        @keyframes livePulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        .live-dot {
          animation: livePulse 1.5s infinite;
        }
      `}</style>

    </div>
  );
}

export default function MiniAppPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#070913', color: 'var(--text-secondary)'
      }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    }>
      <MiniAppContent />
    </Suspense>
  );
}

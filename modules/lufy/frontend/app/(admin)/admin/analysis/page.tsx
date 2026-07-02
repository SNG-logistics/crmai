'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type LinkItem = { id: string; slug: string };

type AnalyticsData = {
  totalClicks: number;
  activeLinks: number;
  clicksByDay: { date: string; count: number }[];
  topCountries: { label: string; count: number }[];
  topOS: { label: string; count: number }[];
  topBrowsers: { label: string; count: number }[];
  topDevices: { label: string; count: number }[];
  topDeviceTypes: { label: string; count: number }[];
  topIPs: { label: string; count: number }[];
  topReferrers: { label: string; count: number }[];
  topSlugs: { label: string; count: number }[];
};

export default function AnalysisPage() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [selectedLink, setSelectedLink] = useState('');
  const [days, setDays] = useState('30');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLinks = async () => {
    try {
      const res = await api.get('/links');
      if (res.data.success) setLinks(res.data.links);
    } catch {}
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.get('/analysis', {
        params: {
          linkId: selectedLink || undefined,
          days,
        }
      });
      if (res.data.success) setData(res.data.data);
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลสถิติได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [selectedLink, days]);

  // Chart configurations
  const chartData = {
    labels: data?.clicksByDay.map(d => {
      const parts = d.date.split('-');
      return `${parts[2]}/${parts[1]}`;
    }) || [],
    datasets: [
      {
        fill: true,
        label: 'จำนวนคลิก',
        data: data?.clicksByDay.map(d => d.count) || [],
        borderColor: '#00D4AA',
        backgroundColor: 'rgba(0, 212, 170, 0.08)',
        tension: 0.35,
        borderWidth: 3,
        pointBackgroundColor: '#00D4AA',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748B' },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#64748B' },
      },
    },
  };

  return (
    <div>
      {/* Filters Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>📊 วิเคราะห์สถิติผู้คลิก</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>วิเคราะห์ข้อมูลผู้คลิก เช็คแหล่งที่มา ประเทศ และเครือข่ายอินเทอร์เน็ต</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 180, background: 'var(--bg-secondary)' }} value={days} onChange={e => setDays(e.target.value)}>
            <option value="7">📅 7 วันล่าสุด</option>
            <option value="30">📅 30 วันล่าสุด</option>
            <option value="90">📅 90 วันล่าสุด</option>
          </select>

          <select className="input" style={{ width: 220, background: 'var(--bg-secondary)' }} value={selectedLink} onChange={e => setSelectedLink(e.target.value)}>
            <option value="">🔗 ทุกการลิงก์ย่อ</option>
            {links.map(link => (
              <option key={link.id} value={link.id}>
                /{link.slug}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>จำนวนคลิกรวม</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, marginTop: 4, color: 'var(--teal)' }}>
              {loading ? '...' : data?.totalClicks.toLocaleString()}
            </h2>
          </div>
          <span style={{ fontSize: '2.2rem' }}>🚀</span>
        </div>

        <div className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>ลิงก์ที่เปิดใช้งานอยู่</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, marginTop: 4, color: '#0088FF' }}>
              {loading ? '...' : data?.activeLinks}
            </h2>
          </div>
          <span style={{ fontSize: '2.2rem' }}>🔗</span>
        </div>
      </div>

      {/* Chart.js Line chart */}
      <div className="stat-card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>📈 สถิติคลิกรายวัน</h3>
        <div style={{ height: 260, position: 'relative' }}>
          {loading ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner" />
            </div>
          ) : (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* Grid of Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Top Slugs */}
        {!selectedLink && (
          <div className="stat-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>🔥 ลิงก์ยอดนิยม</h3>
            <div className="table-wrap">
              <table>
                <tbody>
                  {data?.topSlugs.map((item, i) => (
                    <tr key={i}>
                      <td><strong>/{item.label}</strong></td>
                      <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 700 }}>{item.count.toLocaleString()} คลิก</td>
                    </tr>
                  ))}
                  {(!data || data.topSlugs.length === 0) && <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Countries */}
        <div className="stat-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>🌍 ประเทศที่คลิกสูงสุด</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {data?.topCountries.map((item, i) => (
                  <tr key={i}>
                    <td>📍 {item.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.count.toLocaleString()} คลิก</td>
                  </tr>
                ))}
                {(!data || data.topCountries.length === 0) && <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Referrers */}
        <div className="stat-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>🔗 แหล่งที่มา (Referrers)</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {data?.topReferrers.map((item, i) => (
                  <tr key={i}>
                    <td>🌐 {item.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.count.toLocaleString()} คลิก</td>
                  </tr>
                ))}
                {(!data || data.topReferrers.length === 0) && <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Browsers */}
        <div className="stat-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>🧭 เว็บบราวเซอร์</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {data?.topBrowsers.map((item, i) => (
                  <tr key={i}>
                    <td>🧭 {item.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.count.toLocaleString()} คลิก</td>
                  </tr>
                ))}
                {(!data || data.topBrowsers.length === 0) && <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top OS */}
        <div className="stat-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>💻 ระบบปฏิบัติการ (OS)</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {data?.topOS.map((item, i) => (
                  <tr key={i}>
                    <td>💻 {item.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.count.toLocaleString()} คลิก</td>
                  </tr>
                ))}
                {(!data || data.topOS.length === 0) && <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top IPs */}
        <div className="stat-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>📡 IP Address ยอดนิยม</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {data?.topIPs.map((item, i) => (
                  <tr key={i}>
                    <td>📡 {item.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.count.toLocaleString()} คลิก</td>
                  </tr>
                ))}
                {(!data || data.topIPs.length === 0) && <tr><td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

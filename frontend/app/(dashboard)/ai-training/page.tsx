'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '../../../lib/api';
import ChatTrainingExport from '../../../components/ChatTrainingExport';

type Company = {
  id: string;
  name: string;
};

export default function AiTrainingPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/companies')
      .then(response => {
        const list: Company[] = response.data.companies || [];
        setCompanies(list);
        setCompanyId(current => current || list[0]?.id || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const company = useMemo(
    () => companies.find(item => item.id === companyId),
    [companies, companyId],
  );

  return (
    <div>
      <div className="page-header" style={{ alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Export แชทสำหรับ Train AI</h1>
          <p className="page-subtitle">เลือกบทสนทนาจาก LINE หรือ WhatsApp แล้วดาวน์โหลดเป็น JSONL หรือ CSV</p>
        </div>
        <div style={{ minWidth: 260 }}>
          <label className="label">บริษัท</label>
          <select
            className="input"
            value={companyId}
            onChange={event => setCompanyId(event.target.value)}
            disabled={loading}
          >
            {companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>

      {companyId ? (
        <ChatTrainingExport companyId={companyId} companyName={company?.name} />
      ) : (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
          {loading ? 'กำลังโหลดบริษัท...' : 'ยังไม่มีบริษัทสำหรับ Export แชท'}
        </div>
      )}
    </div>
  );
}

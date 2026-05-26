// probe v3 — รู้แล้วว่า connected ได้ + event "member_notiwithdraw" + pf:"ALB"
const { io } = require('socket.io-client');

const PKM_SOCKET = 'https://pkm-socket.gamingcenter.club';
const USERNAME   = 'admin@lag';
const PASSWORD   = 'cqmx010ifi6';
const PF         = 'ALB';

console.log('🔌 เชื่อมต่อ PKM...');

const socket = io(PKM_SOCKET, {
  transports: ['polling'],
  reconnection: false,
  timeout: 30000,
  extraHeaders: { 'Origin': 'https://pkm-bo.gamingcenter.club', 'Referer': 'https://pkm-bo.gamingcenter.club/' },
});

const allEvents = new Set();
socket.onAny((event, ...args) => {
  allEvents.add(event);
  const data = JSON.stringify(args[0] || '').substring(0, 300);
  console.log(`📥 [${event}]:`, data);
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);

  // ลอง login + pf
  const loginVariants = [
    { username: USERNAME, password: PASSWORD },
    { username: USERNAME, password: PASSWORD, pf: PF },
    { user: USERNAME, pass: PASSWORD, pf: PF },
    { email: USERNAME, password: PASSWORD, pf: PF },
    { username: USERNAME, password: PASSWORD, platform: PF },
    { agent: USERNAME, password: PASSWORD, pf: PF },
  ];

  const loginEvents = ['login', 'auth', 'agent:login', 'bo:login', 'pkm:login', 
                       'authenticate', 'user:login', 'admin:login', 'signin'];

  loginEvents.forEach((ev, i) => {
    setTimeout(() => {
      const payload = loginVariants[Math.min(i, loginVariants.length - 1)];
      console.log(`📤 Emit [${ev}]:`, JSON.stringify(payload));
      socket.emit(ev, payload, (res) => {
        if (res) console.log(`  ↩️ Response:`, JSON.stringify(res).substring(0, 300));
      });
    }, i * 500);
  });

  // หลัง 6 วินาที ลองดึง member list
  setTimeout(() => {
    console.log('\n📤 ลองดึงสมาชิก...');
    const memberEvents = [
      'member:list', 'get:members', 'memberList', 'member_list',
      'getMember', 'getMembers', 'member:get', 'bo:member:list',
      'pkm:member:list', 'player:list', 'user:list',
    ];
    const memberPayloads = [
      { pf: PF, page: 1, limit: 10 },
      { pf: PF },
      {},
      { platform: PF, page: 1 },
    ];
    memberEvents.forEach((ev, i) => {
      setTimeout(() => {
        const payload = memberPayloads[Math.min(i, memberPayloads.length - 1)];
        console.log(`📤 Emit [${ev}]:`, JSON.stringify(payload));
        socket.emit(ev, payload, (res) => {
          if (res) console.log(`  ↩️ [${ev}] Response:`, JSON.stringify(res).substring(0, 400));
        });
      }, i * 400);
    });
  }, 6000);
});

socket.on('connect_error', (err) => console.log('❌ Error:', err.message));
socket.on('disconnect', () => console.log('🔌 Disconnected'));

setTimeout(() => {
  console.log('\n📊 Events ที่ได้รับทั้งหมด:', [...allEvents].join(', '));
  socket.disconnect();
  process.exit(0);
}, 20000);

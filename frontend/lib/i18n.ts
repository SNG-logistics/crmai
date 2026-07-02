// ─── Translation Dictionary TH ↔ LO ──────────────────────────────────────────
export type Lang = 'th' | 'lo';

export const translations = {
  // ── Navigation ──────────────────────────────────────────────────────────────
  nav_dashboard:       { th: 'แดชบอร์ด',           lo: 'ແດຊບອດ' },
  nav_inbox:           { th: 'กล่องข้อความ',         lo: 'ກ່ອງຂໍ້ຄວາມ' },
  nav_contacts:        { th: 'ลูกค้า',               lo: 'ລູກຄ້າ' },
  nav_tickets:         { th: 'Tickets',              lo: 'ທິກເກັດ' },
  nav_broadcasts:      { th: 'Broadcast',            lo: 'ສົ່ງຫາຫຼາຍຄົນ' },
  nav_automation:      { th: 'Automation',           lo: 'ລະບົບອັດຕະໂນມັດ' },
  nav_bot:             { th: 'AI Bot',               lo: 'AI Bot' },
  nav_analytics:       { th: 'รายงาน',               lo: 'ລາຍງານ' },
  nav_telesales:       { th: 'Telesales',            lo: 'ທີມໂທຂາຍ' },
  nav_live:            { th: 'Live Dashboard',       lo: 'ໄລທ໌ດ໋າດ' },
  nav_flex:            { th: 'FLEX Builder',         lo: 'FLEX Builder' },
  nav_pkm:             { th: '🎰 PKM สมาชิก',          lo: '🎰 PKM ສະມາຊິກ' },
  nav_import:          { th: 'Import ข้อมูล',        lo: 'ນຳເຂົ້າຂໍ້ມູນ' },
  nav_sms:             { th: 'SMS Gateway',          lo: 'ສົ່ງ SMS' },
  nav_channels:        { th: 'ตั้งค่าช่องทาง',       lo: 'ຕັ້ງຄ່າຊ່ອງທາງ' },
  nav_companies:       { th: 'บริษัท',                lo: 'ບໍລິສັດ' },
  nav_whatsapp:        { th: 'WhatsApp',             lo: 'WhatsApp' },
  nav_team:            { th: 'ทีม',                  lo: 'ທີມງານ' },
  nav_profile:         { th: 'โปรไฟล์ & 2FA',        lo: 'ໂປຣໄຟລ໌ & 2FA' },
  nav_audit_logs:      { th: 'ประวัติระบบ',          lo: 'ປະຫວັດລະບົບ' },
  nav_lufy:            { th: 'ลิงก์ (lufy.cc)',       lo: 'ລິ້ງ (lufy.cc)' },
  nav_settings:        { th: 'ตั้งค่า',              lo: 'ຕັ້ງຄ່າ' },

  // ── Common Buttons ───────────────────────────────────────────────────────────
  btn_save:            { th: 'บันทึก',               lo: 'ບັນທຶກ' },
  btn_cancel:          { th: 'ยกเลิก',               lo: 'ຍົກເລີກ' },
  btn_send:            { th: 'ส่ง',                  lo: 'ສົ່ງ' },
  btn_create:          { th: 'สร้าง',                lo: 'ສ້າງ' },
  btn_edit:            { th: 'แก้ไข',                lo: 'ແກ້ໄຂ' },
  btn_delete:          { th: 'ลบ',                   lo: 'ລົບ' },
  btn_search:          { th: 'ค้นหา',                lo: 'ຄົ້ນຫາ' },
  btn_confirm:         { th: 'ยืนยัน',               lo: 'ຢືນຢັນ' },
  btn_close:           { th: 'ปิด',                  lo: 'ປິດ' },
  btn_open:            { th: 'เปิด',                 lo: 'ເປີດ' },
  btn_logout:          { th: 'ออกจากระบบ',           lo: 'ອອກຈາກລະບົບ' },
  btn_login:           { th: 'เข้าสู่ระบบ',          lo: 'ເຂົ້າສູ່ລະບົບ' },
  btn_refresh:         { th: 'รีเฟรช',               lo: 'ໂຫຼດໃໝ່' },
  btn_assign:          { th: 'มอบหมาย',              lo: 'ມອບໝາຍ' },
  btn_import:          { th: 'Import',               lo: 'ນຳເຂົ້າ' },
  btn_export:          { th: 'Export',               lo: 'ສົ່ງອອກ' },
  btn_add:             { th: 'เพิ่ม',                lo: 'ເພີ່ມ' },
  btn_broadcast:       { th: 'ส่ง Broadcast',        lo: 'ສົ່ງຫາຫຼາຍຄົນ' },
  btn_handoff:         { th: 'โอนให้คน',             lo: 'ໂອນໃຫ້ຄົນ' },
  btn_resolve:         { th: 'ปิดแชท',               lo: 'ປິດການສົນທະນາ' },
  btn_reply:           { th: 'ตอบ',                  lo: 'ຕອບ' },
  btn_filter:          { th: 'กรอง',                 lo: 'ກັ່ນຕອງ' },

  // ── Inbox / Chat ─────────────────────────────────────────────────────────────
  inbox_title:         { th: 'กล่องข้อความ',         lo: 'ກ່ອງຂໍ້ຄວາມ' },
  inbox_all:           { th: 'ทั้งหมด',              lo: 'ທັງໝົດ' },
  inbox_open:          { th: 'เปิด',                 lo: 'ເປີດ' },
  inbox_bot:           { th: 'Bot',                  lo: 'Bot' },
  inbox_pending:       { th: 'รอตอบ',                lo: 'ລໍຖ້າ' },
  inbox_resolved:      { th: 'ปิดแล้ว',              lo: 'ປິດແລ້ວ' },
  inbox_placeholder:   { th: 'พิมพ์ข้อความ...',      lo: 'ພິມຂໍ້ຄວາມ...' },
  inbox_ai_suggest:    { th: '✨ AI แนะนำ',           lo: '✨ AI ແນະນຳ' },
  inbox_no_conv:       { th: 'ไม่มีบทสนทนา',         lo: 'ບໍ່ມີການສົນທະນາ' },
  inbox_select_conv:   { th: 'เลือกบทสนทนา',         lo: 'ເລືອກການສົນທະນາ' },
  inbox_search:        { th: 'ค้นหาลูกค้า...',       lo: 'ຄົ້ນຫາລູກຄ້າ...' },
  inbox_typing:        { th: 'กำลังพิมพ์...',         lo: 'ກຳລັງພິມ...' },
  inbox_you:           { th: 'คุณ',                  lo: 'ທ່ານ' },
  inbox_bot_label:     { th: 'Bot',                  lo: 'Bot' },
  inbox_assigned_me:   { th: 'มอบหมายให้ฉัน',        lo: 'ມອບໝາຍໃຫ້ຂ້ອຍ' },

  // ── Status Labels ────────────────────────────────────────────────────────────
  status_open:         { th: 'เปิด',                 lo: 'ເປີດ' },
  status_pending:      { th: 'รอตอบ',                lo: 'ລໍຖ້າ' },
  status_resolved:     { th: 'ปิดแล้ว',              lo: 'ປິດແລ້ວ' },
  status_bot:          { th: 'Bot',                  lo: 'Bot' },
  status_online:       { th: 'ออนไลน์',              lo: 'ອອນໄລນ໌' },
  status_offline:      { th: 'ออฟไลน์',              lo: 'ອອຟໄລນ໌' },
  status_connected:    { th: 'เชื่อมต่อแล้ว',        lo: 'ເຊື່ອມຕໍ່ແລ້ວ' },
  status_disconnected: { th: 'ยังไม่เชื่อมต่อ',       lo: 'ຍັງບໍ່ໄດ້ເຊື່ອມຕໍ່' },

  // ── Contacts ─────────────────────────────────────────────────────────────────
  contacts_title:      { th: 'ลูกค้าทั้งหมด',        lo: 'ລູກຄ້າທັງໝົດ' },
  contacts_name:       { th: 'ชื่อ',                 lo: 'ຊື່' },
  contacts_phone:      { th: 'เบอร์โทร',             lo: 'ເບີໂທ' },
  contacts_username:   { th: 'Username',             lo: 'ຊື່ຜູ້ໃຊ້' },
  contacts_deposit:    { th: 'ยอดฝากรวม',            lo: 'ຍອດຝາກລວມ' },
  contacts_withdraw:   { th: 'ยอดถอนรวม',            lo: 'ຍອດຖອນລວມ' },
  contacts_tag:        { th: 'Tag',                  lo: 'ປ້າຍ' },
  contacts_note:       { th: 'หมายเหตุ',             lo: 'ໝາຍເຫດ' },
  contacts_new:        { th: 'เพิ่มลูกค้า',           lo: 'ເພີ່ມລູກຄ້າ' },
  contacts_affiliate:  { th: 'รหัสพาร์ทเนอร์',       lo: 'ລະຫັດຕົວແທນ' },

  // ── Analytics ────────────────────────────────────────────────────────────────
  analytics_deposit:   { th: 'ยอดฝาก',              lo: 'ຍອດຝາກ' },
  analytics_withdraw:  { th: 'ยอดถอน',              lo: 'ຍອດຖອນ' },
  analytics_profit:    { th: 'กำไรสุทธิ',            lo: 'ກຳໄລສຸດທິ' },
  analytics_members:   { th: 'สมาชิก',              lo: 'ສະມາຊິກ' },
  analytics_new:       { th: 'สมาชิกใหม่',           lo: 'ສະມາຊິກໃໝ່' },
  analytics_today:     { th: 'วันนี้',               lo: 'ມື້ນີ້' },
  analytics_month:     { th: 'เดือนนี้',             lo: 'ເດືອນນີ້' },
  analytics_total:     { th: 'รวม',                  lo: 'ລວມ' },
  analytics_avg:       { th: 'เฉลี่ย',               lo: 'ສະເລ່ຍ' },

  // ── Telesales ────────────────────────────────────────────────────────────────
  ts_call:             { th: 'โทร',                  lo: 'ໂທ' },
  ts_answered:         { th: 'ติด',                  lo: 'ຮັບສາຍ' },
  ts_no_answer:        { th: 'ไม่ติด',               lo: 'ບໍ່ຮັບສາຍ' },
  ts_deposited:        { th: 'ฝากแล้ว',              lo: 'ຝາກແລ້ວ' },
  ts_not_deposited:    { th: 'ยังไม่ฝาก',            lo: 'ຍັງບໍ່ໄດ້ຝາກ' },
  ts_call_rate:        { th: 'อัตราติด',             lo: 'ອັດຕາຮັບສາຍ' },
  ts_deposit_rate:     { th: 'อัตราฝาก',             lo: 'ອັດຕາຝາກ' },
  ts_target:           { th: 'เป้าหมาย',             lo: 'ເປົ້າໝາຍ' },
  ts_performance:      { th: 'ผลงาน',                lo: 'ຜົນງານ' },
  ts_member_new:       { th: 'สมาชิกใหม่',           lo: 'ສະມາຊິກໃໝ່' },
  ts_no_deposit_tab:   { th: 'ยังไม่ฝาก',            lo: 'ຍັງບໍ່ໄດ້ຝາກ' },
  ts_schedule:         { th: 'นัดหมาย',              lo: 'ນັດໝາຍ' },
  ts_notes:            { th: 'บันทึกการโทร',          lo: 'ບັນທຶກການໂທ' },
  ts_duration:         { th: 'เวลาคุย',              lo: 'ເວລາລົມ' },

  // ── Tickets ──────────────────────────────────────────────────────────────────
  ticket_title:        { th: 'หัวข้อปัญหา',          lo: 'ຫົວຂໍ້ບັນຫາ' },
  ticket_priority:     { th: 'ความเร่งด่วน',         lo: 'ຄວາມດ່ວນ' },
  ticket_low:          { th: 'ต่ำ',                  lo: 'ຕ່ຳ' },
  ticket_medium:       { th: 'ปกติ',                 lo: 'ທຳມະດາ' },
  ticket_high:         { th: 'สูง',                  lo: 'ສູງ' },
  ticket_critical:     { th: 'ฉุกเฉิน',              lo: 'ສຸກເສີນ' },

  // ── Common labels ─────────────────────────────────────────────────────────────
  label_all:           { th: 'ทั้งหมด',              lo: 'ທັງໝົດ' },
  label_date:          { th: 'วันที่',               lo: 'ວັນທີ' },
  label_from:          { th: 'ตั้งแต่',              lo: 'ແຕ່' },
  label_to:            { th: 'ถึง',                  lo: 'ເຖິງ' },
  label_name:          { th: 'ชื่อ',                 lo: 'ຊື່' },
  label_email:         { th: 'อีเมล',                lo: 'ອີເມລ' },
  label_password:      { th: 'รหัสผ่าน',             lo: 'ລະຫັດຜ່ານ' },
  label_role:          { th: 'ตำแหน่ง',              lo: 'ຕຳແໜ່ງ' },
  label_channel:       { th: 'ช่องทาง',              lo: 'ຊ່ອງທາງ' },
  label_status:        { th: 'สถานะ',                lo: 'ສະຖານະ' },
  label_action:        { th: 'จัดการ',               lo: 'ຈັດການ' },
  label_loading:       { th: 'กำลังโหลด...',          lo: 'ກຳລັງໂຫຼດ...' },
  label_no_data:       { th: 'ไม่มีข้อมูล',           lo: 'ບໍ່ມີຂໍ້ມູນ' },
  label_error:         { th: 'เกิดข้อผิดพลาด',       lo: 'ເກີດຂໍ້ຜິດພາດ' },
  label_success:       { th: 'สำเร็จ',               lo: 'ສຳເລັດ' },
  label_warning:       { th: 'คำเตือน',              lo: 'ຄຳເຕືອນ' },
  label_confirm_del:   { th: 'ต้องการลบใช่ไหม?',     lo: 'ຕ້ອງການລົບແທ້ບໍ?' },
  label_period:        { th: 'ช่วงเวลา',             lo: 'ໄລຍະເວລາ' },
  label_agent:         { th: 'Agent',                lo: 'ພະນັກງານ' },
  label_score:         { th: 'คะแนน',                lo: 'ຄະແນນ' },
  label_grade:         { th: 'เกรด',                 lo: 'ເກຣດ' },
  label_amount:        { th: 'จำนวน (บาท)',           lo: 'ຈຳນວນ (ກີບ/ບາດ)' },
  label_count:         { th: 'ครั้ง',                lo: 'ຄັ້ງ' },
  label_type:          { th: 'ประเภท',               lo: 'ປະເພດ' },
  label_message:       { th: 'ข้อความ',              lo: 'ຂໍ້ຄວາມ' },

  // ── Live Dashboard ────────────────────────────────────────────────────────────
  live_title:          { th: '🔴 Live Dashboard',    lo: '🔴 ລາຍງານສົດ' },
  live_today:          { th: 'วันนี้',               lo: 'ມື້ນີ້' },
  live_deposit:        { th: 'ฝากวันนี้',            lo: 'ຝາກມື້ນີ້' },
  live_withdraw:       { th: 'ถอนวันนี้',            lo: 'ຖອນມື້ນີ້' },
  live_profit:         { th: 'กำไรสุทธิ',            lo: 'ກຳໄລສຸດທິ' },
  live_active:         { th: 'แชทที่ Active',        lo: 'ການສົນທະນາທີ່ active' },
  live_tv:             { th: 'TV Mode',              lo: 'ໂໝດໜ້າຈໍໃຫຍ່' },

  // ── Settings ─────────────────────────────────────────────────────────────────
  settings_channel:    { th: 'ช่องทาง',              lo: 'ຊ່ອງທາງ' },
  settings_general:    { th: 'ทั่วไป',               lo: 'ທົ່ວໄປ' },
  settings_team:       { th: 'ทีมงาน',               lo: 'ທີມງານ' },
  settings_webhook:    { th: 'Webhook URL',          lo: 'Webhook URL' },
  settings_secret:     { th: 'Channel Secret',       lo: 'ລະຫັດລັບຊ່ອງ' },
  settings_token:      { th: 'Access Token',         lo: 'ໂທເຄັນ' },
  settings_lang:       { th: 'ภาษา',                 lo: 'ພາສາ' },
  settings_th:         { th: '🇹🇭 ภาษาไทย',          lo: '🇹🇭 ພາສາໄທ' },
  settings_lo:         { th: '🇱🇦 ภาษาลาว',          lo: '🇱🇦 ພາສາລາວ' },

  // ── Login ─────────────────────────────────────────────────────────────────────
  login_title:         { th: 'เข้าสู่ระบบ CRM',      lo: 'ເຂົ້າສູ່ລະບົບ CRM' },
  login_username:      { th: 'Username',             lo: 'ຊື່ຜູ້ໃຊ້' },
  login_password:      { th: 'รหัสผ่าน',             lo: 'ລະຫັດຜ່ານ' },
  login_btn:           { th: 'เข้าสู่ระบบ',          lo: 'ເຂົ້າສູ່ລະບົບ' },
  login_error:         { th: 'ชื่อหรือรหัสผ่านไม่ถูกต้อง', lo: 'ຊື່ຜູ້ໃຊ້ຫຼືລະຫັດຜ່ານບໍ່ຖືກ' },
} as const;

export type TranslationKey = keyof typeof translations;

/** Hook: t('key') → ข้อความตาม lang ปัจจุบัน */
export function useT() {
  // ดึง lang จาก localStorage (default: th)
  const lang: Lang = (typeof window !== 'undefined' ? localStorage.getItem('crm_lang') : null) as Lang || 'th';
  return (key: TranslationKey): string => translations[key]?.[lang] ?? translations[key]?.th ?? key;
}

/** ดึงค่าตรงๆ โดยไม่ต้อง hook */
export function t(key: TranslationKey, lang: Lang = 'th'): string {
  return translations[key]?.[lang] ?? translations[key]?.th ?? key;
}

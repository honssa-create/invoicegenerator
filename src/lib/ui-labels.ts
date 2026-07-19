/** Bilingual UI label: English + Chinese (project convention). */
export function bi(english: string, chinese: string): string {
  return `${english} ${chinese}`;
}

/** Common action buttons */
export const BTN = {
  add: bi('Add', '新增'),
  create: bi('Create', '建立'),
  creating: bi('Creating…', '建立中…'),
  save: bi('Save', '儲存'),
  saving: bi('Saving…', '儲存中…'),
  update: bi('Update', '更新'),
  cancel: bi('Cancel', '取消'),
  delete: bi('Delete', '刪除'),
  deleting: bi('Deleting…', '刪除中…'),
  edit: bi('Edit', '編輯'),
  view: bi('View', '查看'),
  close: bi('Close', '關閉'),
  print: bi('Print', '列印'),
  printPdf: bi('Print / Save as PDF', '列印 / 儲存為 PDF'),
  printSavePdf: bi('Print / Save PDF', '列印 / 儲存 PDF'),
  export: bi('Export', '匯出'),
  exportExcel: bi('Export to Excel', '匯出 Excel'),
  exportCsv: bi('Export CSV', '匯出 CSV'),
  exporting: bi('Exporting…', '匯出中…'),
  downloadExcel: bi('Download Excel', '下載 Excel'),
  clear: bi('Clear', '清除'),
  clearFilters: bi('Clear Filters', '清除篩選'),
  resetFilters: bi('Reset filters', '重設篩選'),
  back: bi('Back', '返回'),
  signOut: bi('Sign out', '登出'),
  signIn: bi('Sign in', '登入'),
  signingIn: bi('Signing in…', '登入中…'),
  signUp: bi('Sign up', '註冊'),
  send: bi('Send', '傳送'),
  confirm: bi('Confirm', '確認'),
  restore: bi('Restore', '還原'),
  restoring: bi('Restoring…', '還原中…'),
  open: bi('Open', '開啟'),
  loading: bi('Loading…', '載入中…'),
  all: bi('All', '全部'),
  search: bi('Search', '搜尋'),
  verified: bi('Verified', '已核對'),
  pending: bi('Pending', '待處理'),
  confirmEntry: bi('Confirm Entry', '確認入帳'),
  viewAll: bi('View all', '查看全部'),
  getStarted: bi('Get started', '開始使用'),
  startFree: bi('Start free', '免費開始'),
} as const;

/** Navigation labels (sidebar) */
export const NAV = {
  dashboard: bi('Dashboard', '儀表板'),
  quotations: bi('Quotations', '報價單'),
  invoices: bi('Invoices', '發票'),
  orders: bi('Orders', '訂單'),
  inbound: bi('Inbound', '到件'),
  kitchen: bi('Kitchen', '廚房'),
  kitchenPrep: bi('Kitchen Prep', '廚房備料'),
  rentals: bi('Rentals', '租金管理'),
  templates: bi('Templates', '文件範本'),
  expenses: bi('Expenses', '支出'),
  accounting: bi('Accounting', '會計'),
  cashflow: bi('Cash Flow', '現金流'),
  scanTable: bi('Scan to Table', '掃描成表格'),
  customers: bi('Customers', '客戶'),
  settings: bi('Settings', '設定'),
  trash: bi('Deleted Records', '已刪除紀錄'),
  admin: bi('Administration', '系統管理'),
} as const;

/** Page / section titles */
export const TITLE = {
  dashboard: bi('Dashboard', '儀表板'),
  customers: bi('Customers', '客戶'),
  invoices: bi('Invoices', '發票'),
  newInvoice: bi('New Invoice', '新增發票'),
  quotations: bi('Quotations', '報價單'),
  orders: bi('Orders', '訂單管理'),
  inbound: bi('Inbound Shipments', '到件紀錄'),
  kitchen: bi('Kitchen', '智能廚房排程'),
  kitchenPrep: bi('Kitchen Prep', '廚房備料系統'),
  rentals: bi('Rental Income', '租金管理'),
  expenses: bi('Expenses', '支出紀錄'),
  accounting: bi('Accounting Reconciliation', '會計入帳一覽表'),
  cashflow: bi('Cash Flow & Reconciliation', '營運收支中央看板'),
  scanTable: bi('Scan to Table', '掃描成表格'),
  settings: bi('Settings', '設定'),
  trash: bi('Deleted Records', '已刪除紀錄'),
  admin: bi('Administration', '系統管理'),
  invoiceDoc: bi('INVOICE', '發票'),
  quotationDoc: bi('QUOTATION', '報價單'),
  deliveryNote: bi('DELIVERY NOTE', '出貨單'),
  kitchenPrepSheet: bi('KITCHEN PREP SHEET', '廚房備料單'),
  welcomeBack: bi('Welcome back', '歡迎回來'),
  createAccount: bi('Create your account', '建立帳戶'),
} as const;

export const APP = {
  financeManager: bi('Finance Manager', '財務管理'),
  openMenu: bi('Open menu', '開啟選單'),
  closeMenu: bi('Close menu', '關閉選單'),
} as const;

export const FILTER = {
  startDate: bi('Start Date', '開始日期'),
  endDate: bi('End Date', '結束日期'),
  searchPlaceholder: bi('Search…', '搜尋…'),
} as const;

/** Invoice status badges */
export const INVOICE_STATUS = {
  draft: bi('Draft', '草稿'),
  sent: bi('Sent', '已發送'),
  paid: bi('Paid', '已付清'),
  overdue: bi('Overdue', '逾期'),
} as const;

/** Common toast / empty-state messages */
export const MSG = {
  importFailed: bi('Import failed', '匯入失敗'),
  exportFailed: bi('Export failed', '匯出失敗'),
  uploadFailed: bi('Upload failed', '上傳失敗'),
  saveFailed: bi('Save failed', '儲存失敗'),
  scanFailed: bi('Scan failed', '掃描失敗'),
  restoreFailed: bi('Restore failed', '還原失敗'),
  loginFailed: bi('Login failed', '登入失敗'),
  registrationFailed: bi('Registration failed', '註冊失敗'),
  conversionFailed: bi('Conversion failed', '轉換失敗'),
  allocationFailed: bi('Allocation failed', '分配失敗'),
  schedulerFailed: bi('Scheduler failed', '排程失敗'),
  bulkDeleteFailed: bi('Bulk delete failed', '批次刪除失敗'),
  submitFailed: bi('Submit failed', '提交失敗'),
  loadNoticeFailed: bi('Failed to load notice', '無法載入通知單'),
  noticeNotAvailable: bi('Notice not available', '通知單不可用'),
  documentUploaded: bi('Document uploaded', '文件已上傳'),
  leaseUpdated: bi('Lease updated', '租約已更新'),
  newUnitAdded: bi('New unit added', '已新增單位'),
  templateSaved: bi('Template saved ✓', '範本已儲存 ✓'),
  compressing: bi('Compressing…', '壓縮中…'),
  processing: bi('Processing…', '處理中…'),
  uploading: bi('Uploading…', '上傳中…'),
  allocate: bi('Allocate', '分配'),
  noPaymentsYet: bi('No payments recorded yet', '尚無收款紀錄'),
  noActivityYet: bi('No activity yet.', '尚無動態。'),
  noIncomeYet: bi('No income recorded yet. Add other income or record an order payment.', '尚無收入紀錄。新增其他收入或在訂單記錄收款。'),
  noPaymentEntriesYet: bi('No payment entries yet. Upload a payment receipt on an order to populate this dashboard.', '尚無入帳紀錄。在訂單上傳收款憑證以顯示於此。'),
  noInboundYet: bi('No inbound shipments recorded yet.', '尚無到件紀錄。'),
  noRentalUnitsYet: bi('No rental units yet — add the first one.', '尚無出租單位 — 請新增第一個。'),
  noRecordForPeriod: bi('No record for this period yet.', '此期間尚無紀錄。'),
  saveTenantForNotice: bi('Save tenant name to enable rent payment notice', '請先儲存租客姓名以啟用繳租通知單'),
  saveTenantForGroupedNotice: bi('Save tenant on unit lease to enable grouped notice', '請在租約儲存租客以啟用合併通知單'),
} as const;

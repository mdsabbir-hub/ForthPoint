-- 006: Phase 2 import support (safe to re-run)
alter table public.import_jobs add column if not exists original_filename text;
alter table public.import_jobs add column if not exists workbook_type text;
alter table public.import_jobs add column if not exists detected_ticker text;
alter table public.import_jobs add column if not exists storage_path text;
alter table public.import_jobs add column if not exists summary jsonb not null default '{}'::jsonb;

insert into public.sectors (code, name, sector_type) values
  ('INDUSTRIAL', 'Industrial and consumer companies', 'industrial'),
  ('BANK', 'Banks', 'bank'),
  ('INSURANCE', 'Insurance companies', 'insurance')
on conflict (code) do nothing;

insert into public.metric_definitions (code, name, category, default_unit, sector_type) values
  ('REVENUE','Revenue','income','money','all'), ('COGS','Cost of goods sold','income','money','all'),
  ('GROSS_PROFIT','Gross profit','income','money','all'), ('OPERATING_PROFIT','Operating profit','income','money','all'),
  ('EBIT','EBIT','income','money','all'), ('EBITDA','EBITDA','income','money','all'),
  ('NET_INCOME','Net income','income','money','all'), ('EPS','Earnings per share','income','per_share','all'),
  ('DPS','Dividend per share','income','per_share','all'),
  ('TOTAL_ASSETS','Total assets','balance_sheet','money','all'), ('CURRENT_ASSETS','Current assets','balance_sheet','money','all'),
  ('NON_CURRENT_ASSETS','Non-current assets','balance_sheet','money','all'), ('TOTAL_LIABILITIES','Total liabilities','balance_sheet','money','all'),
  ('CURRENT_LIABILITIES','Current liabilities','balance_sheet','money','all'), ('TOTAL_EQUITY','Total equity','balance_sheet','money','all'),
  ('CASH','Cash','balance_sheet','money','all'), ('INVENTORY','Inventory','balance_sheet','money','all'),
  ('RECEIVABLES','Receivables','balance_sheet','money','all'), ('TOTAL_DEBT','Total debt','balance_sheet','money','all'),
  ('LEASE_LIABILITIES','Lease liabilities','balance_sheet','money','all'),
  ('SHORT_TERM_BANK_LOANS','Short-term bank loans','balance_sheet','money','all'),
  ('SUPPLIER_FINANCING','Supplier financing','balance_sheet','money','all'),
  ('OPERATING_CASH_FLOW','Operating cash flow','cash_flow','money','all'), ('INVESTING_CASH_FLOW','Investing cash flow','cash_flow','money','all'),
  ('FINANCING_CASH_FLOW','Financing cash flow','cash_flow','money','all'), ('CAPEX','Capital expenditure','cash_flow','money','all'),
  ('FREE_CASH_FLOW','Free cash flow','cash_flow','money','all'),
  ('REVENUE_GROWTH','Revenue growth','ratio','ratio','all'), ('GROSS_MARGIN','Gross margin','ratio','ratio','all'),
  ('OPERATING_MARGIN','Operating margin','ratio','ratio','all'), ('NET_MARGIN','Net margin','ratio','ratio','all'),
  ('ROE','Return on equity','ratio','ratio','all'), ('ROA','Return on assets','ratio','ratio','all'), ('ROIC','Return on invested capital','ratio','ratio','industrial'),
  ('CURRENT_RATIO','Current ratio','ratio','x','industrial'), ('DEBT_TO_EQUITY','Debt to equity','ratio','ratio','industrial'),
  ('FCF_MARGIN','Free cash flow margin','ratio','ratio','all'), ('DIVIDEND_PAYOUT','Dividend payout','ratio','ratio','all'),
  ('DEBT_LEASE_TO_EQUITY','Debt plus leases to equity','ratio','ratio','all'), ('CASH_TO_ASSETS','Cash to total assets','ratio','ratio','all'),
  ('ONE_OFF_ADJUSTMENTS','One-off adjustments','normalization','money','all'),
  ('NORMALIZED_NET_INCOME','Normalized net income','normalization','money','all'),
  ('NORMALIZED_EPS','Normalized EPS','normalization','per_share','all'), ('NORMALIZED_FCF','Normalized free cash flow','normalization','money','all'),
  ('MARKET_PRICE','Market price','valuation','per_share','all'), ('MARKET_CAP','Market capitalisation','valuation','money','all'),
  ('PE_RATIO','Price to earnings','valuation','x','all'), ('PB_RATIO','Price to book','valuation','x','all'),
  ('EV_EBITDA','EV to EBITDA','valuation','x','industrial'), ('WACC','WACC','valuation','ratio','industrial'),
  ('TERMINAL_GROWTH','Terminal growth','valuation','ratio','industrial'), ('ENTERPRISE_VALUE','Enterprise value','valuation','money','industrial'),
  ('EQUITY_VALUE','Equity value','valuation','money','all'), ('TARGET_PRICE','Target price','valuation','per_share','all')
on conflict (code) do nothing;

insert into public.workbook_templates (workbook_type, version, name, is_active)
values ('TYPE_B', 1, 'Individual company research workbook v1', true)
on conflict (workbook_type, version) do nothing;

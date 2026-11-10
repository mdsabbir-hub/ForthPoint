export interface LineItem {
  code: string;
  label: string;
}

export type StatementKey = "income" | "balance" | "cashflow" | "ratios";

export const STATEMENTS: Record<StatementKey, { title: string; items: LineItem[] }> = {
  income: {
    title: "Income statement",
    items: [
      { code: "REVENUE", label: "Net revenue" },
      { code: "GROSS_PROFIT", label: "Gross profit" },
      { code: "OPERATING_PROFIT", label: "Operating profit" },
      { code: "NET_INCOME", label: "Net income" },
      { code: "EPS", label: "Earnings per share" },
      { code: "NORMALIZED_NET_INCOME", label: "Normalized net income" },
      { code: "NORMALIZED_EPS", label: "Normalized EPS" },
    ],
  },
  balance: {
    title: "Balance sheet",
    items: [
      { code: "TOTAL_ASSETS", label: "Total assets" },
      { code: "CASH", label: "Cash" },
      { code: "INVENTORY", label: "Inventory" },
      { code: "RECEIVABLES", label: "Receivables" },
      { code: "TOTAL_LIABILITIES", label: "Total liabilities" },
      { code: "SHORT_TERM_BANK_LOANS", label: "Short-term bank loans" },
      { code: "SUPPLIER_FINANCING", label: "Supplier financing" },
      { code: "LEASE_LIABILITIES", label: "Lease liabilities" },
      { code: "TOTAL_EQUITY", label: "Total equity" },
    ],
  },
  cashflow: {
    title: "Cash flow",
    items: [
      { code: "OPERATING_CASH_FLOW", label: "Operating cash flow" },
      { code: "CAPEX", label: "Capital expenditure" },
      { code: "FREE_CASH_FLOW", label: "Free cash flow" },
      { code: "NORMALIZED_FCF", label: "Normalized free cash flow" },
    ],
  },
  ratios: {
    title: "Financial ratios",
    items: [
      { code: "REVENUE_GROWTH", label: "Revenue growth" },
      { code: "GROSS_MARGIN", label: "Gross margin" },
      { code: "OPERATING_MARGIN", label: "Operating margin" },
      { code: "NET_MARGIN", label: "Net margin" },
      { code: "FCF_MARGIN", label: "Free cash flow margin" },
      { code: "ROE", label: "Return on equity" },
      { code: "DIVIDEND_PAYOUT", label: "Dividend payout" },
      { code: "DEBT_LEASE_TO_EQUITY", label: "Debt plus leases to equity" },
      { code: "CASH_TO_ASSETS", label: "Cash to total assets" },
    ],
  },
};
